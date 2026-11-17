#!/usr/bin/env python3
"""Extract artifacts (screenshot png, dom, accessibility, storage) from REA scenario Evidence."""
import json, base64, sys, os

path = sys.argv[1]
outdir = sys.argv[2]
d = json.load(open(path))
norm = d.get("normalized_result") or {}
steps = norm.get("steps") or []

os.makedirs(outdir, exist_ok=True)
# take the LAST step's artifacts as the final page state
last = steps[-1]
arts = last.get("artifacts") or {}
name = os.path.splitext(os.path.basename(path))[0].replace("_scenario", "")

for art in ("screenshot", "dom", "accessibility"):
    av = arts.get(art)
    if isinstance(av, dict) and av.get("state") == "captured":
        v = av["value"]
        if art == "screenshot":
            out = os.path.join(outdir, f"{name}.png")
            open(out, "wb").write(base64.b64decode(v["data_base64"]))
            print(f"saved {out} ({v['bytes']} bytes)")
        else:
            out = os.path.join(outdir, f"{name}.{art}.txt")
            open(out, "w").write(v.get("text") or "")
            print(f"saved {out} ({v.get('bytes')} bytes)")

# storage
st = arts.get("storage")
if isinstance(st, dict) and st.get("state") == "captured":
    out = os.path.join(outdir, f"{name}.storage.json")
    open(out, "w").write(json.dumps(st.get("value"), indent=1))
    print(f"saved {out}")

# history
h = arts.get("history")
if isinstance(h, dict) and h.get("state") == "captured":
    out = os.path.join(outdir, f"{name}.history.json")
    open(out, "w").write(json.dumps(h.get("value"), indent=1))
    print(f"saved {out}")
