// Renders catalog moves on the bare body with raw skeleton-v3 (one call per move and direction, 3 gens up to 12 frames).
// Usage (spikes/api): node --env-file=<repo root>/.env x27/render.mts <arm> <dirs comma> <move ids...>
import { renderBody, spent, TOTAL_CAP, pool } from './lib.mts';
import { MOVES, seq } from './moves.mts';
const [arm, dirs, ...ids] = process.argv.slice(2);
const moves = ids.map((id) => MOVES.find((m) => m.id === id) ?? (() => { throw new Error(`no move ${id}`); })());
await pool(moves.flatMap((m) => dirs.split(',').map((d) => () => renderBody({ arm, armCap: 2000, name: m.id, dir: d, action: m.action, keypoints: seq(m, d as any).frames }))), 16); // tier 3 allows 20 concurrent jobs
console.log(`spent ${spent()} / ${TOTAL_CAP}`);
