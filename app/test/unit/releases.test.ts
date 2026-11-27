import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createSeenRelease,
	fetchReleaseChanges,
	fetchReleaseIndex,
	fetchReleaseNotes,
	SEEN_RELEASE_KEY
} from '../../src/lib/releases.ts';

const scope = 'https://example.test/pixeldoll/';
const version = '1.4.12';
const notes = {
	headline: 'A fresh look',
	intro: 'Dress up your character.',
	highlights: [{ title: 'Color ramps', text: 'Recolor your gear.' }],
	fixes: []
};
const german = { ...notes, headline: 'Ein neuer Look' };
const index = {
	releases: [{ version, date: '2026-11-27', headline: { en: notes.headline }, features: 2 }]
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubEnv('BASE_URL', './');
	vi.stubGlobal('document', { baseURI: scope });
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('release data', () => {
	it('uses a mutable, app-relative index and reports failed or malformed data', async () => {
		fetchMock.mockResolvedValueOnce(Response.json(index));
		expect(await fetchReleaseIndex()).toEqual(index.releases);
		expect(fetchMock).toHaveBeenCalledWith(
			scope + 'releases/index.json',
			expect.objectContaining({ cache: 'no-store' })
		);
		fetchMock.mockResolvedValueOnce(Response.json({ releases: [{ version: '../wrong' }] }));
		await expect(fetchReleaseIndex()).rejects.toThrow('Invalid release index');
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
		await expect(fetchReleaseIndex()).rejects.toThrow('HTTP 503');
	});

	it('loads translated notes when available and falls back to English when missing', async () => {
		fetchMock.mockResolvedValueOnce(Response.json(german));
		expect(await fetchReleaseNotes(version, 'de')).toEqual({ locale: 'de', notes: german });
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
		fetchMock.mockResolvedValueOnce(Response.json(notes));
		expect(await fetchReleaseNotes(version, 'de')).toEqual({ locale: 'en', notes });
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
			['de', 'de', 'en'].map((locale) => `${scope}releases/${version}/notes.${locale}.json`)
		);
		fetchMock.mockRejectedValue(new TypeError('Offline'));
		await expect(fetchReleaseNotes(version, 'de')).rejects.toThrow('Offline');
	});

	it('loads change groups by version and requires a full commit SHA for links', async () => {
		const changes = {
			total: 1,
			groups: [{ kind: 'new', items: [{ text: 'Color ramps', sha: 'a'.repeat(40) }] }]
		};
		fetchMock.mockResolvedValueOnce(Response.json(changes));
		expect(await fetchReleaseChanges(version)).toEqual(changes);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`${scope}releases/${version}/changes.json`);
		changes.groups[0]!.items[0]!.sha = 'invalid';
		fetchMock.mockResolvedValueOnce(Response.json(changes));
		await expect(fetchReleaseChanges(version)).rejects.toThrow('Invalid release changes');
	});
});

describe('seen release', () => {
	it('persists an acknowledgement for the next visit and retains it in memory if storage is blocked', () => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => store.set(key, value)
		});
		const seen = createSeenRelease();
		expect(seen.sync()).toBeNull();
		expect(seen.mark(version)).toBe(version);
		expect(store.get(SEEN_RELEASE_KEY)).toBe(version);
		expect(createSeenRelease().sync()).toBe(version);
		const blocked = () => {
			throw new Error('Storage blocked');
		};
		vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
		expect(seen.mark('1.4.13')).toBe('1.4.13');
		expect(seen.sync()).toBe('1.4.13');
	});
});
