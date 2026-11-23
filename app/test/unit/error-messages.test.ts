import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import en from '../../src/locales/en.json';

type Catalog = { [key: string]: string | Catalog };
const src = fileURLToPath(new URL('../../src/', import.meta.url));

/** Every user-facing failure string: catalog keys under an `errors`/`error` group, ending in `error`, or a problem summary. */
function failureStrings(catalog: Catalog, path = ''): [string, string][] {
	return Object.entries(catalog).flatMap(([key, value]) => {
		const at = path + key;
		if (typeof value !== 'string') return failureStrings(value, `${at}.`);
		return /(^|\.)errors?\.|[Ee]rror$|^problem\./.test(at) ? [[at, value]] : [];
	});
}

// Internal words users cannot act on: request or record labels, hashes, endpoints, model routes, gate codes, raw values.
const JARGON =
	/\{(label|hash|recordId|requestHash|endpoint)\}|\bkeypoints?\b|requestHash|recordId|sha256|estimate-skeleton|skeleton-v3|animate-with|inpaint-v3|edit-animation|edit-images|\bG\d{1,2}\b|\bH4\b|\bundefined\b|\bnull\b|\bNaN\b|\/[a-z-]+-v\d|\bstack\b|\bpayload\b|\bAPI\b/i;
/** Reviewed exceptions: Activity is the request ledger, where the stored input and the API request are the subject. */
const ALLOWED = new Set(['activity.error.missingInput', 'activity.error.stoppedBeforeSend']);

test('user-facing failure strings use plain words, never internal labels or jargon', () => {
	const offenders = failureStrings(en as unknown as Catalog)
		.filter(([key, text]) => !ALLOWED.has(key) && JARGON.test(text))
		.map(([key, text]) => `${key}: ${text}`);
	expect(offenders).toEqual([]);
	// The allow-list stays honest: each entry still needs its exception.
	for (const key of ALLOWED)
		expect(
			failureStrings(en as unknown as Catalog).some(
				([at, text]) => at === key && JARGON.test(text)
			),
			key
		).toBe(true);
});

/** Plain `throw new Error(` reaches users as untranslated English. New failures use LocalizedError; this count only falls.
 *  Lower it when a change removes some. Developer pages (src/ui/) and the generated runtime transport are not counted. */
const PLAIN_ERROR_LIMIT = 270;

function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === 'ui' && dir === src ? [] : sources(path);
		return /\.(ts|js|svelte)$/.test(entry.name) && entry.name !== 'sources.ts' ? [path] : [];
	});
}

test('plain English errors do not grow', () => {
	const count = sources(src).reduce(
		(sum, file) => sum + (readFileSync(file, 'utf8').match(/throw new Error\(/g)?.length ?? 0),
		0
	);
	expect(count, 'Throw a LocalizedError instead of a plain Error').toBeLessThanOrEqual(
		PLAIN_ERROR_LIMIT
	);
});
