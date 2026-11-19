#!/bin/bash
# Browser gold path v2 - A/B test tab + delivery chip, with snapshot retries.
set -u
cd /home/z/my-project

code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ || true)
if [ "$code" != "200" ]; then
  rm -rf .next
  setsid nohup bun run dev > dev.log 2>&1 < /dev/null &
  sleep 10
fi
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/ || true)
  [ "$code" = "200" ] && break
  sleep 4
done
echo "server: $code"

findref() {
  local pat="$1"
  local ref=""
  for i in 1 2 3 4 5 6; do
    ref=$(agent-browser snapshot -i 2>/dev/null | rg -i "$pat" | rg -o "@e[0-9]+" | head -1)
    [ -n "$ref" ] && { echo "$ref"; return 0; }
    sleep 1.5
  done
  return 1
}

clickref() {
  local ref="$1"
  [ -n "$ref" ] && agent-browser click "$ref" >/dev/null 2>&1 && echo "clicked $ref" || echo "CLICK FAILED for $ref"
}

agent-browser navigate http://localhost:3000 >/dev/null 2>&1
sleep 2

clickref "$(findref '^- button "Sign in')"
sleep 1
clickref "$(findref 'textbox')"
ref=$(findref 'textbox')
[ -n "$ref" ] && agent-browser fill "$ref" "founder@consotto.com" >/dev/null 2>&1
clickref "$(findref '"Continue|"Sign in|"Log in|"Open inbox|"Start')"
sleep 3

echo "--- after login (top of snapshot) ---"
agent-browser snapshot -i 2>/dev/null | head -14

clickref "$(findref 'button "Campaigns"')
sleep 2
echo "--- campaigns view chips ---"
agent-browser snapshot -i 2>/dev/null | rg -i "A/B live|dental" | head -4

clickref "$(findref '"A/B live')
sleep 1
clickref "$(findref 'tab "A/B test"|"A/B test"')
sleep 2

echo "--- variants area ---"
agent-browser snapshot -c 2>/dev/null | rg -i "split test|variant A|variant B|promote|reply rate|testing live" | head -14

agent-browser screenshot /home/z/my-project/download/jidout-ab-variants.png >/dev/null 2>&1
echo "screenshot exit: $?"

echo "--- console errors ---"
agent-browser console 2>/dev/null | rg -i "\berror\b" | head -5 || echo "(none)"
