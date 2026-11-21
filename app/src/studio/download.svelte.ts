// Download ZIP in the ⋮ menus: one click, no format choice. PNG + JSON works in any engine with a little code, and its
// editable copy imports back into PixelDoll; engine formats stay in Export.
import type { Look } from '../lib/export/build.ts';
import { lazy } from '../lib/lazy.ts';
import { readExportSettings } from '../lib/store/export-settings.ts';
import type { StoredProject } from '../lib/store/project.ts';
import type { Manifest, Project } from '../lib/store/manifest.ts';
import { itemExportId } from '../lib/store/identity.ts';
import { retainMoveMetadata } from '../lib/rig/moves.ts';
import { moveLabel } from './model.ts';
import { doc, store, readCharacterForExport, toast } from './state.svelte.ts';
import { message } from '../lib/message.ts';

/** The saved record's rig data, so the ZIP imports back as an editable character (the demo has none). `build` names the app
 *  that wrote the file, for diagnosing a report; an import never reads it. */
export const editableData = (rec: StoredProject | undefined) =>
	rec
		? {
				character: rec.character,
				skeletons: rec.skeletons,
				rigQa: rec.rigQa,
				build: `${__APP_VERSION__} (${__APP_COMMIT__})`
			}
		: undefined;

export function saveFile(bytes: Uint8Array, filename: string, type: string) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
export const saveZip = (bytes: Uint8Array, filename: string) =>
	saveFile(bytes, filename, 'application/zip');

/** Fix frames: the open character's frames of one item (or the body) and move, as stored (original colors): one PNG, or a
 *  ZIP of one PNG per layer whose names say the layer. */
export async function downloadFrames(itemId: string, anim: string) {
	const p = store.project,
		m = p?.manifest,
		item = m?.items.find((i) => i.id === itemId);
	if (!p || !m || !item) return;
	try {
		const [{ frameSheets, layerSuffix }, { encodePngBytes }, { zip }] = await Promise.all([
			lazy(() => import('../lib/frames/fix.ts')),
			lazy(() => import('../lib/image/pngraw.ts')),
			lazy(() => import('../lib/store/zip.ts'))
		]);
		const stem = `${characterZipId(m)}-${item.id === m.rig.baseItem ? 'body' : itemExportId(item)}-${fileSlug(anim)}`;
		const files = await Promise.all(
			frameSheets(p, itemId, anim).map(async ({ layerId, image }) => ({
				name: `${stem}${layerSuffix(item, layerId)}.png`,
				data: await encodePngBytes(image)
			}))
		);
		if (files.length === 1) saveFile(files[0].data, files[0].name, 'image/png');
		else saveZip(await zip(files), `${stem}.zip`);
	} catch (e) {
		console.error('download frames', e);
		toast(message('download.failedRetry', { label: item.name }), { tone: 'danger' });
	}
}

/** The open character as it looks now, or another one as it was last saved. */
type DownloadSource = { project: Project; look: Look; record?: StoredProject };

async function source(projectId: string): Promise<DownloadSource> {
	if (projectId === doc.id && store.project && !doc.loading)
		return {
			project: { ...store.project, manifest: structuredClone(store.project.manifest) },
			record: store.exportRecord,
			look: { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) }
		};
	const r = await readCharacterForExport(projectId);
	const outfit = r.current ?? r.project.manifest.presets[0];
	return {
		project: r.project,
		record: r.record,
		look: { items: { ...outfit?.items }, variants: { ...outfit?.variants } }
	};
}

async function zipOf({ project, look, record }: DownloadSource) {
	const { buildExport } = await lazy(() => import('../lib/export/build.ts'));
	const original = editableData(record);
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
	return {
		zip: r.zip,
		recovery: r.kind === 'recovery',
		hasNotes: r.warnings.length > 0,
		problem: r.problemMessage ?? r.problem
	};
}

const pending = new Set<string>();
/** A second click while the same ZIP is being prepared does nothing. */
async function download(
	key: string,
	label: string,
	build: () => Promise<Awaited<ReturnType<typeof zipOf>> & { name: string }>
) {
	if (pending.has(key)) return;
	pending.add(key);
	toast(message('download.preparing', { label }), { pending: true });
	try {
		const { zip, name, recovery, hasNotes, problem } = await build();
		if (!zip) {
			toast(problem ?? message('download.failed', { label }), { tone: 'danger' });
			return;
		}
		saveZip(zip, recovery ? `${name}-recovered-artwork.zip` : `${name}.pixeldoll.zip`);
		toast(
			recovery
				? message('download.recoveryStarted')
				: hasNotes
					? message('download.startedNotes')
					: message('download.started'),
			{ tone: recovery || hasNotes ? 'warning' : 'info' }
		);
	} catch (e) {
		console.error('download', e);
		toast(message('download.failedRetry', { label }), { tone: 'danger' });
	} finally {
		pending.delete(key);
	}
}

export function downloadCharacterZip(projectId: string) {
	const name = store.projects.find((p) => p.id === projectId)?.name ?? 'Character';
	return download(`character:${projectId}`, name, async () => {
		const snapshot = await source(projectId);
		return {
			...(await zipOf(snapshot)),
			name: characterZipId(snapshot.project.manifest)
		};
	});
}

/** An item of the open character, worn on the base body in its current colors. */
export function downloadItemZip(itemId: string) {
	const projectId = doc.id,
		it = store.project?.manifest.items.find((i) => i.id === itemId);
	if (!it) return Promise.resolve();
	return download(`item:${projectId}/${itemId}`, it.name, async () => {
		const { project, look, record } = await source(projectId);
		const { itemProject } = await lazy(() => import('../lib/export/build.ts'));
		const selected = itemProject(project, itemId, look);
		const item = project.manifest.items.find((entry) => entry.id === itemId)!;
		return {
			...(await zipOf({ ...selected, record })),
			name: `${characterZipId(project.manifest)}-${itemExportId(item)}`
		};
	});
}

export function downloadOutfitZip(outfitId: string) {
	const projectId = doc.id;
	const outfit = store.project?.manifest.presets.find((preset) => preset.id === outfitId);
	if (!outfit) return Promise.resolve();
	const project = { ...store.project!, manifest: structuredClone(store.project!.manifest) };
	const record = store.exportRecord;
	return download(`outfit:${projectId}/${outfitId}`, outfit.name, async () => {
		const { outfitProject } = await lazy(() => import('../lib/export/build.ts'));
		return {
			...(await zipOf({ ...outfitProject(project, outfitId), record })),
			name: `${characterZipId(project.manifest)}-${fileSlug(outfit.name)}`
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
		const { project, look, record } = await source(projectId);
		const { moveProject } = await lazy(() => import('../lib/export/build.ts'));
		return {
			...(await zipOf({
				project: await moveProject(project, moveId),
				look,
				record
			})),
			name: `${characterZipId(project.manifest)}-${fileSlug(moveId)}`
		};
	});
}

export const fileSlug = (name: string) =>
	name
		.replace(/\s*\(demo\)/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'character';

export const characterZipId = (manifest: Pick<Manifest, 'exportId' | 'name'>) =>
	manifest.exportId ?? fileSlug(manifest.name);
