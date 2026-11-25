import { expect, test } from 'vitest';
import { searchFieldVisible } from '../../src/lib/search/visibility.ts';

test('a query keeps its field, whatever the list holds', () => {
	expect(searchFieldVisible({ query: 'x', overflowing: false, total: 0 })).toBe(true);
	expect(searchFieldVisible({ query: 'x', overflowing: false, total: 0, canSearch: false })).toBe(
		true
	);
});

test('six rows or overflow earns the field', () => {
	expect(searchFieldVisible({ query: '', overflowing: false, total: 6 })).toBe(true);
	expect(searchFieldVisible({ query: '', overflowing: true, total: 0 })).toBe(true);
	expect(searchFieldVisible({ query: '', overflowing: false, total: 5 })).toBe(false);
});

test('a list with nothing to search never shows it, even when it scrolls', () => {
	expect(searchFieldVisible({ query: '', overflowing: true, total: 0, canSearch: false })).toBe(
		false
	);
	expect(searchFieldVisible({ query: '', overflowing: false, total: 9, canSearch: false })).toBe(
		false
	);
	expect(searchFieldVisible({ query: '', overflowing: true, total: 2, canSearch: true })).toBe(
		true
	);
});

test('minItems is configurable', () => {
	expect(searchFieldVisible({ query: '', overflowing: false, total: 8, minItems: 10 })).toBe(false);
	expect(searchFieldVisible({ query: '', overflowing: false, total: 10, minItems: 10 })).toBe(true);
});
