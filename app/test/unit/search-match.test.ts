import { expect, test } from 'vitest';
import { matchesSearch, normalizeSearchText, searchScore } from '../../src/lib/search/match.ts';

const matches = (query: string, ...fields: (string | null | undefined)[]) =>
	searchScore(fields, query) > 0;

test('an empty query keeps every row and is case and accent insensitive', () => {
	expect(matchesSearch(['Anything'], '')).toBe(true);
	expect(matches('  ')).toBe(true);
	expect(normalizeSearchText('  Café   Noir ')).toBe('cafe noir');
	expect(matches('cafe', 'Café Noir')).toBe(true);
});

test('word prefixes and substrings match before fuzzy fallbacks', () => {
	expect(matches('shi', 'Shirt')).toBe(true);
	expect(matches('irt', 'Shirt')).toBe(true);
	expect(matches('boot', 'Leather Boots')).toBe(true);
	expect(matches('sock', 'Leather Boots')).toBe(false);
});

test('every query word must match, across different fields', () => {
	expect(matches('red shirt', 'Red Tunic', 'Shirt')).toBe(true);
	expect(matches('red boots', 'Red Tunic', 'Shirt')).toBe(false);
	expect(matches('shirt red', 'Red Tunic', 'Shirt')).toBe(true);
});

test('one typo is tolerated for words of four or more characters', () => {
	expect(matches('shiirt', 'Shirt')).toBe(true);
	expect(matches('botos', 'Boots')).toBe(true);
	expect(matches('shi', 'Shirt')).toBe(true);
});

test('an in-order subsequence matches from the word start, but a reordered one does not', () => {
	expect(matches('sht', 'Shirt')).toBe(true);
	expect(matches('sriht', 'Shirt')).toBe(false);
	expect(matches('hit', 'Shirt')).toBe(false);
});

test('scores prefer an exact word over a prefix, and a prefix over a subsequence', () => {
	const exact = searchScore(['Shirt'], 'shirt');
	const prefix = searchScore(['Shirt'], 'shi');
	const subsequence = searchScore(['Shirt'], 'sht');
	expect(exact).toBeGreaterThan(prefix);
	expect(prefix).toBeGreaterThan(subsequence);
	expect(subsequence).toBeGreaterThan(0);
});

test('punctuation separates query words like it separates names', () => {
	expect(matches('steel-helmet', 'Steel helmet')).toBe(true);
	expect(matches('hat,', 'Wizard hat')).toBe(true);
	expect(matches('vest.', 'Leather vest')).toBe(true);
});

test('blank fields are ignored', () => {
	expect(matches('shirt', '', 'Shirt', null, undefined)).toBe(true);
	expect(matches('shirt', '', null)).toBe(false);
});
