import {
	openStudio,
	reloadStudio,
	equipmentGroup,
	newItem,
	selectedItemDetails,
	section
} from './immersive-helpers.ts';
import { test, expect, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await context.route('https://*.pixellab.ai/**', (route) => route.abort()); // stay offline by default; a test's own route overrides this
});

/** An editable copy of the demo, plus three more saved characters made from it: "Twin" (the same body) with a traveling
 *  wizard hat, "Stout" (a different body on the same canvas: its pivot moved) with a stout helmet, and "Giant" (no move in
 *  common: every move renamed, so its helmet can only show its standing pose) with a giant helmet. Then reopens the copy and
 *  returns its Head grid, where the other characters' items are the `.shared-tile`s after its own (each has a ⋮ beside it). */
async function threeCharacters(page: Page) {
	await openStudio(page, '/');
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.evaluate(async () => {
		const request = indexedDB.open('pixeldoll', 1);
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const store = database.transaction('projects', 'readwrite').objectStore('projects');
		const all = await new Promise<
			{
				id: string;
				manifest?: { name: string; rig: { pivot: { x: number }; view?: string }; items: any[] };
			}[]
		>((resolve, reject) => {
			const read = store.getAll();
			read.onsuccess = () => resolve(read.result);
			read.onerror = () => reject(read.error);
		});
		const copy = all.find((r) => r.manifest?.name === 'Adventurer copy')!;
		const clone = (id: string, name: string, itemId: string, label: string, prompt: string) => {
			const rec = structuredClone(copy);
			rec.id = id;
			rec.manifest!.name = name;
			Object.assign(
				rec.manifest!.items.find((it) => it.id === itemId),
				{ name: label, prompt }
			);
			return rec;
		};
		const giant = clone('rig-giant', 'Giant', 'helmet_steel', 'Giant helmet', 'a giant helmet');
		giant.manifest!.rig.pivot.x += 1;
		const renamed = (key: string) => `giant-${key}`;
		for (const move of (giant.manifest as any).rig.animations) move.id = renamed(move.id);
		for (const item of giant.manifest!.items) {
			for (const layer of item.layers)
				layer.cells = Object.fromEntries(
					Object.entries(layer.cells ?? {}).map(([move, cells]) => [renamed(move), cells])
				);
			item.coverage = item.coverage?.map((key: string) => renamed(key));
			delete item.baseCut;
		}
		const stout = clone('rig-stout', 'Stout', 'helmet_steel', 'Stout helmet', 'a stout helmet');
		stout.manifest!.rig.pivot.x += 1;
		for (const rec of [
			clone('rig-twin', 'Twin', 'hat_wizard', 'Traveling wizard hat', 'a traveling wizard hat'),
			stout,
			giant
		])
			store.put(rec, rec.id);
		await new Promise<void>((resolve, reject) => {
			store.transaction.oncomplete = () => resolve();
			store.transaction.onerror = store.transaction.onabort = () => reject(store.transaction.error);
		});
		database.close();
	});
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	await equipmentGroup(page, 'Head');
	return page.locator('.equipment-scroll [role=group][aria-label="Head items"]');
}
/** A character's own tiles: its grid also lists other characters' items, which can share a name with them. */
const ownTile = (page: Page) => page.locator('.bu-tile:not(.shared-tile)');
/** Another character's item in a grid, by its name. */
const sharedTile = (grid: Locator, name: string) => grid.locator('.shared-tile', { hasText: name });

