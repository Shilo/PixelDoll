import type { ReleaseCommit } from './changes.ts';

type Note = { text: string };
type Highlight = Note & { title: string };
type Translation = { headline: string; intro: string; highlights: Highlight[]; fixes: Note[] };
export type Notes = Translation;
export type CitedNotes = Omit<Notes, 'highlights' | 'fixes'> & {
	highlights: (Highlight & { commits: string[] })[];
	fixes: (Note & { commits: string[] })[];
	/** The scene PixelLab draws for the release banner, in English only; the maintenance message has none. */
	banner?: string;
};

const string = { type: 'string' };
const article = (properties: object) => ({
	type: 'object',
	additionalProperties: false,
	properties,
	required: Object.keys(properties)
});
const list = (items: object, minItems: number, maxItems: number) => ({
	type: 'array',
	items,
	minItems,
	maxItems
});
const commits = { type: 'array', items: string, minItems: 1, uniqueItems: true };

export const releaseNotesSchema = article({
	headline: string,
	intro: string,
	highlights: list(article({ title: string, text: string, commits }), 1, 4),
	fixes: list(article({ text: string, commits }), 0, 3),
	banner: string
});

export const translationSchema = (notes: Translation) =>
	article({
		headline: string,
		intro: string,
		highlights: list(
			article({ title: string, text: string }),
			notes.highlights.length,
			notes.highlights.length
		),
		fixes: list(article({ text: string }), notes.fixes.length, notes.fixes.length)
	});

