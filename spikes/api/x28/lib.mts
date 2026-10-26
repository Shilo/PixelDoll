// Round 9 (2026-10-26): skeleton-free route. The body animates with PixelLab's text models; items are dressed onto the
// body's real frames. Reuses round 6's harness with its own ledger (out/x28/ledger.jsonl) and the budget left from the
// owner's 2,000 (round 8 spent 186); same rules: `.sent` marker per paid call, never an automatic resend.
process.env.C25_RUN ??= 'x28';
process.env.C25_CAP ??= '1814';
const x26 = await import('../x26/lib.mts');
export const { api, b64, save, load, items, chroma, clips, OUT, spent, TOTAL_CAP, call, BODY, RIG, CELL, SEED, flipH } = x26;
export const { pool } = await import('../c25/lib.mts');
export type { Img } from '../x26/lib.mts';
export const DIRS = ['south', 'east'] as const;
/** Frames of a stored call, in label order. */
export async function framesOf(file: string) {
  const fs = await import('node:fs');
  if (!fs.existsSync(`${file}.json`)) return null;
  const labels: string[] = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8')).labels;
  const key = (l: string) => +(l.split('/').pop() ?? l);
  return Promise.all([...labels].sort((a, b) => key(a) - key(b)).map((l) => load(`${file}.${l.replace(/\//g, '_')}.png`)));
}
