// Review of 735b92d3: which rule admits each held component, on the extracted (pre-cleanup) bench masks. Mirrors the current
// heldParts fixpoint and attachHeld floor with reason tags (near a kept part / via a part the floor later drops / grip / body
// bridge) and compares with the parent rule (near the largest or grip 3, then floor or grip 6). Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/held-reasons.ts
import { readFileSync } from 'node:fs';
import { components } from '../../../../../app/src/lib/image/chroma.ts';
import { angleDiff, axisOf, clipKeypoints } from '../../../../../app/src/lib/items/items.ts';
import { FIX } from '../extraction/lib.ts';
import { NEW, run, type Case } from './compare-735b.ts';

const dilate = (m: Uint8Array, w: number, r: number) => { const h = m.length / w, o = new Uint8Array(m.length); for (let p = 0; p < m.length; p++) if (m[p]) { const x = p % w, y = (p / w) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1; } } return o; };
const bridged = (base: any, w: number, a: number[], b: number[]) => {
  let best = Infinity, pa = 0, pb = 0;
  for (const p of a) for (const q of b) { const d = ((p % w) - (q % w)) ** 2 + (((p / w) | 0) - ((q / w) | 0)) ** 2; if (d < best) { best = d; pa = p; pb = q; } }
  const x0 = pa % w, y0 = (pa / w) | 0, x1 = pb % w, y1 = (pb / w) | 0, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 1; i < n; i++) { const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n); if (!base.data[(y * w + x) * 4 + 3]) return false; }
  return { gap: Math.sqrt(best) };
};

const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => NEW.slotOf(c.slot).class === 'held');
for (const c of cases) {
  const r = await run(NEW, c, false), wristL = c.slot === 'off_hand' ? 'LEFT ARM' : 'RIGHT ARM';
  for (const cell of r.cells) {
    const w = cell.layer.w, comps = components(cell.mask, w, cell.mask.length / w).sort((a: number[], b: number[]) => b.length - a.length);
    if (comps.length < 2) continue;
    const [an, d, i] = cell.key.split('/'), k = clipKeypoints(r.rig, an, d)?.[+i]?.find((q: any) => q.label === wristL);
    const wr = k && [k.x * r.rig.cell.w + c.pad, k.y * r.rig.cell.h + c.pad];
    const grip = (comp: number[], rad: number) => !!wr && comp.some((p) => Math.hypot((p % w) + 0.5 - wr[0], ((p / w) | 0) + 0.5 - wr[1]) <= rad);
    const floor = Math.max(4, 0.15 * comps[0].length), why: string[] = comps.map((_: unknown, j: number) => (j ? '' : 'largest')), keep = comps.map((_: unknown, j: number) => !j);
    for (let changed = true; changed;) {
      changed = false;
      const kept = new Uint8Array(cell.mask.length); comps.forEach((comp: number[], j: number) => { if (keep[j]) for (const p of comp) kept[p] = 1; });
      const close = dilate(kept, w, 3);
      comps.forEach((comp: number[], j: number) => {
        if (keep[j]) return;
        const nearTo = comps.findIndex((o: number[], q: number) => keep[q] && (() => { const m = new Uint8Array(cell.mask.length); for (const p of o) m[p] = 1; const dm = dilate(m, w, 3); return comp.some((p) => dm[p]); })());
        const past = 2 * comp.filter((p) => !cell.base.data[p * 4 + 3]).length >= comp.length;
        const br = past ? comps.map((o: number[], q: number) => keep[q] && bridged(cell.base, w, comp, o)).findIndex(Boolean) : -1;
        // collinearity probe: angle between the anchor's principal axis and the anchor-centroid -> part-centroid line
        const col = (q: number) => { const m = new Uint8Array(cell.mask.length); for (const p of comps[q]) m[p] = 1; const ax = axisOf(m, w); const cen = (c2: number[]) => [c2.reduce((s, p) => s + (p % w), 0) / c2.length, c2.reduce((s, p) => s + ((p / w) | 0), 0) / c2.length]; const [ax0, ay0] = cen(comps[q]), [bx, by] = cen(comp); return ax == null ? 'n/a' : angleDiff(ax, Math.atan2(by - ay0, bx - ax0)).toFixed(0); };
        if (comp.some((p) => close[p])) why[j] = `near#${nearTo}`; else if (grip(comp, 3)) why[j] = 'grip3'; else if (br >= 0) why[j] = `bridge#${br}(gap ${(bridged(cell.base, w, comp, comps[br]) as any).gap.toFixed(1)}, off-axis ${col(br)} deg)`; else return;
        keep[j] = changed = true;
      });
    }
    // Proposed fix: apply the floor inside the fixpoint, so a part the floor drops can never anchor another part.
    const ok = (comp: number[]) => comp.length >= floor || grip(comp, 6), fk = comps.map((_: unknown, j: number) => !j);
    for (let changed = true; changed;) {
      changed = false;
      const kept = new Uint8Array(cell.mask.length); comps.forEach((comp: number[], j: number) => { if (fk[j]) for (const p of comp) kept[p] = 1; });
      const close = dilate(kept, w, 3);
      comps.forEach((comp: number[], j: number) => {
        if (fk[j] || !ok(comp)) return;
        const past = 2 * comp.filter((p) => !cell.base.data[p * 4 + 3]).length >= comp.length;
        if (comp.some((p) => close[p]) || grip(comp, 3) || (past && comps.some((o: number[], q: number) => fk[q] && bridged(cell.base, w, comp, o)))) fk[j] = changed = true;
      });
    }
    comps.forEach((comp: number[], j: number) => { const cur = !j || (keep[j] && ok(comp)); if (cur !== fk[j]) console.log('  FIX CHANGES', c.id, cell.key, 'component', j, comp.length, 'px: current', cur, 'fixed', fk[j]); });
    const big = new Uint8Array(cell.mask.length); for (const p of comps[0]) big[p] = 1; const nearBig = dilate(big, w, 3);
    const rows = comps.map((comp: number[], j: number) => {
      const final = !j || (keep[j] && (comp.length >= floor || grip(comp, 6)));
      const oldFinal = !j || ((comp.some((p) => nearBig[p]) || grip(comp, 3)) && (comp.length >= floor || grip(comp, 6)));
      const xs = comp.map((p) => p % w), ys = comp.map((p) => (p / w) | 0);
      return { j, n: comp.length, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], why: why[j] || '-', final, oldFinal };
    });
    if (rows.some((x: any) => x.final !== x.oldFinal) || rows.some((x: any) => x.why !== '-' && !x.final && x.j))
      console.log(c.id, cell.key, `floor ${floor.toFixed(1)}`, JSON.stringify(rows.filter((x: any) => x.j && (x.final || x.oldFinal || x.why !== '-'))));
  }
}
