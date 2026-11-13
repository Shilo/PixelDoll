// Download ZIP in the ⋮ menus: one click, no format choice. PNG + JSON works in any engine with a little code, and its
// editable copy imports back into PixelDoll; engine formats stay in Export.
import type { Look } from '../lib/export/build.ts';
import { lazy } from '../lib/lazy.ts';
import * as db from '../lib/store/db.ts';
import { readExportSettings } from '../lib/store/export-settings.ts';
import type { StoredProject } from '../lib/store/project.ts';
import type { Project } from '../lib/store/manifest.ts';
import { retainMoveMetadata } from '../lib/rig/moves.ts';
import { moveLabel } from './model.ts';
import { doc, store, readCharacter, toast } from './state.svelte.ts';

/** The saved record's rig data, so the ZIP imports back as an editable character (the demo has none). */
export const editableData = (rec: StoredProject | undefined) =>
	rec ? { character: rec.character, skeletons: rec.skeletons, rigQa: rec.rigQa } : undefined;
const projectData = async (projectId: string) =>
	projectId.startsWith('fixture:')
		? undefined
		: editableData(await db.get<StoredProject>('projects', projectId));

export function saveZip(bytes: Uint8Array, filename: string) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(
		new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
	);
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** The open character as it looks now, or another one as it was last saved. */
async function source(projectId: string): Promise<{ project: Project; look: Look }> {
	if (projectId === doc.id && store.project && !doc.loading)
		return {
			project: store.project,
			look: { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) }
		};
	const { r } = await readCharacter(projectId);
	const outfit = r.current ?? r.project.manifest.presets[0];
	return {
		project: r.project,
		look: { items: { ...outfit?.items }, variants: { ...outfit?.variants } }
	};
}

async function zipOf(projectId: string, { project, look }: { project: Project; look: Look }) {
	const { buildExport } = await lazy(() => import('../lib/export/build.ts'));
	const original = await projectData(projectId);
	const extra = original && {
		...original,
		...retainMoveMetadata(original, new Set(project.manifest.rig.animations.map((move) => move.id)))
	};
	const r = await buildExport(project, {
		engine: 'generic',
		baked: false,
		look,
		settings: await readExportSettings(),
		projectData: extra
	});
	if (!r.zip) throw new Error(r.errors.slice(0, 3).join('; ') || 'This export is not valid.');
	return r.zip;
}

const pending = new Set<string>();
/** A second click while the same ZIP is being prepared does nothing. */
async function download(
	key: string,
	label: string,
	build: () => Promise<{ zip: Uint8Array; filename: string }>
) {
	if (pending.has(key)) return;
	pending.add(key);
	toast(`Preparing ${label}…`);
	try {
		const { zip, filename } = await build();
		saveZip(zip, filename);
		toast(`Downloaded ${filename}`);
	} catch (e) {
		console.error('download', e);
		toast(`Could not download ${label}: ${(e as Error).message}`, { tone: 'danger' });
	} finally {
		pending.delete(key);
	}
}

export function downloadCharacterZip(projectId: string) {
	const name = store.projects.find((p) => p.id === projectId)?.name ?? 'Character';
	return download(`character:${projectId}`, name, async () => ({
		zip: await zipOf(projectId, await source(projectId)),
		filename: `${fileSlug(name)}.pixeldoll.zip`
	}));
}

/** An item of the open character, worn on the base body in its current colors. */
export function downloadItemZip(itemId: string) {
	const projectId = doc.id,
		it = store.project?.manifest.items.find((i) => i.id === itemId);
	if (!it) return Promise.resolve();
	const character = store.projects.find((p) => p.id === projectId)?.name ?? 'Character';
	return download(`item:${projectId}/${itemId}`, it.name, async () => {
		const { itemProject } = await lazy(() => import('../lib/export/build.ts'));
		const { project, look } = await source(projectId);
		return {
			zip: await zipOf(projectId, itemProject(project, itemId, look)),
			filename: `${fileSlug(character)}-${fileSlug(it.name)}.pixeldoll.zip`
		};
	});
}

export function downloadOutfitZip(outfitId: string) {
	const projectId = doc.id;
	const outfit = store.project?.manifest.presets.find((preset) => preset.id === outfitId);
	if (!outfit) return Promise.resolve();
	const project = { ...store.project!, manifest: structuredClone(store.project!.manifest) };
	return download(`outfit:${projectId}/${outfitId}`, outfit.name, async () => {
		const { outfitProject } = await lazy(() => import('../lib/export/build.ts'));
		return {
			zip: await zipOf(projectId, outfitProject(project, outfitId)),
			filename: `${fileSlug(project.manifest.name)}-${fileSlug(outfit.name)}.pixeldoll.zip`
		};
	});
}

export function downloadMoveZip(moveId: string) {
	const projectId = doc.id;
	const label = moveLabel(
		moveId,
		store.project?.manifest.rig.animations.map((move) => move.id)
	);
	return download(`move:${projectId}/${moveId}`, label, async () => {
		const { project, look } = await source(projectId);
		const { moveProject } = await lazy(() => import('../lib/export/build.ts'));
		return {
			zip: await zipOf(projectId, {
				project: await moveProject(project, moveId),
				look
			}),
			filename: `${fileSlug(project.manifest.name)}-${fileSlug(moveId)}.pixeldoll.zip`
		};
	});
}

export const fileSlug = (name: string) =>
	name
		.replace(/\s*\(demo\)/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'character';
