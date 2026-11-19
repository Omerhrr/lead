#!/bin/bash
# Round-8 QA pipeline: start dev server WITH the LinkedIn adapter env (Part B
# of verify_round8 needs LINKEDIN_ACCESS_TOKEN + LINKEDIN_API_URL pointing at
# the mock the suite itself hosts on :8788), run round 8 E2E + rounds 3-7
# regression, then the quality gates - all inside one call so the server
# survives the whole block.
set -u
cd /home/z/my-project

fail=0
step() { echo; echo "=== $1 ==="; }

step "start dev server (LinkedIn adapter QA env)"
pkill -9 -f "next" 2>/dev/null ; pkill -9 -f "bun run" 2>/dev/null ; sleep 1
: > dev.log
setsid env LINKEDIN_ACCESS_TOKEN=qa-token LINKEDIN_API_URL=http://127.0.0.1:8788 \
  sh -c 'exec bun run dev > /dev/null 2>&1' < /dev/null &

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
  grep -E "PASS:|FAIL:" "$out" | tail -60
  tail -1 "$out"
  if [ $rc -ne 0 ] || grep -q "FAIL:" "$out"; then
    echo ">>> $name FAILED"
    fail=1
  else
    echo ">>> $name ok ($(grep -c 'PASS:' "$out") passes)"
  fi
}

step "round 8 E2E (LinkedIn adapter + audit trail + CI)"
run_suite round8 scripts/verify_round8.ts
step "round 3 regression"
run_suite round3 scripts/verify_round3.ts
step "round 4 regression"
run_suite round4 scripts/verify_round4.ts
step "round 5 regression"
run_suite round5 scripts/verify_round5.ts
step "round 6 regression"
run_suite round6 scripts/verify_round6.ts
step "round 7 regression"
run_suite round7 scripts/verify_round7.ts

step "typecheck"
if bunx tsc --noEmit; then echo "tsc clean"; else echo ">>> tsc FAILED"; fail=1; fi

step "lint"
if bunx eslint src; then echo "eslint clean"; else echo ">>> eslint FAILED"; fail=1; fi

step "dev.log errors"
# NB: Next's startup banner lists disabled experiments with a leading ⨯
# (e.g. "⨯ turbopackFileSystemCacheForDev" printed right before "✓ Starting...")
# - that line is informational, so the gate ignores it.
if grep -iE "⨯|FATAL|panic" dev.log | grep -viE "turbopackFileSystemCacheForDev" | grep -q .; then
  grep -iE "⨯|FATAL|panic" dev.log | grep -viE "turbopackFileSystemCacheForDev" | head -3
  echo ">>> dev.log has errors"; fail=1
else
  echo "dev.log clean"
fi

step "result"
echo "QA_FAIL=$fail"
exit $fail
