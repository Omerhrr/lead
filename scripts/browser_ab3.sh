#!/bin/bash
# Browser gold path v3 - A/B test tab + delivery chip.
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
    ref=$(agent-browser snapshot -i 2>/dev/null | rg -i "$pat" | rg -o "ref=e[0-9]+" | head -1 | sed "s/ref=e/@e/")
    [ -n "$ref" ] && { echo "$ref"; return 0; }
    sleep 1.5
  done
  return 1
}

clickref() {
  local ref="$1"
  if [ -n "$ref" ]; then
    agent-browser click "$ref" >/dev/null 2>&1 && echo "clicked $ref"
  else
    echo "NO REF FOUND"
  fi
}

agent-browser navigate http://localhost:3000 >/dev/null 2>&1
sleep 2

clickref "$(findref 'Sign in')"
sleep 1
ref=$(findref 'textbox')
if [ -n "$ref" ]; then agent-browser fill "$ref" "founder@consotto.com" >/dev/null 2>&1; fi
clickref "$(findref 'Continue|Log in|Sign in|Open inbox')"
sleep 3

echo "--- after login ---"
agent-browser snapshot -i 2>/dev/null | head -12

clickref "$(findref 'Campaigns')"
sleep 2

echo "--- campaign chips ---"
agent-browser snapshot -i 2>/dev/null | rg -i 'A/B live|dental' | head -4

clickref "$(findref 'A/B live')"
sleep 1
clickref "$(findref 'A/B test')"
sleep 2

echo "--- variants area ---"
agent-browser snapshot -c 2>/dev/null | rg -i 'split test|variant|promote|reply rate|testing' | head -16

agent-browser screenshot /home/z/my-project/download/jidout-ab-variants.png >/dev/null 2>&1
echo "screenshot exit: $?"

echo "--- console errors ---"
agent-browser console 2>/dev/null | rg -i 'error' | head -5
echo "(console check done)"
