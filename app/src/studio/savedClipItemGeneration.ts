import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
import { setupRedoMoves } from '../lib/rig/setup.ts';
import { message } from '../lib/message.ts';
import type { Project } from '../lib/store/manifest.ts';
import { unposedItemMoves } from './create.ts';
import { clipItemOffer, clipMissingItems } from './itemGeneration.ts';
import { currentItemDrawing } from './settingsDefaults.svelte.ts';
import { isDemo, pendingMoves, store } from './state.svelte.ts';

const emptyGeneration = {
	rows: [],
	available: false,
	unposedNote: undefined,
	unavailableReason: undefined
};

export function pendingClipItems(projectId: string, clipId: string) {
	return new Set(
		pendingMoves(projectId)
			.filter((spec) => spec.id === clipId)
			.flatMap((spec) => spec.items)
	);
}

/** Missing artwork and priced offers answer different questions. A missing item may be pending or have no usable route. */
export function savedClipItemGeneration(
	project: Project | null,
	projectId: string,
	clipId: string
) {
	if (isDemo()) return { ...emptyGeneration, unavailableReason: message('itemPane.demoMissing') };
	if (!project || clipId === DEFAULT_MOVE) return emptyGeneration;
	const { manifest, images } = project;
	const missing = clipMissingItems(manifest, clipId);
	if (!missing.length) return emptyGeneration;
	const pending = pendingClipItems(projectId, clipId);
	const drawing = currentItemDrawing();
	const redo = setupRedoMoves(store.exportRecord);
	const rows = missing.map((item) => {
		const inProgress = pending.has(item.id);
		return {
			item,
			pending: inProgress,
			offer: inProgress ? null : clipItemOffer(manifest, item.id, clipId, drawing, { redo, images })
		};
	});
	return {
		rows,
		available: rows.some(({ offer }) => !!offer?.specs.length),
		get unposedNote() {
			const offered = rows.find(({ offer }) => offer?.unposed.length)?.offer?.unposed[0];
			return (
				offered ??
				rows
					.filter((row) => !row.pending)
					.flatMap(({ item }) => unposedItemMoves(manifest, item.id, drawing, redo))
					.find((entry) => entry.move === clipId)?.note
			);
		},
		get unavailableReason() {
			if (rows.every((row) => row.pending)) return message('itemGeneration.allPending');
			if (
				rows.every(
					({ item, pending }) => !pending && !Object.values(item.dressed ?? {}).some(Boolean)
				)
			)
				return message('itemGeneration.standingDesignsNeeded');
			if (rows.length === 1 && rows[0].offer?.error) return rows[0].offer.error;
			return undefined;
		}
	};
}