test('another character’s item on the same body is worn for free, survives reload and outlives its source', async ({
	page,
	context
}) => {
	const requests: string[] = [],
		errors: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
		await route.abort();
	});
	page.on('pageerror', (e) => errors.push(e.message));
	const others = await threeCharacters(page);
	// One grid: no separate row, and the other characters' items follow this character's own.
	await expect(page.locator('.equipment-scroll')).not.toContainText('From your other characters');
	await expect(section(page, 'Head').locator('.bu-section-count')).toHaveText('2 items');
	// Only items this character does not already have: its own helmet and hat stay off the list. Exact copies come first;
	// every other item is free too, worn as drawn. A tile shows its name only, and its icons say the rest.
	const tiles = others.locator('.shared-tile');
	await expect(tiles).toHaveText([
		/^\s*Traveling wizard hat\s*$/,
		/^\s*(Stout|Giant) helmet\s*$/,
		/^\s*(Stout|Giant) helmet\s*$/
	]);
	const all = others.locator('.bu-tile');
	expect(await all.evaluateAll((el) => el.map((e) => e.classList.contains('shared-tile')))).toEqual(
		[false, false, false, true, true, true]
	);
	// Every tile keeps the same height, whatever it says.
	expect(
		new Set(await all.evaluateAll((el) => el.map((e) => e.getBoundingClientRect().height))).size
	).toBe(1);
	// The demo's wizard hat has no frames for some moves: an exact copy, but it hides there.
	const hat = sharedTile(others, 'Traveling wizard hat');
	await expect(hat).toHaveAccessibleName(
		/^Traveling wizard hat, missing frames in \d+ moves?, from Twin$/
	);
	await expect(hat).not.toHaveAttribute('aria-pressed');
	await hat.click();
	await expect(page.locator('.bu-toast')).toContainText(
		'Copied Traveling wizard hat from Twin. No generations used.'
	);
	const own = page
		.locator('.equipment-scroll [role=group][aria-label="Head items"]')
		.getByRole('button', { name: /^Traveling wizard hat(,|$)/ })
		.and(ownTile(page));
	await expect(own).toHaveAttribute('aria-pressed', 'true');
	await expect(own).toHaveAttribute('data-selected');
	await expect(tiles).toHaveCount(2);
	await expect(tiles.filter({ hasText: 'Traveling wizard hat' })).toHaveCount(0);
	// The copy's details credit the character it was made for.
	const copyDetails = await selectedItemDetails(page);
	await expect(copyDetails).toContainText('paid once for Twin; copied here for free');
	await page.keyboard.press('Escape');
	await page.keyboard.press('Control+z');
	await expect(own).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('Control+Shift+z');
	await expect(own).toHaveAttribute('aria-pressed', 'true');

	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	await equipmentGroup(page, 'Head');
	await expect(own).toHaveAttribute('aria-pressed', 'true');

	// Deleting the source leaves the copy as it is.
	await page.locator('.project-btn').click();
	await page.getByRole('menuitemradio', { name: 'Twin', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Twin');
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Delete character…', exact: true }).click();
	const confirm = page.getByRole('alertdialog');
	await expect(confirm).toContainText('Items copied to other characters stay.');
	await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(confirm).toHaveCount(0);
	await page.locator('.project-btn').click();
	await expect(page.getByRole('menuitemradio', { name: 'Twin', exact: true })).toHaveCount(0);
	await page.getByRole('menuitemradio', { name: 'Adventurer copy', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	await reloadStudio(page);
	await equipmentGroup(page, 'Head');
	await expect(own).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.experience-stage canvas').first()).toBeVisible();
	expect(requests).toEqual([]);
	expect(errors).toEqual([]);
});

test('a shared item’s ⋮ explains how it fits and makes one for this character, and nothing is submitted', async ({
	page,
	context
}) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixellabApiKey', 'test-only-not-a-real-key');
	});
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
		if (new URL(route.request().url()).pathname.endsWith('/balance'))
			return route.fulfill({
				json: {
					credits: { type: 'usd', usd: 0 },
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 }
				}
			});
		return route.abort();
	});
	const others = await threeCharacters(page);
	const giant = sharedTile(others, 'Giant helmet');
	await expect(giant).toHaveAccessibleName(
		'Giant helmet, not fitted to this body, missing some Cross punch frames, from Giant'
	);
	// Each icon explains itself on hover, problems first; the ⋮ menu says the same, for touch too.
	const titles = [
		// Its standing move shows the helmet's standing frame and its walk uses Giant's walk; the punch has no art, so it hides.
		'Drawn for Giant’s body, so it may float, clip or leave gaps. Default uses the first Giant default frame; Walk uses Giant walk.',
		'Missing some Cross punch frames; it hides there.',
		'From Giant. Wearing it copies it here for free.'
	];
	expect(
		await giant.locator('.tile-status').evaluateAll((el) => el.map((e) => e.getAttribute('title')))
	).toEqual(titles);
	await others.getByRole('button', { name: 'More options for Giant helmet', exact: true }).click();
	const menu = page.locator('#item-menu');
	await expect(menu.locator('.item-menu-marks li')).toHaveText(titles);
	await expect(menu.getByRole('menuitem', { name: /^Wear/ })).toBeFocused();
	await menu.getByRole('menuitem', { name: /^Make one for Adventurer copy…/ }).click();
	const sheet = page.getByRole('dialog', { name: 'New item', exact: true });
	await expect(sheet.getByRole('radio', { name: 'Head', exact: true })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(sheet.getByRole('textbox', { name: 'What is it?', exact: true })).toHaveValue(
		'a giant helmet'
	);
	await sheet.getByText('Advanced', { exact: true }).click();
	await expect(sheet.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
		'Giant helmet'
	);
	await expect(sheet.getByRole('button', { name: /^Make\b.*Est\. \d+ gens$/ })).toBeEnabled();
	await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(requests.filter((r) => !r.startsWith('GET '))).toEqual([]);
});

