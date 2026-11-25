"""Print the markdown tables used by auto-batch-detector.md from pair_truth.json and rules_result.json."""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent
data = json.loads((HERE / "pair_truth.json").read_text(encoding="utf-8"))
res = json.loads((HERE / "rules_result.json").read_text(encoding="utf-8"))

print("### Ground truth\n")
print("| pair | slots | cells | overlap cells (material) | max px | mean px | max share of lower | union oracle max |")
print("|---|---|---:|---:|---:|---:|---:|---:|")
for p in data["pairs"]:
    mean = sum(o["px"] for o in p["overlap_cells"]) / max(1, p["any_overlap_cells"])
    uo = max(p["union_overlap"].values())
    print(f"| {p['a']} + {p['b']} | {p['slot_a']}/{p['slot_b']} | {p['shared_cells']} | "
          f"{p['any_overlap_cells']} ({p['material_overlap_cells']}) | {p['max_overlap_px']} | "
          f"{mean:.1f} | {p['max_lower_share']:.1%} | {uo} |")

print("\n### Rule scores\n")
print("| rule | truth bar | predicted safe | TP | FP | FN | precision | recall | false-safe | false-unsafe |")
print("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
for key, s in res["scores"].items():
    rule, kind = key.split("|")
    pct = lambda x: "-" if x is None else f"{x:.0%}"
    print(f"| {rule} | {kind} | {s['predicted_safe']} | {s['tp']} | {s['fp']} | {s['fn']} | "
          f"{pct(s['precision'])} | {pct(s['recall'])} | {pct(s['false_safe'])} | {pct(s['false_unsafe'])} |")

print("\n### Groups\n")
for rule, groups in res["groups"].items():
    print(f"\n{rule}\n")
    for items, pairs in groups:
        if len(items) == 1:
            print(f"- separate: {items[0]}")
        else:
            print(f"- batch: {', '.join(items)} (pairs: {', '.join(pairs)})")
