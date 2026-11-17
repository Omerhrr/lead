#!/usr/bin/env python3
"""Mine routes, endpoints and module inventory from REA JS app Evidence."""
import json, re
from collections import Counter

F = "/home/z/my-project/explee_analysis/jsapp_analysis.json"
d = json.load(open(F))
n = d.get("normalized_result") or {}

print("=== SUMMARY ===")
print(json.dumps(n.get("summary") or {}, indent=1)[:800])
print("\n=== STATISTICS ===")
print(json.dumps(n.get("statistics") or {}, indent=1)[:800])

ri = n.get("route_inventory") or {}
print("\n=== ROUTE INVENTORY ===")
print("stats:", json.dumps(ri.get("statistics") or {})[:400])
routes = ri.get("routes") or []
print(f"routes n={len(routes)}")
for r in routes[:80]:
    print("  ", json.dumps(r)[:200])

# occurrences: where routes were found
occs = ri.get("occurrences") or []
print(f"\noccurrences n={len(occs)}")

# module inventory from graph nodes
g = n.get("graph") or {}
nodes = g.get("nodes") or []
kinds = Counter()
files = []
for nd in nodes:
    kinds[nd.get("kind")] += 1
    if nd.get("kind") in ("source", "source_file", "file", "artifact", "chunk"):
        files.append(nd)
print("\n=== node kinds ===", dict(kinds))
print("\n=== first nodes ===")
for nd in nodes[:10]:
    print("  ", json.dumps({k: nd.get(k) for k in ("kind", "path", "url", "sha256", "bytes") if k in nd})[:200])

# Hunt API endpoints in all string fields of the semantic graph
sg = n.get("semantic_graph") or {}
print("\n=== semantic_graph keys ===", list(sg.keys())[:15] if isinstance(sg, dict) else type(sg).__name__)
