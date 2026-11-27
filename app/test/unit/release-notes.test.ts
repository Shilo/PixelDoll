import { afterEach, expect, it, vi } from 'vitest';
import {
	afterSeparator,
	type Claude,
	labelsFor,
	model,
	translations,
	writeNotes
} from '../../scripts/release/claude.ts';
import { buildChanges, type ReleaseCommit } from '../../scripts/release/changes.ts';
import { releaseMarkdown } from '../../scripts/release/markdown.ts';
import { publicNotes, validateNotes, validateTranslation } from '../../scripts/release/notes.ts';

const feature = {
	id: 'aaaaaaa',
	sha: 'a'.repeat(40),
	type: 'feat',
	scope: 'export',
	subject: 'save PNGs',
	body: ''
} satisfies ReleaseCommit;
const fix = {
	...feature,
	id: 'bbbbbbb',
	sha: 'b'.repeat(40),
	type: 'fix',
	subject: 'keep your outfit'
} satisfies ReleaseCommit;
const commits = [feature, fix];
const notes = {
	headline: 'Give your sprites a home',
	intro: 'You can save sprites and keep your outfit.',
	highlights: [
		{ title: 'Save a sprite', text: 'Save your work as a PNG file.', commits: [feature.id] }
	],
	fixes: [{ text: 'Outfits no longer disappear when you open a character.', commits: [fix.id] }]
};

afterEach(() => vi.unstubAllGlobals());

it('checks release prose, shape, word limits and unique citations to eligible commits', () => {
	expect(validateNotes(notes, commits)).toEqual([]);
	expect(
		validateNotes(
			{
				...notes,
				headline: 'Now unlock an enhanced UI!',
				intro: 'one '.repeat(41).trim(),
				highlights: [
					{ title: '**CAPS**', text: 'Go to https://example.com ⚔️', commits: ['bad', feature.id] }
				],
				fixes: [{ text: 'Fixed this.', commits: [feature.id] }],
				ignored: true
			},
			commits
		)
	).toEqual(
		expect.arrayContaining([
			'notes has an unexpected field ignored',
			'headline contains an exclamation mark, emoji, link or markup',
			'headline uses banned wording "unlock"',
			'intro must have at most 40 words',
			'highlights[0].title contains an all-caps word',
			'highlights[0].text contains an exclamation mark, emoji, link or markup',
			'highlights[0].commits cites an unknown commit id',
			'fixes[0].text must not start with "Fixed" (the heading says it)',
			`fixes[0].commits repeats commit ${feature.id}`,
			'fixes[0].commits must cite only fix commits'
		])
	);
	expect(validateNotes({ ...notes, headline: 'A new UI' }, commits)).toContain(
		'headline uses banned wording "UI"'
	);
});

it('requires matching translation item counts and plain, non-empty prose', () => {
	const english = publicNotes(notes);
	expect(validateTranslation(english, english)).toEqual([]);
	expect(
		validateTranslation(
			{ ...english, headline: '   ', intro: 'Bonjour！', highlights: [] },
			english
		)
	).toEqual([
		'headline must be a trimmed non-empty string',
		'intro contains an exclamation mark, emoji, link or markup',
		'highlights must have 1 items'
	]);
});

it('passes the prompt verbatim and asks Claude for corrected JSON once', async () => {
	expect(afterSeparator('# Header\r\n\r\n---\r\n\r\nLiteral copy\r\n')).toBe(
		'\r\nLiteral copy\r\n'
	);
	const reply = (value: unknown) => ({
		stop_reason: 'end_turn',
		content: [{ type: 'text', text: JSON.stringify(value) }]
	});
	const create = vi.fn((_request: Record<string, unknown>) => Promise.resolve(reply(notes)));
	create.mockResolvedValueOnce(reply({ ...notes, headline: 'Try again!' }));
	const claude = {
		beta: { messages: { stream: (request: never) => ({ finalMessage: () => create(request) }) } }
	} as unknown as Claude;
	await expect(writeNotes(claude, '0.0.1', '2026-11-27', commits)).resolves.toEqual(notes);
	expect(create).toHaveBeenCalledTimes(2);
	const request = create.mock.calls[1][0];
	expect(request).toMatchObject({
		model,
		fallbacks: 'default',
		output_config: { format: { type: 'json_schema' } },
		messages: [
			{ role: 'user' },
			{ role: 'assistant' },
			{ role: 'user', content: expect.stringContaining('headline contains an exclamation mark') }
		]
	});
	expect(JSON.stringify(request.output_config)).not.toMatch(/minItems|maxItems|uniqueItems/);
	expect(request.system).toMatch(/^\s*You write the release notes for PixelDoll/);
	create.mockReset().mockImplementation(() => Promise.resolve(reply({ ...notes, highlights: [] })));
	await expect(writeNotes(claude, '0.0.1', '2026-11-27', commits)).rejects.toThrow(
		/highlights must have/
	);
	expect(create).toHaveBeenCalledTimes(2);
	create.mockReset().mockResolvedValue({ stop_reason: 'refusal', content: [] });
	await expect(writeNotes(claude, '0.0.1', '2026-11-27', commits)).rejects.toThrow(/declined/);
});

