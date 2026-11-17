#!/usr/bin/env python3
"""Extract endpoint nodes, storage nodes and vendor hints from the REA graph."""
import json, re
from collections import Counter

F = "/home/z/my-project/explee_analysis/jsapp_analysis.json"
d = json.load(open(F))
n = d.get("normalized_result") or {}
g = n.get("graph") or {}
nodes = g.get("nodes") or []
edges = g.get("edges") or []

def show(nd):
    return json.dumps(nd)

endpoints = [nd for nd in nodes if nd.get("kind") == "endpoint"]
print(f"=== ENDPOINTS n={len(endpoints)} ===")
for e in endpoints:
    print(show(e)[:320])

storage = [nd for nd in nodes if nd.get("kind") == "storage"]
print(f"\n=== STORAGE n={len(storage)} ===")
for s in storage[:40]:
    print(show(s)[:260])

unknowns = [nd for nd in nodes if nd.get("kind") == "unknown"]
print(f"\n=== UNKNOWN nodes n={len(unknowns)} ===")
for u in unknowns[:15]:
    print(show(u)[:220])

# module nodes may carry import info
mods = [nd for nd in nodes if nd.get("kind") == "javascript-module"]
print(f"\n=== MODULE sample keys ===", list(mods[0].keys()) if mods else None)
