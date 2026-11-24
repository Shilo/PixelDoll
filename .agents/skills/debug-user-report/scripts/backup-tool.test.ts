// Offline backup tooling for the debug-user-report skill. Run it through run.mjs, never directly.
// TOOL_MODE=audit: open TOOL_ZIP the way the app does, in memory, audit it and write TOOL_OUT/report.json.
// TOOL_MODE=sample: write sample backups made from the demo fixture (public/fixtures/s2) to TOOL_OUT.
// IndexedDB is replaced by an in-memory store (as in test/unit/character-backup.test.ts), so nothing touches browser data.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadFixture } from '../../../../app/src/lib/compose/fixture.ts';
import { buildExport } from '../../../../app/src/lib/export/build.ts';
import { defaultExportSettings } from '../../../../app/src/lib/store/export-settings.ts';
import { validate } from '../../../../app/src/lib/export/generic.ts';
import type { Img } from '../../../../app/src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../../../app/src/lib/image/pngraw.ts';
import { cellHash } from '../../../../app/src/lib/rig/rig.ts';
import {
	characterFingerprint,
	exportBackup,
	planRestore,
	readBackupCopy,
	readRestoreSource,
	restoreCharacters
} from '../../../../app/src/lib/store/backup.ts';
import {
	hasVisibleBase,
	manifestShape,
	readCharacterZip
} from '../../../../app/src/lib/store/import.ts';
import {
	EXPORT_ENGINES,
	supportedFormat,
	type Manifest
} from '../../../../app/src/lib/store/manifest.ts';
import type { StoredProject } from '../../../../app/src/lib/store/project.ts';
import { artworkRefs } from '../../../../app/src/lib/store/workspace.ts';
import { unzip, zip } from '../../../../app/src/lib/store/zip.ts';
import { SECRET_FIELD } from '../../../../app/src/lib/debug/sanitize.ts';

const mem = vi.hoisted(() => ({
	projects: new Map<string, unknown>(),
	blobs: new Map<string, Blob>()
}));
vi.mock('../../../../app/src/lib/store/db.ts', async (original) => {
	const snapshot = (hashes: readonly string[]) => ({
		records: new Map(
			[...mem.projects]
				.filter(([key]) => key.startsWith('rig-'))
				.map(([key, value]) => [key, structuredClone(value)])
		),
		stored: new Set(hashes.filter((hash) => mem.blobs.has(hash)))
	});
	return {
		...((await original()) as object),
		get: async (_store: string, key: string) => structuredClone(mem.projects.get(key)),
		askPersist() {},
		readCharacters: async (hashes: readonly string[]) => snapshot(hashes),
		async addCharacters(
			hashes: readonly string[],
			add: (seen: ReturnType<typeof snapshot>) => {
				records: Map<string, unknown>;
				blobs: Map<string, Blob>;
			},
			opaque: ReadonlyMap<string, unknown> = new Map()
		) {
			const seen = snapshot(hashes);
			const out = add(seen);
			for (const [hash, blob] of out.blobs) mem.blobs.set(hash, blob);
			for (const [id, record] of out.records) mem.projects.set(id, structuredClone(record));
			for (const [id, record] of opaque)
				if (!mem.projects.has(id)) mem.projects.set(id, structuredClone(record));
			return seen;
		},
		async readWorkspaceSnapshot(
			select: (key: string, value: unknown) => boolean,
			references: (records: Map<string, unknown>) => ReadonlyMap<string, unknown>
		) {
			const projects = new Map(
				[...mem.projects]
					.filter(([key, value]) => !key.startsWith('library-archive:') && select(key, value))
					.map(([key, value]) => [key, structuredClone(value)])
			);
			const blobs = new Map<string, Blob>();
			for (const hash of references(projects).keys()) {
				const blob = mem.blobs.get(hash);
				if (blob) blobs.set(hash, blob);
			}
			return {
				projects,
				blobs,
				retainedIds: [...mem.projects.keys()].filter((key) => key.startsWith('library-archive:'))
			};
		}
	};
});

const MODE = process.env.TOOL_MODE;
const OUT = process.env.TOOL_OUT!;
const HEX = /^(?:sha256:)?([a-f0-9]{64})$/;
const hexOf = (hash: unknown) => (typeof hash === 'string' && HEX.exec(hash)?.[1]) || undefined;
const describe = (error: unknown) =>
	error instanceof Error
		? {
				name: error.name,
				message: error.message,
				...('translation' in error && {
					key: (error as { translation: { key?: string } }).translation?.key
				})
			}
		: { message: String(error) };
