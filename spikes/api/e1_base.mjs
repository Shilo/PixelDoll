// E1: base body via create-character-v3 and create-character-with-4-directions / -8-directions.
import { experiment, imagesOf } from './lib/run.mjs';
import { sheet } from './lib/sheet.mjs';
import { bbox, opaqueCount, colors } from './lib/img.mjs';
const X = experiment('e1_base');
const DESC = 'plain bald human base body for a paperdoll, light skin, simple plain grey underwear shorts, barefoot, no hair, no clothing, no accessories, standing straight in a neutral pose with arms slightly away from the body';
const which = process.argv[2] || 'v3';
const routes = {
  v3: ['/create-character-v3', { description: DESC, image_size: { width: 64, height: 64 }, view: 'low top-down', template_id: 'mannequin', seed: 1234, no_background: true }],
  d4: ['/create-character-with-4-directions', { description: DESC, image_size: { width: 64, height: 64 }, view: 'low top-down', seed: 1234, shading: 'basic shading', detail: 'medium detail' }],
  d8: ['/create-character-with-8-directions', { description: DESC, image_size: { width: 64, height: 64 }, view: 'low top-down', seed: 1234, shading: 'basic shading', detail: 'medium detail' }],
};
const [path, body] = routes[which];
const r = await X.costed(`${which} ${path}`, () => X.api.run(path, body));
const cid = r.res.character_id;
X.saveJson(`${which}_job.json`, r.jobs[0]);
const ch = await X.api.get(`/characters/${cid}`);
X.saveJson(`${which}_character.json`, ch);
const dirs = Object.entries(ch.rotation_urls || {}).filter(([, u]) => u);
const ims = [];
for (const [d, u] of dirs) { const [{ im }] = await imagesOf(u); X.save(`${which}_${d}.png`, im); ims.push(im); console.log(d, im.w, im.h, 'bbox', JSON.stringify(bbox(im)), 'opaque', opaqueCount(im), 'colors', colors(im).size); }
X.save(`${which}_sheet.png`, sheet([ims]));
console.log(JSON.stringify({ which, cid, submitMs: r.submitMs, totalMs: r.totalMs, size: ch.size, dirs: dirs.map(d => d[0]), jobKeys: Object.keys(r.jobs[0].last_response || {}) }));
