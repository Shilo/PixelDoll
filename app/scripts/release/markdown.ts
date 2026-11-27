import type { Changes } from './changes.ts';
import type { Notes } from './notes.ts';

const kindLabels = { new: 'New', improved: 'Improved', fixed: 'Fixed' };
const escape = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replace(/[\\`*_{}\[\]#|~]/g, '\\$&');

export function releaseMarkdown(
	version: string,
	date: string,
	notes: Notes,
	changes: Changes,
	repository: string,
	bannerUrl: string
) {
	const parts = [
		`# ${escape(notes.headline)}`,
		`${date} · v${version}`,
		`![](${bannerUrl})`,
		escape(notes.intro)
	];
	if (notes.joke) parts.push(escape(notes.joke));
	for (const { title, text } of notes.highlights)
		parts.push(`## ${escape(title)}\n\n${escape(text)}`);
	if (notes.fixes.length)
		parts.push(['## Fixed', '', ...notes.fixes.map(({ text }) => `- ${escape(text)}`)].join('\n'));
	const groups = changes.groups.map(({ kind, items }) =>
		[
			`### ${kindLabels[kind]}`,
			'',
			...items.map(
				({ sha, text }) => `- [${escape(text)}](https://github.com/${repository}/commit/${sha})`
			)
		].join('\n')
	);
	parts.push(
		[`<details><summary>All changes (${changes.total})</summary>`, ...groups, '</details>'].join(
			'\n\n'
		)
	);
	const body = parts.join('\n\n') + '\n';
	if (body.length >= 125_000)
		throw new Error(`GitHub release body exceeds the size limit (${body.length} characters)`);
	return body;
}
