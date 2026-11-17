#!/bin/bash
# Final consolidated verification + live-server handoff.
set -u
cd /home/z/my-project
BASE=http://localhost:3000

echo "=== hard-clean port 3000 + cache ==="
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
pkill -f "bun run dev" 2>/dev/null
sleep 3
rm -rf .next
nohup bun run dev >> dev.log 2>&1 &
code=000
for i in $(seq 1 40); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" $BASE/ --max-time 8 2>/dev/null)
  [ "$code" = "200" ] && break
done
echo "server ready ($code)"
[ "$code" != "200" ] && { echo "ABORT - server unhealthy"; exit 1; }

ref_of() {
  agent-browser snapshot -i 2>/dev/null \
    | grep -oE "${1} \[ref=e[0-9]+\]" -m1 | grep -oE "e[0-9]+$"
}

echo "=== API cleanup of v1 campaign flags ==="
curl -s -c /tmp/jar3.txt -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"founder@consotto.com","password":"demo1234"}' -o /dev/null -w "login:%{http_code}\n" --max-time 20
curl -s -b /tmp/jar3.txt -X PATCH "$BASE/api/campaigns/cmwkoywrc0004ozw8saq4eeoo" \
  -H "Content-Type: application/json" -d '{"variantTest":false,"autoPromote":false}' \
  --max-time 30 | head -c 40; echo

echo "=== browser flow ==="
agent-browser open $BASE 2>&1 | tail -1
agent-browser wait --load networkidle 2>&1 | tail -1

R=$(ref_of 'button "Sign in"')
echo "sign-in ref=$R"
agent-browser click @$R 2>&1 | tail -1
sleep 1

R=$(ref_of 'textbox "Work email"')
agent-browser fill @$R "founder@consotto.com" 2>&1 | tail -1
R=$(ref_of 'button "Continue with email"')
agent-browser click @$R 2>&1 | tail -1
sleep 3

R=$(ref_of 'button "Campaigns"')
echo "campaigns ref=$R"
agent-browser click @$R 2>&1 | tail -1
sleep 2

R=$(ref_of "button \"A/B/C arms v2[^\"]*\"")
echo "campaign ref=$R"
agent-browser click @$R 2>&1 | tail -1
sleep 2

R=$(ref_of 'tab "A/B test"')
echo "tab ref=$R"
agent-browser click @$R 2>&1 | tail -1
sleep 2
agent-browser screenshot /tmp/render/ab_multiarm_tab.png 2>&1 | tail -1
agent-browser scroll down 430 2>&1 | tail -1
sleep 1
agent-browser screenshot /tmp/render/ab_multiarm_variants.png 2>&1 | tail -1

echo "=== console errors ==="
agent-browser errors 2>&1 | tail -3
agent-browser close 2>&1 | tail -1

echo "=== server left running for preview ==="
curl -s -o /dev/null -w "final-health:%{http_code}\n" $BASE/ --max-time 15