const clip = (text: unknown, max = 400) => {
	const value = typeof text === 'string' ? text : JSON.stringify(text);
	return value && value.length > max
		? `${value.slice(0, max)}… [${value.length - max} more]`
		: value;
};
const iso = (at: unknown) => (typeof at === 'number' ? new Date(at).toISOString() : at);

/** Fields named like secrets that still hold a value: path only, never the value. */
function secretLeaks(value: unknown, path = '$', out: string[] = []) {
	if (Array.isArray(value))
		value.forEach((entry, index) => secretLeaks(entry, `${path}[${index}]`, out));
	else if (value && typeof value === 'object')
		for (const [key, entry] of Object.entries(value)) {
			if (SECRET_FIELD.test(key) && typeof entry === 'string' && entry && entry !== '[redacted]')
				out.push(`${path}.${key}`);
			secretLeaks(entry, `${path}.${key}`, out);
		}
	return out;
}

/** Why the app's reader left a character out (workspace.ts recoverRecords swallows the reason). */
function whyOmitted(key: string, value: unknown) {
	const record = structuredClone(value) as Partial<StoredProject> | undefined;
	if (!key.startsWith('rig-')) return `record key "${key}" does not start with rig-`;
	if (record?.origin !== 'studio')
		return `origin is ${JSON.stringify(record?.origin)}, not "studio"`;
	if (record.id !== key) return `id ${JSON.stringify(record.id)} differs from its key`;
	if (!supportedFormat(record.manifest?.format))
		return `manifest format ${JSON.stringify(record.manifest?.format)} is not supported`;
	try {
		manifestShape(record.manifest);
	} catch (error) {
		return `manifestShape: ${describe(error).message}`;
	}
	try {
		for (const [hash] of artworkRefs(record.manifest))
			if (hash != null && !hexOf(hash)) return `invalid artwork reference ${clip(hash, 80)}`;
	} catch (error) {
		return `artwork references unreadable: ${describe(error).message}`;
	}
	return 'conflicting artwork dimensions or another check in workspace.ts recoverRecords';
}

/** Where a character shows each artwork hash. */
function artworkPlaces(manifest: Manifest) {
	const places = new Map<string, string[]>();
	const add = (hash: unknown, place: string) => {
		const hex = hexOf(hash);
		if (!hex) return;
		const list = places.get(hex) ?? [];
		if (list.length < 5) list.push(place);
		places.set(hex, list);
	};
	for (const [dir, pose] of Object.entries(manifest.rig.rest ?? {}))
		add(pose?.image, `rig.rest.${dir}`);
	for (const item of manifest.items) {
		for (const [dir, hash] of Object.entries(item.dressed ?? {}))
			add(hash, `${item.id}.dressed.${dir}`);
		for (const layer of item.layers)
			for (const [anim, dirs] of Object.entries(layer.cells ?? {}))
				for (const [dir, cells] of Object.entries(dirs ?? {}))
					(cells ?? []).forEach((hash, index) =>
						add(hash, `${item.id}/${layer.id} ${anim}/${dir}/${index}`)
					);
	}
	return places;
}

