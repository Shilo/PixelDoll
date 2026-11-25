"""Evaluate pre-generation batch-safety rules on the S2 fixture pairs.

Input: pair_truth.json from pair_truth.py. Output: printed rules table,
per-pair matrix, and batch groups under each rule; writes rules_result.json.

Truth:
  strict unsafe   = the two accepted masks share at least one pixel in any
                    animation, direction or frame
  material unsafe = they share at least MATERIAL_PX (4) pixels in any cell
A rule predicts "safe to batch" from pre-generation signals only: slots, the
body-mask slot bands, the walk-frame-0 standing silhouette (stated proxy,
the fixture has no standing cell), mask distance and bbox gap.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent
MATERIAL_PX = 4
DIRS = ["south", "east", "north"]
MARGIN_C = 2.0
D_SCORE = 4.0

data = json.loads((HERE / "pair_truth.json").read_text(encoding="utf-8"))
pairs = data["pairs"]
by_key = {(p["a"], p["b"]): p for p in pairs}


def pair_of(x, y):
    return by_key.get((x, y)) or by_key.get((y, x))
item_ids = list(dict.fromkeys([p["a"] for p in pairs] + [p["b"] for p in pairs]))
slot_of = {i: (data["item_slots"][i]) for i in item_ids}
BANDS = {i: s for i, s in ((i, {"hair": "head", "head": "head", "torso_inner": "torso",
                                 "back": "torso", "main_hand": "torso"}.get(slot_of[i], "other"))
                           for i in item_ids)}


def dists(p, frame=None):
    values = p["proxy_min_dist"] if frame is None else p["proxy_frames"][frame]["min_dist"]
    return [v for v in values.values() if v is not None]  # drop missing directions


def overlaps(p, frame=None):
    return p["proxy_overlap"] if frame is None else p["proxy_frames"][frame]["overlap"]


def bbox_gaps(p, frame=None):
    return p["proxy_bbox_gap"] if frame is None else p["proxy_frames"][frame]["bbox_gap"]


def clearance(p, frame=None):
    """Per-direction clearance = mask distance + bbox gap; the minimum is the score.

    Both terms are needed: bbox gap alone is 0 for a diagonal near miss, and
    mask distance alone lets a 3 px boundary contact look safe when the
    bounding boxes are already separated.
    """
    d = p["proxy_min_dist"] if frame is None else p["proxy_frames"][frame]["min_dist"]
    g = bbox_gaps(p, frame)
    per = [d[k] + g[k] for k in DIRS if d[k] is not None]
    return min(per) if per else None


def no_standing_overlap(p, frame=None):
    return all(v == 0 for v in overlaps(p, frame).values())


def rule_a(p, frame=None):
    return not p["same_slot"]


def rule_b(p, frame=None):
    return rule_a(p, frame) and no_standing_overlap(p, frame)


def rule_c(p, frame=None):
    return rule_b(p, frame) and min(dists(p, frame)) >= MARGIN_C


def rule_d(p, frame=None):
    score = clearance(p, frame)
    return rule_b(p, frame) and score is not None and score >= D_SCORE


RULES = {
    "A: different slot": rule_a,
    "B: A + no standing overlap": rule_b,
    f"C: B + standing gap >= {MARGIN_C:g} px": rule_c,
    f"D: B + (distance + bbox gap) >= {D_SCORE:g}": rule_d,
}


def truth(p, kind):
    return p["any_overlap_cells"] > 0 if kind == "strict" else p["material_overlap_cells"] > 0


def score(rule, kind):
    tp = fp = fn = tn = 0
    fs, fu = [], []
    for p in pairs:
        actual_unsafe = truth(p, kind)
        predicted_safe = rule(p)
        if predicted_safe and not actual_unsafe:
            tp += 1
        elif predicted_safe and actual_unsafe:
            fp += 1
            fs.append(p)
        elif not predicted_safe and actual_unsafe:
            tn += 1
        else:
            fn += 1
            fu.append(p)
    pred_safe = tp + fp
    actual_safe = tp + fn
    return dict(
        tp=tp, fp=fp, fn=fn, tn=tn,
        predicted_safe=pred_safe, actual_safe=actual_safe,
        precision=tp / pred_safe if pred_safe else None,
        recall=tp / actual_safe if actual_safe else None,
        false_safe=fp / pred_safe if pred_safe else None,
        false_unsafe=fn / actual_safe if actual_safe else None,
        false_safe_pairs=[f"{p['a']} + {p['b']}" for p in fs],
        false_unsafe_pairs=[f"{p['a']} + {p['b']}" for p in fu],
    )


print("=== Single signals (each used alone, no slot gate) ===")
print(f"{'signal':44} {'truth':8} {'pred':>4} {'FP':>3} {'FN':>3} {'falseSafe':>10}")


def signal_scores(sig, kind):
    tp = fp = fn = 0
    for p in pairs:
        safe = sig(p)
        actual_unsafe = truth(p, kind)
        if safe and not actual_unsafe:
            tp += 1
        elif safe:
            fp += 1
        elif not actual_unsafe:
            fn += 1
    pred = tp + fp
    return pred, fp, fn, (fp / pred if pred else 0)


SIGNALS = {
    "1 slot: different slot": lambda p: not p["same_slot"],
    "2 band: body-derived bands differ": lambda p: BANDS[p["a"]] != BANDS[p["b"]],
    "3 silhouette: no standing overlap": lambda p: no_standing_overlap(p),
    "4 distance: min standing gap >= 2 px": lambda p: min(dists(p)) >= 2,
    "4b bbox: min bbox gap >= 1 px": lambda p: min(bbox_gaps(p).values()) >= 1,
    "5 score: distance + bbox >= 4": lambda p: (clearance(p) or 0) >= D_SCORE,
}
for label, sig in SIGNALS.items():
    for kind in ("material", "strict"):
        pred, fp, fn, fs = signal_scores(sig, kind)
        print(f"{label:44} {kind:8} {pred:4} {fp:3} {fn:3} {fs:10.0%}")
print()

print("=== Rule scores, pair level (n=15 pairs, 8 material-unsafe, 10 strict-unsafe) ===")
print(f"{'rule':52} {'truth':8} {'pred':>4} {'TP':>3} {'FP':>3} {'FN':>3} "
      f"{'prec':>6} {'rec':>6} {'falseSafe':>10} {'falseUnsafe':>11}")
results = {}
for name, rule in RULES.items():
    for kind in ("material", "strict"):
        s = score(rule, kind)
        key = f"{name}|{kind}"
        results[key] = s
        f = lambda x: "-" if x is None else f"{x:.0%}"
        print(f"{name:52} {kind:8} {s['predicted_safe']:4} {s['tp']:3} {s['fp']:3} {s['fn']:3} "
              f"{f(s['precision']):>6} {f(s['recall']):>6} {f(s['false_safe']):>10} {f(s['false_unsafe']):>11}")
print()

print("=== Pair matrix (standing proxy = walk frame 0) ===")
print(f"{'pair':36} {'slot?':6} {'band':13} {'std ov':8} {'std d':7} {'bbox':7} {'truth':16} "
      f"{'A':>2} {'B':>2} {'C':>2} {'D':>2}")
for p in pairs:
    d = "/".join("-" if v != v else f"{v:g}" for v in p["proxy_min_dist"].values())
    ov = "/".join(str(v) for v in p["proxy_overlap"].values())
    bg = "/".join(str(v) for v in p["proxy_bbox_gap"].values())
    t = "material" if p["material_overlap_cells"] else ("strict-only" if p["any_overlap_cells"] else "clean")
    flags = "".join("Y" if r(p) else "." for r in RULES.values())
    print(f"{p['a'] + ' + ' + p['b']:36} {'diff' if not p['same_slot'] else 'SAME':6} "
          f"{BANDS[p['a']] + '/' + BANDS[p['b']]:13} {ov:8} {d:7} {bg:7} {t:16} "
          f"{flags[0]:>2} {flags[1]:>2} {flags[2]:>2} {flags[3]:>2}")
print()

# --- Threshold sweep for the distance rule (no slot gate, or with it) ---
print("=== Margin sweep: different slot + no standing overlap + min standing gap >= m ===")
print(f"{'m px':>4} {'pred':>4} {'FS strict':>9} {'FS material':>11} {'falseUnsafe strict':>18} {'falseUnsafe material':>20}")


def sweep_rule(p, m):
    return rule_b(p) and min(dists(p)) >= m


for m in (0, 1, 2, 3, 4, 5, 6):
    ss, sm = score(lambda p: sweep_rule(p, m), "strict"), score(lambda p: sweep_rule(p, m), "material")
    print(f"{m:4} {ss['predicted_safe']:4} {ss['fp']:9} {sm['fp']:11} {ss['fn']:18} {sm['fn']:20}")
print()

print("=== Per-direction check (45 pair-directions; 8 with no cells skipped) ===")
print(f"{'rule':40} {'truth':8} {'pred':>4} {'FP':>3} {'FN':>3} {'falseSafe':>10}")


def dir_score(rule, kind):
    pred = tp = fp = fn = 0
    for p in pairs:
        for d in DIRS:
            pd = p["per_dir"][d]
            if pd["cells"] == 0:
                continue
            actual_unsafe = pd["max_px"] > 0 if kind == "strict" else pd["material_cells"] > 0
            v = p["proxy_min_dist"][d]
            g = p["proxy_bbox_gap"][d]
            if rule == "C":
                safe = (not p["same_slot"]) and p["proxy_overlap"][d] == 0 and v is not None and v >= MARGIN_C
            else:
                safe = ((not p["same_slot"]) and p["proxy_overlap"][d] == 0
                        and v is not None and v + g >= D_SCORE)
            if safe:
                pred += 1
                tp += not actual_unsafe
                fp += actual_unsafe
            elif actual_unsafe:
                fn += 1
    return pred, tp, fp, fn


for label, key in (("C: gap >= 2", "C"), ("D: distance + bbox >= 4", "D")):
    for kind in ("material", "strict"):
        pred, tp, fp, fn = dir_score(key, kind)
        print(f"{label:40} {kind:8} {pred:4} {fp:3} {fn:3} "
              f"{(fp / pred if pred else 0):10.0%}")
print()

print("=== Proxy stability: each walk frame used as the standing cell ===")
print(f"{'frame':>5} {'C pred':>6} {'C FS strict':>11} {'C FS material':>13} "
      f"{'D pred':>6} {'D FS strict':>11} {'D FS material':>13}")
for f in range(8):
    cs, cm = score(lambda p: rule_c(p, f), "strict"), score(lambda p: rule_c(p, f), "material")
    ds, dm = score(lambda p: rule_d(p, f), "strict"), score(lambda p: rule_d(p, f), "material")
    print(f"{f:5} {cs['predicted_safe']:6} {cs['fp']:11} {cm['fp']:13} "
          f"{ds['predicted_safe']:6} {ds['fp']:11} {dm['fp']:13}")
print()

print("=== What a false safe hides (rule C, strict truth) ===")
for key, s in results.items():
    if not key.endswith("strict") or not s["false_safe_pairs"]:
        continue
    print(f"{key.split('|')[0]}:")
    for pk in s["false_safe_pairs"]:
        a, b = pk.split(" + ")
        p = pair_of(a, b)
        mean_px = sum(o["px"] for o in p["overlap_cells"]) / max(1, p["any_overlap_cells"])
        print(f"  {pk:36} max {p['max_overlap_px']:3} px, mean {mean_px:5.1f} px, "
              f"{p['any_overlap_cells']}/{p['shared_cells']} cells, "
              f"max {p['max_lower_share']:.1%} of the lower item, "
              f"union oracle {p['union_overlap']}")
print()

# --- Grouping ---
def greedy_groups(rule, order):
    groups: list[dict] = []
    for item in order:
        placed = False
        for g in groups:
            probes = [(item, m) for m in g["items"]]
            ok = all(rule(pair_of(*k)) for k in probes)
            if ok:
                g["items"].append(item)
                g["pairs"].extend(probes)
                placed = True
                break
        if not placed:
            groups.append(dict(items=[item], pairs=[]))
    return groups


def union_find_groups(rule):
    parent = {i: i for i in item_ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        parent[find(x)] = find(y)

    for p in pairs:
        if rule(p):
            union(p["a"], p["b"])
    groups: dict[str, list[str]] = {}
    for i in item_ids:
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


ORDER = [p["a"] for p in pairs][:1] + [i for i in item_ids]
ORDER = list(dict.fromkeys(ORDER))  # manifest order: vest, cape, hair, helmet, hat, sword
assert set(ORDER) == set(item_ids), ORDER

print("=== Greedy clique groups (an item joins a group only if it is safe with every member) ===")
group_out = {}
for name, rule in RULES.items():
    groups = greedy_groups(rule, ORDER)
    group_out[name] = [[g["items"], [f"{a}+{b}" for a, b in g["pairs"]]] for g in groups]
    print(f"{name}:")
    for g in groups:
        singles = [i for i in g["items"]]
        if len(singles) == 1:
            print(f"  separate: {singles[0]}")
        else:
            print(f"  batch: {', '.join(singles)}")
    uf = union_find_groups(rule)
    if sorted(map(sorted, uf)) != sorted(map(sorted, [[i] for g in groups for i in g["items"]])):
        uf_desc = " | ".join(", ".join(g) if len(g) > 1 else g[0] for g in uf)
        print(f"  union-find would give: {uf_desc}")
print()

# --- Group reasons under the recommended rule ---
print("=== Group reasons under rule C ===")
for g in greedy_groups(rule_c, ORDER):
    if len(g["items"]) == 1:
        item = g["items"][0]
        blockers = []
        for other in item_ids:
            if other == item:
                continue
            p = pair_of(item, other)
            if p["same_slot"]:
                blockers.append(f"{other}: same slot ({p['slot_a']})")
            elif not no_standing_overlap(p):
                blockers.append(f"{other}: standing masks overlap")
            elif min(dists(p)) < MARGIN_C:
                blockers.append(f"{other}: standing gap {min(dists(p)):g} px")
        print(f"  separate {item}: " + "; ".join(blockers))
    else:
        mins = [min(dists(pair_of(a, b))) for a, b in g["pairs"]]
        print(f"  batch {', '.join(g['items'])}: different slots, no standing overlap, "
              f"min standing gap {min(mins):g} px across {len(g['pairs'])} checked pairs")
print()

(HERE / "rules_result.json").write_text(json.dumps(dict(
    margins=dict(C=MARGIN_C, D=D_SCORE),
    material_px=MATERIAL_PX,
    scores=results,
    groups=group_out,
    order=ORDER,
), indent=1), encoding="utf-8")
print("wrote rules_result.json")