const banned =
	/(?<![\p{L}\p{N}])(?:api|endpoint|refactor|module|ui|ux|ai|commits?|developers?|various|several improvements|minor improvements|bug fixes and improvements|enhanced|seamless(?:ly)?|robust|leverage|streamline|elevate|unlock|supercharge|game-changer|we['’]re excited|we are excited|thrilled|delighted|under the hood)(?![\p{L}\p{N}])/iu;
const emoji =
	/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20e3\ufe0f]|:[a-z0-9_+-]+:/u;
const links =
	/(?:[a-z][a-z\d+.-]*:\/\/|mailto:|www\.|\b[\p{L}\d-]+\.(?:com|org|net|io|dev|app|ai|co|gg|me)\b|\]\(|<[^>]+>)/iu;
const markdown =
	/`|\*|~~|(?:^|\s)_[^_]+_|(?:^|\n)\s*(?:#{1,6}\s|>\s|[-+]\s|\d+[.)]\s)|\n|\[[^\]]+\](?:\[|:)/;
const allowedCaps = new Set(['PNG', 'GIF', 'JSON', 'ZIP', 'AE', 'RPG', 'PWA']);
const words = new Intl.Segmenter('en', { granularity: 'word' });

function validate(
	value: unknown,
	english: boolean,
	input: ReleaseCommit[],
	original?: Translation
) {
	const errors: string[] = [];
	const cited = new Set<string>();
	const byId = new Map(input.map((commit) => [commit.id, commit]));
	const object = (actual: unknown, path: string, keys: string[]) => {
		if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
			errors.push(`${path} must be an object`);
			return {} as Record<string, unknown>;
		}
		const record = actual as Record<string, unknown>;
		for (const key of Object.keys(record))
			if (!keys.includes(key)) errors.push(`${path} has an unexpected field ${key}`);
		return record;
	};
	const prose = (actual: unknown, path: string, max: number, empty = false) => {
		if (typeof actual !== 'string' || (!empty && !actual.trim()) || actual !== actual.trim()) {
			errors.push(`${path} must be a trimmed ${empty ? '' : 'non-empty '}string`);
			return '';
		}
		if (/[!！]/u.test(actual) || emoji.test(actual) || links.test(actual) || markdown.test(actual))
			errors.push(`${path} contains an exclamation mark, emoji, link or markup`);
		if (!english) return actual;
		if ([...words.segment(actual)].filter((part) => part.isWordLike).length > max)
			errors.push(`${path} must have at most ${max} words`);
		const forbidden = actual.match(banned);
		if (forbidden) errors.push(`${path} uses banned wording "${forbidden[0]}"`);
		if (
			[...actual.matchAll(/(?<![\p{L}\p{N}])\p{Lu}{3,}(?![\p{L}\p{N}])/gu)].some(
				([word]) => !allowedCaps.has(word)
			)
		)
			errors.push(`${path} contains an all-caps word`);
		if (/\b\d+\.\d+\.\d+\b/u.test(actual)) errors.push(`${path} mentions a version number`);
		return actual;
	};
	const title = (actual: unknown, path: string, max: number) => {
		const text = prose(actual, path, max);
		if (/[.。．]$/u.test(text)) errors.push(`${path} must have no final period`);
		return text;
	};
	const citations = (actual: unknown, path: string, fix: boolean) => {
		if (!Array.isArray(actual) || !actual.length) {
			errors.push(`${path} must cite at least one commit id`);
			return;
		}
		for (const id of actual) {
			const commit = typeof id === 'string' ? byId.get(id) : undefined;
			if (!commit) errors.push(`${path} cites an unknown commit id`);
			else {
				if (cited.has(id)) errors.push(`${path} repeats commit ${id}`);
				if (fix && commit.type !== 'fix') errors.push(`${path} must cite only fix commits`);
				cited.add(id);
			}
		}
	};
	// Only Claude's own reply carries the banner scene; published and translated notes never do.
	const written = english && !original;
	const notes = object(value, 'notes', [
		'headline',
		'intro',
		'highlights',
		'fixes',
		...(written ? ['banner'] : [])
	]);
	const headline = title(notes.headline, 'headline', 8);
	const intro = prose(notes.intro, 'intro', 40);
	// The scene is checked on its own (bannerProblem): an unusable one costs only the banner, never the notes.
	if (written && typeof notes.banner !== 'string') errors.push('banner must be a string');
	if (english) {
		if (headline && intro.toLowerCase().includes(headline.toLowerCase()))
			errors.push('intro repeats the headline');
	}
	for (const [key, min, max] of [
		['highlights', original?.highlights.length ?? 1, original?.highlights.length ?? 4],
		['fixes', original?.fixes.length ?? 0, original?.fixes.length ?? 3]
	] as const) {
		const items = notes[key];
		if (!Array.isArray(items) || items.length < min || items.length > max) {
			errors.push(`${key} must have ${min === max ? min : `${min} to ${max}`} items`);
			continue;
		}
		const fix = key === 'fixes';
		items.forEach((item: unknown, index) => {
			const path = `${key}[${index}]`;
			const entry = object(item, path, [
				...(fix ? [] : ['title']),
				'text',
				...(english ? ['commits'] : [])
			]);
			const copy = prose(entry.text, `${path}.text`, fix ? 15 : 35);
			if (!fix) {
				const heading = title(entry.title, `${path}.title`, 6);
				if (english && heading && heading.toLowerCase() === headline.toLowerCase())
					errors.push(`${path}.title repeats the headline`);
			}
			if (english) {
				if (fix && /^Fixed\b/i.test(copy))
					errors.push(`${path}.text must not start with "Fixed" (the heading says it)`);
				citations(entry.commits, `${path}.commits`, fix);
			}
		});
	}
	return errors;
}

/** Why a banner scene cannot be drawn as written, or undefined when it can. */
export function bannerProblem(scene: string | undefined) {
	const text = scene?.trim() ?? '';
	if (!text) return 'Claude wrote no banner scene';
	if ([...words.segment(text)].filter((part) => part.isWordLike).length > 30)
		return 'the banner scene is longer than 30 words';
	if (/[.!?]\s+\S/.test(text)) return 'the banner scene is more than one sentence';
}

export const validateNotes = (value: unknown, input: ReleaseCommit[]) =>
	validate(value, true, input);
export const validateTranslation = (value: unknown, original: Translation) =>
	validate(value, false, [], original);

export function publicNotes({ headline, intro, highlights, fixes }: CitedNotes): Notes {
	return {
		headline,
		intro,
		highlights: highlights.map(({ title, text }) => ({ title, text })),
		fixes: fixes.map(({ text }) => ({ text }))
	};
}

export const emptyNotes: CitedNotes = {
	headline: 'A PixelDoll maintenance release',
	intro: 'This build includes maintenance updates for PixelDoll.',
	highlights: [],
	fixes: []
};
