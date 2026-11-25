"""Reference-guided deterministic extractor for a shared-body batch.

Prototype and measurement for the auto-batch-safe case (rule C: different slots,
no standing overlap, >= 2 px standing gap).

Builds on harness.py (data loading, compositing, drift injection, palettes) and adds:

  1. a per-item color model from one accepted reference cell, nearest-color
     likelihood with a tolerance, plus body and chroma-key rejection;
  2. soft spatial priors: the reference mask dilated, the slot band from body
     geometry, and the distance transform of both;
  3. temporal continuity: previous-frame mask prior and component-level
     inheritance from the nearest previous component within 1 px;
  4. a z-order pass: a pixel claimed by two items goes to the higher z, and the
     pixels the lower item can no longer recover are counted;
  5. a post-generation verifier (area, palette, boundary jump, empty frames,
     cross-item contamination, confidence).

No network, no PixelLab calls, no writes under app/.

Run from the repository root:
    python docs/research/2026-11-24-batch-extraction/reference_extractor.py
"""

from __future__ import annotations

import itertools
import json
import os
import sys
from collections import defaultdict

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harness as H  # noqa: E402

OUT = os.path.join(HERE, "out_ref")
CELL = H.CELL
DIRS = H.DIRS
ANIM_FRAMES = H.ANIM_FRAMES
ANIM_DIRS = H.ANIM_DIRS
ITEMS = H.ITEMS
ITEM_IDS = H.ITEM_IDS
BODY_ID = H.BODY_ID

ST8 = np.ones((3, 3), dtype=bool)

# ------------------------------------------------------------------ parameters
# Chosen on the Rule C group with exact art only, then held fixed for every
# other scope and variant. See findings/reference-extractor.md.
P = {
    "color_sigma": 8.0,      # RGB distance at which the color likelihood falls to exp(-0.5)
    "color_cap": 60.0,       # cap on color distance so a far item is not infinitely punished
    "ref_sigma": 4.5,        # reference-mask distance transform scale (1-2 px dilation effect)
    "ref_cap": 12.0,
    "band_sigma": 5.0,       # slot-band distance transform scale
    "band_cap": 12.0,
    "temp_sigma": 1.5,       # previous-frame distance transform scale
    "temp_cap": 4.0,
    "w_ref": 0.4,            # prior weights, for ablation
    "w_band": 0.5,
    "w_temp": 0.4,
    "ref_extra_dilate": 1,   # reference mask is dilated by this many px before its EDT
    "claim_score": -9.0,     # a pixel must reach this score to be claimed at all
    "z_claim_margin": 0.75,  # a higher-z item within this score margin steals the pixel
    "sticky_margin": 0.9,    # component-level best/second gap below which temporal wins
    "sticky_radius": 1.0,    # nearest previous component must be this close
    "min_component": 2,      # the app's chromaLayer minimum
}

# Chroma key ramps sampled at 5 stops (docs/research/2026-11-09-paperdoll-video-review/chroma-key.md).
_KEY_STOPS = {
    "green": [(0, 60, 0), (28, 109, 28), (55, 158, 55), (83, 206, 83), (110, 255, 110)],
    "magenta": [(60, 0, 60), (109, 28, 109), (158, 55, 158), (206, 83, 206), (255, 110, 255)],
    "blue": [(0, 0, 60), (28, 28, 109), (55, 55, 158), (83, 83, 206), (110, 110, 255)],
    "azure": [(0, 45, 60), (28, 82, 109), (55, 120, 158), (83, 157, 206), (110, 195, 255)],
}
KEY_COLORS = np.array([c for stops in _KEY_STOPS.values() for c in stops], dtype=np.int16)


