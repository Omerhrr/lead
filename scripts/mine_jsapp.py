#!/usr/bin/env python3
"""Mine the REA JavaScript application Evidence for the explee report."""
import json, re, sys
from collections import Counter

F = "/home/z/my-project/explee_analysis/jsapp_analysis.json"
d = json.load(open(F))
n = d.get("normalized_result") or {}

def brief(v, limit=180):
    s = json.dumps(v)
    return s[:limit]

print("=== TOP KEYS ===")
print(list(n.keys()))

# 1. Application graph
g = n.get("graph") or n.get("application_graph") or {}
if isinstance(g, dict):
    print("\n=== GRAPH keys ===", list(g.keys())[:15])
    for k, v in g.items():
        if isinstance(v, list):
            print(f"  {k}: list n={len(v)}")
        elif isinstance(v, dict):
            print(f"  {k}: dict keys={list(v.keys())[:10]}")
        else:
            print(f"  {k} = {str(v)[:120]}")

# 2. vendor fingerprints / libraries
vendors = []
def find_key(node, keyname, out, depth=0, path=""):
    if depth > 12: return
    if isinstance(node, dict):
        for k, v in node.items():
            if k == keyname and isinstance(v, list):
                out.extend(v)
            find_key(v, keyname, out, depth+1, path+"."+k)
    elif isinstance(node, list):
        for x in node: find_key(x, keyname, out, depth+1, path)

for keyname in ("vendor_fingerprints", "libraries", "vendors", "frameworks", "fingerprints"):
    out = []
    find_key(n, keyname, out)
    if out:
        print(f"\n=== {keyname} (n={len(out)}) ===")
        for v in out[:40]:
            print("  ", brief(v))

# 3. route inventory
ri = []
find_key(n, "route_inventory", ri)
if ri:
    r = ri[0] if isinstance(ri, list) else ri
    st = (r.get("statistics") or {})
    print("\n=== route stats ===", brief(st))
    routes = r.get("routes") or []
    print(f"=== routes (n={len(routes)}) ===")
    for rt in routes[:60]:
        print("  ", brief(rt, 140))

# 4. occurrences of path-like strings in graph nodes
nodes = g.get("nodes") if isinstance(g, dict) else None
print("\n=== graph node count ===", len(nodes) if nodes else "n/a")
