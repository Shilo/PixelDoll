// Round 8 (2026-10-26): mocap move library + attack polish. Reuses round 6's harness (x26/lib.mts) with its own ledger
// (out/x27/ledger.jsonl) and a 2,000-generation cap; same rules: `.sent` marker per paid call, never an automatic resend.
process.env.C25_RUN ??= 'x27';
process.env.C25_CAP ??= '2000';
const x26 = await import('../x26/lib.mts');
export const { api, b64, save, load, items, chroma, clips, OUT, spent, TOTAL_CAP, call, renderBody, BODY, RIG, CELL, LOOKS, SEED, restKps, flipH } = x26;
export const { pool } = await import('../c25/lib.mts'); // same module instance as x26's
export type { Img } from '../x26/lib.mts';
