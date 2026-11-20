import { tuckedId } from '../compose/compose.ts';
import { itemExportId } from '../store/identity.ts';
import type { Layer, Manifest, Project } from '../store/manifest.ts';

export function projectExportIdentity(project: Project): Project {
	const source = project.manifest;
	if (!source.items.some((item) => !item.variantOf && item.exportId !== undefined)) return project;
	const manifest: Manifest = structuredClone(source);
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
	}
	manifest.rig.baseItem = mapId(manifest.rig.baseItem);
	for (const material of manifest.materials) material.owner = mapId(material.owner);
	for (const preset of manifest.presets)
		for (const [slot, id] of Object.entries(preset.items))
			if (id != null) preset.items[slot] = mapId(id);
	return { ...project, manifest, layerImages };
}
