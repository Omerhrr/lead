#!/bin/bash
# Round-7 QA pipeline: start dev server (dies with this call - sandbox reaps
# background processes between tool calls), warm it, run all E2E suites and
# quality gates in one shot.
set -u
cd /home/z/my-project

fail=0
step() { echo; echo "=== $1 ==="; }

step "start dev server"
pkill -9 -f "next" 2>/dev/null ; pkill -9 -f "bun run" 2>/dev/null ; sleep 1
rm -rf .next node_modules/.cache   # avoid any stale turbopack state
: > dev.log
setsid sh -c 'exec bun run dev > /dev/null 2>&1' < /dev/null &

ready=""
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 20 2>/dev/null)
  if [ "$code" = "200" ]; then ready=1; echo "server ready (probe $i)"; break; fi
  sleep 3
done
if [ -z "$ready" ]; then echo "SERVER FAILED TO START"; tail -20 dev.log; exit 1; fi
curl -s -o /dev/null http://localhost:3000/api/overview --max-time 60 2>/dev/null || true

run_suite() {
  local name="$1"
  local script="$2"
  local out="/tmp/qa_${name}.log"
  echo "--- $name ---"
  bun "$script" > "$out" 2>&1
  local rc=$?
  grep -E "PASS:|FAIL:" "$out" | tail -40
  tail -1 "$out"
  if [ $rc -ne 0 ] || grep -q "FAIL:" "$out"; then
    echo ">>> $name FAILED"
    fail=1
  else
    echo ">>> $name ok"
  fi
}

step "round 7 E2E"
run_suite round7 scripts/verify_round7.ts
step "round 3 regression"
run_suite round3 scripts/verify_round3.ts
step "round 4 regression"
run_suite round4 scripts/verify_round4.ts
step "round 5 regression"
run_suite round5 scripts/verify_round5.ts
step "round 6 regression"
run_suite round6 scripts/verify_round6.ts

step "typecheck"
if bunx tsc --noEmit; then echo "tsc clean"; else echo ">>> tsc FAILED"; fail=1; fi

step "lint"
if bunx eslint src; then echo "eslint clean"; else echo ">>> eslint FAILED"; fail=1; fi

step "dev.log errors"
if grep -iqE "⨯|FATAL|panic" dev.log; then
  grep -iE "⨯|FATAL|panic" dev.log | head -3
  echo ">>> dev.log has errors"; fail=1
else
  echo "dev.log clean"
fi

step "result"
echo "QA_FAIL=$fail"
exit $fail
