import type { Changes } from './changes.ts';
import type { Notes } from './notes.ts';

const kindLabels = { new: 'New', improved: 'Improved', fixed: 'Fixed' };
const escape = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replace(/[\\`*_{}\[\]#|~]/g, '\\$&');

// GitHub caps a release body at 125,000 characters.
const LIMIT = 125_000;

export function releaseMarkdown(
	version: string,
	date: string,
	notes: Notes,
	changes: Changes,
	repository: string,
	bannerUrl: string,
	compareUrl: string
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
	const head = parts.join('\n\n');

	const render = (limit: number) => {
		let left = limit;
		const groups = changes.groups.flatMap(({ kind, items }) => {
			const shown = items.slice(0, Math.max(0, left));
			left -= shown.length;
			if (!shown.length) return [];
			const lines = shown.map(
				({ sha, text }) => `- [${escape(text)}](https://github.com/${repository}/commit/${sha})`
			);
			return [[`### ${kindLabels[kind]}`, '', ...lines].join('\n')];
		});
		if (limit < changes.total) groups.push(`[See all ${changes.total} changes](${compareUrl})`);
		const all = [
			`<details><summary>All changes (${changes.total})</summary>`,
			...groups,
			'</details>'
		].join('\n\n');
		return `${head}\n\n${all}\n`;
	};

	// A very long list is shortened and links to the full comparison, so a release can always publish.
	let limit = changes.total;
	let body = render(limit);
	while (body.length >= LIMIT && limit > 0) {
		limit = Math.floor(limit * 0.9);
		body = render(limit);
	}
	if (body.length >= LIMIT)
		throw new Error(`GitHub release body exceeds the size limit (${body.length} characters)`);
	return body;
}
