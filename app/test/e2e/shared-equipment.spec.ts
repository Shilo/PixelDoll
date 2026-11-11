import {
	openStudio,
	reloadStudio,
	equipmentGroup,
	newItem,
	selectedItemDetails
} from './immersive-helpers.ts';
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await context.route('https://*.pixellab.ai/**', (route) => route.abort()); // stay offline by default; a test's own route overrides this
});

/** An editable copy of the demo, plus two more saved characters made from it: "Twin" (the same body) with a traveling
 *  wizard hat, and "Giant" (a different body: its pivot moved) with a giant helmet. Then reopens the copy. */
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
			{ id: string; manifest?: { name: string; rig: { pivot: { x: number } }; items: any[] } }[]
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
		for (const rec of [
			clone('rig-twin', 'Twin', 'hat_wizard', 'Traveling wizard hat', 'a traveling wizard hat'),
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
	return page.locator('.equipment-scroll').getByRole('group', { name: 'From other characters' });
}

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
	await expect(page.locator('.equipment-scroll')).toContainText('From other characters');
	// Only items this character does not already have: its own helmet and hat stay off the list.
	await expect(others.getByRole('button')).toHaveText([
		/Traveling wizard hat\s*from Twin/,
		/Giant helmet\s*from Giant/
	]);
	await others
		.getByRole('button', { name: 'Traveling wizard hat, from Twin', exact: true })
		.click();
	await expect(page.locator('.bu-toast')).toContainText('Added Traveling wizard hat from Twin.');
	const own = page
		.locator('.equipment-scroll [role=group][aria-label="Head items"]')
		.getByRole('button', { name: 'Traveling wizard hat', exact: true });
	await expect(own).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.sel-name')).toHaveText('Traveling wizard hat');
	await expect(others.getByRole('button')).toHaveText([/Giant helmet\s*from Giant/]);
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
	const confirm = page.getByRole('dialog', { name: 'Delete character?', exact: true });
	await expect(confirm).toContainText('Items copied to other characters stay.');
	await confirm.getByRole('button', { name: 'Delete character', exact: true }).click();
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

test('an item made for a different body offers to make it for this character, and nothing is submitted', async ({
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
	await others.getByRole('button', { name: 'Giant helmet, from Giant', exact: true }).click();
	const unfit = page.locator('.equipment-scroll .unfit');
	await expect(unfit).toContainText('Made for Giant. It doesn’t fit Adventurer copy yet.');
	await expect(
		page.locator('.equipment-scroll').getByRole('button', { name: 'Giant helmet', exact: true })
	).toHaveCount(0);
	await unfit.getByRole('button', { name: 'Make for Adventurer copy', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'New item', exact: true });
	await expect(sheet.getByRole('radio', { name: 'Head', exact: true })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(sheet.getByRole('textbox', { name: 'What is it?', exact: true })).toHaveValue(
		'a giant helmet'
	);
	await sheet.getByText('Details', { exact: true }).click();
	await expect(sheet.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
		'Giant helmet'
	);
	await expect(sheet.getByRole('button', { name: /^Make\b.*Est\. \d+ gens$/ })).toBeEnabled();
	await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	// Selecting another tile clears the offer.
	await page
		.locator('.equipment-scroll')
		.getByRole('button', { name: 'Wizard hat', exact: true })
		.click();
	await expect(unfit).toHaveCount(0);
	expect(requests.filter((r) => !r.startsWith('GET '))).toEqual([]);
});

test('the From other characters row fits a phone without horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const others = await threeCharacters(page);
	await expect(others.getByRole('button')).toHaveCount(2);
	const viewport = page.viewportSize()!;
	for (const tile of await others.getByRole('button').all()) {
		const box = (await tile.boundingBox())!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
	}
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
		const skeleton = (dx: number) =>
			poses.LABELS.map((label: string) => ({
				label,
				x: (at[label][0] + dx) / 64,
				y: at[label][1] / 64
			}));
		const rig = (record: typeof copy, dx: number) => {
			const r = record.manifest.rig,
				b = record.manifest.items.find((it: { id: string }) => it.id === r.baseItem);
			r.rest = {};
			for (const { id: dir } of r.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf)) {
				r.rest[dir] = { image: b.layers[0].cells.walk[dir][0], keypoints: skeleton(dx) };
				for (const a of r.animations)
					(a.sources ??= {})[dir] = {
						route: 'skeleton-v3',
						reference: r.rest[dir].image,
						keypoints: Array.from({ length: a.cells }, () => skeleton(dx)),
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
		rig(copy, 0);
		await db.put('projects', lefty.id, lefty);
		await db.put('projects', copy.id, copy);
	});
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	await equipmentGroup(page, 'Main hand');
	const others = page
		.locator('.equipment-scroll')
		.getByRole('group', { name: 'From other characters' });
	await others.getByRole('button', { name: 'Lefty sword, from Lefty', exact: true }).click();
	await expect(page.locator('.bu-toast')).toContainText(
		'Added Lefty sword from Lefty. Check it in each move.'
	);
	await expect(page.locator('.sel-name')).toHaveText('Lefty sword');
	await expect(page.locator('.sel-row .badge')).toHaveText('Needs a look');
	const details = await selectedItemDetails(page);
	await expect(details).toContainText(
		'Fitted from Lefty’s item without generating; check each move.'
	);
	await expect(
		details.getByRole('button', { name: 'Make for Adventurer copy', exact: true })
	).toBeVisible();
	expect(requests).toEqual([]);
	expect(errors).toEqual([]);
});
