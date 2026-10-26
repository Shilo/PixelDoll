# Stack strip PNGs vertically with labels, scaled. Usage: python -I x27/stack.py out.png scale file...
import sys, os
from PIL import Image, ImageDraw
sc = float(sys.argv[2]); ims = [(os.path.basename(f), Image.open(f).convert('RGB')) for f in sys.argv[3:]]
ims = [(n, i.resize((int(i.width * sc), int(i.height * sc)), Image.LANCZOS)) for n, i in ims]
W = max(i.width for _, i in ims); H = sum(i.height + 16 for _, i in ims)
o = Image.new('RGB', (W, H), (20, 20, 22)); d = ImageDraw.Draw(o); y = 0
for n, i in ims: d.text((4, y + 2), n, fill=(230, 220, 200)); o.paste(i, (0, y + 16)); y += i.height + 16
o.save(sys.argv[1]); print(o.size)