async function auditCharacter(id: string, record: StoredProject, blobs: Map<string, Blob>) {
	const m = record.manifest;
	const out: Record<string, unknown> = {
		id,
		name: m.name,
		savedAt: record.savedAt,
		restoredFrom: record.restoredFrom,
		cell: m.rig.cell,
		pivot: m.rig.pivot,
		directions: m.rig.directions.map((d) => (d.mirrorOf ? `${d.id}=mirror(${d.mirrorOf})` : d.id)),
		moves: m.rig.animations.map((a) => `${a.id}:${a.cells}`),
		keypoints: Object.keys(m.rig.anchors ?? {}),
		slots: m.slots.length,
		materials: m.materials.length,
		outfits: m.presets.map((p) => p.id),
		items: m.items.map((item) => ({
			id: item.id,
			slot: item.slot,
			status: item.status,
			layers: item.layers.map((layer) => layer.id),
			qa: item.qa?.status,
			route: item.route
		}))
	};
	const problems: string[] = [];
	const notes: string[] = [];
	const slotIds = new Set(m.slots.map((slot) => slot.id));
	for (const item of m.items)
		if (item.slot !== 'body' && !slotIds.has(item.slot))
			problems.push(`${item.id}: slot "${item.slot}" is not in slots`);
	for (const material of m.materials)
		for (const [variant, ramp] of Object.entries(material.variants ?? {}))
			if (ramp.length !== material.ramp.length)
				problems.push(
					`material ${material.id} variant ${variant}: ${ramp.length} colors for a ${material.ramp.length}-color ramp`
				);
	const generated = m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
	for (const item of m.items)
		for (const layer of item.layers) {
			const lacking: string[] = [];
			for (const anim of m.rig.animations) {
				const dirs = layer.cells?.[anim.id];
				if (!dirs) {
					lacking.push(anim.id);
					continue;
				}
				for (const dir of generated) {
					const cells = dirs[dir];
					if (!cells) lacking.push(`${anim.id}/${dir}`);
					else if (cells.length !== anim.cells)
						problems.push(
							`${item.id}/${layer.id} ${anim.id}/${dir}: ${cells.length} cells for ${anim.cells} frames`
						);
				}
			}
			if (lacking.length)
				(item.slot === 'body' ? problems : notes).push(
					`${item.id}/${layer.id} has no cells for ${lacking.slice(0, 8).join(', ')}${lacking.length > 8 ? ` (+${lacking.length - 8})` : ''}`
				);
		}
	const places = artworkPlaces(m);
	const absent = [...places].filter(([hex]) => !blobs.has(hex));
	if (absent.length)
		problems.push(
			`${absent.length} artwork file(s) missing or failed verification, e.g. ${absent
				.slice(0, 3)
				.map(([hex, where]) => `${hex.slice(0, 12)} at ${where.join('; ')}`)
				.join(' | ')}`
		);
	const images = new Map<string, Img>();
	for (const hex of places.keys()) {
		const blob = blobs.get(hex);
		if (!blob) continue;
		try {
			images.set(`sha256:${hex}`, await decodePngBytes(new Uint8Array(await blob.arrayBuffer())));
		} catch (error) {
			problems.push(`artwork ${hex.slice(0, 12)} does not decode: ${describe(error).message}`);
		}
	}
	const project = { manifest: structuredClone(m), images };
	// validate() is the strict import check; the Studio export below repairs some of what it flags (it drops outfit items
	// that do not exist, with a note), so read both before calling something user-visible.
	for (const error of validate(project)) problems.push(`validate (import check): ${error}`);
	if (!hasVisibleBase(project)) problems.push('no visible base frames');
	// Export to every engine the way the Studio's Export sheet does (buildExport, first outfit, default settings), then
	// import the editable character ZIP back.
	const exports: Record<string, unknown> = {};
	const failures = new Map<string, string[]>();
	const fail = (engine: string, message: string) =>
		failures.set(message, [...(failures.get(message) ?? []), engine]);
	const look = m.presets[0] ?? { items: {}, variants: {} };
	for (const engine of EXPORT_ENGINES) {
		try {
			const result = await buildExport(structuredClone(project), {
				engine,
				baked: false,
				look,
				settings: defaultExportSettings()
			});
			const ok = result.kind === 'requested' && result.zip;
			exports[engine] = ok
				? { bytes: result.zip!.length, notes: result.warnings.slice(0, 5) }
				: { kind: result.kind, problem: result.problem, errors: result.errors.slice(0, 5) };
			if (!ok)
				fail(
					engine,
					`${result.kind === 'recovery' ? 'only the artwork recovery ZIP' : 'failed'}: ${[result.problem, ...result.errors.slice(0, 2)].join('; ')}`
				);
			else if (result.warnings.length)
				notes.push(`export ${engine} notes: ${result.warnings.slice(0, 3).join('; ')}`);
			if (engine === 'generic' && ok) {
				const back = await readCharacterZip(result.zip!);
				const before = m.items.map((item) => item.id).join(',');
				const after = back.project.manifest.items.map((item) => item.id).join(',');
				exports.reimport = before === after ? 'items match' : { before, after };
				if (before !== after) problems.push('character ZIP round trip changed the item list');
			}
		} catch (error) {
			exports[engine] = { threw: describe(error) };
			fail(engine, `threw ${describe(error).message}`);
		}
	}
	for (const [message, engines] of failures)
		problems.push(
			`export ${engines.length === EXPORT_ENGINES.length ? 'to every engine' : engines.join(', ')}: ${message}`
		);
	return { ...out, problems, notes, exports };
}

