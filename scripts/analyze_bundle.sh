#!/bin/bash
# One-shot: launch Chrome with CDP, open URL, wait, run rea analyze-web-bundle, kill chrome.
# usage: analyze_bundle.sh <url> <out_prefix> [extra args]
set -e
URL="$1"
OUT="$2"
EXTRA="${3:-}"
CHROME=/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome
PORT=9223

pkill -f "remote-debugging-port=$PORT" 2>/dev/null || true
sleep 1
"$CHROME" --headless=new --remote-debugging-port=$PORT --remote-allow-origins='*' \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir=/tmp/rea-chrome-$PORT --window-size=1440,900 about:blank \
  > /tmp/chrome-$PORT.log 2>&1 &
CHROME_PID=$!
trap "kill $CHROME_PID 2>/dev/null || true; pkill -f 'remote-debugging-port=$PORT' 2>/dev/null || true" EXIT

# wait for CDP
for i in $(seq 1 30); do
  if curl -s -m 2 http://127.0.0.1:$PORT/json/version > /dev/null 2>&1; then break; fi
  sleep 1
done

# open the page (Chrome 143 requires PUT for /json/new)
curl -s -m 10 -X PUT "http://127.0.0.1:$PORT/json/new?$URL" > /dev/null
sleep 9

# list targets and pick the first http(s) page target
TARGET=$(timeout 60 rea list-browser-targets http://127.0.0.1:$PORT --format json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
res=d.get('normalized_result') or d
targets=res.get('targets') or res.get('items') or []
for t in targets:
    u=t.get('url','')
    if u.startswith('http'):
        print(t.get('target_id') or t.get('id') or '')
        break
")
echo "target=$TARGET"

cd /home/z/my-project/explee_analysis
timeout 540 rea analyze-web-bundle "http://127.0.0.1:$PORT" "$TARGET" --detail complete --fetch-source-maps --observation-ms 4000 --total-analysis-timeout-ms 480000 $EXTRA --format json > "${OUT}_bundle_out.json" 2> "${OUT}_bundle.err" || true
echo "exit=$? bundle_size=$(wc -c < ${OUT}_bundle.json 2>/dev/null || echo 0)"
