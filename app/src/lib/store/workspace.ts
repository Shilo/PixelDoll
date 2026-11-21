import { layerFrame } from '../compose/compose.ts';
import { pngSize } from '../image/png.ts';
import { decodePngBytes } from '../image/pngraw.ts';
import type { ApiCall } from '../pixellab/activity.ts';
import { ITEM_TRIAL_TAG, MOTION_LAB_TAG } from '../pixellab/queue.ts';
import { cellHash, DIRECTIONS, pinnedArtwork, type DirectionName } from '../rig/rig.ts';
import { readWorkspaceSnapshot } from './db.ts';
import { checkedSettings, EXPORT_SETTINGS_KEY } from './export-settings.ts';
import { manifestShape } from './import.ts';
import { supportedFormat, type Manifest } from './manifest.ts';
import type { StoredProject } from './project.ts';
import { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, unzip, zip } from './zip.ts';
import { LocalizedError } from '../message.ts';

const format = 'pixeldoll-workspace/1';
const indexPath = 'workspace.json';
const demoDress = 'dress-fixture:s2';
const hashPattern = /^(?:sha256:)?([a-f0-9]{64})$/;
const modes = ['preview', 'topdown', 'side'] as const;
const tabs = ['wardrobe', 'colors', 'outfits', 'states', 'moves'] as const;
const outcomes = ['failed', 'lost', 'running', 'queued', 'submitting'] as const;
const tools = [
	'create-character-v3',
	'create-character-v3-pro',
	'create-character-v3-pro-flash',
	'animate-with-skeleton-v3',
	'animate-with-v3',
	'animate-with-pixminimax',
	'animate-with-text-v3',
	'animate-pixminimax',
	'estimate-skeleton',
	'edit-animation-v2',
	'inpaint-v3',
	'transfer-outfit-v2',
	'balance',
	'background-jobs'
];
const maxReports = 50;
const maxMessage = 200;
const maxRecords = 500;
const maxPixels = 64 * 1024 * 1024;
/** Thrown past the artwork budget: each archive reports it in its own words. */
class ArtworkLimitError extends Error {}

/** The errors an archive format reports in its own words, so the shared reading and packing below serve each format. */
export interface ArchiveErrors {
	invalidIndex: () => LocalizedError;
	duplicateRecord: () => LocalizedError;
	missingFiles: () => LocalizedError;
	unexpectedFile: () => LocalizedError;
	tooLarge: () => LocalizedError;
	containsKey: () => LocalizedError;
}

const workspaceErrors: ArchiveErrors = {
	invalidIndex: () =>
		new LocalizedError('This workspace index is invalid.', 'workspace.error.invalidIndex'),
	duplicateRecord: () =>
		new LocalizedError(
			'This workspace contains an unsupported or duplicate saved record.',
			'workspace.error.duplicateRecord'
		),
	missingFiles: () =>
		new LocalizedError(
			'This workspace has an invalid list of missing files.',
			'workspace.error.missingFiles'
		),
	unexpectedFile: () =>
		new LocalizedError(
			'This workspace contains an unexpected file.',
			'workspace.error.unexpectedFile'
		),
	tooLarge: () =>
		new LocalizedError(
			'This workspace exceeds the ZIP size or artwork limit. Use individual character ZIPs instead.',
			'workspace.error.tooLarge'
		),
	containsKey: () =>
		new LocalizedError(
			'A saved field contains the connected or remembered PixelLab key. Remove it from the workspace before exporting.',
			'workspace.error.containsKey'
		)
};

export interface WorkspaceView {
	project: string;
	item: string;
	move: string;
	direction: DirectionName;
	frame: number;
	screen: 'studio' | 'characters';
	mode: (typeof modes)[number];
	tab: (typeof tabs)[number];
	theme: 'dark' | 'light';
}

interface ErrorSummary {
	at: number;
	tool: string;
	outcome: (typeof outcomes)[number];
	http?: number;
	code?: number;
	/** What the failed request reported, shortened and without links or tokens. */
	message?: string;
}

