// The item-generation route the New item sheet talks to. The Studio only sees this interface (routes keep changing as
// spikes land); swap `itemRoute` to change the backend. Today: B4's runner (lib/items/run.ts): chroma mannequin, dressed
// keyframe posed with skeleton-v3 per clip (or anchor-cell edit-animation-v2 without joints), extraction, QA gates, re-rolls.
import { pickKey } from '../lib/image/chroma.ts';
import { acceptItem, defaultMethod, gensOf, newDraft, runItem, type Draft, type ItemResult, type RigCtx, type RunHooks } from '../lib/items/run.ts';
import { itemRoute as libRoute, padOf, planGens, planItem, type ItemSpec } from '../lib/items/items.ts';
import type { Item, Rig } from '../lib/store/manifest.ts';

export interface NewItemInput { name: string; slot: string; prompt: string }
export interface ItemRoute {
  label: string;
  /** Calls and cost before anything is spent ("Make · N gens"). */
  plan(rig: Rig, ctx: RigCtx, input: NewItemInput): { calls: number; cells: number; gens: number; minutes: number; minimumTier: number; cell?: number };
  /** New persisted job description (not started). */
  draft(ctx: RigCtx, input: NewItemInput, taken: string[]): Draft;
  /** Generate + QA (+ automatic re-rolls). Resumable from the ledger with the same draft. */
  run(d: Draft, ctx: RigCtx, hooks: RunHooks): Promise<ItemResult | null>;
  /** Write the accepted item into the project record. */
  accept(d: Draft, ctx: RigCtx, res?: ItemResult): Promise<Item>;
  spent(d: Draft): number;
}

/** Clips the item covers: every animation with base cells in every generated direction (the S2 fixture has punch for S/E only). */
export function coverage(ctx: RigCtx): Pick<ItemSpec, 'anims' | 'dirs' | 'clipDirs'> {
  const m = ctx.rec.manifest, base = m.items.find((i) => i.id === m.rig.baseItem)!.layers[0];
  const dirs = m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
  const clipDirs = Object.fromEntries(m.rig.animations.map((a) => [a.id, dirs.filter((d) => base.cells?.[a.id]?.[d]?.length === a.cells && base.cells[a.id][d]!.every(Boolean))]));
  const anims = m.rig.animations.filter((a) => clipDirs[a.id].length).map((a) => a.id);
  return { anims, dirs, clipDirs };
}
const spec = (ctx: RigCtx, i: NewItemInput): Omit<ItemSpec, 'id'> => ({ name: i.name, slot: i.slot, prompt: i.prompt, key: pickKey(i.prompt), ...coverage(ctx) });

export const chromaEdit: ItemRoute = {
  label: `chroma mannequin + ${libRoute.name}`,
  plan(rig, ctx, input) {
    const s = spec(ctx, input), method = defaultMethod(ctx, s), p = planItem(rig, { ...s, method }), pad = padOf(s.slot, method, rig.cell);
    // held slots route to S5's 96 px oversize canvas automatically (same price: pose calls bill by frames, not canvas)
    return { calls: p.length, cells: p.reduce((n, c) => n + c.cells.length, 0), gens: planGens(p), minutes: 3 + Math.ceil(p.length / 3) * 2, minimumTier: method === 'skel' ? 1 : 0, ...(pad ? { cell: rig.cell.w + 2 * pad } : {}) };
  },
  draft: (ctx, input, taken) => newDraft(ctx, spec(ctx, input), taken),
  run: (d, ctx, hooks) => runItem(d, ctx, hooks),
  accept: async (d, ctx, res) => (await acceptItem(d, ctx, res)).item,
  spent: (d) => gensOf(d),
};

export const itemRoute: ItemRoute = chromaEdit;
