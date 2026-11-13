import type { CellKey, CellQa, Item, ItemQa, QaSummary } from '../store/manifest.ts';

export const clipOf = (key: string) => key.split('/').slice(0, 2).join('/');
export function summaryOf(q: ItemQa): QaSummary {
	const { cells: _, clips: __, inherited: ___, rerolls: ____, ...summary } = q;
	return summary;
}

/** Accept only the exceptions; clean clips can stay clean after those exceptions are replaced. */
export function acceptQa(q: ItemQa): ItemQa {
	return {
		...q,
		status: q.status === 'pass' ? 'pass' : 'accepted',
		...(q.clips
			? {
					clips: Object.fromEntries(
						Object.entries(q.clips).map(([k, s]) => [
							k,
							{ ...s, status: s.status === 'pass' ? 'pass' : 'accepted' }
						])
					)
				}
			: {})
	};
}

export function retainItemQa(item: Item, keep: (key: string) => boolean): void {
	const old = item.qa;
	if (!old) return;
	if (
		!item.layers.some((layer) =>
			Object.entries(layer.cells ?? {}).some(([anim, dirs]) =>
				Object.keys(dirs).some((dir) => keep(`${anim}/${dir}`))
			)
		)
	) {
		delete item.qa;
		return;
	}
	const inheritedClips = old.inherited?.clips.filter(keep);
	const filtered: ItemQa = {
		...old,
		clips: Object.fromEntries(Object.entries(old.clips).filter(([key]) => keep(key))),
		cells: Object.fromEntries(Object.entries(old.cells).filter(([key]) => keep(key)))
	};
	if (inheritedClips?.length) filtered.inherited = { ...old.inherited!, clips: inheritedClips };
	else delete filtered.inherited;
	item.qa = mergeQa(
		{ ...item, qa: filtered },
		{
			minKeyKept: 1,
			maxKeyOutside: 0,
			minAreaRatio: 1,
			maxAreaCV: 0,
			maxPaletteDist: 0,
			clipPx: 0,
			status: 'pass',
			rerolls: 0,
			clips: {},
			cells: {}
		},
		{}
	);
}

/** Replace complete clip-directions. Inherited checks (`inherited`) remain an explicitly conservative baseline. */
export function mergeQa(item: Item, next: ItemQa, cells: Record<CellKey, CellQa>): ItemQa {
	const old = item.qa,
		clips = { ...old?.clips, ...next.clips },
		replaced = new Set(Object.keys(next.clips));
	const original = [
		...new Set(
			item.layers.flatMap((l) =>
				Object.entries(l.cells ?? {}).flatMap(([a, dirs]) =>
					Object.keys(dirs).map((d) => `${a}/${d}`)
				)
			)
		)
	];
	// An item without any checks (the demo's items): every original clip stays explicitly unmeasured.
	const baseline = old ? old.inherited : { clips: original };
	const remaining = baseline?.clips.filter((k) => !replaced.has(k)) ?? [];
	const inherited = remaining.length ? { ...baseline!, clips: remaining } : undefined;
	const parts: (QaSummary & { hand?: 'r' | 'l' | '?' })[] = [
		...Object.values(clips),
		...(inherited?.summary ? [inherited.summary] : [])
	];
	const min = (k: 'minKeyKept' | 'minAreaRatio') => Math.min(1, ...parts.map((p) => p[k]));
	const max = (k: 'maxKeyOutside' | 'maxAreaCV' | 'maxPaletteDist') =>
		Math.max(0, ...parts.map((p) => p[k]));
	const sum = (
		k:
			| 'clipPx'
			| 'shiftedFrames'
			| 'strayPx'
			| 'missingLowerFrames'
			| 'footwearReviewFrames'
			| 'waistReviewFrames'
			| 'facingReviewFrames'
			| 'detailReviewFrames'
			| 'rawKeyReviewFrames'
			| 'heldLoopReviewClips'
			| 'heldHangReviewClips'
			| 'motionReviewClips'
	) => parts.reduce((n, p) => n + (p[k] ?? 0), 0);
	const missingLowerFrames = sum('missingLowerFrames'),
		footwearReviewFrames = sum('footwearReviewFrames'),
		waistReviewFrames = sum('waistReviewFrames'),
		facingReviewFrames = sum('facingReviewFrames');
	const decided = parts.filter((p) => p.hand === 'r' || p.hand === 'l');
	const switched =
		new Set(decided.map((p) => p.hand)).size > 1 || parts.some((p) => p.handedness === 'switched');
	// Each clip already checks its hand against the slot. Do not reopen accepted exceptions by majority vote.
	const status = parts.some((p) => p.status === 'fail')
		? 'fail'
		: parts.some((p) => p.status === 'warn')
			? 'warn'
			: parts.some((p) => p.status === 'accepted')
				? 'accepted'
				: inherited
					? 'warn'
					: 'pass';
	const grip = parts.some((p) => p.grip)
		? {
				R: parts.reduce((n, p) => n + (p.grip?.R ?? 0), 0),
				L: parts.reduce((n, p) => n + (p.grip?.L ?? 0), 0),
				amb: parts.reduce((n, p) => n + (p.grip?.amb ?? 0), 0),
				none: parts.reduce((n, p) => n + (p.grip?.none ?? 0), 0)
			}
		: undefined;
	return {
		...(parts.some((p) => p.unmeasured) ? { unmeasured: true } : {}),
		minKeyKept: min('minKeyKept'),
		minAreaRatio: min('minAreaRatio'),
		maxKeyOutside: max('maxKeyOutside'),
		maxAreaCV: max('maxAreaCV'),
		maxPaletteDist: max('maxPaletteDist'),
		clipPx: sum('clipPx'),
		shiftedFrames: sum('shiftedFrames'),
		strayPx: sum('strayPx'),
		...(missingLowerFrames ? { missingLowerFrames } : {}),
		...(footwearReviewFrames ? { footwearReviewFrames } : {}),
		...(waistReviewFrames ? { waistReviewFrames } : {}),
		...(facingReviewFrames ? { facingReviewFrames } : {}),
		...(sum('detailReviewFrames') ? { detailReviewFrames: sum('detailReviewFrames') } : {}),
		...(sum('rawKeyReviewFrames') ? { rawKeyReviewFrames: sum('rawKeyReviewFrames') } : {}),
		...(sum('heldLoopReviewClips') ? { heldLoopReviewClips: sum('heldLoopReviewClips') } : {}),
		...(sum('heldHangReviewClips') ? { heldHangReviewClips: sum('heldHangReviewClips') } : {}),
		...(sum('motionReviewClips') ? { motionReviewClips: sum('motionReviewClips') } : {}),
		...(grip ? { grip } : {}),
		...(parts.some((p) => p.handedness) ? { handedness: switched ? 'switched' : 'ok' } : {}),
		status,
		rerolls: (old?.rerolls ?? 0) + next.rerolls,
		clips,
		...(inherited ? { inherited } : {}),
		cells: {
			...Object.fromEntries(
				Object.entries(old?.cells ?? {}).filter(([k]) => !replaced.has(clipOf(k)))
			),
			...cells
		}
	};
}
