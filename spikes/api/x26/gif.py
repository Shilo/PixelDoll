# Round 6: turn out/x26/gallery frame folders into GIFs and a blind side-by-side page (labels hidden until revealed).
# Usage: python -I x26/gif.py <gallery dir>
import json, os, sys, html, base64
from PIL import Image

G = sys.argv[1]
J = json.load(open(os.path.join(G, 'gallery.json'), encoding='utf-8'))
for c in J['cases']:
    slow = c['id'] == 'dresser'
    for v in c['variants']:
        d = os.path.join(G, c['id'], v['letter'])
        frames = [Image.open(os.path.join(d, f)).convert('RGB') for f in sorted(os.listdir(d)) if f.endswith('.png')]
        pal = [f.quantize(colors=255, method=Image.Quantize.MEDIANCUT) for f in frames]
        pal[0].save(os.path.join(G, f"{c['id']}_{v['letter']}.gif"), save_all=True, append_images=pal[1:], duration=700 if slow else 130, loop=0, disposal=2)

css = """
:root{--bg:#16171a;--fg:#e8e6e3;--mut:#9a978f;--card:#202226;--line:#33363b;--acc:#c9a26b}
@media (prefers-color-scheme: light){:root:not([data-theme=dark]){--bg:#f5f3ef;--fg:#1d1c1a;--mut:#5f5b54;--card:#fff;--line:#ddd8cf;--acc:#8a6a3b}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 2px}p{margin:4px 0;color:var(--mut)}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px;flex:0 1 230px}
figure img{width:100%;image-rendering:pixelated;display:block;border-radius:6px}
figcaption{font-weight:600;margin-top:6px;text-align:center;font-size:18px}
details{margin-top:8px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px}
summary{cursor:pointer;color:var(--acc);font-weight:600}li{margin:2px 0}
"""
out = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
       '<title>Motion Bake-off</title><style>' + css + '</style></head><body><main>',
       '<h1>PixelDoll round 6: blind side-by-side</h1>',
       '<p>Same bare body (64 px in an 80 px frame), same seed. Pick your favorite in each blind row before opening the key.</p>']
for c in J['cases']:
    out.append(f"<h2>{html.escape(c['title'])}</h2><p>{html.escape(c['question'])}</p><div class=row>")
    for v in c['variants']:
        cap = v['letter'] if c['blind'] else html.escape(v['name'])
        data = base64.b64encode(open(os.path.join(G, f"{c['id']}_{v['letter']}.gif"), 'rb').read()).decode()  # inline: the preview pane loads pages as snapshots
        out.append(f"<figure><img src=\"data:image/gif;base64,{data}\" alt=\"{cap}\"><figcaption>{cap}</figcaption></figure>")
    out.append('</div>')
    if c['blind']:
        out.append('<details><summary>Reveal which is which</summary><ul>' + ''.join(f"<li><b>{v['letter']}</b>: {html.escape(v['name'])}</li>" for v in c['variants']) + '</ul></details>')
out.append('</main></body></html>')
open(os.path.join(G, 'index.html'), 'w', encoding='utf-8').write('\n'.join(out))
print('wrote', os.path.join(G, 'index.html'))
