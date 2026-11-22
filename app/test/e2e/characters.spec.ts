import {
	openStudio,
	reloadStudio,
	equipmentMode,
	equipmentGroup,
	newItem,
	selectedItemDetails,
	pickItem,
	openPlaybackPicker
} from './immersive-helpers.ts';
import './setup-concurrency.ts';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeImg } from '../../src/lib/image/png.ts';
import { encodePngBytes, decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { zip, unzip } from '../../src/lib/store/zip.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { splitBase } from '../../src/lib/dress/regions.ts';
import { composeCell } from '../../src/lib/compose/compose.ts';

const ID = 'f6a0bdc5-354e-4682-8df3-55fc3d118737';
const moreOptions = 'button[popovertarget="experience-options"]';

test.describe('first Studio render in French', () => {
	test.use({ locale: 'fr-CA' });

	test('detects the browser language before rendering and remembers an explicit choice', async ({
		page
	}) => {
		const french = JSON.parse(
			await readFile(new URL('../../src/locales/fr.json', import.meta.url), 'utf8')
		) as typeof import('../../src/locales/fr.json');
		const label = french.toolbar.moreOptions;
		expect(label).not.toBe('More options');
		await page.addInitScript((selector) => {
			const observer = new MutationObserver(() => {
				const label = document.querySelector(selector)?.getAttribute('aria-label');
				if (!label) return;
				document.documentElement.dataset.firstOptionsLabel = label;
				observer.disconnect();
			});
			observer.observe(document, { childList: true, subtree: true, attributes: true });
		}, moreOptions);
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect(page.locator('html')).toHaveAttribute('data-first-options-label', label);
		await page
			.getByRole('button', { name: french.newCharacterButton.newCharacter, exact: true })
			.first()
			.click();
		await page
			.getByRole('menuitem', {
				name: french.newCharacterButton.createFromScratch.replace(/…$/u, '...'),
				exact: true
			})
			.click();
		const draft = page.getByRole('dialog', { name: french.create.sheet.title, exact: true });
		const name = draft.getByRole('textbox', { name: french.common.name, exact: true });
		await name.fill('Draft hero');
		await expect(name).toHaveValue('Draft hero');
		await page.keyboard.press('Escape');
		await expect(draft).toBeHidden();
		await page.getByRole('button', { name: label, exact: true }).click();
		const settingsTitle = french.export.sheet.settings;
		await page.getByRole('button', { name: `${settingsTitle}...`, exact: true }).click();
		const settings = page.getByRole('dialog', { name: settingsTitle, exact: true });
		await settings
			.getByRole('button', { name: french.experience.tabWardrobe, exact: true })
			.click();
		const filters = settings.getByRole('group', { name: french.sharedVisibility.heading });
		await expect(
			filters.getByRole('switch', { name: french.sharedVisibility.hideAll, exact: true })
		).toBeVisible();
		await expect(filters.locator('.row-name strong').first()).toHaveText(
			french.sharedVisibility.allEmphasis
		);
		await settings.getByRole('button', { name: french.common.close, exact: true }).click();
		await page.getByRole('button', { name: label, exact: true }).click();
		const frenchPicker = page.getByRole('button', { name: french.language.label, exact: true });
		await expect(frenchPicker).toHaveAccessibleDescription('Français');
		await frenchPicker.click();
		const frenchMenu = page.getByRole('group', { name: french.language.label, exact: true });
		await expect(frenchMenu.getByRole('button').first()).toHaveText('Automatique (Français)');
		await expect(frenchMenu.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
		await expect(
			frenchMenu.getByRole('button', { name: 'Deutsch Allemand', exact: true })
		).toBeVisible();
		await frenchMenu.getByRole('button', { name: 'English Anglais', exact: true }).click();
		await expect(page.getByRole('button', { name: 'More options', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Language', exact: true })).toBeFocused();
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'New character', exact: true }).first().click();
		await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
		await expect(
			page.getByRole('dialog', { name: 'New character', exact: true }).getByRole('textbox', {
				name: 'Name',
				exact: true
			})
		).toHaveValue('');
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await page.getByRole('button', { name: 'More options', exact: true }).click();
		const picker = page.getByRole('button', { name: 'Language', exact: true });
		await expect(picker).toHaveAccessibleDescription('English');
		await picker.focus();
		await page.keyboard.press('Enter');
		const menu = page.getByRole('group', { name: 'Language', exact: true });
		await expect(menu.getByRole('button', { name: 'Deutsch German', exact: true })).toBeVisible();
		await expect(menu.getByRole('button', { name: 'English', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		const automatic = menu.getByRole('button', { name: 'Auto (Français)', exact: true });
		await expect(automatic).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect
			.poll(() => page.evaluate(() => localStorage.getItem('pixeldoll.locale')))
			.toBeNull();
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await page.getByRole('button', { name: label, exact: true }).click();
		const connectLabel = french.connectSheet.titleConnectPixelLab;
		await page.getByRole('button', { name: `${connectLabel}...`, exact: true }).click();
		const connect = page.getByRole('dialog', { name: connectLabel, exact: true });
		await expect(
			connect.getByLabel(french.connectSheet.secretApiKey, { exact: true })
		).toHaveAttribute('placeholder', /^pixl_[a-f0-9]{32}$/);
		await expect(
			connect.getByRole('button', { name: french.connectSheet.notNow, exact: true })
		).toBeVisible();
	});
});

test.describe('first Studio render in Traditional Chinese', () => {
	test.use({ locale: 'zh-TW', hasTouch: true });

	test('falls back to English rather than Simplified Chinese', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/');
		await page.getByRole('button', { name: 'More options', exact: true }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		const trigger = page.getByRole('button', { name: 'Language', exact: true });
		await expect(trigger.getByText('English', { exact: true })).toBeVisible();
		await trigger.tap();
		const picker = page.getByRole('group', { name: 'Language', exact: true });
		await expect(picker.getByRole('button').first()).toHaveText('Auto (English)');
		await expect(picker.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
		await expect(picker.locator('.language-option > [lang]:first-child')).toHaveText([
			'Bahasa Indonesia',
			'Deutsch',
			'English',
			'Español',
			'Français',
			'Português (Brasil)',
			'Türkçe',
			'한국어',
			'日本語',
			'简体中文'
		]);
	});
});

test.describe('first Studio render with a stalled Japanese catalog', () => {
	test.use({ locale: 'ja-JP' });

	test('opens in English and switches to Japanese when the catalog arrives', async ({ page }) => {
		const japanese = JSON.parse(
			await readFile(new URL('../../src/locales/ja.json', import.meta.url), 'utf8')
		) as typeof import('../../src/locales/ja.json');
		let release!: () => void, markRequested!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const requested = new Promise<void>((resolve) => {
			markRequested = resolve;
		});
		await page.route(/\/assets\/ja-[^/]+\.js$/, async (route) => {
			markRequested();
			await held;
			await route.continue();
		});
		try {
			await page.goto('/', { waitUntil: 'commit' });
			await requested;
			await expect(page.getByRole('button', { name: 'More options', exact: true })).toBeVisible();
			await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		} finally {
			release();
		}
		await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
		await expect(
			page.getByRole('button', { name: japanese.toolbar.moreOptions, exact: true })
		).toBeVisible();
	});
});

test('unselected demo shows its facts after reload', async ({ page }, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.goto(
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.customize-action')).toBeEnabled();
	await expect(page.locator('.selected-name-text')).toHaveText('Adventurer (Demo)');
	await expect(page.locator('.character-row strong .bu-muted')).toHaveText('(Demo)');
	await page
		.getByRole('button', { name: 'More actions for Adventurer (demo)', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Edit a copy', exact: true }).click();
	await expect(page.locator('.selected-name-text')).toHaveText('Adventurer copy');
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		const state = await import(path);
		await state.renameProject('Saved hero');
	});
	const savedActions = page.getByRole('button', {
		name: 'More actions for Saved hero',
		exact: true
	});
	await expect(savedActions).toHaveAttribute('title', 'More actions for Saved hero');
	await expect(savedActions.locator('svg')).toHaveCount(1);
	await savedActions.click();
	await expect(page.getByRole('menuitem', { name: 'Edit a copy', exact: true })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await page
		.getByRole('button', { name: 'More actions for Adventurer (demo)', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Edit a copy', exact: true }).click();
	await expect(
		page.locator('.cast-library').getByRole('menuitem', {
			name: 'Edit a copy',
			exact: true,
			includeHidden: true
		})
	).toBeEnabled();
	await expect(page.locator('.selected-name-text')).toHaveText('Saved hero');
	await expect(page.locator('.cast-library .character-row')).toHaveCount(2);
	await page.reload();
	const rows = page.locator('.cast-library .character-row');
	await expect(rows.filter({ hasText: 'Saved hero' })).toHaveAttribute('aria-pressed', 'true');
	await expect(
		rows.filter({ hasText: 'Adventurer' }).locator('.character-sizes > span')
	).toHaveText([/^Body \d+×\d+ px$/, '· Frame 64×64 px']);
	await expect(rows.filter({ hasText: 'Adventurer' }).locator('.character-counts')).toHaveText(
		'4 directions · 2 moves · 6 items'
	);
	await expect(rows.filter({ hasText: 'Adventurer' })).toHaveAttribute('aria-pressed', 'false');
	await expect
		.poll(() =>
			rows.locator('canvas').evaluateAll(
				(elements) =>
					elements.length === 2 &&
					elements.every((element) => {
						const canvas = element as HTMLCanvasElement;
						const { width, height } = canvas;
						const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
						const visible = (x: number, y: number) => pixels[(y * width + x) * 4 + 3] > 0;
						const bounds = canvas.getBoundingClientRect();
						return (
							Math.abs(bounds.width * devicePixelRatio - width) < 0.1 &&
							Math.abs(bounds.height * devicePixelRatio - height) < 0.1 &&
							Array.from({ length: width }, (_, x) => x).some((x) => visible(x, 0)) &&
							Array.from({ length: width }, (_, x) => x).some((x) => visible(x, height - 1)) &&
							Array.from({ length: height }, (_, y) => y).some((y) => visible(0, y)) &&
							Array.from({ length: height }, (_, y) => y).some((y) => visible(width - 1, y))
						);
					})
			)
		)
		.toBe(true);
	await rows.filter({ hasText: 'Adventurer' }).click();
	await expect(rows.filter({ hasText: 'Adventurer' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.customize-action')).toHaveAttribute('aria-busy', 'false');
	await page.reload();
	await expect(rows.filter({ hasText: 'Adventurer' })).toHaveAttribute('aria-pressed', 'true');
	await expect(rows.locator('.character-counts')).toHaveText([
		'4 directions · 2 moves · 6 items',
		'4 directions · 1 state · 2 moves · 6 items'
	]);
	await page.locator('.customize-action').click();
	await expect(page.locator('.name-text')).toHaveText('Adventurer (Demo)');
	await expect(page.locator('.name-facts')).toHaveText(
		'Frame 64×64 px · 4 directions · 2 moves · 6 items'
	);
	await page.getByRole('tab', { name: 'Moves', exact: true }).click();
	const moveDetails = page.locator('.colors details').filter({ hasText: 'pivot' });
	await expect(moveDetails.locator('summary')).not.toContainText('...');
	await moveDetails.locator('summary').click();
	await expect(moveDetails.getByText(/^64×64 px, pivot /)).toBeVisible();
	await expect(moveDetails.getByText(/^\d+×\d+ px$/)).toBeVisible();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Edit a copy', exact: true }).click();
	await expect(page.locator('.name-text')).toHaveText('Saved hero');
	const viewport = page.viewportSize()!;
	await page.setViewportSize({ width: 320, height: 700 });
	await expect(page.locator('.name-text')).toBeVisible();
	await expect(page.locator('.name-text')).toHaveText('Saved hero');
	await page.setViewportSize(viewport);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(page.getByRole('menuitem', { name: 'Edit a copy', exact: true })).toHaveCount(0);
});

test('character actions download and delete an unopened character without selecting it', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.goto(
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.character-row')).toHaveCount(1);
	await expect(page.locator('.customize-action')).toBeEnabled();
	const target = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		const state = await import(path);
		const id = await state.copyDemo();
		await state.renameProject('Disposable hero');
		await state.openProject('fixture:s2');
		return id;
	});
	const row = page.locator('.cast-library .character-entry').filter({ hasText: 'Disposable hero' });
	const selected = page.locator('.cast-library .character-row[aria-pressed=true]');
	const touch = await page.context().newCDPSession(page);
	for (const target of [row.locator('.character-row'), row.locator('.character-more')]) {
		const box = (await target.boundingBox())!;
		await touch.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
		});
		await expect(
			page.getByRole('menu', { name: 'Actions for Disposable hero', exact: true })
		).toBeVisible();
		await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect(
			page.getByRole('menu', { name: 'Actions for Disposable hero', exact: true })
		).toBeVisible();
		await expect(selected).toContainText('Adventurer');
		await page.keyboard.press('Escape');
	}
	await row.locator('.character-row').click({ button: 'right' });
	const menu = page.getByRole('menu', { name: 'Actions for Disposable hero', exact: true });
	await expect(menu).toBeVisible();
	await expect(selected).toContainText('Adventurer');
	const downloaded = page.waitForEvent('download');
	await menu.getByRole('menuitem', { name: 'Download ZIP', exact: true }).click();
	const download = await downloaded;
	const imported = await readCharacterZip(new Uint8Array(await readFile((await download.path())!)));
	expect(imported.project.manifest.name).toBe('Disposable hero');
	expect(imported.project.manifest.exportId).toMatch(/^adventurer_copy_[a-f0-9]{12}$/);
	expect(download.suggestedFilename()).toBe(`${imported.project.manifest.exportId}.pixeldoll.zip`);
	expect(imported.project.manifest.items.length).toBeGreaterThan(1);
	await row.locator('.character-more').click({ button: 'right' });
	await menu.getByRole('menuitem', { name: 'Delete character…', exact: true }).click();
	await expect(page.getByRole('alertdialog', { name: 'Delete Disposable hero?' })).toBeVisible();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await row.locator('.character-row').focus();
	await page.keyboard.press('Shift+F10');
	await menu.getByRole('menuitem', { name: 'Delete character…', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(row).toHaveCount(0);
	await expect(selected).toContainText('Adventurer');
	expect(
		await page.evaluate(async (id) => {
			const path = '/src/lib/store/db.ts';
			return !!(await (await import(path)).get('projects', id));
		}, target)
	).toBe(false);
});

test('character rows keep their ⋮ out of sight until hover or keyboard focus on desktop', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.goto('/');
	const row = page.locator('.cast-library .character-entry').first();
	const more = row.locator('.character-more');
	await expect(row.locator('.character-row')).toBeVisible();
	await page.mouse.move(0, 0);
	await expect(more).toHaveCSS('opacity', '0');
	await row.locator('.character-row').hover();
	await expect(more).toHaveCSS('opacity', '1');
	await page.mouse.move(0, 0);
	await expect(more).toHaveCSS('opacity', '0');
	// Keyboard focus reveals it, Tab reaches it, and Enter opens it.
	await page.keyboard.press('Tab');
	await row.locator('.character-row').focus();
	await expect(more).toHaveCSS('opacity', '1');
	await page.keyboard.press('Tab');
	await expect(more).toBeFocused();
	await expect(more).toHaveCSS('opacity', '1');
	await page.keyboard.press('Enter');
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	await page.keyboard.press('Escape');
	await expect(more).toBeFocused();
	await expect(more).toHaveCSS('opacity', '1');
	// An open menu keeps it visible after the pointer leaves.
	await page.mouse.move(0, 0);
	await more.click();
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	await page.mouse.move(0, 0);
	await expect(more).toHaveCSS('opacity', '1');
});

test.describe('character actions on a touch screen', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the ⋮ stays visible without hover', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
		});
		await page.goto('/');
		const more = page.locator('.cast-library .character-more').first();
		await expect(more).toBeVisible();
		await expect(more).toHaveCSS('opacity', '1');
		expect(
			await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)
		).toBe(false);
	});
});

test('both New character entry points offer separate import sources on desktop and phone', async ({
	page
}) => {
	await page.addInitScript(() => localStorage.setItem('pixeldoll.welcomed', '1'));
	await page.goto('/');
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: 850 });
		const more = page.getByRole('button', { name: 'More options', exact: true });
		await expect(more).toHaveAttribute('title', 'More options');
		await expect(more.locator('svg')).toHaveCount(1);
		const library = page.getByRole('complementary', { name: 'Your characters' });
		const add = library.locator('.new-character-row');
		await expect(add).toBeVisible();
		const entry =
			width === 1440
				? page.locator('.experience-header .selection-create')
				: library.locator('.cast-action');
		for (const trigger of [entry, add]) {
			await expect(trigger.locator(':scope > span').last()).toHaveText(/\.\.\.$/);
			await expect(trigger.locator('svg[data-surface-chevron]')).toBeVisible();
			await trigger.click();
			const menu = page.getByRole('menu', { name: 'New character', exact: true });
			await expect(
				menu.locator('[role="menuitem"] > svg[data-surface-chevron][aria-hidden="true"]')
			).toHaveCount(3);
			await expect(menu.getByRole('menuitem')).toHaveText([
				'Create from scratch...',
				'Import from device...',
				'Import from PixelLab...'
			]);
			await menu.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
			await expect(
				page.getByRole('dialog', { name: 'Import from device', exact: true })
			).toBeVisible();
			await expect(page.getByRole('tablist', { name: 'Import source' })).toHaveCount(0);
			await page.getByRole('button', { name: 'Cancel', exact: true }).click();
			await trigger.click();
			await menu.getByRole('menuitem', { name: 'Import from PixelLab...', exact: true }).click();
			await expect(
				page.getByRole('dialog', { name: 'Import from PixelLab', exact: true })
			).toBeVisible();
			await expect(
				page.getByLabel('Direct import (connection optional)', { exact: true })
			).toBeVisible();
			await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		}
	}
});

async function multiStateImportZip(incompatible = false, unreadable = false, single = false) {
	const image = makeImg(48, 48);
	image.data.set([180, 100, 80, 255], (30 * 48 + 24) * 4);
	return zip([
		{
			name: 'metadata.json',
			data: new TextEncoder().encode(
				JSON.stringify({
					states: [
						{
							character: { id: ID, name: 'Base appearance', view: 'low top-down' },
							frames: {
								rotations: { south: 'sprite.png' },
								animations: { walk: { south: ['sprite.png'] } }
							}
						},
						{
							character: {
								id: 'punch-state',
								name: 'Punch appearance',
								view: incompatible ? 'side' : 'low top-down'
							},
							frames: {
								rotations: { south: 'sprite.png' },
								animations: unreadable ? null : { right_punch: { south: ['sprite.png'] } }
							}
						},
						{
							character: { id: 'still-state', name: 'Still appearance', view: 'low top-down' },
							frames: { rotations: { south: 'sprite.png' }, animations: {} }
						}
					].slice(0, single ? 1 : undefined)
				})
			)
		},
		{ name: 'sprite.png', data: await encodePngBytes(image) }
	]);
}

/** The research artifact was saved by an earlier preview; restamp its unchanged artwork in the current format. */
async function currentArtifact(bytes: Uint8Array) {
	const files = await unzip(bytes),
		project = JSON.parse(new TextDecoder().decode(files.get('project.json')!));
	project.manifest.format = CURRENT_FORMAT;
	for (const item of project.manifest.items) if (item.qa) item.qa.clips ??= {};
	files.set('project.json', new TextEncoder().encode(JSON.stringify(project)));
	return Buffer.from(await zip([...files].map(([name, data]) => ({ name, data }))));
}

test('experimental native attack imports with warnings and exact frame stepping without paid requests', async ({
	page,
	context
}) => {
	const requests: string[] = [],
		errors: string[] = [];
	await context.route('https://*.pixellab.ai/**', (route) => {
		requests.push(route.request().method());
		return route.abort();
	});
	page.on('pageerror', (error) => errors.push(error.message));
	const bytes = await currentArtifact(
			await readFile(
				new URL('../../../docs/research/artifacts/2026-11-02-east-axe-studio.zip', import.meta.url)
			)
		),
		native = await unzip(
			await readFile(
				new URL('../../../docs/research/artifacts/2026-11-02-gripped-axe-east.zip', import.meta.url)
			)
		);
	const source = await Promise.all(
		Array.from({ length: 8 }, (_, i) => decodePngBytes(native.get(`preview/${i}.png`)!))
	);
	const normalized = (await readCharacterZip(bytes)).project;
	await splitBase(normalized); // Studio's documented shirt/shorts blue-bit tagging, not an image tolerance.
	const expected = source.map((original, i) => {
		const rendered = composeCell(
			normalized,
			{ body: 'base', main_hand: 'axe' },
			'axe-attack',
			'east',
			i
		)!;
		expect(rendered.data.length).toBe(original.data.length);
		expect(
			rendered.data.findIndex((v, q) =>
				q % 4 === 2 ? (v & ~1) !== (original.data[q] & ~1) : v !== original.data[q]
			),
			'Only the declared blue region bit may change'
		).toBe(-1);
		return rendered;
	});
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'experimental-east-axe.zip',
		mimeType: 'application/zip',
		buffer: bytes
	});
	await expect(
		page.getByRole('img', { name: 'Character import preview', exact: true })
	).toBeVisible();
	await page
		.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true })
		.uncheck();
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'EXPERIMENTAL east axe review', exact: true })
	).toBeVisible();
	await equipmentGroup(page, 'Main hand');
	// Status shows on the tile itself and in its accessible name.
	await expect(
		page
			.locator('.equipment-scroll')
			.getByRole('region', { name: 'Main hand', exact: true })
			.getByRole('button', { name: /, needs a look/ })
	).toBeVisible();
	await page.getByRole('button', { name: 'Inspect', exact: true }).click();
	const inspect = page.getByRole('dialog', { name: 'Inspect character', exact: true });
	await expect(inspect).toBeVisible();
	const pause = inspect.getByRole('button', { name: 'Pause', exact: true });
	if (await pause.count()) await pause.click();
	await inspect.getByRole('combobox', { name: 'Move', exact: true }).selectOption('axe-attack');
	const next = inspect.getByRole('button', { name: 'Next frame', exact: true }),
		previous = inspect.getByRole('button', { name: 'Previous frame', exact: true });
	const pixels = () =>
		inspect
			.getByRole('img')
			.locator('canvas')
			.evaluate((canvas: HTMLCanvasElement) => {
				const factor = canvas.width / 144,
					raw = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
					out: number[] = [];
				for (let y = 0; y < 144; y++)
					for (let x = 0; x < 144; x++) {
						const q =
							(Math.floor((y + 0.5) * factor) * canvas.width + Math.floor((x + 0.5) * factor)) * 4;
						out.push(...raw.subarray(q, q + 4));
					}
				return out;
			});
	for (let i = 0; i < 8; i++) {
		await expect(inspect.getByText(`Frame ${i + 1} of 8`, { exact: true })).toBeVisible();
		await expect
			.poll(
				async () => {
					const actual = await pixels(),
						q = actual.findIndex((v, j) => v !== expected[i].data[j]);
					return q < 0
						? null
						: {
								index: q,
								x: Math.floor(q / 4) % 144,
								y: Math.floor(q / 4 / 144),
								actual: actual.slice(q - (q % 4), q - (q % 4) + 4),
								expected: Array.from(expected[i].data.slice(q - (q % 4), q - (q % 4) + 4))
							};
				},
				{ message: `Studio frame ${i + 1} must match every native RGBA pixel` }
			)
			.toBeNull();
		await next.click();
	}
	await expect(inspect.getByText('Frame 1 of 8', { exact: true })).toBeVisible();
	await previous.click();
	await expect(inspect.getByText('Frame 8 of 8', { exact: true })).toBeVisible();
	await page.keyboard.press('.');
	await expect(inspect.getByText('Frame 1 of 8', { exact: true })).toBeVisible();
	await expect(inspect.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await inspect.getByRole('combobox', { name: 'Move', exact: true }).selectOption('default');
	await expect(next).toBeDisabled();
	await expect(previous).toBeDisabled();
	await expect(inspect.getByText('Frame 1 of 1', { exact: true })).toBeVisible();
	for (const size of [
		{ width: 390, height: 844 },
		{ width: 844, height: 390 }
	]) {
		await page.setViewportSize(size);
		await expect(next).toBeInViewport();
		await expect(previous).toBeInViewport();
		await expect(inspect.getByText('Frame 1 of 1', { exact: true })).toBeInViewport();
	}
	await inspect.getByRole('button', { name: 'Done', exact: true }).click();
	await page.setViewportSize({ width: 1280, height: 720 });
	const empty = page
		.locator('.equipment-scroll')
		.getByRole('button', { name: 'Empty main hand', exact: true });
	await empty.click();
	await expect(empty).toHaveAttribute('aria-pressed', 'true');
	await page
		.locator('.equipment-scroll')
		.getByRole('button', { name: /^Experimental palm-gripped axe(,|$)/ })
		.click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByRole('checkbox', { name: 'Axe attack', exact: true }).check();
	await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download ZIP/ }).click();
	const exported = await unzip(await readFile((await (await downloading).path())!)),
		project = JSON.parse(new TextDecoder().decode(exported.get('project.json')!));
	expect(
		project.manifest.items.every(
			(item: { qa: { status: string; unmeasured: boolean } }) =>
				item.qa.status === 'warn' && item.qa.unmeasured === true
		)
	).toBe(true);
	const attack = project.manifest.rig.animations.find((a: { id: string }) => a.id === 'axe-attack');
	expect(attack.loop).toBe(false);
	expect(attack.frames.map((f: { ms: number }) => f.ms)).toEqual([
		120, 120, 80, 80, 80, 120, 100, 220
	]);
	const engineManifest = JSON.parse(new TextDecoder().decode(exported.get('manifest.json')!));
	expect(
		engineManifest.rig.animations.find((a: { id: string }) => a.id === 'axe-attack').loop
	).toBe(false);
	const roundtrip = (
		await readCharacterZip(await zip([...exported].map(([name, data]) => ({ name, data }))))
	).project;
	for (let i = 0; i < 8; i++)
		expect(
			composeCell(roundtrip, { body: 'base', main_hand: 'axe' }, 'axe-attack', 'east', i)?.data
		).toEqual(expected[i].data);
	expect(project.manifest.rig.directions).toEqual([{ id: 'east' }]);
	expect(requests).toEqual([]);
	expect(errors).toEqual([]);
});
test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await context.route('https://*.pixellab.ai/**', (route) => route.abort()); // stay offline by default; a test's own route overrides this
});

