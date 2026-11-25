"""Prepare reviewable rider mattes and a candidate seat track from the East pilot."""
from collections import Counter
from pathlib import Path
import json

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
MOUNT = "east-mount-finished-0.png"
MOTION = ("east-mount-trot", "east-combined-trot")


def load(name):
    return Image.open(ROOT / name).convert("RGBA")


def changed(left, right):
    return sum(
        a != b and bool(a[3] or b[3])
        for a, b in zip(left.get_flattened_data(), right.get_flattened_data())
    )


def cut_rider(source, mount, last_top_row, spans, output):
    result = Image.new("RGBA", source.size)
    for y in range(source.height):
        if y < last_top_row:
            left, right = 48, 77
        elif y < last_top_row + len(spans):
            left, right = spans[y - last_top_row]
        else:
            continue
        for x in range(left, right + 1):
            pixel = source.getpixel((x, y))
            if pixel[3] and pixel != mount.getpixel((x, y)):
                result.putpixel((x, y), pixel)
    result.save(ROOT / output)
    return result


mount = load(MOUNT)
rider_a = cut_rider(
    load("east-combined-0.png"), mount, 57,
    [
        (58, 71), (58, 72), (58, 73), (57, 73), (57, 72), (56, 71),
        (56, 70), (56, 70), (56, 70), (56, 70), (57, 71), (57, 72),
        (59, 72), (61, 72), (64, 71), (63, 71), (63, 70), (61, 69),
        (61, 69), (61, 68), (60, 66), (60, 65), (60, 65), (58, 64),
        (58, 64), (58, 64), (59, 64), (59, 64), (59, 63), (59, 63),
        (60, 64), (60, 60),
    ], "east-rider-a.png",
)
rider_b = cut_rider(
    load("east-combined-b-locked-0.png"), mount, 58,
    [
        (53, 69), (54, 69), (54, 70), (54, 71), (53, 71), (53, 71),
        (54, 71), (54, 72), (54, 71), (54, 71), (54, 72), (55, 72),
        (55, 73), (57, 74), (59, 74), (64, 74), (65, 74), (64, 74),
        (64, 74), (64, 74), (63, 72), (63, 73), (64, 70), (62, 69),
        (62, 69), (62, 68), (61, 68), (60, 69), (60, 70), (61, 71),
        (62, 70), (62, 71), (65, 72), (65, 72), (66, 70),
    ], "east-rider-b.png",
)

# A small hand-authored boot overlay. This tests draw order and a live outfit change
# using the same lower-leg pixels, without claiming automatic item fitting.
boot = Image.new("RGBA", rider_a.size)
for y in range(75, 89):
    for x in range(57, 70):
        r, g, b, a = rider_a.getpixel((x, y))
        if a:
            lightness = (r + g + b) // 3
            boot.putpixel((x, y), (lightness * 2 // 5, lightness * 3 // 5, lightness * 4 // 5, a))
boot.save(ROOT / "east-boot-overlay.png")

# Match the rigid shift of the visible brown saddle seat. An authored contact track
# can correct any frame whose outline deforms. Ground stays on the original canvas.
patch = [
    (x, y, mount.getpixel((x, y)))
    for y in range(58, 72)
    for x in range(51, 78)
    if (c := mount.getpixel((x, y)))[3] > 200 and c[0] > c[2] + 30
]
track = []
for i in range(1, 9):
    frame = load(f"{MOTION[0]}-{i}.png")
    def score(dx, dy):
        return sum(
            sum(abs(a - b) for a, b in zip(color, frame.getpixel((x + dx, y + dy))))
            for x, y, color in patch
        )
    dy, dx = min(
        ((dy, dx) for dy in range(-6, 7) for dx in range(-6, 7)),
        key=lambda shift: (score(shift[1], shift[0]), abs(shift[0]) + abs(shift[1])),
    )
    track.append({"image": f"{MOTION[0]}-{i}.png", "seat": [63 + dx, 65 + dy], "ms": 120})

measurements = {
    "facing": "east",
    "mountGround": [64, 112],
    "riderContacts": {"a": [63, 65], "b": [62, 67]},
    "track": track,
    "animations": {},
}
for motion, reference in zip(MOTION, (MOUNT, "east-combined-0.png")):
    frames = [load(f"{motion}-{i}.png") for i in range(9)]
    assert changed(frames[0], load(reference)) == 0
    assert all(changed(a, b) for a, b in zip(frames, frames[1:]))
    measurements["animations"][motion] = {
        "returnedFrames": len(frames),
        "echoFramesDropped": 1,
        "paintedBottomRows": [frame.getbbox()[3] - 1 for frame in frames[1:]],
        "alpha": dict(sorted(Counter(a for frame in frames[1:] for *_, a in frame.get_flattened_data()).items())),
        "lastToFirstChangedVisiblePixels": changed(frames[-1], frames[1]),
    }

(ROOT / "east-measurements.json").write_text(json.dumps(measurements, indent=2) + "\n")
print("East saddle track:", [frame["seat"] for frame in track])

# South needs the mount's ears and face in front of the rider. Keep those exact
# pixels from the riderless source and hand-trace the visible rider from the edit.
south_mount = load("south-mount-cell.png")
south_edit = load("axial-rider-open-0.png")
foreground_mask = Image.new("1", south_mount.size)
ImageDraw.Draw(foreground_mask).polygon(
    [(47,47),(55,45),(60,50),(69,50),(75,45),(81,46),(83,59),
     (82,71),(77,78),(70,81),(55,81),(49,76),(46,68)], fill=1
)
south_back = south_mount.copy()
south_front = Image.new("RGBA", south_mount.size)
for y in range(south_mount.height):
    for x in range(south_mount.width):
        if foreground_mask.getpixel((x, y)):
            south_front.putpixel((x, y), south_mount.getpixel((x, y)))
            south_back.putpixel((x, y), (0, 0, 0, 0))
south_back.save(ROOT / "south-mount-back.png")
south_front.save(ROOT / "south-mount-front.png")
assert Image.alpha_composite(south_back, south_front).tobytes() == south_mount.tobytes()

rider_mask = Image.new("1", south_edit.size)
ImageDraw.Draw(rider_mask).polygon(
    [(46,11),(80,11),(81,35),(80,43),(82,49),(79,55),(85,64),
     (90,76),(84,79),(79,74),(75,67),(70,58),(56,58),(51,66),
     (45,76),(38,78),(39,72),(44,62),(47,54),(45,49),(45,38)], fill=1
)
south_rider = Image.new("RGBA", south_edit.size)
for y in range(79):
    for x in range(38, 91):
        if rider_mask.getpixel((x, y)) and not foreground_mask.getpixel((x, y)):
            pixel = south_edit.getpixel((x, y))
            if pixel != south_mount.getpixel((x, y)):
                south_rider.putpixel((x, y), pixel)
# Extend the concealed waist under the foreground to exercise the actual draw order.
hidden_waist = Image.new("1", south_mount.size)
ImageDraw.Draw(hidden_waist).polygon(
    [(53,45),(73,45),(74,54),(69,59),(57,59),(52,54)], fill=1
)
for y in range(45, 60):
    for x in range(52, 75):
        if hidden_waist.getpixel((x, y)) and south_front.getpixel((x, y))[3] == 255:
            south_rider.putpixel((x, y), (65, 60, 59, 255))
south_rider.save(ROOT / "south-rider-b.png")