test('an item drawn for another body on the same canvas is worn as drawn for free, with a warning and an offer to fit it', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
		await route.abort();
	});
	const others = await threeCharacters(page);
	// Exact copies list before the ones worn as drawn.
	await expect(others.locator('.shared-tile').first()).toHaveText(/^\s*Traveling wizard hat/);
	await sharedTile(others, 'Stout helmet').click();
	await expect(page.locator('.bu-toast')).toContainText(
		'Wearing Stout helmet as drawn for Stout. It may not line up with this body. No generations used.'
	);
	const own = page.locator('.equipment-scroll [role=group][aria-label="Head items"]');
	const worn = own.getByRole('button', {
		name: 'Stout helmet, not fitted to this body, copied from Stout',
		exact: true
	});
	await expect(worn).toHaveAttribute('aria-pressed', 'true');
	// Worn, not fitted and copied: the check, the fit glyph and where it came from, each explained on hover.
	await expect(worn.locator('.bu-tile-check')).toHaveAttribute('title', 'Wearing');
	expect(
		await worn.locator('.tile-status').evaluateAll((el) => el.map((e) => e.getAttribute('title')))
	).toEqual([
		'Drawn for Stout’s body, so it may float, clip or leave gaps.',
		'Copied from Stout for free.'
	]);
	await expect(others.locator('.shared-tile', { hasText: 'Stout helmet' })).toHaveCount(0);
	await reloadStudio(page);
	await equipmentGroup(page, 'Head');
	await own
		.getByRole('button', { name: /^Stout helmet(,|$)/ })
		.and(ownTile(page))
		.click();
	const details = await selectedItemDetails(page);
	await expect(details).toContainText(
		'Drawn for Stout’s body, so it may float, clip or leave gaps. Make one for Adventurer copy to fit it.'
	);
	await expect(details).toContainText('Not fitted');
	await expect(
		details.getByRole('button', { name: 'Make one for Adventurer copy', exact: true })
	).toBeVisible();
	expect(requests).toEqual([]);
});

