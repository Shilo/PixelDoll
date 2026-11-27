import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import type { Changes } from './changes.ts';
import type { CitedNotes, Notes } from './notes.ts';

export type Source = {
	version: string;
	date: string;
	cutoff: string;
	sha: string;
	previousSha: string;
	model: string | null;
	commits: string[];
	notes: CitedNotes;
	bannerHash: string;
};

export type Index = {
	releases: { version: string; date: string; headline: Record<string, string>; features: number }[];
};

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
export const writeJson = (path: string, value: unknown) =>
	writeFileSync(path, JSON.stringify(value, null, '\t') + '\n');
const versionPattern = /^\d+\.\d\.\d{1,2}$/;

export function readSource(folder: string, version: string): Source {
	if (!versionPattern.test(version)) throw new Error(`Invalid release version ${version}`);
	const source = readJson<Source>(join(folder, version, 'source.json'));
	if (
		source.version !== version ||
		!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(source.cutoff) ||
		!Number.isFinite(Date.parse(source.cutoff)) ||
		source.date !== source.cutoff.slice(0, 10) ||
		!/^([a-f\d]{40}|[a-f\d]{64})$/.test(source.sha) ||
		!/^([a-f\d]{40}|[a-f\d]{64})$/.test(source.previousSha) ||
		!/^([a-f\d]{64})$/.test(source.bannerHash)
	)
		throw new Error(`Invalid source.json for release ${version}`);
	return source;
}

export function readStaged(folder: string, index: Index) {
	const listed = new Set(index.releases.map((entry) => entry.version));
	const pending = readdirSync(folder, { withFileTypes: true }).filter(
		(entry) => entry.isDirectory() && versionPattern.test(entry.name) && !listed.has(entry.name)
	);
	if (pending.length > 1) throw new Error('More than one release is staged');
	return pending.length ? readSource(folder, pending[0].name) : undefined;
}

export function readStagedAssets(folder: string, version: string) {
	const dir = join(folder, version);
	const notes = Object.fromEntries(
		readdirSync(dir).flatMap((file) => {
			const match = /^notes\.([\w-]+)\.json$/.exec(file);
			return match ? [[match[1], readJson<Notes>(join(dir, file))]] : [];
		})
	);
	if (!notes.en) throw new Error(`Staged release ${version} lacks English notes`);
	return {
		notes,
		changes: readJson<Changes>(join(dir, 'changes.json')),
		native: readFileSync(join(dir, 'banner.png'))
	};
}

export function writeStage(
	folder: string,
	source: Source,
	notes: Record<string, Notes>,
	changes: Changes,
	native: Uint8Array
) {
	mkdirSync(folder, { recursive: true });
	const target = join(folder, source.version);
	if (existsSync(target)) throw new Error(`Release ${source.version} is already staged`);
	const temporary = mkdtempSync(join(folder, '.stage-'));
	try {
		for (const [locale, copy] of Object.entries(notes))
			writeJson(join(temporary, `notes.${locale}.json`), copy);
		writeJson(join(temporary, 'source.json'), source);
		writeJson(join(temporary, 'changes.json'), changes);
		writeFileSync(join(temporary, 'banner.png'), native);
		renameSync(temporary, target);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}
