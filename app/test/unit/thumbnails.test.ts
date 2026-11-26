import { expect, test, vi } from 'vitest';
import {
	croppedThumbnail,
	characterStill,
	keepThumbnails,
	newest,
	stills
} from '../../src/studio/experience/thumbnails.svelte.ts';
import { castStill, mountedStill } from '../../src/studio/experience/castMount.ts';
import { experience } from '../../src/studio/experience/state.svelte.ts';

// The experience module is a Svelte rune module; plain state is enough for this logic.
vi.hoisted(() => Object.assign(globalThis, { $state: <T>(value: T) => value }));
import { makeImg } from '../../src/lib/image/png.ts';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { crop } from '../../src/studio/model.ts';
import {
	buildPresentation,
	renderPresentation,
	southStill
} from '../../src/studio/experience/presentation.ts';

test('selected thumbnails share composition and cropping until their outfit or artwork changes', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL('../../public/fixtures/s2/' + path, import.meta.url)))
	);
	const items = project.manifest.presets[0].items;
	const first = characterStill(project, items, 1);
	const crop = croppedThumbnail(first.image!);
	expect(characterStill(project, { ...items }, 1)).toBe(first);
	expect(croppedThumbnail(characterStill(project, items, 1).image!)).toBe(crop);
	expect(first.facts.frame).toBe('64×64 px');
	expect(first.facts.counts).toEqual([
		{ key: 'export.count.directions', vars: { count: 4 } },
		{ key: 'export.count.moves', vars: { count: 2 } },
		{ key: 'export.count.items', vars: { count: 6 } }
	]);
	expect(first.bodySize).not.toBeNull();
	const unequipped = Object.fromEntries(Object.keys(items).map((slot) => [slot, null]));
	const changed = characterStill(project, unequipped, 1);
	expect(changed).not.toBe(first);
	expect(changed.image?.data).not.toEqual(first.image?.data);
	expect(changed.bodySize).toEqual(first.bodySize);
	expect(characterStill(project, unequipped, 1)).toBe(changed);
	const revised = characterStill(project, unequipped, 2);
	expect(revised).not.toBe(changed);
	expect(characterStill(project, unequipped, 2)).toBe(revised);
	const replaced = { ...project };
	expect(characterStill(replaced, unequipped, 2)).not.toBe(revised);
});

test('character list crops are shared per still image and preserve all visible pixels', () => {
	const image = makeImg(80, 64);
	image.data.set([30, 60, 90, 1], (7 * 80 + 6) * 4);
	image.data.set([90, 60, 30, 255], (51 * 80 + 69) * 4);
	const cropped = croppedThumbnail(image)!;
	expect([cropped.w, cropped.h]).toEqual([64, 45]);
	expect([...cropped.data.slice(0, 4)]).toEqual([30, 60, 90, 1]);
	expect([...cropped.data.slice(-4)]).toEqual([90, 60, 30, 255]);
	expect(croppedThumbnail(image)).toBe(cropped);
	expect(croppedThumbnail(cropped)).toBe(cropped);
	expect([image.w, image.h]).toEqual([80, 64]);
	const replacement = makeImg(80, 64);
	replacement.data.set([1, 2, 3, 255], (20 * 80 + 10) * 4);
	expect(croppedThumbnail(replacement)).not.toBe(cropped);
	expect(croppedThumbnail(replacement)?.w).toBe(1);
	const empty = makeImg(64, 64);
	expect(croppedThumbnail(empty)).toBeNull();
	expect(croppedThumbnail(empty)).toBeNull();
});

test('a complete listing drops the thumbnails of characters no longer listed', () => {
	const frame = { x: 0, y: 0, w: 64, h: 64 };
	const still = {
		look: '',
		image: null,
		frame,
		body: frame,
		bodySize: null,
		facts: { frame: '', counts: [] }
	};
	stills.set('rig-kept', still);
	stills.set('rig-deleted', still);
	newest.set('rig-deleted', { look: '', reading: true }); // a read still running for it
	keepThumbnails(new Set(['fixture:s2', 'rig-kept']));
	expect([...stills.keys()]).toEqual(['rig-kept']);
	expect(newest.has('rig-deleted')).toBe(false);
});

