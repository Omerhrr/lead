#!/bin/bash
# Browser gold path for the A/B test tab + delivery chip.
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
  agent-browser snapshot -i 2>/dev/null | rg -i "$1" | rg -o "@e[0-9]+" | head -1
}

agent-browser navigate http://localhost:3000 >/dev/null 2>&1
sleep 2

# open auth dialog
ref=$(findref "sign in|log in|get started")
echo "auth ref: $ref"
[ -n "$ref" ] && agent-browser click "$ref" >/dev/null 2>&1
sleep 1

# fill email + submit
ref=$(findref "textbox|email")
echo "email ref: $ref"
[ -n "$ref" ] && agent-browser fill "$ref" "founder@consotto.com" >/dev/null 2>&1
ref=$(findref "continue|submit|sign in|log in")
echo "submit ref: $ref"
[ -n "$ref" ] && agent-browser click "$ref" >/dev/null 2>&1
sleep 3

# go to campaigns
ref=$(findref "campaigns")
echo "campaigns ref: $ref"
[ -n "$ref" ] && agent-browser click "$ref" >/dev/null 2>&1
sleep 2

# select the A/B campaign chip
ref=$(findref "A/B live")
echo "campaign chip ref: $ref"
[ -n "$ref" ] && agent-browser click "$ref" >/dev/null 2>&1
sleep 1

# open the A/B test tab
ref=$(findref "A/B test")
echo "tab ref: $ref"
[ -n "$ref" ] && agent-browser click "$ref" >/dev/null 2>&1
sleep 2

echo "--- snapshot of variants area ---"
agent-browser snapshot -c 2>/dev/null | rg -A2 -i "split test|variant|promote|delivered|simulated" | head -40

agent-browser screenshot /home/z/my-project/download/jidout-ab-variants.png >/dev/null 2>&1
echo "screenshot saved: $?"

echo "--- console errors ---"
agent-browser console 2>/dev/null | rg -i "error" | head -5 || echo "(none)"
