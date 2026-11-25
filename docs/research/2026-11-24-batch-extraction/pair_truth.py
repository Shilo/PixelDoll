"""Ground truth and pre-generation signals for every S2 item pair.

Reads only app/public/fixtures/s2 (no app changes, no network, no paid calls).
Outputs pair_truth.json plus a printed table.

Ground truth is the accepted item masks: for every pair, direction and frame
where both items exist, count the pixels both masks claim. A pair is unsafe
for a shared-body batch if that count is above zero in any cell, because those
pixels exist once in the composite and the lower item loses them.

Pre-generation signals use only walk frame 0 of each direction as a stated
proxy for a standing cell (the fixture has none), plus the body mask, slots
and draw order from fixture.json. The union of all frames is computed as an
oracle to show how much the standing proxy misses.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parents[3]
FIX = ROOT / "app" / "public" / "fixtures" / "s2"
CELL = 64
DIRS = ["south", "east", "north"]
MATERIAL_PX = 4  # any 4+ shared px is called material pixel loss

manifest = json.loads((FIX / "fixture.json").read_text(encoding="utf-8"))
slots = {s["id"]: s for s in manifest["slots"]}
items = {i["id"]: i for i in manifest["items"]}
ITEM_IDS = [i["id"] for i in manifest["items"] if i["id"] != "base"]
BODY = "base"

# Draw order inside the body (higher z draws over lower z). Same-slot pairs keep
# equal z; their relative order is undefined because the app never wears both.
Z = {i["id"]: i["layers"][0]["z"] for i in manifest["items"]}


def load_cells(sheets: dict[str, str], coverage: list[str] | None) -> dict[tuple[str, str, int], np.ndarray]:
    """Mask per (animation, direction, frame). Missing sheets or uncovered cells are absent."""
    cells: dict[tuple[str, str, int], np.ndarray] = {}
    for anim, rel in sheets.items():
        sheet = np.asarray(Image.open(FIX / rel).convert("RGBA"))
        cols = sheet.shape[1] // CELL
        for d, dir_id in enumerate(DIRS):
            row = sheet[d * CELL : (d + 1) * CELL]
            for f in range(cols):
                if coverage is not None and f"{anim}/{dir_id}/{f}" not in coverage:
                    continue
                cell = row[:, f * CELL : (f + 1) * CELL]
                cells[(anim, dir_id, f)] = cell[:, :, 3] > 0
    return cells


def cell_of(cells, key: tuple[str, str, int]) -> np.ndarray:
    return cells.get(key, np.zeros((CELL, CELL), dtype=bool))


def min_dist(a: np.ndarray, b: np.ndarray) -> float:
    """Euclidean distance between masks in px; 0 when they share a pixel."""
    if not a.any() or not b.any():
        return float("nan")
    if (a & b).any():
        return 0.0
    d = distance_transform_edt(~a)
    return float(d[b].min())


def bbox_gap(a: np.ndarray, b: np.ndarray) -> int:
    """Chebyshev gap between bounding boxes, 0 when boxes touch or overlap."""
    ya, xa = np.where(a)
    yb, xb = np.where(b)
    if len(ya) == 0 or len(yb) == 0:
        return -1
    dy = max(0, int(max(ya.min(), yb.min()) - min(ya.max(), yb.max()) - 1))
    dx = max(0, int(max(xa.min(), xb.min()) - min(xa.max(), xb.max()) - 1))
    return int(max(dx, dy))


def union_of(cells, item: str) -> dict[str, np.ndarray]:
    out = {}
    for d in DIRS:
        acc = np.zeros((CELL, CELL), dtype=bool)
        for (anim, dir_id, _f), m in cells[item].items():
            if dir_id == d:
                acc |= m
        out[d] = acc
    return out


def body_bands(mask: np.ndarray) -> dict[str, int]:
    """Head/torso/leg boundaries from the body mask width profile.

    The fixture has no keypoints, so this is the stated substitute for bandOf.
    Neck is the narrowest body row in the upper-middle band, hip the narrowest
    row in the lower-middle band, using fractions of the body bbox height.
    """
    ys, _ = np.where(mask)
    top, bottom = int(ys.min()), int(ys.max())
    h = bottom - top + 1
    width = mask.sum(axis=1)
    neck_lo, neck_hi = top + int(0.25 * h), top + int(0.55 * h)
    hip_lo, hip_hi = top + int(0.60 * h), top + int(0.75 * h)
    neck = min(range(neck_lo, neck_hi + 1), key=lambda y: (int(width[y]), y))
    hip = min(range(hip_lo, hip_hi + 1), key=lambda y: (int(width[y]), -y))
    return dict(top=top, neck=int(neck), hip=int(hip), bottom=bottom)


BAND_SLOT = {
    "hair": "head", "head": "head", "face_acc": "head", "neck": "head",
    "torso_inner": "torso", "torso_outer": "torso", "shoulders": "torso",
    "back": "torso", "waist": "torso", "arms": "torso", "main_hand": "torso",
    "off_hand": "torso", "underwear": "torso",
    "legs": "legs", "feet": "legs", "body": "all",
}


body_cells = load_cells(items[BODY]["layers"][0]["sheets"], items[BODY].get("coverage"))
body_union = union_of({BODY: body_cells}, BODY)
# Body geometry per direction from the walk-frame-0 proxy, as the app would see it standing.
body_proxy = {d: cell_of(body_cells, ("walk", d, 0)) for d in DIRS}
body_bbox = {}
bands = {}
for d, m in body_proxy.items():
    ys, xs = np.where(m)
    body_bbox[d] = dict(top=int(ys.min()), bottom=int(ys.max()), left=int(xs.min()), right=int(xs.max()),
                        h=int(ys.max() - ys.min() + 1), w=int(xs.max() - xs.min() + 1))
    bands[d] = body_bands(m)

BAND_RANGE = {  # y span per band, inclusive
    "head": lambda b: (b["top"], b["neck"]),
    "torso": lambda b: (b["neck"] + 1, b["hip"]),
    "legs": lambda b: (b["hip"] + 1, b["bottom"]),
    "all": lambda b: (b["top"], b["bottom"]),
}

data = {}
for iid in ITEM_IDS:
    item = items[iid]
    data[iid] = dict(
        slot=item["slot"],
        z=Z[iid],
        cells=load_cells(item["layers"][0]["sheets"], item.get("coverage")),
    )

# Standing proxy: walk frame 0. Union oracle: every stored frame per direction.
proxy = {iid: {d: cell_of(data[iid]["cells"], ("walk", d, 0)) for d in DIRS} for iid in ITEM_IDS}
walk_frames = {
    iid: {f: {d: cell_of(data[iid]["cells"], ("walk", d, f)) for d in DIRS} for f in range(8)}
    for iid in ITEM_IDS
}
unions = {iid: union_of({iid: data[iid]["cells"]}, iid) for iid in ITEM_IDS}

pairs = []
for n, a in enumerate(ITEM_IDS):
    for b in ITEM_IDS[n + 1 :]:
        cells_ab = set(data[a]["cells"]) & set(data[b]["cells"])
        shared_cells = sorted(cells_ab)
        overlaps = []  # (key, px, share_a, share_b)
        for key in shared_cells:
            ma, mb = data[a]["cells"][key], data[b]["cells"][key]
            px = int((ma & mb).sum())
            if px:
                overlaps.append(dict(key="/".join(map(str, key)), px=px,
                                     share_a=px / int(ma.sum()) if ma.sum() else 0.0,
                                     share_b=px / int(mb.sum()) if mb.sum() else 0.0))
        any_cells = len(overlaps)
        material_cells = sum(1 for o in overlaps if o["px"] >= MATERIAL_PX)
        max_px = max((o["px"] for o in overlaps), default=0)
        lower = a if Z[a] <= Z[b] else b
        lower_share = max((o["share_a"] if lower == a else o["share_b"] for o in overlaps), default=0.0)

        p_overlap = {d: int((proxy[a][d] & proxy[b][d]).sum()) for d in DIRS}
        p_dist = {d: round(min_dist(proxy[a][d], proxy[b][d]), 2) for d in DIRS}
        p_gap = {d: bbox_gap(proxy[a][d], proxy[b][d]) for d in DIRS}
        u_overlap = {d: int((unions[a][d] & unions[b][d]).sum()) for d in DIRS}
        u_dist = {d: round(min_dist(unions[a][d], unions[b][d]), 2) for d in DIRS}

        # Band signal: A's standing mask inside B's body-derived slot band and vice versa.
        band_a, band_b = BAND_SLOT[data[a]["slot"]], BAND_SLOT[data[b]["slot"]]
        intrusions = {}
        for d in DIRS:
            bb = bands[d]
            ya, yb = BAND_RANGE[band_a](bb), BAND_RANGE[band_b](bb)
            ma, mb = proxy[a][d], proxy[b][d]
            in_b = int(ma[yb[0] : yb[1] + 1].sum())  # A pixels inside B's band
            in_a = int(mb[ya[0] : ya[1] + 1].sum())
            intrusions[d] = dict(a_in_b=in_b, b_in_a=in_a, a_px=int(ma.sum()), b_px=int(mb.sum()))

        # Per-direction ground truth.
        per_dir = {}
        for d in DIRS:
            keys = [k for k in shared_cells if k[1] == d]
            mat = 0
            mx = 0
            for key in keys:
                px = int((data[a]["cells"][key] & data[b]["cells"][key]).sum())
                if px >= MATERIAL_PX:
                    mat += 1
                mx = max(mx, px)
            per_dir[d] = dict(cells=len(keys), material_cells=mat, max_px=mx)

        # Per-frame standing-proxy stability: every walk frame as if it were the standing cell.
        proxy_frames = []
        for f in range(8):
            pf_ov = {d: int((walk_frames[a][f][d] & walk_frames[b][f][d]).sum()) for d in DIRS}
            pf_d = {}
            pf_g = {}
            for d in DIRS:
                v = min_dist(walk_frames[a][f][d], walk_frames[b][f][d])
                pf_d[d] = None if v != v else round(v, 2)
                pf_g[d] = bbox_gap(walk_frames[a][f][d], walk_frames[b][f][d])
            proxy_frames.append(dict(overlap=pf_ov, min_dist=pf_d, bbox_gap=pf_g))

        # Slot band signal: the item's own standing-proxy y-range compared with the other's.
        def yrange(m):
            ys, _ = np.where(m)
            return None if len(ys) == 0 else (int(ys.min()), int(ys.max()))

        pyr = {iid: {d: yrange(proxy[iid][d]) for d in DIRS} for iid in (a, b)}
        band_gap = {}
        for d in DIRS:
            ra, rb = pyr[a][d], pyr[b][d]
            band_gap[d] = (
                None if ra is None or rb is None else int(max(0, max(ra[0], rb[0]) - min(ra[1], rb[1]) - 1))
            )

        pairs.append(dict(
            a=a, b=b, slot_a=data[a]["slot"], slot_b=data[b]["slot"],
            same_slot=data[a]["slot"] == data[b]["slot"],
            lower=lower,
            shared_cells=len(shared_cells),
            any_overlap_cells=any_cells,
            material_overlap_cells=material_cells,
            max_overlap_px=max_px,
            max_lower_share=round(lower_share, 4),
            overlap_cells=[o for o in overlaps],
            proxy_overlap=p_overlap,
            proxy_min_dist=p_dist,
            proxy_bbox_gap=p_gap,
            proxy_frames=proxy_frames,
            proxy_band_gap=band_gap,
            band_zones=dict(a=band_a, b=band_b, intrusions=intrusions),
            per_dir=per_dir,
            complete=all(bool(proxy[a][d].any()) and bool(proxy[b][d].any()) for d in DIRS),
            union_overlap=u_overlap,
            union_min_dist=u_dist,
        ))

out = dict(
    material_px=MATERIAL_PX,
    cell=CELL,
    band_split=bands,
    body_bbox=body_bbox,
    item_slots={iid: data[iid]["slot"] for iid in ITEM_IDS},
    pairs=pairs,
)
(Path(__file__).parent / "pair_truth.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


def verdict(p):
    if p["material_overlap_cells"]:
        return f"UNSAFE material {p['material_overlap_cells']}/{p['shared_cells']} cells, max {p['max_overlap_px']} px"
    if p["any_overlap_cells"]:
        return f"tiny {p['any_overlap_cells']}/{p['shared_cells']} cells, max {p['max_overlap_px']} px"
    return "clean"


print(f"{'pair':34} {'slots':22} {'truth':46} {'stand ov':10} {'stand d':9} {'union ov':9} {'gap'}")
for p in pairs:
    name = f"{p['a']} + {p['b']}"
    slots_s = f"{p['slot_a']}/{p['slot_b']}"
    po = "/".join(str(p["proxy_overlap"][d]) for d in DIRS)
    pd = "/".join(str(p["proxy_min_dist"][d]) for d in DIRS)
    uo = "/".join(str(p["union_overlap"][d]) for d in DIRS)
    gap = "/".join(str(p["proxy_bbox_gap"][d]) for d in DIRS)
    print(f"{name:34} {slots_s:22} {verdict(p):46} {po:10} {pd:9} {uo:9} {gap}")
print("\nbody bbox:", body_bbox)