test('device import previews a dropped ZIP and offers a keyboard-accessible file picker', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://*.pixellab.ai/**', (route) => {
		requests.push(route.request().method());
		return route.abort();
	});
	const image = makeImg(48, 48);
	image.data.set([180, 100, 80, 255], (30 * 48 + 24) * 4);
	const bytes = await zip([
		{
			name: 'metadata.json',
			data: new TextEncoder().encode(JSON.stringify({ name: 'Drop preview' }))
		},
		{ name: 'rotations/south.png', data: await encodePngBytes(image) }
	]);
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true }),
		drop = dialog.getByRole('region', { name: 'Character ZIP drop area', exact: true });
	const transfer = await page.evaluateHandle((bytes) => {
		const data = new DataTransfer();
		data.items.add(new File([new Uint8Array(bytes)], 'character.ZIP', { type: 'application/zip' }));
		return data;
	}, Array.from(bytes));
	await drop.dispatchEvent('dragenter', { dataTransfer: transfer });
	await expect(drop).toContainText('Release ZIP to preview');
	// Crossing the button inside the drop surface must not reset its active state.
	await drop
		.getByRole('button', { name: 'Choose ZIP', exact: true })
		.dispatchEvent('dragenter', { dataTransfer: transfer });
	await drop
		.getByRole('button', { name: 'Choose ZIP', exact: true })
		.dispatchEvent('dragleave', { dataTransfer: transfer });
	await expect(drop).toContainText('Release ZIP to preview');
	await drop.dispatchEvent('dragleave', { dataTransfer: transfer });
	await expect(drop).toContainText('Drop a character ZIP here');
	await drop.dispatchEvent('dragover', { dataTransfer: transfer });
	await drop.dispatchEvent('drop', { dataTransfer: transfer });
	await expect(
		dialog.getByRole('img', { name: 'Character import preview', exact: true })
	).toBeVisible();
	await expect(dialog.getByLabel('Character name', { exact: true })).toHaveValue('Drop preview');
	await dialog.getByRole('button', { name: 'Choose another character', exact: true }).click();
	const choosing = page.waitForEvent('filechooser');
	await dialog.getByRole('button', { name: 'Choose ZIP', exact: true }).focus();
	await page.keyboard.press('Enter');
	await (
		await choosing
	).setFiles({ name: 'character.ZIP', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
	await expect(dialog.getByLabel('Character name', { exact: true })).toHaveValue('Drop preview');
	await expect(dialog.getByRole('button', { name: 'Import character', exact: true })).toBeEnabled();
	await transfer.dispose();
	expect(requests).toEqual([]);
});

test('device import validates dropped files and picker files before previewing', async ({
	page
}) => {
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true }),
		drop = dialog.getByRole('region', { name: 'Character ZIP drop area', exact: true });
	for (const [files, message] of [
		[[{ name: 'first.zip' }, { name: 'second.zip' }], 'Choose one character ZIP at a time.'],
		[[{ name: 'sprite.png' }], 'Choose a ZIP file exported from PixelLab or PixelDoll.'],
		[[{ name: 'large.zip', size: 64 * 1024 * 1024 + 1 }], 'Choose a ZIP smaller than 64 MB.']
	] as const) {
		const transfer = await page.evaluateHandle((files) => {
			const data = new DataTransfer();
			for (const entry of files) {
				const file = new File(['invalid'], entry.name, { type: 'application/zip' });
				if ('size' in entry) Object.defineProperty(file, 'size', { value: entry.size });
				data.items.add(file);
			}
			return data;
		}, files);
		await drop.dispatchEvent('drop', { dataTransfer: transfer });
		await expect(dialog.getByRole('alert')).toHaveText(message);
		await expect(
			dialog.getByRole('button', { name: 'Import character', exact: true })
		).toBeDisabled();
		await expect(dialog.getByRole('button', { name: 'Choose ZIP', exact: true })).toBeEnabled();
		await transfer.dispose();
	}
	const picker = dialog.getByLabel('Character ZIP', { exact: true });
	await picker.setInputFiles({
		name: 'sprite.png',
		mimeType: 'image/png',
		buffer: Buffer.from('invalid')
	});
	await expect(dialog.getByRole('alert')).toHaveText(
		'Choose a ZIP file exported from PixelLab or PixelDoll.'
	);
	const file = { name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid') };
	await picker.setInputFiles(file);
	await expect(dialog.getByRole('alert')).not.toHaveText(
		'Choose a ZIP file exported from PixelLab or PixelDoll.'
	);
	await expect(picker).toHaveValue('');
	await picker.setInputFiles(file);
	await expect(dialog.getByRole('alert')).toBeVisible();
	await expect(
		dialog.getByRole('button', { name: 'Import character', exact: true })
	).toBeDisabled();
});

test('device import ignores extra drops while reading and cancels without a late preview', async ({
	page,
	context
}) => {
	await context.addInitScript(() => {
		const read = File.prototype.arrayBuffer;
		File.prototype.arrayBuffer = async function () {
			if (this.name === 'held.zip')
				await new Promise<void>((resolve) => {
					(window as unknown as { releaseImportRead: () => void }).releaseImportRead = resolve;
				});
			return read.call(this);
		};
	});
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true }),
		drop = dialog.getByRole('region', { name: 'Character ZIP drop area', exact: true });
	const transfer = await page.evaluateHandle(() => {
		const data = new DataTransfer();
		data.items.add(new File(['invalid'], 'held.zip', { type: 'application/zip' }));
		return data;
	});
	// Outside the drop surface, files cannot navigate the page or start an import.
	await expect(drop).toBeVisible();
	expect(
		await page.evaluate(
			(data) =>
				document.body.dispatchEvent(
					new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })
				),
			transfer
		)
	).toBe(false);
	await expect(drop).toContainText('Drop a character ZIP here');
	await drop.dispatchEvent('drop', { dataTransfer: transfer });
	await expect(drop).toContainText('Reading your ZIP…');
	const second = await page.evaluateHandle(() => {
		const data = new DataTransfer();
		data.items.add(new File(['invalid'], 'extra.png', { type: 'image/png' }));
		return data;
	});
	await drop.dispatchEvent('drop', { dataTransfer: second });
	await expect(drop).toContainText('Reading your ZIP…');
	await expect(dialog.getByRole('alert')).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await page.evaluate(() =>
		(window as unknown as { releaseImportRead: () => void }).releaseImportRead()
	);
	expect(
		await page.evaluate(
			(data) =>
				document.body.dispatchEvent(
					new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })
				),
			transfer
		)
	).toBe(true);
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	await expect(drop).toContainText('Drop a character ZIP here');
	await expect(dialog.getByRole('alert')).toHaveCount(0);
	await transfer.dispose();
	await second.dispose();
});

test('device import includes sibling moves and preserves explicit selections when changing standing poses', async ({
	page
}) => {
	const bytes = await multiStateImportZip();
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await dialog.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'multi-state.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await expect(dialog.locator('.import-preview')).toContainText('2 moves');
	const moves = dialog.getByRole('group', { name: 'Moves to import', exact: true }),
		base = moves.getByRole('checkbox', { name: /^Base appearance/ }),
		punch = moves.getByRole('checkbox', { name: /^Punch appearance/ });
	const states = dialog.getByRole('group', { name: 'Also import as States', exact: true });
	const punchState = states.getByRole('checkbox', { name: 'Punch appearance', exact: true });
	await expect(punchState).toBeChecked();
	await expect(
		states.getByRole('checkbox', { name: 'Still appearance', exact: true })
	).toBeChecked();
	await expect(dialog.locator('.import-preview')).toContainText('3 states · 2 moves');
	await punchState.uncheck();
	await expect(dialog.locator('.import-preview')).toContainText('2 states · 2 moves');
	await expect(moves).toContainText('Moves keep the appearance of their source state.');
	await expect(base).toBeChecked();
	await expect(base).toBeEnabled();
	await expect(punch).toBeChecked();
	await dialog.getByLabel('Character name', { exact: true }).fill('Keep my character name');
	await punch.uncheck();
	await expect(dialog.locator('.import-preview')).toContainText('1 move');
	await expect(dialog.getByLabel('Character name', { exact: true })).toHaveValue(
		'Keep my character name'
	);
	await punch.check();
	await expect(dialog.locator('.import-preview')).toContainText('2 moves');
	await dialog
		.getByRole('combobox', { name: 'Standing pose state', exact: true })
		.selectOption('punch-state');
	await expect(base).toBeEnabled();
	await expect(base).toBeChecked();
	await expect(punch).toBeEnabled();
	await expect(dialog.getByLabel('Character name', { exact: true })).toHaveValue(
		'Keep my character name'
	);
	await base.uncheck();
	await expect(dialog.locator('.import-preview')).toContainText('1 move');
	await dialog
		.getByRole('combobox', { name: 'Standing pose state', exact: true })
		.selectOption('still-state');
	await expect(punchState).not.toBeChecked();
	await expect(
		states.getByRole('checkbox', { name: 'Base appearance', exact: true })
	).toBeChecked();
	await expect(base).not.toBeChecked();
	await expect(punch).toBeChecked();
	await expect(punch).toBeEnabled();
	await expect(dialog.locator('.import-preview')).toContainText('1 move');
	await dialog
		.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true })
		.uncheck();
	await dialog.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect((await openPlaybackPicker(page)).getByRole('menuitemradio')).toHaveText([
		'Standing',
		'Base appearance',
		'Right punch'
	]);
	await page.keyboard.press('Escape');
	await reloadStudio(page);
	await expect((await openPlaybackPicker(page)).getByRole('menuitemradio')).toHaveText([
		'Standing',
		'Base appearance',
		'Right punch'
	]);
	await page.keyboard.press('Escape');
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'More actions for Right punch', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Create State from...', exact: true }).click();
	const capture = page.getByRole('dialog', { name: 'Create State', exact: true });
	await expect(
		capture.getByRole('button', { name: 'Source: Right punch', exact: true })
	).toBeVisible();
	// One facing: a still preview with no play control.
	await expect(capture.getByRole('img', { name: /^Right punch, facing / })).toBeVisible();
	await expect(capture.getByRole('button', { name: /^(Pause|Play)$/ })).toHaveCount(0);
});