test('static outfit trimming preserves the full padded weapon silhouette and faint edge pixels', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL('../../public/fixtures/s2/' + path, import.meta.url)))
	);
	const weapon = project.manifest.items.find((item) => item.id === 'sword_steel')!;
	const image = makeImg(160, 96);
	image.data.set([220, 30, 50, 1], (5 * 160 + 2) * 4);
	image.data.set([50, 30, 220, 255], (90 * 160 + 157) * 4);
	const hash = `sha256:${'f'.repeat(64)}` as const;
	project.images.set(hash, image);
	weapon.layers = [
		{
			id: 'fg',
			role: 'fg',
			z: 200,
			cell: { w: 160, h: 96 },
			pivot: { x: 80, y: 80 },
			cells: Object.fromEntries(
				project.manifest.rig.animations.map((clip) => [clip.id, { south: [hash] }])
			)
		}
	];
	const assets = buildPresentation(project);
	const still = renderPresentation(assets, { main_hand: weapon.id }, southStill(assets));
	const trimmed = crop(still.image!)!;
	expect([still.image!.w, still.image!.h]).toEqual([160, 96]);
	expect([trimmed.w, trimmed.h]).toEqual([156, 86]);
	expect([...trimmed.data.slice(0, 4)]).toEqual([220, 30, 50, 1]);
	expect([...trimmed.data.slice(-4)]).toEqual([50, 30, 220, 255]);
	const visible = (pixels: Uint8ClampedArray) =>
		pixels.filter((value, index) => index % 4 === 3 && value > 0).length;
	expect(visible(trimmed.data)).toBe(visible(still.image!.data));
});

test('the selection cast rides the mount on its feet, at the standing size, only while the mount shows', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL('../../public/fixtures/s2/' + path, import.meta.url)))
	);
	const items = project.manifest.presets[0].items;
	const plain = characterStill(project, items);
	const groundRow = (still: typeof plain) => still.frame.y + still.body.h - still.body.y;
	try {
		experience.testMount = true;
		experience.mountLegs = 'none';
		const mounted = mountedStill('cast-test', project, items)!;
		expect(mountedStill('cast-test', project, items)).toBe(mounted);
		// The same standing body keeps every character's cast size; the mount's feet are the image bottom.
		expect(mounted.body).toEqual(plain.body);
		expect(groundRow(mounted)).toBe(mounted.image!.h);
		// The rider sits above the ground, so it is drawn higher than when standing.
		const top = (image: NonNullable<typeof plain.image>) => {
			for (let i = 3; i < image.data.length; i += 4)
				if (image.data[i]) return Math.floor(i / 4 / image.w);
			return image.h;
		};
		expect(groundRow(mounted) - top(mounted.image!)).toBeGreaterThan(
			groundRow(plain) - top(plain.image!)
		);
		stills.set('cast-test', { ...plain, look: '', mount: { key: '', still: mounted } });
		expect(castStill('cast-test')).toBe(stills.get('cast-test')); // drawn with other settings
		stills.set('cast-test', {
			...plain,
			look: '',
			// Legs, Riding pose and the Live views Idle the rider falls back to.
			mount: { key: JSON.stringify(['none', '', '']), still: mounted }
		});
		expect(castStill('cast-test')).toBe(mounted);
		experience.mountLegs = 'both';
		expect(castStill('cast-test')).toBe(stills.get('cast-test'));
		expect(mountedStill('cast-test', project, items)).not.toBe(mounted);
		experience.testMount = false;
		expect(castStill('cast-test')).toBe(stills.get('cast-test'));
	} finally {
		stills.delete('cast-test');
		experience.testMount = false;
		experience.mountLegs = 'far';
	}
});

test('the selection cast keeps both legs visible when its saved seat clears the mount', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL('../../public/fixtures/s2/' + path, import.meta.url)))
	);
	const { rig } = project.manifest;
	const walk = rig.animations.find(({ id }) => id === 'walk')!;
	const points = ['LEFT', 'RIGHT'].flatMap((side, index) =>
		['HIP', 'KNEE', 'LEG', 'ELBOW', 'ARM'].map((joint, row) => ({
			label: `${side} ${joint}`,
			x: row < 3 ? 0.4 + index * 0.2 : 0.2 + index * 0.6,
			y: [0.55, 0.7, 0.85, 0.35, 0.5][row]
		}))
	);
	walk.sources = {
		south: {
			route: 'import',
			reference: rig.baseHash,
			measured: Array.from({ length: walk.cells }, () => points),
			provenance: []
		}
	};
	const id = 'cast-raised-seat';
	try {
		experience.testMount = true;
		experience.ridingPoses[id] = walk.id;
		const compare = (revision: number) => {
			experience.mountLegs = 'none';
			const visible = mountedStill(id, project, {}, revision)!.image;
			experience.mountLegs = 'both';
			const obscured = mountedStill(id, project, {}, revision)!.image;
			return { visible, obscured };
		};
		const automatic = compare(0);
		expect(automatic.obscured).not.toEqual(automatic.visible);
		rig.mountSeatOffsets = { south: { x: -32, y: -32 } };
		const cleared = compare(1);
		expect(cleared.obscured).toEqual(cleared.visible);
	} finally {
		delete experience.ridingPoses[id];
		experience.testMount = false;
		experience.mountLegs = 'far';
	}
});
