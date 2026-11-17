#!/usr/bin/env python3
"""Query REA's MCP server for a tool's input schema via stdio MCP."""
import json, subprocess, sys

tool = sys.argv[1] if len(sys.argv) > 1 else "capture_browser_scenario"

launcher = "/home/z/.npm-global/lib/node_modules/rea-agents/scripts/plugin-mcp-launcher.mjs"
proc = subprocess.Popen(
    ["node", launcher, "6.9.0"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    cwd="/home/z/.npm-global/lib/node_modules/rea-agents",
)

def send(obj):
    proc.stdin.write((json.dumps(obj) + "\n").encode())
    proc.stdin.flush()

def recv():
    while True:
        line = proc.stdout.readline()
        if not line:
            return None
        line = line.strip()
        if not line:
            continue
        return json.loads(line)

send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "schema-probe", "version": "0.1"}}})
recv()
send({"jsonrpc": "2.0", "method": "notifications/initialized"})
send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
resp = recv()
proc.terminate()

tools = resp.get("result", {}).get("tools", [])
print(f"total tools: {len(tools)}")
for t in tools:
    if t["name"] == tool:
        with open(f"/home/z/my-project/explee_analysis/{tool}_schema.json", "w") as f:
            json.dump(t, f, indent=1)
        print(f"schema saved to {tool}_schema.json ({len(json.dumps(t))} bytes)")
        print("description:", t.get("description", "")[:300])
        break
else:
    print("tool not found; available:", ", ".join(t["name"] for t in tools))
