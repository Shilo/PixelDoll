// Round 9 gallery spec (no API calls): text-animated body moves, the armed-attack split, items dressed onto real frames
// per tool, the zero-cost hair paste and the shared-equipment test. x27/gallery.py builds the GIFs and page.
// Usage (spikes/api): node x28/gallery.mts && python -I x27/gallery.py out/x28/gallery
import fs from 'node:fs';
import { OUT, BODY, save } from './lib.mts';

const G = `${OUT}/gallery`;
fs.mkdirSync(G, { recursive: true });
const nums = (pre: string) => { const dir = pre.slice(0, pre.lastIndexOf('/')), base = pre.slice(pre.lastIndexOf('/') + 1);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(base + '.') && /^\d+\.png$/.test(f.slice(base.length + 1))).map((f) => +f.slice(base.length + 1, -4)).sort((a, b) => a - b).map((i) => `${pre}.${i}.png`) : []; };
const rests: Record<string, string> = {};
const rest = async (d: string) => rests[d] ??= (await save(`${G}/rest_${d}.png`, await BODY.rest(d)), `${G}/rest_${d}.png`);
/** Frames of a stored clip; `skip0` drops the model's echo of the input; one-shots get the rest frame held in front. */
async function v(name: string, pre: string, o: { skip0?: boolean; ms?: number; oneShot?: string } = {}) {
  let f = nums(pre); if (o.skip0) f = f.slice(1); if (!f.length) return null;
  const ms = o.ms ?? 110;
  return o.oneShot ? { name, frames: [await rest(o.oneShot), ...f], ms: [400, ...f.map((_, i) => (i === f.length - 1 ? 500 : ms))] } : { name, frames: f, ms: f.map(() => ms) };
}
const B = `${OUT}/B`, D = `${OUT}/D`, S = `${OUT}/S`, W = `${OUT}/W`;
const all = async (xs: Promise<any>[]) => (await Promise.all(xs)).filter(Boolean);
const dirs = ['south', 'east', 'north'];

const sections: any[] = [];
// 1. body moves
const move = async (id: string, title: string, note: string, one: boolean, ms = 110) => ({ id, title, note,
  variants: await all(['pm', 'v3'].flatMap((m) => dirs.map((d) => v(`${m === 'pm' ? 'pixminimax' : 'v3'} ${d}`, `${B}/${m}_${id}_${d}`, { skip0: true, ms, oneShot: one ? d : undefined })))) });
sections.push({ title: 'Body moves from text (no skeleton)', note: 'Raw /animate-pixminimax (pm) and /animate-with-text-v3 (v3), first frame = the bare body rest view, 8 frames at 80 px, 1 gen each.', cases: [
  await move('walk', 'Walk', 'pixminimax: the best walks (S, E, N). v3 south drifts into a profile.', false),
  await move('run', 'Run', 'Both natural; pixminimax east is the liveliest.', false, 90),
  await move('idle_s', 'Idle (combat-ready stance wording)', 'Still subtle; text idles move more than skeleton idles.', false, 150),
  await move('attack_l', 'Unarmed attack, ending on the rest frame', 'pixminimax turns the body sideways mid-strike; v3 keeps the facing. Both raise the wrong hand in south.', true, 100),
  await move('hurt', 'Hurt', 'pixminimax east adds a black streak; v3 south adds a glowing aura.', true, 100),
  await move('die', 'Die', 'pixminimax: readable falls in every direction. v3: good south, a flexing pose in north.', true, 120),
] });
// 2. armed attack split
const armed = (id: string, d: string) => all([v(`armed (${id.split('_')[0]})`, `${B}/${id}`, { skip0: true, ms: 90, oneShot: d }),
  v('bare body (disarmed)', `${S}/ea_${id}.bare`, { ms: 90, oneShot: d }), v('weapon layer', `${S}/ea_${id}.weapon`, { ms: 90 }), v('bare + weapon', `${S}/ea_${id}.recomp`, { ms: 90, oneShot: d })]);
