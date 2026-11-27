// Project folder coverage beyond export-picker.spec.ts's basic publish and conflict flows: cross-tab choices, rapid edits,
// character switches while a publish is running, the Settings deep link, phone and light layouts, and keyboard use.
import { openStudio } from './immersive-helpers.ts';
import {
	changeFolder,
	fakeProjectFolder,
	folderText,
	savedExport
} from './project-folder-helpers.ts';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

const devURL = (info: { config: { projects: { name: string; use: { baseURL?: string } }[] } }) =>
	info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!;

/** Holds every file write's close until the test releases it, so a character can be switched mid-publish. */
async function holdFolderWrites(target: Page | BrowserContext) {
	await target.addInitScript(() => {
		const w = window as unknown as {
			__folderHold?: Promise<void>;
			__release?: () => void;
			__held?: boolean;
		};
		const proto = FileSystemFileHandle.prototype as unknown as {
			createWritable: (...args: unknown[]) => Promise<FileSystemWritableFileStream>;
		};
		const original = proto.createWritable;
		proto.createWritable = async function (this: FileSystemFileHandle, ...args: unknown[]) {
			const writable = await original.apply(this, args);
			const close = writable.close.bind(writable);
			writable.close = async () => {
				if (w.__folderHold) {
					w.__held = true;
					await w.__folderHold;
				}
				return close();
			};
			return writable;
		};
	});
}

/** Adds a variant a publish definitely renders differently, so an edit changes the export's bytes. */
async function addReviewVariant(page: Page) {
	return page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts';
		const state = await import(statePath),
			db = await import(dbPath);
		const material = state.store.project.manifest.materials[0].id as string;
		await db.update(
			'projects',
			state.doc.id,
			(record: {
				manifest: {
					materials: { id: string; ramp: string[]; variants: Record<string, string[]> }[];
				};
			}) => {
				const mat = record.manifest.materials.find((m) => m.id === material)!;
				mat.variants['review-red'] = mat.ramp.map(() => '#ff0000');
				return record;
			}
		);
		await state.openProject(state.doc.id);
		return material;
	});
}

/** Changes the saved look, which schedules a folder publish when automatic updates are on. */
const setLookVariant = (page: Page, material: string, variant: string | null) =>
	page.evaluate(
		async ({ material, variant }) => {
			const statePath = '/src/studio/state.svelte.ts',
				state = await import(statePath);
			state.setVariant(material, variant);
			await state.flushSave();
		},
		{ material, variant }
	);

const inSyncVariant = async (page: Page, path: string, material: string) => {
	const text = await folderText(page, path);
	if (!text) return null;
	try {
		const manifest = JSON.parse(text);
		return (manifest.presets?.[0]?.variants?.[material] ?? null) as string | null;
	} catch {
		return 'invalid JSON';
	}
};

/** Opens Export if it is closed, then returns the Project folder card. */
async function projectFolderCard(page: Page) {
	if (!(await page.getByRole('dialog').count())) {
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(
			page.getByRole('dialog').getByRole('radio', { name: 'Godot', exact: true })
		).toBeEnabled();
	}
	return page.getByRole('dialog').getByRole('button', { name: 'Project folder', exact: true });
}

/** Export's card opens Settings at the Project folder row, with its heading focused. */
async function openProjectFolderRow(page: Page) {
	await (await projectFolderCard(page)).click();
	const row = page.getByRole('dialog').locator('[data-setting="project-folder"]');
	await expect(row.getByRole('heading', { name: 'Project folder' })).toBeFocused();
	return row;
}

const closeSheet = async (page: Page) => {
	await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
};

/** Links the stand-in folder through Settings and returns the row and the published manifest path. */
async function linkFolder(page: Page, format = 'PNG + JSON') {
	await projectFolderCard(page); // Export must be the sheet that shows the format radios.
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('radio', { name: format, exact: true }).check();
	const row = await openProjectFolderRow(page);
	await row.getByRole('button', { name: 'Choose folder…' }).click();
	await expect(row.getByRole('status')).toHaveText('Up to date');
	const sub = await page.evaluate(async () => {
		const path = '/src/studio/projectFolder.svelte.ts',
			{ projectFolder } = await import(path);
		return projectFolder.link!.subfolder as string;
	});
	return { row, sub, manifestPath: `game/${sub}/manifest.json` };
}