test('the demo lists items from other characters and wears one in a saved copy of itself in one tap', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
		await route.abort();
	});
	await threeCharacters(page);
	await page.evaluate(() => localStorage.setItem('pixeldoll.studio.project', 'fixture:s2'));
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).not.toContainText('Adventurer copy');
	await equipmentGroup(page, 'Head');
	const others = page.locator('.equipment-scroll [role=group][aria-label="Head items"]');
	await expect(others.locator('.shared-tile')).toHaveCount(3);
	await sharedTile(others, 'Traveling wizard hat').click();
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	await expect(page.locator('.bu-toast').last()).toContainText(
		'Opened your editable copy of the demo. Copied Traveling wizard hat from Twin. No generations used.'
	);
	await expect(
		page
			.locator('.equipment-scroll [role=group][aria-label="Head items"]')
			.getByRole('button', { name: /^Traveling wizard hat(,|$)/ })
			.and(ownTile(page))
	).toHaveAttribute('aria-pressed', 'true');
	expect(requests).toEqual([]);
});

test('items from other characters fit a phone without horizontal overflow and its ⋮ menu stays on screen', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const others = await threeCharacters(page);
	await expect(others.locator('.shared-tile')).toHaveCount(3);
	await others.getByRole('button', { name: 'More options for Giant helmet', exact: true }).click();
	await expect(
		page.locator('#item-menu').getByRole('menuitem', { name: /^Make one for Adventurer copy…/ })
	).toBeInViewport();
	const viewport = page.viewportSize()!;
	for (const tile of await others.getByRole('button').all()) {
		const box = (await tile.boundingBox())!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
	}
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a copy missing frames its source item has copies them for free into the same item', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
		await route.abort();
	});
	const others = await threeCharacters(page);
	await sharedTile(others, 'Traveling wizard hat').click();
	await expect(page.locator('.bu-toast')).toContainText('No generations used.');
	// As if the copy was made before Twin's hat had its walk: drop the copy's walk frames.
	const dropped = await page.evaluate(async () => {
		const request = indexedDB.open('pixeldoll', 1);
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const store = database.transaction('projects', 'readwrite').objectStore('projects');
		const all = await new Promise<{ id: string; manifest: { name: string; items: any[] } }[]>(
			(resolve, reject) => {
				const read = store.getAll();
				read.onsuccess = () => resolve(read.result);
				read.onerror = () => reject(read.error);
			}
		);
		const rec = all.find((r) => r.manifest.name === 'Adventurer copy')!,
			copy = rec.manifest.items.find((it) => it.copiedFrom?.name === 'Twin')!;
		const before = copy.coverage.length;
		copy.coverage = copy.coverage.filter((k: string) => !k.startsWith('walk/'));
		for (const layer of copy.layers) delete layer.cells.walk;
		store.put(rec, rec.id);
		await new Promise<void>((resolve, reject) => {
			store.transaction.oncomplete = () => resolve();
			store.transaction.onerror = store.transaction.onabort = () => reject(store.transaction.error);
		});
		database.close();
		return before - copy.coverage.length;
	});
	expect(dropped).toBeGreaterThan(0);
	await reloadStudio(page);
	await equipmentGroup(page, 'Head');
	await page
		.locator('.equipment-scroll [role=group][aria-label="Head items"]')
		.getByRole('button', { name: /^Traveling wizard hat(,|$)/ })
		.and(ownTile(page))
		.click();
	const details = await selectedItemDetails(page);
	const copy = details.getByRole('button', { name: 'Copy from Twin · Free', exact: true });
	await expect(copy).toBeVisible();
	await expect(details).toContainText(
		`Twin has ${dropped} frames of this item that Adventurer copy lacks. Nothing is generated.`
	);
	await expect(details.getByRole('button', { name: /^Make for / })).toHaveCount(0);
	await copy.click();
	await expect(page.locator('.bu-toast').last()).toContainText(
		`Copied ${dropped} frames of Traveling wizard hat from Twin. No generations used.`
	);
	await reloadStudio(page);
	await equipmentGroup(page, 'Head');
	const hats = page
		.locator('.equipment-scroll [role=group][aria-label="Head items"]')
		.getByRole('button', { name: /^Traveling wizard hat(,|$)/ })
		.and(ownTile(page));
	await expect(hats).toHaveCount(1);
	await hats.click();
	await expect(
		(await selectedItemDetails(page)).getByRole('button', { name: 'Copy from Twin · Free' })
	).toHaveCount(0);
	expect(requests).toEqual([]);
});

