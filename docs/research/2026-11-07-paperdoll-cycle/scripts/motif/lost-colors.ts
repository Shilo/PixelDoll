// Free: how often does the G15 design-detail note fire on the real frozen bench? For each posed cell of a worn (non-held)
// case that G15 judges (locomotion, plus the authored slash for items not drawn behind the body), the production helpers list the same-facing keyframe's detail colors that are gone from the posed cell.
// Also runs a nearest-neighbor 2x and 4x upscale of every cell as a stand-in for larger characters (the bench has one
// 128 px case and none larger). Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/motif/lost-colors.ts
import { readFileSync } from 'node:fs';
import { runPipe } from '../extraction/bench-replay.ts';
import { FIX, type Img } from '../extraction/lib.ts';
import { detailColors, isAction, lostDetails, slotOf } from '../../../../../app/src/lib/items/items.ts';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';

const up = (im: Img, k: number) => {
  if (k === 1) return im;
  const o = makeImg(im.w * k, im.h * k);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(im.data.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * o.w + x) * 4);
  return o;
};
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { key: string; role?: string; clips: string[]; slot: string }) => c.key !== 'none' && !c.role && c.clips.length && slotOf(c.slot).class !== 'held');
const runs = [];
for (const c of cases) runs.push({ c, run: await runPipe(c) });
for (const k of [1, 2, 4]) {
  let cells = 0, flagged = 0; const where: string[] = [];
  for (const { c, run } of runs) {
    const pal = Object.fromEntries(run.kf.map((x) => [x.key.split('/')[1], detailColors(up(x.layer, k))]));
    for (const x of run.cells) {
      const [anim, dir] = x.key.split('/');
      if (isAction(`${anim}/${dir}`) && (anim !== 'slash' || slotOf(c.slot).bgZ != null)) continue;
      const lost = lostDetails(pal[dir], up(x.layer, k), up(x.base, k));
      cells++; if (lost.length) { flagged++; where.push(`${c.id} ${x.key} lost ${lost.map((l) => '#' + l.color.toString(16).padStart(6, '0') + ' (' + l.px + ' px)').join(' ')}`); }
    }
  }
  console.log(`${k}x: ${flagged}/${cells} judged posed cells flagged`);
  if (where.length) console.log(where.join('\n'));
}
