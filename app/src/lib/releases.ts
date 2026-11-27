export interface ReleaseEntry {
	version: string;
	date: string;
	headline: Record<string, string>;
	features: number;
}

export interface ReleaseNotes {
	headline: string;
	intro: string;
	joke: string;
	highlights: { title: string; text: string }[];
	fixes: { text: string }[];
}

export interface ReleaseChanges {
	total: number;
	groups: { kind: 'new' | 'improved' | 'fixed'; items: { text: string; sha: string }[] }[];
}

export const SEEN_RELEASE_KEY = 'pixeldoll.seenRelease';

export function createSeenRelease() {
	let seen: string | null = null;
	function sync() {
		try {
			seen = localStorage.getItem(SEEN_RELEASE_KEY);
		} catch {
			// When storage is blocked, keep the acknowledgement for this visit.
		}
		return seen;
	}
	return {
		sync,
		mark(version: string) {
			seen = version;
			try {
				localStorage.setItem(SEEN_RELEASE_KEY, version);
			} catch {
				// Optional storage. The in-memory acknowledgement still applies.
			}
			return seen;
		}
	};
}

export function releaseUrl(path: string): string {
	return new URL(`releases/${path}`, new URL(import.meta.env.BASE_URL, document.baseURI)).href;
}

async function read(path: string, mutable = false): Promise<unknown> {
	const response = await fetch(releaseUrl(path), {
		cache: mutable ? 'no-store' : 'default',
		signal: AbortSignal.timeout(12_000)
	});
	if (!response.ok) throw new Error(`Release file ${path} returned HTTP ${response.status}`);
	return response.json();
}

const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const count = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const textEntry = (value: unknown): value is { text: string } =>
	record(value) && string(value.text);

function isReleaseEntry(value: unknown): value is ReleaseEntry {
	return (
		record(value) &&
		string(value.version) &&
		/^\d+\.\d+\.\d+$/.test(value.version) &&
		string(value.date) &&
		/^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
		!Number.isNaN(Date.parse(value.date)) &&
		record(value.headline) &&
		string(value.headline.en) &&
		Object.values(value.headline).every(string) &&
		count(value.features)
	);
}

export async function fetchReleaseIndex(): Promise<ReleaseEntry[]> {
	const value = await read('index.json', true);
	if (!record(value) || !Array.isArray(value.releases) || !value.releases.every(isReleaseEntry))
		throw new Error('Invalid release index');
	return value.releases;
}

async function notes(version: string, locale: string): Promise<ReleaseNotes> {
	const value = await read(`${version}/notes.${encodeURIComponent(locale)}.json`);
	if (
		!record(value) ||
		!string(value.headline) ||
		!string(value.intro) ||
		!string(value.joke) ||
		!Array.isArray(value.highlights) ||
		!value.highlights.every((item) => record(item) && string(item.title) && string(item.text)) ||
		!Array.isArray(value.fixes) ||
		!value.fixes.every(textEntry)
	)
		throw new Error('Invalid release notes');
	return {
		headline: value.headline,
		intro: value.intro,
		joke: value.joke,
		highlights: value.highlights,
		fixes: value.fixes
	};
}

export async function fetchReleaseNotes(version: string, locale: string) {
	if (locale !== 'en') {
		try {
			return { locale, notes: await notes(version, locale) };
		} catch {
			// A translation may be missing or unavailable offline. Try the English notes.
		}
	}
	return { locale: 'en', notes: await notes(version, 'en') };
}

function isChangeGroup(value: unknown): value is ReleaseChanges['groups'][number] {
	return (
		record(value) &&
		(value.kind === 'new' || value.kind === 'improved' || value.kind === 'fixed') &&
		Array.isArray(value.items) &&
		value.items.every(
			(item) =>
				textEntry(item) && 'sha' in item && string(item.sha) && /^[a-f0-9]{40}$/i.test(item.sha)
		)
	);
}

export async function fetchReleaseChanges(version: string): Promise<ReleaseChanges> {
	const value = await read(`${version}/changes.json`);
	if (
		!record(value) ||
		!count(value.total) ||
		!Array.isArray(value.groups) ||
		!value.groups.every(isChangeGroup)
	)
		throw new Error('Invalid release changes');
	return { total: value.total, groups: value.groups };
}
