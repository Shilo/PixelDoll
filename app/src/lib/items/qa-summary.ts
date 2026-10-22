import type { CellKey, CellQa, Item, ItemQa, QaSummary } from '../store/manifest.ts';

export const clipOf = (key: string) => key.split('/').slice(0, 2).join('/');
export function summaryOf(q: ItemQa): QaSummary {
  const { cells: _, clips: __, legacy: ___, rerolls: ____, ...summary } = q;
  return summary;
}

/** Accept only the exceptions; clean clips can stay clean after those exceptions are replaced. */
export function acceptQa(q: ItemQa): ItemQa {
  return { ...q, status: q.status === 'pass' ? 'pass' : 'accepted', ...(q.clips ? {
    clips: Object.fromEntries(Object.entries(q.clips).map(([k, s]) => [k, { ...s, status: s.status === 'pass' ? 'pass' : 'accepted' }])),
  } : {}) };
}

/** Replace complete clip-directions. Historical checks without parts remain an explicitly conservative baseline. */
export function mergeQa(item: Item, next: ItemQa, cells: Record<CellKey, CellQa>): ItemQa {
  const old = item.qa, clips = { ...old?.clips, ...next.clips }, replaced = new Set(Object.keys(next.clips ?? {}));
  const original = [...new Set(item.layers.flatMap((l) => Object.entries(l.cells ?? {}).flatMap(([a, dirs]) => Object.keys(dirs).map((d) => `${a}/${d}`))))];
  const baseline = old?.legacy ?? (!old?.clips ? { clips: original, ...(old ? { summary: summaryOf(old) } : {}) } : undefined);
  const remaining = baseline?.clips.filter((k) => !replaced.has(k)) ?? [];
  const legacy = remaining.length ? { ...baseline!, clips: remaining } : undefined;
  const parts: (QaSummary & { hand?: 'r' | 'l' | '?' })[] = [...Object.values(clips), ...(legacy?.summary ? [legacy.summary] : [])];
  const min = (k: 'minKeyKept' | 'minAreaRatio') => Math.min(1, ...parts.map((p) => p[k]));
  const max = (k: 'maxKeyOutside' | 'maxAreaCV' | 'maxPaletteDist') => Math.max(0, ...parts.map((p) => p[k]));
  const sum = (k: 'clipPx' | 'shiftedFrames' | 'strayPx') => parts.reduce((n, p) => n + (p[k] ?? 0), 0);
  const decided = parts.filter((p) => p.hand === 'r' || p.hand === 'l');
  const switched = new Set(decided.map((p) => p.hand)).size > 1 || parts.some((p) => p.handedness === 'switched');
  // Each clip already checks its hand against the slot. Do not reopen accepted exceptions by majority vote.
  const status = parts.some((p) => p.status === 'fail') ? 'fail'
    : parts.some((p) => p.status === 'warn') ? 'warn'
    : parts.some((p) => p.status === 'accepted') ? 'accepted' : legacy ? 'warn' : 'pass';
  const grip = parts.some((p) => p.grip) ? {
    R: parts.reduce((n, p) => n + (p.grip?.R ?? 0), 0), L: parts.reduce((n, p) => n + (p.grip?.L ?? 0), 0),
    amb: parts.reduce((n, p) => n + (p.grip?.amb ?? 0), 0), none: parts.reduce((n, p) => n + (p.grip?.none ?? 0), 0),
  } : undefined;
  return {
    ...(parts.some(p => p.unmeasured) ? { unmeasured: true } : {}),
    minKeyKept: min('minKeyKept'), minAreaRatio: min('minAreaRatio'), maxKeyOutside: max('maxKeyOutside'), maxAreaCV: max('maxAreaCV'), maxPaletteDist: max('maxPaletteDist'),
    clipPx: sum('clipPx'), shiftedFrames: sum('shiftedFrames'), strayPx: sum('strayPx'),
    ...(grip ? { grip } : {}), ...(parts.some((p) => p.handedness) ? { handedness: switched ? 'switched' : 'ok' } : {}),
    status, rerolls: (old?.rerolls ?? 0) + next.rerolls, clips, ...(legacy ? { legacy } : {}),
    cells: { ...Object.fromEntries(Object.entries(old?.cells ?? {}).filter(([k]) => !replaced.has(clipOf(k)))), ...cells },
  };
}
