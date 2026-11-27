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

export const model = 'claude-sonnet-5-5';
const docs = new URL('../../../docs/', import.meta.url);
const locales = new URL('../../src/locales/', import.meta.url);

export function afterSeparator(markdown: string) {
	const delimiter = /^---\r?\n/m.exec(markdown);
	if (!delimiter) throw new Error('Missing Claude system prompt separator');
	return markdown.slice(delimiter.index + delimiter[0].length);
}

const prompt = (name: string) => afterSeparator(readFileSync(new URL(name, docs), 'utf8'));

type Tool = { name: string; input_schema: object };
type ClaudeResponse = { content: { type: string; name?: string; input?: unknown }[] };

async function callTool<T>(
	key: string,
	system: string,
	tool: Tool,
	input: object,
	validate: (value: unknown) => string[]
): Promise<T> {
	const messages: { role: 'user' | 'assistant'; content: string | ClaudeResponse['content'] }[] = [
		{ role: 'user', content: JSON.stringify(input) }
	];
	for (let attempt = 0; attempt < 2; attempt++) {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'x-api-key': key,
				'anthropic-version': '2023-06-01',
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				model,
				max_tokens: 8192,
				temperature: 0,
				system,
				tools: [tool],
				tool_choice: { type: 'tool', name: tool.name, disable_parallel_tool_use: true },
				messages
			}),
			signal: AbortSignal.timeout(120_000)
		});
		if (!response.ok)
			throw new Error(`Claude ${tool.name}: HTTP ${response.status} ${await response.text()}`);
		const { content } = (await response.json()) as ClaudeResponse;
		const calls = content?.filter((block) => block.type === 'tool_use') ?? [];
		const matches = calls.length === 1 && calls[0].name === tool.name;
		const errors = matches
			? validate(calls[0].input)
			: [`Call only the ${tool.name} tool, exactly once`];
		if (!errors.length) return calls[0].input as T;
		const feedback = `Correct these validation errors and submit the tool call again:\n${errors.join('\n')}`;
		if (attempt === 1)
			throw new Error(`Claude ${tool.name} returned invalid data: ${errors.join('; ')}`);
		// Resubmit the original request with feedback. Replaying a tool_use would require a paired tool_result.
		messages.push({ role: 'user', content: feedback });
	}
	throw new Error('Claude validation attempts exhausted');
}

export async function writeNotes(
	key: string,
	version: string,
	date: string,
	commits: ReleaseCommit[]
) {
	if (!commits.length) return emptyNotes;
	return callTool<CitedNotes>(
		key,
		prompt('release-notes.md'),
		{ name: 'release_notes', input_schema: releaseNotesSchema },
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

export async function translations(key: string, english: CitedNotes) {
	const { joke, ...notes } = publicNotes(english);
	const system =
		prompt('release-notes-translate.md') +
		'\n' +
		readFileSync(new URL('TRANSLATING.md', locales), 'utf8');
	const translated: Record<string, Notes> = { en: { ...notes, joke } };
	const tool = { name: 'translation', input_schema: translationSchema(notes) };
	for (const file of readdirSync(locales)
		.filter((file) => file.endsWith('.json') && file !== 'en.json')
		.sort()) {
		const locale = file.slice(0, -5);
		try {
			const result = await callTool<Omit<Notes, 'joke'>>(
				key,
				system,
				tool,
				{ locale, notes },
				(reply) => validateTranslation(reply, notes)
			);
			translated[locale] = {
				headline: result.headline,
				intro: result.intro,
				joke: '',
				highlights: result.highlights,
				fixes: result.fixes
			};
		} catch (error) {
			console.warn(`Translation for ${locale} fell back to English. ${String(error)}`);
		}
	}
	return translated;
}