test('another character’s sword re-fits a body standing 1 px aside for free and asks for a look', async ({
	page,
	context
}, info) => {
	const requests: string[] = [],
		errors: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
		await route.abort();
	});
	page.on('pageerror', (e) => errors.push(e.message));
	// The dev server serves the app's modules, so the fixture moves real demo frames with the app's own image code.
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await openStudio(page, dev);
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.evaluate(async () => {
		const paths = {
				state: '/src/studio/state.svelte.ts',
				db: '/src/lib/store/db.ts',
				poses: '/src/lib/rig/poses.ts',
				items: '/src/lib/items/items.ts',
				png: '/src/lib/image/png.ts',
				raw: '/src/lib/image/pngraw.ts',
				rig: '/src/lib/rig/rig.ts'
			},
			s = await import(paths.state),
			db = await import(paths.db),
			poses = await import(paths.poses),
			items = await import(paths.items),
			png = await import(paths.png),
			raw = await import(paths.raw),
			rigs = await import(paths.rig);
		const copy = await db.get('projects', s.doc.id),
			m = copy.manifest,
			body = m.items.find((it: { id: string }) => it.id === m.rig.baseItem);
		// A standing skeleton (the right hand on the viewer's left facing south), moved by dx px.
		const at: Record<string, [number, number]> = {
			NOSE: [32, 20],
			NECK: [32, 26],
			'RIGHT SHOULDER': [28, 28],
			'RIGHT ELBOW': [27, 34],
			'RIGHT ARM': [27, 40],
			'LEFT SHOULDER': [36, 28],
			'LEFT ELBOW': [37, 34],
			'LEFT ARM': [37, 40],
			'RIGHT HIP': [30, 44],
			'RIGHT KNEE': [30, 52],
			'RIGHT LEG': [30, 60],
			'LEFT HIP': [34, 44],
			'LEFT KNEE': [34, 52],
			'LEFT LEG': [34, 60],
			'RIGHT EYE': [30, 19],
			'LEFT EYE': [34, 19],
			'RIGHT EAR': [28, 20],
			'LEFT EAR': [36, 20]
		};
		// `turned`: the right forearm points sideways instead of down (the wrist stays put).
		const skeleton = (dx: number, turned = false) =>
			poses.LABELS.map((label: string) => {
				const [x, y] = turned && label === 'RIGHT ELBOW' ? [21, 40] : at[label];
				return { label, x: (x + dx) / 64, y: y / 64 };
			});
		// `turn`: one walk frame facing south where the arm turns, so that frame fails the forearm check.
		const rig = (record: typeof copy, dx: number, turn = false) => {
			const r = record.manifest.rig,
				b = record.manifest.items.find((it: { id: string }) => it.id === r.baseItem);
			r.rest = {};
			for (const { id: dir } of r.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf)) {
				r.rest[dir] = { image: b.layers[0].cells.walk[dir][0], keypoints: skeleton(dx) };
				for (const a of r.animations)
					(a.sources ??= {})[dir] = {
						route: 'skeleton-v3',
						reference: r.rest[dir].image,
						keypoints: Array.from({ length: a.cells }, (_, i) =>
							skeleton(dx, turn && a.id === 'walk' && dir === 'south' && i === 1)
						),
						provenance: []
					};
			}
		};
		// "Lefty": the same character standing 1 px to the right, holding its own sword.
		const lefty = structuredClone(copy);
		lefty.id = 'rig-lefty';
		lefty.manifest.name = 'Lefty';
		const moved = new Map<string, string>();
		const shift = async (hash: string | null) => {
			if (!hash) return hash;
			if (!moved.has(hash)) {
				const im = items.translate(await png.decodePng(await db.getBlob(hash.slice(7))), 1, 0),
					h = await rigs.cellHash(im);
				await db.put(
					'blobs',
					h.slice(7),
					new Blob([await raw.encodePngBytes(im)], { type: 'image/png' })
				);
				moved.set(hash, h);
			}
			return moved.get(hash)!;
		};
		const baseHash = 'sha256:' + 'c'.repeat(64);
		lefty.manifest.rig.baseHash = baseHash;
		for (const it of lefty.manifest.items) {
			it.baseHash = baseHash;
			if (it.id !== body.id && it.id !== 'sword_steel') continue;
			for (const layer of it.layers)
				for (const dirs of Object.values(layer.cells) as Record<string, (string | null)[]>[])
					for (const dir of Object.keys(dirs)) dirs[dir] = await Promise.all(dirs[dir].map(shift));
		}
		Object.assign(
			lefty.manifest.items.find((it: { id: string }) => it.id === 'sword_steel'),
			{
				name: 'Lefty sword',
				prompt: 'a lefty sword',
				qa: {
					status: 'pass',
					rerolls: 0,
					cells: {},
					clips: {},
					minKeyKept: 1,
					maxKeyOutside: 0,
					minAreaRatio: 1,
					maxAreaCV: 0,
					maxPaletteDist: 0,
					clipPx: 0
				}
			}
		);
		rig(lefty, 1);
		rig(copy, 0, true);
		await db.put('projects', lefty.id, lefty);
		await db.put('projects', copy.id, copy);
	});
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	await equipmentGroup(page, 'Main hand');
	const others = page.locator('.equipment-scroll [role=group][aria-label="Main hand items"]');
	await expect(sharedTile(others, 'Lefty sword')).toHaveAccessibleName(
		'Lefty sword, check fit, from Lefty'
	);
	await sharedTile(others, 'Lefty sword').click();
	await expect(page.locator('.bu-toast')).toContainText(
		'Fitted Lefty sword from Lefty for free. Check it in each move.'
	);
	const fitted = page
		.locator('.equipment-scroll')
		.getByRole('button', { name: /^Lefty sword, needs a look/ });
	await expect(fitted).toHaveAttribute('data-selected');
	// Worn after the free fit: the check mark, and beside it the warning, explained on hover.
	await expect(fitted.locator('.bu-tile-check')).toBeVisible();
	await expect(fitted.locator('.tile-status[data-tone="warning"]')).toHaveAttribute(
		'title',
		/^Needs a look/
	);
	const details = await selectedItemDetails(page);
	await expect(details).toContainText('Fitted for free from Lefty’s item. Check these frames:');
	// A re-fit's issues are its fit: nothing to accept as is; a new item for this body is offered instead.
	await expect(details.getByRole('button', { name: 'Accept as is', exact: true })).toHaveCount(0);
	await expect(
		details.getByRole('button', { name: 'Make one for Adventurer copy', exact: true })
	).toBeVisible();
	// Each note shows its frame on the stage, paused.
	const note = details.getByRole('button', { name: /^Walk facing south, frame 2: / });
	await expect(note).toHaveText(/the forearm points another way than on Lefty/);
	await note.click();
	// The details sheet closes so the stage shows that frame.
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				s = await import(path);
			const clip = s.store.project.manifest.rig.animations.find(
				(a: { id: string }) => a.id === s.ui.anim
			);
			return [s.ui.anim, s.ui.dir, clip.frames[s.ui.frame].cell, s.ui.playing];
		})
	).toEqual(['walk', 'south', 1, false]);
	expect(requests).toEqual([]);
	expect(errors).toEqual([]);
});
