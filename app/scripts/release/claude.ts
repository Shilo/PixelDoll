import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, readdirSync } from 'node:fs';
import type { ReleaseCommit } from './changes.ts';
import {
	type CitedNotes,
	type Notes,
	releaseNotesSchema,
	translationSchema,
	validateNotes,
	validateTranslation,
	publicNotes,
	emptyNotes
} from './notes.ts';

export const model = 'claude-opus-5-5';
const docs = new URL('../../../docs/', import.meta.url);
const locales = new URL('../../src/locales/', import.meta.url);

export function afterSeparator(markdown: string) {
	const delimiter = /^---\r?\n/m.exec(markdown);
	if (!delimiter) throw new Error('Missing Claude system prompt separator');
	return markdown.slice(delimiter.index + delimiter[0].length);
}

const prompt = (name: string) => afterSeparator(readFileSync(new URL(name, docs), 'utf8'));

/** The part of the SDK client the release script uses, so tests can stand in for it. */
export type Claude = { beta: { messages: Pick<Anthropic['beta']['messages'], 'stream'> } };

// The SDK retries rate limits, overloads and connection errors with backoff.
export const claudeClient = (apiKey: string): Claude => new Anthropic({ apiKey, maxRetries: 4 });

/** Claude answered, but not with usable notes. Only this falls back to English for a translation. */
export class InvalidReply extends Error {}

// Structured outputs accept a JSON Schema subset; the counts and uniqueness are enforced by the validators instead.
const sendable = (schema: unknown): unknown =>
	Array.isArray(schema)
		? schema.map(sendable)
		: schema && typeof schema === 'object'
			? Object.fromEntries(
					Object.entries(schema)
						.filter(([key]) => !['minItems', 'maxItems', 'uniqueItems'].includes(key))
						.map(([key, value]) => [key, sendable(value)])
				)
			: schema;

type Message = Anthropic.Beta.Messages.BetaMessageParam;

/**
 * The reply as it may be sent back: after a mid-reply model fallback, thinking from before the handoff is dropped and
 * the fallback marker kept, as the refusals and fallback guide requires.
 */
export function replayable<T extends { type: string }>(content: T[]) {
	const handoff = content.findLastIndex((block) => block.type === 'fallback');
	if (handoff < 0) return content;
	return content.filter(
		(block, index) =>
			index >= handoff || (block.type !== 'thinking' && block.type !== 'redacted_thinking')
	);
}

async function ask<T>(
	claude: Claude,
	system: string,
	schema: object,
	input: object,
	validate: (value: unknown) => string[]
): Promise<T> {
	const messages: Message[] = [{ role: 'user', content: JSON.stringify(input) }];
	for (let attempt = 0; attempt < 2; attempt++) {
		// Streamed so a large reply budget never hits the request timeout; thinking counts toward max_tokens.
		const response = await claude.beta.messages
			.stream({
				model,
				max_tokens: 64000,
				betas: ['server-side-fallback-2026-07-01'],
				fallbacks: 'default',
				output_config: {
					effort: 'medium',
					format: { type: 'json_schema', schema: sendable(schema) as Record<string, unknown> }
				},
				system,
				messages
			})
			.finalMessage();
		if (response.stop_reason === 'refusal')
			throw new InvalidReply(
				`Claude declined (${response.stop_details?.category ?? 'no category'})`
			);
		if (response.stop_reason === 'max_tokens')
			throw new InvalidReply('Claude reply hit max_tokens');
		const text = response.content
			.filter((block) => block.type === 'text')
			.map((block) => block.text)
			.join('');
		let value: unknown;
		let errors: string[];
		try {
			value = JSON.parse(text);
			errors = validate(value);
		} catch (error) {
			errors = [`Reply is not valid JSON: ${String(error)}`];
		}
		if (!errors.length) return value as T;
		if (attempt === 1)
			throw new InvalidReply(`Claude returned invalid notes: ${errors.join('; ')}`);
		// Send the whole reply back unchanged (thinking blocks included) and ask for a corrected one.
		messages.push(
			{
				role: 'assistant',
				content: replayable(response.content) as Anthropic.Beta.Messages.BetaContentBlockParam[]
			},
			{
				role: 'user',
				content: `Correct these problems and reply with the full corrected JSON:\n${errors.join('\n')}`
			}
		);
	}
	throw new Error('Claude validation attempts exhausted');
}

export async function writeNotes(
	claude: Claude,
	version: string,
	date: string,
	commits: ReleaseCommit[]
) {
	if (!commits.length) return emptyNotes;
	return ask<CitedNotes>(
		claude,
		prompt('release-notes.md'),
		releaseNotesSchema,
		{
			version,
			date,
			commits: commits.map(({ id, type, scope, subject, body }) => ({
				id,
				type,
				scope,
				subject,
				body
			}))
		},
		(reply) => validateNotes(reply, commits)
	);
}

type Catalog = { [key: string]: string | Catalog };
const readCatalog = (locale: string): Catalog =>
	JSON.parse(readFileSync(new URL(`${locale}.json`, locales), 'utf8'));

function flatten(catalog: Catalog, prefix = '', out = new Map<string, string>()) {
	for (const [key, value] of Object.entries(catalog)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'string') out.set(path, value);
		else flatten(value, path, out);
	}
	return out;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Short app labels that appear verbatim in the English notes, mapped to the target locale's label for the same key. */
export function labelsFor(text: string, english: Map<string, string>, target: Map<string, string>) {
	const labels: Record<string, string> = {};
	for (const [key, label] of english) {
		const translated = target.get(key);
		if (!translated || label.length < 3 || label.length > 40 || /[{}<]/.test(label)) continue;
		if (!/\p{Lu}/u.test(label[0])) continue;
		if (new RegExp(`(?<![\\p{L}\\p{N}])${escape(label)}(?![\\p{L}\\p{N}])`, 'u').test(text))
			labels[label] ??= translated;
	}
	return labels;
}

export async function translations(claude: Claude, english: CitedNotes) {
	// The fixed maintenance message has no Claude-written content to translate.
	if (english === emptyNotes) return { en: publicNotes(english) };
	const notes = publicNotes(english);
	const system =
		prompt('release-notes-translate.md') +
		'\n' +
		readFileSync(new URL('TRANSLATING.md', locales), 'utf8');
	const translated: Record<string, Notes> = { en: notes };
	const schema = translationSchema(notes);
	const englishLabels = flatten(readCatalog('en'));
	const text = [
		notes.headline,
		notes.intro,
		...notes.highlights.flatMap((highlight) => [highlight.title, highlight.text]),
		...notes.fixes.map((fix) => fix.text)
	].join('\n');
	for (const file of readdirSync(locales)
		.filter((file) => file.endsWith('.json') && file !== 'en.json')
		.sort()) {
		const locale = file.slice(0, -5);
		const labels = labelsFor(text, englishLabels, flatten(readCatalog(locale)));
		try {
			const result = await ask<Notes>(claude, system, schema, { locale, labels, notes }, (reply) =>
				validateTranslation(reply, notes)
			);
			translated[locale] = {
				headline: result.headline,
				intro: result.intro,
				highlights: result.highlights,
				fixes: result.fixes
			};
		} catch (error) {
			// Network, rate-limit and server errors fail the run so the next run retries every locale.
			if (!(error instanceof InvalidReply)) throw error;
			// Documented fallback (docs/releasing.md): this locale shows the English notes for this release.
			console.warn(`Translation for ${locale} fell back to English. ${String(error)}`);
		}
	}
	return translated;
}
