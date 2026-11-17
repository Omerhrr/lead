#!/bin/bash
# One-shot: launch Chrome with CDP, start analyze-web-bundle, THEN open URL so the
# page load happens inside the observation window. usage: analyze_bundle2.sh <url> <out> [extra]
set -e
URL="$1"
OUT="$2"
EXTRA="${3:-}"
CHROME=/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome
PORT=9226

pkill -f "remote-debugging-port=$PORT" 2>/dev/null || true
sleep 1
"$CHROME" --headless=new --remote-debugging-port=$PORT --remote-allow-origins='*' \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir=/tmp/rea-chrome-$PORT --window-size=1440,900 about:blank \
  > /tmp/chrome-$PORT.log 2>&1 &
CHROME_PID=$!
trap "kill $CHROME_PID 2>/dev/null || true; pkill -f 'remote-debugging-port=$PORT' 2>/dev/null || true" EXIT

for i in $(seq 1 30); do
  if curl -s -m 2 http://127.0.0.1:$PORT/json/version > /dev/null 2>&1; then break; fi
  sleep 1
done

cd /home/z/my-project/explee_analysis

# start analysis on the blank tab in background (discovery ~10s, then observation)
timeout 560 rea analyze-web-bundle "http://127.0.0.1:$PORT" "PLACEHOLDER" \
  --detail complete --observation-ms 22000 --total-analysis-timeout-ms 480000 \
  --fetch-source-maps $EXTRA \
  --format json > "${OUT}_bundle_out.json" 2> "${OUT}_bundle.err" &
REA_PID=$!

# during discovery, create a new tab loading the URL (load lands inside observation)
sleep 12
TARGET=$(curl -s -m 8 -X PUT "http://127.0.0.1:$PORT/json/new?$URL" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
echo "opened tab: $TARGET"

wait $REA_PID
echo "exit=$?"

# report
python3 - "$OUT" <<'EOF'
import json, sys
out = sys.argv[1]
try:
    d = json.load(open(f"/home/z/my-project/explee_analysis/{out}_bundle_out.json"))
    n = d.get("normalized_result") or {}
    c = n.get("capture") or {}
    print("scripts_observed:", c.get("scripts_observed"), "analyzed:", c.get("scripts_analyzed"))
    ri = n.get("route_inventory") or {}
    print("route stats:", json.dumps((ri.get("statistics") or {})))
    obs = n.get("observations") or {}
    print("endpoints:", len((obs.get("endpoints") or [])), "routes:", len((obs.get("routes") or [])), "chunks:", len(((obs.get("chunks") or {}).get("nodes") or [])))
    print("completeness:", json.dumps(n.get("completeness") or {})[:200])
except Exception as e:
    print("parse fail:", e)
EOF
