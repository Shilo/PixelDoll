// Foot contact and sliding measurement on frozen bench bodies (2026-11-07 cycle, motion). Offline, no network.
// For each side-view walk, per frame: requested ankle keypoints (LEFT LEG / RIGHT LEG = ankle end), the support foot (lower ankle),
// and the image ground-contact patch (opaque pixels in the lowest 2 rows). Reports how far the support foot moves while it stays
// the support foot (an in-place cycle should translate it backward at a steady rate; irregular steps read as sliding).
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/motion/foot-contact.ts
import { readFileSync } from 'node:fs';
import { decodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';

const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
const out: Record<string, unknown> = {};
for (const b of ['A', 'B', 'C', 'N']) {
  const body = JSON.parse(readFileSync(new URL(`body${b}.json`, FIX), 'utf8')) as { rig: Rig; rows: string[]; cols: string[] };
  const sheet = await decodePngBytes(new Uint8Array(readFileSync(new URL(`body${b}.png`, FIX)))), rig = body.rig, N = rig.cell.w;
  const walk = rig.animations.find((a) => a.id === 'walk'), dir = body.rows.includes('east') ? 'east' : undefined;
  if (!walk || !dir) continue;
  const ks = walk.sources?.[dir as 'east']?.keypoints as Keypoint[][] | undefined, row = body.rows.indexOf(dir);
  const frames = Array.from({ length: walk.cells }, (_, i) => {
    const col = body.cols.indexOf(`walk/${i}`);
    let bottom = -1;
    for (let y = N - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < N; x++) if (sheet.data[((row * N + y) * sheet.w + col * N + x) * 4 + 3]) { bottom = y; break; }
    const xs: number[] = [];
    for (let y = Math.max(0, bottom - 1); y <= bottom; y++) for (let x = 0; x < N; x++) if (sheet.data[((row * N + y) * sheet.w + col * N + x) * 4 + 3]) xs.push(x);
    const k = ks?.[i], at = (l: string) => { const q = k?.find((p) => p.label === l); return q ? [q.x * N, q.y * N] : null; };
    const L = at('LEFT LEG'), R = at('RIGHT LEG'), support = L && R ? (L[1] >= R[1] ? 'L' : 'R') : null;
    return { i, bottom, contactMinX: Math.min(...xs), contactMaxX: Math.max(...xs), support, ankleX: support === 'L' ? +L![0].toFixed(2) : support === 'R' ? +R![0].toFixed(2) : null, ankleY: support === 'L' ? +L![1].toFixed(2) : support === 'R' ? +R![1].toFixed(2) : null };
  });
  const steps = frames.map((f, i) => { const n = frames[(i + 1) % frames.length]; return f.support && f.support === n.support && f.ankleX != null && n.ankleX != null ? +(n.ankleX - f.ankleX).toFixed(2) : null; }).filter((v): v is number => v != null);
  out[`body${b} walk/${dir}`] = { cell: N, frames, supportSteps: steps, meanStep: steps.length ? +(steps.reduce((s, v) => s + v, 0) / steps.length).toFixed(2) : null, stepRange: steps.length ? [Math.min(...steps), Math.max(...steps)] : null, bottomRows: [...new Set(frames.map((f) => f.bottom))] };
}
console.log(JSON.stringify(out, null, 1));
