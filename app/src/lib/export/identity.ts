import { tuckedId } from '../compose/compose.ts';
import { itemExportId } from '../store/identity.ts';
import type { Layer, Manifest, Project } from '../store/manifest.ts';
import { playbackClips } from '../runtime/timeline.js';

export function projectExportIdentity(project: Project): Project {
	const source = project.manifest;
	const clips = playbackClips(source.rig.animations);
	const manifest: Manifest = structuredClone(source);
	const clipIds = new Map(clips.map(({ id, key }) => [key, id]));
	const clipId = (id: string) => clipIds.get(id) ?? id;
	const scoped = <Key extends string>(key: Key): Key => {
		const slash = key.indexOf('/');
		return (slash < 0 ? clipId(key) : clipId(key.slice(0, slash)) + key.slice(slash)) as Key;
	};
	const keyed = <Value>(values: Record<string, Value>) =>
		Object.fromEntries(Object.entries(values).map(([key, value]) => [scoped(key), value]));
	const layerImages =
		project.layerImages && new Map<Layer, Map<string, import('../image/png.ts').Img>>();
	if (layerImages)
		for (const [itemIndex, item] of source.items.entries())
			for (const [layerIndex, layer] of item.layers.entries()) {
				const images = project.layerImages?.get(layer);
				if (images) layerImages.set(manifest.items[itemIndex].layers[layerIndex], images);
			}
	const ids = new Map(
		source.items.filter((item) => !item.variantOf).map((item) => [item.id, itemExportId(item)])
	);
	const mapId = (id: string) => ids.get(id) ?? id;
	for (const item of source.items) {
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
		if (item.standing) item.standing = clipId(item.standing);
		if (item.coverage) item.coverage = item.coverage.map(scoped);
		if (item.pending) item.pending = item.pending.map(scoped);
		if (item.anchorCell) item.anchorCell = scoped(item.anchorCell);
		if (item.baseCut) item.baseCut = keyed(item.baseCut);
		for (const layer of item.layers) {
			if (layer.cells) layer.cells = keyed(layer.cells);
			if (layer.sheets) layer.sheets = keyed(layer.sheets);
			if (layer.sourceSheets) layer.sourceSheets = keyed(layer.sourceSheets);
		}
		for (const note of [
			...(item.refit ?? []),
			...(item.unfitted ?? []),
			...(item.frameEdits ?? []),
			...(item.paletteRepairs ?? [])
		])
			if (note.anim) note.anim = clipId(note.anim);
		for (const entry of item.provenance) entry.produced = entry.produced.map(scoped);
		if (item.qa) {
			item.qa.cells = keyed(item.qa.cells ?? {});
			item.qa.clips = keyed(item.qa.clips ?? {});
			if (item.qa.inherited) item.qa.inherited.clips = item.qa.inherited.clips.map(scoped);
		}
	}
	for (const [index, entry] of clips.entries()) {
		manifest.rig.animations[index].id = entry.id;
		manifest.rig.animations[index].kind = entry.kind;
	}
	for (const anchor of Object.keys(manifest.rig.anchors ?? {}) as (keyof NonNullable<
		Manifest['rig']['anchors']
	>)[]) {
		const track = manifest.rig.anchors?.[anchor];
		if (track) manifest.rig.anchors![anchor] = keyed(track);
	}
	for (const slot of manifest.slots)
		for (const override of slot.zOverrides ?? [])
			if (override.anim) override.anim = clipId(override.anim);
	manifest.rig.baseItem = mapId(manifest.rig.baseItem);
	for (const material of manifest.materials) material.owner = mapId(material.owner);
	for (const preset of manifest.presets)
		for (const [slot, id] of Object.entries(preset.items))
			if (id != null) preset.items[slot] = mapId(id);
	return { ...project, manifest, layerImages };
}
