// Round 8 gallery spec (no API calls): which rendered clips go on the page, with per-frame timing. x27/gallery.py builds
// the GIFs and index.html from out/x27/gallery/spec.json.
// Usage (spikes/api): node x27/gallery.mts
import fs from 'node:fs';
import { OUT, BODY, save } from './lib.mts';
import { MOVES } from './moves.mts';

const G = `${OUT}/gallery`;
fs.mkdirSync(G, { recursive: true });
const frames = (arm: string, id: string, d: string) => {
  const f = `${OUT}/${arm}/body_${id}_${d}`;
  if (!fs.existsSync(`${f}.json`)) return null;
  const J = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8'));
  return (J.labels as string[]).sort((a, b) => +a - +b).map((l) => `${f}.${l}.png`);
};
const msOf = (id: string, n: number) => { const m = MOVES.find((x) => x.id === id)!.ms ?? 100; return Array.from({ length: n }, (_, i) => Array.isArray(m) ? m[i] : m); };
const oneShot = (id: string) => !/^(idle|walk|run|sprint)/.test(id);
const rest = async (d: string) => { const p = `${G}/rest_${d}.png`; await save(p, await BODY.rest(d)); return p; };
/** A clip variant; one-shots start from the rest frame, held, so the move reads from the stance. */
async function clip(name: string, arm: string, id: string, d: string) {
  const f = frames(arm, id, d);
  if (!f) return null;
  const ms = msOf(id, f.length);
  return oneShot(id) ? { name, frames: [await rest(d), ...f], ms: [400, ...ms.slice(0, -1), Math.max(ms.at(-1)!, 400)] } : { name, frames: f, ms };
}
async function today(anim: string, d: string, n: number, ms: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) { const p = `${G}/today_${anim}_${d}_${i}.png`; await save(p, await BODY.base(d, anim, i)); out.push(p); }
  return { name: `Today's ${anim} (${d})`, frames: out, ms: out.map(() => ms) };
}

type Case = { id: string; title: string; note: string; blind?: boolean; variants: any[] };
const sections: { title: string; note: string; cases: Case[] }[] = [];
const spec = JSON.parse(process.env.X27_SPEC ?? 'null') as null | { title: string; note: string; cases: { id: string; title: string; note: string; blind?: boolean; variants: [string, string, string, string][] }[] }[];
// Default page: every rendered catalog move, S and E side by side.
const lib: Case[] = [];
for (const m of MOVES) {
  const v = (await Promise.all(['south', 'east'].map((d) => clip(`${m.id} ${d}`, fs.existsSync(`${OUT}/M2/body_${m.id}_${d}.json`) ? 'M2' : 'M1', m.id, d)))).filter(Boolean);
  if (v.length) lib.push({ id: m.id, title: m.id, note: `"${m.action}" · ${m.frames.map(([a]) => a).filter((a, i, s) => s.indexOf(a) === i).join(' + ')} · ${JSON.stringify(m.opts ?? {})}`, variants: v });
}
lib.unshift({ id: 'today', title: "Today's idle and walk (for comparison)", note: 'Stored frames of the same body from the current pipeline.', variants: [await today('idle', 'south', 4, 160), await today('idle', 'east', 4, 160), await today('walk', 'south', 8, 110), await today('walk', 'east', 8, 110)] });
sections.push({ title: 'Move library', note: 'CC0 mocap retargeted onto the bare default body (64 px in 80 px), one raw skeleton-v3 call per direction.', cases: lib });
for (const s of spec ?? []) sections.push({ title: s.title, note: s.note, cases: await Promise.all(s.cases.map(async (c) => ({ ...c, variants: (await Promise.all(c.variants.map(([n, a, id, d]) => clip(n, a, id, d)))).filter(Boolean) }))) });
fs.writeFileSync(`${G}/spec.json`, JSON.stringify({ sections }, null, 1));
console.log('cases', sections.map((s) => s.cases.length));