function summarizeDebug(files: Map<string, Uint8Array>) {
	const text = (name: string) => {
		const data = files.get(`debug/${name}`);
		return data && new TextDecoder().decode(data);
	};
	const parsed: Record<string, unknown> = {};
	const unreadable: string[] = [];
	for (const path of files.keys()) {
		if (!path.startsWith('debug/') || !path.endsWith('.json')) continue;
		try {
			parsed[path.slice(6)] = JSON.parse(text(path.slice(6))!);
		} catch (error) {
			unreadable.push(`${path}: ${describe(error).message}`);
		}
	}
	const out: Record<string, unknown> = {
		files: [...files.keys()].filter(
			(path) => path.startsWith('debug/') && !path.startsWith('debug/blobs/')
		),
		images: [...files.keys()].filter((path) => path.startsWith('debug/blobs/')).length,
		unreadable,
		failed: text('failed.txt'),
		index: parsed['index.json'],
		secretLeaks: Object.entries(parsed).flatMap(([name, value]) => secretLeaks(value, name))
	};
	const log = parsed['log.json'];
	if (Array.isArray(log)) {
		const entries = [...log].sort((a, b) => (a?.at ?? 0) - (b?.at ?? 0));
		const levels: Record<string, number> = {};
		for (const entry of entries) levels[entry?.level] = (levels[entry?.level] ?? 0) + 1;
		out.log = {
			count: entries.length,
			levels,
			first: iso(entries[0]?.at),
			last: iso(entries.at(-1)?.at),
			problems: entries
				.filter((entry) => entry?.level !== 'info')
				.map((entry) => ({
					at: iso(entry.at),
					tab: entry.tab,
					level: entry.level,
					source: entry.source,
					message: clip(entry.message),
					stack: clip(entry.stack, 600)
				}))
		};
	}
	const jobs = parsed['jobs.json'];
	if (Array.isArray(jobs)) {
		const states: Record<string, number> = {};
		for (const job of jobs) states[job?.state] = (states[job?.state] ?? 0) + 1;
		out.jobs = {
			count: jobs.length,
			states,
			notDone: jobs
				.filter((job) => job?.state !== 'done')
				.map((job) => ({
					id: job.id,
					label: job.label,
					endpoint: job.endpoint,
					state: job.state,
					attempts: job.attempts,
					requestStarted: job.requestStarted,
					errorKind: job.errorKind,
					error: clip(job.error),
					createdAt: iso(job.createdAt),
					finishedAt: iso(job.finishedAt),
					subJobs: Array.isArray(job.jobs)
						? job.jobs.map((sub: Record<string, unknown>) => ({
								status: sub.status,
								done: sub.done,
								error: clip(sub.error, 200)
							}))
						: undefined
				}))
		};
	}
	const activity = parsed['activity.json'];
	if (Array.isArray(activity))
		out.activity = {
			count: activity.length,
			failed: activity
				.filter(
					(call) =>
						call?.state === 'failed' || (typeof call?.status === 'number' && call.status >= 400)
				)
				.map((call) => ({
					at: iso(call.startedAt),
					method: call.method,
					endpoint: call.endpoint,
					status: call.status,
					state: call.state,
					label: call.label,
					error: clip(call.error ?? call.response, 300)
				}))
		};
	const state = parsed['state.json'] as Record<string, unknown> | undefined;
	if (state)
		out.state = {
			studio: state.studio,
			connection: state.connection,
			queue: clip(state.queue, 2000)
		};
	const environment = parsed['environment.json'] as Record<string, unknown> | undefined;
	if (environment)
		out.environment = {
			report: environment.report,
			storage: environment.storage,
			online: environment.online,
			standalone: environment.standalone,
			serviceWorker: environment.serviceWorker,
			deviceMemory: environment.deviceMemory,
			features: environment.features
		};
	const records = parsed['records.json'] as Record<string, Record<string, unknown>> | undefined;
	if (records)
		out.records = Object.fromEntries(
			Object.entries(records).map(([key, value]) => [
				key,
				value && typeof value === 'object' ? Object.keys(value).slice(0, 20) : typeof value
			])
		);
	const storage = parsed['storage.json'] as { local?: Record<string, string> } | undefined;
	if (storage?.local) out.localStorageKeys = Object.keys(storage.local);
	const artwork = parsed['artwork.json'];
	if (Array.isArray(artwork)) {
		const where: Record<string, number> = {};
		for (const entry of artwork) where[entry?.in] = (where[entry?.in] ?? 0) + 1;
		out.artwork = { count: artwork.length, where };
	}
	return out;
}

