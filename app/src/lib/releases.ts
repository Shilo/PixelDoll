export interface ReleaseEntry {
	version: string;
	date: string;
	headline: Record<string, string>;
	features: number;
}

export interface ReleaseNotes {
	headline: string;
	intro: string;
	highlights: { title: string; text: string }[];
	fixes: { text: string }[];
}

export interface ReleaseChanges {
	total: number;
	groups: { kind: 'new' | 'improved' | 'fixed'; items: { text: string; sha: string }[] }[];
}

export const SEEN_RELEASE_KEY = 'pixeldoll.seenRelease';

/** Orders major.minor.patch versions; negative when `a` is older. */
export function compareVersions(a: string, b: string) {
	// A development build reports "<version>-dev": compare only the numbers.
	const [x, y] = [a, b].map((version) => version.split('-')[0].split('.').map(Number));
	return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

export function createSeenRelease() {
	let seen: string | null = null;
	function sync() {
		try {
			const stored = localStorage.getItem(SEEN_RELEASE_KEY);
			// Ignore anything that is not a version, so a damaged value cannot hide the unread dot for good.
			seen = stored && /^\d+\.\d+\.\d+$/.test(stored) ? stored : null;
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

export interface LatestRelease {
	version: string;
	features: number;
}

/**
 * The newest release's version and feature count, the only release data read at startup (no text, no images).
 * Null while nothing is published.
 */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
	let value: unknown;
	try {
		value = await read('latest.json', true);
	} catch (error) {
		if (/HTTP 404/.test(String(error))) return null;
		throw error;
	}
	if (record(value) && value.version === null) return null;
	if (
		!record(value) ||
		!string(value.version) ||
		!/^\d+\.\d+\.\d+$/.test(value.version) ||
		!count(value.features)
	)
		throw new Error('Invalid latest release');
	return { version: value.version, features: value.features };
}

export async function fetchReleaseIndex(): Promise<ReleaseEntry[]> {
	const value = await read('index.json', true);
	if (!record(value) || !Array.isArray(value.releases)) throw new Error('Invalid release index');
	// One damaged entry hides only itself, not every release and the unread dot.
	const valid = value.releases.filter(isReleaseEntry);
	if (valid.length < value.releases.length)
		console.warn(
			`PixelDoll skipped ${value.releases.length - valid.length} invalid release index entries`
		);
	return valid;
}

async function notes(version: string, locale: string): Promise<ReleaseNotes> {
	const value = await read(`${version}/notes.${encodeURIComponent(locale)}.json`);
	if (
		!record(value) ||
		!string(value.headline) ||
		!string(value.intro) ||
		!Array.isArray(value.highlights) ||
		!value.highlights.every((item) => record(item) && string(item.title) && string(item.text)) ||
		!Array.isArray(value.fixes) ||
		!value.fixes.every(textEntry)
	)
		throw new Error('Invalid release notes');
	return {
		headline: value.headline,
		intro: value.intro,
		highlights: value.highlights,
		fixes: value.fixes
	};
}

export async function fetchReleaseNotes(version: string, locale: string) {
	if (locale !== 'en') {
		try {
			return { locale, notes: await notes(version, locale) };
		} catch (error) {
			// A missing translation falls back to English by design; anything else is worth seeing in the console.
			if (!/HTTP 404/.test(String(error)))
				console.warn(`PixelDoll used English release notes for ${locale}:`, error);
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
