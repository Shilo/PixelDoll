"""Offline harness: simulate a shared-body batch generation by compositing the accepted
S2 item layers, then measure deterministic per-item extraction.

No network, no PixelLab calls. Python 3.14 + Pillow 13 + numpy + scipy.

Run from the repository root:
    python docs/research/2026-11-24-batch-extraction/harness.py

Outputs (docs/research/2026-11-24-batch-extraction/out/):
    metrics.json, tables.md, summary.txt, *.png
"""

from __future__ import annotations

import itertools
import json
import os
from collections import defaultdict

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = "app/public/fixtures/s2"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
CELL = 64
DIRS = ("south", "east", "north")
ANIM_FRAMES = {"walk": 8, "cross-punch": 6}
# cross-punch sheets store only the south row (rows 1 and 2 are empty), as fixture.json coverage states.
ANIM_DIRS = {"walk": DIRS, "cross-punch": ("south",)}

# item, slot z, draw order tie-break, band set assigned from body-mask geometry.
# Bands a slot plausibly occupies are slot semantics; the band rectangles themselves come
# only from the body mask (see bands_for_body).
ITEMS = [
    ("vest_leather", 40, 0, {"neck", "torso", "waist"}),
    ("cape_red", 90, 1, {"neck", "torso", "waist", "legs"}),
    ("hair_brown", 110, 2, {"head", "neck"}),
    ("helmet_steel", 130, 3, {"head"}),
    ("hat_wizard", 130, 4, {"above_head", "head"}),
    ("sword_steel", 150, 5, {"hands"}),
]
ITEM_IDS = [i[0] for i in ITEMS]
BODY_ID = "base"
BODY_Z = 10

ITEM_COLORS = {
    "vest_leather": (150, 95, 40),
    "cape_red": (170, 30, 30),
    "hair_brown": (90, 60, 30),
    "helmet_steel": (120, 130, 140),
    "hat_wizard": (40, 70, 190),
    "sword_steel": (190, 200, 210),
    "base": (200, 200, 200),
}

DRIFT_SEED = 20261124
PALETTE_DRIFT_RANGE = (11.5, 17.1)


# ---------------------------------------------------------------- data loading
def load_fixture() -> dict:
    with open(os.path.join(ROOT, "fixture.json"), encoding="utf-8") as fh:
        fix = json.load(fh)
    sheets = {}
    for item in fix["items"]:
        for layer in item["layers"]:
            for anim, path in layer["sheets"].items():
                sheets[(item["id"], anim)] = os.path.join(ROOT, path)
    return {"fix": fix, "sheets": sheets}


def load_sheet(sheets: dict, item: str, anim: str) -> np.ndarray:
    if (item, anim) not in sheets:
        raise KeyError(f"{item} has no {anim} sheet")
    with Image.open(sheets[(item, anim)]) as im:
        return np.array(im.convert("RGBA"))


def cell_of(sheet: np.ndarray, anim: str, direction: str, frame: int) -> np.ndarray:
    if not 0 <= frame < ANIM_FRAMES[anim]:
        raise ValueError(f"{anim} frame {frame}")
    row = DIRS.index(direction)
    return sheet[row * CELL : (row + 1) * CELL, frame * CELL : (frame + 1) * CELL].copy()


def cells_for(anim: str, items: list[str], sheets: dict) -> list[tuple[str, str, int]]:
    out = []
    for anim in ANIM_FRAMES:
        if not all((it, anim) in sheets for it in items):
            continue
        for d in ANIM_DIRS[anim]:
            for f in range(ANIM_FRAMES[anim]):
                out.append((anim, d, f))
    return out


def run_cells(run_name: str, items: list[str], sheets: dict):
    """(cell, items present in that cell). The all-items run covers every stored
    animation, with hat_wizard absent from cross-punch because it has no sheet there."""
    if run_name != "all":
        return [(cell, list(items)) for cell in cells_for("walk", items, sheets)]
    out = []
    for anim in ANIM_FRAMES:
        present = [it for it in items if (it, anim) in sheets]
        for d in ANIM_DIRS[anim]:
            for f in range(ANIM_FRAMES[anim]):
                out.append(((anim, d, f), present))
    return out


