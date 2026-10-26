# Contact sheet: rows of PNG frames (x4, nearest) with an optional keypoint overlay JSON per row.
# Usage: python -I x27/sheet.py out.png "label|glob[|kps.json]" ...
import sys, glob, json
from PIL import Image, ImageDraw
S = 4
rows = []
for spec in sys.argv[2:]:
    p = spec.split('|'); files = sorted(glob.glob(p[1]), key=lambda f: int(f.rsplit('.', 2)[-2]) if f.rsplit('.', 2)[-2].isdigit() else f)
    kps = json.load(open(p[2])) if len(p) > 2 else None
    rows.append((p[0], [Image.open(f).convert('RGBA') for f in files], kps))
W = max(len(r[1]) for r in rows) * (80 * S + 6) + 6
H = sum(80 * S + 26 for _ in rows) + 6
out = Image.new('RGB', (W, H), (30, 31, 35)); d = ImageDraw.Draw(out); y = 6
B = [('NOSE','NECK'),('NECK','RIGHT SHOULDER'),('RIGHT SHOULDER','RIGHT ELBOW'),('RIGHT ELBOW','RIGHT ARM'),('NECK','LEFT SHOULDER'),('LEFT SHOULDER','LEFT ELBOW'),('LEFT ELBOW','LEFT ARM'),('NECK','RIGHT HIP'),('RIGHT HIP','RIGHT KNEE'),('RIGHT KNEE','RIGHT LEG'),('NECK','LEFT HIP'),('LEFT HIP','LEFT KNEE'),('LEFT KNEE','LEFT LEG')]
for label, fr, kps in rows:
    d.text((6, y), label, fill=(220, 210, 190)); y += 18; x = 6
    for i, im in enumerate(fr):
        bg = Image.new('RGBA', im.size, (52, 54, 60, 255)); bg.alpha_composite(im)
        big = bg.resize((im.width * S, im.height * S), Image.NEAREST); out.paste(big.convert('RGB'), (x, y))
        if kps and i < len(kps):
            k = {q['label']: (x + q['x'] * im.width * S, y + q['y'] * im.height * S) for q in kps[i]}
            for a, b in B:
                c = (255, 90, 90) if 'RIGHT' in a + b and 'LEFT' not in a + b else (90, 150, 255) if 'LEFT' in a + b else (240, 220, 120)
                d.line([k[a], k[b]], fill=c, width=2)
        x += 80 * S + 6
    y += 80 * S + 8
out.save(sys.argv[1]); print(sys.argv[1], out.size)
