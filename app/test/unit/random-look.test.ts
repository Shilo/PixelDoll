import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomVariants, SWATCHES } from '../../src/lib/dress/dress.ts';
import { characterFacts } from '../../src/studio/model.ts';
import type { Manifest, Material } from '../../src/lib/store/manifest.ts';

const fixture = (): Manifest =>
	JSON.parse(
		readFileSync(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8')
	);
const material = (id: string, extra: Partial<Material> = {}) =>
	({ id, owner: 'cape_red', ramp: ['#1f3a8a', '#3b5bdb', '#91a7ff'], ...extra }) as Material;

describe('randomVariants', () => {
	test('never lands on the swatch a material already wears, whatever the random draw', () => {
		const m = fixture(),
			swatches = Object.keys(SWATCHES);
		for (const current of swatches)
			for (let i = 0; i < swatches.length; i++) {
				const draw = i / swatches.length;
				const variants = randomVariants(m, [material('cape')], () => draw, 1, { cape: current });
				expect(variants.cape).toBeDefined();
				expect(variants.cape).not.toBe(current);
			}
	});

	test('linked materials follow their source and are never picked', () => {
		const variants = randomVariants(fixture(), [material('trim', { linkTo: 'cape' })], () => 0);
		expect(variants).toEqual({});
	});
});

describe('characterFacts', () => {
	test('counts the character’s size, directions, moves and items with singular and plural words', () => {
		const m = fixture();
		expect(characterFacts(m)).toBe('64 px · 4 directions · 2 moves · 6 items');
		m.rig.directions = m.rig.directions.slice(0, 1);
		m.rig.animations = m.rig.animations.slice(0, 1);
		m.items = m.items.filter((i) => i.id === m.rig.baseItem || i.id === 'cape_red');
		expect(characterFacts(m)).toBe('64 px · 1 direction · 1 move · 1 item');
		m.items = m.items.filter((i) => i.id === m.rig.baseItem);
		expect(characterFacts(m)).toBe('64 px · 1 direction · 1 move · 0 items');
	});
});
