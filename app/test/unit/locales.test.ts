import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const forms = {
	en: ['one', 'other'],
	es: ['one', 'other'],
	'zh-Hans': ['other'],
	'pt-BR': ['one', 'other'],
	ja: ['other'],
	de: ['one', 'other'],
	fr: ['one', 'other'],
	ko: ['other'],
	tr: ['one', 'other'],
	id: ['other']
};

type Catalog = { [key: string]: string | Catalog };
const readCatalog = (id: string): Catalog =>
	JSON.parse(readFileSync(new URL(`../../src/locales/${id}.json`, import.meta.url), 'utf8'));
const placeholders = (text: string) => new Set(text.match(/\{[^{}]+\}/g) ?? []);
const pluralsWithoutDisplayedCount = new Set([
	'export.warnings.rpgWalkViews',
	'export.warnings.rpgOmittedMoves',
	'export.error.rpgMissingViews',
	'itemPane.restoreStanding',
	'itemPane.restoreStandingHint',
	// Name the views themselves ("Idle West was kept…", "West did not finish…"), like the RPG Maker view warnings.
	'moveReview.unposedViews',
	'moveReview.saveFinishedDetail'
]);

function verifyPlurals(source: Catalog, target: Catalog, categories: string[], path = '') {
	for (const [key, value] of Object.entries(source)) {
		if (typeof value === 'string') continue;
		const fullKey = `${path}${key}`;
		const translation = target[key];
		if (!translation || typeof translation === 'string') throw new Error(`${fullKey} is missing`);
		if (typeof value.other !== 'string') {
			verifyPlurals(value, translation, categories, `${fullKey}.`);
			continue;
		}
		const categoryKeys = Object.keys(translation).filter((category) => !/^\d+$/.test(category));
		expect(categoryKeys.toSorted(), fullKey).toEqual(categories.toSorted());
		for (const category of Object.keys(value).filter((name) => /^\d+$/.test(name)))
			expect(translation[category], `${fullKey}.${category}`).toBeTypeOf('string');
		for (const [category, text] of Object.entries(translation)) {
			if (typeof text !== 'string') throw new Error(`${fullKey}.${category} is not text`);
			const equivalent =
				value[category] ??
				(category === '0' || categoryKeys.includes(category) ? value.other : undefined);
			if (typeof equivalent !== 'string')
				throw new Error(`${fullKey}.${category} has no source form`);
			expect(placeholders(text), `${fullKey}.${category}`).toEqual(placeholders(equivalent));
			if (categoryKeys.includes(category) && !pluralsWithoutDisplayedCount.has(fullKey))
				expect(text, `${fullKey}.${category}`).toMatch(/\{(?:count|n)\}/);
		}
	}
}

test.each(Object.entries(forms))('%s has its required plural forms', (id, categories) => {
	verifyPlurals(readCatalog('en'), readCatalog(id), categories);
});