sections.push({ title: 'Weapon attack: animate armed, then split', note: 'The body holds the dressed sword when animated, so the weapon picks the right hand. edit-animation-v2 removes the sword (10 gens); the weapon layer is what changed.', cases: [
  { id: 'arm_s', title: 'South (pixminimax, seed 11)', note: 'Wind-up, diagonal strike with a swoosh trail, recovery.', variants: await armed('pm_slash_armed_s11_south', 'south') },
  { id: 'arm_e', title: 'East (v3, seed 7)', note: 'Overhead wind-up and chop.', variants: await armed('v3_slash_armed_east', 'east') },
  { id: 'arm_raw', title: 'Other armed takes', note: 'Unsplit armed animations: pixminimax adds trails; v3 is calmer.', variants: await all([
    v('pm south s7', `${B}/pm_slash_armed_south`, { skip0: true, ms: 90, oneShot: 'south' }), v('v3 south s7', `${B}/v3_slash_armed_south`, { skip0: true, ms: 90, oneShot: 'south' }),
    v('pm east s7', `${B}/pm_slash_armed_east`, { skip0: true, ms: 90, oneShot: 'east' }), v('pm east s11', `${B}/pm_slash_armed_s11_east`, { skip0: true, ms: 90, oneShot: 'east' })]) },
] });
// 3. items on real frames
const tools: [string, string][] = [['ea', 'edit-animation-v2 + anchor'], ['to', 'transfer-outfit-v2'], ['ip', 'inpaint-v3 sheet (S+E in one call)'], ['ei', 'edit-images-v2 sheet (S+E in one call)']];
const item = async (it: string, clip: string, d: string, extra: any[] = []) => all([...tools.map(([t, n]) => v(n, `${D}/${t}_${it}_${clip}_${t === 'ip' || t === 'ei' ? 'se' : d[0]}.comp_${d}`, { ms: 110 })), ...extra]);
sections.push({ title: 'Items dressed onto the real frames', note: 'Chroma-keyed body frames, the round 6 dressed rest view as the anchor, item keyed out and composited back. ea/to: 10 gens per 8 frames; sheets: 25 gens per 16 frames.', cases: [
  { id: 'cloak_walk_s', title: 'Cloak on the pixminimax walk, south', note: '', variants: await item('cloak', 'pm_walk', 'south') },
  { id: 'cloak_walk_e', title: 'Cloak on the walk, east', note: 'The edit-images-v2 sheet redraws and moves the bodies (rejected).', variants: await item('cloak', 'pm_walk', 'east') },
  { id: 'cloak_walk_n', title: 'Cloak on the walk, north', note: '', variants: await all([v('edit-animation-v2 + anchor', `${D}/ea_cloak_pm_walk_n.comp_north`)]) },
  { id: 'cloak_atk_e', title: 'Cloak on the v3 attack, east', note: '', variants: await item('cloak', 'v3_attack_l', 'east') },
  { id: 'hair_walk_s', title: 'Hair on the walk, south', note: 'Every editor paints over part of the face; the free tracked paste keeps it.', variants: await item('hair', 'pm_walk', 'south', [await v('tracked paste (0 gens)', `${D}/paste_hair_pm_walk_s.comp_south`)]) },
  { id: 'hair_atk_s', title: 'Hair on the attack, south', note: 'The paste keeps the raised fist in front of the hair (occlusion rule).', variants: await item('hair', 'v3_attack_l', 'south', [await v('tracked paste (0 gens)', `${D}/paste_hair_v3_attack_l_s.comp_south`)]) },
  { id: 'sword_atk_s', title: 'Sword dressed onto an unarmed attack, south', note: 'The body attacks with the wrong hand: edit-animation-v2 adds a second sword, transfer-outfit leaves it at the hip. Hence the armed route above.', variants: await item('sword', 'v3_attack_l', 'south') },
  { id: 'sword_walk_e', title: 'Sword on the walk, east', note: '', variants: await item('sword', 'pm_walk', 'east') },
] });
// 4. shared equipment
sections.push({ title: 'Shared equipment: a second body', note: "One edit-animation-v2 call with the man's dressed views as reference cells dresses the woman's rest views; her own pixminimax walk is then dressed like his.", cases: [
  { id: 'share_cloak', title: 'Same cloak, two bodies', note: '', variants: await all([v('man, south', `${D}/ea_cloak_pm_walk_s.comp_south`), ...dirs.map((d) => v(`woman, ${d}`, `${W}/ea_cloak_walk_${d}.comp`))]) },
  { id: 'share_sword', title: 'Same sword, two bodies', note: '', variants: await all([v('man, east', `${D}/ea_sword_pm_walk_e.comp_east`), v('woman, south', `${W}/ea_sword_walk_south.comp`), v('woman, east', `${W}/ea_sword_walk_east.comp`)]) },
] });
fs.writeFileSync(`${G}/spec.json`, JSON.stringify({ title: 'Skeleton-Free Route', h1: 'PixelDoll round 9: skeleton-free route', intro: 'Bare default body (64 px in 80 px), seed 7 unless noted. One-shot moves start on the rest frame (held).', sections }, null, 1));
console.log('cases', sections.map((s) => s.cases.map((c: any) => `${c.id}:${c.variants.length}`).join(' ')).join(' | '));