test('character directions can be mirrored and unlinked on import and after saving', async ({
	page
}) => {
	const directions = [
		'south',
		'south-east',
		'east',
		'north-east',
		'north',
		'north-west',
		'south-west'
	];
	const rotations = await Promise.all(
		directions.map(async (direction, index) => {
			const sprite = makeImg(48, 48);
			sprite.data.set([180, 100, 80, 255], (30 * 48 + 16 + index) * 4);
			return { name: `rotations/${direction}.png`, data: await encodePngBytes(sprite) };
		})
	);
	const archive = await zip([
		{
			name: 'metadata.json',
			data: new TextEncoder().encode(JSON.stringify({ name: 'Direction test hero' }))
		},
		...rotations
	]);
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const importer = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await importer.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'directions.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(archive)
	});
	await importer.getByText('Directions', { exact: true }).click();
	const presets = importer.getByRole('group', { name: 'Direction presets' });
	await expect(presets.getByRole('button', { name: 'Unique 8' })).toBeDisabled();
	await presets.getByRole('button', { name: 'Top-down 4' }).click();
	await expect(importer.locator('.import-preview')).toContainText('4 directions');
	await presets.getByRole('button', { name: 'Top-down 8' }).click();
	await expect(importer.locator('.import-preview')).toContainText('8 directions');
	await expect(importer.getByText(/This import replaces the original artwork/)).toContainText(
		'North west'
	);
	const options = importer.getByRole('group', { name: 'Directions to import' });
	const westDirection = options.getByRole('button', { name: 'West direction', exact: true });
	const westMirror = options.getByRole('button', { name: 'Mirror West from East', exact: true });
	await westMirror.click();
	await expect(westDirection).toHaveAttribute('aria-pressed', 'true');
	await expect(westMirror).toHaveAttribute('aria-pressed', 'false');
	await westMirror.click();
	await expect(westMirror).toHaveAttribute('aria-pressed', 'true');
	await expect(westDirection).toHaveAttribute('aria-pressed', 'true');
	await westDirection.click();
	await expect(westDirection).toHaveAttribute('aria-pressed', 'false');
	await westDirection.focus();
	await westDirection.press('Space');
	await expect(westMirror).toHaveAttribute('aria-pressed', 'true');
	await expect(importer.getByRole('combobox', { name: 'Preview direction' })).toHaveValue('west');
	await options.getByRole('button', { name: 'South direction', exact: true }).click();
	await expect(importer.locator('.import-preview')).toContainText('7 directions');
	await options
		.getByRole('button', { name: 'Mirror South west from South east', exact: true })
		.click();
	await options
		.getByRole('button', { name: 'Mirror South east from South west', exact: true })
		.click();
	await expect(importer.locator('.import-preview')).toContainText('7 directions');
	await importer
		.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' })
		.uncheck();
	await importer.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(importer).toBeHidden();
	const openDirections = async () => {
		await page.locator('.project-btn').click();
		await page
			.getByRole('button', { name: 'More actions for Direction test hero', exact: true })
			.click();
		const menu = page.getByRole('menu', { name: 'Actions for Direction test hero', exact: true });
		await expect(menu.getByRole('menuitem')).toHaveText([
			'Details...',
			'Rename...',
			'Directions...',
			'Adjust frame...',
			'Download ZIP',
			'Delete character...'
		]);
		await menu.getByRole('menuitem', { name: 'Directions...', exact: true }).click();
	};
	await openDirections();
	const settings = page.getByRole('dialog', { name: 'Directions', exact: true });
	const kept = settings.getByRole('group', { name: 'Directions to keep' });
	const west = kept.getByRole('button', { name: 'West direction · Mirrors East', exact: true });
	const east = kept.getByRole('button', { name: 'East direction', exact: true });
	const northWest = kept.getByRole('button', {
		name: 'North west direction · Mirrors North east',
		exact: true
	});
	const southEast = kept.getByRole('button', {
		name: 'South east direction · Mirrors South west',
		exact: true
	});
	const savedWestMirror = kept.getByRole('button', {
		name: 'Mirror West from East',
		exact: true
	});
	await expect(northWest).toHaveAttribute('aria-pressed', 'true');
	await expect(southEast).toHaveAttribute('aria-pressed', 'true');
	await expect(west).toHaveAttribute('aria-pressed', 'true');
	const review = settings.getByRole('button', { name: 'Review removal' });
	await east.click();
	await expect(settings.getByRole('status')).toContainText('Keep East');
	await expect(review).toBeDisabled();
	await east.click();
	await savedWestMirror.click();
	await expect(kept.getByRole('button', { name: 'West direction', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await settings.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(settings).toBeHidden();
	await reloadStudio(page);
	await openDirections();
	await expect(savedWestMirror).toHaveAttribute('aria-pressed', 'false');
	await savedWestMirror.click();
	await settings.getByRole('button', { name: 'Review changes' }).click();
	const replacement = page.getByRole('alertdialog', { name: 'Change directions?', exact: true });
	await expect(replacement).toContainText('replaces the artwork for West');
	await replacement.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(settings).toBeHidden();
	await reloadStudio(page);
	await openDirections();
	await expect(west).toHaveAttribute('aria-pressed', 'true');
	await northWest.click();
	await southEast.click();
	await review.click();
	const confirmation = page.getByRole('alertdialog', { name: 'Remove 2 directions?', exact: true });
	await expect(confirmation).toContainText('North west');
	await expect(confirmation).toContainText('South east');
	await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(settings).toBeVisible();
	await review.click();
	await confirmation.getByRole('button', { name: 'Remove permanently' }).click();
	await expect(settings).toBeHidden();
	await reloadStudio(page);
	await openDirections();
	await expect(northWest).toHaveCount(0);
	await expect(southEast).toHaveCount(0);
	await expect(
		kept.getByRole('button', { name: 'North west direction', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	await expect(
		kept.getByRole('button', { name: 'South east direction', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	await expect(west).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');
	await expect(settings).toBeHidden();
	// Adjust frame: move the mirrored character and resize its frame for free, saved across a reload and undone from its
	// notice.
	const openFrame = async () => {
		await page.locator('.project-btn').click();
		await page
			.getByRole('button', { name: 'More actions for Direction test hero', exact: true })
			.click();
		await page
			.getByRole('menu', { name: 'Actions for Direction test hero', exact: true })
			.getByRole('menuitem', { name: 'Adjust frame...', exact: true })
			.click();
		return page.getByRole('dialog', { name: 'Adjust frame', exact: true });
	};
	// Saves made before export ids existed have none; loading fills a default, and saving must not read that as a change.
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('pixeldoll');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const db = r.result,
						store = db.transaction('projects', 'readwrite').objectStore('projects'),
						all = store.getAll();
					all.onsuccess = () => {
						const rec = all.result.find((p) => p?.manifest?.name === 'Direction test hero');
						if (!rec) return reject(new Error('Direction test hero not stored'));
						delete rec.manifest.exportId;
						store.put(rec, rec.id).onsuccess = () => {
							db.close();
							resolve();
						};
					};
				};
			})
	);
	await reloadStudio(page);
	let frame = await openFrame();
	const size = frame.getByRole('spinbutton', { name: 'Frame size', exact: true });
	const position = frame.getByRole('slider', { name: 'Character in its frame', exact: true });
	await expect(size).toHaveValue('64');
	await expect(position).toHaveAttribute('aria-valuetext', 'Not moved');
	const save = frame.getByRole('button', { name: 'Save', exact: true });
	await expect(save).toBeDisabled();
	await frame.getByRole('button', { name: 'Make room', exact: true }).click();
	await expect(frame.getByRole('status')).toContainText(
		'This character already has room for moves.'
	);
	await frame.getByRole('button', { name: 'Up', exact: true }).click();
	await frame.getByRole('button', { name: 'Up', exact: true }).click();
	await expect(position).toHaveAttribute('aria-valuetext', 'Moved up 2 px');
	await position.focus();
	await page.keyboard.press('Shift+ArrowUp');
	await page.keyboard.press('ArrowDown');
	await expect(position).toHaveAttribute('aria-valuetext', 'Moved up 5 px');
	await size.fill('81');
	await expect(save).toBeDisabled();
	// A typed size far past the limit is refused in text and never drawn (drawing it would freeze the page).
	await size.fill('100000');
	await expect(save).toBeDisabled();
	await expect(frame).toContainText('Frame must be');
	await size.fill('80');
	await expect(frame).toContainText('Items copy exactly only between characters');
	await save.click();
	await expect(frame).toBeHidden();
	const notice = page.locator('.toast');
	await expect(notice).toContainText('Frame adjusted');
	await expect(notice).toContainText('Moved up 5 px');
	await reloadStudio(page);
	frame = await openFrame();
	await expect(size).toHaveValue('80');
	await size.fill('64');
	await save.click();
	await expect(frame).toBeHidden();
	await notice.getByRole('button', { name: /Frame adjusted/ }).click();
	await expect(notice).toContainText('Frame change undone.');
	frame = await openFrame();
	await expect(size).toHaveValue('80');
});

test('browser Back respects an atomic import and closes sheets after it finishes', async ({
	page
}) => {
	const bytes = await multiStateImportZip();
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await dialog.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'multi-state.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await expect(dialog.locator('.import-preview')).toContainText('2 moves');
	await dialog
		.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true })
		.uncheck();
	// Pause the real content-hash work that opening the saved copy performs, without mocking the sheet's busy state.
	await page.evaluate(() => {
		const subtle = crypto.subtle,
			original = subtle.digest;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		Object.defineProperty(subtle, 'digest', {
			configurable: true,
			value: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
				await gate;
				return original.call(subtle, algorithm, data);
			}
		});
		(window as unknown as { releaseImport: () => void }).releaseImport = () => {
			Object.defineProperty(subtle, 'digest', { configurable: true, value: original });
			release();
		};
	});
	try {
		await dialog.getByRole('button', { name: 'Import character', exact: true }).click();
		await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
		await page.goBack();
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
	} finally {
		await page.evaluate(() => (window as unknown as { releaseImport: () => void }).releaseImport());
	}
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	await expect(dialog).toBeVisible();
	await page.goBack();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('standing state updates retain the preview, optional moves, edited names and dialog geometry', async ({
	page
}) => {
	const bytes = await multiStateImportZip();
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true }),
		name = dialog.getByLabel('Character name', { exact: true });
	await dialog.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'multi-state.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await expect(dialog.locator('.import-preview')).toContainText('2 moves');
	await name.fill(''); // An intentionally cleared name must not be overwritten during updates.
	await page.evaluate(() => {
		const control = window as unknown as {
			holdImportDigest: boolean;
			releaseImportDigest: () => void;
		};
		const digest = crypto.subtle.digest.bind(crypto.subtle);
		crypto.subtle.digest = async (...args: Parameters<SubtleCrypto['digest']>) => {
			if (control.holdImportDigest) {
				control.holdImportDigest = false;
				await new Promise<void>((resolve) => {
					control.releaseImportDigest = resolve;
				});
			}
			return digest(...args);
		};
	});
	for (const [index, size] of [
		{ width: 1440, height: 900 },
		{ width: 390, height: 844 },
		{ width: 844, height: 390 }
	].entries()) {
		await page.setViewportSize(size);
		// The resize event, and the sheet placement it selects, arrive at the next rendering step, not before this returns.
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		);
		const bounds = await dialog.boundingBox();
		await page.evaluate(() => {
			(window as unknown as { holdImportDigest: boolean }).holdImportDigest = true;
		});
		await dialog
			.getByRole('combobox', { name: 'Standing pose state', exact: true })
			.selectOption(index % 2 ? ID : 'punch-state');
		try {
			await expect(dialog.getByRole('status')).toContainText('Updating preview');
			await expect(dialog.getByRole('img', { name: 'Character import preview' })).toBeVisible();
			await expect(dialog.getByRole('region', { name: 'Character ZIP drop area' })).toHaveCount(0);
			await expect(dialog.locator('.sheet-foot').getByRole('button')).toBeDisabled();
			expect(await dialog.boundingBox()).toEqual(bounds);
		} finally {
			await page.evaluate(() =>
				(window as unknown as { releaseImportDigest: () => void }).releaseImportDigest()
			);
		}
		await expect(dialog.getByRole('status')).toHaveCount(0);
		expect(await dialog.boundingBox()).toEqual(bounds);
		await expect(name).toHaveValue('');
	}
	for (const checkbox of await dialog
		.getByRole('group', { name: 'Moves to import' })
		.getByRole('checkbox')
		.all())
		await checkbox.uncheck();
	for (const checkbox of await dialog
		.getByRole('group', { name: 'Also import as States' })
		.getByRole('checkbox')
		.all())
		await checkbox.uncheck();
	await expect(dialog.locator('.import-preview')).toContainText('0 moves');
	await name.fill('Static rotations only');
	await dialog
		.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true })
		.uncheck();
	await dialog.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect((await openPlaybackPicker(page)).getByRole('menuitemradio')).toHaveText([
		'Standing'
	]);
});

test('failed standing state updates retain the old preview but block saving until recovery', async ({
	page
}) => {
	const bytes = await multiStateImportZip(true);
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await dialog.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'incompatible.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await expect(dialog.getByRole('alert')).toBeVisible();
	await dialog
		.getByRole('group', { name: 'Moves to import' })
		.getByRole('checkbox', { name: /^Punch appearance/ })
		.uncheck();
	await expect(dialog.locator('.import-preview')).toContainText('1 move');
	await dialog.getByLabel('Character name', { exact: true }).fill('Preserved through failure');
	const bounds = await dialog.boundingBox();
	const state = dialog.getByRole('combobox', { name: 'Standing pose state', exact: true });
	await state.selectOption('punch-state');
	await expect(dialog.getByRole('alert')).toContainText('different character size or camera view');
	await expect(dialog.getByRole('img', { name: 'Character import preview' })).toBeVisible();
	await expect(dialog.getByRole('region', { name: 'Character ZIP drop area' })).toHaveCount(0);
	await expect(
		dialog.getByRole('button', { name: 'Import character', exact: true })
	).toBeDisabled();
	expect(await dialog.boundingBox()).toEqual(bounds);
	await state.selectOption(ID);
	await expect(dialog.getByRole('alert')).toHaveCount(0);
	await expect(dialog.getByLabel('Character name', { exact: true })).toHaveValue(
		'Preserved through failure'
	);
	await expect(dialog.getByRole('button', { name: 'Import character', exact: true })).toBeEnabled();
});

test('a single-state import can exclude its own animation and retain static Default views', async ({
	page
}) => {
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await dialog.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'single-state.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(await multiStateImportZip(false, false, true))
	});
	await expect(dialog.locator('.import-preview')).toContainText('1 move');
	await expect(
		dialog.getByRole('combobox', { name: 'Standing pose state', exact: true })
	).toHaveCount(0);
	const move = dialog.getByRole('group', { name: 'Moves to import' }).getByRole('checkbox');
	await expect(move).toBeEnabled();
	await move.uncheck();
	await expect(dialog.locator('.import-preview')).toContainText('0 moves');
	await expect(dialog.getByRole('img', { name: 'Character import preview' })).toBeVisible();
	await expect(move).not.toBeChecked();
	await expect(dialog.getByRole('button', { name: 'Import character', exact: true })).toBeEnabled();
});

test('an incompatible sibling move can be unchecked after the initial import error', async ({
	page
}) => {
	const bytes = await multiStateImportZip(true);
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await dialog.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'incompatible-state.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await expect(dialog.getByRole('alert')).toContainText('Uncheck that state to continue');
	const incompatible = dialog
		.getByRole('group', { name: 'Also import as States' })
		.getByRole('checkbox', { name: 'Punch appearance', exact: true });
	await expect(incompatible).not.toBeChecked();
	await expect(incompatible).toBeDisabled();
	await expect(incompatible).toHaveAccessibleDescription(/Import it as a separate character/);
	await expect(
		dialog.getByRole('button', { name: 'Import character', exact: true })
	).toBeDisabled();
	await dialog
		.getByRole('group', { name: 'Moves to import' })
		.getByRole('checkbox', { name: /^Punch appearance/ })
		.uncheck();
	await expect(dialog.getByRole('alert')).toHaveCount(0);
	await expect(dialog.locator('.import-preview')).toContainText('1 move');
	await expect(dialog.getByRole('button', { name: 'Import character', exact: true })).toBeEnabled();
});

test('unreadable sibling move metadata stays visible and can be excluded from the import', async ({
	page
}) => {
	const bytes = await multiStateImportZip(false, true);
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await dialog.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'unreadable-state.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await expect(dialog.getByRole('alert')).toContainText('invalid animation list');
	await expect(
		dialog.getByRole('button', { name: 'Import character', exact: true })
	).toBeDisabled();
	const unreadable = dialog.getByRole('checkbox', {
		name: 'Punch appearance · unreadable moves',
		exact: true
	});
	await expect(unreadable).toBeChecked();
	await unreadable.uncheck();
	await expect(dialog.getByRole('alert')).toHaveCount(0);
	await expect(dialog.locator('.import-preview')).toContainText('1 move');
	await expect(unreadable).not.toBeChecked();
	await expect(dialog.getByRole('button', { name: 'Import character', exact: true })).toBeEnabled();
});

test('PixelLab link import initially selects all compatible states and sibling moves', async ({
	page,
	context
}) => {
	const bytes = await multiStateImportZip(),
		requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		requests.push(route.request().method());
		return route.fulfill({ contentType: 'application/zip', body: Buffer.from(bytes) });
	});
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from PixelLab...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from PixelLab', exact: true });
	await dialog.getByLabel('Direct import (connection optional)', { exact: true }).fill(ID);
	await dialog.getByRole('button', { name: 'Preview character', exact: true }).click();
	await expect(dialog.locator('.import-preview')).toContainText('2 moves');
	const punch = dialog
		.getByRole('group', { name: 'Moves to import' })
		.getByRole('checkbox', { name: /^Punch appearance/ });
	const punchState = dialog
		.getByRole('group', { name: 'Also import as States' })
		.getByRole('checkbox', { name: 'Punch appearance', exact: true });
	await expect(punch).toBeChecked();
	await expect(punchState).toBeChecked();
	await punch.uncheck();
	await expect(dialog.locator('.import-preview')).toContainText('1 move');
	await expect(punchState).toBeChecked();
	expect(requests).toEqual(['GET']);
});