# ------------------------------------------------------------------ data
def dist_to_palette(colors: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """colors (H,W,3) uint8 -> (H,W) distance to the nearest palette color."""
    if len(palette) == 0:
        return np.full(colors.shape[:2], 1e9, dtype=np.float32)
    c = colors.astype(np.int16)
    best = np.full(colors.shape[:2], 1e9, dtype=np.float32)
    for col in palette:
        d = c - col[None, None, :]
        d = np.sqrt((d.astype(np.int32) ** 2).sum(axis=2)).astype(np.float32)
        best = np.minimum(best, d)
    return best


def edt_outside(mask: np.ndarray) -> np.ndarray:
    """Distance from every pixel to the nearest True pixel (0 inside the mask)."""
    return ndimage.distance_transform_edt(~mask).astype(np.float32)


def dilate(mask: np.ndarray, r: int = 1) -> np.ndarray:
    if r <= 0:
        return mask.copy()
    return ndimage.binary_dilation(mask, structure=ST8, iterations=r)


def core(mask: np.ndarray) -> np.ndarray:
    """8-connected component labelling of the union, minimum size applied later."""
    lab, n = ndimage.label(mask, structure=ST8)
    return lab, n


# ------------------------------------------------------------------ color model
class ColorModel:
    """Per-item nearest-color likelihood from one accepted reference cell.

    `palettes[i]` are the exact colors of the accepted reference cell.
    `body_palette` and the chroma key ramps form the reject classes.
    """

    def __init__(self, ref_cells: dict[str, np.ndarray], body_ref: np.ndarray):
        self.palettes = {it: H.palette_of(ref_cells[it]) for it in ref_cells}
        self.body_palette = H.palette_of(body_ref)
        self.body_mask = body_ref[..., 3] > 0

    def color_score(self, img_rgb: np.ndarray) -> dict[str, np.ndarray]:
        cap = P["color_cap"]
        sigma = P["color_sigma"]
        out = {}
        for it, pal in self.palettes.items():
            d = np.minimum(dist_to_palette(img_rgb, pal), cap)
            out[it] = -0.5 * (d / sigma) ** 2
        return out

    def reject(self, img_rgb: np.ndarray, opaque: np.ndarray) -> np.ndarray:
        """True where a pixel must not be assigned to any item: chroma key or the
        known base body within a tight tolerance."""
        key_d = dist_to_palette(img_rgb, KEY_COLORS)
        key_reject = key_d < 12.0
        body_d = dist_to_palette(img_rgb, self.body_palette)
        body_reject = body_d < 5.0
        reject = (key_reject | body_reject) & opaque
        # Never reject a pixel that is a reference item color: exact art must pass.
        own = np.zeros(opaque.shape, dtype=bool)
        for pal in self.palettes.values():
            own |= dist_to_palette(img_rgb, pal) < 1.0
        return reject & ~own


# ------------------------------------------------------------------ extractor
class Extractor:
    def __init__(self, items: list[str], model: ColorModel, ref_masks: dict[str, np.ndarray],
                 bands: dict[str, np.ndarray]):
        self.items = items
        self.model = model
        self.ref_masks = {it: dilate(ref_masks[it], P["ref_extra_dilate"]) for it in items}
        self.ref_dist = {it: edt_outside(self.ref_masks[it]) for it in items}
        self.bands = bands
        self.band_dist = ({it: edt_outside(H.item_band(it, bands)) for it in items}
                          if bands is not None else
                          {it: np.zeros((CELL, CELL), dtype=np.float32) for it in items})
        self.z = {it: (next(z for i, z, o, _ in ITEMS if i == it),
                       next(o for i, z, o, _ in ITEMS if i == it)) for it in items}
        # higher z first: index 0 is the topmost owner of a contested pixel
        self.z_order = sorted(items, key=lambda it: self.z[it], reverse=True)
        self.prev = {it: None for it in items}

    def reset_sequence(self):
        self.prev = {it: None for it in self.items}

    def seed(self, masks: dict[str, np.ndarray]):
        """The accepted reference cell is the previous frame for the first scored one."""
        self.prev = {it: masks[it].copy() for it in self.items}

    def set_reference(self, masks: dict[str, np.ndarray]):
        """Re-point the spatial prior at the registered reference masks of this
        direction (the reference is a standing cell, so it needs registering)."""
        self.ref_masks = {it: dilate(masks[it], P["ref_extra_dilate"]) for it in self.items}
        self.ref_dist = {it: edt_outside(self.ref_masks[it]) for it in self.items}

    # -- one frame ---------------------------------------------------------
    def frame(self, img: np.ndarray, union: np.ndarray) -> tuple[dict[str, np.ndarray], dict]:
        rgb = img[..., :3]
        opaque = img[..., 3] > 0
        reject = self.model.reject(rgb, opaque)
        score = self.model.color_score(rgb)
        h, w = union.shape
        S = np.full((len(self.items), h, w), -1e9, dtype=np.float32)
        for i, it in enumerate(self.items):
            s = score[it].copy()
            s -= P["w_ref"] * 0.5 * (np.minimum(self.ref_dist[it], P["ref_cap"]) / P["ref_sigma"]) ** 2
            s -= P["w_band"] * 0.5 * (np.minimum(self.band_dist[it], P["band_cap"]) / P["band_sigma"]) ** 2
            if self.prev[it] is not None:
                dprev = edt_outside(dilate(self.prev[it], 1))
                s -= P["w_temp"] * 0.5 * (np.minimum(dprev, P["temp_cap"]) / P["temp_sigma"]) ** 2
            S[i] = s

        ys, xs = np.nonzero(union & ~reject)
        winner = np.full((h, w), -1, dtype=np.int8)
        lost_to_z = defaultdict(int)
        if len(ys):
            vals = S[:, ys, xs]                       # (n_items, n_px)
            best = np.argmax(vals, axis=0)
            # Z-order: the highest-z item that also clears the claim margin owns it.
            claim = vals >= (vals[best, np.arange(len(ys))] - P["z_claim_margin"])
            claim &= vals >= P["claim_score"]
            for idx in range(len(ys)):
                chosen = best[idx]
                for zi, it in enumerate(self.items):
                    if claim[zi, idx] and self.z[it] > self.z[self.items[chosen]]:
                        chosen = zi
                        break
                winner[ys[idx], xs[idx]] = chosen
                if chosen != best[idx] and vals[best[idx], idx] >= P["claim_score"]:
                    lost_to_z[self.items[best[idx]]] += 1
                if vals[chosen, idx] < P["claim_score"]:
                    winner[ys[idx], xs[idx]] = -1

        # Component-level temporal inheritance: only small per-item fragments whose
        # summed score is close to another item's are allowed to switch, and only when
        # exactly one other item's previous mask is within sticky_radius. Large regions
        # keep their per-pixel assignment.
        pred = {it: np.zeros((h, w), dtype=bool) for it in self.items}
        for i, it in enumerate(self.items):
            pred[it] = winner == i
        if self.prev and any(v is not None for v in self.prev.values()):
            S_by_item = {it: S[i] for i, it in enumerate(self.items)}
            for it in list(self.items):
                lab, n = core(pred[it])
                for k in range(1, n + 1):
                    m = lab == k
                    size = int(m.sum())
                    if size == 0 or size > 32:
                        continue
                    # items whose previous mask touches this fragment
                    near = [o for o in self.items
                            if self.prev[o] is not None and
                            np.any(dilate(self.prev[o], int(np.ceil(P["sticky_radius"]))) & m)]
                    if len(near) != 1:
                        continue
                    o = near[0]
                    if o == it:
                        continue
                    idx = np.where(m)
                    own = float(S_by_item[it][idx].sum())
                    alt = float(S_by_item[o][idx].sum())
                    if alt >= own - P["sticky_margin"]:
                        pred[it][m] = False
                        pred[o][m] = True

        # minimum component size, keeping 1 px fragments that continue the previous mask
        for it in self.items:
            lab, n = core(pred[it])
            if n == 0:
                continue
            keep = np.zeros_like(pred[it])
            for k in range(1, n + 1):
                m = lab == k
                if m.sum() >= P["min_component"]:
                    keep |= m
                elif self.prev[it] is not None and np.any(dilate(self.prev[it], 1) & m):
                    keep |= m
            pred[it] = keep

        stats = {"rejected": int((union & reject).sum()), "lost_to_z": dict(lost_to_z)}
        for it in self.items:
            self.prev[it] = pred[it].copy()
        return pred, stats


# ------------------------------------------------------------------ metrics
def boundary(mask: np.ndarray) -> np.ndarray:
    return mask & ~ndimage.binary_erosion(mask, structure=ST8, border_value=0)


def tolerant(pred: np.ndarray, gt: np.ndarray, t: int = 1):
    gt_d = dilate(gt, t)
    pred_d = dilate(pred, t)
    p_in = int((pred & gt_d).sum())
    g_in = int((gt & pred_d).sum())
    prec = p_in / pred.sum() if pred.sum() else 1.0
    rec = g_in / gt.sum() if gt.sum() else 1.0
    den = int(pred.sum() + gt.sum())
    iou = (p_in + g_in) / den if den else 1.0
    # boundary distance
    bp, bg = boundary(pred), boundary(gt)
    if bp.any() and bg.any():
        d_pg = ndimage.distance_transform_edt(~bg)[bp]
        d_gp = ndimage.distance_transform_edt(~bp)[bg]
        bd_mean = float(np.mean(np.concatenate([d_pg, d_gp])))
        bd_p95 = float(np.percentile(np.concatenate([d_pg, d_gp]), 95))
        bd_max = float(max(d_pg.max(), d_gp.max()))
    elif not bp.any() and not bg.any():
        bd_mean = bd_p95 = bd_max = 0.0
    else:
        bd_mean = bd_p95 = bd_max = float(CELL)
    return {"prec_t": prec, "rec_t": rec, "iou_t": iou,
            "bd_mean": bd_mean, "bd_p95": bd_p95, "bd_max": bd_max}


def score_frame(pred: dict[str, np.ndarray], acc: dict[str, np.ndarray],
                run_items: list[str]) -> dict[str, dict]:
    vis = H.visible_masks(run_items, acc)
    out = {}
    for it in run_items:
        p = pred[it]
        gt = acc[it][..., 3] > 0
        v = vis[it]
        correct = int((p & v).sum())
        other = np.zeros((CELL, CELL), dtype=bool)
        for o in run_items:
            if o != it:
                other |= vis[o]
        wrong_item = int((p & other).sum())
        pred_n = int(p.sum())
        vis_n = int(v.sum())
        gt_n = int(gt.sum())
        prec = correct / pred_n if pred_n else 1.0
        rec = correct / vis_n if vis_n else 1.0
        iou = correct / (pred_n + vis_n - correct) if (pred_n + vis_n - correct) else 1.0
        tol = tolerant(p, v)
        area_err = abs(pred_n - vis_n) / vis_n if vis_n else 0.0
        out[it] = {
            "pred": pred_n, "visible": vis_n, "gt": gt_n, "correct": correct,
            "hidden": gt_n - vis_n, "wrong_item": wrong_item,
            "missed": vis_n - correct, "precision": prec, "recall": rec, "iou": iou,
            "area_err": area_err, "iou_strict": iou, **tol,
        }
    return out


# ------------------------------------------------------------------ verifier
def verify(items: list[str], pred: dict[str, np.ndarray],
           prev_pred: dict[str, np.ndarray | None], ref_masks: dict[str, np.ndarray],
           model: ColorModel, img_rgb: np.ndarray,
           z_lost: dict[str, int], first_frame: bool,
           cross_animation_ref: bool = False) -> dict[str, dict]:
    """Post-generation verifier. Returns per item a confidence in [0,1] and the
    signals that failed. Uses no ground truth: only the accepted reference cell,
    the composite colors and the previous frame's own output."""
    out = {}
    for it in items:
        p = pred[it]
        n = int(p.sum())
        sig = {}
        # 1. empty frame
        sig["empty"] = n == 0 and int(ref_masks[it].sum()) > 0
        # 2. area deviation versus the accepted direction reference area
        ref_n = int(ref_masks[it].sum())
        ratio = n / ref_n if ref_n else 1.0
        sig["area_ratio"] = ratio
        sig["area_bad"] = not (0.50 <= ratio <= 1.90)
        # 3. palette distance of the extracted pixels
        if n:
            d = dist_to_palette(img_rgb, model.palettes[it])[p]
            sig["pal_mean"] = float(d.mean())
            sig["pal_p90"] = float(np.percentile(d, 90))
        else:
            sig["pal_mean"] = sig["pal_p90"] = 0.0
        sig["palette_bad"] = sig["pal_mean"] > 30.0 or sig["pal_p90"] > 45.0
        # 4. boundary jump versus the previous frame's mask
        jump = 0.0
        if (not first_frame) and n and prev_pred.get(it) is not None and prev_pred[it].any():
            bp = boundary(p)
            bprev = boundary(prev_pred[it])
            if bp.any() and bprev.any():
                d = ndimage.distance_transform_edt(~bprev)[bp]
                jump = float(np.percentile(d, 95))
        sig["boundary_jump"] = jump
        sig["jump_bad"] = (not first_frame) and jump > 8.0
        # 5. cross-item contamination: pixels closer to another item's palette
        contam = 0.0
        if n:
            own_d = dist_to_palette(img_rgb, model.palettes[it])
            others = [o for o in items if o != it]
            other_d = np.full((CELL, CELL), 1e9, dtype=np.float32)
            for o in others:
                other_d = np.minimum(other_d, dist_to_palette(img_rgb, model.palettes[o]))
            contam = float(((other_d + 2.0) < own_d)[p].mean())
        sig["contamination"] = contam
        sig["contam_bad"] = contam > 0.30
        # 6. distance from the registered accepted reference mask. A reference from a
        #    different animation (cross-punch) is a pose mismatch, not a valid prior.
        if n and not cross_animation_ref:
            far = edt_outside(ref_masks[it]) > 6.0
            sig["far_from_ref"] = float((far & p).sum() / n)
        else:
            sig["far_from_ref"] = 0.0
        sig["far_bad"] = sig["far_from_ref"] > 0.40
        # 7. shape conflict: another item's registered reference explains this mask
        #    better than the item's own reference (catches a whole-region swap)
        def iou_mask(a: np.ndarray, b: np.ndarray) -> float:
            u = int((a | b).sum())
            return float((a & b).sum()) / u if u else 0.0
        own_shape = iou_mask(p, ref_masks[it])
        other_shape = max((iou_mask(p, ref_masks[o]) for o in items if o != it), default=0.0)
        sig["shape_conflict"] = other_shape - own_shape
        sig["shape_bad"] = sig["shape_conflict"] > 0.20
        # 8. z-order violation: the item claims pixels that sit inside a higher-z
        #    item's registered reference mask. In the disjoint auto-batch case those
        #    regions cannot belong to it.
        if n:
            zviol = 0
            for o in items:
                if o == it:
                    continue
                zo = next(z for i, z, _o, _b in ITEMS if i == o)
                zi = next(z for i, z, _o, _b in ITEMS if i == it)
                if zo > zi:
                    zviol += int((p & ref_masks[o]).sum())
            sig["z_violation"] = zviol / n
        else:
            sig["z_violation"] = 0.0
        sig["zviol_bad"] = sig["z_violation"] > 0.02
        # 9. frame-to-frame area change
        change = 0.0
        if not first_frame and prev_pred.get(it) is not None and prev_pred[it].any():
            pn = int(prev_pred[it].sum())
            change = abs(n - pn) / pn if pn else 0.0
        sig["area_change"] = change
        sig["change_bad"] = (not first_frame) and change > 0.45
        # 9. pixels the item lost to a higher z item (information loss, not a hard fail)
        loss = z_lost.get(it, 0) / n if n else 0.0
        sig["z_loss_share"] = loss
        sig["z_loss"] = loss > 0.05

        conf = 1.0
        if sig["empty"]:
            conf *= 0.0
        if sig["area_bad"]:
            conf *= 0.25
        if sig["palette_bad"]:
            conf *= 0.50
        if sig["jump_bad"]:
            conf *= 0.50
        if sig["contam_bad"]:
            conf *= 0.35
        if sig["far_bad"]:
            conf *= 0.60
        if sig["change_bad"]:
            conf *= 0.50
        if sig["shape_bad"]:
            conf *= 0.55
        if sig["zviol_bad"]:
            conf *= 0.35
        if sig["z_loss"]:
            conf *= 0.85
        failed = [k for k in ("empty", "area_bad", "palette_bad", "jump_bad", "contam_bad",
                              "far_bad", "shape_bad", "zviol_bad", "change_bad", "z_loss")
                  if sig.get(k)]
        out[it] = {"confidence": conf, "signals": sig, "bad": failed, "pass": conf >= 0.75}
    return out


# ------------------------------------------------------------------ run
def direction_has_art(accepted_sheet: dict, item: str, anim: str, d: str) -> bool:
    """True when the item has any accepted pixel in this direction. The app knows
    this from the accepted reference sheet; here it also excludes the fixture's
    hat_wizard, which has no north art and no cross-punch sheet."""
    if anim not in accepted_sheet[item]:
        return False
    for f in range(ANIM_FRAMES[anim]):
        if np.any(H.cell_of(accepted_sheet[item][anim], anim, d, f)[..., 3] > 0):
            return True
    return False


def body_centroid(mask: np.ndarray) -> tuple[float, float]:
    ys, xs = np.nonzero(mask)
    return (float(ys.mean()), float(xs.mean())) if len(ys) else (0.0, 0.0)


def shift_mask(mask: np.ndarray, dy: int, dx: int) -> np.ndarray:
    if dy == 0 and dx == 0:
        return mask.copy()
    return ndimage.shift(mask.astype(np.uint8), (dy, dx), order=0,
                         mode="constant", cval=0) > 0


def run():
    os.makedirs(OUT, exist_ok=True)
    fx = H.load_fixture()
    sheets = fx["sheets"]
    accepted_sheet = {it: {a: H.load_sheet(sheets, it, a) for a in ANIM_FRAMES if (it, a) in sheets}
                      for it in [BODY_ID] + ITEM_IDS}

    body_sizes = [int((H.cell_of(accepted_sheet[BODY_ID]["walk"], "walk", "south", f)[..., 3] > 0).sum())
                  for f in range(ANIM_FRAMES["walk"])]
    REF = ("walk", "south", int(np.argmax(body_sizes)))
    ref_cells = {it: H.cell_of(accepted_sheet[it][REF[0]], *REF) for it in ITEM_IDS}
    ref_masks = {it: ref_cells[it][..., 3] > 0 for it in ITEM_IDS}
    ref_area = {it: int(ref_masks[it].sum()) for it in ITEM_IDS}
    body_ref = H.cell_of(accepted_sheet[BODY_ID][REF[0]], *REF)
    model = ColorModel(ref_cells, body_ref)
    model.ref_masks = ref_masks

    # Spatial reference per direction: the standing cell of that direction. Cross-punch
    # has no standing cell, so it uses walk/south registered by the body centroid.
    def reference_source(anim: str, d: str):
        if anim == "walk":
            cell = ("walk", d, 0)
            return cell, {it: H.cell_of(accepted_sheet[it][cell[0]], *cell) for it in ITEM_IDS}, \
                H.cell_of(accepted_sheet[BODY_ID][cell[0]], *cell)
        cell = ("walk", "south", 0)
        return cell, {it: H.cell_of(accepted_sheet[it][cell[0]], *cell) for it in ITEM_IDS}, \
            H.cell_of(accepted_sheet[BODY_ID][cell[0]], *cell)

    offsets = H.drift_offsets()

    scopes = {}
    scopes["ruleC"] = ["vest_leather", "hat_wizard", "sword_steel"]
    scopes["ruleC_no_sword"] = ["vest_leather", "hat_wizard"]
    pair_class = {}
    for a, b in itertools.combinations(ITEM_IDS, 2):
        name = f"{a}+{b}"
        overlap = False
        for anim in ANIM_FRAMES:
            if not all((x, anim) in sheets for x in (a, b)):
                continue
            for d in ANIM_DIRS[anim]:
                for f in range(ANIM_FRAMES[anim]):
                    ca = H.cell_of(accepted_sheet[a][anim], anim, d, f)
                    cb = H.cell_of(accepted_sheet[b][anim], anim, d, f)
                    if np.any((ca[..., 3] > 0) & (cb[..., 3] > 0)):
                        overlap = True
        pair_class[name] = "overlap" if overlap else "disjoint"
        scopes[name] = [a, b]

    VARIANTS = {
        "exact": (None, True),
        "palette": (("palette",), True),
        "geom1": (("geometry",), False),
        "geometry": (("geometry",), True),
        "combined": (("geometry", "palette"), True),
    }

    results = {v: {scope: {"items": items, "class": pair_class.get(scope, "group"),
                           "cells": [], "verifier": []}
                   for scope, items in scopes.items()}
               for v in VARIANTS}

    for variant, (parts, hair_shift) in VARIANTS.items():
        for scope, items in scopes.items():
            # sequences: walk per direction, cross-punch south; only when all items have art
            seqs = []
            for anim in ANIM_FRAMES:
                if not all((it, anim) in sheets for it in items):
                    continue
                for d in ANIM_DIRS[anim]:
                    seqs.append((anim, d))
            for anim, d in seqs:
                if not all(direction_has_art(accepted_sheet, it, anim, d) for it in items):
                    continue
                ref_cell, ref_src, ref_body = reference_source(anim, d)
                ref_src_masks = {it: ref_src[it][..., 3] > 0 for it in items}
                ex = Extractor(items, model, ref_src_masks, None)
                ex.reset_sequence()
                prev_store = {it: None for it in items}
                first_frame = True
                for f in range(ANIM_FRAMES[anim]):
                    cell = (anim, d, f)
                    body = H.cell_of(accepted_sheet[BODY_ID][anim], anim, d, f)
                    dy, dx = body_centroid(body[..., 3] > 0)
                    ry, rx = body_centroid(ref_body[..., 3] > 0)
                    sy, sx = int(round(dy - ry)), int(round(dx - rx))
                    reg = {it: shift_mask(ref_src_masks[it], sy, sx) for it in items}
                    ex.set_reference(reg)
                    if cell == ref_cell:
                        # the accepted standing reference cell is given, not extracted
                        ex.seed(reg)
                        for it in items:
                            prev_store[it] = reg[it].copy()
                        continue
                    acc = {it: H.cell_of(accepted_sheet[it][anim], anim, d, f) for it in items}
                    src = acc if parts is None else H.apply_drift(acc, offsets, parts=parts,
                                                                  hair_shift=hair_shift)
                    img, _ = H.composite(items, src, None)
                    union = img[..., 3] > 0
                    bands = H.bands_for_body(body)
                    ex.bands = bands
                    ex.band_dist = {it: edt_outside(H.item_band(it, bands)) for it in items}
                    pred, stats = ex.frame(img, union)
                    m = score_frame(pred, acc, items)
                    ver = verify(items, pred, prev_store, reg, model, img[..., :3],
                                 stats["lost_to_z"], first_frame,
                                 cross_animation_ref=(anim != "walk"))
                    for it in items:
                        m[it]["z_lost"] = stats["lost_to_z"].get(it, 0)
                        m[it]["confidence"] = ver[it]["confidence"]
                        m[it]["vpass"] = ver[it]["pass"]
                        m[it]["vbad"] = ver[it]["bad"]
                        m[it]["signals"] = ver[it]["signals"]
                    results[variant][scope]["cells"].append({"cell": list(cell), "per_item": m})
                    for it in items:
                        prev_store[it] = pred[it].copy()
                    first_frame = False

    summary = aggregate(results)
    blob = {"reference_cell": {"animation": REF[0], "direction": REF[1], "frame": REF[2],
                               "rule": "colors from walk/south/0; the spatial reference is the standing "
                                       "cell of each scored direction (walk frame 0), registered by the "
                                       "body centroid; cross-punch uses walk/south/0 registered"},
            "parameters": P, "palette_sizes": {it: int(len(model.palettes[it])) for it in ITEM_IDS},
            "ref_area": ref_area, "scope_items": scopes, "scope_class": pair_class,
            "summary": summary}
    with open(os.path.join(OUT, "metrics.json"), "w", encoding="utf-8") as fh:
        json.dump(blob, fh, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else str(o))

    rows = []
    for variant, by_scope in results.items():
        for scope, payload in by_scope.items():
            for cell in payload["cells"]:
                for it, c in cell["per_item"].items():
                    wrong_share = c["wrong_item"] / c["pred"] if c["pred"] else 0.0
                    usable = not (wrong_share > 0.03 or c["pred"] == 0)
                    rows.append({
                        "variant": variant, "scope": scope, "class": payload["class"],
                        "cell": cell["cell"], "item": it, "usable": usable,
                        "vpass": c["vpass"], "confidence": c["confidence"],
                        "wrong_share": wrong_share, "prec_t": c["prec_t"],
                        "rec_t": c["rec_t"], "iou_t": c["iou_t"],
                        "strict_iou": c["iou"], "strict_recall": c["recall"],
                        "strict_precision": c["precision"], "pred": c["pred"],
                        **{f"s_{k}": (float(v) if isinstance(v, (int, float, np.floating)) else v)
                           for k, v in c["signals"].items()},
                    })
    with open(os.path.join(OUT, "verifier_rows.json"), "w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else str(o))
    write_tables(blob)
    print_summary(blob)
    return blob


def _reduce_scopes(payloads: list[dict], class_name: str, items: list[str]) -> dict:
    acc = defaultdict(lambda: defaultdict(float))
    n_cells = defaultdict(int)
    frames = 0
    assignment_errors = 0
    shape_only = 0
    v_bad = v_total = 0
    v_fp = v_fn = 0
    for payload in payloads:
        for cell in payload["cells"]:
            frames += 1
            for it in items:
                if it not in cell["per_item"]:
                    continue
                c = cell["per_item"][it]
                n_cells[it] += 1
                for k in ("pred", "visible", "correct", "wrong_item", "missed",
                          "hidden", "z_lost"):
                    acc[it][k] += c[k]
                for k in ("iou", "iou_t", "prec_t", "rec_t", "area_err",
                          "bd_mean", "bd_p95", "confidence"):
                    acc[it][k] += c[k]
                wrong_share = c["wrong_item"] / c["pred"] if c["pred"] else 0.0
                assignment_bad = wrong_share > 0.03 or c["pred"] == 0
                usable = not assignment_bad
                v_total += 1
                if not usable:
                    v_bad += 1
                    if c["vpass"]:
                        v_fp += 1
                    assignment_errors += 1
                elif not c["vpass"]:
                    v_fn += 1
                if usable and (c["recall"] < 0.95 or c["precision"] < 0.98):
                    shape_only += 1
    rows = {}
    for it in items:
        a = acc[it]
        n = n_cells[it]
        prec = a["correct"] / a["pred"] if a["pred"] else 1.0
        rec = a["correct"] / a["visible"] if a["visible"] else 1.0
        den = a["pred"] + a["visible"] - a["correct"]
        rows[it] = {
            "correct": a["correct"], "cells": n,
            "precision": prec, "recall": rec, "iou": a["correct"] / den if den else 1.0,
            "iou_t": a["iou_t"] / n if n else 0.0,
            "prec_t": a["prec_t"] / n if n else 0.0,
            "rec_t": a["rec_t"] / n if n else 0.0,
            "area_err": a["area_err"] / n if n else 0.0,
            "bd_mean": a["bd_mean"] / n if n else 0.0,
            "bd_p95": a["bd_p95"] / n if n else 0.0,
            "confidence": a["confidence"] / n if n else 0.0,
            "wrong_item": int(a["wrong_item"]), "missed": int(a["missed"]),
            "z_lost": int(a["z_lost"]), "pred": int(a["pred"]),
            "visible": int(a["visible"]), "hidden": int(a["hidden"]),
        }
    tp = sum(r["correct"] for r in rows.values())
    pred_n = sum(r["pred"] for r in rows.values())
    vis_n = sum(r["visible"] for r in rows.values())
    return {
        "class": class_name, "items": items, "frames": frames,
        "micro": {
            "precision": tp / pred_n if pred_n else 1.0,
            "recall": tp / vis_n if vis_n else 1.0,
            "iou": tp / (pred_n + vis_n - tp) if (pred_n + vis_n - tp) else 1.0,
            "iou_t": float(np.mean([r["iou_t"] for r in rows.values()])) if rows else 0.0,
            "prec_t": float(np.mean([r["prec_t"] for r in rows.values()])) if rows else 0.0,
            "rec_t": float(np.mean([r["rec_t"] for r in rows.values()])) if rows else 0.0,
        },
        "per_item": rows,
        "failures": {"assignment": assignment_errors, "shape_only": shape_only},
        "verifier": {"bad": v_bad, "total": v_total,
                     "false_pass": v_fp, "false_fail": v_fn},
    }


def aggregate(results):
    """Micro metrics per scope per variant, plus verifier rates, plus the
    disjoint-all and overlap-all aggregates over the pair scopes."""
    out = {}
    for variant, by_scope in results.items():
        out[variant] = {}
        for scope, payload in by_scope.items():
            out[variant][scope] = _reduce_scopes([payload], payload["class"], payload["items"])
        for cls in ("disjoint", "overlap"):
            members = [p for s, p in by_scope.items() if p["class"] == cls]
            items = sorted({it for p in members for it in p["items"]})
            out[variant][f"{cls}_all"] = _reduce_scopes(members, cls, items)
    return out


def pct(v):
    return f"{100 * v:.1f}%"


def write_tables(blob):
    lines = ["# Reference-guided extractor: generated tables", "",
             "Colors: accepted reference cell walk/south/0. Spatial reference: the standing cell of each "
             "scored direction (walk/<dir>/0), registered by the body centroid; cross-punch uses "
             "walk/south/0 registered the same way. The reference cell of each direction is excluded "
             "from scoring.", "",
             "## Rule C group and the same group without the held sword", "",
             "Exact accepted art. Strict metrics are pixel-exact against the accepted layers; "
             "`iou_t` is tolerance-1 IoU against the visible accepted pixels.", "",
             "| scope | item | P | R | IoU | IoU t1 | prec t1 | rec t1 | area err | bd p95 | z-lost px |",
             "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for scope in ("ruleC", "ruleC_no_sword"):
        d = blob["summary"]["exact"][scope]
        for it in d["items"]:
            r = d["per_item"][it]
            lines.append(f"| {scope} | {it} | {pct(r['precision'])} | {pct(r['recall'])} | "
                         f"{pct(r['iou'])} | {pct(r['iou_t'])} | {pct(r['prec_t'])} | "
                         f"{pct(r['rec_t'])} | {pct(r['area_err'])} | {r['bd_p95']:.2f} | {r['z_lost']} |")
    lines += ["", "## Every pair, exact art", "",
              "| pair | class | P | R | IoU | IoU t1 | prec t1 | rec t1 | area err | bd p95 | assignment err | shape-only |",
              "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for scope, payload in blob["summary"]["exact"].items():
        if scope in ("ruleC", "ruleC_no_sword") or "+" not in scope:
            continue
        m = payload["micro"]
        f = payload["failures"]
        lines.append(f"| {scope} | {payload['class']} | {pct(m['precision'])} | {pct(m['recall'])} | "
                     f"{pct(m['iou'])} | {pct(m['iou_t'])} | {pct(m['prec_t'])} | {pct(m['rec_t'])} | "
                     f"{pct(np.mean([r['area_err'] for r in payload['per_item'].values()]))} | "
                     f"{np.mean([r['bd_p95'] for r in payload['per_item'].values()]):.2f} | "
                     f"{f['assignment']} | {f['shape_only']} |")
    lines += ["", "## Variants", "",
              "Micro precision / recall / IoU, strict and tolerant, per scope and variant.", "",
              "| scope | variant | P | R | IoU | IoU t1 | prec t1 | rec t1 |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for scope in blob["summary"]["exact"]:
        for variant in blob["summary"]:
            m = blob["summary"][variant][scope]["micro"]
            lines.append(f"| {scope} | {variant} | {pct(m['precision'])} | {pct(m['recall'])} | "
                         f"{pct(m['iou'])} | {pct(m['iou_t'])} | {pct(m['prec_t'])} | {pct(m['rec_t'])} |")
    lines += ["", "## Verifier", "",
              "Ground truth for a bad extraction is an **assignment error**: the item claims more than 3% "
              "of its pixels from another item's visible layer, or the item comes out empty. A one-pixel "
              "shape difference is not an assignment error and is not counted here.", "",
              "| scope | variant | assignment errors | false pass | false fail |", "| --- | --- | ---: | ---: | ---: |"]
    for scope in blob["summary"]["exact"]:
        for variant in blob["summary"]:
            v = blob["summary"][variant][scope]["verifier"]
            lines.append(f"| {scope} | {variant} | {v['bad']}/{v['total']} | {v['false_pass']} | {v['false_fail']} |")
    lines += ["", "## Assignment error versus shape-only failure", "",
              "Assignment errors are wrong-item pixels. A shape-only failure is an item that is correctly "
              "assigned but whose silhouette differs from the accepted layer (strict recall or precision "
              "below 95/98% while the assignment is clean).", "",
              "| scope | variant | assignment errors | shape-only frames | strict IoU | tolerant IoU |",
              "| --- | --- | ---: | ---: | ---: | ---: |"]
    for scope in blob["summary"]["exact"]:
        for variant in blob["summary"]:
            d = blob["summary"][variant][scope]
            f = d["failures"]
            lines.append(f"| {scope} | {variant} | {f['assignment']} | {f['shape_only']} | "
                         f"{pct(d['micro']['iou'])} | {pct(d['micro']['iou_t'])} |")
    with open(os.path.join(OUT, "tables.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def print_summary(blob):
    for scope in ("ruleC", "ruleC_no_sword"):
        for variant in blob["summary"]:
            m = blob["summary"][variant][scope]["micro"]
            print(f"{scope:14s} {variant:9s} P={m['precision']:.3f} R={m['recall']:.3f} "
                  f"IoU={m['iou']:.3f} IoUt={m['iou_t']:.3f} "
                  f"Pt={m['prec_t']:.3f} Rt={m['rec_t']:.3f}")
    v = blob["summary"]["exact"]["ruleC"]["verifier"]
    print("verifier ruleC", v)


if __name__ == "__main__":
    run()
