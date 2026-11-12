import { expect, type Locator, type Page } from '@playwright/test';
import { groupLabel } from '../../src/studio/model.ts';

/** A disabled control looks the same hovered as at rest and shows the not-allowed cursor. */
export async function noDisabledHover(page: Page, locator: Locator) {
	const surface = () =>
		locator.evaluate((element) => {
			const style = getComputedStyle(element);
			return {
				background: style.backgroundColor,
				border: style.borderColor,
				color: style.color,
				cursor: style.cursor
			};
		});
	await page.mouse.move(0, 0);
	const resting = await surface();
	await locator.hover();
	expect(await surface()).toEqual(resting);
	expect(resting.cursor).toBe('not-allowed');
}

/** Enter through Characters and bring Head to the top of the Wardrobe list. */
export async function enterStudio(page: Page) {
	// First load opens IndexedDB and fixtures; under a busy full suite this can exceed the default 5s.
	await expect(page.locator('.customize-action, .experience-stage')).toBeVisible({
		timeout: 20_000
	});
	const customize = page.locator('.customize-action');
	if (await customize.count()) await customize.click();
	await expect(page.locator('.experience-stage')).toBeVisible();
	await equipmentGroup(page, 'Head');
}

export async function openStudio(page: Page, url: string, options?: Parameters<Page['goto']>[1]) {
	const response = await page.goto(url, options);
	await enterStudio(page);
	return response;
}

export async function reloadStudio(page: Page, options?: Parameters<Page['reload']>[0]) {
	const response = await page.reload(options);
	await enterStudio(page);
	return response;
}

export async function equipmentMode(page: Page, name: 'Wardrobe' | 'Colors' | 'Outfits' | 'Moves') {
	const inspect = page.getByRole('dialog', { name: 'Inspect character', exact: true });
	if (await inspect.count())
		await inspect.getByRole('button', { name: 'Done', exact: true }).click();
	await page
		.getByRole('tablist', { name: 'Customization panels', exact: true })
		.getByRole('tab', { name, exact: true })
		.click();
}

export { groupLabel };

/** Wardrobe is one list of every category; the slot rail brings a category's section to the top. */
export async function equipmentGroup(page: Page, name: string) {
	await equipmentMode(page, 'Wardrobe');
	const label = groupLabel(name);
	await page
		.getByRole('navigation', { name: 'Equipment slots', exact: true })
		.getByRole('button', { name: new RegExp(`^${label}\\b`) })
		.click();
	await expect(section(page, name)).toBeInViewport();
}

/** A category's section in the Wardrobe list. */
export const section = (page: Page, name: string) =>
	page.getByRole('region', { name: groupLabel(name), exact: true });

export async function newItem(page: Page, group = 'Head') {
	await equipmentGroup(page, group);
	await section(page, group)
		.getByRole('button', { name: `New ${groupLabel(group).toLowerCase()} item`, exact: true })
		.first()
		.click();
}

export async function selectedItemDetails(page: Page) {
	const existing = page.getByRole('dialog').filter({ has: page.locator('.insp-body') });
	if (await existing.count()) return existing;
	await equipmentMode(page, 'Wardrobe');
	// The list shows every category, so the selected item's tile is already in it; its ⋮ menu opens the details.
	const more = page.locator(
		'.equipment-scroll .tile-wrap:has(.item-tile[data-selected]) .tile-more'
	);
	await more.scrollIntoViewIfNeeded();
	await more.click();
	await page.getByRole('menuitem', { name: 'Details…', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.locator('.insp-body')).toBeVisible();
	return dialog;
}

export async function pickItem(page: Page, name: string) {
	await equipmentMode(page, 'Wardrobe');
	const item = page.locator('.equipment-scroll .item-tile').getByText(name, { exact: true });
	await item.scrollIntoViewIfNeeded();
	// Tapping a worn tile takes the item off, so tap it again to leave it worn and selected
	const worn = await page
		.locator('.equipment-scroll .item-tile[aria-pressed="true"]')
		.filter({ has: page.getByText(name, { exact: true }) })
		.count();
	await item.click();
	if (worn) await item.click();
}

/** Open Inspect from the playback bar, or from More where a narrow stage moves it (geometry.ts compactPlayback). */
export async function openInspect(page: Page) {
	const bar = page
		.getByRole('toolbar', { name: 'Preview controls', exact: true })
		.getByRole('button', { name: 'Inspect', exact: true });
	if (await bar.isVisible()) return bar.click();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page
		.locator('#experience-options')
		.getByRole('button', { name: 'Inspect', exact: true })
		.click();
}

export async function inspectStage(page: Page) {
	if (await page.getByRole('dialog', { name: 'Inspect character', exact: true }).count()) return;
	await openInspect(page);
	await expect(page.locator('.inspection-stage .stage')).toBeVisible();
}

export async function openAccount(page: Page) {
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page
		.locator('#experience-options')
		.getByRole('button', { name: /^(Connect PixelLab|PixelLab account|Key not accepted)$/ })
		.click();
}