test('a canceled library error cannot affect a newly opened device ZIP preview', async ({
	page,
	context
}) => {
	await context.addInitScript(() => {
		localStorage.setItem('pixellabApiKey', 'test-only-not-a-real-key');
	});
	let release!: () => void, loaded!: () => void;
	const held = new Promise<void>((resolve) => {
			release = resolve;
		}),
		requested = new Promise<void>((resolve) => {
			loaded = resolve;
		});
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith('/balance'))
			return route.fulfill({
				json: {
					credits: { type: 'usd', usd: 0 },
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 }
				}
			});
		if (path.endsWith('/characters')) {
			loaded();
			await held;
			return route.fulfill({ status: 503, body: 'Library temporarily unavailable' });
		}
		return route.abort();
	});
	const bytes = await multiStateImportZip();
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from PixelLab...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from PixelLab', exact: true });
	await requested;
	try {
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await page.locator('.project-btn').click();
		await page
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.click();
		await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
		await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({
			name: 'local.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(bytes)
		});
		await expect(page.locator('.import-preview')).toContainText('2 moves');
	} finally {
		release();
	}
	const device = page.getByRole('dialog', { name: 'Import from device', exact: true });
	await expect(device.getByRole('alert')).toHaveCount(0);
	await expect(device.locator('.import-preview')).toContainText('2 moves');
	await device.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from PixelLab...', exact: true }).click();
	await expect(page.getByRole('dialog').getByRole('alert')).toContainText('503');
	await expect(page.getByRole('dialog')).not.toContainText('No characters found');
});

test('import can be canceled before choosing a file and reopened', async ({ page }, info) => {
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	for (const close of ['Cancel', 'Escape']) {
		await page.locator('.project-btn').click();
		await page
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.click();
		await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		if (close === 'Cancel') await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		else await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(page.locator('.project-btn')).toBeFocused();
	}
});

test('suspicious imported walking joints plan a priced frozen-frame alternative before any API request', async ({
	page,
	context
}, info) => {
	await page.addInitScript(() => localStorage.setItem('pixeldoll.developerMode', '1'));
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		requests.push(route.request().method());
		return route.abort();
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const planned = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			posesPath = '/src/lib/rig/poses.ts';
		const s = await import(statePath),
			db = await import(dbPath),
			{ LABELS } = await import(posesPath);
		await s.copyDemo();
		const rec = await db.get('projects', s.doc.id),
			rig = rec.manifest.rig;
		const points = LABELS.map((label: string) => {
			const side = label.startsWith('LEFT') ? -1 : label.startsWith('RIGHT') ? 1 : 0;
			const name = label.replace(/^(LEFT|RIGHT) /, '');
			const [spread, y] = (
				{
					NOSE: [0, 0.2],
					NECK: [0, 0.35],
					SHOULDER: [0.15, 0.35],
					ELBOW: [0.2, 0.5],
					ARM: [0.22, 0.65],
					HIP: [0.1, 0.62],
					KNEE: [0.11, 0.77],
					LEG: [0.12, 0.93],
					EYE: [0.06, 0.17],
					EAR: [0.12, 0.19]
				} as Record<string, number[]>
			)[name];
			return { label, x: 0.5 + side * spread, y };
		});
		const broken = points.map((p: { label: string; x: number; y: number }) =>
			/SHOULDER|HIP/.test(p.label)
				? { ...p, x: 1 - p.x }
				: p.label === 'LEFT EAR'
					? { ...p, x: 0.62 }
					: p
		);
		const base = rec.manifest.items.find((i: { slot: string }) => i.slot === 'body').layers[0];
		rig.rest = {};
		for (const d of rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf)) {
			rig.rest[d.id] = { image: base.cells.walk[d.id][0], keypoints: points };
			for (const a of rig.animations) {
				a.sources ??= {};
				a.sources[d.id] = {
					route: 'import',
					reference: rig.rest[d.id].image,
					keypoints: Array.from({ length: a.cells }, (_, i) =>
						a.id === 'walk' && d.id === 'south' && i === 0 ? broken : points
					),
					provenance: []
				};
			}
		}
		rec.character = { id: 'synthetic-imported-pose', looks: 'Synthetic pose fixture' };
		const vest = rec.manifest.items.find((i: { id: string }) => i.id === 'vest_leather');
		vest.route = 'skeleton-pose';
		vest.key = 'green';
		vest.dressed = Object.fromEntries(
			Object.entries(rig.rest).map(([dir, rest]) => [dir, (rest as { image: string }).image])
		);
		for (const layer of vest.layers) delete layer.cells.walk.south;
		await db.put('projects', s.doc.id, rec);
		s.store.project = { ...s.store.project, manifest: rec.manifest };
		const plansPath = '/src/studio/apiPlans.ts',
			{ itemPlan, movePlan } = await import(plansPath);
		const createPath = '/src/studio/create.ts',
			{ missingItemMoves, itemMoveOffer } = await import(createPath);
		const calls = itemPlan(
			{ rec, project: s.store.project },
			{ name: 'Coat', slot: 'torso_inner', prompt: 'long coat and boots' }
		);
		const move = missingItemMoves(rec.manifest, vest.id, 0).find(
			(spec: { id: string }) => spec.id === 'walk'
		);
		const offer = itemMoveOffer(rec.manifest, [move]),
			extension = movePlan(rec, offer.specs[0]);
		return {
			gens: calls.reduce((n: number, c: { generations?: number }) => n + (c.generations ?? 0), 0),
			posts: calls
				.filter((c: { method: string }) => c.method === 'POST')
				.map((c: { path: string }) => c.path),
			extensionGens: offer.gens,
			extension: extension.filter((c: { method: string }) => c.method === 'POST')
		};
	});
	await newItem(page, 'Body');
	const sheet = page.getByRole('dialog', { name: 'New item', exact: true });
	await sheet.locator('textarea').fill('long coat and boots');
	expect(planned.posts).toEqual(['/edit-animation-v2']);
	expect(planned.gens).toBe(10);
	await expect(sheet.getByRole('alert')).toHaveCount(0);
	await expect(
		sheet.getByRole('button', { name: `Make · Est. ${planned.gens} gens`, exact: true })
	).toBeEnabled();
	await sheet.getByRole('button', { name: 'Inspect API calls', exact: true }).click();
	const api = page.getByRole('dialog', { name: 'API calls', exact: true });
	await expect(api.locator('.peek-call')).toHaveCount(1);
	await expect(api.locator('.peek-call')).toContainText('/edit-animation-v2');
	await expect(api).not.toContainText('/inpaint-v3');
	await expect(api).not.toContainText('/animate-with-skeleton-v3');
	await api.getByRole('button', { name: 'Close API calls', exact: true }).click();
	await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();

	expect(planned.extensionGens).toBe(10);
	expect(planned.extension).toHaveLength(1);
	expect(planned.extension[0]).toMatchObject({ path: '/inpaint-v3', generations: 10 });
	await pickItem(page, 'Leather vest');
	const pane = await selectedItemDetails(page);
	await expect(pane.getByRole('button', { name: /^Make for Walk/ })).toContainText('Est. 10 gens');
	await pane.getByRole('button', { name: 'Inspect API calls', exact: true }).click();
	const frozen = api.locator('.peek-call').filter({ hasText: planned.extension[0].label });
	await expect(frozen).toHaveCount(1);
	await expect(frozen).toContainText('/inpaint-v3');
	await expect(frozen.locator('.call-price')).toHaveText('~10 gens');
	await frozen.locator('summary').click();
	await expect(frozen).toContainText('suspicious imported joints');
	await expect(frozen).toContainText('frozen body frames');
	expect(requests).toEqual([]);
});

test('saved garment issues wait for explicit acceptance, preserve their notes and never submit a retry', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		requests.push(route.request().method());
		return route.abort();
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const garmentName = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts';
		const s = await import(statePath),
			db = await import(dbPath);
		await s.copyDemo();
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((i: { slot: string }) => i.slot === 'torso_inner');
		item.qa = {
			minKeyKept: 1,
			maxKeyOutside: 0,
			minAreaRatio: 1,
			maxAreaCV: 0,
			maxPaletteDist: 0,
			clipPx: 0,
			status: 'warn',
			rerolls: 0,
			cells: {},
			clips: {},
			missingLowerFrames: 2,
			footwearReviewFrames: 1,
			waistReviewFrames: 1,
			facingReviewFrames: 1
		};
		await db.put('projects', s.doc.id, rec);
		return item.name;
	});
	await reloadStudio(page);
	await pickItem(page, garmentName);
	const pane = await selectedItemDetails(page);
	await expect(pane.locator('.badge.look')).toContainText('Needs a look');
	await expect(
		pane.getByText('Some lower clothing is missing compared with the standing design', {
			exact: true
		})
	).toBeVisible();
	await expect(
		pane.getByText('Footwear differs from the standing design; inspect the feet', { exact: true })
	).toBeVisible();
	await expect(
		pane.getByText('The waist band differs from the standing design; inspect the clothing', {
			exact: true
		})
	).toBeVisible();
	await expect(
		pane.getByText('Some frames resemble the opposite view; inspect the torso', { exact: true })
	).toBeVisible();
	await expect(
		pane.getByText('PixelLab returned an unexpected image', { exact: true })
	).toHaveCount(0);
	await expect(pane).toContainText('No paid retry was started');
	const before = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((i: { id: string }) => i.id === s.ui.selected);
		return { id: item.id, projectId: s.doc.id, item };
	});
	await pane.getByRole('button', { name: 'Accept as is', exact: true }).click();
	await expect(pane.locator('.badge.accepted')).toHaveText('Accepted');
	await expect(pane.getByRole('button', { name: 'Accept as is', exact: true })).toHaveCount(0);
	await expect(
		pane.getByText('Some frames resemble the opposite view; inspect the torso', { exact: true })
	).toBeVisible();
	const after = await page.evaluate(async ({ id, projectId }) => {
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath),
			rec = await db.get('projects', projectId);
		return rec.manifest.items.find((i: { id: string }) => i.id === id);
	}, before);
	expect(after).toEqual({ ...before.item, qa: { ...before.item.qa, status: 'accepted' } });
	await reloadStudio(page);
	await pickItem(page, before.item.name);
	await selectedItemDetails(page);
	await expect(pane.locator('.badge.accepted')).toHaveText('Accepted');
	await expect(
		pane.getByText('Some lower clothing is missing compared with the standing design', {
			exact: true
		})
	).toBeVisible();
	expect(requests).toEqual([]);
});

test('a standing consistency stop cannot keep an item before its requested walking coverage exists', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		requests.push(route.request().method());
		return route.abort();
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await equipmentGroup(page, 'Body');
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		await s.copyDemo();
		const p = s.store.project,
			item = p.manifest.items.find((i: { slot: string }) => i.slot === 'torso_inner');
		const dirs = p.manifest.rig.directions
			.filter((d: { mirrorOf?: string }) => !d.mirrorOf)
			.map((d: { id: string }) => d.id);
		s.ui.playing = false;
		s.ui.anim = 'walk';
		const calls = [
			{
				kind: 'dress',
				cells: dirs.map((d: string) => `rest/${d}/0`),
				seed: 1,
				rerolls: 0,
				old: []
			},
			...dirs.map((d: string) => ({
				kind: 'pose',
				cells: Array.from({ length: 8 }, (_, i) => `walk/${d}/${i}`),
				seed: 2,
				rerolls: 0,
				old: []
			}))
		];
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: item.id,
					name: 'Unresolved standing design',
					slot: item.slot,
					prompt: 'white waistband',
					key: 'green',
					method: 'skel',
					anims: ['walk'],
					dirs
				},
				calls,
				keySwitched: false,
				log: []
			},
			input: { name: 'Unresolved standing design', slot: item.slot, prompt: 'white waistband' },
			phase: 'review',
			status: 'Standing design needs review'
		});
		s.store.results = {
			...s.store.results,
			[item.id]: {
				cells: [],
				qa: { qa: { status: 'warn' }, warnings: [], failCalls: new Map(), softCalls: new Map() },
				g1: new Map([
					[
						0,
						'D2 keyframe north: the requested wraparound waist band is missing compared with the other standing views'
					]
				]),
				preview: p
			}
		};
		await s.openGenerationReview(item.id);
	});
	const review = page.locator('.gen');
	await expect(review.locator('.badge.look')).toContainText('Needs a look');
	await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeDisabled();
	await expect(review.locator('.badge.clean')).toHaveCount(0);
	expect(requests).toEqual([]);
});

test('canceling a downloading import closes it and cannot reopen a late preview', async ({
	page,
	context
}, info) => {
	const im = makeImg(48, 48);
	im.data.set([180, 100, 80, 255], (30 * 48 + 24) * 4);
	const data = await zip([
		{
			name: 'metadata.json',
			data: new TextEncoder().encode(JSON.stringify({ name: 'Late preview' }))
		},
		{ name: 'rotations/south.png', data: await encodePngBytes(im) }
	]);
	let finish!: () => void;
	const held = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const calls: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		calls.push(route.request().method());
		await held;
		await route
			.fulfill({ contentType: 'application/zip', body: Buffer.from(data) })
			.catch(() => {});
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.project-btn')).toContainText('Adventurer');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from PixelLab...', exact: true }).click();
	await page.getByLabel('Direct import (connection optional)', { exact: true }).fill(ID);
	await page.getByRole('button', { name: 'Preview character', exact: true }).click();
	try {
		await expect(page.getByRole('dialog').getByRole('status')).toContainText(
			'Preparing your character'
		);
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	} finally {
		finish();
	}
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	await expect(page.getByRole('dialog')).not.toContainText('PixelLab could not find');
	await expect(page.getByRole('button', { name: 'Import character', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Adventurer');
	expect(calls).toEqual(['GET']);
});

test('device import roundtrip, duplicate copies, persistence and local deletion', async ({
	page,
	context
}) => {
	const requests: string[] = [],
		errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method());
		await route.abort();
	});
	await openStudio(page, '/');
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download ZIP/ }).click();
	const bytes = await readFile((await (await download).path())!);
	async function importCopy(name: string) {
		await page.locator('.project-btn').click();
		await page
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.click();
		await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
		await page
			.getByLabel('Character ZIP', { exact: true })
			.setInputFiles({ name: 'saved-character.zip', mimeType: 'application/zip', buffer: bytes });
		await expect(page.getByRole('img', { name: 'Character import preview' })).toBeVisible();
		await page.getByLabel('Character name', { exact: true }).fill(name);
		await page.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' }).uncheck();
		await page.getByRole('button', { name: 'Import character', exact: true }).click();
		// Saving then reopening a full character decodes every frame; parallel workers can stretch it past 10s.
		await expect(page.locator('.project-btn')).toContainText(name, { timeout: 30_000 });
	}
	await importCopy('Imported one');
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('Imported one');
	await importCopy('Imported two');
	await page.locator('.project-btn').click();
	const otherCharacter = page.getByRole('menuitemradio', { name: 'Imported one', exact: true });
	const currentCharacter = page.getByRole('menuitemradio', { name: 'Imported two', exact: true });
	await expect(otherCharacter).not.toBeChecked();
	await expect(currentCharacter).toBeChecked();
	await expect(currentCharacter).not.toHaveCSS(
		'background-color',
		await otherCharacter.evaluate((row) => getComputedStyle(row).backgroundColor)
	);
	await expect(currentCharacter.locator(':scope > svg')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'More actions for Imported two' })).toBeVisible();
	await page.getByRole('menuitem', { name: 'Delete character…', exact: true }).click();
	await expect(page.getByRole('alertdialog')).toContainText('Imported two');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Imported two');
	// All characters created by this test are disposable fixtures in an isolated browser context.
	for (const remaining of ['Imported one', 'Adventurer (demo)']) {
		await page.locator('.project-btn').click();
		await page.getByRole('menuitem', { name: 'Delete character…', exact: true }).click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Delete', exact: true })
			.click();
		await expect(page.locator('.project-btn')).toContainText(remaining.replace(/ \(demo\)$/, ''), {
			timeout: 30_000
		});
	}
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('Adventurer');
	await page.locator('.project-btn').click();
	// The demo keeps Delete in place, unavailable, and says why.
	const demoDelete = page.getByRole('menuitem', { name: 'Delete character…', exact: true });
	await expect(demoDelete).toHaveAttribute('aria-disabled', 'true');
	await expect(demoDelete).toHaveAccessibleDescription("Demo character can't be deleted");
	await demoDelete.click({ force: true });
	await expect(page.getByRole('alertdialog')).toHaveCount(0);
	await expect(page.getByRole('menuitemradio', { name: /^Imported/ })).toHaveCount(0);
	expect(errors).toEqual([]);
	expect(requests).toEqual([]);
});

