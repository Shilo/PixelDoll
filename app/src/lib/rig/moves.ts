import type { Manifest } from '../store/manifest.ts';
import type { Item } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { retainItemQa } from '../items/qa-summary.ts';
import { baseHashOf, storedCellHashes } from './rig.ts';
import { stableStringify } from '../image/hash.ts';
import { assignNewClipExportId } from '../store/identity.ts';

/** Drop every row of one item that belongs to a clip `ids` does not keep. A restored item uses this to meet the moves the
 *  character still has, instead of bringing back frames for moves deleted since. */
export function retainItemMoves(item: Item, ids: ReadonlySet<string>): void {
	for (const layer of item.layers)
		for (const key of ['cells', 'sheets', 'sourceSheets'] as const)
			for (const id of Object.keys(layer[key] ?? {})) if (!ids.has(id)) delete layer[key]![id];
	for (const id of Object.keys(item.baseCut ?? {})) if (!ids.has(id)) delete item.baseCut![id];
	for (const key of ['coverage', 'pending'] as const)
		if (item[key]) item[key] = item[key].filter((cell) => ids.has(cell.split('/')[0]));
	if (item.anchorCell && !ids.has(item.anchorCell.split('/')[0])) delete item.anchorCell;
	if (item.refit) item.refit = item.refit.filter((note) => ids.has(note.anim));
	if (item.standing && !ids.has(item.standing)) delete item.standing;
	retainItemQa(item, (key) => ids.has(key.split('/')[0]));
}

export async function retainMoves(manifest: Manifest, ids: ReadonlySet<string>): Promise<Manifest> {
	const result = structuredClone(manifest);
	result.rig.animations = result.rig.animations.filter((move) => ids.has(move.id));
	for (const track of Object.values(result.rig.anchors ?? {}))
		for (const id of Object.keys(track)) if (!ids.has(id)) delete track[id];
	for (const slot of result.slots)
		if (slot.zOverrides)
			slot.zOverrides = slot.zOverrides.filter((entry) => !entry.anim || ids.has(entry.anim));
	for (const item of result.items) retainItemMoves(item, ids);
	const base = result.items.find((item) => item.id === result.rig.baseItem);
	if (!base) throw new Error('This character has no base body.');
	const prior = result.rig.baseHash;
	result.rig.baseHash = await baseHashOf(
		result.rig,
		storedCellHashes(result.rig, base.layers[0].cells)
	);
	for (const item of result.items) if (item.baseHash === prior) item.baseHash = result.rig.baseHash;
	return result;
}

/** The inverse of retainMoves and retainMoveMetadata for one deleted move: put its clip and every row scoped to it back,
 *  but only where nothing newer holds that place. Refuses when the frames can no longer line up (the frame size or the
 *  directions changed since), because pasting old frames onto a new rig is worse than not restoring. */