/** Opens the same saved character in another tab of this browser context. */
async function openCharacterIn(page: Page, dev: string, id: string) {
	await page.setViewportSize({ width: 800, height: 600 });
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem(
			'pixeldoll.tips',
			'["add-item","add-move","add-state","customize","export","gear","generate-items","new-character","pixellab"]'
		);
		localStorage.setItem('pixeldoll.visited', '1');
	});
	await openStudio(page, dev);
	await page.evaluate(async (id) => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath);
		if (state.doc.id !== id) await state.openProject(id);
		return state.doc.id;
	}, id);
}

function watchErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(`console: ${message.text()}`);
	});
	return errors;
}

test('two tabs: Unlink in one tab stops the other tab from publishing', async ({ page }, info) => {
	const dev = devURL(info);
	const context = page.context();
	await fakeProjectFolder(context);
	const errors = watchErrors(page);
	const id = await savedExport(page, dev);
	const material = await addReviewVariant(page);
	const { sub } = await linkFolder(page);
	const manifestPath = `game/${sub}/manifest.json`;
	await closeSheet(page);
	const before = await folderText(page, manifestPath);
	expect(before).not.toBeNull();

	const other = await context.newPage();
	const otherErrors = watchErrors(other);
	await openCharacterIn(other, dev, id);
	const otherRow = await openProjectFolderRow(other);
	await expect(otherRow.getByRole('checkbox', { name: 'Update automatically' })).toBeChecked();
	await otherRow.getByRole('button', { name: 'Unlink' }).click();
	await expect(otherRow.getByRole('button', { name: 'Choose folder…' })).toBeVisible();

	// The first tab still believes it is linked: its next automatic publish must notice and write nothing.
	await setLookVariant(page, material, 'review-red');
	// Its card then says what happened instead of publishing, and the folder is untouched.
	await expect(await projectFolderCard(page)).toHaveAccessibleDescription(/Not linked/);
	expect(await folderText(page, manifestPath)).toBe(before);
	expect(errors).toEqual([]);
	expect(otherErrors).toEqual([]);
});

test('two tabs: turning off Update automatically in one tab blocks the other, and Update now still works', async ({
	page
}, info) => {
	const dev = devURL(info);
	const context = page.context();
	await fakeProjectFolder(context);
	const errors = watchErrors(page);
	const id = await savedExport(page, dev);
	const material = await addReviewVariant(page);
	const { sub } = await linkFolder(page);
	const manifestPath = `game/${sub}/manifest.json`;
	await closeSheet(page);
	const before = await folderText(page, manifestPath);

	const other = await context.newPage();
	const otherErrors = watchErrors(other);
	await openCharacterIn(other, dev, id);
	const otherRow = await openProjectFolderRow(other);
	const auto = otherRow.getByRole('checkbox', { name: 'Update automatically' });
	await auto.uncheck();
	await expect(auto).not.toBeChecked();

	// A saved change in the first tab publishes nothing while the choice is off; the first tab learns the choice from
	// that publish attempt, which is what makes the unchanged file meaningful.
	await setLookVariant(page, material, 'review-red');
	await expect(await projectFolderCard(page)).toHaveAccessibleDescription(/Automatic updates off/);
	// The card also says where the files land: the picked folder's name and the character's subfolder.
	await expect(await projectFolderCard(page)).toHaveAccessibleDescription(
		new RegExp(`^game/${sub}/ `)
	);
	expect(await folderText(page, manifestPath)).toBe(before);
	const row = await openProjectFolderRow(page);
	await expect(row.getByRole('checkbox', { name: 'Update automatically' })).not.toBeChecked();
	// Update now ignores the automatic choice and publishes the latest look.
	await row.getByRole('button', { name: 'Update now' }).click();
	// The status already read Up to date before the click, so wait for the file itself.
	await expect.poll(() => inSyncVariant(page, manifestPath, material)).toBe('review-red');
	await expect(row.getByRole('status')).toHaveText('Up to date');
	// A later change leaves the folder behind, so it stops claiming to be up to date.
	await setLookVariant(page, material, null);
	await expect(row.getByRole('status')).toHaveText('');
	expect(await inSyncVariant(page, manifestPath, material)).toBe('review-red');
	expect(errors).toEqual([]);
	expect(otherErrors).toEqual([]);
});

