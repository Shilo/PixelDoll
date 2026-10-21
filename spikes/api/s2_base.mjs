// S2/X4: clothed, smaller base. usage: node --env-file=../../.env s2_base.mjs <tag> <size>
// Saves rotations to out/s2_base/<tag>_<dir>.png. Size < 64 is padded to 64 later (never rescaled).
import { experiment, imagesOf } from './lib/run.mjs';
import { sheet } from './lib/sheet.mjs';
import { bbox, opaqueCount, colors } from './lib/img.mjs';
const X = experiment('s2_base');
const [tag = 'b64', size = '64'] = process.argv.slice(2);
const s = +size;
const DESC = 'plain bald human mannequin for a paperdoll base, light skin tone, wearing a plain grey t-shirt and plain grey shorts, barefoot, no hair, no accessories, neutral standing pose with arms slightly away from the torso'
  + (s >= 64 ? ', small character drawn with plenty of empty space above the head' : '');
const r = await X.costed(`${tag} create-character-v3 ${s}`, () => X.api.run('/create-character-v3', { description: DESC, image_size: { width: s, height: s }, view: 'low top-down', template_id: 'mannequin', seed: 4321, no_background: true }));
const cid = r.res.character_id;
const ch = await X.api.get(`/characters/${cid}`);
X.saveJson(`${tag}_character.json`, ch);
const ims = [];
for (const [d, u] of Object.entries(ch.rotation_urls || {}).filter(([, u]) => u)) { const [{ im }] = await imagesOf(u); X.save(`${tag}_${d}.png`, im); ims.push(im); console.log(d, im.w, im.h, 'bbox', JSON.stringify(bbox(im)), 'opaque', opaqueCount(im), 'colors', colors(im).size); }
X.save(`${tag}_sheet.png`, sheet([ims]));
console.log(JSON.stringify({ tag, cid, totalMs: r.totalMs, size: ch.size }));
