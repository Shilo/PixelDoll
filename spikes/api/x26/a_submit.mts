// Round 6, step A: every call that does not need the mocap tables or an earlier result.
//   X1  authored slash S, with and without wrist/elbow depth + z_index        (2 × 3 gens)
//   X2  authored slash E and hurt S/E (baselines); skin import for managed motion; managed breathing-idle and a pixminimax
//       unarmed chop, S and E (motion sources, re-rendered raw in step B)
//   X3  green import + create-character-state cloak (control: round 5's stored edit-animation-v2 cloak on this body)
//   X4  dress hair and sword on the 3 drawn views (edit-animation-v2, production prompts)
// Usage (spikes/api): node --env-file=<repo root>/.env x26/a_submit.mts [dry]
import { api, b64, items, chroma, routes, poses, call, BODY, RIG, CELL, LOOKS, SEED, OUT, flipH, restKps, renderBody, spent, TOTAL_CAP } from './lib.mts';
import fs from 'node:fs';

const dry = process.argv[2] === 'dry';
const W = CELL.w;
const authored = (name: string, d: string, style?: 'visible-side-v1') =>
  poses.authoredPoses(name, poses.fromApi(restKps(d), CELL), d, W, style).map((p: any) => poses.toApi(p, CELL));
/** X1 variant: the swinging right arm nearer the camera than the body, drawn on top, on every non-rest frame. */
const withDepth = (seq: any[][]) => seq.map((f, i) => f.map((k) => i > 0 && ['RIGHT ELBOW', 'RIGHT ARM'].includes(k.label) ? { ...k, depth: 185, z_index: 2 } : k));

const restViews = async () => ({ south: await BODY.rest('south'), east: await BODY.rest('east'), north: await BODY.rest('north') });
async function importChar(label: string, views: Record<string, any>) {
  const req = routes.routes.createCharacterV3({ description: LOOKS, reference_image: { type: 'base64', base64: await b64(views.south), format: 'png' },
    direction_images: { east: { type: 'base64', base64: await b64(views.east), format: 'png' }, north: { type: 'base64', base64: await b64(views.north), format: 'png' }, west: { type: 'base64', base64: await b64(flipH(views.east)), format: 'png' } },
    n_directions: 4, view: 'low top-down', template_id: 'mannequin', no_background: true, seed: SEED });
  return call({ arm: label === 'skin' ? 'X2' : 'X3', label: `import ${label}`, file: `${OUT}/import_${label}`, req: req as any, estimate: 1, armCap: label === 'skin' ? 60 : 40 });
}