test('rapid edits and Update now clicks settle on the last look with no repeated writes', async ({
	page
}, info) => {
	const dev = devURL(info);
	const context = page.context();
	await fakeProjectFolder(context);
	const errors = watchErrors(page);
	const id = await savedExport(page, dev);
	const material = await addReviewVariant(page);
	const { row, sub } = await linkFolder(page);
	const manifestPath = `game/${sub}/manifest.json`;

	// Five Update now clicks in quick succession: each one finds the same up-to-date folder.
	const update = row.getByRole('button', { name: 'Update now' });
	for (let i = 0; i < 5; i++) await update.click();
	await expect(row.getByRole('status')).toHaveText(/^(Already up|Up) to date/);

	// Three edits without waiting in between: the final look is what gets published once.
	await page.evaluate(async (material) => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath);
		state.setVariant(material, 'review-red');
		state.setVariant(material, null);
		state.setVariant(material, 'review-red');
		await state.flushSave();
	}, material);
	await expect.poll(() => inSyncVariant(page, manifestPath, material)).toBe('review-red');
	await expect(row.getByRole('status')).toHaveText('Up to date');
	// One more click rewrites nothing.
	const settled = await folderText(page, manifestPath);
	await update.click();
	await expect(row.getByRole('status')).toHaveText('Already up to date');
	expect(await folderText(page, manifestPath)).toBe(settled);
	expect(JSON.parse(settled!).name).toBe('Export settings test');
	expect(errors).toEqual([]);
	expect(id).toBeTruthy();
});

test('switching characters while a publish is running keeps the folder and the open character apart', async ({
	page
}, info) => {
	const dev = devURL(info);
	const context = page.context();
	await fakeProjectFolder(context);
	await holdFolderWrites(context);
	const errors = watchErrors(page);
	const id = await savedExport(page, dev);
	const material = await addReviewVariant(page);
	const { row, sub } = await linkFolder(page);
	const manifestPath = `game/${sub}/manifest.json`;
	await closeSheet(page);

	const second = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath);
		// The demo is a distinct character with no folder of its own.
		return state.DEMO as string;
	});

	// An edit's automatic publish stops inside its first file write until the test says so.
	await page.evaluate(() => {
		const w = window as unknown as { __folderHold?: Promise<void>; __release?: () => void };
		w.__folderHold = new Promise<void>((resolve) => (w.__release = resolve));
	});
	await (await projectFolderCard(page)).click();
	await setLookVariant(page, material, 'review-red');
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { __held?: boolean }).__held))
		.toBe(true);
	await expect(row.getByRole('status')).toHaveText('Updating…');
	// The button says so too, and the line under it keeps its place, hidden, instead of collapsing.
	await expect(row.getByRole('button', { name: 'Updating…' })).toBeVisible();
	await expect(row.locator('.summary')).toHaveCSS('visibility', 'hidden');

	// Switch to the other character before the held publish finishes.
	const opened = await page.evaluate(async (second) => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath);
		await state.openProject(second);
		return state.doc.id;
	}, second);
	expect(opened).toBe(second);
	if (await page.getByRole('dialog').count()) await closeSheet(page);
	await expect(await projectFolderCard(page)).toHaveAccessibleDescription(/Not linked/);
	const secondRow = await openProjectFolderRow(page);
	await expect(secondRow.getByRole('button', { name: 'Choose folder…' })).toBeVisible();
	await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);

	await page.evaluate(() => {
		const w = window as unknown as { __release?: () => void };
		w.__release?.();
	});
	// The held publish finishes into the first character's folder, not the open one.
	await expect.poll(() => inSyncVariant(page, manifestPath, material)).toBe('review-red');
	// Back on the first character the held publish completed normally.
	await page.evaluate(async (id) => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath);
		await state.openProject(id);
	}, id);
	if (await page.getByRole('dialog').count()) await closeSheet(page);
	const firstRow = await openProjectFolderRow(page);
	await expect(firstRow.getByRole('status')).toHaveText(/^(Already up|Up) to date/);
	await expect(firstRow.getByRole('alert')).toHaveCount(0);
	const published = await folderText(page, manifestPath);
	expect(JSON.parse(published!).name).toBe('Export settings test');
	expect(await inSyncVariant(page, manifestPath, material)).not.toBe('invalid JSON');
	expect(errors).toEqual([]);
});

