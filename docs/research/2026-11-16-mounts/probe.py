import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
FIXTURES = ROOT / "app/test/fixtures/bench"
OUTPUT = HERE / "evidence"
OUTPUT.mkdir(exist_ok=True)
FONT = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 14)


def distance(point, start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = dx * dx + dy * dy
    fraction = max(0, min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length)) if length else 0
    return math.hypot(point[0] - start[0] - fraction * dx, point[1] - start[1] - fraction * dy)


def skeleton(body, direction, frame):
    rig = body["rig"]
    source = next(entry for entry in rig["directions"] if entry["id"] == direction).get("mirrorOf", direction)
    if frame == "rest":
        points = rig["rest"][source]["keypoints"]
    else:
        animation = next(entry for entry in rig["animations"] if entry["id"] == "walk")
        track = animation["sources"][source]
        points = track.get("measured", track["keypoints"])[int(frame.split("/")[1])]
    size = rig["cell"]["w"]
    result = {point["label"]: (point["x"] * size, point["y"] * size) for point in points}
    if source != direction:
        result = {label: (size - 1 - point[0], point[1]) for label, point in result.items()}
    return result, source


def body_image(body, sheet, direction, frame):
    _, source = skeleton(body, direction, frame)
    size = body["rig"]["cell"]["w"]
    row, column = body["rows"].index(source), body["cols"].index(frame)
    image = sheet.crop((column * size, row * size, (column + 1) * size, (row + 1) * size))
    return ImageOps.mirror(image) if direction != source else image


def partition(size, points, source, nudge=0, radius_fraction=0.025):
    hip_y = sum(points[side + " HIP"][1] for side in ["LEFT", "RIGHT"]) / 2
    hip_width = math.dist(points["LEFT HIP"], points["RIGHT HIP"])
    radius = max(size * radius_fraction, hip_width * 0.4)
    far = Image.new("L", (size, size))
    ambiguous = Image.new("L", (size, size))
    for vertical in range(size):
        for horizontal in range(size):
            if vertical < hip_y:
                continue
            distances = {}
            for side in ["LEFT", "RIGHT"]:
                joints = [points[side + label] for label in [" HIP", " KNEE", " LEG"]]
                if side == "LEFT":
                    joints = [(point[0] + nudge, point[1]) for point in joints]
                distances[side] = min(distance((horizontal, vertical), joints[0], joints[1]), distance((horizontal, vertical), joints[1], joints[2]))
            if min(distances.values()) > radius:
                continue
            if max(distances.values()) <= radius and abs(distances["LEFT"] - distances["RIGHT"]) <= 1:
                ambiguous.putpixel((horizontal, vertical), 255)
            if source not in ["south", "north"] and distances["LEFT"] < distances["RIGHT"]:
                far.putpixel((horizontal, vertical), 255)
    return far, ambiguous


def subset(image, mask, keep=True, padding=0):
    output = image.copy()
    for vertical in range(image.height):
        for horizontal in range(image.width):
            mask_x, mask_y = horizontal - padding, vertical - padding
            selected = 0 <= mask_x < mask.width and 0 <= mask_y < mask.height and mask.getpixel((mask_x, mask_y)) != 0
            if selected != keep:
                output.putpixel((horizontal, vertical), (0, 0, 0, 0))
    return output


def selected_pixels(image, mask, padding=0):
    return sum(1 for vertical in range(image.height) for horizontal in range(image.width) if image.getpixel((horizontal, vertical))[3] and 0 <= horizontal - padding < mask.width and 0 <= vertical - padding < mask.height and mask.getpixel((horizontal - padding, vertical - padding)))


