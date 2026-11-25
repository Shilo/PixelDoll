"""Verifier operating-point sweep over the rows written by reference_extractor.py.

No ground truth is used by the verifier; this reads `out_ref/verifier_rows.json`
and reports false-pass / false-fail rates for several decision rules.

Run from the repository root after reference_extractor.py:
    python docs/research/2026-11-24-batch-extraction/verifier_sweep.py
"""

from __future__ import annotations

import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = os.path.join(HERE, "out_ref", "verifier_rows.json")

# Decision rules: name -> predicate over a row.
RULES = {
    "confidence >= 0.75 (shipped default)": lambda r: r["confidence"] >= 0.75,
    "confidence >= 0.90": lambda r: r["confidence"] >= 0.90,
    "hard signals only": lambda r: not any(
        r[f"s_{k}"] for k in ("empty", "area_bad", "palette_bad", "jump_bad", "shape_bad", "zviol_bad")
    ),
    "z-order violation > 2%": lambda r: r["s_z_violation"] > 0.02,
    "assignment gate (empty or z-violation)": lambda r: not r["s_empty"] and r["s_z_violation"] <= 0.02,
    "ambiguity <= 10% and area in range": lambda r: (
        r["s_contamination"] <= 0.10 and not r["s_area_bad"] and not r["s_empty"]
    ),
    "ORACLE tolerant prec/rec >= 95/90": lambda r: (
        r["prec_t"] >= 0.95 and r["rec_t"] >= 0.90
    ),
}


def summarize(rows, predicate, bad_key):
    tp = fp = tn = fn = 0
    for r in rows:
        ok = predicate(r)
        bad = bad_key(r)
        if ok and not bad:
            tp += 1
        elif ok and bad:
            fp += 1
        elif (not ok) and bad:
            tn += 1
        else:
            fn += 1
    bad = fp + tn
    good = tp + fn
    return {
        "total": len(rows), "bad": bad, "good": good, "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "false_pass": fp / bad if bad else 0.0,
        "false_fail": fn / good if good else 0.0,
        "catch": tn / bad if bad else 0.0,
    }


BAD_A = lambda r: r["wrong_share"] > 0.03 or r["pred"] == 0
BAD_B = lambda r: BAD_A(r) or r["s_area_ratio"] < 0.50 or r["strict_recall"] < 0.75
BAD_KEYS = (("assignment error", BAD_A), ("unusable layer", BAD_B))


def main():
    with open(ROWS, encoding="utf-8") as fh:
        rows = json.load(fh)
    groups = {
        "ruleC (all variants)": [r for r in rows if r["scope"] in ("ruleC", "ruleC_no_sword")],
        "ruleC exact+palette": [r for r in rows if r["scope"] in ("ruleC", "ruleC_no_sword")
                                and r["variant"] in ("exact", "palette")],
        "disjoint_all exact+palette": [r for r in rows if r["class"] == "disjoint"
                                       and r["variant"] in ("exact", "palette")],
        "disjoint_all geom1": [r for r in rows if r["class"] == "disjoint"
                               and r["variant"] == "geom1"],
        "overlap_all exact+palette": [r for r in rows if r["class"] == "overlap"
                                      and r["variant"] in ("exact", "palette")],
        "every scope exact": [r for r in rows if r["variant"] == "exact"],
    }
    lines = ["# Verifier operating points", "",
             "`assignment error` = the item claims more than 3% of its pixels from another item's "
             "visible layer, or comes out empty. `unusable layer` adds a collapsed area (below half the "
             "direction reference) or strict recall below 75%. The verifier sees no ground truth.", ""]
    for gname, grows in groups.items():
        lines.append(f"## {gname} ({len(grows)} item-frames)")
        lines.append("")
        for label, badf in BAD_KEYS:
            lines.append(f"Ground truth: {label}.")
            lines.append("")
            lines.append("| rule | bad | caught | false pass | false fail |")
            lines.append("| --- | ---: | ---: | ---: | ---: |")
            for name, pred in RULES.items():
                s = summarize(grows, pred, badf)
                lines.append(f"| {name} | {s['bad']} | {s['tn']}/{s['bad']} | "
                             f"{100 * s['false_pass']:.1f}% | {100 * s['false_fail']:.1f}% |")
            lines.append("")
    # signal usefulness on disjoint_all exact+palette
    sub = groups["disjoint_all exact+palette"]
    lines.append("## Single signals, disjoint_all exact+palette (unusable-layer truth)")
    lines.append("")
    for key in ("s_contamination", "s_z_violation", "s_area_ratio", "s_palette_bad",
                "s_jump_bad", "s_shape_bad", "s_far_bad", "s_z_loss"):
        vals_bad = [r[key] for r in sub if BAD_B(r)]
        vals_good = [r[key] for r in sub if not BAD_B(r)]
        def stat(v):
            if not v:
                return "n/a"
            if all(isinstance(x, bool) for x in v):
                return f"{100 * sum(v) / len(v):.1f}% true"
            return f"mean {sum(v) / len(v):.3f}, max {max(v):.3f}"
        lines.append(f"- `{key}`: bad frames {stat(vals_bad)}; good frames {stat(vals_good)}")
    text = "\n".join(lines) + "\n"
    with open(os.path.join(HERE, "out_ref", "verifier.md"), "w", encoding="utf-8") as fh:
        fh.write(text)
    print(text)


if __name__ == "__main__":
    main()
