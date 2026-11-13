import type { Manifest } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { retainItemQa } from '../items/qa-summary.ts';
import { baseHashOf, storedCellHashes } from './rig.ts';

export async function retainMoves(manifest: Manifest, ids: ReadonlySet<string>): Promise<Manifest> {
	const result = structuredClone(manifest);
	result.rig.animations = result.rig.animations.filter((move) => ids.has(move.id));
	for (const track of Object.values(result.rig.anchors ?? {}))
		for (const id of Object.keys(track)) if (!ids.has(id)) delete track[id];
	for (const slot of result.slots)
		if (slot.zOverrides)
			slot.zOverrides = slot.zOverrides.filter((entry) => !entry.anim || ids.has(entry.anim));
	for (const item of result.items) {
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