# ---------------------------------------------------------------- geometry
def bands_for_body(body_rgba: np.ndarray) -> dict[str, np.ndarray]:
    """Slot bands from the body mask only. Row fractions of the body silhouette height,
    plus a hands band = columns outside the body's vertical core, below the head."""
    mask = body_rgba[..., 3] > 0
    ys, xs = np.where(mask)
    top, bot = int(ys.min()), int(ys.max())
    h = bot - top + 1
    yy = np.arange(CELL)[:, None]
    xx = np.arange(CELL)[None, :]
    occupied = mask.sum(axis=0)  # per column
    core = occupied >= 0.5 * h  # columns the body occupies for half its height
    return {
        "above_head": yy < top,
        "head": (yy >= top) & (yy < top + 0.34 * h),
        "neck": (yy >= top + 0.30 * h) & (yy < top + 0.40 * h),
        "torso": (yy >= top + 0.34 * h) & (yy < top + 0.64 * h),
        "waist": (yy >= top + 0.54 * h) & (yy < top + 0.68 * h),
        "legs": (yy >= top + 0.64 * h) & (yy < top + 0.90 * h),
        "feet": yy >= top + 0.88 * h,
        "hands": (yy >= top + 0.30 * h) & (~core)[None, :],
    }


def item_band(item: str, bands: dict[str, np.ndarray]) -> np.ndarray:
    names = next(b for i, _, _, b in ITEMS if i == item)
    out = np.zeros((CELL, CELL), dtype=bool)
    for n in names:
        out |= bands[n]
    return out


# ---------------------------------------------------------------- palettes
def palette_of(rgba: np.ndarray) -> np.ndarray:
    m = rgba[..., 3] > 0
    return np.unique(rgba[m][:, :3], axis=0).astype(np.int16)


