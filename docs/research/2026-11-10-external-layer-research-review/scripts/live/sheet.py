# Contact sheet per call: rows = [body rest, raw dressed output, extracted layer], columns = views. Nearest-neighbor x4.
import json, os, sys
from PIL import Image, ImageDraw
OUT = sys.argv[1]
S = 4
def checker(w, h):
    im = Image.new('RGBA', (w, h), (60, 60, 70, 255))
    d = ImageDraw.Draw(im)
    for y in range(0, h, 16):
        for x in range(0, w, 16):
            if (x // 16 + y // 16) % 2: d.rectangle([x, y, x + 15, y + 15], fill=(80, 80, 92, 255))
    return im
for cid in sorted(os.listdir(os.path.join(OUT, 'calls'))):
    d = os.path.join(OUT, 'calls', cid)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    body = meta['job']['body']
    dirs = meta['spec']['dirs']
    tiles = []
    for v in dirs:
        col = [os.path.join(OUT, f'body{body}_rest_{v}.png')]
        raw = [r for r in meta['raws'] if r['cell'] and r['cell'].split('/')[1] == v]
        col.append(os.path.join(d, f"raw_c{raw[0]['call']}_{raw[0]['i']}_{v}.png") if raw else None)
        col.append(os.path.join(d, f'layer_{v}.png'))
        tiles.append(col)
    C = 80 * S
    sheet = Image.new('RGBA', (len(dirs) * (C + 8), 3 * (C + 8)), (30, 30, 30, 255))
    for i, col in enumerate(tiles):
        for j, p in enumerate(col):
            bg = checker(C, C)
            if p and os.path.exists(p):
                im = Image.open(p).convert('RGBA').resize((C, C), Image.NEAREST)
                bg.alpha_composite(im)
            sheet.paste(bg, (i * (C + 8), j * (C + 8)))
    sheet.save(os.path.join(OUT, 'sheets', f'{cid}.png'))
print('ok')
