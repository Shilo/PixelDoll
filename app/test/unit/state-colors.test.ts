import { expect, test } from 'vitest';
import { stateColorDrift, stateColorMatcher } from '../../src/lib/dress/stateColors.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import type { Project } from '../../src/lib/store/manifest.ts';

const fill = (rgb: number[]) => {
	const im = makeImg(4, 1);
	for (let i = 0; i < 4; i++) im.data.set([...rgb, 255], i * 4);
	return im;
};
const project = (pose: Img, baseHash = 'sha256:a', ramp: string[] = []): Project =>
	({
		manifest: {
			materials: [{ id: 'base_1', owner: 'base', ramp, variants: {} }],
			rig: {
				baseItem: 'base',
				baseHash,
				animations: [
					{ id: 'default', cells: 1 },
					{ id: 'pose', kind: 'state', cells: 1 }
				]
			},
			items: [
				{
					id: 'base',
					layers: [
						{ id: 'main', cells: { default: { south: ['h:rest'] }, pose: { south: ['h:pose'] } } }
					]
				}
			]
		},
		images: new Map([
			['h:rest', fill([249, 193, 173])],
			['h:pose', pose]
		])
	}) as unknown as Project;

test('a State drawn in its own skin shades drifts, and matching puts it on the body colors', () => {
	const p = project(fill([240, 182, 160]));
	expect(stateColorDrift(p, 'pose')).toBe(true);
	expect([...stateColorMatcher(p)!(p.images.get('h:pose')!).data.slice(0, 4)]).toEqual([
		249, 193, 173, 255
	]);
	expect(stateColorDrift(p, 'default')).toBe(false);
});

test('a State already on the body colors, or holding only new detail, does not drift', () => {
	expect(stateColorDrift(project(fill([249, 193, 173]), 'sha256:b'), 'pose')).toBe(false);
	expect(stateColorDrift(project(fill([230, 190, 40]), 'sha256:c'), 'pose')).toBe(false);
});

test('a State shade the body already recolors (in its ramps) does not drift', () => {
	expect(stateColorDrift(project(fill([240, 182, 160]), 'sha256:d', ['#f0b6a0']), 'pose')).toBe(
		false
	);
});