async function audit() {
	const report: Record<string, unknown> = { zip: process.env.TOOL_ZIP_NAME };
	const bytes = new Uint8Array(await readFile(process.env.TOOL_ZIP!));
	report.bytes = bytes.length;
	let files: Map<string, Uint8Array>;
	try {
		files = await unzip(bytes);
	} catch (error) {
		report.unzip = describe(error);
		return report;
	}
	const paths = [...files.keys()];
	report.layout = {
		entries: paths.length,
		backupJson: files.has('backup.json'),
		characterZip: files.has('project.json') || files.has('metadata.json'),
		blobs: paths.filter((path) => path.startsWith('blobs/')).length,
		archives: paths.filter((path) => path.startsWith('archives/')).length,
		debug: paths.some((path) => path.startsWith('debug/')),
		other: paths
			.filter((path) => !/^(backup\.json$|blobs\/|archives\/|debug\/)/.test(path))
			.slice(0, 20)
	};
	let index: Record<string, unknown> | undefined;
	try {
		index = JSON.parse(new TextDecoder().decode(files.get('backup.json')!));
		report.index = {
			format: index!.format,
			build: index!.build,
			characters: Array.isArray(index!.characters)
				? (index!.characters as [string, StoredProject][]).map(([key, value]) => ({
						key,
						name: value?.manifest?.name,
						savedAt: value?.savedAt
					}))
				: index!.characters,
			listedMissing: Array.isArray(index!.missing) ? index!.missing.length : index!.missing,
			omittedAtBackup: index!.omitted ?? 0
		};
		report.indexSecretLeaks = secretLeaks(index);
	} catch (error) {
		report.index = { unreadable: describe(error) };
	}
	if (files.has('debug/README.txt') || [...files.keys()].some((path) => path.startsWith('debug/')))
		report.debug = summarizeDebug(files);
	let source;
	try {
		source = await readRestoreSource(bytes);
		report.restore = {
			build: source.build,
			characters: [...source.characters.keys()],
			artwork: source.blobs.size,
			missingArtwork: source.missing?.length ?? 0,
			unreadable: source.unreadable,
			trimmedHistory: source.trimmed,
			archives: source.archives?.map((pack) => ({
				id: pack.id.slice(0, 30),
				count: pack.count
			}))
		};
	} catch (error) {
		report.restore = { refused: describe(error) };
	}
	try {
		const copy = await readBackupCopy(bytes);
		report.openAsCopy = {
			characters: copy.projects.size,
			missing: copy.missing.length,
			omitted: copy.omitted ?? 0
		};
	} catch (error) {
		report.openAsCopy = { refused: describe(error) };
	}
	if (index && Array.isArray(index.characters))
		report.omitted = (index.characters as [string, unknown][])
			.filter(([key]) => !source?.characters.has(key))
			.map(([key, value]) => ({ key, why: whyOmitted(key, value) }));
	if (!source) return report;
	report.characters = [];
	for (const [id, record] of source.characters)
		(report.characters as unknown[]).push(await auditCharacter(id, record, source.blobs));
	// Restore into an empty library, back it up again and read that back: every character must survive unchanged.
	try {
		mem.projects.clear();
		mem.blobs.clear();
		const plan = await planRestore(source);
		const restored = await restoreCharacters(plan);
		const again = await readRestoreSource((await exportBackup([])).bytes);
		const fingerprints = new Map<string, string>();
		for (const record of again.characters.values())
			fingerprints.set(record.restoredFrom?.id ?? record.id, await characterFingerprint(record));
		report.roundTrip = {
			plan: plan.entries.map(({ id, action }) => ({ id, action })),
			blockers: plan.blockers,
			warnings: plan.warnings,
			restored: restored.added.length,
			changed: await Promise.all(
				plan.entries
					.filter(({ action }) => action === 'add' || action === 'copy')
					.filter(({ id, fingerprint }) => fingerprints.get(id) !== fingerprint)
					.map(({ id }) => id)
			)
		};
	} catch (error) {
		report.roundTrip = { threw: describe(error) };
	}
	return report;
}

