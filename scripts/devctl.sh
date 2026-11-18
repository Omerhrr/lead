#!/bin/bash
# Dev-server lifecycle for single-call harnesses: processes only live inside
# one tool call in this sandbox, so every work block boots its own server.
#   devctl.sh up [ENV=VAL ...]   start dev server (extra env passed through)
#   devctl.sh down               stop it (whole process tree, gentle first)
set -u
cd /home/z/my-project

up() {
  local envs=()
  while [ $# -gt 0 ]; do envs+=("$1"); shift; done
  : > dev.log
  : > /tmp/devctl.log
  # clean any stale listeners from a crashed previous block
  pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 1
  if [ ${#envs[@]} -gt 0 ]; then
    env "${envs[@]}" bun run dev </dev/null >>dev.log 2>&1 &
  else
    bun run dev </dev/null >>dev.log 2>&1 &
  fi
  DEV_PID=$!
  echo "launched pid $DEV_PID with env: ${envs[*]:-none}" >> /tmp/devctl.log
  for i in $(seq 1 120); do
    if curl -sf --max-time 15 -o /dev/null http://localhost:3000/; then
      echo "dev server up after ${i}s (pid $DEV_PID)"
      echo "UP after ${i}s" >> /tmp/devctl.log
      return 0
    fi
    if ! kill -0 "$DEV_PID" 2>/dev/null; then
      echo "dev server died during boot:"; tail -20 dev.log
      echo "DIED during boot" >> /tmp/devctl.log
      return 1
    fi
    echo "attempt $i: not ready yet" >> /tmp/devctl.log
    sleep 1
  done
  echo "dev server failed to become ready:"; tail -20 dev.log
  echo "TIMEOUT after 120 attempts" >> /tmp/devctl.log
  return 1
}

down() {
  pkill -f "next dev" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  pkill -f "bun run dev" 2>/dev/null
  sleep 2
  pkill -9 -f "next dev" 2>/dev/null
  pkill -9 -f "next-server" 2>/dev/null
  echo "dev server stopped"
}

case "${1:-}" in
  up) shift; up "$@" ;;
  down) down ;;
  *) echo "usage: devctl.sh up [ENV=VAL ...] | down"; exit 1 ;;
esac
