// Item-pipeline benchmark: scores production extraction, cleanup and QA on a frozen corpus of real PixelLab outputs
// (app/test/fixtures/bench, built by scripts/bench-freeze.ts). Offline, deterministic, no API client: it cannot spend.
// `node scripts/bench.ts [--case <substring>] [--write] [--sheet]`
//   --write  regenerates docs/testing/bench.md (commit it with the change it measures; test/unit/bench.test.ts checks it)
//   --sheet  saves layer-over-base contact sheets to test-results-bench/ for visual review
// A change is an improvement only if it fixes a verdict miss or a labeled defect without regressing any other case, and the
// sheets look right. Generation variants (prompts, routes, keys) are compared with a paid campaign, not with this benchmark.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../src/lib/image/png.ts';
import { bandOf, cutAllow, cutRows, dirGate, extractCell, GATES, g2Fails, itemQa, padImg, posedTol, postProcess, recompose, slotOf, type CellOut, type Route } from '../src/lib/items/items.ts';
import { sha256 } from '../src/lib/image/hash.ts';
import type { Keypoint, Rig } from '../src/lib/rig/rig.ts';
import { fromApi } from '../src/lib/rig/poses.ts';

const FIX = new URL('../test/fixtures/bench/', import.meta.url);
interface Case { id: string; body: 'A' | 'B' | 'N' | 'C'; slot: string; key: Route; pad: number; clips: string[]; expect: Record<string, string>; keep?: Record<string, number[][]>; drop?: Record<string, number[][]>; source: string; note?: string; role?: 'reference' }
interface Body { rig: Rig; rows: string[]; cols: string[] }
const load = (name: string) => decodePngBytes(new Uint8Array(readFileSync(new URL(name, FIX))));
const cell = (sheet: Img, C: number, row: number, col: number): Img => {
  const o = makeImg(C, C);
  for (let y = 0; y < C; y++) o.data.set(sheet.data.subarray(((row * C + y) * sheet.w + col * C) * 4, ((row * C + y) * sheet.w + col * C + C) * 4), y * C * 4);
  return o;
};
const skel = (rig: Rig, k: Keypoint[] | undefined) => k && fromApi(k, rig.cell);

export interface CaseResult { id: string; verdicts: Record<string, string>; misses: string[]; keep: [number, number]; keepExact: [number, number]; drop: [number, number]; fails: number; warnings: number; maxAreaCV: number; cut: number; cells: CellOut[] }
/** Verdict of one clip from the QA messages: "fail:G3", "warn:G7", or "pass". */
function verdictOf(clip: string, fails: string[], warnings: string[]) {
  const hit = (m: string) => m.includes(` ${clip}/`) || m.includes(` ${clip}:`) || m.includes(` ${clip} `);
  const f = fails.filter(hit), w = warnings.filter(hit);
  return f.length ? `fail:${[...new Set(f.map((m) => m.split(' ')[0]))].sort().join('+')}` : w.length ? `warn:${[...new Set(w.map((m) => m.split(' ')[0]))].sort().join('+')}` : 'pass';
}
const meets = (want: string, got: string) => want === 'any' || (want === 'nofail' ? !got.startsWith('fail') : want === 'fail' ? got.startsWith('fail') : want.startsWith('fail:') ? got.startsWith('fail') && want.slice(5).split('+').every((g) => got.includes(g)) : got === want);

