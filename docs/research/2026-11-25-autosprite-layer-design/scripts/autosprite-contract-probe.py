#!/usr/bin/env python3
"""Measure AutoSprite's public export contract and project PixelDoll's S2 fixture into it.

Two modes, both read-only except for the optional prototype output:

  python autosprite-contract-probe.py sample --dir <folder with idle.png + idle.json ...>
  python autosprite-contract-probe.py fixture --fixture <app/public/fixtures/s2/fixture.json> \
      --out <scratch folder>

`sample` measures an AutoSprite free-library pack: cell size, frame count, soft-alpha share,
per-frame feet rows and the cross-clip feet spread that the documented one-pivot-per-sheet
metadata has to absorb.

`fixture` composes the fixture's first preset by z into one flat sheet per clip and authored
direction (an AutoSprite-style sheet), writes a matching atlas, and measures what the flat
contract loses: item pixels outside the body silhouette and the pixels a headwear swap changes.

Requires Python 3 and Pillow. No network, no account, no PixelLab calls.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from PIL import Image


def alpha_stats(image: Image.Image) -> dict:
    px = image.load()
    total = semi = opaque = 0
    for y in range(image.height):
        for x in range(image.width):
            a = px[x, y][3]
            if a:
                total += 1
                if a < 255:
                    semi += 1
                else:
                    opaque += 1
    return {"visible": total, "opaque": opaque, "semi": semi,
            "semi_pct": round(100 * semi / total, 2) if total else 0.0}


def frame_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    px = image.load()
    xs = []
    ys = []
    for y in range(image.height):
        for x in range(image.width):
            if px[x, y][3]:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def frame_key(key: object) -> tuple[int, object]:
    text = str(key)
    return (0, int(text)) if text.isdigit() else (1, text)


def sample(directory: str) -> None:
    print("AutoSprite free-library sample")
    rows = []
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".json"):
            continue
        stem = name[:-5]
        png = os.path.join(directory, stem + ".png")
        if not os.path.exists(png):
            continue
        atlas = json.load(open(os.path.join(directory, name)))
        image = Image.open(png).convert("RGBA")
        frames = atlas.get("frames", {})
        meta = atlas.get("meta", {})
        frame_size = meta.get("frame_size") or {}
        cell_w = frame_size.get("w") or image.width // max(1, int(len(frames) ** 0.5))
        cell_h = frame_size.get("h") or cell_w
        stats = alpha_stats(image)
        bottoms = []
        centers = []
        for key in sorted(frames, key=frame_key):
            f = frames[key]
            cell = image.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
            box = frame_bbox(cell)
            if box:
                bottoms.append(box[3] + 1)
                centers.append(round((box[0] + box[2] + 1) / 2, 1))
        pivot = meta.get("pivot")
        print(f"  {stem}: sheet {image.width}x{image.height}, cell {cell_w}x{cell_h}, "
              f"{len(frames)} frames, visible {stats['visible']}, "
              f"soft alpha {stats['semi']} ({stats['semi_pct']}%)")
        print(f"    frame-0 bottom {bottoms[0] if bottoms else None} of {cell_h}; "
              f"feet bottoms {min(bottoms) if bottoms else None}-{max(bottoms) if bottoms else None}; "
              f"frame-0 x center {centers[0] if centers else None}")
        print(f"    atlas meta.pivot: {pivot!r}; meta keys: {sorted(meta)}")
        rows.append((stem, cell_h, bottoms[0] if bottoms else None,
                     min(bottoms) if bottoms else None, max(bottoms) if bottoms else None))
    if rows:
        firsts = [r[2] for r in rows if r[2] is not None]
        all_bottoms = [b for r in rows for b in (r[3], r[4]) if b is not None]
        print(f"  cross-clip frame-0 feet spread: {max(firsts) - min(firsts)} px "
              f"({min(firsts)}-{max(firsts)})")
        print(f"  all-frame feet spread: {max(all_bottoms) - min(all_bottoms)} px")


def load_fixture(path: str) -> tuple[dict, str]:
    fixture = json.load(open(path))
    return fixture, os.path.dirname(path)


def fixture_mode(fixture_path: str, out_dir: str | None) -> None:
    fixture, root = load_fixture(fixture_path)
    cell = fixture["rig"]["cell"]["w"]
    dirs = [d["id"] for d in fixture["rig"]["directions"]]
    slots = fixture["slots"]
    items = {item["id"]: item for item in fixture["items"]}
    preset = fixture["presets"][0]["items"]
    slot_item = {slot["id"]: preset.get(slot["id"]) for slot in slots}
    print(f"PixelDoll fixture: cell {cell}, pivot {fixture['rig']['pivot']}, "
          f"directions {dirs}, preset {fixture['presets'][0]['name']}")

    def layer_image(item_id: str, anim: str) -> Image.Image | None:
        item = items[item_id]
        path = item["layers"][0]["sheets"].get(anim)
        if not path:
            return None
        return Image.open(os.path.join(root, path)).convert("RGBA")

    authored = {}
    cells = {anim["id"]: anim["cells"] for anim in fixture["rig"]["animations"]}
    for anim in fixture["rig"]["animations"]:
        body = layer_image(fixture["rig"]["baseItem"], anim["id"])
        if body is None:
            continue
        authored[anim["id"]] = body.height // cell

    item_totals = {}
    body_images = {anim: layer_image(fixture["rig"]["baseItem"], anim) for anim in authored}
    for slot in slots:
        item_id = slot_item.get(slot["id"])
        if not item_id:
            continue
        total = outside = 0
        for anim, rows in authored.items():
            image = layer_image(item_id, anim)
            body = body_images[anim]
            if image is None or body is None:
                continue
            for row in range(rows):
                for c in range(cells[anim]):
                    box = (c * cell, row * cell, (c + 1) * cell, (row + 1) * cell)
                    item_cell = image.crop(box).load()
                    body_cell = body.crop(box).load()
                    for y in range(cell):
                        for x in range(cell):
                            if item_cell[x, y][3]:
                                total += 1
                                if not body_cell[x, y][3]:
                                    outside += 1
        print(f"  item {item_id}: {total} opaque px in authored frames, "
              f"{outside} outside the body silhouette ({round(100 * outside / total, 1) if total else 0}%)")

    # Compose the preset into one strip per clip and authored direction.
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    for anim in fixture["rig"]["animations"]:
        aid = anim["id"]
        if aid not in authored:
            continue
        rows = authored[aid]
        for row in range(rows):
            canvas = Image.new("RGBA", (anim["cells"] * cell, cell), (0, 0, 0, 0))
            for c in range(anim["cells"]):
                frame = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                for slot in sorted(slots, key=lambda s: s["z"]):
                    item_id = slot_item.get(slot["id"])
                    if not item_id:
                        continue
                    image = layer_image(item_id, aid)
                    if image is None or row * cell >= image.height:
                        continue
                    frame = Image.alpha_composite(
                        frame, image.crop((c * cell, row * cell, (c + 1) * cell, (row + 1) * cell))
                    )
                canvas.paste(frame, (c * cell, 0))
            box = frame_bbox(canvas.crop((0, 0, cell, cell)))
            bottom = box[3] + 1 if box else None
            name = f"{aid}_{dirs[row]}"
            print(f"  sheet {name}: {anim['cells']} frames of {cell}px, frame-0 bottom {bottom}")
            if out_dir:
                sheet_path = os.path.join(out_dir, name + ".png")
                canvas.save(sheet_path)
                atlas = {
                    "frames": {
                        str(i): {"x": i * cell, "y": 0, "w": cell, "h": cell, "duration": 1}
                        for i in range(anim["cells"])
                    },
                    "animations": {name: [str(i) for i in range(anim["cells"])]},
                    "meta": {
                        "size": {"w": anim["cells"] * cell, "h": cell},
                        "frame_size": {"w": cell, "h": cell},
                        # AutoSprite documents meta.pivot as frame 0's feet.
                        "pivot": {"x": 0.5, "y": round((bottom or cell) / cell, 4)},
                        "fps": 10,
                    },
                }
                json.dump(atlas, open(os.path.join(out_dir, name + ".json"), "w"), indent=1)

    # A headwear swap changes every frame of every authored direction.
    if "helmet_steel" in items and "hat_wizard" in items:
        print("  helmet_steel to hat_wizard swap on walk (share of dressed pixels changed):")
        for row, direction in enumerate(dirs[:authored["walk"]]):
            for c in (0, fixture["rig"]["animations"][0]["cells"] - 1):
                a = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                b = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                for slot in sorted(slots, key=lambda s: s["z"]):
                    item_id = slot_item.get(slot["id"])
                    if not item_id:
                        continue
                    image = layer_image(item_id, "walk")
                    if image is None:
                        continue
                    swap = "hat_wizard" if item_id == "helmet_steel" else item_id
                    image2 = layer_image(swap, "walk")
                    if image2 is None:
                        image2 = image
                    box = (c * cell, row * cell, (c + 1) * cell, (row + 1) * cell)
                    a = Image.alpha_composite(a, image.crop(box))
                    b = Image.alpha_composite(b, image2.crop(box))
                pa, pb = a.load(), b.load()
                visible = changed = 0
                for y in range(cell):
                    for x in range(cell):
                        if pa[x, y][3]:
                            visible += 1
                        if pa[x, y] != pb[x, y]:
                            changed += 1
                print(f"    {direction} cell {c}: {visible} dressed px, "
                      f"{changed} changed ({round(100 * changed / visible, 1) if visible else 0}%)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)
    p_sample = sub.add_parser("sample")
    p_sample.add_argument("--dir", required=True)
    p_fixture = sub.add_parser("fixture")
    p_fixture.add_argument("--fixture", required=True)
    p_fixture.add_argument("--out")
    args = parser.parse_args()
    if args.mode == "sample":
        sample(args.dir)
    else:
        fixture_mode(args.fixture, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
