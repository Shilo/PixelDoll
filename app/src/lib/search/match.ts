// Fuzzy matching for the Studio's short, hand-written lists. Every query word must match some field, in any order;
// callers keep their own list order, because Wardrobe sections and Moves rows carry meaning beyond relevance.
// A match is a word prefix, a substring, a close typo of a word's opening, or an in-order subsequence.

const DIACRITICS = /\p{M}+/gu;
const SEPARATORS = /[^\p{L}\p{N}]+/gu;
const WORD_BREAK = /\s+/;

/** Case, accent and spacing folding shared by the query and every searched field. */
export function normalizeSearchText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(DIACRITICS, '')
		.toLocaleLowerCase()
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

/** Optimal string alignment distance, stopping as soon as it must exceed `limit`. */
function editDistance(a: string, b: string, limit: number): number {
	if (Math.abs(a.length - b.length) > limit) return limit + 1;
	let twoBack: number[] | undefined;
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let value = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + cost);
			// A swapped pair ("tiitle") is one typo, not two.
			if (twoBack && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
				value = Math.min(value, twoBack[j - 2]! + 1);
			row.push(value);
		}
		if (Math.min(...row) > limit) return limit + 1;
		twoBack = previous;
		previous = row;
	}
	return previous[b.length]!;
}

function subsequenceOf(word: string, token: string): boolean {
	let at = 0;
	for (const character of token) {
		const found = word.indexOf(character, at);
		if (found < 0) return false;
		at = found + 1;
	}
	return true;
}

function tokenScore(field: string, token: string): number {
	let best = 0;
	for (const word of field.split(SEPARATORS)) {
		if (!word) continue;
		if (word === token) return 130;
		if (word.startsWith(token))
			best = Math.max(best, 110 - Math.min(20, word.length - token.length));
		else if (word.includes(token))
			best = Math.max(best, 90 - Math.min(20, word.length - token.length));
		else if (token.length >= 4) {
			// Search-as-you-type typos: compare the typed word with the opening of this word.
			for (let extra = -1; extra <= 1; extra++) {
				const width = token.length + extra;
				if (width < 1) continue;
				const opening = word.slice(0, width);
				if (editDistance(token, opening, 1) <= 1) {
					best = Math.max(best, 70);
					break;
				}
			}
		}
		if (token.length >= 3 && word.startsWith(token[0]!) && subsequenceOf(word, token))
			best = Math.max(best, 45);
	}
	return best;
}

/**
 * 0 when any query word has no match; larger is better. An empty query matches every row.
 * Matching is combined across fields, so "red shirt" can match a name and its category.
 */
export function searchScore(
	fields: ReadonlyArray<string | null | undefined>,
	query: string
): number {
	const tokens = normalizeSearchText(query)
		.replace(SEPARATORS, ' ')
		.split(WORD_BREAK)
		.filter(Boolean);
	if (!tokens.length) return 1;
	const normalized = fields.filter((field): field is string => !!field).map(normalizeSearchText);
	let total = 0;
	for (const token of tokens) {
		let best = 0;
		for (const field of normalized) {
			best = Math.max(best, tokenScore(field, token));
			if (best >= 130) break;
		}
		if (!best) return 0;
		total += best;
	}
	return total;
}

export function matchesSearch(
	fields: ReadonlyArray<string | null | undefined>,
	query: string
): boolean {
	return searchScore(fields, query) > 0;
}
