import { tuckedId } from '../compose/compose.ts';
import { itemExportId, moveExportId } from '../store/identity.ts';
import type { Layer, Manifest, Project } from '../store/manifest.ts';

/** The project as games see it: item and move IDs replaced by their export IDs (manifest-internal IDs never leave). */
export function projectExportIdentity(project: Project): Project {
	const source = project.manifest;
	const items = source.items.some((item) => !item.variantOf && item.exportId !== undefined),
		moves = source.rig.animations.some((move) => move.exportId !== undefined);
	if (!items && !moves) return project;
	const manifest: Manifest = structuredClone(source);
	const layerImages =
		project.layerImages && new Map<Layer, Map<string, import('../image/png.ts').Img>>();
	if (layerImages)
		for (const [itemIndex, item] of source.items.entries())
			for (const [layerIndex, layer] of item.layers.entries()) {
				const images = project.layerImages?.get(layer);
				if (images) layerImages.set(manifest.items[itemIndex].layers[layerIndex], images);
			}
	if (items) exportItemIds(manifest);
	if (moves) exportMoveIds(manifest);
	return { ...project, manifest, layerImages };
}

function exportItemIds(manifest: Manifest) {
	const ids = new Map(
		manifest.items.filter((item) => !item.variantOf).map((item) => [item.id, itemExportId(item)])
	);
	const mapId = (id: string) => ids.get(id) ?? id;
	for (const item of manifest.items) {
		if (!item.variantOf) continue;
		const covers = item.underAll ?? (item.under ? [item.under] : []);
		ids.set(item.id, tuckedId(mapId(item.variantOf), covers.map(mapId).sort()));
	}
	for (const item of manifest.items) {
		item.id = mapId(item.id);
		delete item.exportId;
		if (item.variantOf) item.variantOf = mapId(item.variantOf);
		if (item.under) item.under = mapId(item.under);
		if (item.underAll) item.underAll = item.underAll.map(mapId).sort();
	}
	manifest.rig.baseItem = mapId(manifest.rig.baseItem);
	for (const material of manifest.materials) material.owner = mapId(material.owner);
	for (const preset of manifest.presets)
		for (const [slot, id] of Object.entries(preset.items))
			if (id != null) preset.items[slot] = mapId(id);
}

/** Every move-keyed field the manifest keeps, so exported frames, keypoints, depth exceptions and records agree. */
function exportMoveIds(manifest: Manifest) {
	const ids = new Map(manifest.rig.animations.map((move) => [move.id, moveExportId(move)]));
	const mapId = (id: string) => ids.get(id) ?? id;
	const mapCell = <K extends string>(key: K) => {
		const [move, ...rest] = key.split('/');
		return [mapId(move), ...rest].join('/') as K;
	};
	const rekey = <R extends Record<string, unknown>>(record: R, map: (key: string) => string) =>
		Object.fromEntries(Object.entries(record).map(([key, value]) => [map(key), value])) as R;
	for (const move of manifest.rig.animations) {
		move.id = mapId(move.id);
		delete move.exportId;
	}
	const anchors = manifest.rig.anchors ?? {};
	for (const anchor of Object.keys(anchors) as (keyof typeof anchors)[])
		anchors[anchor] = rekey(anchors[anchor]!, mapId);
	for (const slot of manifest.slots)
		for (const override of slot.zOverrides ?? [])
			if (override.anim !== undefined) override.anim = mapId(override.anim);
	for (const item of manifest.items) {
		for (const layer of item.layers) if (layer.cells) layer.cells = rekey(layer.cells, mapId);
		if (item.baseCut) item.baseCut = rekey(item.baseCut, mapId);
		if (item.standing) item.standing = mapId(item.standing);
		if (item.anchorCell) item.anchorCell = mapCell(item.anchorCell);
		if (item.coverage) item.coverage = item.coverage.map(mapCell);
		if (item.pending) item.pending = item.pending.map(mapCell);
		for (const call of item.provenance) call.produced = call.produced.map(mapCell);
		if (item.qa) {
			item.qa.cells = rekey(item.qa.cells, mapCell);
			item.qa.clips = rekey(item.qa.clips, mapCell);
			if (item.qa.inherited) item.qa.inherited.clips = item.qa.inherited.clips.map(mapCell);
		}
		// `unfitted[].from` names the source body's move, not one of this rig's.
		for (const note of [...(item.unfitted ?? []), ...(item.refit ?? [])])
			if (note.anim) note.anim = mapId(note.anim);
		for (const edit of [...(item.paletteRepairs ?? []), ...(item.frameEdits ?? [])])
			edit.anim = mapId(edit.anim);
	}
}