test('the Project folder card deep-links Settings, repeats safely, returns to Export, and Settings search finds it', async ({
	page
}, info) => {
	const dev = devURL(info);
	const context = page.context();
	await fakeProjectFolder(context);
	const errors = watchErrors(page);
	await savedExport(page, dev);
	await addReviewVariant(page);
	const { sub } = await linkFolder(page);

	// Back returns to Export, not to the Settings index.
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Back to Export', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveAccessibleName('Export');
	await expect(await projectFolderCard(page)).toHaveAccessibleDescription(/Automatic updates on/);

	// The card's own Update now checks the folder even when nothing changed: it writes nothing, yet the update time moves.
	const publishedAt = () =>
		page.evaluate(async () => {
			const path = '/src/studio/projectFolder.svelte.ts',
				{ projectFolder } = await import(path);
			return projectFolder.link?.publishedAt as string | undefined;
		});
	const before = await publishedAt();
	const manifest = await folderText(page, `game/${sub}/manifest.json`);
	await dialog.getByRole('button', { name: 'Update now', exact: true }).click();
	await expect.poll(publishedAt).not.toBe(before);
	expect(await folderText(page, `game/${sub}/manifest.json`)).toBe(manifest);

	// Reopening repeatedly reveals one row and focuses its heading every time.
	for (let i = 0; i < 3; i++) {
		const row = await openProjectFolderRow(page);
		await expect(row).toHaveCount(1);
		await expect(row).toBeInViewport();
		await expect(row).toHaveAttribute('data-highlight', '');
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Back to Export', exact: true })
			.click();
		await expect(page.getByRole('dialog')).toHaveAccessibleName('Export');
	}

	// Settings search still opens the row and focuses its first control.
	await closeSheet(page);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	const search = settings.getByRole('searchbox', { name: 'Search settings' });
	await expect(search).toBeFocused();
	await search.fill('project folder');
	const result = settings.getByRole('button', { name: /Project folder/ });
	await expect(result).toBeVisible();
	await result.click();
	const searchRow = settings.locator('[data-setting="project-folder"]');
	await expect(searchRow).toBeVisible();
	await expect(searchRow.getByRole('checkbox', { name: 'Update automatically' })).toBeFocused();
	// A second search and result keeps working after navigating into the page.
	await search.fill('project folder');
	await settings.getByRole('button', { name: /Project folder/ }).click();
	await expect(searchRow.getByRole('checkbox', { name: 'Update automatically' })).toBeFocused();
	expect(errors).toEqual([]);
});