test('PixelLab library connection, pagination and direct import use only free reads', async ({
	page,
	context
}) => {
	await page.addInitScript(() => localStorage.setItem('pixeldoll.developerMode', '1'));
	const im = makeImg(48, 48);
	for (let y = 12; y < 43; y++)
		for (let x = 18; x < 30; x++) im.data.set([180, 120, 80, 255], (y * 48 + x) * 4);
	const data = await zip([
		{
			name: 'metadata.json',
			data: new TextEncoder().encode(JSON.stringify({ name: 'Library hero' }))
		},
		{ name: 'rotations/south.png', data: await encodePngBytes(im) }
	]);
	const calls: string[] = [];
	let releaseNext!: () => void,
		requestedNext!: () => void,
		holdNext = true;
	const nextPage = new Promise<void>((resolve) => {
			releaseNext = resolve;
		}),
		nextRequested = new Promise<void>((resolve) => {
			requestedNext = resolve;
		});
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const req = route.request(),
			url = new URL(req.url());
		calls.push(`${req.method()} ${url.pathname}${url.search}`);
		if (req.method() !== 'GET') return route.abort();
		if (url.pathname.endsWith('/balance'))
			return route.fulfill({
				json: {
					credits: { type: 'usd', usd: 0 },
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 }
				}
			});
		if (url.pathname === '/v2/characters') {
			if (url.searchParams.get('offset') === '20' && holdNext) {
				holdNext = false;
				requestedNext();
				await nextPage;
			}
			return route.fulfill({
				json: {
					total: 21,
					characters:
						url.searchParams.get('offset') === '20'
							? [{ id: ID, name: 'Page two hero', directions: 1, animation_count: 0 }]
							: Array.from({ length: 20 }, (_, i) => ({
									id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
									name:
										i === 1
											? 'Library hero with a long red beard, silver helmet, embroidered plate armor and a broad double-bladed axe held across the body, standing with both feet visible and a readable silhouette'
											: i
												? `Library hero ${i + 1}`
												: 'Library hero',
									directions: 1,
									animation_count: 0
								}))
				}
			});
		}
		if (url.pathname.endsWith('/zip')) {
			expect(req.headers().authorization).toBeUndefined();
			return route.fulfill({ contentType: 'application/zip', body: Buffer.from(data) });
		}
		return route.abort();
	});
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from PixelLab...', exact: true }).click();
	await page.getByRole('button', { name: 'Connect PixelLab to browse your characters' }).click();
	await page
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('test-only-not-a-real-key');
	await page.getByRole('dialog').getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(page.getByRole('button', { name: /Library hero 1 direction ·/ })).toBeVisible();
	await expect(page.locator('.character-library .library-character')).toHaveCount(20);
	const dialog = page.getByRole('dialog', { name: 'Import from PixelLab', exact: true }),
		library = dialog.locator('.character-library');
	const direct = dialog.getByRole('textbox', {
			name: 'Direct import (connection optional)',
			exact: true
		}),
		preview = dialog.getByRole('button', { name: 'Preview character', exact: true });
	await expect(dialog).not.toContainText('Browse your account’s available characters');
	await expect(dialog).not.toContainText('An ID or shared creator link works');
	await expect(preview).toHaveText('Preview');
	await expect(direct).toHaveAttribute('placeholder', 'Paste a character ID or creator link');
	for (const size of [
		{ width: 1440, height: 900, tall: true, note: true },
		{ width: 605, height: 882, tall: true, note: false },
		{ width: 390, height: 844, tall: true, note: false },
		{ width: 320, height: 568, tall: false, note: false },
		{ width: 844, height: 390, tall: false, note: false }
	]) {
		await page.setViewportSize(size);
		await direct.scrollIntoViewIfNeeded();
		await expect(direct).toBeInViewport();
		await expect(preview).toBeInViewport();
		await expect(dialog.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport();
		const geometry = await dialog.evaluate((node) => {
			const field = node
					.querySelector<HTMLInputElement>('#import-character-id')!
					.getBoundingClientRect(),
				button = node
					.querySelector<HTMLButtonElement>('[aria-label="Preview character"]')!
					.getBoundingClientRect(),
				list = node.querySelector('.character-library')!.getBoundingClientRect(),
				modal = node.getBoundingClientRect();
			return {
				field: {
					left: field.left,
					right: field.right,
					top: field.top,
					bottom: field.bottom,
					width: field.width
				},
				button: { left: button.left, top: button.top, bottom: button.bottom },
				listHeight: list.height,
				modal: { left: modal.left, right: modal.right, top: modal.top, bottom: modal.bottom }
			};
		});
		expect(geometry.field.right).toBeLessThanOrEqual(geometry.button.left);
		expect(geometry.field.width).toBeGreaterThanOrEqual(80);
		expect(geometry.field.top).toBeLessThan(geometry.button.bottom);
		expect(geometry.button.top).toBeLessThan(geometry.field.bottom);
		expect(geometry.modal.left).toBeGreaterThanOrEqual(0);
		expect(geometry.modal.right).toBeLessThanOrEqual(size.width);
		expect(geometry.modal.top).toBeGreaterThanOrEqual(0);
		expect(geometry.modal.bottom).toBeLessThanOrEqual(size.height);
		if (size.tall) expect(geometry.listHeight).toBeGreaterThan(260);
		const note = dialog.getByText('Free · saves a new local copy', { exact: true });
		if (size.note) await expect(note).toBeVisible();
		else await expect(note).toBeHidden();
	}
	await page.setViewportSize({ width: 605, height: 882 });
	const positions = () =>
		dialog.evaluate((node) =>
			[
				node,
				...[
					'.character-library',
					'.direct-import',
					'[aria-label="Previous page"]',
					'[aria-label="Next page"]',
					'.sheet-foot'
				].map((selector) => node.querySelector(selector)!)
			].map((element) => {
				const box = element.getBoundingClientRect();
				return { x: box.x, y: box.y, width: box.width, height: box.height };
			})
		);
	const firstPagePositions = await positions();
	const stable = async () => {
		const current = await positions();
		for (const [index, box] of current.entries())
			for (const key of ['x', 'y', 'width', 'height'] as const)
				expect(box[key]).toBeCloseTo(firstPagePositions[index][key], 0);
	};
	await expect(page.getByText('1–20 of 21', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Next page', exact: true })).toHaveText('');
	await page.getByRole('button', { name: 'Next page', exact: true }).click();
	await nextRequested;
	try {
		await expect(library).toHaveAttribute('aria-busy', 'true');
		await expect(library.getByRole('status')).toHaveText('Loading characters…');
		await expect(library.locator('.library-character').first()).toBeDisabled();
		await stable();
	} finally {
		releaseNext();
	}
	await expect(page.getByRole('button', { name: /Page two hero/ })).toBeVisible();
	await expect(page.getByText('21–21 of 21', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
	await stable();
	await page.getByRole('button', { name: 'Previous page', exact: true }).click();
	await expect(page.getByText('1–20 of 21', { exact: true })).toBeVisible();
	await stable();
	await page.getByRole('button', { name: 'Next page', exact: true }).click();
	await page.getByRole('button', { name: /Page two hero/ }).click();
	await expect(page.getByRole('img', { name: 'Character import preview' })).toBeVisible();
	await dialog.getByRole('button', { name: 'Choose another character', exact: true }).click();
	await dialog
		.locator('.sheet-head')
		.getByRole('button', { name: 'Inspect API calls', exact: true })
		.click();
	await page
		.locator('.api-peek:popover-open')
		.getByRole('button', { name: 'Preview Page two hero', exact: true })
		.click();
	await expect(page.locator('.peek-call')).toContainText(`/characters/${ID}/zip`);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: /Page two hero/ }).click();
	await expect(page.getByRole('img', { name: 'Character import preview' })).toBeVisible();
	await page.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)' }).uncheck();
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Library hero');
	await expect(page.locator('.world-loading')).toBeHidden();
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Delete character…', exact: true }).click();
	// Queue state is persisted by the real application, and deletion must refuse in-flight paid work.
	await page.evaluate(async () => {
		await new Promise<void>((resolve, reject) => {
			const r = indexedDB.open('pixeldoll');
			r.onerror = () => reject(r.error);
			r.onsuccess = () => {
				const db = r.result,
					t = db.transaction('projects', 'readwrite');
				t.objectStore('projects').put(
					{
						id: 'studio-create:rig-fixture',
						spec: { name: 'Pending fixture', projectId: 'rig-fixture', directions: [] },
						status: 'running',
						requestText: 5
					},
					'studio-create:rig-fixture'
				);
				t.oncomplete = () => {
					db.close();
					resolve();
				};
			};
		});
	});
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('pending generation work');
	expect(calls.every((c) => c.startsWith('GET '))).toBe(true);
	expect(calls).toContain(`GET /v2/characters/${ID}/zip`);
});

