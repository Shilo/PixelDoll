# Rounds 8-9: GIFs (per-frame timing) and one self-contained page from <dir>/spec.json (x27/gallery.mts, x28/gallery.mts).
# Usage (spikes/api): python -I x27/gallery.py out/x27/gallery   (or out/x28/gallery)
import json, os, sys, html, base64, io
from PIL import Image

G = sys.argv[1]
J = json.load(open(os.path.join(G, 'spec.json'), encoding='utf-8'))
S, BOX = 4, 80


def gif(frames, ms):
    out = []
    for f in frames:
        im = Image.open(f).convert('RGBA')
        bg = Image.new('RGBA', (BOX, BOX), (44, 46, 52, 255))
        bg.alpha_composite(im, ((BOX - im.width) // 2, (BOX - im.height) // 2))
        out.append(bg.convert('RGB').resize((BOX * S, BOX * S), Image.NEAREST).quantize(colors=255, method=Image.Quantize.MEDIANCUT))
    b = io.BytesIO()
    out[0].save(b, 'GIF', save_all=True, append_images=out[1:], duration=ms, loop=0, disposal=2)
    return base64.b64encode(b.getvalue()).decode()


css = """
:root{--bg:#16171a;--fg:#e8e6e3;--mut:#9a978f;--card:#202226;--line:#33363b;--acc:#c9a26b}
@media (prefers-color-scheme: light){:root:not([data-theme=dark]){--bg:#f5f3ef;--fg:#1d1c1a;--mut:#5f5b54;--card:#fff;--line:#ddd8cf;--acc:#8a6a3b}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1280px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 2px;border-top:1px solid var(--line);padding-top:16px}h3{font-size:16px;margin:22px 0 2px}
p{margin:4px 0;color:var(--mut)}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px;flex:0 1 220px;min-width:140px}
figure img{width:100%;image-rendering:pixelated;display:block;border-radius:6px}
figcaption{font-weight:600;margin-top:6px;text-align:center;font-size:14px}
details{margin-top:8px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px}
summary{cursor:pointer;color:var(--acc);font-weight:600}li{margin:2px 0}
"""
out = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
       f"<title>{html.escape(J.get('title', 'Mocap Move Library'))}</title><style>" + css + '</style></head><body><main>',
       f"<h1>{html.escape(J.get('h1', 'PixelDoll round 8: mocap moves'))}</h1>",
       f"<p>{html.escape(J.get('intro', 'Same bare body, same seed. One-shot moves start on the rest frame (held). Blind rows hide which is which until revealed.'))}</p>"]
for s in J['sections']:
    out.append(f"<h2>{html.escape(s['title'])}</h2><p>{html.escape(s['note'])}</p>")
    for c in s['cases']:
        out.append(f"<h3>{html.escape(c['title'])}</h3><p>{html.escape(c['note'])}</p><div class=row>")
        for k, v in enumerate(c['variants']):
            cap = 'ABCDEFGH'[k] if c.get('blind') else html.escape(v['name'])
            out.append(f"<figure><img src=\"data:image/gif;base64,{gif(v['frames'], v['ms'])}\" alt=\"{cap}\"><figcaption>{cap}</figcaption></figure>")
        out.append('</div>')
        if c.get('blind'):
            out.append('<details><summary>Reveal which is which</summary><ul>' + ''.join(f"<li><b>{'ABCDEFGH'[k]}</b>: {html.escape(v['name'])}</li>" for k, v in enumerate(c['variants'])) + '</ul></details>')
out.append('</main></body></html>')
open(os.path.join(G, 'index.html'), 'w', encoding='utf-8').write('\n'.join(out))
print('wrote', os.path.join(G, 'index.html'))