export async function runCase(c: Case): Promise<CaseResult> {
  const body: Body = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8')), bodySheet = await load(`body${c.body}.png`), rig = body.rig;
  const N = rig.cell.w, C = N + 2 * c.pad, slot = slotOf(c.slot), sheet = await load(`${c.id}.png`), held = slot.class === 'held';
  const base = (dir: string, col: string) => padImg(cell(bodySheet, N, body.rows.indexOf(dir), body.cols.indexOf(col)), c.pad);
  const dirsOf = c.clips.length ? [...new Set(c.clips.map((k) => k.split('/')[1]))] : body.rows;
  const keys: Record<string, Img> = {}, kf: CellOut[] = [];
  const kfRow = (d: string) => (c.clips.length ? c.clips.findIndex((k) => k.endsWith(`/${d}`)) : 0), kfCol = (d: string) => (c.clips.length ? 0 : body.rows.indexOf(d));
  // round 3 cuts, as production (run.ts cutFor): keyframes cut on their own, posed frames only inside their keyframe's cut
  const keyCut: Record<string, Uint8Array | undefined> = {};
  for (const d of dirsOf) {
    const s0 = c.pad ? undefined : skel(rig, rig.rest?.[d as 'south']?.keypoints), maxY = cutRows(c.slot, s0, C);
    const k = extractCell({ key: `rest/${d}/0`, call: 0, base: base(d, 'rest'), out: cell(sheet, C, kfRow(d), kfCol(d)), route: c.key, band: bandOf(c.slot, s0, C), ...(maxY != null ? { cut: { maxY } } : {}) });
    keys[d] = k.layer; kf.push(k); keyCut[d] = k.cut;
  }
  const cells: CellOut[] = [];
  c.clips.forEach((clip, r) => {
    const [anim, dir] = clip.split('/'), a = rig.animations.find((x) => x.id === anim)!;
    for (let i = 0; i < a.cells; i++) {
      const s1 = c.pad ? undefined : skel(rig, a.sources?.[dir as 'south']?.keypoints?.[i]), maxY = cutRows(c.slot, s1, C), allow = maxY != null ? cutAllow(rig, `${clip}/${i}`, keyCut[dir], N, posedTol(N, N)) : undefined;
      cells.push(extractCell({ key: `${clip}/${i}`, call: 1 + r, base: base(dir, `${anim}/${i}`), out: cell(sheet, C, r, 1 + i), route: c.key, band: bandOf(c.slot, s1, C), posed: true, clip: slot.band, held, pad: c.pad, ...(allow ? { cut: { maxY: maxY!, allow } } : {}) }));
    }
  });
  let fails: string[] = [], warnings: string[] = [];
  if (cells.length) {
    postProcess(rig, slot, cells, keys, c.pad);
    const q = itemQa(rig, slot, c.key, cells, 0, GATES.keyOutsidePosed, c.pad), h = dirGate(slot, cells, keys, rig);
    fails = [...q.failCalls.values(), ...h.fails.values()].flat(); warnings = [...q.warnings, ...h.warnings];
  } else for (const k of kf) { // dress-only case: the keyframe gates the dress call uses (G2, G3, presence)
    if (g2Fails(k)) fails.push(`G2 rest ${k.key}`);
    if ((k.keyOutside ?? 0) > GATES.keyOutside) fails.push(`G3 rest ${k.key}`);
    if (!k.area) fails.push(`G4 rest ${k.key}`);
  }
  const verdicts = Object.fromEntries(Object.keys(c.expect).map((clip) => [clip, verdictOf(clip, fails, warnings)]));
  const misses = Object.entries(c.expect).filter(([clip, want]) => !meets(want, verdicts[clip])).map(([clip, want]) => `${clip}: want ${want}, got ${verdicts[clip]}`);
  // labels are on the raw output; posed cells were re-registered by `offset`, so labels move with them
  const all = [...kf, ...cells], score = (labels: Record<string, number[][]> | undefined, exact = false): [number, number] => {
    let hit = 0, n = 0;
    for (const [key, runs] of Object.entries(labels ?? {})) {
      const x = all.find((q) => q.key === key); if (!x) continue;
      const raw = cell(sheet, C, ...rawPos(key));
      for (const [start, len] of runs) for (let p = start; p < start + len; p++) {
        n++;
        const X = (p % C) + x.offset[0], Y = ((p / C) | 0) + x.offset[1], q = Y * C + X;
        if (X < 0 || Y < 0 || X >= C || Y >= C || !x.mask[q]) continue;
        if (!exact) { hit++; continue; }
        const d = Math.max(...[0, 1, 2].map((ch) => Math.abs(x.layer.data[q * 4 + ch] - raw.data[p * 4 + ch])));
        if (d <= 24) hit++;
      }
    }
    return [hit, n];
  };
  const rawPos = (key: string): [number, number] => { const [a, d, i] = key.split('/'); return a === 'rest' ? [kfRow(d), kfCol(d)] : [c.clips.indexOf(`${a}/${d}`), 1 + +i]; };
  const cvs = c.clips.map((clip) => { const ar = cells.filter((x) => x.key.startsWith(`${clip}/`)).map((x) => x.area), m = ar.reduce((s, v) => s + v, 0) / ar.length; return m ? Math.sqrt(ar.reduce((s, v) => s + (v - m) ** 2, 0) / ar.length) / m : 0; });
  return { id: c.id, verdicts, misses, keep: score(c.keep), keepExact: score(c.keep, true), drop: score(c.drop), fails: fails.length, warnings: warnings.length, maxAreaCV: Math.max(0, ...cvs), cut: all.reduce((n, x) => n + (x.cut ? x.cut.reduce((a, b) => a + b, 0) : 0), 0), cells: all };
}

