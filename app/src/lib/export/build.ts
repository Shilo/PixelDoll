// What the Export sheet and the ⋮ menus' Download ZIP export: a character with its current look and saved outfits, or
// a single item on the base body. Pure; the Studio supplies the project, look and settings.
import { exportZip } from './export.ts';
import { storeVariants, variantOf } from '../dress/dress.ts';
import { itemHashes } from '../equipment/copy.ts';
import { retainMoves } from '../rig/moves.ts';
import { DEFAULT_MOVE } from '../rig/rig.ts';
import { applyExportSettings, type ExportSettings } from '../store/export-settings.ts';
import type { ImportedCharacter } from '../store/import.ts';
import type { Engine, Item, Manifest, Preset, Project } from '../store/manifest.ts';

export type Look = Pick<Preset, 'items' | 'variants'> & Partial<Pick<Preset, 'id' | 'name'>>;

export async function moveProject(project: Project, moveId: string): Promise<Project> {
	if (!project.manifest.rig.animations.some((move) => move.id === moveId))
		throw new Error('This move is no longer available.');
	const ids = new Set([DEFAULT_MOVE, moveId]);
	for (const item of project.manifest.items) {
		if (item.standing) ids.add(item.standing);
		if (item.route === 'ea2-anchor' && item.anchorCell) ids.add(item.anchorCell.split('/')[0]);
	}
	return { ...project, manifest: await retainMoves(project.manifest, ids) };
}

export function outfitProject(
	project: Project,
	outfitId: string
): { project: Project; look: Look } {
	const outfit = project.manifest.presets.find((preset) => preset.id === outfitId);
	if (!outfit) throw new Error('This outfit is no longer available.');
	const saved = structuredClone(outfit);
	const selected = lookProject(
		project,
		saved,
		new Set([
			project.manifest.rig.baseItem,
			...Object.values(saved.items).filter((id): id is string => !!id)
		])
	);
	return { ...selected, look: { ...saved, ...selected.look } };
}

/** The export in one format: the look given (the current outfit) first, then the saved outfits. */
export function buildExport(
	p: Project,
	o: {
		engine: Engine;
		baked: boolean;
		look: Look;
		settings: ExportSettings;
		projectData?: ImportedCharacter['extra'];
	}
) {
	const current: Preset = {
		id: o.look.id ?? 'current',
		name: o.look.name ?? 'Current look',
		items: o.look.items,
		variants: o.look.variants
	};
	const presets: Preset[] = [
		current,
		...p.manifest.presets.filter((x) => x.id !== 'current' && x.id !== current.id)
	];
	const manifest = structuredClone({ ...p.manifest, presets }) as Manifest;
	applyExportSettings(manifest, o.settings);
	storeVariants(manifest, ...presets.map((x) => x.variants));
	return exportZip(
		{ manifest, images: p.images },
		{ engines: [o.engine], baked: o.baked, projectData: o.projectData }
	);
}

const covers = (it: Item) =>
	Array.isArray(it.underAll) ? it.underAll : it.under ? [it.under] : [];

/** Only the base body and one item (with its own tucked variants), worn in the given colors and without saved outfits:
 *  the item's frames line up with the body they were fitted to, and the export still imports back as a character. */
export function itemProject(
	p: Project,
	itemId: string,
	look: Look
): { project: Project; look: Look } {
	const m = p.manifest,
		it = m.items.find((i) => i.id === itemId && !i.variantOf);
	if (!it || it.id === m.rig.baseItem) throw new Error('That item is no longer on this character.');
	const kept = new Set([m.rig.baseItem, it.id]);
	return lookProject(
		p,
		{ items: { body: m.rig.baseItem, [it.slot]: it.id }, variants: look.variants },
		kept
	);
}

function lookProject(
	p: Project,
	look: Look,
	kept: ReadonlySet<string>
): { project: Project; look: Look } {
	const m = p.manifest;
	const items = structuredClone(
		m.items.filter(
			(i) =>
				kept.has(i.id) ||
				(!!i.variantOf && kept.has(i.variantOf) && covers(i).every((c) => kept.has(c)))
		)
	);
	const owners = new Set(items.map((i) => i.id));
	const materials = structuredClone(m.materials.filter((mat) => owners.has(mat.owner)));
	const variants: Preset['variants'] = {};
	for (const mat of materials) {
		const chosen = variantOf(m, look.variants, mat.id);
		// A color that follows a left-out item's color keeps today's result, as when that item is removed.
		if (mat.linkTo && !materials.some((x) => x.id === mat.linkTo)) {
			delete mat.linkTo;
			delete mat.defaultVariant;
		}
		if (chosen && !mat.linkTo) variants[mat.id] = chosen;
	}
	const hashes = new Set<string>(items.flatMap(itemHashes));
	for (const view of Object.values(m.rig.rest ?? {})) if (view?.image) hashes.add(view.image);
	return {
		project: {
			manifest: { ...m, items, materials, presets: [] },
			images: new Map([...p.images].filter(([h]) => hashes.has(h)))
		},
		look: { items: { ...look.items, body: m.rig.baseItem }, variants }
	};
}
