// Free: do held and worn gate verdicts change when a clip has fewer frames (every other frame, a faster move) or every frame
// held twice (a slower playlist)? Production runPipe + itemQa on the frozen bench. Run from the repo root.
import { readFileSync } from 'node:fs';
import { itemQa, slotOf, type CellOut } from '../../../../../app/src/lib/items/items.ts';
import type { Rig } from '../../../../../app/src/lib/rig/rig.ts';
import { runPipe } from '../extraction/bench-replay.ts';
import { FIX, body } from '../extraction/lib.ts';
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: any) => c.key !== 'none' && c.clips.length && !c.role);
const verdict = (q: ReturnType<typeof itemQa>, clip: string) => {
  const f = [...q.failCalls.values()].flat().filter((m) => m.includes(` ${clip}`) || m.includes(` ${clip}/`)).map((m) => m.split(' ')[0]);
  const w = q.warnings.filter((m) => m.includes(` ${clip}:`) || m.includes(` ${clip}/`)).map((m) => m.split(' ')[0]).filter((t) => !/^(G7|R1)$/.test(t));
  return f.length ? `fail:${[...new Set(f)].sort().join('+')}` : w.length ? `warn:${[...new Set(w)].sort().join('+')}` : 'pass';
};
let same = 0, diff = 0;
for (const c of cases) {
  const run = await runPipe(c), base = (await body(c.body)).body.rig as Rig, slot = slotOf(c.slot);
  for (const clip of c.clips) {
    const [anim, dir] = clip.split('/'), cells = run.cells.filter((x) => x.key.startsWith(`${clip}/`));
    if (cells.length < 6) continue;
    const variant = (pick: number[], playlist?: number[]) => {
      const rig = structuredClone(base), a = rig.animations.find((x) => x.id === anim)!, src = a.sources![dir as 'south']!;
      src.keypoints = pick.map((i) => src.keypoints![i]); if (src.measured) src.measured = pick.map((i) => src.measured![i]);
      a.cells = pick.length; a.frames = playlist ? playlist.map((cell) => ({ cell, ms: 100 })) : [];
      const cs: CellOut[] = pick.map((i, j) => ({ ...cells[i], key: `${clip}/${j}` }));
      const q = itemQa(rig, slot, c.key, cs, 0, undefined, c.pad);
      if (process.argv.includes("--why") && verdict(q, clip) !== "pass") console.log("  ", c.id, clip, pick.length, q.warnings.filter((m) => m.startsWith("G9")).join(" | "));
      return verdict(q, clip);
    };
    const all = cells.map((_, i) => i), full = variant(all), half = variant(all.filter((i) => i % 2 === 0)), held = variant(all, all.flatMap((i) => [i, i]));
    const row = `${c.id.padEnd(18)} ${clip.padEnd(12)} full ${full.padEnd(14)} every-other ${half.padEnd(14)} held-twice ${held}`;
    if (full === half && full === held) same++; else { diff++; console.log(row); }
  }
}
console.log(`clips with identical verdicts: ${same}, differing: ${diff}`);