def nearest_palette_distance(rgb: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """rgb (N,3) float -> (N,) min Euclidean distance to any palette color."""
    if len(palette) == 0:
        return np.full(len(rgb), 1e9)
    diff = rgb[:, None, :].astype(np.int32) - palette[None, :, :].astype(np.int32)
    return np.sqrt((diff * diff).sum(axis=2)).min(axis=1)


# ---------------------------------------------------------------- compositing
def composite(items: list[str], sprites: dict[str, np.ndarray], body: np.ndarray | None):
    """Paint sprites in slot z order over the body (or transparent). Returns RGBA image
    plus the label map (index into items, -1 = body/empty)."""
    h, w = CELL, CELL
    img = np.zeros((h, w, 4), dtype=np.uint8)
    if body is not None:
        img[...] = body
    labels = np.full((h, w), -1, dtype=np.int8)
    order = sorted(range(len(items)), key=lambda i: (next(z for it, z, o, _ in ITEMS if it == items[i]),
                                                     next(o for it, z, o, _ in ITEMS if it == items[i])))
    for i in order:
        it = items[i]
        sp = sprites[it]
        m = sp[..., 3] > 0
        img[m] = sp[m]
        labels[m] = i
    return img, labels


def union_from_composite(img: np.ndarray, body: np.ndarray | None) -> np.ndarray:
    """Extraction target. Without the body, the composite alpha is the union. With the
    body, the union is what changed against the known frozen base frame (the app can
    compare against the real base it already has)."""
    if body is None:
        return img[..., 3] > 0
    opaque = img[..., 3] > 0
    base_opaque = body[..., 3] > 0
    diff = opaque & ~base_opaque
    both = opaque & base_opaque & (img[..., :3] != body[..., :3]).any(axis=2)
    return diff | both


def visible_masks(items: list[str], accepted: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Accepted pixels of each item that are not covered by a higher-z accepted item."""
    order = sorted(items, key=lambda it: (next(z for i, z, o, _ in ITEMS if i == it),
                                          next(o for i, z, o, _ in ITEMS if i == it)))
    out = {}
    covered = np.zeros((CELL, CELL), dtype=bool)
    for it in reversed(order):  # topmost first: it owns every pixel it covers
        m = accepted[it][..., 3] > 0
        out[it] = m & ~covered
        covered |= m
    return out


# ---------------------------------------------------------------- drift
def drift_offsets() -> dict[str, tuple[np.ndarray, float]]:
    rng = np.random.default_rng(DRIFT_SEED)
    out = {}
    for it in ITEM_IDS:
        v = rng.normal(size=3)
        v /= np.linalg.norm(v)
        mag = float(rng.uniform(*PALETTE_DRIFT_RANGE))
        out[it] = (v * mag, mag)
    return out


def apply_drift(sprites: dict[str, np.ndarray], offsets, parts=("geometry", "palette"),
                hair_shift: bool = True) -> dict[str, np.ndarray]:
    """Palette drift, one 1 px dilation or erosion per item, and a 1-2 px shift of
    hair_brown (the measured 64 px sheet shift was (1,-1)/(1,-2) on hair).
    `parts` separates palette from geometry for attribution."""
    out = {}
    for it in sprites:
        sp = sprites[it].copy()
        alpha = sp[..., 3]
        orig = alpha > 0
        if "geometry" in parts:
            grow = bool(np.random.default_rng(DRIFT_SEED + 1 + ITEM_IDS.index(it)).integers(0, 2))
            st = np.ones((3, 3), dtype=bool)
            a = (ndimage.grey_dilation(alpha, footprint=st) if grow
                 else ndimage.grey_erosion(alpha, footprint=st))
            if grow:
                # Newly grown pixels take the nearest original item color, as a redraw
                # would, instead of the sprite's transparent background color.
                added = (a > 0) & ~orig
                if added.any():
                    idx = ndimage.distance_transform_edt(~orig, return_distances=False,
                                                         return_indices=True)
                    nearest = sp[idx[0], idx[1], :3]
                    sp[..., :3][added] = nearest[added]
            sp[..., 3] = a
        if "geometry" in parts and it == "hair_brown" and hair_shift:
            sp = np.roll(sp, shift=(-2, 1), axis=(0, 1))
            sp[-2:, :] = 0
            sp[:, :1] = 0
        if "palette" in parts:
            off, _ = offsets[it]
            rgb = sp[..., :3].astype(np.int16) + off.astype(np.int16)
            sp[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
        out[it] = sp
    return out


# ---------------------------------------------------------------- extractors
def label_components(mask: np.ndarray) -> tuple[np.ndarray, int]:
    st = np.ones((3, 3), dtype=bool)
    lab, n = ndimage.label(mask, structure=st)
    return lab, n


def comp_stats(lab: np.ndarray, n: int, colors: np.ndarray) -> list[dict]:
    out = []
    for k in range(1, n + 1):
        m = lab == k
        px = int(m.sum())
        mean = colors[m].mean(axis=0) if px else np.zeros(3)
        out.append({"mask": m, "px": px, "mean": mean})
    return out


def band_candidates(comp: np.ndarray, run_items: list[str], bands: dict[str, np.ndarray]) -> list[str]:
    return [it for it in run_items if np.any(comp & item_band(it, bands))]


def pick_by_palette(mean_rgb, cands, palettes) -> str:
    best, bestd = None, 1e9
    for it in cands:
        d = float(nearest_palette_distance(np.asarray(mean_rgb)[None, :], palettes[it])[0])
        if d < bestd:
            best, bestd = it, d
    return best


def extract_components_band_palette(union, colors, run_items, bands, palettes):
    """E1: 8-connected components >= 2 px; assignment by band candidates, ties by nearest
    palette; zero-candidate components go to the nearest palette overall."""
    lab, n = label_components(union)
    pred = {it: np.zeros((CELL, CELL), dtype=bool) for it in run_items}
    dropped = 0
    for c in comp_stats(lab, n, colors):
        if c["px"] < 2:
            dropped += c["px"]
            continue
        cands = band_candidates(c["mask"], run_items, bands) or run_items
        it = pick_by_palette(c["mean"], cands, palettes)
        pred[it] |= c["mask"]
    return pred, dropped


def extract_bands(union, colors, run_items, bands, palettes):
    """E2: per-pixel band assignment, topmost slot wins ties. No palette, no components."""
    pred = {it: np.zeros((CELL, CELL), dtype=bool) for it in run_items}
    z = {it: (next(z for i, z, o, _ in ITEMS if i == it), next(o for i, z, o, _ in ITEMS if i == it))
         for it in run_items}
    unassigned = np.zeros((CELL, CELL), dtype=bool)
    ys, xs = np.where(union)
    item_bands = {it: item_band(it, bands) for it in run_items}
    for y, x in zip(ys, xs):
        cands = [it for it in run_items if item_bands[it][y, x]]
        if not cands:
            unassigned[y, x] = True
            continue
        it = max(cands, key=lambda i: z[i])
        pred[it][y, x] = True
    return pred, int(unassigned.sum())


def extract_palette(union, colors, run_items, bands, palettes):
    """E3: nearest-palette assignment only (palette from one reference cell)."""
    pred = {it: np.zeros((CELL, CELL), dtype=bool) for it in run_items}
    ys, xs = np.where(union)
    if len(ys) == 0:
        return pred, 0
    rgb = colors[ys, xs]
    dist = {it: nearest_palette_distance(rgb, palettes[it]) for it in run_items}
    stack = np.stack([dist[it] for it in run_items], axis=1)
    win = np.argmin(stack, axis=1)
    for i, it in enumerate(run_items):
        sel = win == i
        pred[it][ys[sel], xs[sel]] = True
    return pred, 0


def extract_combo(union, colors, run_items, bands, palettes):
    """E4: components >= 2 px, split per pixel by band, ties by palette, sub-2 px pieces
    dropped."""
    lab, n = label_components(union)
    pred = {it: np.zeros((CELL, CELL), dtype=bool) for it in run_items}
    item_bands = {it: item_band(it, bands) for it in run_items}
    dropped = 0
    for c in comp_stats(lab, n, colors):
        if c["px"] < 2:
            dropped += c["px"]
            continue
        pix = np.argwhere(c["mask"])
        own = {it: np.zeros((CELL, CELL), dtype=bool) for it in run_items}
        for y, x in pix:
            cands = [it for it in run_items if item_bands[it][y, x]]
            if len(cands) == 1:
                own[cands[0]][y, x] = True
            elif cands:
                own[pick_by_palette(colors[y, x], cands, palettes)][y, x] = True
            else:
                own[pick_by_palette(colors[y, x], run_items, palettes)][y, x] = True
        for it in run_items:
            sub, sn = label_components(own[it])
            for k in range(1, sn + 1):
                sm = sub == k
                if sm.sum() >= 2:
                    pred[it] |= sm
                else:
                    dropped += int(sm.sum())
    return pred, dropped


EXTRACTORS = {
    "E1_components_band_palette": extract_components_band_palette,
    "E2_bands": extract_bands,
    "E3_palette": extract_palette,
    "E4_combo": extract_combo,
}


# ---------------------------------------------------------------- scoring
def score_cell(pred: dict[str, np.ndarray], visible: dict[str, np.ndarray],
               accepted: dict[str, np.ndarray], union: np.ndarray):
    """Per-item counts. Visible = accepted pixels not covered by a higher accepted item.
    pred may only contain union pixels."""
    out = {}
    for it in visible:
        gt = accepted[it][..., 3] > 0
        vis = visible[it]
        p = pred[it] & union
        correct = int((p & vis).sum())
        out[it] = {
            "pred": int(p.sum()),
            "visible": int(vis.sum()),
            "gt": int(gt.sum()),
            "correct": correct,
            "hidden": int(gt.sum() - vis.sum()),
            "covered": int(vis.sum() - (vis & union).sum()),
            "wrong": int(p.sum() - correct),
            "missed": int(vis.sum() - correct),
        }
    return out


def merge_count(union: np.ndarray, accepted: dict[str, np.ndarray], run_items: list[str]):
    lab, n = label_components(union)
    pair_merges = defaultdict(int)
    mixed = 0
    for k in range(1, n + 1):
        m = lab == k
        if m.sum() < 2:
            continue
        labels = {it for it in run_items if np.any(m & (accepted[it][..., 3] > 0))}
        if len(labels) > 1:
            mixed += 1
            for a, b in itertools.combinations(sorted(labels), 2):
                pair_merges[(a, b)] += 1
    return mixed, pair_merges


def add_counts(acc: dict, counts: dict):
    for it, c in counts.items():
        a = acc.setdefault(it, defaultdict(int))
        for k, v in c.items():
            a[k] += v


def summarize(acc: dict, run_items: list[str]):
    rows = {}
    for it in run_items:
        a = acc.get(it, {})
        pred, vis, corr = a.get("pred", 0), a.get("visible", 0), a.get("correct", 0)
        union_px = corr + a.get("wrong", 0)
        prec = corr / pred if pred else 1.0
        rec = corr / vis if vis else 1.0
        iou = corr / (pred + vis - corr) if (pred + vis - corr) else 1.0
        rows[it] = {
            "precision": prec, "recall": rec, "iou": iou,
            "pred": pred, "visible": vis, "correct": corr,
            "wrong": a.get("wrong", 0), "missed": a.get("missed", 0),
            "hidden": a.get("hidden", 0), "covered": a.get("covered", 0),
        }
    return rows


# ---------------------------------------------------------------- main measurement
def run():
    os.makedirs(OUT, exist_ok=True)
    fx = load_fixture()
    sheets = fx["sheets"]
    accepted_sheet = {it: {a: load_sheet(sheets, it, a) for a in ANIM_FRAMES if (it, a) in sheets}
                      for it in [BODY_ID] + ITEM_IDS}

    # Standing-like reference cell: walk/south with the tallest body silhouette.
    ref_scores = []
    for f in range(ANIM_FRAMES["walk"]):
        b = cell_of(accepted_sheet[BODY_ID]["walk"], "walk", "south", f)
        ref_scores.append(int((b[..., 3] > 0).sum()))
    REF = ("walk", "south", int(np.argmax(ref_scores)))
    ref_cells = {it: cell_of(accepted_sheet[it][REF[0]], *REF) for it in ITEM_IDS}
    palettes = {it: palette_of(ref_cells[it]) for it in ITEM_IDS}

    offsets = drift_offsets()

    # Accepted layer masks, per cell.
    def accepted_cells(items, cell):
        anim, d, f = cell
        return {it: cell_of(accepted_sheet[it][anim], anim, d, f) for it in items}

    # ---- overlap census (accepted art, every pair, every direction)
    pair_overlap = defaultdict(lambda: defaultdict(int))  # (a,b) -> dir -> px
    pair_overlap_frames = defaultdict(int)
    pair_max = defaultdict(int)
    for a, b in itertools.combinations(ITEM_IDS, 2):
        pair = (a, b)
        for anim in ANIM_FRAMES:
            if not all((x, anim) in sheets for x in pair):
                continue
            for d in ANIM_DIRS[anim]:
                for f in range(ANIM_FRAMES[anim]):
                    ac = accepted_cells(pair, (anim, d, f))
                    ov = int(((ac[a][..., 3] > 0) & (ac[b][..., 3] > 0)).sum())
                    if ov:
                        pair_overlap[pair][d] += ov
                        pair_overlap_frames[pair] += 1
                        pair_max[pair] = max(pair_max[pair], ov)
    overlap = {}
    for pair, dirs in pair_overlap.items():
        overlap[pair] = {"by_dir": dict(dirs), "frames": pair_overlap_frames[pair],
                         "max_frame": pair_max[pair]}
    disjoint_pairs = [p for p in itertools.combinations(ITEM_IDS, 2) if p not in overlap]
    overlapping_pairs = [p for p in itertools.combinations(ITEM_IDS, 2) if p in overlap]

    # ---- do accepted-disjoint pairs touch after the injected 1 px geometry drift?
    drift_overlap = {}
    for pair in disjoint_pairs:
        a, b = pair
        px = 0
        frames = 0
        for anim in ANIM_FRAMES:
            if not all((x, anim) in sheets for x in pair):
                continue
            for d in ANIM_DIRS[anim]:
                for f in range(ANIM_FRAMES[anim]):
                    acc = accepted_cells(pair, (anim, d, f))
                    src = apply_drift(acc, offsets, parts=("geometry",))
                    ov = int(((src[a][..., 3] > 0) & (src[b][..., 3] > 0)).sum())
                    if ov:
                        px += ov
                        frames += 1
        drift_overlap[f"{a}+{b}"] = {"px": px, "frames": frames}

    # ---- run definitions
    run_sets = {"all": ITEM_IDS}
    for pair in itertools.combinations(ITEM_IDS, 2):
        run_sets["+".join(pair)] = list(pair)
    scope_of = {}
    for pair in itertools.combinations(ITEM_IDS, 2):
        scope_of["+".join(pair)] = "disjoint" if pair in disjoint_pairs else "overlap"
    scope_of["all"] = "all"

    results = {}  # variant -> body_mode -> run -> extractor -> {rows, merges}
    VARIANTS = {
        "exact": None,
        "drift": ("geometry", "palette"),
        "drift_palette": ("palette",),
        "drift_geometry": ("geometry",),
    }
    for variant, parts in VARIANTS.items():
        for body_mode in ("no_body", "with_body"):
            for run_name, items in run_sets.items():
                cells = run_cells(run_name, items, sheets)
                results.setdefault(variant, {}).setdefault(body_mode, {})[run_name] = {
                    "items": items, "scope": scope_of[run_name], "cells": len(cells),
                    "extractors": {},
                }
                per_ex = {ex: defaultdict(lambda: defaultdict(int)) for ex in EXTRACTORS}
                merge_total = 0
                pair_merges_total = defaultdict(int)
                bad_frames = {ex: defaultdict(int) for ex in EXTRACTORS}
                union_miss = {"visible": 0, "covered": 0, "hidden": 0}
                for cell, cell_items in cells:
                    anim, d, f = cell
                    acc = accepted_cells(cell_items, cell)
                    body = cell_of(accepted_sheet[BODY_ID][anim], anim, d, f) if body_mode == "with_body" else None
                    src = acc if parts is None else apply_drift(acc, offsets, parts=parts)
                    img, _labels = composite(cell_items, src, body)
                    union = union_from_composite(img, body)
                    colors = img[..., :3]
                    vis = visible_masks(cell_items, acc)
                    mixed, pm = merge_count(union, acc, cell_items)
                    merge_total += mixed
                    for k, v in pm.items():
                        pair_merges_total[k] += v
                    union_miss["visible"] += sum(int(v.sum()) for v in vis.values())
                    union_miss["covered"] += sum(int((vis[i] & ~union).sum()) for i in vis)
                    bands = bands_for_body(body if body is not None else
                                           cell_of(accepted_sheet[BODY_ID][anim], anim, d, f))
                    for ex, fn in EXTRACTORS.items():
                        pred, _ = fn(union, colors, cell_items, bands, palettes)
                        counts = score_cell(pred, vis, acc, union)
                        add_counts(per_ex[ex], counts)
                        for it, c in counts.items():
                            if c["visible"] and (c["correct"] / c["visible"] < 0.95 or
                                                 (c["pred"] and c["correct"] / c["pred"] < 0.98)):
                                bad_frames[ex][it] += 1
                for ex in EXTRACTORS:
                    rows = summarize(per_ex[ex], items)
                    results[variant][body_mode][run_name]["extractors"][ex] = {
                        "items": rows,
                        "merges": merge_total,
                        "pair_merges": {f"{a}+{b}": v for (a, b), v in sorted(pair_merges_total.items())},
                        "bad_frames": dict(bad_frames[ex]),
                    }
                results[variant][body_mode][run_name]["union"] = {
                    "visible_px": union_miss["visible"],
                    "covered_px": union_miss["covered"],
                    "coverage": (union_miss["visible"] - union_miss["covered"]) / union_miss["visible"]
                    if union_miss["visible"] else 1.0,
                }

    # ---- scope aggregates (sum counts over runs)
    def aggregate(mode, variant, scope):
        acc = {ex: defaultdict(lambda: defaultdict(int)) for ex in EXTRACTORS}
        bad = {ex: defaultdict(int) for ex in EXTRACTORS}
        merges = 0
        pairs = []
        for run_name, meta in results[variant][mode].items():
            if meta["scope"] != scope:
                continue
            pairs.append(run_name)
            merges += meta["extractors"]["E1_components_band_palette"]["merges"]
            for ex in EXTRACTORS:
                payload = meta["extractors"][ex]
                for it, c in payload["items"].items():
                    for k in ("pred", "visible", "correct", "wrong", "missed", "hidden", "covered"):
                        acc[ex][it][k] += c[k]
                for it, n in payload["bad_frames"].items():
                    bad[ex][it] += n
        out = {}
        for ex in EXTRACTORS:
            items = sorted(acc[ex])
            out[ex] = {"items": summarize(acc[ex], items), "bad_frames": dict(bad[ex])}
        return out

    aggregates = {v: {} for v in VARIANTS}
    for variant in VARIANTS:
        for mode in ("no_body", "with_body"):
            aggregates[variant][mode] = {
                "disjoint": aggregate(mode, variant, "disjoint"),
                "overlap": aggregate(mode, variant, "overlap"),
                "all": aggregate(mode, variant, "all"),
            }

    # ---- write JSON
    def enc(o):
        if isinstance(o, (np.floating, np.integer)):
            return o.item()
        raise TypeError(type(o))

    blob = {
        "reference_cell": {"animation": REF[0], "direction": REF[1], "frame": REF[2],
                           "reason": "tallest body silhouette in walk/south (most upright)"},
        "palette_sizes": {it: int(len(palettes[it])) for it in ITEM_IDS},
        "drift": {it: {"magnitude": offsets[it][1],
                       "vector": list(map(float, offsets[it][0]))} for it in ITEM_IDS},
        "overlap": {f"{a}+{b}": v for (a, b), v in overlap.items()},
        "disjoint_pairs": [f"{a}+{b}" for a, b in disjoint_pairs],
        "overlapping_pairs": [f"{a}+{b}" for a, b in overlapping_pairs],
        "drift_overlap_of_disjoint_pairs": drift_overlap,
        "runs": results,
        "aggregates": aggregates,
    }
    with open(os.path.join(OUT, "metrics.json"), "w", encoding="utf-8") as fh:
        json.dump(blob, fh, indent=1, default=enc)

    render(accepted_sheet, items=ITEM_IDS, palettes=palettes)
    write_tables(blob)
    write_summary(blob)
    return blob


# ---------------------------------------------------------------- images
def render(accepted_sheet, items, palettes):
    def ups(img):
        return Image.fromarray(img).resize((CELL * 4, CELL * 4), Image.NEAREST)

    for tag, cell in (("all_walk_south_f0", ("walk", "south", 0)),
                      ("all_walk_east_f2", ("walk", "east", 2))):
        anim, d, f = cell
        acc = {it: cell_of(accepted_sheet[it][anim], anim, d, f) for it in items}
        body = cell_of(accepted_sheet[BODY_ID][anim], anim, d, f)
        img, labels = composite(items, acc, body)
        ups(img).save(os.path.join(OUT, f"composite_{tag}.png"))
        gt = np.zeros((CELL, CELL, 4), dtype=np.uint8)
        for it in items:
            gt[acc[it][..., 3] > 0] = (*ITEM_COLORS[it], 255)
        ups(gt).save(os.path.join(OUT, f"gt_{tag}.png"))
        union = acc[items[0]][..., 3] > 0
        for it in items[1:]:
            union |= acc[it][..., 3] > 0
        bands = bands_for_body(body)
        for ex, fn in EXTRACTORS.items():
            pred, _ = fn(union, img[..., :3], items, bands, palettes)
            out = np.zeros((CELL, CELL, 4), dtype=np.uint8)
            for it in items:
                out[pred[it]] = (*ITEM_COLORS[it], 255)
            ups(out).save(os.path.join(OUT, f"{ex}_{tag}.png"))

    # overlapping pair example: hair + helmet
    pair = ("hair_brown", "helmet_steel")
    acc = {it: cell_of(accepted_sheet[it]["walk"], "walk", "south", 0) for it in pair}
    img, _ = composite(list(pair), acc, None)
    ups(img).save(os.path.join(OUT, "pair_hair_helmet.png"))


# ---------------------------------------------------------------- markdown
def pct(v):
    return f"{100 * v:.1f}%"


def agg_iou(rows):
    rows = list(rows.values()) if isinstance(rows, dict) else list(rows)
    corr = sum(r["correct"] for r in rows)
    den = sum(r["pred"] + r["visible"] - r["correct"] for r in rows)
    return corr / den if den else 1.0


def table_for(rows, order, label="item"):
    head = (f"| {label} | precision | recall | IoU | wrong-item px | missed px | hidden px | bad frames |\n"
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n")
    body = ""
    for it in order:
        if it not in rows:
            continue
        r = rows[it]
        body += (f"| {it} | {pct(r['precision'])} | {pct(r['recall'])} | {pct(r['iou'])} | "
                 f"{r['wrong']} | {r['missed']} | {r['hidden']} | {r.get('bad_frames', 0)} |\n")
    return head + body


def write_tables(blob):
    lines = ["# Generated tables", ""]
    lines.append(f"Reference cell for E3 palettes: {blob['reference_cell']['animation']}/"
                 f"{blob['reference_cell']['direction']}/{blob['reference_cell']['frame']} "
                 f"({blob['reference_cell']['reason']}).")
    lines.append("")
    lines.append("## Pair overlap (accepted art, walk + cross-punch, all directions)")
    lines.append("")
    lines.append("| pair | south | east | north | frames with overlap | max px in a frame |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: |")
    for key in blob["overlap"]:
        v = blob["overlap"][key]
        bd = v["by_dir"]
        lines.append(f"| {key} | {bd.get('south', 0)} | {bd.get('east', 0)} | {bd.get('north', 0)} | "
                     f"{v['frames']} | {v['max_frame']} |")
    lines.append("")
    for key, v in blob["drift_overlap_of_disjoint_pairs"].items():
        lines.append(f"- Drift contact, accepted-disjoint {key}: {v['px']} px in {v['frames']} frames.")
    lines.append("")
    lines.append("## Pair detail")
    lines.append("")
    lines.append("| pair | class | overlap px (frames) | hidden px | merges exact | E1 exact IoU | E3 exact IoU | E4 exact IoU | E3 drift IoU | E4 drift IoU | E3 exact bad frames | E3 drift bad frames |")
    lines.append("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for pair_name, run in blob["runs"]["exact"]["no_body"].items():
        if pair_name == "all":
            continue
        ex = run["extractors"]
        hidden = sum(r["hidden"] for r in ex["E3_palette"]["items"].values())
        ov = blob["overlap"].get(pair_name)
        ovs = f"{sum(ov['by_dir'].values())} ({ov['frames']})" if ov else "0 (0)"
        d3 = blob["runs"]["drift"]["no_body"][pair_name]["extractors"]["E3_palette"]["items"]
        d4 = blob["runs"]["drift"]["no_body"][pair_name]["extractors"]["E4_combo"]["items"]
        iou3d = sum(r["correct"] for r in d3.values()) / max(1, sum(r["pred"] + r["visible"] - r["correct"] for r in d3.values()))
        iou4d = sum(r["correct"] for r in d4.values()) / max(1, sum(r["pred"] + r["visible"] - r["correct"] for r in d4.values()))
        dr = blob["runs"]["drift"]["no_body"][pair_name]["extractors"]["E3_palette"]
        bad_exact = sum(ex["E3_palette"]["bad_frames"].values())
        bad_drift = sum(dr["bad_frames"].values())
        lines.append(
            f"| {pair_name} | {run['scope']} | {ovs} | {hidden} | "
            f"{ex['E1_components_band_palette']['merges']} | "
            f"{agg_iou(ex['E1_components_band_palette']['items']):.3f} | "
            f"{agg_iou(ex['E3_palette']['items']):.3f} | "
            f"{agg_iou(ex['E4_combo']['items']):.3f} | {iou3d:.3f} | {iou4d:.3f} | "
            f"{bad_exact} | {bad_drift} |")
    lines.append("")
    lines.append("## Occlusion ceiling (all items together, accepted art)")
    lines.append("")
    lines.append("| item | accepted px | accepted-visible px | hidden px | hidden share |")
    lines.append("| --- | ---: | ---: | ---: | ---: |")
    rows = blob["aggregates"]["exact"]["no_body"]["all"]["E3_palette"]["items"]
    for it, r in rows.items():
        gt = r["visible"] + r["hidden"]
        lines.append(f"| {it} | {gt} | {r['visible']} | {r['hidden']} | {pct(r['hidden'] / gt if gt else 0)} |")
    lines.append("")
    lines.append("## Drift attribution (E3 palette, micro IoU by scope)")
    lines.append("")
    lines.append("| scope | exact | palette only | geometry only | combined |")
    lines.append("| --- | ---: | ---: | ---: | ---: |")
    for scope in ("disjoint", "overlap", "all"):
        cells = []
        for variant in ("exact", "drift_palette", "drift_geometry", "drift"):
            rows = blob["aggregates"][variant]["no_body"][scope]["E3_palette"]["items"].values()
            cells.append(f"{agg_iou(rows):.3f}")
        lines.append(f"| {scope} | " + " | ".join(cells) + " |")
    lines.append("")
    for scope in ("disjoint", "overlap", "all"):
        for variant in blob["aggregates"]:
            for mode in ("no_body", "with_body"):
                lines.append(f"## {scope} / {variant} / {mode}")
                lines.append("")
                for ex in EXTRACTORS:
                    a = blob["aggregates"][variant][mode][scope][ex]
                    rows = {it: {**r, "bad_frames": a["bad_frames"].get(it, 0)}
                            for it, r in a["items"].items()}
                    lines.append(f"### {ex}")
                    lines.append("")
                    lines.append(table_for(rows, list(rows)))
                    lines.append("")
    with open(os.path.join(OUT, "tables.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def write_summary(blob):
    lines = []
    for scope in ("disjoint", "overlap", "all"):
        for variant in blob["aggregates"]:
            for mode in ("no_body", "with_body"):
                agg = blob["aggregates"][variant][mode][scope]
                parts = []
                for ex in EXTRACTORS:
                    rows = agg[ex]["items"].values()
                    pred = sum(r["pred"] for r in rows)
                    vis = sum(r["visible"] for r in rows)
                    corr = sum(r["correct"] for r in rows)
                    p = corr / pred if pred else 1.0
                    r = corr / vis if vis else 1.0
                    iou = corr / (pred + vis - corr) if (pred + vis - corr) else 1.0
                    parts.append(f"{ex} P={p:.3f} R={r:.3f} IoU={iou:.3f}")
                lines.append(f"{scope:9s} {variant:5s} {mode:9s} | " + " | ".join(parts))
    with open(os.path.join(OUT, "summary.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    run()