export async function runBench(filter?: string) {
  const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
  const results: CaseResult[] = [];
  for (const c of cases) if (!filter || c.id.includes(filter)) results.push(await runCase(c));
  return { cases, results };
}
const pct = ([h, n]: [number, number]) => (n ? `${((100 * h) / n).toFixed(1)} % (${h}/${n})` : '–');
export async function report(results: CaseResult[], cases: Case[]) {
  const corpus = await sha256(new Uint8Array(readFileSync(new URL('cases.json', FIX))));
  const gates = await sha256(new TextEncoder().encode(JSON.stringify(GATES)));
  const rows = results.map((r) => { const c = cases.find((x) => x.id === r.id)!; return `| ${r.id}${c.role ? ' (reference)' : ''} | ${c.slot} / ${c.key} | ${r.misses.length ? `**${r.misses.length} miss**` : 'ok'} | ${pct(r.keep)} | ${pct(r.keepExact)} | ${pct(r.drop)} | ${r.fails} | ${r.warnings} | ${r.maxAreaCV.toFixed(3)} | ${r.cut || '–'} |`; });
  const misses = results.flatMap((r) => r.misses.map((m) => `- ${r.id} ${m}`));
  const live = results.filter((r) => !cases.find((x) => x.id === r.id)!.role);
  const tot = (f: (r: CaseResult) => [number, number]) => live.reduce<[number, number]>((s, r) => [s[0] + f(r)[0], s[1] + f(r)[1]], [0, 0]);
  return `# Item pipeline benchmark

Generated by \`node scripts/bench.ts --write\` from the frozen corpus in \`app/test/fixtures/bench/\` (real PixelLab outputs;
cases, labels and sources in \`cases.json\`, built by \`scripts/bench-freeze.ts\`). Offline and deterministic; regenerate and commit
it with any change to extraction, cleanup or QA. Corpus \`${corpus.slice(0, 12)}\`, gates \`${gates.slice(0, 12)}\`.

- **Verdict**: each clip's QA result (pass, warn:Gx, fail:Gx) against the expected one from documented visual verdicts.
- **Keep**: labeled pixels that must ship and do (pommels, haft ends, the jester's pink, the stripes' purple). **Keep exact**: also within 24 per
  channel of the raw color (catches discoloring). **Drop**: labeled invented props that ship anyway (lower is better).
- **Cut px**: body px the item hides over all cells (baseCut: ear tips PixelLab erased under a hood or helm); anything else is a false hide.
- **Reference** cases document a superseded choice (items on magenta that pickKey no longer sends there) and stay out of totals.
- An improvement fixes a miss or a label without regressing another case; see the campaign playbook for generation changes.

| Case | Slot / key | Verdicts | Keep | Keep exact | Drop | Fails | Warnings | Max area CV | Cut px |
|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Totals (reference cases excluded): ${results.reduce((s, r) => s + r.misses.length, 0)} verdict misses; keep ${pct(tot((r) => r.keep))}; keep exact ${pct(tot((r) => r.keepExact))}; drop ${pct(tot((r) => r.drop))}.

${misses.length ? `## Verdict misses\n\n${misses.join('\n')}\n` : 'No verdict misses.\n'}`;
}

if (import.meta.main) {
  const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
  const { cases, results } = await runBench(arg('--case'));
  for (const r of results) console.log(`${r.id.padEnd(18)} ${r.misses.length ? `MISS ${r.misses.join('; ')}` : 'ok'} | keep ${pct(r.keep)} exact ${pct(r.keepExact)} | drop ${pct(r.drop)} | fails ${r.fails} warn ${r.warnings}`);
  if (process.argv.includes('--write')) { writeFileSync(new URL('../../docs/testing/bench.md', import.meta.url), await report(results, cases)); console.log('wrote docs/testing/bench.md'); }
  if (process.argv.includes('--sheet')) {
    const dir = new URL('../test-results-bench/', import.meta.url); mkdirSync(dir, { recursive: true });
    for (const r of results) {
      const L = r.cells.map((x) => recompose(x)), C = L[0].w, cols = 9, o = makeImg(cols * C, Math.ceil(L.length / cols) * C);
      L.forEach((im, i) => { for (let y = 0; y < C; y++) o.data.set(im.data.subarray(y * C * 4, (y + 1) * C * 4), ((((i / cols) | 0) * C + y) * o.w + (i % cols) * C) * 4); });
      writeFileSync(new URL(`${r.id}.png`, dir), await encodePngBytes(o));
    }
    console.log('sheets in test-results-bench/');
  }
}
