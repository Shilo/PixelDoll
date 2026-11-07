// Re-review repro: qaReasons (studio/model.ts) picks the G3 limit from each clip's cell route, while production gates
// every cell of a skeleton-method item at GATES.keyOutsidePosed (run.ts evaluateItem: kOut by d.spec.method; poseItemClip,
// regridClip and equipment/generate.ts always posed). A skel item's dressed standing view has route 'ea2'.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/challenge/qa-reasons-repro.ts
import { qaReasons } from '../../../../../app/src/studio/model.ts';
import type { ItemQa, QaSummary } from '../../../../../app/src/lib/store/manifest.ts';
const clean: QaSummary = { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, status: 'pass' };
// Standing view of a skel item: key outside 0.04 passed G3 (limit 0.05); the view warns only for G7 (3 px on the border).
const standing = { ...clean, maxKeyOutside: 0.04, clipPx: 3, status: 'warn' as const };
const q: ItemQa = { ...clean, status: 'warn', maxKeyOutside: 0.04, clipPx: 3, rerolls: 0,
  cells: { 'default/south/0': { route: 'ea2', area: 10 } } as ItemQa['cells'], clips: { 'default/south': standing } };
console.log('skel item, standing view warned for G7 only ->', qaReasons(q, false));
// G2 needs keyKept < 0.97 AND more than 8 lost px (items.ts g2Fails); the summary keeps only keyKept.
const g2 = { ...q, clips: { 'default/south': { ...clean, minKeyKept: 0.95, clipPx: 3, status: 'warn' as const } } };
console.log('keyKept 0.95 with few lost px, warned for G7 only ->', qaReasons(g2, false));