test('imported artwork gets the shared rig, weapon plan and new-move pipeline', async ({
	page,
	context
}) => {
	page.setDefaultTimeout(10_000);
	const im = makeImg(64, 64);
	for (let y = 10; y < 60; y++)
		for (let x = 25; x < 38; x++) im.data.set([180, 100, 90, 255], (y * 64 + x) * 4);
	const image = await encodePngBytes(im),
		base64 = Buffer.from(image).toString('base64');
	const data = await zip([
		{
			name: 'metadata.json',
			data: new TextEncoder().encode(
				JSON.stringify({
					name: 'Rig parity fixture',
					prompt: 'red hair, blue coat and boots',
					view: 'side'
				})
			)
		},
		...['south', 'east', 'north', 'west'].map((d) => ({ name: `rotations/${d}.png`, data: image }))
	]);
	const keypoints = LABELS.map((label, i) => ({
		label,
		x: (25 + (i % 4)) / 64,
		y: (12 + Math.floor(i / 4) * 8) / 64
	}));
	const jobs = new Map<string, number>(),
		posts: { path: string; body: Record<string, unknown> }[] = [],
		errors: string[] = [];
	let stateImages: { type: 'base64'; base64: string }[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const req = route.request(),
			path = new URL(req.url()).pathname;
		if (path.endsWith('/balance'))
			return route.fulfill({
				json: {
					credits: { type: 'usd', usd: 0 },
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 }
				}
			});
		if (path.endsWith('/characters/managed-parity-fixture')) return route.fulfill({ status: 404 });
		if (path.endsWith('/background-jobs/generated-state'))
			return route.fulfill({
				json: {
					id: 'generated-state',
					status: 'completed',
					created_at: '',
					usage: { type: 'generations', generations: 10 },
					last_response: { images: stateImages }
				}
			});
		if (req.method() === 'POST') {
			const body = req.postDataJSON() as Record<string, unknown>;
			posts.push({ path, body });
			if (path.endsWith('/enhance-animation-v3-prompt'))
				return route.fulfill({
					json: {
						usage: { type: 'generations', generations: 0.05 },
						enhanced_prompt: 'Lift both open hands to shoulder height, palms forward'
					}
				});
			if (path.endsWith('/edit-images-v2')) {
				// Like PixelLab's measured drift: the edited character comes back 3 px higher in its cell.
				stateImages = await Promise.all(
					(body.edit_images as { image: { type: 'base64'; base64: string } }[]).map(
						async ({ image }) => {
							const source = await decodePngBytes(Buffer.from(image.base64, 'base64'));
							const raised = makeImg(source.w, source.h);
							raised.data.set(source.data.subarray(3 * source.w * 4));
							return {
								type: 'base64' as const,
								base64: Buffer.from(await encodePngBytes(raised)).toString('base64')
							};
						}
					)
				);
				return route.fulfill({ status: 202, json: { background_job_id: 'generated-state' } });
			}
			if (path.endsWith('/estimate-skeleton'))
				return route.fulfill({
					json: { keypoints, usage: { type: 'generations', generations: 0.1 } }
				});
			if (path.endsWith('/create-character-v3'))
				return route.fulfill({
					json: {
						character_id: 'managed-parity-fixture',
						usage: { type: 'generations', generations: 0.25 }
					}
				});
			if (path.endsWith('/animate-with-skeleton-v3')) {
				const id = `pose-${jobs.size}`;
				jobs.set(id, (body.keypoints as unknown[]).length);
				return route.fulfill({ json: { background_job_id: id } });
			}
		}
		const count = jobs.get(path.split('/').pop()!);
		if (count)
			return route.fulfill({
				json: {
					id: path.split('/').pop(),
					status: 'completed',
					created_at: '',
					usage: { type: 'generations', generations: 2 },
					last_response: {
						images: Array.from({ length: count }, () => ({ type: 'base64', base64 }))
					}
				}
			});
		return route.abort();
	});
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	await page
		.getByLabel('Character ZIP', { exact: true })
		.setInputFiles({ name: 'hero.zip', mimeType: 'application/zip', buffer: Buffer.from(data) });
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(page.getByRole('dialog')).toContainText('0.35 gens estimated');
	await expect(page.getByLabel('Existing appearance')).toHaveValue('red hair, blue coat and boots');
	await page.getByRole('button', { name: /^Set up.*0.35 gens$/ }).click();
	await page
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('test-only-not-a-real-key');
	await page.getByRole('dialog').getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(page.getByRole('dialog')).toContainText(
		'Ready. You can add equipment and moves fitted to this character.',
		{ timeout: 30_000 }
	);
	await page.getByRole('button', { name: 'Start dressing up' }).click();
	const read = () =>
		page.evaluate(
			async () =>
				new Promise<StoredProject>((resolve, reject) => {
					const r = indexedDB.open('pixeldoll');
					r.onerror = () => reject(r.error);
					r.onsuccess = () => {
						const db = r.result,
							q = db.transaction('projects').objectStore('projects').getAll();
						q.onsuccess = () => {
							db.close();
							resolve(
								q.result.find((r: StoredProject) => r.manifest?.name === 'Rig parity fixture')
							);
						};
						q.onerror = () => reject(q.error);
					};
				})
		);
	const before = await read();
	expect(before.character).toEqual({
		id: 'managed-parity-fixture',
		looks: 'red hair, blue coat and boots'
	});
	await equipmentMode(page, 'States');
	await page.getByRole('button', { name: 'Add a state...', exact: true }).click();
	const emptyCapture = page.getByRole('dialog', { name: 'Create State', exact: true });
	await emptyCapture.getByRole('button', { name: 'Source: Standing', exact: true }).click();
	await expect(page.getByRole('menu', { name: 'Source' }).getByRole('menuitemradio')).toHaveText([
		'Standing'
	]);
	await page.keyboard.press('Escape');
	await expect(
		emptyCapture.getByRole('button', { name: 'Source: Standing', exact: true })
	).toBeFocused();
	await expect(emptyCapture.getByText(/^Frame \d+ of \d+$/)).toHaveCount(0);
	await expect(
		emptyCapture.getByRole('button', { name: 'Create State', exact: true })
	).toBeEnabled();
	await emptyCapture.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect(before.manifest.rig.rest?.west?.keypoints).toHaveLength(18);
	expect(
		(before.rigQa as { clips: Record<string, { adherence: number | null }> }).clips['default/south']
			.adherence
	).toBeNull();
	await newItem(page, 'Main hand');
	await page.getByRole('radio', { name: 'Main hand', exact: true }).click();
	await page.getByRole('dialog').getByText('Advanced', { exact: true }).click();
	// The import added room for moves (feet 4 px above a 64 px canvas edge: 64 -> 80), so held items pad to 112 px.
	expect(before.manifest.rig.cell).toEqual({ w: 80, h: 80 });
	await expect(page.getByRole('dialog')).toContainText('112 px canvas');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'Add a move...', exact: true }).click();
	await page.getByRole('radio', { name: 'Idle', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'Add a move', exact: true });
	await move.getByRole('button', { name: /^Advanced/ }).click();
	await move
		.getByRole('combobox', { name: 'Motion model', exact: true })
		.selectOption('skeleton-v3');
	await page.getByRole('button', { name: /^Generate / }).click();
	const review = page.getByRole('dialog', { name: 'Review move', exact: true });
	await review.getByRole('button', { name: 'Save move', exact: true }).click({ timeout: 45_000 });
	await expect(review).not.toBeVisible();
	// The list row follows the saved move without a reload: the summary is not a stale copy from before the save.
	await page.getByRole('button', { name: 'Characters', exact: true }).click();
	await expect(
		page
			.locator('.cast-library .character-row')
			.filter({ hasText: 'Rig parity fixture' })
			.locator('.character-counts')
	).toHaveText('4 directions · 1 state · 1 move · 0 items');
	const after = await read(),
		idle = after.manifest.rig.animations.find((a) => a.id === 'idle')!;
	expect(after.manifest.items[0].layers[0].cells!.default).toEqual(
		before.manifest.items[0].layers[0].cells!.default
	);
	expect(Object.keys(before.manifest.items[0].layers[0].cells!.default)).toEqual([
		'south',
		'east',
		'north',
		'west'
	]);
	expect(after.manifest.rig.baseHash).not.toBe('sha256:');
	expect(idle.cells).toBe(4);
	expect(Object.keys(idle.sources!)).toEqual(['south', 'east', 'north', 'west']);
	expect(
		Object.values(idle.sources!).every((s) => s.route === 'skeleton-v3' && s.measured?.length === 4)
	).toBe(true);
	expect(posts.filter((p) => p.path.endsWith('/estimate-skeleton'))).toHaveLength(1);
	const registration = posts.find((p) => p.path.endsWith('/create-character-v3'))!.body;
	expect(registration.view).toBe('side');
	expect(Object.keys(registration.direction_images as object).sort()).toEqual([
		'east',
		'north',
		'west'
	]);
	expect(registration.description).toBe('red hair, blue coat and boots');
	expect(posts.filter((p) => p.path.endsWith('/animate-with-skeleton-v3'))).toHaveLength(4);
	expect(
		posts
			.filter((p) => p.path.endsWith('/animate-with-skeleton-v3'))
			.every((p) => p.body.view === 'side')
	).toBe(true);
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('Rig parity fixture');
	const posted = posts.length;
	await equipmentMode(page, 'States');
	await expect(page.getByRole('combobox', { name: 'Source move' })).toHaveCount(0);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'More actions for Idle', exact: true }).click();
	await page.evaluate(() => {
		const original = crypto.subtle.digest;
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		crypto.subtle.digest = async function (...args: Parameters<SubtleCrypto['digest']>) {
			await pending;
			return original.apply(this, args);
		};
		(window as unknown as { releaseCapture: () => void }).releaseCapture = () => {
			crypto.subtle.digest = original;
			release();
		};
	});
	const createState = page.getByRole('dialog', { name: 'Create State', exact: true });
	await page.getByRole('menuitem', { name: 'Create State from...', exact: true }).click();
	await createState.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(createState).not.toBeVisible();
	await expect(
		page.getByRole('button', { name: 'More actions for Idle', exact: true })
	).toBeFocused();
	expect((await read()).manifest).toEqual(after.manifest);
	await page.getByRole('button', { name: 'More actions for Idle', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Create State from...', exact: true }).click();
	await expect(createState).toBeVisible();
	idle.frames[0].ms += 1;
	await page.evaluate(
		(record) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('pixeldoll');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const database = request.result;
					const transaction = database.transaction('projects', 'readwrite');
					transaction.objectStore('projects').put(record, record.id);
					transaction.onabort = () => {
						database.close();
						reject(transaction.error);
					};
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
				};
			}),
		after
	);
	await createState.getByRole('button', { name: 'Create State', exact: true }).click();
	await expect(createState.getByText('The source changed.', { exact: false })).toBeVisible();
	await expect(
		createState.getByRole('button', { name: 'Create State', exact: true })
	).toBeDisabled();
	expect((await read()).manifest).toEqual(after.manifest);
	await createState.getByRole('button', { name: 'Reload source', exact: true }).click();
	await expect(
		createState.getByRole('button', { name: 'Create State', exact: true })
	).toBeEnabled();
	await createState.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('button', { name: 'More actions for Idle', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Create State from...', exact: true }).click();
	const nextFrame = createState.getByRole('button', { name: 'Next frame', exact: true });
	await expect(
		createState.getByRole('button', { name: 'Source: Idle', exact: true })
	).toBeVisible();
	await expect(createState.getByLabel('State name', { exact: true })).toHaveValue('Idle pose');
	await expect(nextFrame).toBeDisabled();
	await expect(createState.getByText('Frame 4 of 4', { exact: true })).toBeVisible();
	// The whole preview turns through every facing and is one play/pause target.
	const previewFacing = createState.locator('[data-facing]');
	const pause = createState.getByRole('button', { name: 'Pause', exact: true });
	await expect(pause).toHaveCSS('cursor', 'pointer');
	const firstFacing = await previewFacing.getAttribute('data-facing');
	await expect(previewFacing).not.toHaveAttribute('data-facing', firstFacing!);
	await pause.click();
	const play = createState.getByRole('button', { name: 'Play', exact: true });
	await expect(play).toBeVisible();
	const pausedFacing = await previewFacing.getAttribute('data-facing');
	await createState.getByRole('button', { name: 'Previous frame', exact: true }).click();
	await expect(createState.getByText('Frame 3 of 4', { exact: true })).toBeVisible();
	await expect(previewFacing).toHaveAttribute('data-facing', pausedFacing!);
	await play.press('Space');
	await expect(previewFacing).not.toHaveAttribute('data-facing', pausedFacing!);
	await expect(nextFrame).toBeEnabled();
	await expect(createState.getByText('No credits used.', { exact: true })).toBeVisible();
	const createButton = createState.getByRole('button', { name: 'Create State', exact: true });
	await createState.getByLabel('State name', { exact: true }).fill('Standing');
	await expect(createButton).toBeDisabled();
	await createState.getByLabel('State name', { exact: true }).fill('Rest pose');
	try {
		await createButton.click();
		await expect(createState.getByRole('button', { name: 'Saving state…' })).toBeDisabled();
		await page.keyboard.press('Escape');
		await expect(createState).toBeVisible();
	} finally {
		await page.evaluate(() =>
			(window as unknown as { releaseCapture: () => void }).releaseCapture()
		);
	}
	await expect(page.getByText('Captured state', { exact: true })).toBeVisible();
	await expect(
		page.getByRole('tablist', { name: 'Customization panels', exact: true }).getByRole('tab', {
			name: 'States',
			exact: true
		})
	).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.clip-trigger[data-variant="quiet"]')).toHaveAttribute(
		'value',
		'rest-pose'
	);
	const captured = await read();
	const body = captured.manifest.items.find(({ id }) => id === captured.manifest.rig.baseItem)!;
	const cells = body.layers[0].cells!;
	const chosenCell = idle.frames.at(-2)!.cell;
	expect(chosenCell).not.toBe(idle.frames.at(-1)!.cell);
	expect(captured.manifest.rig.animations.find(({ id }) => id === 'rest-pose')).toMatchObject({
		kind: 'state',
		cells: 1
	});
	for (const direction of ['south', 'east', 'north', 'west'] as const)
		expect(cells['rest-pose'][direction]).toEqual([cells.idle[direction]![chosenCell]]);
	const panel = page.getByRole('tabpanel', { name: 'States', exact: true });
	const addState = panel.getByRole('button', { name: 'Add a state...', exact: true });
	await expect(panel.locator('.cta + details')).toBeVisible();
	await addState.click();
	await createState.getByRole('button', { name: 'Source: Standing', exact: true }).click();
	const sources = page.getByRole('menu', { name: 'Source' });
	await expect(
		sources.getByRole('group', { name: 'States' }).getByRole('menuitemradio')
	).toHaveText(['Standing', 'Rest pose']);
	await expect(
		sources.getByRole('menuitemradio', { name: 'Standing', exact: true })
	).toHaveAttribute('aria-checked', 'true');
	// Keyboard: End moves from the checked Standing to the last source, Enter picks it.
	await expect(sources.getByRole('menuitemradio', { name: 'Standing', exact: true })).toBeFocused();
	await page.keyboard.press('End');
	await expect(sources.getByRole('menuitemradio', { name: 'Idle', exact: true })).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(
		sources.getByRole('menuitemradio', { name: 'Rest pose', exact: true })
	).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(
		createState.getByRole('button', { name: 'Source: Idle', exact: true })
	).toBeFocused();
	await expect(createState.getByLabel('State name', { exact: true })).toHaveValue('Idle pose');
	await expect(createState.getByText('Frame 4 of 4', { exact: true })).toBeVisible();
	await createState.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(addState).toBeFocused();
	await equipmentMode(page, 'Moves');
	await expect(
		page.getByRole('tabpanel', { name: 'Moves', exact: true }).locator('.cta + details')
	).toBeVisible();
	await page.getByRole('button', { name: 'Add a move...', exact: true }).click();
	const moveSheet = page.getByRole('dialog', { name: 'Add a move' });
	// Add a move picks its start pose with the same Source picker and turning preview as Create State.
	const startFrom = (name: string) =>
		moveSheet.getByRole('button', { name: `Start from: ${name}`, exact: true });
	const pickStart = async (name: string) => {
		await moveSheet.getByRole('button', { name: /^Start from: / }).click();
		await page
			.getByRole('menu', { name: 'Start from' })
			.getByRole('menuitemradio', { name, exact: true })
			.click();
	};
	const previousStartFrame = moveSheet.getByRole('button', { name: 'Previous frame', exact: true });
	await expect(startFrom('Standing')).toBeVisible();
	await pickStart('Idle');
	await expect(moveSheet.getByText('Frame 4 of 4', { exact: true })).toBeVisible();
	await previousStartFrame.click();
	await previousStartFrame.click();
	await expect(moveSheet.getByText('Frame 2 of 4', { exact: true })).toBeVisible();
	await expect(previousStartFrame).toBeFocused();
	// Reaching the first frame disables Previous, so focus moves to Next.
	await previousStartFrame.click();
	await expect(moveSheet.getByRole('button', { name: 'Next frame', exact: true })).toBeFocused();
	await moveSheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	await equipmentMode(page, 'States');
	await page.getByRole('button', { name: 'More actions for Rest pose', exact: true }).click();
	await page.getByRole('menuitem', { name: /^Delete State/ }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('Removed Rest pose', { exact: true })).toBeVisible();
	const remaining = await read();
	expect(remaining.manifest.rig.animations).toEqual(after.manifest.rig.animations);
	expect(posts).toHaveLength(posted);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'Add a move...', exact: true }).click();
	await moveSheet.getByRole('radio', { name: 'Slash', exact: true }).click();
	await moveSheet.getByRole('button', { name: /^Advanced/ }).click();
	await moveSheet.getByRole('combobox', { name: 'Motion model' }).selectOption('skeleton-v3');
	await pickStart('Idle');
	await previousStartFrame.click();
	await previousStartFrame.click();
	await expect(moveSheet.getByText('Frame 2 of 4', { exact: true })).toBeVisible();
	await moveSheet.getByRole('button', { name: /^Generate / }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('test-only-not-a-real-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(review).toBeVisible({ timeout: 45_000 });
	const pending = await read();
	expect(pending.manifest.rig.animations.some(({ id }) => id === 'slash')).toBe(false);
	expect(pending.moveReviews?.slash?.spec.startFrom).toMatchObject({ clip: 'idle', cell: 1 });
	await review.getByRole('button', { name: /^Regenerate/ }).click();
	await expect(startFrom('Idle')).toBeVisible();
	await expect(moveSheet.getByText('Frame 2 of 4', { exact: true })).toBeVisible();
	await moveSheet.getByRole('button', { name: 'Cancel', exact: true }).click();
	await equipmentMode(page, 'States');
	await addState.click();
	const newState = createState;
	// A paid edit starts from the chosen Move frame, not Standing.
	await newState.getByRole('button', { name: 'Source: Standing', exact: true }).click();
	await page
		.getByRole('menu', { name: 'Source' })
		.getByRole('menuitemradio', { name: 'Idle', exact: true })
		.click();
	await newState.getByRole('button', { name: 'Previous frame', exact: true }).click();
	await expect(newState.getByText('Frame 3 of 4', { exact: true })).toBeVisible();
	await newState.getByRole('switch', { name: 'Edit this pose' }).check();
	await newState.getByRole('textbox', { name: 'State name' }).fill('Ready stance');
	const instructions = newState.getByRole('textbox', { name: 'Instructions' });
	await instructions.fill('Raise both hands');
	// The Riding template fills editable instructions; Custom gives back what was typed.
	const templates = newState.getByRole('radiogroup', { name: 'Start from' });
	await templates.getByRole('radio', { name: 'Riding', exact: true }).click();
	await expect(instructions).toHaveValue(
		/^Change only the pose\. Show the same character sitting upright astride/
	);
	await templates.getByRole('radio', { name: 'Custom', exact: true }).click();
	await expect(instructions).toHaveValue('Raise both hands');
	// Enhance grounds the instructions in the chosen source frame, then Undo restores them.
	await newState.getByRole('button', { name: 'Enhance', exact: true }).click();
	await expect(instructions).toHaveValue('Lift both open hands to shoulder height, palms forward');
	const enhanced = posts.filter(({ path }) => path.endsWith('/enhance-animation-v3-prompt'));
	expect(enhanced).toHaveLength(1);
	expect(enhanced[0].body).toMatchObject({
		action: 'Raise both hands',
		engine: 'v3',
		first_frame: { type: 'base64', format: 'png' }
	});
	expect(enhanced[0].body).not.toHaveProperty('last_frame');
	await newState.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(instructions).toHaveValue('Raise both hands');
	// With a reference, Enhance also sends it as the pose to move toward.
	const pose = makeImg(32, 32);
	for (let row = 4; row < 30; row++)
		for (let column = 10; column < 22; column++)
			pose.data.set([40, 90, 200, 255], (row * 32 + column) * 4);
	await newState.locator('input[type=file]').setInputFiles({
		name: 'pose.png',
		mimeType: 'image/png',
		buffer: Buffer.from(await encodePngBytes(pose))
	});
	await expect(newState.getByText('pose.png', { exact: true })).toBeVisible();
	await newState.getByRole('button', { name: 'Enhance', exact: true }).click();
	await expect(instructions).toHaveValue('Lift both open hands to shoulder height, palms forward');
	const withReference = posts.filter(({ path }) => path.endsWith('/enhance-animation-v3-prompt'));
	expect(withReference).toHaveLength(2);
	const sent = withReference[1].body as {
		first_frame: { base64: string };
		last_frame: { type: string; format: string; base64: string };
	};
	expect(sent).toMatchObject({ action: 'Raise both hands', engine: 'v3' });
	expect(sent.last_frame).toMatchObject({ type: 'base64', format: 'png' });
	expect(await decodePngBytes(Buffer.from(sent.last_frame.base64, 'base64'))).toMatchObject({
		w: 32,
		h: 32
	});
	expect(sent.first_frame.base64).toBe(
		(enhanced[0].body as { first_frame: { base64: string } }).first_frame.base64
	);
	await newState.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(instructions).toHaveValue('Raise both hands');
	await newState.getByRole('button', { name: 'Remove reference', exact: true }).click();
	const statePosts = () =>
		posts.filter(
			({ path }) => path.endsWith('/edit-images-v2') || path.endsWith('/create-character-state')
		);
	await newState.getByRole('button', { name: 'Check cost', exact: true }).click();
	const generateState = newState.getByRole('button', { name: 'Generate State', exact: true });
	await expect(generateState).toBeVisible();
	// Only the Generate State button approves a paid request, never Enter in a field.
	await newState.getByRole('textbox', { name: 'State name' }).press('Enter');
	await expect(newState.getByText('This State will be saved in PixelDoll only.')).toBeVisible();
	expect(statePosts()).toHaveLength(0);
	await generateState.click();
	await expect(newState.getByText('Review Ready stance before saving.')).toBeVisible();
	expect(statePosts()).toHaveLength(1);
	expect(statePosts()[0]?.body).toMatchObject({
		method: 'edit_with_text',
		description: 'Raise both hands'
	});
	const attempt = await read();
	expect(attempt.manifest.rig.animations.some(({ id }) => id === 'ready-stance')).toBe(false);
	expect(attempt.stateGeneration?.source).toEqual({ clip: 'idle', frame: 2 });
	await createState.getByRole('button', { name: 'Cancel', exact: true }).click();
	await reloadStudio(page);
	await equipmentMode(page, 'States');
	await addState.click();
	await expect(newState.getByText('Review Ready stance before saving.')).toBeVisible();
	// Grounding is offered on by default; turned off, Save keeps the returned placement.
	const ground = newState.getByRole('switch', { name: 'Align to source' });
	await expect(ground).toBeChecked();
	await ground.uncheck();
	await newState.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('State saved', { exact: true })).toBeVisible();
	await expect(page.locator('.clip-trigger[data-variant="quiet"]')).toHaveAttribute(
		'value',
		'ready-stance'
	);
	expect(
		(await read()).manifest.rig.animations.find(({ id }) => id === 'ready-stance')
	).toMatchObject({ kind: 'state', cells: 1 });
	// The built app has no module paths to import, so read the stored PNG bytes straight from IndexedDB.
	const saved = await read();
	const savedCells = saved.manifest.items.find(({ id }) => id === saved.manifest.rig.baseItem)!
		.layers[0].cells!;
	const sourceCell = saved.manifest.rig.animations.find(({ id }) => id === 'idle')!.frames[2].cell;
	const pngs = await page.evaluate(
		(keys) =>
			Promise.all(
				keys.map(
					(key) =>
						new Promise<number[]>((resolve, reject) => {
							const r = indexedDB.open('pixeldoll');
							r.onerror = () => reject(r.error);
							r.onsuccess = () => {
								const q = r.result.transaction('blobs').objectStore('blobs').get(key);
								q.onsuccess = async () => {
									r.result.close();
									resolve(Array.from(new Uint8Array(await (q.result as Blob).arrayBuffer())));
								};
							};
						})
				)
			),
		[savedCells.idle.south![sourceCell]!, savedCells['ready-stance'].south![0]!].map((hash) =>
			hash.slice(7)
		)
	);
	const bottoms = await Promise.all(
		pngs.map(async (bytes) => {
			const image = await decodePngBytes(Uint8Array.from(bytes));
			for (let y = image.h - 1; y >= 0; y--)
				for (let x = 0; x < image.w; x++) if (image.data[(y * image.w + x) * 4 + 3]) return y;
			return -1;
		})
	);
	expect(bottoms[1]).toBe(bottoms[0] - 3);
	expect(statePosts()).toHaveLength(1);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'Add a move...', exact: true }).click();
	await moveSheet.getByRole('radio', { name: 'Cast', exact: true }).click();
	await pickStart('Ready stance');
	const jointPosts = () => posts.filter(({ path }) => path.endsWith('/estimate-skeleton')).length;
	const beforeJointFit = jointPosts();
	await moveSheet.getByRole('button', { name: 'Connect PixelLab', exact: true }).click();
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('test-only-not-a-real-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(startFrom('Ready stance')).toBeVisible();
	await moveSheet.getByRole('button', { name: 'Check joint fitting cost' }).click();
	expect(jointPosts()).toBe(beforeJointFit);
	await moveSheet.getByRole('button', { name: /^Measure joints/ }).click();
	const saveJoints = moveSheet.getByRole('button', { name: 'Save joints', exact: true });
	await expect(saveJoints).toBeEnabled();
	const savedSource = async () =>
		(await read()).manifest.rig.animations.find(({ id }) => id === 'ready-stance')?.sources;
	expect(await savedSource()).toBeUndefined();
	await saveJoints.click();
	await expect.poll(async () => (await savedSource())?.south?.measured?.[0]?.length).toBe(18);
	await expect(moveSheet.getByRole('button', { name: /^Generate / })).toBeEnabled();
	expect(errors).toEqual([]);
});

test('a managed State reloads its child without another submission', async ({
	page,
	context
}, info) => {
	const parent = 'managed-state-parent';
	const child = 'managed-state-child';
	const job = 'managed-state-job';
	const posts: unknown[] = [];
	const postPaths: string[] = [];
	const pageErrors: string[] = [];
	const directions = ['south', 'east', 'north', 'west'];
	let images: Record<string, number[]>;
	const marker = [17, 231, 93, 255];
	const markerOffset = (32 * 64 + 32) * 4;
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (route.request().method() === 'POST') postPaths.push(path);
		if (path.endsWith('/balance'))
			return route.fulfill({
				json: {
					credits: { type: 'usd', usd: 0 },
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 }
				}
			});
		if (path.endsWith('/create-character-state')) {
			posts.push(route.request().postDataJSON());
			return route.fulfill({ status: 202, json: { background_job_id: job, character_id: child } });
		}
		if (path.endsWith(`/background-jobs/${job}`))
			return route.fulfill({
				json: {
					id: job,
					status: 'completed',
					created_at: '',
					last_response: { character_id: child },
					usage: { type: 'generations', generations: 10 }
				}
			});
		const id = path.split('/').pop()!;
		if (id === parent || id === child)
			return route.fulfill({
				json: {
					id,
					status: 'completed',
					size: { width: 64, height: 64 },
					directions: directions.length,
					rotation_urls: Object.fromEntries(
						directions.map((direction) => [
							direction,
							`https://api.pixellab.ai/qa-state-rotations/${id}/${direction}`
						])
					)
				}
			});
		if (path.startsWith('/qa-state-rotations/') && images[id]) {
			let bytes = Uint8Array.from(images[id]);
			if (path.startsWith(`/qa-state-rotations/${child}/`)) {
				const image = await decodePngBytes(bytes);
				expect(Array.from(image.data.slice(markerOffset, markerOffset + 4))).not.toEqual(marker);
				image.data.set(marker, markerOffset);
				bytes = Uint8Array.from(await encodePngBytes(image));
			}
			return route.fulfill({
				headers: { 'access-control-allow-origin': '*' },
				contentType: 'image/png',
				body: Buffer.from(bytes)
			});
		}
		return route.abort();
	});
	await page.addInitScript(() =>
		localStorage.setItem('pixellabApiKey', 'test-only-not-a-real-key')
	);
	await openStudio(
		page,
		info.config.projects.find(({ name }) => name === 'browser-selftests')!.use.baseURL!
	);
	const result = await page.evaluate(
		async ({ parent, directions }) => {
			const statePath = '/src/studio/state.svelte.ts',
				dbPath = '/src/lib/store/db.ts';
			const studio = await import(statePath),
				db = await import(dbPath);
			const projectId = await studio.copyDemo();
			const record: StoredProject = await db.get('projects', projectId);
			record.character = { id: parent, looks: 'Demo test fixture' };
			await db.put('projects', projectId, record);
			const base = record.manifest.items.find(({ id }) => id === record.manifest.rig.baseItem)!;
			const cells = base.layers[0].cells!.default;
			return {
				projectId,
				images: Object.fromEntries(
					await Promise.all(
						directions.map(async (direction) => {
							const hash = cells[direction as keyof typeof cells]?.[0] ?? cells.east?.[0];
							if (!hash) throw new Error(`Missing Standing fixture for ${direction}`);
							const blob: Blob = await db.getBlob(hash.slice(7));
							return [direction, Array.from(new Uint8Array(await blob.arrayBuffer()))];
						})
					)
				)
			};
		},
		{ parent, directions }
	);
	images = result.images;
	await equipmentMode(page, 'States');
	const addState = page.getByRole('button', { name: 'Add a state...', exact: true });
	await addState.click();
	const dialog = page.getByRole('dialog', { name: 'Create State', exact: true });
	const panel = dialog;
	await panel.getByRole('switch', { name: 'Edit this pose' }).check();
	await panel.getByRole('textbox', { name: 'State name' }).fill('Potion ready');
	await panel.getByRole('textbox', { name: 'Instructions' }).fill('Hold a potion');
	await panel.getByRole('button', { name: 'Check cost', exact: true }).click();
	const generate = panel.getByRole('button', { name: 'Generate State', exact: true });
	await expect(generate).toBeVisible();
	expect(posts).toHaveLength(0);
	await generate.click();
	const review = panel.getByText('Review Potion ready before saving.');
	await expect(review).toBeVisible();
	expect(posts).toEqual([
		expect.objectContaining({ character_id: parent, edit_description: 'Hold a potion' })
	]);
	const postsBeforeReload = postPaths.slice();
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await reloadStudio(page);
	await equipmentMode(page, 'States');
	await addState.click();
	await expect(review).toBeVisible();
	await panel.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('State saved', { exact: true })).toBeVisible();
	const stored = await page.evaluate(async (projectId) => {
		const dbPath = '/src/lib/store/db.ts';
		const db = await import(dbPath);
		const record: StoredProject = await db.get('projects', projectId);
		const base = record.manifest.items.find(({ id }) => id === record.manifest.rig.baseItem)!;
		const hash = base.layers[0].cells!['potion-ready'].south![0]!;
		const blob: Blob = await db.getBlob(hash.slice(7));
		return {
			child: record.managedStates?.['potion-ready'],
			image: Array.from(new Uint8Array(await blob.arrayBuffer()))
		};
	}, result.projectId);
	const image = await decodePngBytes(Uint8Array.from(stored.image));
	expect(stored.child).toBe(child);
	expect(Array.from(image.data.slice(markerOffset, markerOffset + 4))).toEqual(marker);
	expect(postPaths).toEqual(postsBeforeReload);
	expect(pageErrors).toEqual([]);
});

