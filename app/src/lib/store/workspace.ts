import { layerFrame } from '../compose/compose.ts';
import { pngSize } from '../image/png.ts';
import { decodePngBytes } from '../image/pngraw.ts';
import type { ApiCall } from '../pixellab/activity.ts';
import { ITEM_TRIAL_TAG, MOTION_LAB_TAG } from '../pixellab/queue.ts';
import { cellHash, DIRECTIONS, type DirectionName } from '../rig/rig.ts';
import { readWorkspaceSnapshot } from './db.ts';
import { checkedSettings, EXPORT_SETTINGS_KEY } from './export-settings.ts';
import { manifestShape } from './import.ts';
import { supportedFormat } from './manifest.ts';
import type { StoredProject } from './project.ts';
import { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, unzip, zip } from './zip.ts';

const format = 'pixeldoll-workspace/1';
const indexPath = 'workspace.json';
const demoDress = 'dress-fixture:s2';
const hashPattern = /^(?:sha256:)?([a-f0-9]{64})$/;
const modes = ['preview', 'topdown', 'side'] as const;
const tabs = ['wardrobe', 'colors', 'outfits', 'moves'] as const;
const outcomes = ['failed', 'lost', 'running', 'queued', 'submitting'] as const;
const tools = [
	'create-character-v3',
	'create-character-v3-pro',
	'create-character-v3-pro-flash',
	'animate-with-skeleton-v3',
	'animate-with-v3',
	'animate-with-pixminimax',
	'estimate-skeleton',
	'edit-animation-v2',
	'inpaint-v3',
	'transfer-outfit-v2',
	'balance',
	'background-jobs'
];
const maxReports = 50;
const maxRecords = 500;
const maxPixels = 64 * 1024 * 1024;
const tooLarge =
	'This workspace exceeds the ZIP size or artwork limit. Use individual character ZIPs instead.';

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
}

interface WorkspaceIndex {
	format: typeof format;
	build: string;
	view: WorkspaceView;
	projects: [string, unknown][];
	missing: string[];
	diagnostics?: { tier: number | null; errors: ErrorSummary[] };
}

export type WorkspaceArchive = Pick<
	WorkspaceIndex,
	'build' | 'view' | 'missing' | 'diagnostics'
> & {
	projects: Map<string, unknown>;
	blobs: Map<string, Blob>;
};

const object = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const selects = (key: string, value: unknown) => {
	if (key === demoDress || key === EXPORT_SETTINGS_KEY) return !!object(value);
	const record = value as Partial<StoredProject> | undefined;
	return key.startsWith('rig-') && record?.origin === 'studio';
};

type FrameSize = { w: number; h: number };

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
		!Array.isArray(dress.slots) ||
		!dress.slots.every((value) => typeof object(value)?.id === 'string') ||
		!object(dress.hides) ||
		!Object.values(object(dress.hides)!).every((value) => value === null || labels(value)) ||
		(dress.current !== undefined && !outfit(dress.current))
	)
		throw new Error('Saved demo outfit data is invalid.');
}

function artworkReferences(projects: Map<string, unknown>) {
	const found = new Map<string, FrameSize | undefined>();
	const add = (value: unknown, frame?: FrameSize) => {
		if (value == null) return;
		const hash = typeof value === 'string' && hashPattern.exec(value)?.[1];
		if (!hash) throw new Error('This workspace has an invalid artwork reference.');
		const previous = found.get(hash);
		if (previous && frame && (previous.w !== frame.w || previous.h !== frame.h))
			throw new Error('This workspace has conflicting artwork dimensions.');
		found.set(hash, frame ?? previous);
	};
	for (const [key, value] of projects) {
		if (key === EXPORT_SETTINGS_KEY) checkedSettings(value);
		if (key === demoDress) checkDemoDress(value);
		if (!key.startsWith('rig-')) continue;
		const { id, manifest } = value as StoredProject;
		try {
			if (id !== key || !supportedFormat(manifest?.format))
				throw new Error('Unsupported character record.');
			manifestShape(manifest);
			for (const pose of Object.values(manifest.rig.rest ?? {}))
				add(pose?.image, manifest.rig.cell);
			for (const item of manifest.items) {
				for (const hash of Object.values(item.dressed ?? {})) add(hash);
				for (const layer of item.layers) {
					const frame = layerFrame(manifest.rig, layer);
					for (const dirs of Object.values(layer.cells ?? {}))
						for (const cells of Object.values(dirs ?? {}))
							for (const hash of cells ?? []) add(hash, frame);
				}
			}
		} catch (cause) {
			const name = typeof manifest?.name === 'string' ? manifest.name.slice(0, 100) : key;
			throw new Error(
				`Saved character “${name}” has invalid character data or artwork references.`,
				{ cause }
			);
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
			code: integer(subjob?.errorCode, 0, 99999)
		});
	}
	for (const call of calls) {
		if (call.state !== 'failed' && !call.failedJobs?.length) continue;
		summaries.push({
			at: call.finishedAt ?? call.startedAt,
			tool: summaryTool(call.endpoint),
			outcome: 'failed',
			http: integer(call.status, 100, 599),
			code: integer(call.failedJobs?.[0]?.code ?? call.job?.code, 0, 99999)
		});
	}
	return summaries.sort((left, right) => right.at - left.at).slice(0, maxReports);
}

