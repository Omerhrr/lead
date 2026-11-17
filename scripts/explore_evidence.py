#!/usr/bin/env python3
"""Explore an REA Evidence JSON: structure overview + targeted extraction."""
import json, sys, re

path = sys.argv[1]
mode = sys.argv[2] if len(sys.argv) > 2 else "overview"

d = json.load(open(path))

def find_all(node, pred, out, path="root", depth=0):
    if depth > 14:
        return
    if isinstance(node, dict):
        for k, v in node.items():
            p = f"{path}.{k}"
            if pred(k, v):
                out.append((p, v))
            find_all(v, pred, out, p, depth + 1)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            find_all(v, pred, out, f"{path}[{i}]", depth + 1)

if mode == "overview":
    def size(node):
        return len(json.dumps(node))
    # print the top 3 levels of the tree with sizes
    def tree(node, indent=0, depth=0, maxdepth=4):
        if depth > maxdepth:
            return
        if isinstance(node, dict):
            for k, v in node.items():
                if isinstance(v, (dict, list)):
                    n = len(v)
                    print("  " * indent + f"{k} ({'dict' if isinstance(v,dict) else 'list'} n={n}, {size(v)}b)")
                    if n and (depth < 2 or size(v) < 20000):
                        tree(v, indent + 1, depth + 1, maxdepth)
                else:
                    sv = str(v)
                    print("  " * indent + f"{k} = {sv[:80]}")
    tree(d.get("normalized_result", d))

elif mode == "urls":
    out = []
    find_all(d, lambda k, v: k == "url" and isinstance(v, str) and v.startswith("http"), out)
    seen = set()
    for p, v in out[:400]:
        base = re.sub(r"\?.*", "", v)
        if base not in seen:
            seen.add(base)
            print(base[:160])

elif mode == "network":
    out = []
    find_all(d, lambda k, v: k in ("transactions", "requests", "network") and isinstance(v, list) and v, out)
    for p, v in out[:3]:
        print(f"== {p} (n={len(v)}) ==")
        for item in v[:80]:
            if isinstance(item, dict):
                u = item.get("url") or item.get("request", {}).get("url", "?")
                st = item.get("status") or item.get("response", {}).get("status", "?")
                mt = item.get("method") or item.get("request", {}).get("method", "?")
                ty = item.get("resource_type") or item.get("type", "")
                print(f"  {mt:6} {st} {ty:12} {str(u)[:130]}")

elif mode == "scripts":
    out = []
    find_all(d, lambda k, v: k in ("scripts", "script_sources") and isinstance(v, list) and v, out)
    for p, v in out[:3]:
        print(f"== {p} (n={len(v)}) ==")
        for s in v[:60]:
            if isinstance(s, dict):
                print("  ", json.dumps({k: s.get(k) for k in ("url", "source_url", "byte_length", "digest", "source_map_url", "preloaded", "executed") if k in s})[:220])

elif mode == "storage":
    out = []
    find_all(d, lambda k, v: k in ("storage", "storage_keys", "local_storage", "session_storage", "cookies") and v, out)
    for p, v in out[:6]:
        print(f"== {p} ==")
        print("  ", json.dumps(v)[:500])

elif mode == "text":
    out = []
    find_all(d, lambda k, v: k in ("text_slices", "text", "value") and isinstance(v, str) and len(v) > 40, out)
    for p, v in out[:60]:
        print(p, "=>", v[:150].replace("\n", " "))

elif mode == "raw_path":
    # mode: raw_path <json.path.like.root.foo.bar[0]>  -> print value
    cur = d
    for part in sys.argv[3].replace("root.", "").split("."):
        m = re.match(r"(.*)\[(\d+)\]$", part)
        if m:
            cur = cur[m.group(1)][int(m.group(2))]
        else:
            cur = cur[part]
    print(json.dumps(cur, indent=1)[:6000])