test('notice Review opens the paused row while Export is open, and a deleted folder is listed for approval after Change folder', async ({
	page
}, info) => {
	const dev = devURL(info);
	const context = page.context();
	await fakeProjectFolder(context);
	const errors = watchErrors(page);
	await savedExport(page, dev);
	const material = await addReviewVariant(page);
	const { sub } = await linkFolder(page);
	const manifestPath = `game/${sub}/manifest.json`;
	// Back to Export with the folder still linked.
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Back to Export', exact: true })
		.click();
	await expect(page.getByRole('dialog')).toHaveAccessibleName('Export');

	// A game edit pauses the background publish and the toast's Review opens this row.
	await changeFolder(page, manifestPath, { text: '{"edited":"in the game"}' });
	await setLookVariant(page, material, 'review-red');
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Updates paused: files in the folder changed.');
	await toast.getByRole('button', { name: 'Review' }).click();
	const paused = page.getByRole('dialog').locator('[data-setting="project-folder"]');
	await expect(paused.getByRole('heading', { name: 'Project folder' })).toBeFocused();
	await expect(paused.getByRole('alert')).toContainText('manifest.json');
	await expect(paused.getByRole('alert')).toContainText('Edited outside PixelDoll');
	// Copy path copies the full destination path, and says so on the button.
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await paused.getByRole('button', { name: 'Copy path' }).first().click();
	await expect(paused.getByRole('button', { name: 'Path copied' }).first()).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		`game/${sub}/manifest.json`
	);
	await expect(
		page.getByRole('dialog').getByRole('button', { name: 'Back to Export', exact: true })
	).toBeVisible();
	await paused.getByRole('button', { name: 'Replace listed files' }).click();
	await expect(paused.getByRole('status')).toHaveText('Up to date');
	expect(JSON.parse((await folderText(page, manifestPath))!).name).toBe('Export settings test');
	// The resolved pause takes its notice down by itself.
	await expect(page.getByText('Updates paused: files in the folder changed.')).toHaveCount(0);

	// Deleting the whole folder says so, then choosing it again republishes everything.
	await page.evaluate(async () =>
		(await navigator.storage.getDirectory()).removeEntry('game', { recursive: true })
	);
	await paused.getByRole('button', { name: 'Update now' }).click();
	await expect(paused.getByRole('alert')).toContainText('Folder not found.');
	await page.evaluate(async () =>
		(await navigator.storage.getDirectory()).getDirectoryHandle('game', { create: true })
	);
	await paused.getByRole('button', { name: 'Change folder' }).click();
	// The user deleted PixelDoll's files, so choosing the folder again lists them for approval rather than quietly
	// putting them back, and nothing is written before that approval.
	await expect(paused.getByRole('alert')).toContainText('Deleted');
	expect(await folderText(page, manifestPath)).toBeNull();
	await paused.getByRole('button', { name: 'Replace listed files' }).click();
	await expect(paused.getByRole('status')).toHaveText('Up to date');
	expect(JSON.parse((await folderText(page, manifestPath))!).name).toBe('Export settings test');
	expect(errors).toEqual([]);
});
test('choosing a folder that already holds this export offers once to keep those files updated', async ({
	page
}, info) => {
	const dev = devURL(info);
	await fakeProjectFolder(page.context());
	const errors = watchErrors(page);
	const id = await savedExport(page, dev);
	const { row, manifestPath } = await linkFolder(page);
	// Unlinked, PixelDoll forgets which files it wrote: linking again finds its own files as someone else's.
	await row.getByRole('button', { name: 'Unlink' }).click();
	await row.getByRole('button', { name: 'Choose folder…' }).click();
	await expect(row.locator('.offer')).toContainText(
		/files in this folder already match PixelDoll’s export/
	);
	await expect(row.locator('.summary-text')).toHaveText('Up to date');
	// Unanswered, the offer is still there after a reload.
	await openCharacterIn(page, dev, id);
	const reopened = await openProjectFolderRow(page);
	const offer = reopened.locator('.offer');
	await expect(offer).toContainText(/files in this folder already match PixelDoll’s export/);
	await offer.getByRole('button', { name: 'Keep updated' }).click();
	await expect(offer).toHaveCount(0);
	// Kept updated, they are PixelDoll's again: one the user deletes now is listed for approval, not recreated.
	await changeFolder(page, manifestPath, { remove: true });
	await reopened.getByRole('button', { name: 'Update now' }).click();
	await expect(reopened.getByRole('alert')).toContainText('Deleted');
	expect(await folderText(page, manifestPath)).toBeNull();
	expect(errors).toEqual([]);
});