export async function exportWorkspace(
	view: WorkspaceView,
	diagnostics: { tier: number | null; calls: readonly ApiCall[] } | undefined,
	keys: readonly string[]
) {
	const snapshot = await readWorkspaceSnapshot(selects, artworkReferences, !!diagnostics);
	const { blobs, projects } = snapshot;
	if (projects.size > maxRecords) throw new Error(tooLarge);
	for (const value of projects.values()) {
		const record = value as Partial<StoredProject>;
		delete record.creationSpec;
		delete record.moveRecovery;
	}
	const references = artworkReferences(projects);
	const index: WorkspaceIndex = {
		format,
		build: `${__APP_VERSION__} (${__APP_COMMIT__})`,
		view,
		projects: [...projects],
		missing: [...references.keys()].filter((hash) => !blobs.has(hash)),
		...(diagnostics && {
			diagnostics: {
				tier: diagnostics.tier,
				errors: recentWorkspaceErrors(snapshot.jobs, diagnostics.calls)
			}
		})
	};
	const json = JSON.stringify(index);
	if (
		keys.some(
			(key) => key && (json.includes(key) || json.includes(JSON.stringify(key).slice(1, -1)))
		)
	)
		throw new Error(
			'A saved field contains the connected or remembered PixelLab key. Remove it from the workspace before exporting.'
		);
	const data = new TextEncoder().encode(json);
	if (
		index.missing.length > MAX_ZIP_ENTRIES ||
		blobs.size + 1 > MAX_ZIP_ENTRIES ||
		data.length + [...blobs.values()].reduce((sum, blob) => sum + blob.size, 0) > MAX_ZIP_BYTES
	)
		throw new Error(tooLarge);
	const entries = [{ name: indexPath, data }];
	let pixels = 0;
	for (const [hash, blob] of blobs) {
		const bytes = new Uint8Array(await blob.arrayBuffer());
		pixels += await verifyArtwork(bytes, hash, maxPixels - pixels, references.get(hash));
		entries.push({ name: `blobs/${hash}`, data: bytes });
	}
	const packed = await zip(entries);
	if (packed.length > MAX_ZIP_BYTES) throw new Error(tooLarge);
	return packed;
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
	if (pixels > remaining) throw new Error(tooLarge);
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

export async function readWorkspace(bytes: Uint8Array): Promise<WorkspaceArchive> {
	const files = await unzip(bytes);
	const json = files.get(indexPath);
	if (!json) throw new Error('Choose a ZIP made with Export my workspace, not a character ZIP.');
	const index = JSON.parse(
		new TextDecoder('utf-8', { fatal: true }).decode(json),
		(key, value: unknown) => {
			if (key === '__proto__') throw new Error('This workspace contains an unsafe property.');
			return value;
		}
	) as WorkspaceIndex | null;
	if (index?.format !== format) throw new Error('This workspace file version is not supported.');
	const { build, view, missing, diagnostics } = index;
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
		!Array.isArray(index.projects) ||
		index.projects.length > maxRecords ||
		!Array.isArray(missing) ||
		missing.length > MAX_ZIP_ENTRIES
	)
		throw new Error('This workspace index is invalid.');
	const projects = new Map<string, unknown>();
	for (const row of index.projects) {
		if (
			!Array.isArray(row) ||
			row.length !== 2 ||
			typeof row[0] !== 'string' ||
			!selects(row[0], row[1]) ||
			projects.has(row[0])
		)
			throw new Error('This workspace contains an unsupported or duplicate saved record.');
		projects.set(...row);
	}
	const references = artworkReferences(projects);
	const absent = new Set(missing);
	if (
		absent.size !== missing.length ||
		missing.some((hash) => typeof hash !== 'string' || !references.has(hash))
	)
		throw new Error('This workspace has an invalid list of missing files.');
	const blobs = new Map<string, Blob>();
	let pixels = 0;
	for (const [path, data] of files) {
		if (path === indexPath) continue;
		const hash = /^blobs\/([a-f0-9]{64})$/.exec(path)?.[1];
		if (!hash || !references.has(hash) || absent.has(hash))
			throw new Error('This workspace contains an unexpected file.');
		pixels += await verifyArtwork(data, hash, maxPixels - pixels, references.get(hash));
		blobs.set(hash, new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
	}
	if (references.size !== absent.size + blobs.size)
		throw new Error('Artwork is missing from this workspace ZIP.');
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
					(error.code !== undefined && integer(error.code, 0, 99999) === undefined)
			))
	)
		throw new Error('This workspace has invalid recent errors.');
	return { build, view, missing, diagnostics, projects, blobs };
}