it('maps app labels that appear in the notes to the target language', () => {
	const english = new Map([
		['trash.title', 'Trash'],
		['undo', 'Undo'],
		['greeting', 'Hello {name}'],
		['lower', 'move']
	]);
	const german = new Map([
		['trash.title', 'Papierkorb'],
		['undo', 'Rückgängig'],
		['greeting', 'Hallo {name}'],
		['lower', 'Animation']
	]);
	expect(labelsFor('Restore it from Trash, or move it back.', english, german)).toEqual({
		Trash: 'Papierkorb'
	});
});

it('renders the same data as the app, escaping literal commit subjects and bounding the body', () => {
	const changes = buildChanges([{ ...feature, subject: 'keep [layers] & <colors>' }, fix]);
	const body = releaseMarkdown(
		'0.0.1',
		'2026-11-27',
		publicNotes(notes),
		changes,
		'Shilo/PixelDoll',
		'https://example.com/banner.png',
		'https://example.com/compare'
	);
	// The release title carries the headline, so the body opens with the date and the banner.
	expect(body.startsWith('November 27, 2026 · v0.0.1\n\n![](https://example.com/banner.png)')).toBe(
		true
	);
	expect(body).toContain('## Save a sprite\n\nSave your work as a PNG file.');
	expect(body).toContain('<details><summary>All changes (2)</summary>');
	expect(body).toContain(
		`[Export: Keep \\[layers\\] &amp; &lt;colors&gt;](https://github.com/Shilo/PixelDoll/commit/${feature.sha})`
	);
	expect(() =>
		releaseMarkdown(
			'0.0.1',
			'2026-11-27',
			{ ...publicNotes(notes), intro: 'a'.repeat(125_000) },
			changes,
			'Shilo/PixelDoll',
			'banner.png',
			'https://example.com/compare'
		)
	).toThrow(/size limit/);
	const many = buildChanges(
		Array.from({ length: 3000 }, (_, i) => ({
			...feature,
			sha: i.toString(16).padStart(40, '0'),
			subject: `change number ${i} with a fairly long description`
		}))
	);
	const shortened = releaseMarkdown(
		'0.0.1',
		'2026-11-27',
		publicNotes(notes),
		many,
		'Shilo/PixelDoll',
		'banner.png',
		'https://example.com/compare'
	);
	expect(shortened.length).toBeLessThan(125_000);
	expect(shortened).toContain('<summary>All changes (3000)</summary>');
	expect(shortened).toContain('[See all 3000 changes](https://example.com/compare)');
});

it('fails the run instead of falling back to English when Claude is unreachable', async () => {
	const create = vi.fn((_request: unknown) => Promise.reject(new Error('connection reset')));
	const claude = {
		beta: { messages: { stream: (request: never) => ({ finalMessage: () => create(request) }) } }
	} as unknown as Claude;
	await expect(translations(claude, notes)).rejects.toThrow('connection reset');
});

it('accepts the app feature name State in release prose', () => {
	expect(
		validateNotes(
			{
				...notes,
				highlights: [{ ...notes.highlights[0], title: 'Make a new State', commits: [feature.id] }]
			},
			commits
		)
	).toEqual([]);
});

it('leaves out All changes when a maintenance release has none', () => {
	const body = releaseMarkdown(
		'0.0.2',
		'2026-11-27',
		publicNotes(notes),
		{ total: 0, groups: [] },
		'Shilo/PixelDoll',
		'banner.png',
		'https://example.com/compare'
	);
	expect(body).not.toContain('<details>');
});