// Sample backups from the demo fixture, for testing this skill: a healthy one, one with a synthetic debug/ folder, and one
// with deliberate damage of the kinds users report.
async function samples() {
	await mkdir(OUT, { recursive: true });
	const project = await loadFixture(
		async (path) => new Uint8Array(await readFile(join(process.cwd(), 'public/fixtures/s2', path)))
	);
	const blobs = new Map<string, Blob>();
	for (const [hash, image] of project.images)
		blobs.set(
			hash.slice(7),
			new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>], {
				type: 'image/png'
			})
		);
	const character = (id: string, manifest: Manifest): StoredProject => ({
		id,
		savedAt: '2026-11-20T10:00:00.000Z',
		origin: 'studio',
		manifest: structuredClone(manifest)
	});
	mem.projects = new Map([['rig-sample-good', character('rig-sample-good', project.manifest)]]);
	mem.blobs = new Map(blobs);
	const good = (await exportBackup([])).bytes;
	await writeFile(join(OUT, 'pixeldoll-sample.backup.zip'), good);

	const now = Date.parse('2026-11-20T10:00:00.000Z');
	const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 1));
	const debug = (extra: Record<string, unknown>) =>
		Object.entries({
			'index.json': {
				format: 1,
				writtenAt: new Date(now).toISOString(),
				build: 'audit (local)',
				tab: 't1',
				counts: {},
				leftOut: {}
			},
			'environment.json': {
				report: { browser: 'Chrome 142', os: 'Windows', locale: 'en' },
				storage: {
					estimate: { usage: 12_000_000, quota: 300_000_000_000 },
					persisted: true
				},
				online: true
			},
			'state.json': {
				studio: { screen: 'studio', sheet: null },
				connection: { connected: true, remembered: true },
				queue: []
			},
			'log.json': [
				{
					id: 't1:1',
					at: now - 60_000,
					tab: 't1',
					level: 'info',
					source: 'boot',
					message: 'started'
				}
			],
			'activity.json': [],
			'jobs.json': [],
			'records.json': {},
			'storage.json': {
				local: { 'pixeldoll.developerMode': '1' },
				session: {}
			},
			'artwork.json': [],
			...extra
		}).map(([name, value]) => ({ name: `debug/${name}`, data: json(value) }));
	const readme = {
		name: 'debug/README.txt',
		data: new TextEncoder().encode('PixelDoll debugging details (sample)\n')
	};
	await writeFile(
		join(OUT, 'pixeldoll-sample.debug.backup.zip'),
		(await exportBackup([], [readme, ...debug({})])).bytes
	);

	// Damage, each of a kind users hit: a character whose artwork is absent, one whose artwork bytes do not match their hash,
	// one with an impossible frame count (left out on restore), and one whose outfit names an item it lacks (restores, then
	// fails to export).
	const files = await unzip(good);
	const index = JSON.parse(new TextDecoder().decode(files.get('backup.json')!));
	const base = index.characters[0][1] as StoredProject;
	const variant = (id: string, change: (m: Manifest) => void) => {
		const record = structuredClone(base);
		record.id = id;
		record.manifest.name = `${base.manifest.name} ${id.slice(4)}`;
		change(record.manifest);
		return [id, record];
	};
	const odd = {
		w: project.manifest.rig.cell.w,
		h: project.manifest.rig.cell.h,
		data: new Uint8ClampedArray(project.manifest.rig.cell.w * project.manifest.rig.cell.h * 4)
	} as Img;
	odd.data[3] = 255;
	const oddHash = await cellHash(odd);
	const other = { ...odd, data: odd.data.slice() } as Img;
	other.data[7] = 255;
	const absent = `sha256:${'ab'.repeat(32)}`;
	const firstLayer = (m: Manifest) => m.items.find((item) => item.slot !== 'body')!.layers[0];
	const firstCells = (m: Manifest) => {
		const anim = m.rig.animations[0].id;
		const dir = m.rig.directions[0].id;
		return firstLayer(m).cells![anim]![dir]!;
	};
	index.build = '0.1.0 (3f8fc0210)';
	index.characters = [
		[base.id, base],
		variant('rig-missing-art', (m) => {
			const cells = firstCells(m);
			cells[0] = absent as never;
			cells[1] = oddHash as never;
		}),
		variant('rig-bad-frames', (m) => {
			m.rig.animations[0].cells = 0;
		}),
		variant('rig-bad-outfit', (m) => {
			const preset = m.presets[0];
			const slot = Object.keys(preset.items).find((id) => id !== 'body')!;
			preset.items[slot] = 'no-such-item';
		})
	];
	files.set('backup.json', new TextEncoder().encode(JSON.stringify(index)));
	files.set(`blobs/${oddHash.slice(7)}`, await encodePngBytes(other));
	for (const { name, data } of debug({
		'log.json': [
			{
				id: 't1:1',
				at: now - 3_600_000,
				tab: 't1',
				level: 'info',
				source: 'boot',
				message: 'started'
			},
			{
				id: 't1:2',
				at: now - 1_800_000,
				tab: 't1',
				level: 'warn',
				source: 'queue',
				message: 'Job pd-2 is still running after 30 minutes'
			},
			{
				id: 't1:3',
				at: now - 900_000,
				tab: 't1',
				level: 'error',
				source: 'unhandledrejection',
				message: 'QuotaExceededError: The quota has been exceeded.',
				stack: 'QuotaExceededError\n    at saveProject (db.ts)'
			},
			{
				id: 't2:1',
				at: now - 600_000,
				tab: 't2',
				level: 'error',
				source: 'toast',
				message: 'Export failed: rig-bad-outfit: outfit names an item that does not exist'
			}
		],
		'jobs.json': [
			{
				id: 'pd-1',
				label: 'Dress hair',
				endpoint: '/animate-with-skeleton-v3',
				state: 'done',
				attempts: 1,
				createdAt: now - 7_200_000,
				finishedAt: now - 7_000_000,
				jobs: []
			},
			{
				id: 'pd-2',
				label: 'Dress cape',
				endpoint: '/edit-animation-v2',
				state: 'running',
				attempts: 1,
				requestStarted: true,
				createdAt: now - 3 * 86_400_000,
				jobs: [{ id: 'bg-9', status: 'processing', done: false, results: [] }]
			},
			{
				id: 'pd-3',
				label: 'Dress boots',
				endpoint: '/inpaint-v3',
				state: 'failed',
				attempts: 2,
				errorKind: 'rate',
				error: '429 Too Many Requests',
				createdAt: now - 3_000_000,
				finishedAt: now - 2_900_000,
				jobs: []
			}
		],
		'activity.json': [
			{
				id: 'a1',
				method: 'POST',
				endpoint: '/inpaint-v3',
				url: 'https://api.pixellab.ai/v2/inpaint-v3',
				startedAt: now - 2_950_000,
				status: 429,
				state: 'failed',
				background: false,
				kind: 'api'
			},
			{
				id: 'a2',
				method: 'GET',
				endpoint: '/background-jobs/bg-9',
				url: 'https://api.pixellab.ai/v2/background-jobs/bg-9',
				startedAt: now - 2_000_000,
				status: 500,
				state: 'failed',
				background: true,
				kind: 'api'
			}
		],
		'environment.json': {
			report: { browser: 'Safari 19', os: 'iPadOS', locale: 'en' },
			storage: {
				estimate: { usage: 980_000_000, quota: 1_000_000_000 },
				persisted: false
			},
			online: true
		},
		'records.json': {
			'studio-drafts': {
				id: 'studio-drafts',
				gens: [{ id: 'g1', item: 'cape', status: 'running' }]
			}
		}
	}))
		files.set(name, data);
	files.set(readme.name, readme.data);
	await writeFile(
		join(OUT, 'pixeldoll-sample-broken.debug.backup.zip'),
		await zip([...files].map(([name, data]) => ({ name, data })))
	);
	return {
		written: [
			'pixeldoll-sample.backup.zip',
			'pixeldoll-sample.debug.backup.zip',
			'pixeldoll-sample-broken.debug.backup.zip'
		]
	};
}

test(`backup tool: ${MODE}`, async () => {
	const result =
		MODE === 'audit'
			? await audit()
			: MODE === 'sample'
				? await samples()
				: { error: `unknown TOOL_MODE ${MODE}` };
	await mkdir(OUT, { recursive: true });
	await writeFile(
		join(OUT, MODE === 'audit' ? 'report.json' : 'samples.json'),
		JSON.stringify(result, null, 1)
	);
});