interface WorkspaceIndex {
	format: typeof format;
	build: string;
	view: WorkspaceView;
	projects: [string, unknown][];
	missing: string[];
	omitted?: { characters: number; demoOutfit: boolean; exportSettings: boolean };
	diagnostics?: { tier: number | null; errors: ErrorSummary[] };
}

export type WorkspaceArchive = Pick<
	WorkspaceIndex,
	'build' | 'view' | 'missing' | 'diagnostics' | 'omitted'
> & {
	projects: Map<string, unknown>;
	blobs: Map<string, Blob>;
};

const object = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

/** A saved Studio character (developer rigs stay out of every archive). */
export const studioCharacter = (key: string, value: unknown) =>
	key.startsWith('rig-') && (value as Partial<StoredProject> | undefined)?.origin === 'studio';
const selects = (key: string, value: unknown) =>
	key === demoDress || key === EXPORT_SETTINGS_KEY || studioCharacter(key, value);

type FrameSize = { w: number; h: number };
type Omitted = NonNullable<WorkspaceIndex['omitted']>;

/** Every artwork reference of a character, with the frame size it must have when the reference fixes one. */
export function* artworkRefs(
	manifest: Manifest,
	history = false
): Generator<[unknown, FrameSize | undefined]> {
	for (const pose of Object.values(manifest.rig.rest ?? {})) yield [pose?.image, manifest.rig.cell];
	for (const hash of pinnedArtwork(manifest.rig)) yield [hash, manifest.rig.cell];
	for (const item of manifest.items) {
		for (const hash of Object.values(item.dressed ?? {})) yield [hash, undefined];
		for (const layer of item.layers) {
			const frame = layerFrame(manifest.rig, layer);
			for (const dirs of Object.values(layer.cells ?? {}))
				for (const cells of Object.values(dirs ?? {}))
					for (const hash of cells ?? []) yield [hash, frame];
		}
		if (history) {
			for (const edit of item.frameEdits ?? [])
				for (const frame of edit.frames) {
					if (frame.rest) yield [frame.rest, manifest.rig.cell];
					for (const layer of frame.layers) {
						if (layer.before) yield [layer.before, undefined];
						if (layer.after) yield [layer.after, undefined];
					}
				}
			for (const repair of item.paletteRepairs ?? [])
				for (const frame of repair.frames)
					for (const layer of frame.layers) {
						yield [layer.before, undefined];
						yield [layer.after, undefined];
					}
		}
	}
}

function checkDemoDress(value: unknown) {
	const dress = object(value);
	const labels = (list: unknown): boolean =>
		Array.isArray(list) && list.every((entry) => typeof entry === 'string');
	const outfit = (value: unknown): boolean => {
		const entry = object(value);
		return !!entry && !!object(entry.items) && !!object(entry.variants);
	};
	if (
		!dress ||
		!supportedFormat(dress.format) ||
		!labels(dress.itemIds) ||
		!Array.isArray(dress.materials) ||
		!dress.materials.every((value) => {
			const material = object(value);
			return (
				!!material &&
				typeof material.owner === 'string' &&
				typeof material.id === 'string' &&
				labels(material.ramp) &&
				!!object(material.variants)
			);
		}) ||
		!Array.isArray(dress.presets) ||
		!dress.presets.every(outfit) ||
		(dress.slots !== undefined &&
			(!Array.isArray(dress.slots) ||
				!dress.slots.every((value) => typeof object(value)?.id === 'string'))) ||
		(dress.hides !== undefined &&
			(!object(dress.hides) ||
				!Object.values(object(dress.hides)!).every((value) => value === null || labels(value)))) ||
		(dress.current !== undefined && !outfit(dress.current))
	)
		throw new Error('Saved demo outfit data is invalid.');
}