test('a Godot link publishes its runtime once into PixelDoll and pauses on an edited runtime file', async ({
	page
}, info) => {
	const dev = devURL(info);
	await fakeProjectFolder(page.context());
	const errors = watchErrors(page);
	await savedExport(page, dev);
	const { row, sub } = await linkFolder(page, 'Godot');
	const runtime = 'game/PixelDoll/godot/paperdoll.gd';
	await expect(row).toContainText('Shared runtime: game/PixelDoll/godot/');
	const published = await folderText(page, runtime);
	expect(published).toContain('extends');
	// The character keeps only its own files, and its scene names the shared script.
	expect(await folderText(page, `game/${sub}/godot/paperdoll.gd`)).toBeNull();
	expect(await folderText(page, `game/${sub}/godot/Paperdoll.tscn`)).toContain(
		'path="../../PixelDoll/godot/paperdoll.gd"'
	);
	// An edit to the shared runtime pauses the update and is listed with its real path; Replace restores it.
	await changeFolder(page, runtime, { text: '# my edit' });
	await row.getByRole('button', { name: 'Update now' }).click();
	const alert = row.getByRole('alert');
	await expect(alert).toContainText('PixelDoll/godot/paperdoll.gd');
	await expect(alert).toContainText('Edited outside PixelDoll');
	await row.getByRole('button', { name: 'Replace listed files' }).click();
	await expect(row.getByRole('status')).toHaveText('Up to date');
	expect(await folderText(page, runtime)).toBe(published);
	expect(errors).toEqual([]);
});

test('phone width, light theme and keyboard-only use show a readable Project folder row', async ({
	page
}, info) => {
	const dev = devURL(info);
	const context = page.context();
	await fakeProjectFolder(context);
	const errors = watchErrors(page);
	await page.addInitScript(() => localStorage.setItem('pixeldoll.theme', 'light'));
	const id = await savedExport(page, dev);
	await addReviewVariant(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.dataset.theme))
		.toBe('light');
	// Not linked yet, Export's card wraps its longer state line instead of widening the sheet past the screen.
	const right = async (locator: Locator) => {
		const box = (await locator.boundingBox())!;
		return box.x + box.width;
	};
	expect(await right(await projectFolderCard(page))).toBeLessThanOrEqual(390);
	expect(await right(page.getByRole('dialog'))).toBeLessThanOrEqual(390);
	await linkFolder(page);
	expect(id).toBeTruthy();
	// The link click left focus on the (now replaced) Choose button, so re-enter as Export's card does.
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Back to Export', exact: true })
		.click();
	const row = await openProjectFolderRow(page);

	// Everything fits the phone width: no clipped or overflowing destination text or buttons.
	const overflow = await row.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const controls = [...element.querySelectorAll('button')].map((button) =>
			button.getBoundingClientRect()
		);
		return {
			scrollWidth: element.scrollWidth,
			clientWidth: element.clientWidth,
			right: box.right,
			controlRight: Math.max(...controls.map((control) => control.right), 0)
		};
	});
	expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
	expect(overflow.right).toBeLessThanOrEqual(390);
	expect(overflow.controlRight).toBeLessThanOrEqual(390);

	// The heading is focused by the deep link; Tab reaches each control without a mouse.
	const heading = row.getByRole('heading', { name: 'Project folder' });
	await expect(heading).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(row.getByRole('checkbox', { name: 'Update automatically' })).toBeFocused();
	await page.keyboard.press('Tab');
	const update = row.getByRole('button', { name: 'Update now' });
	await expect(update).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(row.getByRole('button', { name: 'Change folder' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(row.getByRole('button', { name: 'Unlink' })).toBeFocused();
	// Back to Update now with the keyboard and run it.
	await page.keyboard.press('Shift+Tab');
	await page.keyboard.press('Shift+Tab');
	await expect(update).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(row.getByRole('status')).toHaveText(/^(Already up|Up) to date/);
	expect(errors).toEqual([]);
});
