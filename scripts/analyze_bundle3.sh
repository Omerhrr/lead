#!/bin/bash
# One-shot: launch Chrome with CDP, create a blank tab, start analyze-web-bundle on that
# tab, then navigate the tab mid-observation so the page load is captured.
# usage: analyze_bundle3.sh <url> <out> [extra args]
set -e
URL="$1"
OUT="$2"
EXTRA="${3:-}"
CHROME=/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome
PORT=9227
ABS=/home/z/my-project/explee_analysis

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

# create the tab on a lightweight same-origin page (robots.txt) so origin scope holds
TARGET=$(curl -s -m 8 -X PUT "http://127.0.0.1:$PORT/json/new?$URL/robots.txt" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
echo "tab: $TARGET"

cd "$ABS"
# start analysis on the existing blank tab (observation 25s)
timeout 560 rea analyze-web-bundle "http://127.0.0.1:$PORT" "$TARGET" \
  --detail complete --observation-ms 25000 --total-analysis-timeout-ms 480000 \
  --fetch-source-maps $EXTRA \
  --format json > "${OUT}_bundle_out.json" 2> "${OUT}_bundle.err" &
REA_PID=$!

# mid-observation: navigate the tab via CDP websocket
sleep 14
node -e "
const ws = new WebSocket('ws://127.0.0.1:$PORT/devtools/page/$TARGET');
ws.onopen = () => {
  ws.send(JSON.stringify({id:1, method:'Page.enable'}));
  ws.send(JSON.stringify({id:2, method:'Page.navigate', params:{url:'$URL'}}));
  setTimeout(() => process.exit(0), 1500);
};
ws.onmessage = () => {};
setTimeout(() => process.exit(0), 6000);
" || true
echo "navigated"

wait $REA_PID
echo "analysis done"