export async function restoreMove(
	record: Pick<StoredProject, 'manifest' | 'skeletons' | 'rigQa'>,
	before: Pick<StoredProject, 'manifest' | 'skeletons' | 'rigQa'>,
	moveId: string
): Promise<'restored' | 'exists' | 'missing' | 'geometry' | 'itemsMissing'> {
	const m = record.manifest,
		b = before.manifest;
	const clip = b.rig.animations.find((a) => a.id === moveId);
	if (!clip) return 'missing';
	if (m.rig.animations.some((a) => a.id === moveId)) return 'exists';
	if (
		m.rig.cell.w !== b.rig.cell.w ||
		m.rig.cell.h !== b.rig.cell.h ||
		stableStringify(m.rig.directions) !== stableStringify(b.rig.directions)
	)
		return 'geometry';
	// This move's rows for an item that is itself deleted cannot be placed: it must come back first, or they would be lost.
	const owns = (item: (typeof b.items)[number]) =>
		item.layers.some(
			(layer) => layer.cells?.[moveId] || layer.sheets?.[moveId] || layer.sourceSheets?.[moveId]
		) ||
		!!item.baseCut?.[moveId] ||
		item.standing === moveId ||
		!!item.anchorCell?.startsWith(`${moveId}/`);
	if (b.items.some((item) => owns(item) && !m.items.some((live) => live.id === item.id)))
		return 'itemsMissing';
	const at = b.rig.animations.findIndex((a) => a.id === moveId);
	m.rig.animations.splice(Math.min(at, m.rig.animations.length), 0, structuredClone(clip));
	// Two clips must not export under one ID: the restored one takes the next free suffix.
	assignNewClipExportId(
		m.rig.animations[Math.min(at, m.rig.animations.length - 1)],
		m.rig.animations
	);
	// Anchors, which follow the clip's poses.
	for (const [anchor, track] of Object.entries(b.rig.anchors ?? {})) {
		const saved = track?.[moveId];
		if (!saved) continue;
		const tracks = (m.rig.anchors ??= {}) as Record<string, Record<string, unknown>>;
		(tracks[anchor] ??= {})[moveId] = structuredClone(saved);
	}
	// Slot draw overrides for this move only.
	for (const slot of m.slots) {
		const was = b.slots.find((s) => s.id === slot.id);
		const saved = (was?.zOverrides ?? []).filter((o) => o.anim === moveId);
		if (!saved.length) continue;
		const have = new Set((slot.zOverrides ?? []).map((o) => stableStringify(o)));
		const add = saved.filter((o) => !have.has(stableStringify(o)));
		if (add.length) slot.zOverrides = [...(slot.zOverrides ?? []), ...add];
	}
	for (const item of m.items) {
		const was = b.items.find((i) => i.id === item.id);
		if (!was) continue;
		for (const layer of item.layers) {
			// Layers are matched by ID: a layer added since must not receive rows meant for another one.
			const old = was.layers.find((entry) => entry.id === layer.id);
			if (!old) continue;
			for (const key of ['cells', 'sheets', 'sourceSheets'] as const) {
				const saved = old[key]?.[moveId];
				if (saved === undefined || layer[key]?.[moveId] !== undefined) continue;
				const target = (layer[key] ??= {}) as Record<string, unknown>;
				target[moveId] = structuredClone(saved);
			}
		}
		const cut = was.baseCut?.[moveId];
		if (cut !== undefined) {
			item.baseCut ??= {};
			if (item.baseCut[moveId] === undefined) item.baseCut[moveId] = structuredClone(cut);
		}
		for (const key of ['coverage', 'pending'] as const) {
			const saved = (was[key] ?? []).filter((cell) => cell.split('/')[0] === moveId);
			if (!saved.length) continue;
			const have = new Set(item[key] ?? []);
			item[key] = [...(item[key] ?? []), ...saved.filter((cell) => !have.has(cell))];
		}
		if (was.anchorCell?.startsWith(`${moveId}/`) && !item.anchorCell)
			item.anchorCell = was.anchorCell;
		const refits = (was.refit ?? []).filter((note) => note.anim === moveId);
		if (refits.length) {
			const have = new Set((item.refit ?? []).map((note) => stableStringify(note)));
			item.refit = [
				...(item.refit ?? []),
				...refits.filter((note) => !have.has(stableStringify(note)))
			];
		}
		if (was.standing === moveId && !item.standing) item.standing = moveId;
		// QA: the move's own rows go back, and an item whose QA was dropped with the move takes it whole.
		if (was.qa) {
			const clips = Object.fromEntries(
				Object.entries(was.qa.clips ?? {}).filter(([key]) => key.split('/')[0] === moveId)
			);
			const cells = Object.fromEntries(
				Object.entries(was.qa.cells ?? {}).filter(([key]) => key.split('/')[0] === moveId)
			);
			if (Object.keys(clips).length || Object.keys(cells).length) {
				if (!item.qa) item.qa = structuredClone(was.qa);
				else {
					item.qa.clips = { ...item.qa.clips, ...clips };
					item.qa.cells = { ...item.qa.cells, ...cells };
					const inherited = (was.qa.inherited?.clips ?? []).filter(
						(key) => key.split('/')[0] === moveId
					);
					if (inherited.length)
						item.qa.inherited = item.qa.inherited
							? {
									...item.qa.inherited,
									clips: [...new Set([...item.qa.inherited.clips, ...inherited])]
								}
							: { ...was.qa.inherited!, clips: inherited };
				}
			}
		}
	}
	// Pose and QA records kept beside the manifest.
	if (record.skeletons) {
		for (const [key, value] of Object.entries(before.skeletons ?? {}))
			if (key.split('/')[0] === moveId && record.skeletons[key] === undefined)
				record.skeletons[key] = structuredClone(value);
	}
	const wrote = before.rigQa as
			{ clips?: Record<string, unknown>; warnings?: string[] } | undefined,
		now = record.rigQa as { clips?: Record<string, unknown>; warnings?: string[] } | undefined;
	const savedClips = Object.fromEntries(
		Object.entries(wrote?.clips ?? {}).filter(([key]) => key.split('/')[0] === moveId)
	);
	const savedWarnings = (wrote?.warnings ?? []).filter(
		(warning) => warning.startsWith(`${moveId}/`) || warning.startsWith(`${moveId} `)
	);
	if (Object.keys(savedClips).length || savedWarnings.length) {
		if (!now) record.rigQa = structuredClone(before.rigQa);
		else {
			now.clips = { ...(now.clips ?? {}), ...savedClips };
			now.warnings = [
				...(now.warnings ?? []),
				...savedWarnings.filter((warning) => !(now.warnings ?? []).includes(warning))
			];
		}
	}
	// The body hash retainMoves recomputed: the restored clip is part of it again.
	const base = m.items.find((item) => item.id === m.rig.baseItem);
	if (!base) return 'geometry';
	const prior = m.rig.baseHash;
	m.rig.baseHash = await baseHashOf(m.rig, storedCellHashes(m.rig, base.layers[0].cells));
	for (const item of m.items) if (item.baseHash === prior) item.baseHash = m.rig.baseHash;
	return 'restored';
}

export function retainMoveMetadata(
	metadata: Pick<StoredProject, 'skeletons' | 'rigQa'>,
	ids: ReadonlySet<string>
) {
	const result = structuredClone({ skeletons: metadata.skeletons, rigQa: metadata.rigQa });
	if (result.skeletons)
		result.skeletons = Object.fromEntries(
			Object.entries(result.skeletons).filter(([key]) => ids.has(key.split('/')[0]))
		);
	if (result.rigQa && typeof result.rigQa === 'object') {
		const qa = result.rigQa as { clips?: Record<string, unknown>; warnings?: string[] };
		if (qa.clips)
			qa.clips = Object.fromEntries(
				Object.entries(qa.clips).filter(([key]) => ids.has(key.split('/')[0]))
			);
		if (qa.warnings)
			qa.warnings = qa.warnings.filter((warning) => {
				const scoped = /^([^/ :]+)\//.exec(warning);
				return !scoped || ids.has(scoped[1]);
			});
	}
	return result;
}
