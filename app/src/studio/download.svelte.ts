// Download ZIP in the ⋮ menus: one click, no format choice. PNG + JSON works in any engine with a little code, and its
// editable copy imports back into PixelDoll; engine formats stay in Export.
import type { Look } from '../lib/export/build.ts';
import { lazy, LoadError } from '../lib/lazy.ts';
import { readExportSettings } from '../lib/store/export-settings.ts';
import type { StoredProject } from '../lib/store/project.ts';
import type { Manifest, Project } from '../lib/store/manifest.ts';
import { itemExportId, moveExportId } from '../lib/store/identity.ts';
import { retainMoveMetadata } from '../lib/rig/moves.ts';
import { moveLabel } from './model.ts';
import { currentLook, lookOf, doc, store, readCharacterForExport, toast } from './state.svelte.ts';
import { errorTranslation, message, type Message } from '../lib/message.ts';
import type { DownloadAction } from '../lib/report/report.ts';
import { playAudioCue } from './audio.svelte.ts';

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
	playAudioCue('export');
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
		const move = m.rig.animations.find((entry) => entry.id === anim);
		const stem = `${characterZipId(m)}-${item.id === m.rig.baseItem ? 'body' : itemExportId(item)}-${fileSlug(move ? moveExportId(move, m.rig.animations) : anim)}`;
		const files = await Promise.all(
			frameSheets(p, itemId, anim).map(async ({ layerId, image }) => ({
				name: `${stem}${layerSuffix(item, layerId)}.png`,
				data: await encodePngBytes(image)
			}))
		);
		if (files.length === 1) saveFile(files[0].data, files[0].name, 'image/png');
		else saveZip(await zip(files), `${stem}.zip`);
	} catch (e) {
		downloadFailed('frames', item.name, e);
	}
}

/** The open character as it looks now, or another one as it was last saved. Shared with project folder publishing. */
export type DownloadSource = {
	project: Project;
	look: Look;
	record?: StoredProject;
	/** How many of a saved character's images could not be read. */
	missingImages?: number;
};

export async function exportSource(projectId: string): Promise<DownloadSource> {
	if (projectId === doc.id && store.project && !doc.loading)
		return {
			project: { ...store.project, manifest: structuredClone(store.project.manifest) },
			record: store.exportRecord,
			look: currentLook(store.project.manifest)
		};
	const r = await readCharacterForExport(projectId);
	const outfit = r.current ?? r.project.manifest.presets[0];
	return {
		project: r.project,
		record: r.record,
		look: lookOf(r.project.manifest, { ...outfit?.items }, { ...outfit?.variants }),
		missingImages: 'missingImages' in r ? r.missingImages : undefined
	};
}

/** Every quick ZIP loads the export builder through this one import, and Studio prefetches it after startup: a dynamic import
 *  of a module that ExportSheet also imports statically gets its own small chunk, which ExportSheet's prefetch does not fetch,
 *  so a tab without the service worker would lose it when a deploy replaced the files. */
export const loadExportBuild = () => lazy(() => import('../lib/export/build.ts'));

