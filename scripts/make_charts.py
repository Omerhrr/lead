#!/usr/bin/env python3
"""Compute report figures and render charts for the Explee RE report."""
import json, re, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

OUT = "/home/z/my-project/explee_analysis/report_assets"
os.makedirs(OUT, exist_ok=True)

ACCENT = "#1B6B7A"  # DM-1 darkened accent for white-page charts
SURFACE = "#EDF3F5"

def make_palette(accent):
    import colorsys
    base = tuple(int(accent.lstrip("#")[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    h, s, v = colorsys.rgb_to_hsv(*base)
    series = []
    for i in range(6):
        hi = (h + i * (1.0 / 6)) % 1.0
        r, g, b = colorsys.hsv_to_rgb(hi, min(s * 0.9, 1.0), min(v * 1.05, 1.0))
        series.append("#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255)))
    return {"primary": accent, "series": series, "grid": "#E0E0E0", "text": "#333333"}

P = make_palette(ACCENT)
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]

# ---------- 1. Public API endpoint counts by module ----------
d = json.load(open("/home/z/my-project/explee_analysis/openapi.json"))
groups = {
    "Outreach: campaigns": 0, "Outreach: projects": 0, "Outreach: billing & caps": 0,
    "Outreach: inbox & leads": 0, "Outreach: domains & suppress": 0,
    "Search & NL-filters": 0, "Enrichment & find-and-enrich": 0,
    "Dedup lists": 0, "Other (me/tasks/webhooks/feedback)": 0,
}
for p, ops in d["paths"].items():
    n_ops = sum(1 for m in ops if m in ("get", "post", "put", "patch", "delete"))
    if "/autogtm/campaigns" in p:
        if "/inbox" in p or "hot-leads" in p:
            groups["Outreach: inbox & leads"] += n_ops
        elif "/billing" in p or "monthly-cap" in p or "/budget" in p:
            groups["Outreach: billing & caps"] += n_ops
        elif "domain" in p:
            groups["Outreach: domains & suppress"] += n_ops
        else:
            groups["Outreach: campaigns"] += n_ops
    elif "/autogtm/projects" in p:
        if "/inbox" in p:
            groups["Outreach: inbox & leads"] += n_ops
        elif "/budget" in p or "monthly-cap" in p:
            groups["Outreach: billing & caps"] += n_ops
        elif "domain" in p:
            groups["Outreach: domains & suppress"] += n_ops
        else:
            groups["Outreach: projects"] += n_ops
    elif "/autogtm/" in p:
        if "suppress" in p or "webhook" in p:
            groups["Outreach: domains & suppress"] += n_ops
        elif "billing" in p or "erased-leads" in p:
            groups["Outreach: billing & caps"] += n_ops
        else:
            groups["Outreach: campaigns"] += n_ops
    elif "/search/" in p:
        groups["Search & NL-filters"] += n_ops
    elif "/enrich/" in p or "find-and-enrich" in p:
        groups["Enrichment & find-and-enrich"] += n_ops
    elif "/dedup/" in p:
        groups["Dedup lists"] += n_ops
    else:
        groups["Other (me/tasks/webhooks/feedback)"] += n_ops

total = sum(groups.values())
print("endpoint groups:", groups, "TOTAL:", total)
assert total == 90, f"expected 90 operations, got {total}"

labels = [k.replace("Outreach: ", "").replace("Other (me/tasks/webhooks/feedback)", "Other") for k in groups]
vals = list(groups.values())
fig, ax = plt.subplots(figsize=(8.6, 4.4), constrained_layout=True)
bars = ax.barh(labels[::-1], vals[::-1], color=P["primary"], height=0.62, edgecolor="white")
for b, v in zip(bars, vals[::-1]):
    ax.text(b.get_width() + 0.5, b.get_y() + b.get_height() / 2, str(v), va="center", fontsize=10, color=P["text"])
ax.set_xlabel("HTTP operations", fontsize=10, color=P["text"])
ax.set_title("Explee public API: 68 endpoint paths (90 operations) by module", fontsize=12, color=P["text"], fontweight="bold")
ax.spines[["top", "right"]].set_visible(False)
ax.tick_params(axis="both", labelsize=9)
ax.grid(axis="x", color=P["grid"], linewidth=0.6)
ax.set_axisbelow(True)
fig.savefig(f"{OUT}/chart_endpoints.png", dpi=200, facecolor="white")
plt.close(fig)

# ---------- 2. JS application graph composition (pie) ----------
kinds = {"javascript-module": 556, "endpoint": 84, "storage": 27, "unknown": 28,
         "javascript-asset": 38, "source-map": 4, "worker": 1, "artifact": 1}
fig, ax = plt.subplots(figsize=(8.0, 4.2), constrained_layout=True)
big = {k: v for k, v in kinds.items() if v >= 4}
small_total = sum(v for v in kinds.values() if v < 4)
labels2 = [k.replace("javascript-", "JS ").replace("source-map", "source maps") for k in big] + ["other"]
vals2 = list(big.values()) + [small_total]
colors = (P["series"] * 2)[:len(vals2)]
wedges, txts, autotxts = ax.pie(vals2, labels=labels2, autopct=lambda p: f"{int(round(p*sum(vals2)/100))}",
                                colors=colors, startangle=100, pctdistance=0.72,
                                textprops={"fontsize": 9, "color": P["text"]},
                                wedgeprops={"edgecolor": "white", "linewidth": 1.2})
for t in autotxts:
    t.set_fontsize(8)
ax.set_title("REA JavaScript application graph: 739 nodes reconstructed from 38 chunks",
             fontsize=12, color=P["text"], fontweight="bold")
fig.savefig(f"{OUT}/chart_graph.png", dpi=200, facecolor="white")
plt.close(fig)

# ---------- 3. Screenshot dimensions ----------
from PIL import Image
dims = {}
for name in ["homepage", "pricing", "explorer", "signin", "b2b_database", "mcp_integration", "appgate", "register"]:
    p = f"/home/z/my-project/explee_analysis/artifacts/{name}.png"
    if os.path.exists(p):
        with Image.open(p) as im:
            dims[name] = im.size
print("screenshot dims:", dims)

json.dump({"groups": groups, "total": total, "dims": dims},
          open(f"{OUT}/figures.json", "w"), indent=1)
print("charts saved to", OUT)
