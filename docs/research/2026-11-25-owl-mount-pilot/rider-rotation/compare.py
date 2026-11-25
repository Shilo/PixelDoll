"""Compare the untouched rider PNGs on the same mount and contact positions."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
BACKGROUND = "#292630"


def png(directory, filename):
    return Image.open(directory / filename).convert("RGBA")


def mounted(body, rider, offset, foreground=None):
    result = png(ROOT.parent, body)
    result.alpha_composite(png(ROOT, rider), dest=offset)
    if foreground:
        result.alpha_composite(png(ROOT.parent, foreground))
    return result


east = "east-mount-finished-0.png"
south = "south-mount-back.png"
foreground = "south-mount-front.png"
cases = [
    ("East / V3 rotation", east, "rider-only-rotation-east.png", (23, 12), None),
    ("East / joint guide", east, "rider-only-east-0.png", (24, 10), None),
    ("South / first joint guide", south, "rider-only-south-0.png", (24, -3), foreground),
    ("South / wider joint guide", south, "rider-only-south-wide-0.png", (24, -3), foreground),
]
panel = Image.new("RGB", (300, 280), BACKGROUND)
draw = ImageDraw.Draw(panel)
for index, (label, body, rider, offset, front) in enumerate(cases):
    x, y = 150 * (index % 2), 140 * (index // 2)
    image = mounted(body, rider, offset, front)
    panel.paste(image, (x + 10, y + 13), image)
    draw.text((x + 6, y + 3), label, fill="white")

panel.resize((900, 840), Image.Resampling.NEAREST).save(ROOT / "mounted-comparison.png")

# An approximate occlusion check. The rows sampled contain the lower legs and
# feet in these specific poses. Count pixels hidden by the actual foreground.
front = png(ROOT.parent, foreground)
for label, _, name, (dx, dy), _ in cases[2:]:
    rider = png(ROOT, name)
    pixels = [
        (x, y)
        for y in range(60, rider.height)
        for x in range(rider.width)
        if rider.getpixel((x, y))[3]
    ]
    visible = sum(front.getpixel((x + dx, y + dy))[3] == 0 for x, y in pixels)
    print(f"{label}: {visible}/{len(pixels)} opaque pixels below row 59 clear the foreground")