async function zipOf({ project, look, record }: DownloadSource) {
	const { buildExport } = await loadExportBuild();
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

function downloadFailed(action: DownloadAction, label: string | Message, error: unknown) {
	console.error('download', action, error);
	// Catch-site evidence distinguishes a stale tab from a failed request in a page the worker already controls.
	let serviceWorkerControlled: boolean | undefined;
	if (error instanceof LoadError) {
		try {
			const worker = navigator.serviceWorker;
			if (worker) serviceWorkerControlled = worker.controller !== null;
		} catch (diagnosticError) {
			console.warn('Could not read service worker state for the download report.', diagnosticError);
		}
	}
	toast(errorTranslation(error) ?? message('download.failedRetry', { label }), {
		tone: 'danger',
		error,
		facts: { download: action, serviceWorkerControlled }
	});
}

/** A second click while the same ZIP is being prepared does nothing. */
async function download(
	action: DownloadAction,
	id: string,
	label: string,
	build: () => Promise<Awaited<ReturnType<typeof zipOf>> & { name: string }>
) {
	const key = `${action}:${id}`;
	if (pending.has(key)) return;
	pending.add(key);
	toast(message('download.preparing', { label }), { pending: true });
	try {
		const { zip, name, recovery, hasNotes, problem } = await build();
		if (!zip) {
			toast(problem ?? message('download.failed', { label }), {
				tone: 'danger',
				facts: { download: action }
			});
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
		downloadFailed(action, label, e);
	} finally {
		pending.delete(key);
	}
}

export function downloadCharacterZip(projectId: string) {
	const name = store.projects.find((p) => p.id === projectId)?.name ?? 'Character';
	return download('character', projectId, name, async () => {
		const snapshot = await exportSource(projectId);
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
	return download('item', `${projectId}/${itemId}`, it.name, async () => {
		const { project, look, record } = await exportSource(projectId);
		const { itemProject } = await loadExportBuild();
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
	return download('outfit', `${projectId}/${outfitId}`, outfit.name, async () => {
		const { outfitProject } = await loadExportBuild();
		return {
			...(await zipOf({ ...outfitProject(project, outfitId), record })),
			name: `${characterZipId(project.manifest)}-${fileSlug(outfit.name)}`
		};
	});
}

export function downloadMoveZip(moveId: string) {
	const projectId = doc.id;
	const moves = store.project?.manifest.rig.animations ?? [];
	const label = moveLabel(moveId, moves);
	const move = moves.find((entry) => entry.id === moveId);
	return download('move', `${projectId}/${moveId}`, label, async () => {
		const { project, look, record } = await exportSource(projectId);
		const { moveProject } = await loadExportBuild();
		return {
			...(await zipOf({
				project: await moveProject(project, moveId),
				look,
				record
			})),
			name: `${characterZipId(project.manifest)}-${fileSlug(move ? moveExportId(move, moves) : moveId)}`
		};
	});
}

/** Every raw result PixelLab returned for the saved characters, before PixelDoll processed it, as returned, with the
 *  requests that bought them. Only requests still kept in the jobs ledger on this device can be included. */
export async function downloadOriginalGenerations() {
	const key = 'originals';
	if (pending.has(key)) return;
	pending.add(key);
	toast(message('download.preparing', { label: message('librarySettings.originalsName') }), {
		pending: true
	});
	try {
		const [{ planOrigins, originalsZip }, { zip }, db, { listProjects }, { readableRecord }] =
			await Promise.all([
				lazy(() => import('../lib/pixellab/originals.ts')),
				lazy(() => import('../lib/store/zip.ts')),
				lazy(() => import('../lib/store/db.ts')),
				lazy(() => import('../lib/store/project.ts')),
				lazy(() => import('../lib/pixellab/queue.ts'))
			]);
		const characters = (await listProjects()).map((record) => ({
			name: record.manifest.name,
			manifest: record.manifest
		}));
		const jobs = (await db.all<unknown>('jobs')).flatMap((row) => readableRecord(row) ?? []);
		const plan = planOrigins(characters, jobs);
		const blobs = new Map<string, Blob | undefined>();
		const read = async (sha: string) => {
			if (!blobs.has(sha))
				try {
					blobs.set(sha, await db.getBlob(sha));
				} catch (e) {
					console.error('original generation image', sha, e);
					blobs.set(sha, undefined);
				}
			return blobs.get(sha);
		};
		const { entries, images, withoutImages } = await originalsZip(
			plan,
			(character, index) =>
				`${String(index + 1).padStart(2, '0')}-${characterZipId(character.manifest)}`,
			read
		);
		if (!images) {
			toast(message('librarySettings.originalsNone'), { tone: 'warning', report: false });
			return;
		}
		const date = new Date().toISOString().slice(0, 10);
		saveZip(await zip(entries), `pixeldoll-${date}-originals.zip`);
		const without = plan.withoutOriginals.length + withoutImages.length;
		if (without)
			toast(message('librarySettings.originalsPartial', { count: without }), {
				tone: 'warning',
				report: false
			});
		else toast(message('librarySettings.originalsStarted'));
	} catch (e) {
		downloadFailed('originals', message('librarySettings.originalsName'), e);
	} finally {
		pending.delete(key);
	}
}

/** The raw results of paid requests a flow could not finish with, as PixelLab returned them, with their sanitized requests. */
export async function downloadPaidResults(recordIds: readonly string[], label: string) {
	const key = `paid:${recordIds.join(',')}`;
	if (pending.has(key) || !recordIds.length) return;
	pending.add(key);
	toast(message('download.preparing', { label }), { pending: true });
	try {
		const [{ paidResultsZip }, { zip }, { queue }, db] = await Promise.all([
			lazy(() => import('../lib/pixellab/paid-results.ts')),
			lazy(() => import('../lib/store/zip.ts')),
			lazy(() => import('../lib/pixellab/queue.ts')),
			lazy(() => import('../lib/store/db.ts'))
		]);
		const records = queue.snapshot().jobs.filter((r) => recordIds.includes(r.id));
		const entries = await paidResultsZip(records, (sha) => db.getBlob(sha));
		saveZip(await zip(entries), `${fileSlug(label)}-paid-results.zip`);
		toast(message('download.paidStarted'));
	} catch (e) {
		downloadFailed('paid', label, e);
	} finally {
		pending.delete(key);
	}
}

export const fileSlug = (name: string) =>
	name
		.replace(/\s*\(demo\)/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'character';

export const characterZipId = (manifest: Pick<Manifest, 'exportId' | 'name'>) =>
	manifest.exportId ?? fileSlug(manifest.name);