def mounted_scene(image, points, mask=None, width_factor=1):
    size = image.width
    seat = (size // 2, size // 2)
    hip = tuple(round(sum(points[side + " HIP"][axis] for side in ["LEFT", "RIGHT"]) / 2) for axis in [0, 1])
    offset = (seat[0] - hip[0], seat[1] - hip[1])
    scene = Image.new("RGBA", (size, size))
    rear = subset(image, mask) if mask else Image.new("RGBA", image.size)
    front = subset(image, mask, False) if mask else image
    scene.alpha_composite(rear, offset)
    draw = ImageDraw.Draw(scene)
    draw.ellipse((seat[0] - size * 0.28 * width_factor, seat[1] - size * 0.02, seat[0] + size * 0.28 * width_factor, seat[1] + size * 0.28), fill=(105, 127, 144, 255), outline=(190, 210, 220, 255))
    scene.alpha_composite(front, offset)
    return scene


def indistinguishable_source_check():
    common = Image.new("RGBA", (8, 8))
    front = Image.new("RGBA", (8, 8))
    ImageDraw.Draw(front).rectangle((2, 2, 5, 7), fill=(40, 40, 40, 255))
    hidden_first = common.copy()
    hidden_second = common.copy()
    hidden_first.putpixel((3, 5), (200, 0, 0, 255))
    hidden_second.putpixel((3, 5), (0, 0, 200, 255))
    first_flat = Image.alpha_composite(hidden_first, front)
    second_flat = Image.alpha_composite(hidden_second, front)
    assert first_flat.tobytes() == second_flat.tobytes()
    assert hidden_first.tobytes() != hidden_second.tobytes()
    return {"identical_flattened_inputs": True, "different_required_hidden_pixels": True}


def seated_oracle_check():
    gallery = Image.new("RGB", (560, 348), (26, 29, 34))
    draw = ImageDraw.Draw(gallery)
    for column, label in enumerate(["Seated source", "Tuned leg split", "Known leg labels"]):
        draw.text((column * 184 + 5, 5), label, font=FONT, fill=(235, 235, 235))
    results = []
    for row, direction in enumerate(["east", "south-east"]):
        size = 64
        points = {
            "LEFT HIP": (28, 28), "LEFT KNEE": (22, 34), "LEFT LEG": (24, 49),
            "RIGHT HIP": (32, 28), "RIGHT KNEE": (39, 35), "RIGHT LEG": (37, 51),
        }
        if direction == "south-east":
            points["LEFT KNEE"], points["LEFT LEG"] = (27, 34), (29, 47)
            points["RIGHT KNEE"], points["RIGHT LEG"] = (35, 36), (35, 51)
        image = Image.new("RGBA", (size, size))
        painter = ImageDraw.Draw(image)
        for side, color in [("LEFT", (140, 100, 170, 255)), ("RIGHT", (70, 170, 210, 255))]:
            painter.line([points[side + suffix] for suffix in [" HIP", " KNEE", " LEG"]], fill=color, width=5)
        painter.rectangle((26, 11, 34, 27), fill=(210, 180, 120, 255))
        painter.rectangle((27, 3, 34, 11), fill=(225, 190, 150, 255))
        oracle = Image.new("L", image.size)
        for vertical in range(size):
            for horizontal in range(size):
                if image.getpixel((horizontal, vertical)) == (140, 100, 170, 255):
                    oracle.putpixel((horizontal, vertical), 255)
        guessed, _ = partition(size, points, direction)
        mismatches = sum(1 for vertical in range(size) for horizontal in range(size) if image.getpixel((horizontal, vertical))[3] and guessed.getpixel((horizontal, vertical)) != oracle.getpixel((horizontal, vertical)))
        radius_sweep = []
        for fraction in [0.025, 0.04, 0.06, 0.08]:
            candidate, _ = partition(size, points, direction, radius_fraction=fraction)
            disagreement = sum(1 for vertical in range(size) for horizontal in range(size) if image.getpixel((horizontal, vertical))[3] and candidate.getpixel((horizontal, vertical)) != oracle.getpixel((horizontal, vertical)))
            radius_sweep.append({"minimum_radius_pixels": size * fraction, "pixel_label_disagreements": disagreement})
        split = mounted_scene(image, points, oracle)
        seat = (size // 2, size // 2)
        hip = tuple(round(sum(points[side + " HIP"][axis] for side in ["LEFT", "RIGHT"]) / 2) for axis in [0, 1])
        offset = (seat[0] - hip[0], seat[1] - hip[1])
        near_pixels_preserved = all(split.getpixel((horizontal + offset[0], vertical + offset[1])) == pixel for vertical in range(size) for horizontal in range(size) if (pixel := image.getpixel((horizontal, vertical))) == (70, 170, 210, 255))
        assert near_pixels_preserved
        source = image.resize((144, 144), Image.Resampling.NEAREST)
        tuned, _ = partition(size, points, direction, radius_fraction=0.04)
        guess_scene = mounted_scene(image, points, tuned).resize((144, 144), Image.Resampling.NEAREST)
        oracle_scene = split.resize((144, 144), Image.Resampling.NEAREST)
        for column, scene in enumerate([source, guess_scene, oracle_scene]):
            gallery.paste(scene, (column * 184 + 15, row * 158 + 38), scene)
        results.append({"direction": direction, "guessed_vs_known_part_pixel_mismatches": mismatches, "radius_sweep": radius_sweep, "all_known_near_leg_pixels_preserved": near_pixels_preserved})
    gallery.save(OUTPUT / "seated-oracle.png")
    return results


def main():
    rows = []
    bodies = {}
    layers = json.loads((HERE / "temp.local/layers.json").read_text())
    layer_index = {(entry["body"], entry["key"]): [] for entry in layers}
    for entry in layers:
        layer_index[(entry["body"], entry["key"])].append(entry)
    for name in ["A", "B", "C", "N"]:
        body = json.loads((FIXTURES / f"body{name}.json").read_text())
        sheet = Image.open(FIXTURES / f"body{name}.png").convert("RGBA")
        bodies[name] = (body, sheet)
        size = body["rig"]["cell"]["w"]
        for entry in body["rig"]["directions"]:
            direction = entry["id"]
            for frame in ["rest"] + [f"walk/{index}" for index in range(8)]:
                points, source = skeleton(body, direction, frame)
                image = body_image(body, sheet, direction, frame)
                mask, ambiguous = partition(size, points, source)
                rear, front = subset(image, mask), subset(image, mask, False)
                reconstructed = Image.alpha_composite(rear, front)
                assert reconstructed.tobytes() == image.tobytes()
                shifted, _ = partition(size, points, source, 1)
                flipped = sum(1 for vertical in range(size) for horizontal in range(size) if image.getpixel((horizontal, vertical))[3] and mask.getpixel((horizontal, vertical)) != shifted.getpixel((horizontal, vertical)))
                if source != direction:
                    source_points, _ = skeleton(body, source, frame)
                    source_mask, _ = partition(size, source_points, source)
                    assert ImageOps.mirror(source_mask).tobytes() == mask.tobytes()
                risks = {}
                key = f"rest/{source}/0" if frame == "rest" else f"walk/{source}/{frame.split('/')[1]}"
                for layer in layer_index.get((name, key), []):
                    pixels = Image.open(HERE / "temp.local" / layer["filename"]).convert("RGBA")
                    if source != direction:
                        pixels = ImageOps.mirror(pixels)
                    risks[layer["id"]] = selected_pixels(pixels, mask, layer["pad"])
                rows.append({"body": name, "direction": direction, "frame": frame, "size": size, "far_pixels": selected_pixels(image, mask), "ambiguous_pixels": selected_pixels(image, ambiguous), "changed_by_one_pixel_joint_shift": flipped, "item_pixels_affected_by_shared_mask": risks})
    body, sheet = bodies["B"]
    size = body["rig"]["cell"]["w"]
    directions = [entry["id"] for entry in body["rig"]["directions"]]
    gallery = Image.new("RGB", (560, len(directions) * 184 + 36), (26, 29, 34))
    draw = ImageDraw.Draw(gallery)
    for column, label in enumerate(["Unsplit rider", "Guessed leg split", "Both legs hidden"]):
        draw.text((column * 184 + 5, 5), label, font=FONT, fill=(235, 235, 235))
    for row, direction in enumerate(directions):
        points, source = skeleton(body, direction, "rest")
        image = body_image(body, sheet, direction, "rest")
        mask, _ = partition(size, points, source)
        hip_y = round(sum(points[side + " HIP"][1] for side in ["LEFT", "RIGHT"]) / 2)
        cutoff = Image.new("L", image.size)
        ImageDraw.Draw(cutoff).rectangle((0, hip_y, size, size), fill=255)
        scenes = [mounted_scene(image, points), mounted_scene(image, points, mask), mounted_scene(subset(image, cutoff, False), points)]
        for column, scene in enumerate(scenes):
            gallery.paste(scene.resize((160, 160), Image.Resampling.NEAREST), (column * 184 + 8, row * 184 + 51), scene.resize((160, 160), Image.Resampling.NEAREST))
        draw.text((8, row * 184 + 32), direction, font=FONT, fill=(220, 220, 220))
    gallery.save(OUTPUT / "eight-directions.png")
    body, sheet = bodies["B"]
    points, source = skeleton(body, "east", "rest")
    image = body_image(body, sheet, "east", "rest")
    mask, _ = partition(size, points, source)
    size_gallery = Image.new("RGB", (560, 210), (26, 29, 34))
    draw = ImageDraw.Draw(size_gallery)
    for column, factor in enumerate([0.55, 1, 1.45]):
        scene = mounted_scene(image, points, mask, factor)
        draw.text((column * 184 + 8, 8), ["Narrow fixture", "Medium fixture", "Wide fixture"][column], font=FONT, fill=(235, 235, 235))
        scene = scene.resize((160, 160), Image.Resampling.NEAREST)
        size_gallery.paste(scene, (column * 184 + 8, 36), scene)
    size_gallery.save(OUTPUT / "mount-widths.png")
    summary = {"frames_checked": len(rows), "bodies": 4, "cell_sizes": sorted(set(row["size"] for row in rows)), "identity_checks_passed": len(rows), "mirrored_frames_checked": sum(row["direction"] in ["west", "south-west", "north-west"] for row in rows), "frames_with_ambiguous_body_pixels": sum(row["ambiguous_pixels"] > 0 for row in rows), "frames_changed_by_one_pixel_joint_shift": sum(row["changed_by_one_pixel_joint_shift"] > 0 for row in rows), "item_cells_with_mask_intersection": sum(count > 0 for row in rows for count in row["item_pixels_affected_by_shared_mask"].values()), "hidden_pixel_counterexample": indistinguishable_source_check(), "seated_oracle": seated_oracle_check()}
    (OUTPUT / "results.json").write_text(json.dumps({"summary": summary, "frames": rows}, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