test('a State interrupted after its first batch sends only the unqueued views after a new quote', async ({
	page,
	context
}, info) => {
	type Image = { type: 'base64'; base64: string };
	const posts: { path: string; image: Image }[] = [];
	const results = new Map<string, Image>();
	const pageErrors: string[] = [];
	const markerOffset = (32 * 64 + 32) * 4;
	const markerOf = (index: number) => [233, 17 + index * 40, 151, 255];
	let releaseFirst = false;
	let firstPolled!: () => void;
	const polled = new Promise<void>((resolve) => (firstPolled = resolve));
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('dialog', (dialog) => dialog.accept());
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		if (path.endsWith('/balance'))
			return route.fulfill({
				json: {
					credits: { type: 'usd', usd: 0 },
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 }
				}
			});
		if (path.endsWith('/pro-flash/capabilities'))
			return route.fulfill({
				json: {
					operations: { edit: { edit_methods: ['text'], sizes: [{ width: 64, height: 64 }] } }
				}
			});
		if (path.endsWith('/pro-flash/cost')) return route.fulfill({ json: { total: 3 } });
		if (request.method() === 'POST') {
			const body = request.postDataJSON() as { image: Image };
			const index = posts.length;
			posts.push({ path, image: body.image });
			if (!path.endsWith('/edit-image-pro-flash')) return route.abort();
			const image = await decodePngBytes(Buffer.from(body.image.base64, 'base64'));
			image.data.set(markerOf(index), markerOffset);
			const base64 = Buffer.from(await encodePngBytes(image)).toString('base64');
			results.set(`flash-job-${index}`, { type: 'base64', base64 });
			return route.fulfill({ status: 202, json: { background_job_id: `flash-job-${index}` } });
		}
		const job = path.split('/background-jobs/')[1];
		const result = job && results.get(job);
		if (result) {
			if (job === 'flash-job-0' && !releaseFirst) {
				firstPolled();
				return route.fulfill({ json: { id: job, status: 'processing', created_at: '' } });
			}
			return route.fulfill({
				json: {
					id: job,
					status: 'completed',
					created_at: '',
					usage: { type: 'generations', generations: 3 },
					last_response: { images: [result] }
				}
			});
		}
		return route.abort();
	});
	await page.addInitScript(() =>
		localStorage.setItem('pixellabApiKey', 'test-only-not-a-real-key')
	);
	await openStudio(
		page,
		info.config.projects.find(({ name }) => name === 'browser-selftests')!.use.baseURL!
	);
	const projectId = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts';
		return (await import(statePath)).copyDemo();
	});
	const stored = () =>
		page.evaluate(async (projectId) => {
			const dbPath = '/src/lib/store/db.ts';
			const db = await import(dbPath);
			const record: StoredProject = await db.get('projects', projectId);
			const jobs: { activityScope?: string; state: string }[] = await db.all('jobs');
			const token = record.stateGeneration?.token;
			return {
				attempt: record.stateGeneration,
				jobs: jobs.filter(
					({ activityScope }) => token && activityScope?.startsWith(`state:${token}:`)
				)
			};
		}, projectId);
	const flashPosts = () => posts.filter(({ path }) => path.endsWith('/edit-image-pro-flash'));
	await equipmentMode(page, 'States');
	const addState = page.getByRole('button', { name: 'Add a state...', exact: true });
	await addState.click();
	const dialog = page.getByRole('dialog', { name: 'Create State', exact: true });
	const panel = dialog;
	await panel.getByRole('switch', { name: 'Edit this pose' }).check();
	await panel.getByRole('textbox', { name: 'State name' }).fill('Torch ready');
	await panel.getByRole('textbox', { name: 'Instructions' }).fill('Hold a torch');
	await panel.getByText('Advanced', { exact: true }).click();
	await panel.getByRole('combobox', { name: 'Model', exact: true }).selectOption('pro-flash');
	await panel.getByRole('button', { name: 'Check cost', exact: true }).click();
	await panel.getByRole('button', { name: 'Generate State', exact: true }).click();
	await polled;
	expect(flashPosts()).toHaveLength(1);
	const interrupted = await stored();
	const batches = interrupted.attempt!.plan.batches.length;
	expect(batches).toBeGreaterThan(1);
	expect(interrupted.attempt!.continuation?.unqueued).toEqual(
		Array.from({ length: batches - 1 }, (_, index) => index + 1)
	);
	// The tab closes while batch 0 runs: later batches stay durably unqueued, batch 0 resumes polling.
	await reloadStudio(page);
	releaseFirst = true;
	await expect
		.poll(async () => (await stored()).jobs.map(({ state }) => state), { timeout: 30_000 })
		.toEqual(['done']);
	await equipmentMode(page, 'States');
	await addState.click();
	await dialog.getByRole('button', { name: 'Check remaining cost', exact: true }).click();
	await expect(
		dialog.getByText(`Views kept: 1. Views to generate: ${batches - 1}.`, { exact: true })
	).toBeVisible();
	expect(flashPosts()).toHaveLength(1);
	await dialog.getByRole('button', { name: 'Generate remaining views', exact: true }).click();
	await expect(panel.getByText('Review Torch ready before saving.')).toBeVisible();
	expect(flashPosts()).toHaveLength(batches);
	expect(new Set(flashPosts().map(({ image }) => image.base64)).size).toBe(batches);
	await panel.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('State saved', { exact: true })).toBeVisible();
	const saved = await page.evaluate(async (projectId) => {
		const dbPath = '/src/lib/store/db.ts';
		const db = await import(dbPath);
		const record: StoredProject = await db.get('projects', projectId);
		const base = record.manifest.items.find(({ id }) => id === record.manifest.rig.baseItem)!;
		return {
			attempt: record.stateGeneration,
			views: await Promise.all(
				Object.values(base.layers[0].cells!['torch-ready']).map(async (hashes) => {
					const blob: Blob = await db.getBlob(hashes![0]!.slice(7));
					return Array.from(new Uint8Array(await blob.arrayBuffer()));
				})
			)
		};
	}, projectId);
	expect(saved.attempt).toBeUndefined();
	expect(saved.views).toHaveLength(batches);
	const sent = await Promise.all(
		flashPosts().map(async ({ image }) => decodePngBytes(Buffer.from(image.base64, 'base64')))
	);
	const matched = await Promise.all(
		saved.views.map(async (bytes) => {
			const view = await decodePngBytes(Uint8Array.from(bytes));
			const marker = Array.from(view.data.slice(markerOffset, markerOffset + 4));
			const index = sent.findIndex((input) =>
				input.data.every(
					(value, offset) =>
						(offset >= markerOffset && offset < markerOffset + 4) || value === view.data[offset]
				)
			);
			expect(marker).toEqual(markerOf(index));
			return index;
		})
	);
	expect([...matched].sort((a, b) => a - b)).toEqual(
		Array.from({ length: batches }, (_, index) => index)
	);
	expect(posts).toEqual(flashPosts());
	expect(pageErrors).toEqual([]);
});

test('a stopped move blocks deleting only its own character and opens from the block', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (route) => route.abort());
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts';
		const studio = await import(statePath),
			db = await import(dbPath);
		const pendingProject = await studio.copyDemo();
		await studio.renameProject('Pending hero');
		await studio.copyDemo();
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: pendingProject,
			spec: { id: 'walk', frames: 8, items: [], seed: 1 },
			status: 'failed',
			error: 'Offline fixture: walk did not finish.'
		});
	});
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	const deletion = page.getByRole('alertdialog');
	const remove = async () => {
		await page.locator('.project-btn').click();
		await page.getByRole('menuitem', { name: 'Delete character…', exact: true }).click();
	};
	// Another character's stopped move waits for its own review and does not lock this one.
	await remove();
	await deletion.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(deletion).toBeHidden();
	await expect(page.locator('.project-btn')).not.toContainText('Adventurer copy');
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts';
		const studio = await import(statePath);
		await studio.openProject(
			studio.store.projects.find((project: { name: string }) => project.name === 'Pending hero').id
		);
	});
	await expect(page.locator('.project-btn')).toContainText('Pending hero');
	await remove();
	await expect(deletion.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
	await deletion.getByRole('button', { name: 'View pending work' }).click();
	const move = page.getByRole('dialog', { name: 'Add a move' });
	await expect(move.getByText('Offline fixture: walk did not finish.')).toBeVisible();
	await move.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(move).toBeHidden();
	await remove();
	await deletion.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(deletion).toBeHidden();
	await expect(page.locator('.project-btn')).not.toContainText('Pending hero');
});

test('deleting a disposable character preserves another character’s pending review', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	const devURL = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await openStudio(page, devURL);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const result = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		await s.copyDemo();
		s.gens.push({
			draft: {
				rigId: 'another-character',
				spec: {
					id: 'keep-review',
					name: 'Keep',
					slot: 'head',
					prompt: 'hat',
					key: 'green',
					anims: [],
					dirs: []
				},
				calls: [],
				keySwitched: false,
				log: []
			},
			input: { name: 'Keep', slot: 'head', prompt: 'hat' },
			phase: 'review',
			status: 'Review'
		});
		s.store.results['keep-review'] = { cells: [], qa: null, g1: new Map(), preview: null };
		await s.removeProject();
		return {
			resultKept: !!s.store.results['keep-review'],
			draftKept: s.gens.some(
				(g: { draft: { spec: { id: string } } }) => g.draft.spec.id === 'keep-review'
			)
		};
	});
	expect(result).toEqual({ resultKept: true, draftKept: true });
	await expect(page.locator('.project-btn')).toContainText('Adventurer');
});

test('equipping an accepted item while opening its project survives reload', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const name = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		await s.copyDemo();
		const hat = s.store.project.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		if (s.doc.items.head === hat.id) s.wear(hat.id);
		await s.flushSave();
		// Keep it calls this path after saving an accepted item's frames.
		await s.openProject(s.doc.id, { wear: hat.id });
		return hat.name as string;
	});
	await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await reloadStudio(page);
	await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('startup decodes the character it opens once: its thumbnail waits for the open', async ({
	page,
	context
}, info) => {
	await context.route('https://*.pixellab.ai/**', (r) => r.abort());
	// Every cell a load decodes is hashed, so hashing counts decoding work.
	await context.addInitScript(() => {
		const digest = crypto.subtle.digest.bind(crypto.subtle),
			w = window as unknown as { digests: number };
		w.digests = 0;
		crypto.subtle.digest = (...args: Parameters<SubtleCrypto['digest']>) => {
			w.digests++;
			return digest(...args);
		};
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	// Read the count only once startup work has settled, so a thumbnail decoding late cannot escape it.
	const settled = () =>
		page.evaluate(async () => {
			const w = window as unknown as { digests: number },
				before = w.digests;
			await new Promise((resolve) => setTimeout(resolve, 1000));
			return w.digests === before;
		});
	await expect.poll(settled, { timeout: 30_000 }).toBe(true);
	const { startup, reopen, build } = await page.evaluate(async () => {
		const w = window as unknown as { digests: number },
			paths = ['/src/lib/dress/project.ts', '/src/lib/compose/fixture.ts', '/src/lib/assets.ts'],
			[{ openSource }, { loadFixture }, { assetUrl }] = await Promise.all(
				paths.map((path) => import(path))
			);
		const startup = w.digests;
		await openSource('fixture:s2'); // the demo is built once, so opening it again decodes nothing
		const reopen = w.digests - startup,
			before = w.digests;
		await loadFixture(
			async (p: string) =>
				new Uint8Array(await (await fetch(assetUrl(`fixtures/s2/${p}`))).arrayBuffer())
		);
		return { startup, reopen, build: w.digests - before };
	});
	expect(build).toBeGreaterThan(0);
	expect(startup).toBeLessThan(2 * build);
	expect(reopen).toBe(0);
});

test('a delayed earlier character load cannot replace the last selected character', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const id = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		return (await s.copyDemo()) as string;
	});
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/fixtures/s2/fixture.json', async (route) => {
		await held;
		await route.continue();
	});
	const requested = page.waitForRequest('**/fixtures/s2/fixture.json', { timeout: 10_000 });
	// The demo's files are downloaded once per page: a fresh page has not, so its demo open waits on the held file.
	await reloadStudio(page);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		(window as unknown as { auditOpen: Promise<void> }).auditOpen = s.openProject('fixture:s2');
	});
	await requested;
	try {
		await page.evaluate(async (id) => {
			const path = '/src/studio/state.svelte.ts',
				s = await import(path);
			await s.openProject(id);
		}, id);
	} finally {
		release();
	}
	await page.evaluate(
		async () => await (window as unknown as { auditOpen: Promise<void> }).auditOpen
	);
	await expect(page.locator('.project-btn')).toContainText('Adventurer copy');
	expect(await page.evaluate(() => localStorage.getItem('pixeldoll.studio.project'))).toBe(id);
});

test('rename display names and export IDs without changing saved keys or calling PixelLab', async ({
	page,
	context
}, info) => {
	let requests = 0;
	await context.route('https://api.pixellab.ai/**', (route) => {
		requests++;
		return route.abort();
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	const target = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			studio = await import(path);
		await studio.copyDemo();
		const item = studio.store.project.manifest.items.find(
			(entry: { slot: string }) => entry.slot === 'head'
		);
		return { projectId: studio.doc.id, id: item.id, name: item.name, prompt: item.prompt };
	});
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Rename character…', exact: true }).click();
	const rename = async (title: string, name: string, alias: string) => {
		const dialog = page.getByRole('dialog', { name: title, exact: true });
		await dialog.getByRole('textbox', { name: 'Display name' }).fill(name);
		const summary = dialog.locator('summary');
		const chevron = summary.locator('svg');
		await expect(chevron).toHaveCSS('transform', 'none');
		await summary.click();
		await expect(chevron).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
		await summary.press('Space');
		await expect(chevron).toHaveCSS('transform', 'none');
		await summary.press('Space');
		const id = dialog.getByRole('textbox', { name: 'Export ID' });
		await id.fill('aux');
		await expect(id).toHaveAttribute('aria-invalid', 'true');
		await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
		await id.fill(alias);
		await dialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(dialog).toHaveCount(0);
	};
	await rename('Rename character', '旅人', 'travel_hero');
	await expect(page.locator('.project-btn')).toContainText('旅人');
	await equipmentGroup(page, 'Head');
	await page.getByRole('button', { name: `More options for ${target.name}`, exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rename...', exact: true }).click();
	await rename('Rename item', 'Travel cap', 'travel_cap');
	await equipmentMode(page, 'Outfits');
	await page.getByRole('button', { name: 'More actions for Adventurer', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rename...', exact: true }).click();
	await rename('Rename outfit', 'Knight', 'knight_set');
	await expect(page.locator('.outfits')).toContainText('Knight');
	await equipmentMode(page, 'States');
	await page.getByRole('button', { name: 'More actions for Standing', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rename...', exact: true }).click();
	const standing = page.getByRole('dialog', { name: 'Rename move', exact: true });
	await standing.locator('summary').click();
	// Games start from the standing move, so its export ID stays fixed.
	await expect(standing.getByRole('textbox', { name: 'Export ID' })).toHaveAttribute('readonly');
	await standing.getByRole('button', { name: 'Cancel', exact: true }).click();
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'More actions for Walk', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rename...', exact: true }).click();
	await rename('Rename move', 'Stroll', 'stroll');
	await expect(page.locator('.move-list')).toContainText('Stroll');
	// Paid item requests confirm against the saved rig's JSON: a rename must leave both identical.
	expect(
		await page.evaluate(async (projectId) => {
			const dbPath = '/src/lib/store/db.ts',
				statePath = '/src/studio/state.svelte.ts',
				db = await import(dbPath),
				studio = await import(statePath);
			const { manifest } = await db.get('projects', projectId);
			return JSON.stringify(studio.store.project.manifest.rig) === JSON.stringify(manifest.rig);
		}, target.projectId)
	).toBe(true);
	await reloadStudio(page);
	await expect(page.locator('.project-btn')).toContainText('旅人');
	await equipmentMode(page, 'Moves');
	await expect(page.locator('.move-list')).toContainText('Stroll');
	const saved = await page.evaluate(async ({ projectId, id }) => {
		const path = '/src/lib/store/db.ts',
			db = await import(path),
			statePath = '/src/studio/state.svelte.ts',
			studio = await import(statePath);
		const { manifest } = await db.get('projects', projectId);
		return {
			alias: manifest.exportId,
			item: manifest.items.find((entry: { id: string }) => entry.id === id),
			move: manifest.rig.animations.find((entry: { id: string }) => entry.id === 'walk'),
			outfits: studio.store.project.manifest.presets.map((outfit: { id: string; name: string }) => [
				outfit.id,
				outfit.name
			])
		};
	}, target);
	expect(saved).toMatchObject({
		alias: 'travel_hero',
		item: { id: target.id, name: 'Travel cap', exportId: 'travel_cap', prompt: target.prompt },
		move: { id: 'walk', name: 'Stroll', exportId: 'stroll' }
	});
	expect(saved.outfits).toContainEqual(['knight_set', 'Knight']);
	expect(requests).toBe(0);
});

test('rename storage failures leave the name visible and retryable', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		await s.copyDemo();
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await db.del('projects', s.doc.id);
	});
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Rename character…', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Rename character', exact: true });
	await dialog.getByRole('textbox', { name: 'Display name', exact: true }).fill('Keep this name');
	await dialog.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(dialog.getByRole('alert')).toContainText(
		'This saved character is no longer available.'
	);
	await expect(dialog.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue(
		'Keep this name'
	);
	await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('item deletion finishing during navigation cannot reopen the old character', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		await s.copyDemo();
	});
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/fixtures/s2/fixture.json', async (route) => {
		await held;
		await route.continue();
	});
	const requested = page.waitForRequest('**/fixtures/s2/fixture.json', { timeout: 10_000 });
	// The demo's files are downloaded once per page: a fresh page has not, so its demo open waits on the held file.
	await reloadStudio(page);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const testWindow = window as unknown as { deleting: Promise<void>; navigating: Promise<void> };
		const item = s.store.project.manifest.items.find((i: { slot: string }) => i.slot !== 'body');
		testWindow.deleting = s.removeItem(item.id);
		testWindow.navigating = s.openProject('fixture:s2');
	});
	await requested;
	try {
		await page.evaluate(
			async () => await (window as unknown as { deleting: Promise<void> }).deleting
		);
	} finally {
		release();
	}
	await page.evaluate(
		async () => await (window as unknown as { navigating: Promise<void> }).navigating
	);
	await expect(page.locator('.project-btn')).toContainText('Adventurer');
	expect(await page.evaluate(() => localStorage.getItem('pixeldoll.studio.project'))).toBe(
		'fixture:s2'
	);
});

