#!/bin/bash
# Capture one REA browser scenario for a URL with rich artifacts.
# usage: capture_page.sh <url> <out_prefix> [extra_actions_json]
set -e
URL="$1"
OUT="$2"
EXTRA="${3:-}"
cd /home/z/my-project/explee_analysis
timeout 240 rea capture-browser-scenario "{\"browser\":{\"mode\":\"launch\",\"executable_path\":\"/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome\",\"headless\":true},\"start_url\":{\"url\":\"$URL\"},\"actions\":[{\"action\":\"wait_for_timeout\",\"step_id\":\"settle\",\"duration_ms\":7000}$EXTRA],\"capture\":{\"after_each_step\":[\"screenshot\",\"dom\",\"accessibility\",\"url\",\"history\",\"storage\"]}}" --detail complete --format json > "${OUT}_scenario.json" 2> "${OUT}_scenario.err"
echo "exit=$? size=$(wc -c < ${OUT}_scenario.json)"