const tasks: [string, () => Promise<unknown>][] = [];
// X1 + X2 authored baselines
const slashS = authored('slash', 'south');
tasks.push(['X1 slash S plain', () => renderBody({ arm: 'X1', armCap: 8, name: 'authored_slash', dir: 'south', action: 'slash, empty hands, no weapon, no props, no effects', keypoints: slashS })]);
tasks.push(['X1 slash S depth', () => renderBody({ arm: 'X1', armCap: 8, name: 'authored_slash_depth', dir: 'south', action: 'slash, empty hands, no weapon, no props, no effects', keypoints: withDepth(slashS) })]);
tasks.push(['X2 slash E', () => renderBody({ arm: 'X2', armCap: 60, name: 'authored_slash', dir: 'east', action: 'slash, empty hands, no weapon, no props, no effects', keypoints: authored('slash', 'east', 'visible-side-v1') })]);
for (const d of ['south', 'east']) tasks.push([`X2 hurt ${d}`, () => renderBody({ arm: 'X2', armCap: 60, name: 'authored_hurt', dir: d, action: 'hurt, empty hands, no weapon, no props, no effects', keypoints: authored('hurt', d) })]);
// X2 managed motion sources on a skin import of this body
tasks.push(['X2 import + managed', async () => {
  const imp = await importChar('skin', await restViews());
  const id = imp?.res?.character_id;
  if (!id) return console.log('no character id from the skin import');
  const anims: [string, any][] = [
    ['tpl_idle', { name: 'idle', template: 'breathing-idle', action: 'breathing idle', frames: 4 }],
    ['pmx_chop', { name: 'chop', template: '', action: 'unarmed overhead chop with the right arm, empty hands, no weapon, no props, no other people, no effects', frames: 8 }],
  ];
  await Promise.all(anims.flatMap(([n, a]) => ['south', 'east'].map((d) => {
    const body = routes.baseAnimation(n.startsWith('tpl') ? 'skeleton-v3' : 'pixminimax', id, a, [d as any], SEED);
    return call({ arm: 'X2', label: `managed ${n} ${d}`, file: `${OUT}/X2/managed_${n}_${d}`, req: routes.routes.animateCharacter(body) as any, estimate: n.startsWith('tpl') ? 4 : 2, armCap: 60 });
  })));
}]);
// X3 state on a green import; the cloak prompt and key come from round 5's stored control dress
const CLOAK = 'a long red cloak open at the front, hanging from the shoulders down to the calves';
tasks.push(['X3 green import + state', async () => {
  const key = chroma.pickKey(CLOAK), v = await restViews();
  const green = Object.fromEntries(Object.entries(v).map(([d, im]) => [d, chroma.toChroma(im, key)]));
  const imp = await importChar('green', green);
  const id = imp?.res?.character_id;
  if (!id) return console.log('no character id from the green import');
  const desc = `This pixel art character is a solid ${chroma.KEY_NAME[key]} mannequin. The ${chroma.KEY_NAME[key]} color is intentional (a chroma key) and must stay exactly the same ${chroma.KEY_NAME[key]} everywhere it is not covered. Add only ${CLOAK}, drawn in its own natural colors (no ${chroma.KEY_NAME[key]} on the item), identical design in every direction. Keep the pose, the body shape and the outline unchanged.`;
  return call({ arm: 'X3', label: 'state cloak', file: `${OUT}/X3/state_cloak`, req: { path: '/create-character-state', body: { character_id: id, edit_description: desc, no_background: true, use_color_palette_from_reference: false, seed: SEED } }, estimate: 25, armCap: 40 });
}]);
// X4 dresses (production prompts; held = padded canvas, "held in the right hand, pointing down")
const DRESS: [string, string, string][] = [['hair', 'hair', 'long wavy dark brown hair reaching past the shoulders, loose strands, no hat'], ['sword', 'main_hand', 'a steel longsword']];
for (const [name, slot, prompt] of DRESS) tasks.push([`X4 dress ${name}`, async () => {
  const key = chroma.pickKey(prompt), pad = items.padOf(slot, 'skel', CELL), drawn = ['south', 'east', 'north'];
  const views = await Promise.all(drawn.map(async (d) => b64(items.padImg(chroma.toChroma(await BODY.rest(d), key), pad))));
  const text = slot === 'main_hand' ? items.heldPhrase(prompt, slot) : prompt;
  const req = items.itemRoute.edit(views, items.itemPrompt(text, key, drawn.map((d) => `rest/${d}/0`)), SEED, { w: W + 2 * pad, h: W + 2 * pad });
  return call({ arm: 'X4', label: `dress ${name}`, file: `${OUT}/X4/dress_${name}`, req: req as any, estimate: 10, armCap: 45 });
}]);

if (dry) {
  console.log(`spent so far ${spent()} / cap ${TOTAL_CAP}`);
  for (const [n] of tasks) console.log('  ' + n);
  console.log('slash S frame 4 kps (no depth):', JSON.stringify(slashS[4].filter((k: any) => k.label.startsWith('RIGHT'))));
  console.log('depth variant frame 4:', JSON.stringify(withDepth(slashS)[4].filter((k: any) => k.label === 'RIGHT ARM')));
  if (api) { const b: any = await api.balance(); console.log('balance gens', b.subscription?.generations, 'usd', b.credits?.usd, 'plan', b.subscription?.plan ?? b.subscription?.status); }
  process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });
await Promise.all(tasks.map(async ([n, t]) => { try { await t(); } catch (e: any) { console.log(`FAILED ${n}: ${e.message}`); } }));
console.log(`spent ${spent()} / ${TOTAL_CAP}`);
