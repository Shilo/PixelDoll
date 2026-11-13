// Download ZIP in the ⋮ menus: one click, no format choice. PNG + JSON works in any engine with a little code, and its
// editable copy imports back into PixelDoll; engine formats stay in Export.
import type { Look } from '../lib/export/build.ts';
import { lazy } from '../lib/lazy.ts';
import * as db from '../lib/store/db.ts';
import { readExportSettings } from '../lib/store/export-settings.ts';
import type { StoredProject } from '../lib/store/project.ts';
import type { Project } from '../lib/store/manifest.ts';
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
	const r = await buildExport(project, {
		engine: 'generic',
		baked: false,
		look,
		settings: await readExportSettings(),
		projectData: await projectData(projectId)
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
	toast(`Preparing ${label}...`, { pending: true });
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

export const fileSlug = (name: string) =>
	name
		.replace(/\s*\(demo\)/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'character';