function recoverRecords(projects: Map<string, unknown>, omitted: Omitted, history: boolean) {
	const found = new Map<string, FrameSize | undefined>();
	for (const [key, value] of projects) {
		const local = new Map<string, FrameSize | undefined>();
		const add = (value: unknown, frame?: FrameSize) => {
			if (value == null) return;
			const hash = typeof value === 'string' && hashPattern.exec(value)?.[1];
			if (!hash) throw new Error('This workspace has an invalid artwork reference.');
			const previous = local.get(hash) ?? found.get(hash);
			if (previous && frame && (previous.w !== frame.w || previous.h !== frame.h))
				throw new Error('This workspace has conflicting artwork dimensions.');
			local.set(hash, frame ?? previous);
		};
		try {
			if (key === EXPORT_SETTINGS_KEY) {
				checkedSettings(value);
				continue;
			}
			if (key === demoDress) {
				checkDemoDress(value);
				continue;
			}
			const record = value as StoredProject;
			const { id, manifest } = record;
			if (!selects(key, value) || id !== key || !supportedFormat(manifest?.format))
				throw new Error('Unsupported character record.');
			delete record.stateGeneration;
			manifestShape(manifest);
			for (const [hash, frame] of artworkRefs(manifest, history)) add(hash, frame);
			for (const [hash, frame] of local) found.set(hash, frame);
		} catch {
			projects.delete(key);
			if (key === demoDress) omitted.demoOutfit = true;
			else if (key === EXPORT_SETTINGS_KEY) omitted.exportSettings = true;
			else omitted.characters++;
		}
	}
	return found;
}

const summaryTool = (endpoint: unknown) =>
	(typeof endpoint === 'string' &&
		tools.find((tool) => endpoint === `/${tool}` || endpoint.startsWith(`/${tool}/`))) ||
	'PixelLab';
const integer = (value: unknown, min: number, max: number): number | undefined =>
	typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
		? value
		: undefined;

/** A failure's own words for the export. A failed download names its signed link and a provider can echo what it was sent,
 *  so what is likely to carry a secret or an image is left out: data URLs, links (with a scheme or a query string),
 *  credential headers, anything shaped like a PixelLab key (a UUID, so job ids go too) and long unbroken tokens. A filter of
 *  free text is best effort: the export's key check still refuses the connected and remembered keys outright, and this
 *  covers a key it does not know, such as an earlier one. */
