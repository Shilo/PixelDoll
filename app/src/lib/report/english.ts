import en from '../../locales/en.json';
import type { Message } from '../message.ts';

type Catalog = { [key: string]: string | Catalog };
// Plain dots: the sanitizer normalizes an ellipsis character to them anyway (NFKC).
const HIDDEN = '...';
/** Variables that hold a measured size such as 32×32. Only these show it: elsewhere the same text could be a name. */
const SIZE_VARS: Record<string, readonly string[]> = { 'fixFrames.errors.size': ['got', 'want'] };
const SIZE = /^\d{1,5}×\d{1,5}$/;

const isMessage = (value: unknown): value is Message =>
	!!value && typeof value === 'object' && typeof (value as Message).key === 'string';

/** A message's English template for a public report. Numbers, sizes and nested messages fill in; every other variable becomes
 *  "...", because variables carry names, prompts, errors from other systems and other user data. */
export function englishMessage(value: Message, depth = 0): string | undefined {
	let entry: string | Catalog | undefined = en as unknown as Catalog;
	for (const part of value.key.split('.'))
		entry = typeof entry === 'object' ? entry[part] : undefined;
	const vars = (value.vars && !Array.isArray(value.vars) ? value.vars : {}) as Record<
		string,
		unknown
	>;
	if (entry && typeof entry === 'object') {
		const n = vars.count ?? vars.n;
		entry = n === 1 && typeof entry.one === 'string' ? entry.one : entry.other;
	}
	if (typeof entry !== 'string') return undefined;
	return entry.replace(/\{(\w+)\}/g, (_, name: string) => {
		const variable = vars[name];
		if (typeof variable === 'number' && Number.isFinite(variable)) return String(variable);
		if (typeof variable === 'string' && SIZE_VARS[value.key]?.includes(name) && SIZE.test(variable))
			return variable;
		if (isMessage(variable) && depth < 3) return englishMessage(variable, depth + 1) ?? HIDDEN;
		return HIDDEN;
	});
}
