// Contact sheets of stored round-6 outputs (no API calls). Usage (spikes/api): node x26/peek.mts
import fs from 'node:fs';
import { load, save, OUT, BODY, chroma } from './lib.mts';
const { sheet, padTo } = await import('../c25/evaluate.mts');
const seq = async (base: string, n: number, mid = '.') => { const o = []; for (let i = 0; i < n; i++) { const f = `${base}${mid}${i}.png`; if (fs.existsSync(f)) o.push(await load(f)); } return o; };
const managed = async (name: string, d: string) => seq(`${OUT}/X2/managed_${name}_${d}.${d}_`, 16, '');

const X = `${OUT}/X2`, C = 80;
const rows = async (list: [string, Promise<any[]>][]) => { const out: any[][] = []; for (const [, p] of list) out.push((await p).map((im) => im && padTo(im, Math.max(C, im.w)))); return out; };
const U = 'out/c25e/U/c27man_cloak/dress';
const views = ['south', 'east', 'north'];
const cloakKey = chroma.pickKey('a long red cloak');
await save(`${OUT}/peek_x3.png`, sheet([
  await Promise.all(views.map(async (d) => chroma.toChroma(await BODY.rest(d), cloakKey))),
  await Promise.all([0, 1, 2].map((i) => load(`${U}.${i}.png`))),
  await Promise.all([...views, 'west'].map((d) => load(`${OUT}/X3/state_cloak.${d}.png`))),
], 4));
await save(`${OUT}/peek_x1x2.png`, sheet(await rows([
  ['X1 authored slash S', seq(`${OUT}/X1/body_authored_slash_south`, 8)],
  ['X1 depth slash S', seq(`${OUT}/X1/body_authored_slash_depth_south`, 8)],
  ['authored slash E', seq(`${X}/body_authored_slash_east`, 8)],
  ['authored hurt S', seq(`${X}/body_authored_hurt_south`, 6)],
  ['authored hurt E', seq(`${X}/body_authored_hurt_east`, 6)],
  ['tpl idle S', managed('tpl_idle', 'south')],
  ['tpl idle E', managed('tpl_idle', 'east')],
  ['pmx chop S', managed('pmx_chop', 'south')],
  ['pmx chop E', managed('pmx_chop', 'east')],
]), 3));
console.log('sheets written', `${OUT}/peek_x3.png`, `${OUT}/peek_x1x2.png`);