function diagnosticText(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const text = value
		.replace(/\bdata:[^\s"']+/gi, '[data]')
		.replace(/https?:\/\/[^\s"']+/gi, '[link]')
		// A path or host before the "?", or query syntax after it: an ordinary question is neither.
		.replace(/[^\s"']*[./][^\s"']*\?[^\s"']+|[^\s"']*\?[^\s"']*[=&#%][^\s"']*/g, '[link]')
		// These two headers carry several values (a Digest's fields, each cookie): the rest of the line goes.
		.replace(/\b(authorization|(?:set-)?cookie)\b["']?\s*[:=][^\r\n]*/gi, '$1: [removed]')
		.replace(
			/\b(password|secret|signature|x-api-key|api[ _-]?key|token)\b["']?\s*[:=]\s*["']?[^\s"',;]+/gi,
			'$1: [removed]'
		)
		// A scheme followed by something credential-shaped, not "basic shading" or "digest mismatch".
		.replace(
			/\b(basic|bearer|digest|negotiate)\s+(?=[\w.+/=-]{16,}|[\w.+/=-]*[\d=+/.-])[\w.+/=-]+/gi,
			'$1 [removed]'
		)
		.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[id]')
		.replace(/[A-Za-z0-9+=_]{24,}/g, '[removed]')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, maxMessage);
	return text || undefined;
}

export function recentWorkspaceErrors(jobs: unknown[], calls: readonly ApiCall[]): ErrorSummary[] {
	const summaries: ErrorSummary[] = [];
	for (const value of jobs) {
		const job = object(value);
		if (
			!job ||
			job.tag === MOTION_LAB_TAG ||
			job.tag === ITEM_TRIAL_TAG ||
			!outcomes.includes(job.state as ErrorSummary['outcome'])
		)
			continue;
		const at = integer(job.finishedAt ?? job.createdAt, 0, Number.MAX_SAFE_INTEGER);
		if (at === undefined) continue;
		const subjob = Array.isArray(job.jobs)
			? job.jobs.find((sub) => object(sub)?.errorCode != null)
			: undefined;
		summaries.push({
			at,
			tool: summaryTool(job.endpoint),
			outcome: job.state as ErrorSummary['outcome'],
			code: integer(subjob?.errorCode, 0, 99999),
			message: diagnosticText(job.error || object(subjob)?.error)
		});
	}
	for (const call of calls) {
		if (call.state !== 'failed' && !call.failedJobs?.length) continue;
		summaries.push({
			at: call.finishedAt ?? call.startedAt,
			tool: summaryTool(call.endpoint),
			outcome: 'failed',
			http: integer(call.status, 100, 599),
			code: integer(call.failedJobs?.[0]?.code ?? call.job?.code, 0, 99999),
			message: diagnosticText(call.failedJobs?.[0]?.error || call.job?.error)
		});
	}
	return summaries.sort((left, right) => right.at - left.at).slice(0, maxReports);
}

export async function exportWorkspace(
	view: WorkspaceView,
	diagnostics: { tier: number | null; calls: readonly ApiCall[] } | undefined,
	keys: readonly string[]
) {
	const { bytes, hasOmissions } = await packArchive(
		selects,
		!!diagnostics,
		keys,
		workspaceErrors,
		({ projects, missing, omitted, jobs }) => [
			indexPath,
			{
				format,
				build: archiveBuild(),
				view,
				projects: [...projects],
				missing,
				...(omitted && { omitted }),
				...(diagnostics && {
					diagnostics: {
						tier: diagnostics.tier,
						errors: recentWorkspaceErrors(jobs, diagnostics.calls)
					}
				})
			} satisfies WorkspaceIndex
		]
	);
	return { bytes, hasOmissions };
}

export const archiveBuild = () => `${__APP_VERSION__} (${__APP_COMMIT__})`;

/** Read the selected records and their artwork in one snapshot, verify both, and pack them with the index `write` names and
 *  makes. Records and artwork that fail verification are left out and reported, and the packed index never holds a key. */
export async function packArchive(
	select: (key: string, value: unknown) => boolean,
	includeJobs: boolean,
	keys: readonly string[],
	errors: ArchiveErrors,
	write: (contents: {
		projects: Map<string, unknown>;
		missing: string[];
		omitted?: Omitted;
		jobs: unknown[];
	}) => [name: string, index: object],
	attachments: readonly { name: string; data: Uint8Array }[] = [],
	history = false
) {
	const omitted = { characters: 0, demoOutfit: false, exportSettings: false };
	let references = new Map<string, FrameSize | undefined>();
	const snapshot = await readWorkspaceSnapshot(
		select,
		(projects) => {
			references = recoverRecords(projects, omitted, history);
			return references;
		},
		includeJobs
	);
	const { blobs, projects } = snapshot;
	if (projects.size > maxRecords) throw errors.tooLarge();
	for (const value of projects.values()) {
		const record = value as Partial<StoredProject>;
		delete record.creationSpec;
		delete record.moveRecovery;
		delete record.moveReviews;
	}
	const artwork: { name: string; data: Uint8Array }[] = [];
	let pixels = 0,
		artworkBytes = 0;
	for (const [hash, blob] of blobs) {
		if (blob.size > MAX_ZIP_BYTES) throw errors.tooLarge();
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const verified = await recoverArtwork(
			bytes,
			hash,
			maxPixels - pixels,
			references.get(hash),
			errors
		);
		if (verified === undefined) blobs.delete(hash);
		else {
			pixels += verified;
			artworkBytes += bytes.length;
			if (artworkBytes > MAX_ZIP_BYTES || artwork.length + 2 > MAX_ZIP_ENTRIES)
				throw errors.tooLarge();
			artwork.push({ name: `blobs/${hash}`, data: bytes });
		}
	}
	const missing = [...references.keys()].filter((hash) => !blobs.has(hash));
	const omissions = Object.values(omitted).some(Boolean) ? omitted : undefined;
	const [name, index] = write({ projects, missing, omitted: omissions, jobs: snapshot.jobs });
	const json = JSON.stringify(index);
	if (
		keys.some(
			(key) => key && (json.includes(key) || json.includes(JSON.stringify(key).slice(1, -1)))
		)
	)
		throw errors.containsKey();
	const data = new TextEncoder().encode(json);
	if (
		missing.length > MAX_ZIP_ENTRIES ||
		artwork.length + attachments.length + 1 > MAX_ZIP_ENTRIES ||
		data.length + artworkBytes + attachments.reduce((sum, entry) => sum + entry.data.length, 0) >
			MAX_ZIP_BYTES
	)
		throw errors.tooLarge();
	const packed = await zip([{ name, data }, ...artwork, ...attachments]);
	if (packed.length > MAX_ZIP_BYTES) throw errors.tooLarge();
	return { bytes: packed, hasOmissions: !!omissions || !!missing.length, records: projects.size };
}

async function recoverArtwork(
	data: Uint8Array,
	hash: string,
	remaining: number,
	frame: FrameSize | undefined,
	errors: ArchiveErrors
) {
	try {
		return await verifyArtwork(data, hash, remaining, frame);
	} catch (error) {
		if (error instanceof ArtworkLimitError) throw errors.tooLarge();
		return undefined;
	}
}

async function verifyArtwork(
	data: Uint8Array,
	hash: string,
	remaining: number,
	frame?: FrameSize
): Promise<number> {
	const size = pngSize(data);
	if (!size || size.w < 1 || size.h < 1 || size.w > 2048 || size.h > 2048)
		throw new Error('This workspace contains invalid artwork.');
	if (frame && (size.w !== frame.w || size.h !== frame.h))
		throw new Error('Workspace artwork does not match its saved frame dimensions.');
	const pixels = size.w * size.h;
	if (pixels > remaining) throw new ArtworkLimitError();
	let actual: string;
	try {
		actual = await cellHash(await decodePngBytes(data));
	} catch (cause) {
		throw new Error('This workspace contains an unreadable PNG.', { cause });
	}
	if (actual !== `sha256:${hash}`)
		throw new Error('Workspace artwork does not match its saved pixel hash.');
	return pixels;
}

/** An archive index, refusing prototype keys. */
export function parseIndex(json: Uint8Array, errors: ArchiveErrors): unknown {
	try {
		return JSON.parse(
			new TextDecoder('utf-8', { fatal: true }).decode(json),
			(key, value: unknown) => {
				if (key === '__proto__') throw new Error('Unsafe property');
				return value;
			}
		);
	} catch (cause) {
		const error = errors.invalidIndex();
		error.cause = cause;
		throw error;
	}
}

/** The records of an index's `rows` (only `allowed` keys) and their verified artwork from `files`. Records that fail validation
 *  are left out and counted in `omitted`; artwork that fails verification is reported missing along with what `listed` names. */
export async function readArchiveFiles(
	files: Map<string, Uint8Array>,
	indexName: string,
	rows: unknown,
	listed: unknown,
	omitted: Omitted,
	allowed: (key: string) => boolean,
	errors: ArchiveErrors,
	history = false
) {
	if (
		!Array.isArray(rows) ||
		rows.length > maxRecords ||
		!Array.isArray(listed) ||
		listed.length > MAX_ZIP_ENTRIES
	)
		throw errors.invalidIndex();
	const projects = new Map<string, unknown>();
	for (const row of rows) {
		if (
			!Array.isArray(row) ||
			row.length !== 2 ||
			typeof row[0] !== 'string' ||
			!allowed(row[0]) ||
			projects.has(row[0])
		)
			throw errors.duplicateRecord();
		projects.set(row[0], row[1]);
	}
	const previousOmissions = omitted.characters;
	const references = recoverRecords(projects, omitted, history);
	const skippedCharacter = omitted.characters > previousOmissions;
	const absent = new Set<unknown>(listed);
	if (
		absent.size !== listed.length ||
		listed.some(
			(hash) =>
				typeof hash !== 'string' ||
				!/^[a-f0-9]{64}$/.test(hash) ||
				(!skippedCharacter && !references.has(hash))
		)
	)
		throw errors.missingFiles();
	const blobs = new Map<string, Blob>();
	let pixels = 0;
	for (const [path, data] of files) {
		if (path === indexName) continue;
		const hash = /^blobs\/([a-f0-9]{64})$/.exec(path)?.[1];
		if (!hash || (!skippedCharacter && !references.has(hash)) || absent.has(hash))
			throw errors.unexpectedFile();
		if (!references.has(hash)) continue;
		const verified = await recoverArtwork(
			data,
			hash,
			maxPixels - pixels,
			references.get(hash),
			errors
		);
		if (verified !== undefined) {
			pixels += verified;
			blobs.set(hash, new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
		}
	}
	return {
		projects,
		blobs,
		missing: [...references.keys()].filter((hash) => !blobs.has(hash))
	};
}

export const readWorkspace = async (bytes: Uint8Array): Promise<WorkspaceArchive> =>
	readWorkspaceFiles(await unzip(bytes));

export async function readWorkspaceFiles(
	files: Map<string, Uint8Array>
): Promise<WorkspaceArchive> {
	const json = files.get(indexPath);
	if (!json)
		throw new LocalizedError(
			'Choose a PixelDoll backup or workspace ZIP, not a character ZIP.',
			'backup.error.notBackup'
		);
	const index = parseIndex(json, workspaceErrors) as WorkspaceIndex | null;
	if (index?.format !== format)
		throw new LocalizedError(
			'This workspace file version is not supported.',
			'workspace.error.unsupportedVersion'
		);
	const { build, view, diagnostics } = index;
	if (
		typeof build !== 'string' ||
		build.length > 100 ||
		!view ||
		typeof view.project !== 'string' ||
		typeof view.item !== 'string' ||
		typeof view.move !== 'string' ||
		!DIRECTIONS.includes(view.direction) ||
		integer(view.frame, 0, Number.MAX_SAFE_INTEGER) === undefined ||
		!modes.includes(view.mode) ||
		!tabs.includes(view.tab) ||
		!['studio', 'characters'].includes(view.screen) ||
		!['dark', 'light'].includes(view.theme) ||
		(index.omitted !== undefined &&
			(!index.omitted ||
				integer(index.omitted.characters, 0, maxRecords) === undefined ||
				typeof index.omitted.demoOutfit !== 'boolean' ||
				typeof index.omitted.exportSettings !== 'boolean'))
	)
		throw workspaceErrors.invalidIndex();
	const omitted = { characters: 0, demoOutfit: false, exportSettings: false, ...index.omitted };
	const { projects, blobs, missing } = await readArchiveFiles(
		files,
		indexPath,
		index.projects,
		index.missing,
		omitted,
		(key) => key === demoDress || key === EXPORT_SETTINGS_KEY || key.startsWith('rig-'),
		workspaceErrors
	);
	if (
		diagnostics &&
		(!Array.isArray(diagnostics.errors) ||
			diagnostics.errors.length > maxReports ||
			(diagnostics.tier !== null && integer(diagnostics.tier, 0, 100) === undefined) ||
			diagnostics.errors.some(
				(error) =>
					!error ||
					integer(error.at, 0, Number.MAX_SAFE_INTEGER) === undefined ||
					(!tools.includes(error.tool) && error.tool !== 'PixelLab') ||
					!outcomes.includes(error.outcome) ||
					(error.http !== undefined && integer(error.http, 100, 599) === undefined) ||
					(error.code !== undefined && integer(error.code, 0, 99999) === undefined) ||
					(error.message !== undefined &&
						(typeof error.message !== 'string' || error.message.length > maxMessage))
			))
	)
		throw new LocalizedError(
			'This workspace has invalid recent errors.',
			'workspace.error.invalidDiagnostics'
		);
	return {
		build,
		view,
		diagnostics,
		projects,
		blobs,
		missing,
		omitted: Object.values(omitted).some(Boolean) ? omitted : undefined
	};
}