test('storage failures before paid work surface errors and release the move runner', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const result = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const i18nPath = '/src/lib/i18n.ts';
		const { displayError } = await import(i18nPath);
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (String(key).startsWith('studio-create:') || key === 'studio-move')
				throw new DOMException('Test storage quota exceeded', 'QuotaExceededError');
			return put.call(this, value, key);
		};
		try {
			const firstCreate = s.startCreate({
				description: 'test body',
				name: 'Storage fixture',
				seed: 1,
				size: 48,
				directions: [{ id: 'south' }]
			});
			await s.startCreate({
				description: 'duplicate body',
				name: 'Duplicate request',
				seed: 2,
				size: 48,
				directions: [{ id: 'south' }]
			});
			await firstCreate;
			await s.startMove(s.doc.id, { id: 'first', action: 'cast', frames: 8, items: [], seed: 1 });
			const firstError = displayError(s.moving.error);
			await s.startMove(s.doc.id, { id: 'second', action: 'cast', frames: 8, items: [], seed: 2 });
			return {
				creates: s.creates.map((run: (typeof s.creates)[number]) => ({
					name: run.spec.name,
					error: displayError(run.error)
				})),
				firstError,
				secondError: displayError(s.moving.error),
				secondId: s.moving.spec.id
			};
		} finally {
			IDBObjectStore.prototype.put = put;
		}
	});
	expect(result.creates).toEqual([
		{ name: 'Storage fixture', error: expect.stringContaining('Test storage quota exceeded') },
		{ name: 'Duplicate request', error: expect.stringContaining('Test storage quota exceeded') }
	]);
	expect(result.firstError).toContain('Test storage quota exceeded');
	expect(result.secondError).toContain('Test storage quota exceeded');
	expect(result.secondId).toBe('second');
	expect(requests).toEqual([]);
});

test('accepted appearance warnings remain visible with clean or removed frame QA and dollar source costs', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const id = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		await s.copyDemo();
		const it = s.store.project.manifest.items.find((x: { slot: string }) => x.slot !== 'body');
		it.designWarnings = [
			'D1 keyframe rest/south/0: gray smudges',
			'G2 keyframe rest/south/0: changed pixels'
		];
		it.qa = {
			minKeyKept: 1,
			maxKeyOutside: 0,
			minAreaRatio: 1,
			maxAreaCV: 0,
			maxPaletteDist: 0,
			clipPx: 0,
			status: 'pass',
			rerolls: 0,
			cells: {},
			clips: {}
		};
		it.provenance = [
			{
				endpoint: '/test',
				params: {},
				seed: 1,
				requestHash: 'sha256:test',
				createdAt: new Date().toISOString(),
				produced: [],
				usage: { generations: 10, usd: 0.08 }
			}
		];
		s.store.project = {
			...s.store.project,
			manifest: {
				...s.store.project.manifest,
				items: s.store.project.manifest.items.map((x: { id: string }) =>
					x.id === it.id ? { ...it } : x
				)
			}
		};
		s.ui.selected = it.id;
		s.doc.rev++;
		return it.id;
	});
	const pane = await selectedItemDetails(page);
	await expect(pane.locator('.badge.accepted')).toContainText('Accepted');
	await expect(pane.getByText('Accepted appearance warnings', { exact: true })).toBeVisible();
	await expect(pane.getByText('The design has gray smudges', { exact: true })).toBeVisible();
	await expect(
		pane.getByText('Some body pixels were changed by the model', { exact: true })
	).toBeVisible();
	await pane.getByText('How it was made', { exact: true }).click();
	await expect(pane.getByText('10 gens · $0.080 · 1 call', { exact: true })).toBeVisible();
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const it = { ...s.store.project.manifest.items.find((x: { id: string }) => x.id === id) };
		delete it.qa;
		s.store.project = {
			...s.store.project,
			manifest: {
				...s.store.project.manifest,
				items: s.store.project.manifest.items.map((x: { id: string }) => (x.id === id ? it : x))
			}
		};
		s.doc.rev++;
	}, id);
	await expect(pane.locator('.badge.accepted')).toContainText('Accepted');
	await expect(pane.getByText('The design has gray smudges', { exact: true })).toBeVisible();
});

// Character loading across several saved characters. Each copy of the demo is tinted, so every character has its own pixels
// and frame hashes and cannot borrow another's decoded frames. Runs on the dev server, which serves the app's modules.
test('every character loads its frames once across switching, menus and updates, and thumbnails never blank', async ({
	page,
	context
}, info) => {
	test.setTimeout(180_000);
	await context.route('https://*.pixellab.ai/**', (r) => r.abort());
	await context.addInitScript(() => {
		const w = window as unknown as {
			frameReads: Record<string, number>;
			recordReads: number;
			digests: number;
			blank: string[];
			sampling: boolean;
		};
		w.frameReads = {};
		w.recordReads = 0;
		w.digests = 0;
		const decoding = window as unknown as { decodes: number };
		decoding.decodes = 0;
		window.DecompressionStream = new Proxy(DecompressionStream, {
			construct(target, args, newTarget) {
				decoding.decodes++;
				return Reflect.construct(target, args, newTarget);
			}
		});
		window.createImageBitmap = new Proxy(createImageBitmap, {
			apply(target, receiver, args) {
				decoding.decodes++;
				return Reflect.apply(target, receiver, args);
			}
		});
		w.blank = [];
		w.sampling = false;
		const get = IDBObjectStore.prototype.get;
		IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey) {
			if (this.name === 'blobs') w.frameReads[String(key)] = (w.frameReads[String(key)] ?? 0) + 1;
			else if (this.name === 'projects' && String(key).startsWith('rig-')) w.recordReads++;
			return get.call(this, key);
		};
		const digest = crypto.subtle.digest.bind(crypto.subtle);
		crypto.subtle.digest = (...args: Parameters<SubtleCrypto['digest']>) => {
			if (new Error().stack?.includes('cellHash')) w.digests++;
			return digest(...args);
		};
		// Every animation frame, while sampling: any shown thumbnail with no visible pixel is a blink.
		const sample = () => {
			if (w.sampling)
				for (const c of document.querySelectorAll<HTMLCanvasElement>(
					'.character-thumbnail canvas'
				)) {
					if (!c.checkVisibility()) continue;
					const g = c.getContext('2d')!;
					const pixels = g.getImageData(0, 0, c.width, c.height).data;
					let visible = false;
					for (let alpha = 3; alpha < pixels.length; alpha += 4)
						if (pixels[alpha]) {
							visible = true;
							break;
						}
					if (!visible)
						w.blank.push(
							c.closest('button')?.getAttribute('aria-label') ??
								c.closest('button')?.querySelector('strong')?.textContent ??
								c.outerHTML
						);
				}
			requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
	});
	const devURL = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	const stats = () =>
		page.evaluate(() => {
			const w = window as unknown as {
				frameReads: Record<string, number>;
				recordReads: number;
				digests: number;
				blank: string[];
			};
			const counts = Object.values(w.frameReads);
			return {
				frames: counts.length,
				reads: counts.reduce((a, b) => a + b, 0),
				maxPerFrame: Math.max(0, ...counts),
				decodes: (window as unknown as { decodes: number }).decodes,
				records: w.recordReads,
				digests: w.digests,
				blank: [...w.blank]
			};
		});
	const settled = async () => {
		await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 30_000 });
		await expect(page.locator('.customize-action')).toHaveAttribute('aria-busy', 'false');
		await expect
			.poll(
				() =>
					page.evaluate(async () => {
						const w = window as unknown as { digests: number; recordReads: number },
							before = w.digests + w.recordReads;
						await new Promise((resolve) => setTimeout(resolve, 600));
						return w.digests + w.recordReads === before;
					}),
				{ timeout: 30_000 }
			)
			.toBe(true);
	};
	const seed = (names: string[], tint: number) =>
		page.evaluate(
			async ({ names, tint }) => {
				const load = (path: string) => import(/* @vite-ignore */ path);
				const [{ openSource }, { saveImportedCharacter }, { cellHash }] = await Promise.all([
					load('/src/lib/dress/project.ts'),
					load('/src/lib/store/import.ts'),
					load('/src/lib/rig/rig.ts')
				]);
				const { project } = await openSource('fixture:s2');
				for (const [k, name] of names.entries()) {
					const shift = (tint + k) * 37,
						images = new Map(),
						renamed = new Map<string, string>();
					for (const [hash, im] of project.images as Map<
						string,
						{ w: number; h: number; data: Uint8ClampedArray }
					>) {
						const data = im.data.slice();
						for (let i = 0; i < data.length; i += 4)
							if (data[i + 3]) data[i + 2] = (data[i + 2] + shift) % 256;
						const tinted = { w: im.w, h: im.h, data },
							h = await cellHash(tinted);
						renamed.set(hash, h);
						images.set(h, tinted);
					}
					let json = JSON.stringify(project.manifest);
					for (const [from, to] of renamed) json = json.split(from).join(to);
					await saveImportedCharacter(
						{ project: { manifest: JSON.parse(json), images }, extra: {}, warnings: [] },
						name
					);
				}
			},
			{ names, tint }
		);
	const rows = page.locator('.character-row');
	const thumbOf = (name: string) =>
		page
			.locator('.character-row', { hasText: name })
			.locator('canvas')
			.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
	const idOf = (name: string) =>
		page.evaluate(async (name) => {
			const { all } = await import(/* @vite-ignore */ String('/src/lib/store/db.ts'));
			return ((await all('projects')) as { id: string; manifest?: { name: string } }[]).find(
				(r) => r.manifest?.name === name
			)!.id;
		}, name);
	const selectedName = () => page.locator('.selected-name-text').textContent();

	await page.goto(devURL);
	await settled();
	await seed(['Hero 1', 'Hero 2', 'Hero 3', 'Hero 4'], 1);
	// A fresh page: nothing decoded yet, as after a reload.
	await page.reload();
	await settled();
	await expect(rows).toHaveCount(5);
	// First visits, with the name menu open once: each frame may be read once here. A character's first open also splits
	// its body into shirt and shorts and saves that once; its next open checks the saved split once more. So go round twice.
	for (let i = 0; i < 10; i++) {
		await page.getByRole('button', { name: 'Next character', exact: true }).click();
		await settled();
	}
	await page.locator('.selected-name').click();
	await expect(page.locator('#project-menu .character-thumbnail canvas')).toHaveCount(5);
	await page.keyboard.press('Escape');
	await settled();
	const warm = await stats();
	expect(warm.decodes).toBeGreaterThan(0);
	expect(warm.maxPerFrame).toBe(1); // no frame was read twice, even while thumbnails and opens overlapped
	expect(warm.blank).toEqual([]);

	// Every way of switching, back and forth, with the menu opened between: nothing is read or decoded again, and no
	// thumbnail blinks.
	await page.evaluate(() => ((window as unknown as { sampling: boolean }).sampling = true));
	const opens: string[] = [];
	const step = async (how: () => Promise<void>) => {
		await expect(page.locator('.customize-action')).toHaveAttribute('aria-busy', 'false');
		const before = await selectedName();
		await how();
		await expect.poll(selectedName).not.toBe(before);
		await expect(page.locator('.customize-action')).toBeEnabled();
		await expect(page.locator('.customize-action')).toHaveAttribute('aria-busy', 'false');
		opens.push((await selectedName())!);
	};
	for (let i = 0; i < 6; i++)
		await step(() => page.getByRole('button', { name: 'Next character', exact: true }).click());
	for (let i = 0; i < 3; i++)
		await step(() => page.getByRole('button', { name: 'Previous character', exact: true }).click());
	const navigations: [number, { metaKey?: boolean; ctrlKey?: boolean }][] = [
		[200, { metaKey: true }],
		[-200, { ctrlKey: true }],
		[200, { metaKey: true }]
	];
	for (const [delta, init] of navigations) {
		// The middle step really holds Control, so its Ctrl wheel is not mistaken for a trackpad pinch.
		if (init.ctrlKey) await page.keyboard.down('Control');
		await step(() =>
			page.evaluate(
				({ deltaY, init }) => {
					window.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true, ...init }));
				},
				{ deltaY: delta, init }
			)
		);
		if (init.ctrlKey) await page.keyboard.up('Control');
	}
	for (const name of ['Hero 2', 'Adventurer', 'Hero 4', 'Hero 1'])
		if ((await selectedName()) !== name) await step(() => rows.filter({ hasText: name }).click());
	for (const name of ['Hero 3', 'Hero 2']) {
		await page.locator('.selected-name').click();
		await step(() =>
			page.locator('#project-menu').getByRole('menuitemradio', { name, exact: true }).click()
		);
		await page.keyboard.press('Escape');
	}
	await settled();
	const switched = await stats();
	expect(switched.blank).toEqual([]);
	expect(switched.reads).toBe(warm.reads); // no frame read again
	expect(switched.digests).toBe(warm.digests);
	expect(switched.decodes).toBe(warm.decodes);
	expect(switched.records - warm.records).toBeLessThanOrEqual(opens.length); // only each open's small record

	// Another tab saves a different outfit for a character not selected: the next listing redraws its thumbnail, from
	// frames already decoded.
	const target = (await selectedName()) === 'Hero 4' ? 'Hero 1' : 'Hero 4';
	const before = await thumbOf(target);
	await page.evaluate(
		async (id) => {
			const { openSource, saveDress } = await import(
				/* @vite-ignore */ String('/src/lib/dress/project.ts')
			);
			const { project } = await openSource(id);
			await saveDress(id, project.manifest, { items: {}, variants: {} });
		},
		await idOf(target)
	);
	await page.locator('.selected-name').click();
	await page.keyboard.press('Escape');
	await expect.poll(() => thumbOf(target)).not.toBe(before);
	await settled();
	const updated = await stats();
	expect(updated.reads).toBe(warm.reads);
	expect(updated.decodes).toBe(warm.decodes);
	expect(updated.blank).toEqual([]);
	const previousArtwork = await thumbOf(target);
	const replacement = `Updated ${target}`;
	await seed([replacement], 12);
	await page.evaluate(
		async ({ id, replacement, name }) => {
			const { all, updateCharacter, deleteCharacter } = await import(
				/* @vite-ignore */ String('/src/lib/store/db.ts')
			);
			const source = (await all('projects')).find(
				(record: { manifest?: { name: string } }) => record.manifest?.name === replacement
			);
			if (!source) throw new Error('Replacement artwork was not saved');
			await updateCharacter(id, new Map(), (record: typeof source) => {
				if (!record) throw new Error('Character to update was not saved');
				return {
					...record,
					manifest: { ...source.manifest, name },
					savedAt: new Date().toISOString()
				};
			});
			await deleteCharacter(source.id);
		},
		{ id: await idOf(target), replacement, name: target }
	);
	await page.locator('.selected-name').click();
	await page.keyboard.press('Escape');
	await expect.poll(() => thumbOf(target)).not.toBe(previousArtwork);
	await settled();
	const replaced = await stats();
	expect(replaced.reads).toBeGreaterThan(updated.reads);
	expect(replaced.decodes).toBeGreaterThan(updated.decodes);
	expect(replaced.maxPerFrame).toBe(1);
	expect(replaced.blank).toEqual([]);
	await step(() => rows.filter({ hasText: target }).click());
	await settled();
	const reopened = await stats();
	expect(reopened.reads).toBe(replaced.reads);
	expect(reopened.decodes).toBe(replaced.decodes);

	// A deleted character leaves the list; a newly imported one loads each of its frames once.
	await page.evaluate(
		async (id) => {
			const { deleteCharacter } = await import(/* @vite-ignore */ String('/src/lib/store/db.ts'));
			await deleteCharacter(id);
		},
		await idOf('Hero 3')
	);
	await seed(['Hero 5'], 9);
	await page.locator('.selected-name').click();
	await page.keyboard.press('Escape');
	await expect(rows).toHaveCount(5);
	await expect(rows.filter({ hasText: 'Hero 3' })).toHaveCount(0);
	await step(() => rows.filter({ hasText: 'Hero 5' }).click());
	await expect(page.locator('.selected-name-text')).toHaveText('Hero 5');
	await settled();
	const imported = await stats();
	expect(imported.frames).toBeGreaterThan(updated.frames);
	expect(imported.maxPerFrame).toBe(1);
	// Only the new character, with nothing to show before its first load, may have been blank.
	expect(imported.blank.filter((label) => !label.includes('Hero 5'))).toEqual([]);
	// Once loaded, it stays drawn like the others.
	await page.evaluate(() => ((window as unknown as { blank: string[] }).blank = []));
	for (let i = 0; i < 5; i++)
		await step(() => page.getByRole('button', { name: 'Next character', exact: true }).click());
	await page.locator('.selected-name').click();
	await expect(page.locator('#project-menu .character-thumbnail canvas')).toHaveCount(5);
	await page.keyboard.press('Escape');
	await settled();
	const final = await stats();
	expect(final.blank).toEqual([]);
	expect(final.maxPerFrame).toBe(1);
	expect(final.reads).toBe(imported.reads);
	expect(final.decodes).toBe(imported.decodes);
});
