import {
	openStudio,
	reloadStudio,
	enterStudio,
	equipmentMode,
	equipmentGroup,
	newItem,
	selectedItemDetails,
	openItemSection,
	inspectStage,
	openAccount,
	pickItem,
	section,
	playbackPicker,
	selectPlaybackClip
} from './immersive-helpers.ts';
import {
	expect,
	test,
	type BrowserContext,
	type Locator,
	type Page,
	type TestInfo
} from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unzip, zip } from '../../src/lib/store/zip.ts';
import { CURRENT_FORMAT, type Manifest } from '../../src/lib/store/manifest.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { CharacterApi } from '../fixtures/character-api.ts';
import { itemSheetCells, itemSheetLayout, itemSheetWindows } from '../../src/lib/items/items.ts';
import { answer, sheetCharacter } from '../fixtures/item-sheet.ts';
import './studio-thumbnails.ts';
import './dialog-dismissal.ts';

test.beforeEach(async ({ context }) => {
	await context.route('https://*.pixellab.ai/**', (route) => route.abort()); // stay offline by default; a test's own route overrides this
});

test('Audio settings start after a gesture and preserve independent levels and mutes', async ({
	page,
	baseURL
}) => {
	const audioRequests: string[] = [];
	page.on('request', (request) => {
		if (/audioPlayback|studio-ambient-[^/]+\.flac/.test(request.url()))
			audioRequests.push(request.url());
	});
	await page.addInitScript(() => {
		const calls = {
			opened: 0,
			loops: 0,
			musicStarts: 0,
			musicStopTime: 0,
			failed: false,
			gainTargets: [] as number[]
		};
		Object.defineProperty(window, 'audioTestCalls', { value: calls });
		Object.defineProperty(window, 'AudioContext', {
			value: class extends EventTarget {
				state = 'suspended';
				currentTime = 0;
				constructor() {
					super();
					calls.opened++;
				}
				async resume() {
					this.state = 'running';
					this.dispatchEvent(new Event('statechange'));
				}
				async close() {
					this.state = 'closed';
				}
				createGain() {
					const noop = () => {};
					return {
						connect: noop,
						disconnect: noop,
						gain: {
							value: 0,
							setTargetAtTime: (level: number) => calls.gainTargets.push(level),
							setValueAtTime: noop,
							cancelScheduledValues: noop,
							linearRampToValueAtTime: noop
						}
					};
				}
				createBuffer(_channels: number, frames: number, rate: number) {
					return { duration: frames / rate, getChannelData: () => new Float32Array(frames) };
				}
				async decodeAudioData() {
					return this.createBuffer(1, 240, 24_000);
				}
				createBufferSource() {
					return {
						loop: false,
						onended: null as (() => void) | null,
						detune: { value: 0 },
						connect() {},
						disconnect() {},
						start() {
							if (!this.loop && document.body.hasAttribute('data-fail-audio')) {
								calls.failed = true;
								throw new DOMException('Synthetic audio start failure', 'NotSupportedError');
							}
							if (this.loop) {
								calls.loops++;
								calls.musicStarts++;
							}
						},
						stop(when = 0) {
							if (this.loop) {
								calls.loops--;
								calls.musicStopTime = when;
							}
							this.onended?.();
						}
					};
				}
			}
		});
	});
	const calls = () => page.evaluate(() => Reflect.get(window, 'audioTestCalls'));
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	const master = settings.getByRole('switch', { name: 'Play all audio', exact: true });
	const musicSwitch = settings.getByRole('switch', { name: 'Music', exact: true });
	const effectsSwitch = settings.getByRole('switch', { name: 'Sound effects', exact: true });
	const music = settings.getByRole('slider', { name: 'Music volume', exact: true });
	const effects = settings.getByRole('slider', { name: 'Sound effects volume', exact: true });
	const topBar = page.locator('.experience-header');
	const shortcut = topBar.locator('.header-audio');
	const expectAlignedAudioRows = async () => {
		const [masterBox, musicBox, effectsBox, musicToggle, effectsToggle] = await Promise.all(
			[master, music, effects, musicSwitch, effectsSwitch].map((control) => control.boundingBox())
		);
		for (const [slider, toggle] of [
			[musicBox!, musicToggle!],
			[effectsBox!, effectsToggle!]
		]) {
			expect(slider.y + slider.height / 2).toBeCloseTo(toggle.y + toggle.height / 2, 0);
			expect(toggle.x + toggle.width).toBeCloseTo(masterBox!.x + masterBox!.width, 0);
			expect(toggle.x).toBeGreaterThan(slider.x + slider.width);
			expect(slider.width).toBeGreaterThanOrEqual(44);
		}
	};
	await page.goto(baseURL!);
	const customize = page.locator('.customize-action');
	await expect(customize).toBeVisible();
	await customize.dispatchEvent('pointerdown', { pointerType: 'mouse' });
	await expect(shortcut).toBeVisible();
	const newCharacter = topBar.getByRole('button', { name: 'New character', exact: true });
	await expect(newCharacter).toBeVisible();
	expect((await shortcut.boundingBox())!.x).toBeLessThan((await newCharacter.boundingBox())!.x);
	expect(await calls()).toMatchObject({ opened: 0, loops: 0 });
	expect(audioRequests).toEqual([]);
	await enterStudio(page);
	await expect(shortcut).toBeVisible();
	await expect.poll(calls).toMatchObject({ opened: 1, loops: 1 });
	expect(audioRequests).toEqual([
		expect.stringMatching(/assets\/audioPlayback-.*\.js/),
		expect.stringMatching(/assets\/studio-ambient-[^/]+\.flac/)
	]);
	const loop = await page.evaluate(async (url) => {
		const rate = 48_000;
		const halfSecond = rate / 2;
		const offline = new OfflineAudioContext(1, rate, rate);
		const response = await fetch(url);
		const track = await offline.decodeAudioData(await response.arrayBuffer());
		const source = offline.createBufferSource();
		source.buffer = track;
		source.loop = true;
		source.connect(offline.destination);
		source.start(0, track.duration - 0.5);
		const rendered = (await offline.startRendering()).getChannelData(0);
		const original = track.getChannelData(0);
		let wrapError = 0;
		let nearbyStep = 0;
		let before = 0;
		let after = 0;
		for (let i = 0; i < halfSecond; i++) {
			const tail = rendered[i]!;
			const head = rendered[halfSecond + i]!;
			wrapError = Math.max(
				wrapError,
				Math.abs(tail - original[original.length - halfSecond + i]!),
				Math.abs(head - original[i]!)
			);
			before += tail * tail;
			after += head * head;
			if (i)
				nearbyStep = Math.max(
					nearbyStep,
					Math.abs(tail - rendered[i - 1]!),
					Math.abs(head - rendered[halfSecond + i - 1]!)
				);
		}
		return {
			frames: track.length,
			wrapError,
			levelDifference: Math.abs(10 * Math.log10(before / after)),
			seamStep: Math.abs(rendered[halfSecond]! - rendered[halfSecond - 1]!),
			nearbyStep
		};
	}, audioRequests[1]!);
	expect(loop.frames).toBe(160 * 48_000);
	expect(loop.wrapError).toBeLessThan(1e-5);
	expect(loop.levelDifference).toBeLessThan(0.2);
	expect(loop.seamStep).toBeLessThan(loop.nearbyStep);
	await expect(page.locator('.header-audio + .header-random')).toBeVisible();
	await shortcut.click();
	await expect(master).toBeChecked();
	await expect(musicSwitch).toBeChecked();
	await expect(effectsSwitch).toBeChecked();
	await expect(music).toHaveValue('50');
	await expect(effects).toHaveValue('50');
	const { gainTargets } = await calls();
	expect(gainTargets[0]).toBeCloseTo(0.05761, 5);
	expect(gainTargets[1]).toBeCloseTo(0.13796, 5);
	await music.press('End');
	await expect.poll(async () => (await calls()).gainTargets.at(-1)).toBeCloseTo(0.4, 5);
	await music.fill('50');
	await settings.getByRole('button', { name: 'Appearance', exact: true }).click();
	await settings.getByRole('radio', { name: 'Light', exact: true }).check();
	await settings.getByRole('button', { name: 'Audio', exact: true }).click();
	await expect(master).toBeChecked();
	expect(await calls()).toMatchObject({ loops: 1, musicStarts: 1 });
	await expectAlignedAudioRows();
	await effects.press('End');
	await expect(effects).toHaveValue('100');
	await expect(music).toHaveValue('50');
	expect((await calls()).gainTargets.at(-1)).toBeCloseTo(0.25, 5);
	await effects.press('ArrowLeft');
	await musicSwitch.uncheck();
	await expect(shortcut).toBeVisible();
	await expect.poll(calls).toMatchObject({ opened: 1, loops: 0, musicStopTime: 0.05 });
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await shortcut.click();
	await expect(musicSwitch).not.toBeChecked();
	await expect(effectsSwitch).toBeChecked();
	await effectsSwitch.uncheck();
	await expect(shortcut).toHaveCSS('display', 'none');
	await musicSwitch.check();
	await expect(shortcut).toBeVisible();
	await music.press('Home');
	await expect(shortcut).toHaveCSS('display', 'none');
	await music.fill('50');
	await expect(shortcut).toBeVisible();
	await master.uncheck();
	await expect(shortcut).toHaveCSS('display', 'none');
	await master.check();
	await expect(shortcut).toBeVisible();
	await expect(effectsSwitch).not.toBeChecked();
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	expect(await calls()).toMatchObject({ opened: 1, loops: 0, musicStopTime: 0 });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.reload();
	await expect(page.locator('.customize-action, .experience-stage')).toBeVisible();
	expect(await calls()).toMatchObject({ opened: 0, loops: 0 });
	await enterStudio(page);
	await shortcut.click();
	await expect(master).toBeChecked();
	await expect(effectsSwitch).not.toBeChecked();
	await expect(effects).toHaveValue('99');
	await expect(music).toHaveValue('50');
	await page.setViewportSize({ width: 320, height: 568 });
	await expectAlignedAudioRows();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect.poll(calls).toMatchObject({ opened: 1, loops: 1 });
	await effectsSwitch.check();
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(settings).toBeHidden();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const tile = page.locator('[data-tile="hat_wizard"]');
	await tile.focus();
	await page.evaluate(() => document.body.setAttribute('data-fail-audio', ''));
	await tile.press('Enter');
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(calls).toMatchObject({ opened: 1, loops: 1, failed: true });
	expect(errors).toEqual([]);

	await shortcut.click();
	await master.uncheck();
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await page.setViewportSize({ width: 320, height: 568 });
	await expect(shortcut).toHaveCSS('display', 'none');
	await page.getByRole('button', { name: 'Characters', exact: true }).click();
	await expect(shortcut).toHaveCSS('display', 'none');
	await topBar.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	await expect(master).not.toBeChecked();
	await master.check();
	await expect(shortcut).toBeVisible();
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const creator = page.getByRole('dialog', { name: 'New character', exact: true });
	const draftName = creator.getByRole('textbox', { name: 'Name', exact: true });
	const creatorScreen = page.locator('dialog.character-sheet:modal');
	await draftName.fill('Audio draft');
	await creator.getByRole('button', { name: 'Audio settings', exact: true }).click();
	await expect(settings).toBeVisible();
	await expect(creatorScreen).toBeVisible();
	await expect(settings.locator(':focus')).toHaveCount(1);
	await expect(creatorScreen.locator('.character-name')).toHaveValue('Audio draft');
	await master.uncheck();
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(draftName).toHaveValue('Audio draft');
	await expect(creator.locator('.header-audio')).toHaveCSS('display', 'none');
	await draftName.press('ControlOrMeta+,');
	await expect(settings).toBeVisible();
	await expect(creatorScreen).toBeVisible();
	await page.goBack();
	await expect(settings.getByRole('button', { name: 'Audio', exact: true })).toBeVisible();
	await page.goBack();
	await expect(settings).toBeHidden();
	await expect(draftName).toHaveValue('Audio draft');
});

async function reviewSelectedDraft(page: Page) {
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openGenerationReview(state.ui.selected.slice(4));
	});
}

async function standingItemCharacter(page: Page) {
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		const projectPath = '/src/lib/store/project.ts',
			project = await import(projectPath);
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await s.copyDemo();
		const ctx = await project.loadProject(s.doc.id),
			m = ctx.rec.manifest;
		// A standing frame keeps the real pipeline small; the API duplicates it to meet the two-frame edit minimum.
		const walk = m.rig.animations.find((a: { id: string }) => a.id === 'walk');
		m.rig.animations = [
			{ ...walk, id: 'custom-standing', cells: 1, frames: walk.frames.slice(0, 1) }
		];
		m.rig.directions = m.rig.directions.filter((d: { id: string }) => d.id === 'south');
		delete m.rig.rest;
		m.items = m.items.filter((item: { id: string }) => item.id === m.rig.baseItem);
		const base = m.items[0].layers[0];
		base.cells = { 'custom-standing': { south: base.cells.walk.south.slice(0, 1) } };
		await db.put('projects', ctx.rec.id, ctx.rec);
		await s.openProject(ctx.rec.id);
	});
}

async function expectGenerationTileGeometry(tile: Locator, running = true) {
	const bounds = await tile.evaluate((element) => {
		const rect = element.getBoundingClientRect(),
			empty = element.closest('.slot-tiles')!.querySelector('.item-tile[data-variant="empty"]')!,
			emptyRect = empty.getBoundingClientRect(),
			emptyIcon = empty.querySelector('.bu-tile-art svg')!.getBoundingClientRect(),
			name = element.querySelector('.tile-name')!,
			time = element.querySelector('.generation-time')!,
			ring = element.querySelector('.generation-ring')?.getBoundingClientRect(),
			percent = element.querySelector('.generation-percent')?.getBoundingClientRect();
		const line = (node: Element) => {
			const box = node.getBoundingClientRect(),
				style = getComputedStyle(node);
			return {
				height: box.height,
				lineHeight: parseFloat(style.lineHeight),
				top: box.top,
				bottom: box.bottom,
				left: box.left,
				right: box.right,
				whiteSpace: style.whiteSpace,
				overflow: style.overflow,
				ellipsis: style.textOverflow,
				color: style.color
			};
		};
		return {
			height: rect.height,
			width: rect.width,
			emptyHeight: emptyRect.height,
			emptyWidth: emptyRect.width,
			left: rect.left,
			right: rect.right,
			bottom: rect.bottom,
			name: line(name),
			time: line(time),
			emptyNameBottom:
				empty.querySelector('.bu-tile-label')!.getBoundingClientRect().bottom - emptyRect.top,
			ring: ring && {
				mask: getComputedStyle(element.querySelector('.generation-ring')!).maskImage,
				width: ring.width,
				height: ring.height,
				top: ring.top,
				bottom: ring.bottom,
				centerX: ring.x + ring.width / 2 - rect.x,
				centerY: ring.y + ring.height / 2 - rect.y
			},
			iconCenterY: emptyIcon.y + emptyIcon.height / 2 - emptyRect.y,
			percent: percent && {
				top: percent.top,
				bottom: percent.bottom,
				height: percent.height,
				lineHeight: parseFloat(
					getComputedStyle(element.querySelector('.generation-percent')!).lineHeight
				)
			}
		};
	});
	expect(bounds.height).toBe(102);
	expect(bounds.height).toBe(bounds.emptyHeight);
	expect(bounds.width).toBeCloseTo(bounds.emptyWidth, 1);
	for (const line of [bounds.name, bounds.time]) {
		expect(line.height).toBeCloseTo(line.lineHeight, 1);
		expect(line.whiteSpace).toBe('nowrap');
		expect(line.overflow).toBe('hidden');
		expect(line.ellipsis).toBe('ellipsis');
		expect(line.left).toBeGreaterThanOrEqual(bounds.left);
		expect(line.right).toBeLessThanOrEqual(bounds.right);
		expect(line.bottom).toBeLessThanOrEqual(bounds.bottom);
	}
	expect(bounds.time.color).not.toBe(bounds.name.color);
	expect(bounds.time.bottom).toBeCloseTo(bounds.name.top, 1);
	expect(bounds.name.bottom - (bounds.bottom - bounds.height)).toBeCloseTo(
		bounds.emptyNameBottom,
		1
	);
	if (running) {
		expect(bounds.ring!.mask).toContain('2.5px');
		expect(bounds.ring!.width).toBe(24);
		expect(bounds.ring!.height).toBe(24);
		expect(bounds.ring!.centerX).toBeCloseTo(bounds.width / 2, 1);
		expect(bounds.ring!.centerY).toBeCloseTo(bounds.iconCenterY, 1);
		expect(bounds.percent!.height).toBeCloseTo(bounds.percent!.lineHeight, 1);
		expect(bounds.percent!.bottom).toBeLessThanOrEqual(bounds.ring!.top);
		expect(bounds.ring!.bottom).toBeLessThanOrEqual(bounds.time.top);
	}
}

async function showNotification(
	page: Page,
	message: string,
	options?: Parameters<typeof import('../../src/studio/state.svelte.ts').toast>[1]
) {
	await page.evaluate(
		async ({ message, options }) => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			state.toast(message, options);
		},
		{ message, options }
	);
}

test('Settings About opens a page with build details and copies them', async ({ page }, info) => {
	const openSettings = async () => {
		await page.getByRole('button', { name: 'More options', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Help...', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	};
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await page.goto('/');
	await openSettings();
	const about = settings.getByRole('button', { name: 'About', exact: true });
	const aboutIcon = about.locator('svg.lucide-info');
	const aboutLabel = about.getByText('About', { exact: true });
	const iconX = (await aboutIcon.boundingBox())?.x;
	const labelX = (await aboutLabel.boundingBox())?.x;
	await about.press('Enter');
	const heading = settings.getByRole('heading', { name: 'About', exact: true });
	await expect(heading).toBeFocused();
	expect((await aboutIcon.boundingBox())?.x).toBe(iconX);
	expect((await aboutLabel.boundingBox())?.x).toBe(labelX);
	await expect(settings.getByText('Pre-release', { exact: true })).toBeVisible();
	const version = await settings.getByText(/^Version \d+\.\d+\.\d+$/).innerText();
	const repository = 'https://github.com/Shilo/PixelDoll';
	const source = settings.getByRole('button', { name: 'Open source Shilo/PixelDoll', exact: true });
	await expect(settings.getByText('Powered by PixelLab.', { exact: true })).toBeVisible();
	await expect(settings.getByText(/^Dress up your 2D game characters/)).toBeVisible();
	const commit = settings.getByRole('button', { name: /^View commit [a-f0-9]{7}$/i });
	const copy = settings.getByRole('button', { name: 'Copy details', exact: true });
	const panelWidth = await settings.locator('.settings-panel').evaluate((panel) => {
		const style = getComputedStyle(panel);
		return panel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
	});
	for (const action of [source, commit, copy]) {
		await expect(action).toHaveCSS('border-top-style', 'solid');
		expect((await action.boundingBox())?.width).toBeCloseTo(panelWidth, 0);
	}
	const opened = await page.evaluateHandle(() => {
		const calls: string[][] = [];
		window.open = (...args) => {
			calls.push(args.map(String));
			return null;
		};
		return calls;
	});
	await source.click();
	await commit.click();
	const targets = await opened.jsonValue();
	const hash = targets[1]?.[0]?.split('/').at(-1);
	expect(hash).toMatch(/^[a-f0-9]{7,40}$/i);
	expect(targets).toEqual([
		[repository, '_blank', 'noopener,noreferrer'],
		[`${repository}/commit/${hash}`, '_blank', 'noopener,noreferrer']
	]);
	await expect(source.locator('svg.lucide-external-link')).toBeVisible();
	await expect(commit.locator('svg.lucide-external-link')).toBeVisible();
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await copy.click();
	await expect
		.poll(() =>
			page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'))
		)
		.toBe(
			['PixelDoll', version, 'Pre-release', repository, `${repository}/commit/${hash}`].join('\n')
		);
	await page.setViewportSize({ width: 320, height: 568 });
	await expect(source).toBeInViewport();
	await settings.getByRole('button', { name: 'Back to Settings', exact: true }).click();
	await expect(about).toBeVisible();
	await about.press('Enter');
	await expect(heading).toBeFocused();
	await expect(heading).toHaveCSS('clip-path', 'none');
	const compactHeader = settings.locator('.sheet-head');
	const headerBounds = await compactHeader.boundingBox();
	const titleBounds = await compactHeader.getByText('About', { exact: true }).boundingBox();
	expect(headerBounds).not.toBeNull();
	expect(titleBounds).not.toBeNull();
	expect(
		Math.abs(titleBounds!.x + titleBounds!.width / 2 - (headerBounds!.x + headerBounds!.width / 2))
	).toBeLessThanOrEqual(1);
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await page.goto(dev);
	await page.setViewportSize({ width: 844, height: 390 });
	await openSettings();
	await expect(settings.getByRole('button', { name: 'Back to Settings', exact: true })).toHaveCount(
		0
	);
	await about.click();
	await expect(settings.getByText(/^Version \d+\.\d+\.\d+-dev$/)).toBeVisible();
	await expect(settings.getByText('Development', { exact: true })).toBeVisible();
	await expect(settings.getByRole('button', { name: 'Check for updates' })).toHaveCount(0);
	await settings
		.getByRole('searchbox', { name: 'Search settings', exact: true })
		.fill('check for updates');
	await expect(settings.getByRole('status')).toHaveText('No settings match your search.');
});

test.describe('Settings on a touchscreen', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('keeps search unfocused until tapped', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'More options', exact: true }).tap();
		await page.getByRole('button', { name: 'Settings...', exact: true }).tap();
		const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
		const search = settings.getByRole('searchbox', { name: 'Search settings', exact: true });
		await expect(search).toBeVisible();
		await expect(search).not.toBeFocused();
		await settings.getByRole('button', { name: 'About', exact: true }).tap();
		await settings.getByRole('button', { name: 'Back to Settings', exact: true }).tap();
		await expect(search).toBeVisible();
		await expect(search).not.toBeFocused();
		await search.tap();
		await expect(search).toBeFocused();
	});
});

test('notifications support optional titles, keyboard dismissal and visible errors inside dialogs', async ({
	page
}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await page.goto(dev);
	const notice = page.locator('.toast');
	await expect(notice.locator('.bu-notice-content > strong')).toHaveText(
		/^Pre-release · v\d+\.\d+\.\d+/
	);
	await expect(notice.locator('.bu-small strong')).toHaveText(
		'Saved characters may stop working after updates.'
	);
	await expect(notice.locator('[data-tone]')).toHaveAttribute('data-tone', 'warning');
	await expect(notice).not.toContainText('—');
	const world = page.locator('.selection-world');
	await world.focus();
	const dismiss = () => notice.getByRole('button', { name: 'Dismiss notification' });
	await dismiss().focus();
	await page.keyboard.press('Enter');
	await expect(notice).toHaveCount(0);
	await expect(world).toBeFocused();
	await showNotification(page, 'Preparing download...', { pending: true });
	await expect(notice).toContainText('Preparing download...');
	await expect(notice.locator('.bu-notice-indicator .ring.spin')).toBeVisible();
	await expect(notice.locator('.bu-notice > svg')).toHaveCount(0);
	await showNotification(page, 'Saved changes');
	await expect(notice.locator('.bu-notice-indicator')).toHaveCount(0);
	await expect(notice).toContainText('Saved changes');
	await expect(notice.locator('strong')).toHaveCount(0);
	await dismiss().click();
	await enterStudio(page);
	await showNotification(page, 'Preview details', {
		title: 'Preview',
		tone: 'warning',
		duration: 0
	});
	await expect(notice).toContainText('Preview details');
	await expect(
		notice.getByRole('button', { name: 'Report this problem', exact: true })
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(notice).toHaveCount(0);
	await showNotification(page, 'Could not save your character.', { tone: 'danger' });
	await expect(dialog.getByRole('alert')).toContainText('Could not save your character.');
	await showNotification(page, 'Downloaded example.zip');
	await expect(dialog.getByRole('alert')).toContainText('Could not save your character.');
	await expect(notice).not.toContainText('Downloaded example.zip');
	await dismiss().click();
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await showNotification(page, 'Could not save before opening Export.', { tone: 'danger' });
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(dialog.getByRole('alert')).toContainText('Could not save before opening Export.');
	await page.setViewportSize({ width: 320, height: 568 });
	await showNotification(
		page,
		'Could not save. ' + 'Detailed-recovery-information-without-spaces'.repeat(35),
		{ tone: 'danger' }
	);
	await expect.poll(() => notice.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	// Inside a sheet the long message stays under its title and close button and above its bottom edge.
	await expect
		.poll(() =>
			notice.evaluate((el) => {
				const r = el.getBoundingClientRect(),
					dialog = el.closest('dialog')!.getBoundingClientRect(),
					head = el.closest('dialog')!.querySelector('.sheet-head')!.getBoundingClientRect();
				return r.top >= head.bottom && r.bottom <= dialog.bottom;
			})
		)
		.toBe(true);
	await notice.evaluate((el) => (el.scrollTop = el.scrollHeight));
	const close = await dismiss().boundingBox();
	expect(close).not.toBeNull();
	expect(close!.x).toBeGreaterThanOrEqual(0);
	expect(close!.y).toBeGreaterThanOrEqual(0);
	expect(close!.x + close!.width).toBeLessThanOrEqual(320);
	expect(close!.y + close!.height).toBeLessThanOrEqual(568);
	await dismiss().click();
	await expect(notice).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	// On a phone's Customize screen a long message scrolls inside its region, never down over the equipment sheet.
	await page.setViewportSize({ width: 390, height: 844 });
	await showNotification(page, 'Saved. ' + 'A long status message that keeps going. '.repeat(60), {
		duration: 0
	});
	await expect(notice).toBeVisible();
	await expect
		.poll(async () => {
			const toast = (await notice.boundingBox())!,
				sheet = (await page.locator('.equipment-rail').boundingBox())!;
			return toast.y + toast.height <= sheet.y - 11;
		})
		.toBe(true);
	expect(await notice.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	// An uncaught error gets a notice whose Report previews the public issue; nothing from the error text leaks into it.
	await page.evaluate(() =>
		setTimeout(() => {
			throw new TypeError(
				'Bad token=sk-ant-api03-AbCdEf123456GhIjKl789012 at C:\\Users\\me\\a.png'
			);
		})
	);
	await expect(notice).toContainText('Something went wrong.');
	// The body stays a button, named by the message alone; Report is its own target and does not dismiss the notice.
	const unexpected = 'Something went wrong. If it keeps happening, please report it.';
	await expect(notice.locator('.bu-notice-activate')).toHaveAccessibleName(unexpected);
	const reportButton = notice.getByRole('button', { name: 'Report this problem', exact: true });
	await expect(reportButton).toHaveAttribute('data-variant', 'outline');
	const description = notice.getByText(unexpected, { exact: true });
	const descriptionBox = (await description.boundingBox())!;
	const reportBox = (await reportButton.boundingBox())!;
	expect(reportBox.x).toBeCloseTo(descriptionBox.x, 0);
	expect(reportBox.y).toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height);
	await reportButton.click();
	const report = page.getByRole('dialog', { name: 'Report this problem', exact: true });
	await expect(report).toBeVisible();
	await expect(notice).toContainText('Something went wrong.');
	await expect(report).toContainText('Error type: TypeError');
	await expect(report).not.toContainText('sk-ant');
	const href = await report.getByRole('link', { name: 'Open on GitHub' }).getAttribute('href');
	expect(href).toMatch(
		/^https:\/\/github\.com\/Shilo\/PixelDoll\/issues\/new\?template=problem-report\.yml&title=/
	);
	expect(href).not.toContain('sk-ant');
	expect(new URL(href!).searchParams.get('details')).toBe(
		(await report.locator('pre').textContent())!.split('Technical details\n')[1]
	);
	await report.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(report).toHaveCount(0);
	// Pressing the message itself still dismisses the notice.
	const text = (await notice.getByText(unexpected, { exact: true }).boundingBox())!;
	await page.mouse.click(text.x + 4, text.y + text.height / 2);
	await expect(notice).toHaveCount(0);
});

test('the startup preview notice expires after eight seconds', async ({ page }, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	const time = new Date('2026-11-02T12:00:00Z');
	// Pause after the installed time: the installed clock runs until the pause, and pausing in its past throws (seen under load).
	await page.clock.install({ time });
	await page.clock.pauseAt(new Date(time.getTime() + 1000));
	await page.goto(dev);
	const preview = page.getByRole('status').filter({ hasText: /Pre-release · v/ });
	await expect(preview).toBeVisible();
	await page.clock.fastForward(7999);
	await expect(preview).toBeVisible();
	await page.clock.fastForward(1);
	await expect(preview).toHaveCount(0);
});

test('the startup notice and More menu download a library backup with archives', async ({
	page
}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	let releaseFixture!: () => void;
	const fixtureHeld = new Promise<void>((resolve) => {
		releaseFixture = resolve;
	});
	await page.route('**/fixtures/s2/fixture.json', async (route) => {
		await fixtureHeld;
		await route.continue();
	});
	await page.goto(dev);
	const notice = page.getByRole('status').filter({ hasText: /Pre-release · v/ });
	const backupButton = notice.getByRole('button', { name: 'Back up library', exact: true });
	let loadingHeight: number;
	try {
		await expect(backupButton).toBeVisible();
		await expect(backupButton).toBeDisabled();
		await expect(backupButton).toHaveAttribute('data-variant', 'outline');
		const description = notice.getByText('Keep a local copy of your characters and artwork.');
		const descriptionBox = (await description.boundingBox())!;
		const backupBox = (await backupButton.boundingBox())!;
		expect(backupBox.x).toBeCloseTo(descriptionBox.x, 0);
		expect(backupBox.y).toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height);
		loadingHeight = await notice.evaluate((element) => element.clientHeight);
	} finally {
		releaseFixture();
	}
	await expect(backupButton).toBeEnabled();
	expect(await notice.evaluate((element) => element.clientHeight)).toBe(loadingHeight);
	await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts';
		const db = await import(dbPath);
		await db.put('projects', 'rig-older', { id: 'rig-older', manifest: { format: 0 } });
	});
	await backupButton.evaluate((button) => {
		new MutationObserver(() => {
			if (button.getAttribute('aria-busy') === 'true' && button.matches(':disabled'))
				document.body.dataset.observedBackupBusy = 'true';
		}).observe(button, { attributes: true });
	});
	const downloading = page.waitForEvent('download');
	await backupButton.click();
	const download = await downloading;
	await expect(page.locator('body')).toHaveAttribute('data-observed-backup-busy', 'true');
	expect(download.suggestedFilename()).toMatch(/\.backup\.zip$/);
	const files = await unzip(new Uint8Array(readFileSync((await download.path())!)));
	expect(JSON.parse(new TextDecoder().decode(files.get('backup.json'))).format).toBe(
		'pixeldoll-backup/1'
	);
	const archive = [...files.keys()].find((name) => name.startsWith('archives/'));
	expect(archive).toMatch(/^archives\/[a-f0-9]{64}\.zip$/);
	await expect(notice).toHaveCount(0);
	await expect(page.getByText('Backup is ready to download.', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	const menu = page.locator('#experience-options');
	const menuBackup = menu.getByRole('button', { name: 'Back up library', exact: true });
	await expect(menuBackup.locator('+ button')).toHaveAccessibleName('Activity...');
	const [menuDownload] = await Promise.all([page.waitForEvent('download'), menuBackup.click()]);
	const menuFiles = await unzip(new Uint8Array(readFileSync((await menuDownload.path())!)));
	expect(menuFiles.has(archive!)).toBe(true);
});

test('Library deletes local work only after confirmation and offers a backup first', async ({
	page
}, info) => {
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await page.route('https://api.pixellab.ai/v2/balance', (route) =>
		route.fulfill({ json: { credits: { usd: 0 } } })
	);
	await openStudio(page, dev);
	const character = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts';
		const exportPath = '/src/lib/store/export-settings.ts';
		const dbPath = '/src/lib/store/db.ts';
		const state = await import(statePath);
		await state.copyDemo();
		await (await import(exportPath)).saveExportSetting({ engine: 'unity' });
		await (
			await import(dbPath)
		).put('projects', 'rig-older', {
			id: 'rig-older',
			manifest: { format: 0 }
		});
		localStorage.setItem('pixellabApiKey', 'synthetic-deletion-key');
		return state.doc.id as string;
	});
	const saved = () =>
		page.evaluate(async (id) => {
			const exportPath = '/src/lib/store/export-settings.ts';
			const dbPath = '/src/lib/store/db.ts';
			const db = await import(dbPath);
			return {
				character: Boolean(await db.get('projects', id)),
				archive: Boolean(await db.get('projects', 'rig-older')),
				engine: (await (await import(exportPath)).readExportSettings()).engine,
				keyKept: localStorage.getItem('pixellabApiKey') === 'synthetic-deletion-key'
			};
		}, character);
	const original = { character: true, archive: true, engine: 'unity', keyKept: true };
	expect(await saved()).toEqual(original);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await settings.getByRole('button', { name: 'Library', exact: true }).click();
	const danger = settings.locator('section[data-setting="delete-work"]');
	await expect(
		settings.locator('hr.bu-separator + section[data-setting="delete-work"]')
	).toBeVisible();
	const remove = danger.getByRole('button', { name: 'Delete local work...', exact: true });
	await expect(remove).toBeVisible();
	await remove.click();
	const confirmation = page.getByRole('alertdialog', { name: 'Delete all local work?' });
	const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
	await expect(cancel).toBeFocused();
	const deleteButton = confirmation.getByRole('button', { name: 'Delete all', exact: true });
	const confirmDelete = confirmation.getByRole('button', { name: 'Confirm', exact: true });
	await deleteButton.dblclick();
	await expect(confirmDelete).toBeVisible();
	expect(await saved()).toEqual(original);
	await cancel.focus();
	await expect(deleteButton).toBeVisible();
	const box = (await confirmation.boundingBox())!;
	await page.mouse.move(box.x + 12, box.y + 12);
	await page.mouse.down();
	await page.mouse.move(4, 4);
	await page.mouse.up();
	await expect(confirmation).toBeVisible();
	await page.mouse.click(4, 4);
	await expect(confirmation).toHaveCount(0);
	await expect(settings).toBeVisible();
	await remove.click();
	await cancel.click();
	expect(await saved()).toEqual(original);
	await remove.click();
	const downloading = page.waitForEvent('download');
	await confirmation.getByRole('button', { name: 'Back up library', exact: true }).click();
	const download = await downloading;
	const files = await unzip(new Uint8Array(readFileSync((await download.path())!)));
	const index = new TextDecoder().decode(files.get('backup.json'));
	expect(index).toContain(character);
	expect(index).not.toContain('synthetic-deletion-key');
	expect([...files.keys()].some((name) => name.startsWith('archives/'))).toBe(true);
	await deleteButton.press('Enter');
	await expect(confirmDelete).toBeFocused();
	expect(await saved()).toEqual(original);
	const reloaded = page.waitForEvent('load');
	await confirmDelete.press('Enter');
	await reloaded;
	await expect(settings).toHaveCount(0);
	expect(await saved()).toEqual({ ...original, character: false });
});

test('Library downloads the raw PixelLab results a saved character still has', async ({
	page
}, info) => {
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await openStudio(page, dev);
	await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts';
		const pngPath = '/src/lib/image/pngraw.ts';
		const db = await import(dbPath);
		const { encodePngBytes } = await import(pngPath);
		const sha = await db.putBlob(
			await encodePngBytes({ w: 2, h: 2, data: new Uint8ClampedArray(16) })
		);
		const requestHash = 'abc123';
		await db.put('projects', 'rig-originals', {
			id: 'rig-originals',
			savedAt: new Date().toISOString(),
			manifest: {
				format: 'pixeldoll/3',
				name: 'Originals Test',
				items: [
					{ provenance: [{ requestHash: `sha256:${requestHash}`, jobId: 'remote-originals' }] }
				]
			}
		});
		await db.put('jobs', 'job-originals', {
			id: 'job-originals',
			label: 'Raw result',
			method: 'POST',
			endpoint: '/characters/animations',
			params: {},
			inputs: [],
			requestHash,
			state: 'done',
			attempts: 1,
			nextAt: 0,
			createdAt: 0,
			gens: 1,
			usd: 0,
			jobs: [
				{
					id: 'remote-originals',
					status: 'completed',
					done: true,
					results: [{ label: 'frame', sha }]
				}
			]
		});
	});
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await settings.getByRole('button', { name: 'Library', exact: true }).click();
	const downloading = page.waitForEvent('download');
	await settings
		.getByRole('button', { name: 'Download original generations', exact: true })
		.click();
	const download = await downloading;
	expect(download.suggestedFilename()).toMatch(/-originals\.zip$/);
	const files = await unzip(new Uint8Array(readFileSync((await download.path())!)));
	expect(files.has('01-originals-test/01-characters-animations/frame.png')).toBe(true);
	const requests = new TextDecoder().decode(files.get('01-originals-test/requests.json'));
	expect(requests).toContain('job-originals');
});

test('Library says when no original generations are kept', async ({ page }, info) => {
	const dev = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
		.baseURL!;
	await openStudio(page, dev);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await settings.getByRole('button', { name: 'Library', exact: true }).click();
	let downloaded = false;
	page.on('download', () => (downloaded = true));
	await settings
		.getByRole('button', { name: 'Download original generations', exact: true })
		.click();
	await expect(
		page.getByText('No original images are kept for your saved characters.')
	).toBeVisible();
	expect(downloaded).toBe(false);
});

test('Settings saves creation choices across reload and resets them by scope', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	const sheet = (tab: Page) => tab.getByRole('dialog', { name: 'Settings', exact: true });
	const openSettings = async (tab = page) => {
		await tab.getByRole('button', { name: 'More options', exact: true }).click();
		await tab.getByRole('button', { name: 'Settings...', exact: true }).click();
	};
	const choices = [
		['Character', 'character-model', 'pro', 'v3', 'select'],
		['Character', 'body-size', '68', '64', 'input'],
		['Character', 'frame-size', 'custom', 'auto', 'select'],
		['Character', 'custom-frame', '112', null, 'input'],
		['Character', 'direction-presets', 'four', 'eight', 'select'],
		['Character', 'base-clothing', 'none', 'underwear', 'select'],
		['Move', 'move-model', 'v3', 'skeleton-v3', 'select'],
		['Move', 'move-frames', '6', 'auto', 'select'],
		['Move', 'item-drawing', 'sheet', 'skeleton', 'select'],
		['State', 'state-model', 'pixen', 'pro', 'select'],
		['Item', 'item-method', 'anchor', 'auto', 'select']
	] as const;
	const controlAt = async (section: string, field: string, tab = page) => {
		const settings = sheet(tab);
		const sectionButton = settings
			.getByRole('navigation', { name: 'Settings', exact: true })
			.getByRole('button', { name: section, exact: true });
		if ((await sectionButton.getAttribute('aria-current')) !== 'page') await sectionButton.click();
		return settings.locator(`[data-setting="${field}"] :is(select, input)`);
	};
	const assertChoices = async (saved: boolean, tab = page) => {
		for (const [section, field, value, initial] of choices) {
			const control = await controlAt(section, field, tab);
			const expected = saved ? value : initial;
			if (expected === null) await expect(control).toHaveCount(0);
			else await expect(control).toHaveValue(expected);
		}
	};
	const settings = sheet(page);
	await openStudio(page, '/#/');
	await openSettings();
	await controlAt('Character', 'character-model');
	await expect(settings.locator('[data-setting] > label')).toHaveText([
		'Model',
		'Body size',
		'Frame size',
		'Direction',
		'Base clothing'
	]);
	// base-select draws its picker icon inside the field, so the shared inset keeps the caret at the edge.
	if (await page.evaluate(() => CSS.supports('appearance', 'base-select')))
		await expect(await controlAt('Character', 'character-model')).toHaveCSS('padding-right', '8px');
	await controlAt('Move', 'move-model');
	await expect(
		settings.getByRole('combobox', { name: 'Frames', exact: true }).locator('option:checked')
	).toHaveText('Automatic');
	await expect(
		settings.getByText(/Walking and custom moves usually start at 8 frames/)
	).toBeVisible();
	const itemMethod = await controlAt('Item', 'item-method');
	await expect(itemMethod.locator('option:checked')).toHaveText('Automatic');
	await expect(
		settings.getByText('Uses Skeleton posing when supported. Otherwise, uses Frame editing.')
	).toBeVisible();
	await assertChoices(false);
	for (const [section, field, value, , tag] of choices) {
		const control = await controlAt(section, field);
		if (tag === 'input') {
			await control.fill(value);
			await control.press('Tab');
		} else await control.selectOption(value);
	}
	const suggestions = (tab = page) =>
		sheet(tab).getByRole('region', { name: 'Prompt suggestions', exact: true });
	const titles = (tab = page) => suggestions(tab).getByRole('textbox', { name: /^Title: \d+$/ });
	const prompts = (tab = page) =>
		suggestions(tab).getByRole('textbox', { name: /^Prompt \(English\): \d+$/ });
	const picker = settings.getByRole('combobox', { name: 'Slot', exact: true });
	await picker.selectOption('hair');
	await titles().first().fill('Short curls');
	await titles().first().press('Tab');
	await picker.selectOption('head');
	const rows = suggestions().locator('li');
	const add = suggestions().getByRole('button', { name: 'Add suggestion', exact: true });
	await add.click();
	await expect(titles().last()).toBeFocused();
	// The draft is named after the row it would become, so it never shares a saved row's name.
	await expect(titles().last()).toHaveAccessibleName(`Title: ${(await rows.count()) + 1}`);
	await expect(add).toBeDisabled();
	await prompts().last().fill('Wide blue sun hat');
	await add.click();
	await expect(titles().last()).toHaveValue('Wide blue sun hat');
	await rows.last().getByRole('button', { name: 'Move up', exact: true }).click();
	await expect(titles().nth(3)).toHaveValue('Wide blue sun hat');
	await expect(rows.nth(3).locator(':focus')).toHaveCount(1);
	await rows.first().getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(titles().first()).toHaveValue('hood');
	await suggestions().getByRole('button', { name: 'Restore defaults', exact: true }).click();
	await expect(titles().first()).toHaveValue('iron knight helmet');
	await expect(titles()).toHaveCount(4);
	await titles().first().fill('Saved helmet');
	await titles().first().press('Tab');
	await controlAt('Character', 'character-model');
	await titles().first().fill('Saved look');
	await titles().first().press('Tab');
	await controlAt('Item', 'item-method');
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(settings).toHaveCount(0);
	await openSettings();
	await assertChoices(true);
	await page.reload();
	await openSettings();
	await assertChoices(true);
	const second = await page.context().newPage();
	await second.setViewportSize({ width: 1280, height: 800 });
	await openStudio(second, '/#/');
	await openSettings(second);
	await assertChoices(true, second);
	await expect(titles(second).first()).toHaveValue('Saved helmet');
	await settings.getByRole('button', { name: 'Reset this page', exact: true }).click();
	await page
		.getByRole('alertdialog', { name: 'Reset Item settings?' })
		.getByRole('button', { name: 'Reset this page', exact: true })
		.click();
	await expect(settings.getByRole('combobox', { name: 'Animation method' })).toHaveValue('auto');
	await expect(sheet(second).getByRole('combobox', { name: 'Animation method' })).toHaveValue(
		'auto'
	);
	await expect(titles(second).first()).toHaveValue('iron knight helmet');
	await picker.selectOption('hair');
	await expect(titles().first()).toHaveValue('short spiky hair');
	await second.close();
	await expect(await controlAt('Character', 'character-model')).toHaveValue('pro');
	await expect(titles().first()).toHaveValue('Saved look');
	const frame = await controlAt('Character', 'custom-frame');
	await frame.fill('72');
	await frame.press('Tab');
	await expect(settings.getByRole('alert')).toHaveText(/Choose Automatic or a custom frame/);
	await expect(frame).toHaveValue('112');
	const body = settings.getByRole('spinbutton', { name: 'Body size' });
	await body.fill('66');
	await body.press('Tab');
	await expect(settings.getByRole('alert')).toContainText('4 px steps');
	await settings.getByRole('button', { name: 'Reset all settings...', exact: true }).click();
	await page
		.getByRole('alertdialog', { name: 'Reset all settings?' })
		.getByRole('button', { name: 'Reset settings', exact: true })
		.click();
	await expect(settings.getByRole('alert').filter({ hasText: '4 px steps' })).toHaveCount(0);
	await expect(titles().first()).not.toHaveValue('Saved look');
	await assertChoices(false);
});

test('Settings resets restore only their scope, keep work and the PixelLab key, and disable at defaults', async ({
	page
}, info) => {
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	const longPlan = 'EnterpriseWorkspace'.repeat(8);
	await page.route('https://api.pixellab.ai/v2/balance', (route) =>
		route.fulfill({
			json: {
				subscription: {
					type: 'generations',
					status: 'active',
					plan: longPlan,
					generations: 5,
					total: 10
				},
				credits: { usd: 0 }
			}
		})
	);
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.theme', 'light');
		localStorage.setItem('pixeldoll.locale', 'en');
		localStorage.setItem('pixeldoll.developerMode', '1');
		localStorage.setItem('pixeldoll.wardrobe.hideShared', '1');
		localStorage.setItem('pixeldoll.wardrobe.showDemo', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-settings-reset');
	});
	await openStudio(page, dev);
	const character = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts';
		const exportPath = '/src/lib/store/export-settings.ts';
		const wardrobePath = '/src/studio/wardrobeVisibility.svelte.ts';
		const state = await import(statePath);
		const exports = await import(exportPath);
		await state.copyDemo();
		(await import(wardrobePath)).setSharedItemsHiddenForCharacter(state.doc.id, true);
		await exports.saveExportSetting({ engine: 'unity' });
		await exports.saveExportSetting({ dressedCharacterSheets: false });
		await exports.saveExportSetting({ actionLayers: true });
		await exports.saveExportSetting({ animation: 'walk', playOnce: true });
		return state.doc.id as string;
	});
	const saved = () =>
		page.evaluate(async (id) => {
			const exportPath = '/src/lib/store/export-settings.ts';
			const dbPath = '/src/lib/store/db.ts';
			return {
				keptKey: localStorage.getItem('pixellabApiKey') === 'synthetic-settings-reset',
				keptCharacter: Boolean(await (await import(dbPath)).get('projects', id)),
				theme: document.documentElement.dataset.theme,
				language: localStorage.getItem('pixeldoll.locale'),
				hideShared: localStorage.getItem('pixeldoll.wardrobe.hideShared'),
				hideCurrent: localStorage.getItem(`pixeldoll.wardrobe.hideShared:${id}`),
				showDemo: localStorage.getItem('pixeldoll.wardrobe.showDemo'),
				developer: localStorage.getItem('pixeldoll.developerMode'),
				exports: await (await import(exportPath)).readExportSettings()
			};
		}, character);
	const changed = {
		keptKey: true,
		keptCharacter: true,
		theme: 'light',
		language: 'en',
		hideShared: '1',
		hideCurrent: '1',
		showDemo: '1',
		developer: '1',
		exports: {
			engine: 'unity',
			dressedCharacterSheets: false,
			actionLayers: true,
			playOnce: ['walk']
		}
	};
	const defaults = {
		general: { theme: 'dark', language: null },
		wardrobe: { hideShared: null, hideCurrent: null, showDemo: null },
		developer: { developer: null },
		export: {
			exports: {
				engine: 'generic',
				dressedCharacterSheets: true,
				actionLayers: false,
				playOnce: []
			}
		}
	};
	const allDefaults = {
		...changed,
		...defaults.general,
		...defaults.wardrobe,
		...defaults.developer,
		...defaults.export
	};
	expect(await saved()).toEqual(changed);

	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	const nav = settings.getByRole('navigation', { name: 'Settings', exact: true });
	const pageReset = settings.getByRole('button', { name: 'Reset this page', exact: true });
	// Reset all is the last row of the index at every size, never a header button.
	const resetAll = settings.getByRole('button', { name: 'Reset all settings...', exact: true });
	const search = settings.getByRole('searchbox', { name: 'Search settings', exact: true });
	await expect(search).toBeFocused();
	const focusInPanel = () =>
		page.evaluate(() => Boolean(document.activeElement?.closest('.settings-content')));
	const height = (selector: string) =>
		settings
			.locator(selector)
			.first()
			.evaluate((element) => element.getBoundingClientRect().height);
	const fits = async (section: string) => {
		await expect
			.poll(
				() =>
					settings
						.locator('.sheet-body, .settings-panel')
						.evaluateAll((panes) =>
							Math.max(
								...panes
									.filter((pane) => getComputedStyle(pane).overflowX !== 'visible')
									.map((pane) => pane.scrollWidth - pane.clientWidth)
							)
						),
				{ message: `${section} must fit the Settings pane` }
			)
			.toBe(0);
	};
	const scoped = [
		['Wardrobe', 'wardrobe'],
		['Developer', 'developer'],
		['Export', 'export'],
		['Appearance', 'general']
	] as const;

	// Every page keeps one dialog, header and panel heading size, whether or not it has a Reset.
	await page.setViewportSize({ width: 660, height: 600 });
	const sizes = new Set<string>();
	for (const name of [
		'PixelLab',
		'Appearance',
		'Wardrobe',
		'Export',
		'Library',
		'Trash',
		'Developer',
		'About'
	]) {
		await nav.getByRole('button', { name, exact: true }).click();
		await expect(settings.getByRole('heading', { name, exact: true, level: 3 })).toBeVisible();
		if (name === 'PixelLab')
			await expect(settings.getByText(longPlan, { exact: true })).toBeVisible();
		if (name === 'Export')
			await expect(settings.getByRole('combobox', { name: 'Default export target' })).toBeVisible();
		await fits(name);
		const resettable = scoped.some(([label]) => label === name);
		await expect(pageReset).toHaveCount(resettable ? 1 : 0);
		if (resettable) await expect(pageReset).toBeEnabled();
		await expect(resetAll).toBeEnabled();
		sizes.add(
			`${await settings.evaluate((dialog) => dialog.getBoundingClientRect().height)}/${await height('.sheet-head')}/${await height('.settings-panel-heading')}`
		);
	}
	expect([...sizes]).toHaveLength(1);
	// A long page scrolls on its own and leaves the index in place.
	await nav.getByRole('button', { name: 'Move', exact: true }).click();
	const navTop = () => nav.evaluate((element) => element.getBoundingClientRect().top);
	const indexTop = await navTop();
	const panelScroll = await settings
		.locator('.settings-panel')
		.evaluate((panel) => (panel.scrollTo(0, panel.scrollHeight), panel.scrollTop));
	expect(panelScroll).toBeGreaterThan(0);
	expect(await navTop()).toBe(indexTop);
	await page.setViewportSize({ width: 1280, height: 800 });

	// Each page Reset changes only its own preferences, then stays in place but disabled.
	let expected: Record<string, unknown> = { ...changed };
	for (const [name, scope] of scoped) {
		await nav.getByRole('button', { name, exact: true }).click();
		await pageReset.click();
		const confirmation = page.getByRole('alertdialog', { name: `Reset ${name} settings?` });
		await confirmation.getByRole('button', { name: 'Reset this page', exact: true }).click();
		await expect(confirmation).toHaveCount(0);
		await expect(pageReset).toBeDisabled();
		expect(await focusInPanel()).toBe(true);
		expected = { ...expected, ...defaults[scope] };
		await expect.poll(saved).toEqual(expected);
	}
	expect(expected).toEqual(allDefaults);
	await expect(resetAll).toBeDisabled();
	await search.fill('reset');
	const resetResult = settings.getByRole('button', {
		name: 'Reset all settings...',
		exact: true
	});
	await expect(resetResult).toBeDisabled();
	await search.fill('');
	await nav.getByRole('button', { name: 'Wardrobe', exact: true }).click();
	await page.evaluate(async () => {
		const wardrobePath = '/src/studio/wardrobeVisibility.svelte.ts';
		(await import(wardrobePath)).setSharedItemsHiddenForCharacter('rig-inactive', true);
	});
	await expect(pageReset).toBeDisabled();
	await expect(resetAll).toBeEnabled();
	await nav.getByRole('button', { name: 'Appearance', exact: true }).click();

	// Choosing a language explicitly, even the detected one, is a saved preference that Reset clears.
	await page.evaluate(async () => {
		const i18nPath = '/src/lib/i18n.ts';
		await (await import(i18nPath)).selectLanguage('en');
	});
	await expect(pageReset).toBeEnabled();
	await expect(resetAll).toBeEnabled();

	// Export preferences changed while its page is closed re-enable Reset all through Export's change signal.
	await page.evaluate(async () => {
		const i18nPath = '/src/lib/i18n.ts';
		const exportPath = '/src/lib/store/export-settings.ts';
		await (await import(i18nPath)).selectLanguage();
		await (await import(exportPath)).saveExportSetting({ engine: 'unity' });
		await (await import(exportPath)).saveExportSetting({ actionLayers: true });
	});
	await expect(pageReset).toBeDisabled();
	await expect(resetAll).toBeEnabled();
	await nav.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(pageReset).toBeEnabled();
	await nav.getByRole('button', { name: 'Appearance', exact: true }).click();
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts';
		const i18nPath = '/src/lib/i18n.ts';
		const developerPath = '/src/studio/developerMode.svelte.ts';
		const wardrobePath = '/src/studio/wardrobeVisibility.svelte.ts';
		const exportPath = '/src/lib/store/export-settings.ts';
		const state = await import(statePath);
		state.setTheme('light');
		await (await import(i18nPath)).selectLanguage('en');
		(await import(developerPath)).setDeveloperMode(true);
		const wardrobe = await import(wardrobePath);
		wardrobe.setSharedItemsHiddenForAll(true);
		wardrobe.setSharedItemsHiddenForCharacter(state.doc.id, true);
		wardrobe.setDemoItemsShown(true);
		const exports = await import(exportPath);
		await exports.saveExportSetting({ dressedCharacterSheets: false });
		await exports.saveExportSetting({ animation: 'walk', playOnce: true });
	});
	await expect.poll(saved).toEqual(changed);
	await expect(pageReset).toBeEnabled();

	await search.fill('reset');
	await resetResult.click();
	const confirmation = page.getByRole('alertdialog', { name: 'Reset all settings?' });
	const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
	await expect(cancel).toBeFocused();
	await cancel.click();
	await expect(confirmation).toHaveCount(0);
	expect(await saved()).toEqual(changed);
	await search.clear();
	await resetAll.click();
	await confirmation.getByRole('button', { name: 'Reset settings', exact: true }).click();
	await expect(confirmation).toHaveCount(0);
	await expect(settings.getByText('Settings reset.', { exact: true })).toBeVisible();
	await expect.poll(saved).toEqual(allDefaults);
	expect(
		await page.evaluate(() => localStorage.getItem('pixeldoll.wardrobe.hideShared:rig-inactive'))
	).toBeNull();
	await expect(resetAll).toBeDisabled();
	await expect(pageReset).toBeDisabled();
	expect(await focusInPanel()).toBe(true);
	const segmented = await settings.getByRole('radiogroup', { name: 'Theme' }).boundingBox();
	const language = await settings
		.getByRole('button', { name: 'Language', exact: true })
		.boundingBox();
	expect(segmented?.height).toBe(language?.height);
	for (const option of await settings
		.getByRole('radiogroup', { name: 'Theme' })
		.getByRole('radio')
		.all()) {
		expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
	}

	await page.setViewportSize({ width: 320, height: 740 });
	const back = settings.getByRole('button', { name: 'Back to Settings', exact: true });
	const compactPageReset = settings.getByRole('button', {
		name: 'Reset this page...',
		exact: true
	});
	const compactResetAll = settings.getByRole('button', {
		name: 'Reset all settings...',
		exact: true
	});
	const header = settings.locator('.sheet-head');
	await expect(header.getByRole('button', { name: /Reset|Forget PixelLab key/ })).toHaveCount(0);
	await expect(resetAll).toHaveCount(0);
	expect((await back.boundingBox())?.width).toBeGreaterThanOrEqual(44);
	await back.click();
	await expect(compactPageReset).toHaveCount(0);
	await expect(compactResetAll).toBeDisabled();
	await fits('Settings index');
	const compactHeights = new Set([await height('.sheet-head')]);
	for (const name of [
		'PixelLab',
		'Appearance',
		'Wardrobe',
		'Mount',
		'Library',
		'Export',
		'Developer',
		'About'
	]) {
		await nav.getByRole('button', { name, exact: true }).click();
		await fits(name);
		const resettable = ['Appearance', 'Wardrobe', 'Mount', 'Export', 'Developer'].includes(name);
		await expect(header.getByRole('button', { name: /Reset|Forget PixelLab key/ })).toHaveCount(0);
		await expect(compactResetAll).toHaveCount(0);
		await expect(compactPageReset).toHaveCount(resettable ? 1 : 0);
		if (resettable) await expect(compactPageReset).toBeDisabled();
		compactHeights.add(await height('.sheet-head'));
		await back.click();
	}
	expect([...compactHeights]).toHaveLength(1);

	await nav.getByRole('button', { name: 'Appearance', exact: true }).click();
	await settings.getByRole('radio', { name: 'Light', exact: true }).check();
	await page.evaluate(async () => {
		const developerPath = '/src/studio/developerMode.svelte.ts';
		(await import(developerPath)).setDeveloperMode(true);
	});
	const appearanceConfirmation = page.getByRole('alertdialog', {
		name: 'Reset Appearance settings?'
	});
	await expect(compactPageReset).toBeEnabled();
	expect((await compactPageReset.boundingBox())?.height).toBeGreaterThanOrEqual(44);
	await compactPageReset.click();
	await expect(
		appearanceConfirmation.getByRole('button', { name: 'Cancel', exact: true })
	).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(appearanceConfirmation).toHaveCount(0);
	await expect(compactPageReset).toBeFocused();
	await expect.poll(saved).toEqual({ ...allDefaults, theme: 'light', developer: '1' });
	await compactPageReset.click();
	await appearanceConfirmation
		.getByRole('button', { name: 'Reset this page', exact: true })
		.click();
	await expect(compactPageReset).toBeDisabled();
	await expect.poll(saved).toEqual({ ...allDefaults, developer: '1' });
	await back.click();
	await expect(compactResetAll).toBeEnabled();
	expect((await compactResetAll.boundingBox())?.height).toBeGreaterThanOrEqual(44);
	await compactResetAll.click();
	await confirmation.getByRole('button', { name: 'Reset settings', exact: true }).click();
	await expect(compactResetAll).toBeDisabled();
	await expect(settings.getByRole('searchbox', { name: 'Search settings' })).toBeFocused();
	await expect.poll(saved).toEqual(allDefaults);
});

for (const [width, height] of [
	[1440, 900],
	[390, 844],
	[844, 390]
])
	test.describe(`toast activation ${width}x${height}`, () => {
		test.use({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000 });
		test('body dismisses or runs its primary action, while close only dismisses', async ({
			page
		}, info) => {
			const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
			await page.goto(dev);
			const notice = page.locator('.toast'),
				gesture = width < 1000 ? 'tap' : 'click';
			await expect(notice).toBeVisible();
			await showNotification(page, 'Dismiss this message', { duration: 0 });
			await notice
				.getByRole('button', { name: 'Dismiss this message', exact: true })
				[gesture]({ position: { x: 8, y: 8 } });
			await expect(notice).toHaveCount(0);
			await enterStudio(page);
			const offerExport = () =>
				page.evaluate(async () => {
					const path = '/src/studio/state.svelte.ts',
						s = await import(path);
					s.toast('Open export', {
						duration: 0,
						action: () => {
							s.ui.sheet = 'export';
						}
					});
				});
			await offerExport();
			await notice.getByRole('button', { name: 'Dismiss notification' })[gesture]();
			await expect(notice).toHaveCount(0);
			await expect(page.getByRole('dialog')).toHaveCount(0);
			await offerExport();
			await notice.getByRole('button', { name: 'Open export', exact: true })[gesture]();
			const dialog = page.getByRole('dialog', { name: 'Export', exact: true });
			await expect(dialog).toBeVisible();
			await expect(notice).toHaveCount(0);
			// Sheets open on their title.
			await expect(dialog.getByRole('heading', { name: 'Export', exact: true })).toBeFocused();
			await dialog.getByRole('button', { name: 'Close', exact: true })[gesture]();
			await expect(dialog).toHaveCount(0);
		});
	});

test('top notifications fit both themes across desktop, tablet and phone orientations', async ({
	page
}, info) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const dev = info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!;
	await page.goto(dev);
	await expect(page.locator('.customize-action')).toBeEnabled();
	const sizes = [
		[320, 568],
		[360, 640],
		[390, 844],
		[430, 932],
		[568, 320],
		[667, 375],
		[844, 390],
		[932, 430],
		[768, 1024],
		[1024, 768],
		[900, 900],
		[1280, 800],
		[1440, 900],
		[1920, 1080]
	];
	const evidence: unknown[] = [];
	for (const screen of ['characters', 'studio']) {
		if (screen === 'studio') await enterStudio(page);
		for (const theme of ['dark', 'light']) {
			await page.evaluate(async (theme) => {
				const path = '/src/studio/state.svelte.ts',
					state = await import(path);
				if (state.ui.theme !== theme) state.toggleTheme();
			}, theme);
			for (const [width, height] of sizes) {
				await page.setViewportSize({ width, height });
				for (const tone of ['info', 'warning', 'danger'] as const) {
					// One round trip per notice: 168 notices made this test a long chain of browser calls under load.
					await page.evaluate(
						async ({ message, options }) => {
							const path = '/src/studio/state.svelte.ts',
								state = await import(path);
							// A danger notice blocks lesser ones until dismissed.
							state.dismissToast();
							state.toast(message, options);
						},
						{
							message:
								tone === 'warning'
									? 'Features and saved work may change. Export your work to keep a backup.'
									: tone === 'danger'
										? 'Could not save your character. Try again.'
										: 'Saved changes',
							options: {
								title: tone === 'warning' ? 'Preview · v0.2.29-dev' : undefined,
								tone,
								duration: 0
							}
						}
					);
					const notice = page.locator('.toast');
					await expect(notice).toBeVisible();
					const measure = () =>
						notice.evaluate((el) => {
							const r = el.getBoundingClientRect(),
								issues: string[] = [];
							if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
								issues.push('outside viewport');
							// Centered over the stage column: the whole width over a phone sheet or in short landscape (where it
							// wraps less), else the world left of the rail.
							const column = document.querySelector('.sheet-layout, .short-layout')
								? { left: 0, right: innerWidth }
								: document.querySelector('.experience-stage, .cast')!.getBoundingClientRect();
							if (Math.abs(r.left + r.width / 2 - (column.left + column.right) / 2) > 1)
								issues.push('off center');
							if (r.width > 421) issues.push('wider than 420');
							if (el.scrollWidth > el.clientWidth) issues.push('horizontal clipping');
							for (const target of document.querySelectorAll<HTMLElement>(
								'.experience-header,.view-modes,.selection-import,.selection-create,.cast-library>.bu-input,.equipment-modes,.sheet-layout .equipment-rail'
							)) {
								if (!target.getClientRects().length) continue;
								const b = target.getBoundingClientRect();
								if (
									b.width &&
									b.height &&
									b.left < r.right &&
									b.right > r.left &&
									b.top < r.bottom &&
									b.bottom > r.top
								)
									issues.push('covers ' + target.className);
							}
							const card = el.querySelector<HTMLElement>('.bu-toast')!,
								style = getComputedStyle(card);
							const surface = card.getBoundingClientRect(),
								icon = card.querySelector('svg')!.getBoundingClientRect();
							if (Math.abs(icon.top + icon.height / 2 - surface.top - surface.height / 2) > 1)
								issues.push('status icon off center');
							const close = card
								.querySelector('[aria-label="Dismiss notification"]')!
								.getBoundingClientRect();
							if (close.width < 44 || close.height < 44) issues.push('small dismiss target');
							if (card.dataset.tone === 'danger') {
								const button = card.querySelector('.report-problem[data-variant="outline"]');
								const action = button?.getBoundingClientRect();
								const text = card.querySelector('.bu-small > span')!.getBoundingClientRect();
								if (!action || Math.abs(action.left - text.left) > 1 || action.top < text.bottom)
									issues.push('report button off the bottom-left action row');
							}
							if (card.dataset.tone === 'info') {
								const text = document.createRange();
								text.selectNodeContents(card.querySelector('.bu-notice-content')!);
								if (close.left - text.getBoundingClientRect().right > 13)
									issues.push('short message stretches');
							}
							const context = document.createElement('canvas').getContext('2d')!;
							const rgb = (color: string) => {
								context.fillStyle = color;
								context.fillRect(0, 0, 1, 1);
								return [...context.getImageData(0, 0, 1, 1).data];
							};
							const foreground = rgb(style.color),
								background = rgb(style.backgroundColor);
							const luminance = (p: number[]) =>
								p
									.slice(0, 3)
									.map((v) => {
										v /= 255;
										return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
									})
									.reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
							const a = luminance(foreground),
								b = luminance(background),
								contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
							if (background[3] !== 255) issues.push('transparent surface');
							if (contrast < 4.5) issues.push('low text contrast');
							return { issues, x: r.x, y: r.y, width: r.width, height: r.height, contrast };
						});
					let measured: Awaited<ReturnType<typeof measure>> | undefined;
					await expect
						.poll(async () => (measured = await measure()).issues, {
							message: `${screen} ${theme} ${tone} ${width}x${height}`
						})
						.toEqual([]);
					evidence.push({
						screen,
						theme,
						tone,
						viewportWidth: width,
						viewportHeight: height,
						...measured
					});
					if (tone === 'warning' && [320, 390, 844, 1440].includes(width))
						await page.screenshot({
							path: info.outputPath(`notification-${screen}-${theme}-${width}x${height}.png`)
						});
					if (tone === 'info' && width === 1440)
						await page.screenshot({
							path: info.outputPath(`notification-${screen}-${theme}-short.png`)
						});
				}
			}
		}
	}
	await info.attach('notification-layouts', {
		body: Buffer.from(JSON.stringify(evidence, null, 2)),
		contentType: 'application/json'
	});
	expect(errors).toEqual([]);
});

declare global {
	interface Window {
		__queue?: { paused: string | null };
		__studio?: { ui: { selected: string } };
	}
}

async function expectDirectionGrid(page: Page, directions: (string | null)[], columns: number) {
	const grid = page.locator('.all-dirs');
	const cells = grid.locator(':scope > *');
	await expect(cells).toHaveCount(directions.length);
	const boxes = [];
	for (const [i, direction] of directions.entries()) {
		const cell = cells.nth(i);
		await cell.scrollIntoViewIfNeeded();
		if (direction) {
			await expect(
				cell.getByRole('button', { name: `Show ${direction} only`, exact: true })
			).toBeVisible();
			await expect(cell.locator('canvas')).toHaveCount(1);
		} else {
			await expect(cell).toHaveAttribute('aria-hidden', 'true');
			await expect(cell).toBeEmpty();
		}
		// One snapshot: separate round trips let a still-settling sheet move the grid between reads (seen on the dev server).
		const { box, stage, toolbar, origin } = await cell.evaluate((el) => {
			const rect = (e: Element | null) => {
				const { x, y, width, height } = e!.getBoundingClientRect();
				return { x, y, width, height };
			};
			return {
				box: rect(el),
				stage: rect(document.querySelector('.stage-art')),
				toolbar: rect(document.querySelector('.canvas-bar')),
				origin: rect(el.parentElement)
			};
		});
		expect(box.x).toBeGreaterThanOrEqual(stage.x);
		expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width);
		expect(box.y).toBeGreaterThanOrEqual(stage.y);
		expect(box.y + box.height).toBeLessThanOrEqual(Math.min(stage.y + stage.height, toolbar.y) + 1);
		// The compact Inspect sheet deliberately scrolls. Compare compass geometry
		// in grid coordinates while verifying that every view remains reachable.
		const layout = { ...box, x: box.x - origin.x, y: box.y - origin.y };
		boxes.push(layout);
		if (i % columns) {
			expect(layout.y).toBeCloseTo(boxes[i - 1].y);
			expect(layout.x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width);
		}
		if (i >= columns) {
			expect(layout.x).toBeCloseTo(boxes[i - columns].x);
			expect(layout.y).toBeGreaterThan(boxes[i - columns].y + boxes[i - columns].height);
		}
	}
}

// The production build strips the __queue/__studio hooks and developer rigs, so the dev server checks them directly.
test('dev server: offline pauses the queue, back online resumes it, and Settings hides local test tools', async ({
	page,
	context
}, info) => {
	await context.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	// Open the Studio first so the app creates its database before the dev rig is added.
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.evaluate(
		(format) =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('pixeldoll');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const t = r.result.transaction('projects', 'readwrite');
					t.objectStore('projects').put(
						{
							id: 'rig-e2edevrig00',
							savedAt: '',
							manifest: { format, name: 'E2E dev rig' },
							origin: 'dev'
						},
						'rig-e2edevrig00'
					);
					t.oncomplete = () => {
						r.result.close();
						resolve();
					};
					t.onabort = () => reject(t.error);
				};
			}),
		CURRENT_FORMAT
	);
	await reloadStudio(page);
	await page.waitForFunction(() => window.__queue?.paused === null && !!window.__studio);
	await context.setOffline(true);
	await page.locator('.offline-banner', { hasText: 'You’re offline' }).waitFor();
	await page.waitForFunction(() => window.__queue!.paused === 'offline');
	await pickItem(page, 'Wizard hat'); // everything else still works
	expect(await page.evaluate(() => window.__studio!.ui.selected)).toBe('hat_wizard');
	await context.setOffline(false);
	await page.locator('.offline-banner').waitFor({ state: 'detached' });
	await page.waitForFunction(() => window.__queue!.paused === null);
	await page.locator('.project-btn').click();
	const projectMenu = page.locator('#project-menu');
	await expect(projectMenu.getByText('E2E dev rig', { exact: true })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: /^Settings/ }).click();
	await page.getByRole('button', { name: 'Developer', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings' });
	await expect(settings.getByText('E2E dev rig', { exact: true })).toHaveCount(0);
	await settings.getByRole('switch', { name: 'Developer mode' }).check();
	await expect(settings.getByRole('button', { name: 'Local test tools', exact: true })).toHaveCount(
		0
	);
	await expect(settings.getByRole('button', { name: 'E2E dev rig', exact: true })).toHaveCount(0);
});

// The demo tests run the production preview without a key. Each is independent so a slow machine costs one short test,
// not one long chain; the guard records and refuses every paid API call and collects page errors for the final check.
async function demoGuard(context: BrowserContext, firstRun = false) {
	const errors: string[] = [],
		unexpectedRequests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		unexpectedRequests.push(
			route.request().method() + ' ' + new URL(route.request().url()).pathname
		);
		await route.abort();
	});
	await context.addInitScript((firstRun) => {
		if (!firstRun) localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixeldoll.agentKey', 'off');
	}, firstRun);
	context.on('weberror', (e) => {
		errors.push(e.error().message);
		console.log('pageerror', e.error().message);
	});
	context.on('console', (m) => {
		if (m.type() === 'error') console.log('console', m.text());
	});
	return () => {
		assert.deepEqual(errors, []);
		assert.deepEqual(unexpectedRequests, [], 'demo tests must never call the paid API');
	};
}

async function openDemo(page: Page) {
	await openStudio(page, '/#/', { waitUntil: 'networkidle' });
	await page.waitForSelector('.world-actors');
}

const step = (s: string) => console.log('ok', s);

test('quickstart teaches the real demo, remembers dismissal and can be replayed', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context, true);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/#/');
	const customize = page
		.getByRole('complementary', { name: 'Your characters', exact: true })
		.getByRole('button', { name: 'Customize Adventurer', exact: true });
	await expect(customize).toHaveAccessibleDescription(/No PixelLab key needed/);
	await customize.press('Enter');
	const guide = page.getByRole('region', { name: 'Quickstart', exact: true });
	await expect(guide.getByRole('heading')).toHaveText('Change gear');
	await expect(guide).toBeInViewport();

	// A complete head item keeps the first lesson free of a missing-frames warning.
	const emptyHead = page.getByRole('button', { name: 'Empty head', exact: true });
	await emptyHead.focus();
	await page.keyboard.press('Enter');
	await expect(emptyHead).toHaveAttribute('aria-pressed', 'true');
	await expect(guide.getByRole('heading')).toHaveText('Preview your gear');
	await expect(guide.getByRole('heading')).toBeFocused();
	const play = guide.getByRole('button', { name: 'Play Walk', exact: true });
	await expect(play).toBeInViewport();
	// The guide is pinned above the list on this tall phone.
	expect(await guide.evaluate((el) => !!el.closest('#wardrobe-list'))).toBe(false);
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await expect(play).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(playbackPicker(page)).toHaveAttribute('value', 'walk');
	await expect(guide.getByRole('heading')).toHaveText('Take it into your game');
	await expect(guide.getByRole('heading')).toBeFocused();
	await guide.getByRole('button', { name: 'Export demo', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export', exact: true });
	await expect(dialog).toBeVisible();
	// The guide stays mounted as the sheet's focus opener. The open dialog removes the background from the
	// accessibility tree, so check the mounted element directly.
	await expect(page.locator('section[aria-label="Quickstart"]')).toHaveCount(1);
	const downloadButton = dialog.getByRole('button', { name: /^Download ZIP/ });
	const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
	expect(download.suggestedFilename()).toMatch(/\.zip$/);
	await expect(download.failure()).resolves.toBeNull();
	const files = await unzip(new Uint8Array(readFileSync((await download.path())!)));
	const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json')!)) as Manifest;
	expect(manifest.items.find((item) => item.id === 'vest_leather')?.layers).not.toHaveLength(0);
	await expect(dialog).toHaveCount(0);
	await expect(guide).toHaveCount(0);
	await expect(page.getByRole('tab', { name: 'Wardrobe', exact: true })).toBeFocused();

	await page.setViewportSize({ width: 320, height: 568 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.evaluate(() => localStorage.setItem('pixeldoll.theme', 'light'));
	await page.reload();
	await expect(customize).not.toHaveAccessibleDescription(/No PixelLab key needed/);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: /^Help/ }).click();
	await page.getByRole('button', { name: 'Demo quickstart', exact: true }).click();
	await expect(guide.getByRole('heading')).toBeFocused();
	await expect(guide).toBeInViewport();
	await expect(section(page, 'Head')).toBeInViewport();
	await expect(emptyHead).toHaveAttribute('aria-pressed', 'true');
	// At 320, the follow-up hint scrolls with the list instead of squeezing it to a few pixels.
	const helmet = page.getByRole('button', { name: 'Steel helmet', exact: true });
	await helmet.focus();
	await page.keyboard.press('Enter');
	await expect(guide.getByRole('heading')).toHaveText('Preview your gear');
	await expect(guide.getByRole('heading')).toBeFocused();
	expect(await guide.evaluate((el) => !!el.closest('#wardrobe-list'))).toBe(true);
	expect(await page.locator('#wardrobe-list').evaluate((el) => el.clientHeight)).toBeGreaterThan(
		100
	);
	await section(page, 'Head').scrollIntoViewIfNeeded();
	await expect(helmet).toBeInViewport();
	await guide.getByRole('button', { name: 'Dismiss quickstart', exact: true }).click();
	await expect(guide).toHaveCount(0);
	await expect(page.getByRole('tab', { name: 'Wardrobe', exact: true })).toBeFocused();
	finish();
});

test('studio demo: list search appears only when a panel overflows and filters without reordering', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);

	// Wardrobe already has more rows than a glance, so its field shows without help.
	const wardrobe = page.getByRole('searchbox', { name: 'Search wardrobe', exact: true });
	await expect(wardrobe).toBeVisible();
	await expect(wardrobe).toHaveAttribute('placeholder', 'Search');
	await wardrobe.fill('wizard');
	await expect(page.getByRole('button', { name: /^Wizard hat(,|$)/ })).toHaveCount(1);
	await expect(page.getByRole('button', { name: /^Steel helmet(,|$)/ })).toHaveCount(0);
	await expect(section(page, 'Head')).toBeVisible();
	// A category word keeps every item in that category.
	await wardrobe.fill('head');
	await expect(page.getByRole('button', { name: /^Wizard hat(,|$)/ })).toHaveCount(1);
	await expect(page.getByRole('button', { name: /^Steel helmet(,|$)/ })).toHaveCount(1);
	await wardrobe.fill('nothing matches this');
	await expect(page.getByText('No matching items', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Clear search', exact: true }).click();
	await expect(wardrobe).toHaveValue('');
	await expect(page.getByRole('button', { name: /^Wizard hat(,|$)/ })).toHaveCount(1);
	await expect(page.getByRole('button', { name: /^Steel helmet(,|$)/ })).toHaveCount(1);
	// Filtering narrows the list in place; it never reorders the categories that remain.
	const groupKeys = () =>
		page
			.locator('#wardrobe-list section[data-group]')
			.evaluateAll((sections) => sections.map((section) => section.getAttribute('data-group')));
	const fullOrder = await groupKeys();
	await wardrobe.fill('e');
	const shownOrder = await groupKeys();
	const positions = shownOrder.map((key) => fullOrder.indexOf(key!));
	expect(positions).toEqual([...positions].sort((a, b) => a - b));
	// A matching hidden slot stays under Not shown and is counted in the result summary.
	const hiddenName = (await page.locator('.not-shown-slot').first().getAttribute('aria-label'))
		?.replace(/^Show /, '')
		.trim();
	expect(hiddenName).toBeTruthy();
	await wardrobe.fill(hiddenName!);
	await expect(page.locator('.not-shown-toggle')).toBeVisible();
	await expect(page.locator('.list-search .sr')).toHaveText(/^1 of \d+$/);
	await page.getByRole('button', { name: 'Clear search', exact: true }).click();

	// Short panels stay uncluttered until their content scrolls.
	for (const [tab, label, query, kept, hidden] of [
		['Outfits', 'Search outfits', 'base', '^Base only', '^Adventurer'],
		['Moves', 'Search moves', 'walk', '^Walk', '^Cross punch']
	] as const) {
		await equipmentMode(page, tab);
		const search = page.getByRole('searchbox', { name: label, exact: true });
		await expect(search).toHaveCount(0);
		const list = page.locator('.panel-stack > .panel-list');
		await list.evaluate((element) => {
			(element as HTMLElement).style.maxHeight = '40px';
		});
		await expect(search).toBeVisible();
		await expect(search).toHaveAttribute('placeholder', 'Search');
		await search.fill(query);
		await expect(list.getByRole('button', { name: new RegExp(kept) })).toHaveCount(1);
		await expect(list.getByRole('button', { name: new RegExp(hidden) })).toHaveCount(0);
		await search.press('Escape');
		await expect(search).toHaveValue('');
	}

	await equipmentMode(page, 'Colors');
	const colors = page.getByRole('searchbox', { name: 'Search colors', exact: true });
	await page.locator('.color-panes > .section-list').evaluate((list) => {
		(list as HTMLElement).style.maxHeight = '80px';
	});
	await expect(colors).toBeVisible();
	await colors.fill('helmet');
	await expect(page.getByRole('heading', { name: 'Steel helmet', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Leather vest', exact: true })).toHaveCount(0);
	// A material label finds the item whose colors can change that material.
	await colors.fill('metal');
	await expect(page.getByRole('heading', { name: 'Steel helmet', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Red cape', exact: true })).toHaveCount(0);
	await colors.fill('nothing matches this');
	await expect(page.getByText('No matching colors', { exact: true })).toBeVisible();
	await colors.fill('');

	// An empty States list has nothing to search.
	await equipmentMode(page, 'States');
	await expect(page.getByRole('searchbox', { name: 'Search states', exact: true })).toHaveCount(0);

	await finish();
});

test('dev server: a saved item moves between slots by mouse, keyboard menu and touch', async ({
	context,
	page
}, info) => {
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		await (await import(path)).copyDemo();
	});
	const tile = page.locator('[data-tile="hat_wizard"]');
	const rail = (slot: string) => page.locator(`[data-rail="${slot}"]`);
	const preview = page.locator('.slot-drag-preview');
	const at = (slot: string) => page.locator(`section[data-group="${slot}"]`).locator(tile);
	const center = async (element: Locator) => {
		const box = (await element.boundingBox())!;
		return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	};

	await equipmentGroup(page, 'Head');
	await tile.scrollIntoViewIfNeeded();
	await tile.click();
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	await rail('face_acc').scrollIntoViewIfNeeded();
	const start = await center(tile);
	const face = await center(rail('face_acc'));
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(face.x, face.y, { steps: 6 });
	await expect(preview.getByRole('img', { includeHidden: true })).toHaveCount(1);
	await page.keyboard.press('Escape');
	await page.mouse.up();
	await expect(preview).not.toBeVisible();
	await expect(at('head')).toHaveAttribute('aria-pressed', 'true');
	const blocked = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts';
		const dbPath = '/src/lib/store/db.ts';
		const { doc, flushSave, moveItemToSlot } = await import(statePath);
		const db = await import(dbPath);
		await flushSave();
		const transaction = IDBDatabase.prototype.transaction;
		IDBDatabase.prototype.transaction = function (stores, mode, options) {
			if (stores === 'projects' && mode === 'readwrite') {
				IDBDatabase.prototype.transaction = transaction;
				transaction
					.call(this, 'projects', 'readwrite')
					.objectStore('projects')
					.put(
						{
							id: 'studio-move',
							projectId: doc.id,
							spec: { id: 'cast', frames: 8, items: ['hat_wizard'], seed: 1 }
						},
						'studio-move'
					);
			}
			return transaction.call(this, stores, mode, options);
		};
		try {
			return await moveItemToSlot('hat_wizard', 'face_acc');
		} finally {
			IDBDatabase.prototype.transaction = transaction;
			await db.del('projects', 'studio-move');
		}
	});
	expect(blocked).toBe(false);
	await expect(
		page.getByText('Finish or discard the related generation before moving this item.')
	).toBeVisible();
	await expect(at('head')).toHaveAttribute('aria-pressed', 'true');
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(face.x, face.y, { steps: 6 });
	const list = page.locator('.equipment-scroll');
	const currentSlot = page.locator('[data-rail][aria-current="true"]');
	const beforeDrop = await list.evaluate((element) => element.scrollTop);
	const slotBeforeDrop = await currentSlot.getAttribute('data-rail');
	expect(slotBeforeDrop).not.toBe('face_acc');
	await page.mouse.up();
	await expect(at('face_acc')).toHaveAttribute('aria-pressed', 'true');
	await expect(currentSlot).toHaveAttribute('data-rail', slotBeforeDrop!);
	expect(await list.evaluate((element) => element.scrollTop)).toBe(beforeDrop);

	await at('face_acc').focus();
	await page.keyboard.press('Shift+F10');
	await expect(page.getByRole('menuitem', { name: 'Details...', exact: true })).toBeFocused();
	await page.getByRole('menuitem', { name: 'Move to slot' }).press('Enter');
	await page.getByRole('menuitem', { name: 'Hair', exact: true }).press('Enter');
	await expect(at('hair')).toHaveAttribute('aria-pressed', 'true');
	await expect(at('hair')).toBeFocused();
	// Each move is one history step.
	await expect(page.locator('.header-undo')).toHaveAccessibleName('Undo Move Wizard hat');
	await page.locator('.header-undo').click();
	await expect(at('face_acc')).toHaveAttribute('aria-pressed', 'true');
	await page.locator('.header-redo').click();
	await expect(at('hair')).toHaveAttribute('aria-pressed', 'true');
	await reloadStudio(page);
	await expect(at('hair')).toHaveAttribute('aria-pressed', 'true');

	await page.setViewportSize({ width: 390, height: 844 });
	await equipmentGroup(page, 'Hair');
	await tile.scrollIntoViewIfNeeded();
	await rail('face_acc').scrollIntoViewIfNeeded();
	const source = await center(tile),
		target = await center(rail('face_acc'));
	const session = await context.newCDPSession(page);
	await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
	await page.clock.install();
	await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [source] });
	await page.clock.runFor(300);
	await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [target] });
	await expect(preview).toBeVisible();
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect(at('face_acc')).toHaveAttribute('aria-pressed', 'true');
	await reloadStudio(page);
	await expect(at('face_acc')).toHaveAttribute('aria-pressed', 'true');

	// A stopped move holds the items it poses: clicking the busy notice opens that move.
	await page.evaluate(async () => {
		const path = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ path);
		const s = (window as unknown as { __studio: { doc: { id: string } } }).__studio;
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			status: 'failed',
			error: 'Saved terminal failure',
			progress: { step: 'animate', done: 1, total: 4, recIds: [] },
			projectId: s.doc.id,
			spec: { id: 'cast', action: 'cast', frames: 8, items: ['hat_wizard'], seed: 1 }
		});
	});
	await reloadStudio(page);
	// Work that stopped before this page loaded is announced once.
	const stopped = page.locator('.toast .bu-notice', { hasText: '1 generation stopped' });
	await stopped.getByRole('button', { name: 'Dismiss notification' }).click();
	await expect(stopped).toBeHidden();
	await at('face_acc').focus();
	await page.keyboard.press('Shift+F10');
	await expect(page.getByRole('menuitem', { name: 'Details...', exact: true })).toBeFocused();
	await page.getByRole('menuitem', { name: 'Move to slot' }).press('Enter');
	await page.getByRole('menuitem', { name: 'Hair', exact: true }).press('Enter');
	await page
		.locator('.toast .bu-notice', { hasText: 'Finish or discard the related generation' })
		.locator('.bu-notice-activate')
		.click();
	await expect(page.getByRole('dialog', { name: 'New move', exact: true })).toContainText(
		'Saved terminal failure'
	);
	await expect(at('face_acc')).toHaveCount(1);
});

test('studio demo: slots add, rename, show, hide and reorder without changing the drawing', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	const drawing = () =>
		page
			.locator('.world-actors')
			.first()
			.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
	const before = await drawing();
	const add = page.getByRole('button', { name: 'Add slot', exact: true });
	await expect
		.poll(async () => {
			return add.locator('.bu-rail-label').evaluate((label) => {
				const style = getComputedStyle(label);
				const context = document.createElement('canvas').getContext('2d')!;
				context.font = style.font;
				const ink = context.measureText(label.textContent!);
				const baseline =
					label.getBoundingClientRect().top +
					(parseFloat(style.lineHeight) - ink.fontBoundingBoxAscent - ink.fontBoundingBoxDescent) /
						2 +
					ink.fontBoundingBoxAscent;
				return Math.abs(
					baseline +
						ink.actualBoundingBoxDescent -
						document.querySelector('.playback-bar')!.getBoundingClientRect().bottom
				);
			});
		})
		.toBeLessThanOrEqual(1);
	const addSheet = page.getByRole('dialog', { name: 'Add slot', exact: true });
	const header = (key: string) => page.locator(`[data-slot-button="${key}"]`);
	const menu = page.locator('#slot-menu');
	const shownKeys = () =>
		page
			.locator('#wardrobe-list > section[data-own]')
			.evaluateAll((all) => all.map((entry) => (entry as HTMLElement).dataset.group));
	await expect(page.locator('#wardrobe-list > section[data-own]')).toHaveCount(10);
	const list = page.locator('#wardrobe-list');
	const scroll = () => list.evaluate((element) => element.scrollTop);
	await header('head').click();
	const originalScroll = await scroll();
	await menu.getByRole('menuitem', { name: 'Move down', exact: true }).click();
	await expect.poll(scroll).toBe(originalScroll);
	await expect(page.locator('[data-rail="hair"]')).toHaveAttribute('aria-current', 'true');
	await header('head').click();
	await menu.getByRole('menuitem', { name: 'Move up', exact: true }).click();
	await expect.poll(scroll).toBe(originalScroll);
	await add.click();
	const form = addSheet.getByRole('form', { name: 'Create custom slot' });
	await expect(form.getByRole('textbox', { name: 'Slot name', exact: true })).toBeVisible();
	const createBounds = (await form
		.getByRole('button', { name: 'Create slot', exact: true })
		.boundingBox())!;
	const behaviorBounds = (await form.getByRole('combobox', { name: 'Works like' }).boundingBox())!;
	expect(createBounds.y).toBeGreaterThan(behaviorBounds.y + behaviorBounds.height);
	await addSheet.getByRole('button', { name: 'Show Underwear', exact: true }).click();
	await expect.poll(scroll).toBe(originalScroll);
	await header('underwear').click();
	await menu.getByRole('menuitem', { name: 'Hide slot', exact: true }).click();
	await page.getByRole('button', { name: /^Not shown \d+$/ }).click();
	await expect(page.getByRole('button', { name: 'Show Underwear', exact: true })).toBeVisible();
	await add.click();
	await addSheet.getByRole('button', { name: 'Create slot', exact: true }).click();
	const beforeAdd = await scroll();
	await add.click();
	await addSheet.getByRole('button', { name: 'Create slot', exact: true }).click();
	await expect.poll(scroll).toBe(beforeAdd);
	await header('accessory').click();
	await menu.getByRole('menuitem', { name: 'Edit slot...', exact: true }).click();
	const editor = page.getByRole('dialog', { name: 'Accessory', exact: true });
	await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Brooch');
	// Every way out of an edited sheet asks before losing the edit; Keep editing returns to it unchanged.
	await editor.getByRole('button', { name: 'Close', exact: true }).click();
	const discard = page.getByRole('alertdialog', { name: 'Discard changes?', exact: true });
	await discard.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await expect(discard).toBeHidden();
	await expect(editor.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Brooch');
	await editor
		.getByRole('combobox', { name: 'Draws above', exact: true })
		.selectOption('torso_outer');
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	await header('accessory').focus();
	await page.keyboard.press('Enter');
	await menu.getByRole('menuitem', { name: 'Move up', exact: true }).click();
	await expect(header('accessory')).toBeFocused();
	const ordered = await shownKeys();
	expect(ordered.indexOf('accessory')).toBe(9);
	expect(await drawing()).toBe(before);
	await reloadStudio(page, { waitUntil: 'networkidle' });
	expect(await shownKeys()).toEqual(ordered);
	await expect(header('accessory')).toHaveAccessibleName('Brooch');
	await expect(header('accessory_2')).toHaveAccessibleName('Accessory 2');
	await equipmentGroup(page, 'Head');
	await header('head').click();
	await expect(menu.getByRole('menuitem', { name: /^Hide slot/ })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(menu).toContainText('items');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	await page.getByRole('button', { name: 'Appearance', exact: true }).click();
	await page.getByRole('radio', { name: 'Light', exact: true }).check();
	await page
		.getByRole('dialog', { name: 'Settings' })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await page.setViewportSize({ width: 320, height: 568 });
	await equipmentGroup(page, 'Brooch');
	await header('accessory').click();
	await menu.getByRole('menuitem', { name: 'Edit slot...', exact: true }).click();
	const compactEditor = page.getByRole('dialog', { name: 'Brooch', exact: true });
	await expect(compactEditor.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
		'Brooch'
	);
	await expect(
		compactEditor.getByRole('combobox', { name: 'Draws above', exact: true })
	).toHaveValue('torso_outer');
	const compactBounds = await compactEditor.boundingBox();
	expect(compactBounds!.x).toBeGreaterThanOrEqual(0);
	expect(compactBounds!.x + compactBounds!.width).toBeLessThanOrEqual(320);
	await compactEditor.getByRole('button', { name: 'Save', exact: true }).click();
	const heights = await list
		.locator('section[data-own]')
		.evaluateAll((all) => all.map((element) => (element as HTMLElement).offsetHeight));
	expect(new Set(heights).size).toBeGreaterThan(1);
	for (const direction of ['Move up', 'Move down']) {
		await header('main_hand').click();
		const beforeMove = await scroll();
		await menu.getByRole('menuitem', { name: direction, exact: true }).click();
		await expect.poll(scroll).toBe(beforeMove);
	}
	await add.click();
	await page.screenshot({ path: test.info().outputPath('add-slot-320-light.png') });
	await addSheet.getByRole('button', { name: 'Close', exact: true }).click();
	const disclosure = page.getByRole('button', { name: /^Not shown \d+$/ });
	const hiddenShortcut = page.getByRole('button', { name: 'Not shown, 6 slots', exact: true });
	const footer = page.locator('.slot-rail-footer');
	await expect(footer.locator('.slot-add')).toHaveCount(1);
	await expect(page.locator('.slot-rail .slot-add')).toHaveCount(0);
	const footerBounds = (await footer.boundingBox())!;
	const addBounds = (await add.boundingBox())!;
	const railBounds = (await page.locator('.slot-rail').boundingBox())!;
	expect(footerBounds.height).toBeGreaterThan(0);
	expect(footerBounds.y + footerBounds.height).toBeLessThanOrEqual(568);
	expect(addBounds.x).toBeGreaterThanOrEqual(0);
	expect(addBounds.x + addBounds.width).toBeLessThanOrEqual(320);
	expect(addBounds.y).toBeGreaterThanOrEqual(railBounds.y + railBounds.height);
	expect(railBounds.height).toBeGreaterThanOrEqual(52);
	await expect(page.locator('.slot-rail-list > li').last().locator('[data-not-shown]')).toHaveCount(
		1
	);
	await page.locator('.slot-rail').evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	expect((await add.boundingBox())!.y).toBe(addBounds.y);
	await hiddenShortcut.click();
	await expect(disclosure).toHaveAccessibleName('Not shown 6');
	await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
	await expect(hiddenShortcut).toBeFocused();
	await expect(hiddenShortcut).toHaveAttribute('aria-current', 'true');
	await expect(disclosure).toHaveAttribute('data-current');
	await expect(disclosure.locator('.bu-section-title')).toHaveCSS(
		'color',
		await hiddenShortcut
			.locator('.bu-rail-label')
			.evaluate((label) => getComputedStyle(label).color)
	);
	await expect(hiddenShortcut).toHaveAttribute('tabindex', '0');
	await expect(page.locator('.slot-rail [aria-current="true"]')).toHaveCount(1);
	await expect(page.locator('.slot-rail [tabindex="0"]')).toHaveCount(1);
	await disclosure.click();
	await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
	await expect(hiddenShortcut).toHaveAttribute('aria-current', 'true');
	await list.evaluate((element) => {
		element.scrollTop = element.querySelector<HTMLElement>(
			'section[data-own]:last-of-type'
		)!.offsetTop;
	});
	await expect(hiddenShortcut).not.toHaveAttribute('aria-current', 'true');
	await expect(page.locator('.slot-rail [data-rail][aria-current="true"]')).toHaveCount(1);
	await list.evaluate((element) => {
		element.scrollTop = element.querySelector<HTMLElement>('.not-shown')!.offsetTop;
	});
	await expect(hiddenShortcut).toHaveAttribute('aria-current', 'true');
	await hiddenShortcut.click();
	await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
	const note = list.locator('.not-shown-note');
	expect(await note.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(
		await note.evaluate((element) => Math.ceil(parseFloat(getComputedStyle(element).lineHeight)))
	);
	await expect(disclosure.locator('svg').first()).toHaveClass(/lucide-eye-off/);
	await expect(disclosure.locator('svg').last()).toHaveClass(/not-shown-chevron/);
	const disclosureY = (await disclosure.boundingBox())!.y;
	expect(Math.abs(disclosureY - (await list.boundingBox())!.y)).toBeLessThanOrEqual(1);
	await expect(disclosure).toHaveJSProperty(
		'offsetWidth',
		await list.locator('.not-shown').evaluate((element) => element.clientWidth)
	);
	await page.screenshot({ path: test.info().outputPath('not-shown-320-light.png') });
	const eyes = list.locator('[data-show-slot]');
	const hiddenCount = await eyes.count();
	for (let remaining = hiddenCount; remaining > 0; remaining--) {
		const restoredKey = await eyes.first().getAttribute('data-show-slot');
		const nextKey = remaining > 1 ? await eyes.nth(1).getAttribute('data-show-slot') : null;
		await eyes.first().click();
		const anchor = remaining > 1 ? disclosure : header(restoredKey!);
		if (remaining > 1) {
			await expect(list.locator(`[data-show-slot="${nextKey}"]`)).toBeFocused();
			await expect(disclosure).toHaveAccessibleName(`Not shown ${remaining - 1}`);
		} else {
			await expect(disclosure).toHaveCount(0);
			await expect(hiddenShortcut).toHaveCount(0);
			await expect(anchor).toBeFocused();
		}
		await expect
			.poll(async () => Math.abs((await anchor.boundingBox())!.y - disclosureY))
			.toBeLessThanOrEqual(1);
	}
	finish();
});

test('studio demo: a custom slot chooses its own Wardrobe icon', async ({ context, page }) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('button', { name: 'Add slot', exact: true }).click();
	const addSheet = page.getByRole('dialog', { name: 'Add slot', exact: true });
	await addSheet.getByRole('textbox', { name: 'Slot name', exact: true }).fill('Wings');
	await addSheet.getByRole('combobox', { name: 'Works like' }).selectOption('back');
	await addSheet.getByRole('button', { name: 'Create slot', exact: true }).click();
	const header = page.locator('[data-slot-button="wings"]');
	await expect(header).toHaveAccessibleName('Wings');
	const iconPath = () => header.locator('svg.group-icon path').getAttribute('d');
	// A new custom category owns the generic tag, not the cape its behavior copies.
	const tag = await iconPath();
	await header.click();
	await page
		.locator('#slot-menu')
		.getByRole('menuitem', { name: 'Edit slot...', exact: true })
		.click();
	const editor = page.getByRole('dialog', { name: 'Wings', exact: true });
	const icons = editor.getByRole('radiogroup', { name: 'Icon', exact: true });
	await expect(icons.getByRole('radio', { name: 'Tag', exact: true })).toBeChecked();
	const star = icons.getByRole('radio', { name: 'Star', exact: true });
	await star.focus();
	await page.keyboard.press('Space');
	await expect(star).toBeChecked();
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	const chosen = (await iconPath())!;
	expect(chosen).not.toBe(tag);
	// The category keeps its choice across a reload, and Back still draws its own cape.
	await reloadStudio(page, { waitUntil: 'networkidle' });
	await equipmentGroup(page, 'Wings');
	await expect.poll(iconPath).toBe(chosen);
	await expect(page.locator('[data-slot-button="back"] svg.group-icon path')).not.toHaveAttribute(
		'd',
		chosen
	);
	finish();
});

test('studio demo: slot header dragging and not-shown restoration are tolerant and undoable', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.clock.install();
	const list = page.locator('#wardrobe-list');
	const keys = () =>
		list
			.locator('section[data-own]')
			.evaluateAll((all) => all.map((entry) => (entry as HTMLElement).dataset.group));
	const hair = page.locator('[data-slot-button="hair"]');
	const head = page.locator('[data-slot-button="head"]');
	const original = await keys();
	const source = (await hair.boundingBox())!;
	await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(source.x + source.width / 2 + 2, source.y + source.height / 2 + 2);
	await page.mouse.up();
	await expect(page.locator('#slot-menu')).toBeVisible();
	expect(await keys()).toEqual(original);
	await page.keyboard.press('Escape');
	const target = (await head.boundingBox())!;
	await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 6 });
	await expect(page.locator('.slot-drop-line')).toBeVisible();
	const topLine = (await list.locator('.slot-drop-line').boundingBox())!;
	const topList = (await list.boundingBox())!;
	expect(topLine.y).toBeGreaterThanOrEqual(topList.y);
	expect(topLine.y + topLine.height).toBeLessThanOrEqual(topList.y + topList.height);
	await expect(page.locator('.slot-drag-preview')).toBeVisible();
	await expect(page.locator('.slot-drag-preview')).toContainText('Hair');
	const preview = (await page.locator('.slot-drag-preview').boundingBox())!;
	expect(Math.abs(preview.y + preview.height - target.y)).toBeLessThan(70);
	await page.keyboard.press('Escape');
	await page.mouse.up();
	expect(await keys()).toEqual(original);
	await expect(page.locator('.slot-drop-line')).toHaveCount(0);
	await expect(page.locator('.slot-drag-preview')).not.toBeVisible();
	await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 6 });
	const dropScroll = await list.evaluate((element) => element.scrollTop);
	await page.mouse.up();
	await expect.poll(keys).toEqual(['hair', ...original.filter((key) => key !== 'hair')]);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(dropScroll);
	await expect(hair).toBeFocused();
	await expect(page.locator('#slot-menu')).not.toBeVisible();
	await page.locator('.header-undo').click();
	await expect.poll(keys).toEqual(original);
	const rail = page.locator('.slot-rail');
	const railHair = rail.locator('[data-rail="hair"][data-sortable]');
	const railHead = rail.locator('[data-rail="head"][data-sortable]');
	await railHair.click({ button: 'right' });
	const slotMenu = page.locator('#slot-menu');
	await expect(slotMenu).toBeVisible();
	await expect(slotMenu).toHaveAccessibleName('Hair slot');
	expect(await keys()).toEqual(original);
	const menuBounds = (await slotMenu.boundingBox())!;
	const openerBounds = (await railHair.boundingBox())!;
	expect(
		Math.max(
			menuBounds.x - openerBounds.x - openerBounds.width,
			openerBounds.x - menuBounds.x - menuBounds.width,
			0
		)
	).toBeLessThanOrEqual(16);
	expect(
		Math.max(
			menuBounds.y - openerBounds.y - openerBounds.height,
			openerBounds.y - menuBounds.y - menuBounds.height,
			0
		)
	).toBeLessThanOrEqual(16);
	await page.keyboard.press('Escape');
	await expect(railHair).toBeFocused();
	await page.keyboard.press('Shift+F10');
	await expect(slotMenu).toBeVisible();
	await expect(slotMenu).toHaveAccessibleName('Hair slot');
	await page.keyboard.press('Escape');
	const railSource = (await railHair.boundingBox())!;
	await page.mouse.move(railSource.x + 20, railSource.y + railSource.height / 2);
	await page.mouse.down();
	await page.mouse.move(railSource.x + 22, railSource.y + railSource.height / 2 + 2);
	await page.mouse.up();
	await expect(railHair).toHaveAttribute('aria-current', 'true');
	expect(await keys()).toEqual(original);
	const railTarget = (await railHead.boundingBox())!;
	await page.mouse.move(railSource.x + 20, railSource.y + railSource.height / 2);
	await page.mouse.down();
	await page.mouse.move(railTarget.x + 20, railTarget.y + 2, { steps: 6 });
	await expect(rail.locator('.slot-drop-line')).toBeVisible();
	await expect(list.locator('.slot-drop-line')).toHaveCount(0);
	await page.mouse.up();
	await expect.poll(keys).toEqual(['hair', ...original.filter((key) => key !== 'hair')]);
	await page.locator('.header-undo').click();
	await expect.poll(keys).toEqual(original);
	const fixedHidden = page.getByRole('button', { name: 'Not shown, 6 slots', exact: true });
	const fixedBounds = (await page.locator('.slot-add').boundingBox())!;
	const rejectSource = (await railHair.boundingBox())!;
	await page.mouse.move(rejectSource.x + 20, rejectSource.y + rejectSource.height / 2);
	await page.mouse.down();
	await page.mouse.move(railTarget.x + 20, railTarget.y + 2, { steps: 6 });
	await expect(rail.locator('.slot-drop-line')).toBeVisible();
	await page.mouse.move(fixedBounds.x + 20, fixedBounds.y + fixedBounds.height / 2, {
		steps: 6
	});
	await expect(page.locator('.slot-drop-line')).toHaveCount(0);
	await page.mouse.up();
	expect(await keys()).toEqual(original);
	await fixedHidden.click();
	const hidden = page.locator('.not-shown-row').filter({ hasText: 'Underwear' });
	await hidden.scrollIntoViewIfNeeded();
	const hiddenShow = hidden.getByRole('button', { name: 'Show Underwear', exact: true });
	await hiddenShow.click({ button: 'right' });
	await expect(slotMenu).toBeVisible();
	await expect(slotMenu).toHaveAccessibleName('Underwear slot');
	await expect(slotMenu.getByRole('menuitem', { name: 'Show slot', exact: true })).toBeVisible();
	await expect(slotMenu.getByRole('menuitem', { name: 'Make a custom copy...' })).toBeVisible();
	await expect(slotMenu.getByRole('menuitem', { name: 'Hide slot' })).toHaveCount(0);
	expect(await keys()).toEqual(original);
	await page.keyboard.press('Escape');
	await expect(hiddenShow).toBeFocused();
	await page.keyboard.press('Shift+F10');
	await slotMenu.getByRole('menuitem', { name: 'Show slot', exact: true }).click();
	await expect.poll(keys).toContain('underwear');
	await page.locator('.header-undo').click();
	await expect.poll(keys).toEqual(original);
	await hidden.scrollIntoViewIfNeeded();
	await list.evaluate((element) => {
		const last = element.querySelector<HTMLElement>('section[data-own]:last-of-type')!;
		element.scrollTop = last.offsetTop - 100;
	});
	const hiddenBox = (await hidden.boundingBox())!;
	const drop = await list.evaluate((element) => {
		const last = [...element.querySelectorAll<HTMLElement>('section[data-own]')].at(-1)!;
		const box = element.getBoundingClientRect();
		return { x: box.left + 30, y: box.top + last.offsetTop - element.scrollTop + 2 };
	});
	await page.mouse.move(hiddenBox.x + 24, hiddenBox.y + hiddenBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(drop.x, drop.y, { steps: 6 });
	await expect(page.locator('.slot-drop-line')).toBeVisible();
	const restoreScroll = await list.evaluate((element) => element.scrollTop);
	await page.mouse.up();
	const restored = [...original];
	restored.splice(restored.length - 1, 0, 'underwear');
	await expect.poll(keys).toEqual(restored);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(restoreScroll);
	await page.locator('.header-undo').click();
	await expect.poll(keys).toEqual(original);
	await expect(page.getByRole('button', { name: 'Show Underwear', exact: true })).toBeAttached();
	await list.evaluate((element) => {
		const last = [...element.querySelectorAll<HTMLElement>('section[data-own]')].at(-1)!;
		element.scrollTop = last.offsetTop - 40;
	});
	const dragToNotShown = async (key: string) => {
		const from = (await page.locator(`[data-slot-button="${key}"]`).boundingBox())!;
		const to = (await page.locator('.not-shown-toggle').boundingBox())!;
		await page.mouse.move(from.x + 20, from.y + 20);
		await page.mouse.down();
		await page.mouse.move(to.x + 20, to.y + 8, { steps: 6 });
		await expect(page.locator('.slot-drop-line')).toHaveCount(0);
	};
	// An empty slot dropped on Not shown hides, like Hide slot in its menu.
	await dragToNotShown('off_hand');
	await expect(page.locator('.not-shown-toggle')).toHaveAttribute('data-current', 'true');
	await page.mouse.up();
	await expect.poll(keys).toEqual(original.filter((key) => key !== 'off_hand'));
	await page.locator('.header-undo').click();
	await expect.poll(keys).toEqual(original);
	// A slot with items is refused with the menu's reason.
	await list.evaluate((element) => {
		element.scrollTop =
			element.querySelector<HTMLElement>('[data-group="main_hand"]')!.offsetTop - 40;
	});
	await dragToNotShown('main_hand');
	await expect(page.locator('.not-shown-toggle')).not.toHaveAttribute('data-current');
	await page.mouse.up();
	await expect(page.locator('.toast')).toContainText('Only empty slots can be hidden.');
	expect(await keys()).toEqual(original);
	await list.evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
	const startHead = (await head.boundingBox())!;
	const listBox = (await list.boundingBox())!;
	await page.mouse.move(startHead.x + 25, startHead.y + 20);
	await page.mouse.down();
	await page.mouse.move(startHead.x + 25, listBox.y + listBox.height - 12, { steps: 8 });
	await page.clock.runFor(1000);
	const scrolled = await list.evaluate((element) => element.scrollTop);
	expect(scrolled).toBeGreaterThan(0);
	const feet = await list.evaluate((element) => {
		const section = element.querySelector<HTMLElement>('[data-group="feet"]')!;
		return {
			x: element.getBoundingClientRect().left + 30,
			y: element.getBoundingClientRect().top + section.offsetTop - element.scrollTop + 2
		};
	});
	await page.mouse.move(feet.x, feet.y);
	await page.clock.runFor(16);
	await expect(page.locator('.slot-drop-line')).toBeVisible();
	const beforeDistantDrop = await list.evaluate((element) => element.scrollTop);
	await page.mouse.up();
	const distantOrder = original.filter((key) => key !== 'head');
	distantOrder.splice(distantOrder.indexOf('feet'), 0, 'head');
	await expect.poll(keys).toEqual(distantOrder);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(beforeDistantDrop);
	finish();
});

test('studio demo: touch slot headers scroll before a hold and drag after arming', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await page.setViewportSize({ width: 390, height: 844 });
	await openDemo(page);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.clock.install();
	const session = await context.newCDPSession(page);
	await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
	const touch = (
		type: 'touchStart' | 'touchMove' | 'touchEnd',
		points: { x: number; y: number; id: number }[]
	) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
	const list = page.locator('#wardrobe-list');
	const keys = () =>
		list
			.locator('section[data-own]')
			.evaluateAll((all) => all.map((element) => (element as HTMLElement).dataset.group));
	const original = await keys();
	const head = page.locator('[data-slot-button="head"]');
	let box = (await head.boundingBox())!;
	const initialScroll = await list.evaluate((element) => element.scrollTop);
	await touch('touchStart', [{ x: box.x + 15, y: box.y + box.height / 2, id: 1 }]);
	await touch('touchMove', [{ x: box.x + 15, y: box.y - 70, id: 1 }]);
	await touch('touchMove', [{ x: box.x + 15, y: box.y - 100, id: 1 }]);
	await touch('touchEnd', []);
	await page.clock.runFor(350);
	await expect
		.poll(() => list.evaluate((element) => element.scrollTop))
		.toBeGreaterThan(initialScroll);
	expect(await keys()).toEqual(original);
	await expect(page.locator('#slot-menu')).not.toBeVisible();
	await list.evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
	const hair = page.locator('[data-slot-button="hair"]');
	await hair.scrollIntoViewIfNeeded();
	box = (await hair.boundingBox())!;
	const start = { x: box.x + 15, y: box.y + box.height / 2, id: 2 };
	await touch('touchStart', [start]);
	await page.clock.runFor(300);
	await expect(
		hair.locator('xpath=ancestor::div[contains(@class,"bu-section-head")]')
	).toHaveAttribute('data-armed', 'true');
	await touch('touchMove', [{ ...start, y: start.y - 2 }]);
	await expect(list.locator('[data-dragged]')).toHaveCount(0);
	const listTop = (await list.boundingBox())!.y;
	await touch('touchMove', [{ ...start, y: listTop + 4 }]);
	await expect(list.locator('[data-dragged]')).toHaveCount(1);
	await page.clock.runFor(32);
	await expect(page.locator('.slot-drop-line')).toBeVisible();
	await expect(page.locator('.slot-drag-preview')).toBeVisible();
	await page.screenshot({ path: test.info().outputPath('slot-drop-top-390-dark.png') });
	await touch('touchMove', [{ ...start, x: 386, y: listTop + 4 }]);
	await page.clock.runFor(16);
	const previewBounds = (await page.locator('.slot-drag-preview').boundingBox())!;
	expect(previewBounds.x).toBeGreaterThanOrEqual(8);
	expect(previewBounds.x + previewBounds.width).toBeLessThanOrEqual(382);
	await page.screenshot({ path: test.info().outputPath('slot-drag-390-dark.png') });
	await touch('touchMove', [{ ...start, y: listTop + 4 }]);
	await page.clock.runFor(16);
	await touch('touchEnd', []);
	await page.clock.runFor(32);
	await expect.poll(keys).toEqual(['hair', ...original.filter((key) => key !== 'hair')]);
	// The slot moved to the top is brought into view at the list's top.
	await expect
		.poll(async () => {
			const hairBox = (await section(page, 'Hair').boundingBox())!;
			const listBox = (await list.boundingBox())!;
			return Math.round(hairBox.y - listBox.y);
		})
		.toBeLessThan(4);
	await expect(page.locator('.slot-drag-preview')).not.toBeVisible();
	await expect(page.locator('#slot-menu')).not.toBeVisible();
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.locator('#experience-options .mobile-undo').click();
	await expect.poll(keys).toEqual(original);
	const rail = page.locator('.slot-rail');
	const railHair = rail.locator('[data-rail="hair"][data-sortable]');
	const railHead = rail.locator('[data-rail="head"][data-sortable]');
	const railSource = (await railHair.boundingBox())!;
	const railStart = { x: railSource.x + 15, y: railSource.y + railSource.height / 2, id: 3 };
	await touch('touchStart', [railStart]);
	await page.clock.runFor(300);
	await expect(railHair).toHaveAttribute('data-armed', 'true');
	await touch('touchMove', [{ ...railStart, y: railStart.y - 2 }]);
	await expect(rail.locator('[data-dragged]')).toHaveCount(0);
	const railTarget = (await railHead.boundingBox())!;
	await touch('touchMove', [{ ...railStart, y: railTarget.y + 2 }]);
	await expect(rail.locator('[data-dragged]')).toHaveCount(1);
	await page.clock.runFor(32);
	await expect(rail.locator('.slot-drop-line')).toBeVisible();
	await expect(list.locator('.slot-drop-line')).toHaveCount(0);
	await touch('touchEnd', []);
	await page.clock.runFor(32);
	await expect.poll(keys).toEqual(['hair', ...original.filter((key) => key !== 'hair')]);
	await expect(page.locator('.slot-drag-preview')).not.toBeVisible();
	const navigationScroll = await list.evaluateHandle((element) => {
		const scroll = { ended: false };
		element.addEventListener('scrollend', () => (scroll.ended = true), { once: true });
		return scroll;
	});
	const navigation = (await railHead.boundingBox())!;
	await touch('touchStart', [
		{ x: navigation.x + 15, y: navigation.y + navigation.height / 2, id: 4 }
	]);
	await touch('touchEnd', []);
	await expect(railHead).toHaveAttribute('aria-current', 'true');
	await expect(page.locator('#slot-menu')).not.toBeVisible();
	await expect
		.poll(() => navigationScroll.evaluate((scroll) => scroll.ended), {
			message: 'Head navigation finishes scrolling before the hold'
		})
		.toBe(true);
	await navigationScroll.dispose();
	const holdRail = (await railHead.boundingBox())!;
	const beforeHold = await keys();
	await touch('touchStart', [{ x: holdRail.x + 15, y: holdRail.y + 20, id: 5 }]);
	await page.clock.runFor(550);
	const slotMenu = page.locator('#slot-menu');
	await expect(slotMenu).toBeVisible();
	await expect(slotMenu).toHaveAccessibleName('Head slot');
	await touch('touchEnd', []);
	await page.clock.runFor(32);
	await expect(slotMenu).toBeVisible();
	await expect(railHead).toHaveAttribute('aria-current', 'true');
	expect(await keys()).toEqual(beforeHold);
	await page.keyboard.press('Escape');
	await expect(railHead).toBeFocused();
	await page.getByRole('button', { name: 'Not shown, 6 slots', exact: true }).click();
	const hiddenShow = page.getByRole('button', { name: 'Show Underwear', exact: true });
	await hiddenShow.scrollIntoViewIfNeeded();
	const holdHidden = (await hiddenShow.boundingBox())!;
	await touch('touchStart', [{ x: holdHidden.x + 15, y: holdHidden.y + 20, id: 6 }]);
	await page.clock.runFor(550);
	await expect(slotMenu).toBeVisible();
	await expect(slotMenu).toHaveAccessibleName('Underwear slot');
	await touch('touchEnd', []);
	await page.clock.runFor(32);
	await expect(slotMenu).toBeVisible();
	expect(await keys()).toEqual(beforeHold);
	await page.keyboard.press('Escape');
	await expect(hiddenShow).toBeFocused();
	await session.detach();
	finish();
});

test('studio demo: dressing, undo, recolor, outfits, keyboard views and theme survive a reload and export', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	// Tile names start with the item name; status words (such as missing frames) follow after a comma.
	const pressed = (name: string) =>
		page
			.locator('.equipment-scroll')
			.getByRole('button', {
				// Plain names only (letters, spaces and commas), so no escaping is needed.
				name: new RegExp(`^${name}(,|$)`)
			})
			.getAttribute('aria-pressed');
	const stage = () =>
		page
			.locator('.world-actors')
			.first()
			.evaluate((c) => (c as HTMLCanvasElement).toDataURL());

	// pause playback so the stage is comparable
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	assert.equal(await pressed('Steel helmet'), 'true');
	// Undo and Redo appear at the start of the end-anchored group, only while usable, so history never moves Mount
	// settings, Random look, Share, Export, Full screen or More.
	const barX = () =>
		page
			.locator('.header-actions button:not(.header-undo, .header-redo)')
			.evaluateAll((buttons) => buttons.map((b) => Math.round(b.getBoundingClientRect().x)));
	await expect(page.locator('.header-undo')).toBeHidden();
	await expect(page.locator('.header-redo')).toBeHidden();
	const emptyHistoryBar = await barX();
	await page.locator('.equipment-scroll .item-tile', { hasText: 'Wizard hat' }).click();
	assert.equal(await pressed('Wizard hat'), 'true');
	await expect(page.locator('.header-undo')).toBeVisible();
	await expect(page.locator('.header-redo')).toBeHidden();
	assert.deepEqual(await barX(), emptyHistoryBar);
	assert.equal(await pressed('Steel helmet'), 'false');
	step('wear swaps the item in the slot');

	await page.locator('.equipment-scroll .item-tile', { hasText: 'Wizard hat' }).click();
	assert.equal(await pressed('Wizard hat'), 'false');
	assert.equal(await pressed('Empty head'), 'true');
	await expect(page.locator('.item-tile[data-selected]')).toHaveAccessibleName(/^Wizard hat(,|$)/);
	await page
		.locator('.equipment-scroll')
		.getByRole('button', { name: 'Empty head', exact: true })
		.click();
	await expect(page.locator('.header-undo')).toHaveAttribute(
		'aria-label',
		'Undo Take off Wizard hat'
	);
	await page.locator('.equipment-scroll .item-tile', { hasText: 'Wizard hat' }).click();
	assert.equal(await pressed('Wizard hat'), 'true');
	step(
		'tapping a worn item takes it off, tapping again wears it; Empty with nothing worn adds no undo step'
	);

	for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Undo/ }).click();
	// An emptied Undo leaves the bar; Redo shows right of where it was.
	await expect(page.locator('.header-undo')).toBeHidden();
	await expect(page.locator('.header-redo')).toBeVisible();
	assert.deepEqual(await barX(), emptyHistoryBar);
	assert.equal(await pressed('Steel helmet'), 'true');
	await page.keyboard.press('Control+Shift+Z');
	assert.equal(await pressed('Wizard hat'), 'true');
	step('undo / redo (button + shortcut)');

	await equipmentGroup(page, 'Main hand');
	await expect(page.getByRole('heading', { name: 'Main hand', exact: true })).toBeVisible();
	assert.equal(await pressed('Steel longsword'), 'true');
	await equipmentGroup(page, 'Off hand');
	await expect(page.getByRole('heading', { name: 'Off hand', exact: true })).toBeVisible();
	// An empty category shows Empty first and a New tile beside it, plus the header's +.
	await expect(page.getByRole('group', { name: 'Off hand items', exact: true })).toHaveText(
		/^\s*Empty\s*New\s*$/
	);
	await expect(page.getByRole('button', { name: 'New off hand item', exact: true })).toHaveCount(2);
	await equipmentGroup(page, 'Head');
	step('held items have separate Main hand and Off hand groups');

	const before = await stage();
	await equipmentMode(page, 'Colors');
	// The Colors rail lists exactly the worn sections, in Wardrobe's order, and both follows and drives the list.
	const colorsList = page.locator('.color-sections');
	const colorsRail = page.getByRole('navigation', { name: 'Color categories', exact: true });
	const colorTabs = colorsRail.getByRole('button');
	const colorTab = (name: string) => colorsRail.getByRole('button', { name, exact: true });
	const sectionTop = async (name: string) => {
		const [section, box] = await Promise.all([
			page
				.locator('.color-sections section')
				.filter({ has: page.getByRole('heading', { name, exact: true }) })
				.boundingBox(),
			colorsList.boundingBox()
		]);
		return Math.round(section!.y - box!.y);
	};
	expect(
		await colorTabs.evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('aria-label')))
	).toEqual([
		'Character',
		'Wizard hat',
		'Messy brown hair',
		'Leather vest',
		'Red cape',
		'Steel longsword'
	]);
	await expect(colorsRail.locator('[tabindex="0"]')).toHaveCount(1);
	await colorTab('Leather vest').click();
	await expect(colorTab('Leather vest')).toHaveAttribute('aria-current', 'true');
	await expect.poll(() => sectionTop('Leather vest')).toBeLessThanOrEqual(1);
	await colorsList.evaluate((list) => {
		(list as HTMLElement).scrollTop = (list as HTMLElement).scrollHeight;
	});
	await expect(colorTab('Steel longsword')).toHaveAttribute('aria-current', 'true');
	await colorTab('Steel longsword').focus();
	await page.keyboard.press('Home');
	await expect(colorTabs.first()).toBeFocused();
	await expect(colorTabs.first()).toHaveAttribute('aria-current', 'true');
	await expect
		.poll(() => colorsList.evaluate((list) => (list as HTMLElement).scrollTop))
		.toBeLessThanOrEqual(1);
	await page.keyboard.press('End');
	await expect(colorTabs.last()).toBeFocused();
	await expect(colorTabs.last()).toHaveAttribute('aria-current', 'true');
	await page.keyboard.press('ArrowUp');
	await expect(colorTabs.nth(4)).toBeFocused();
	await expect(colorTabs.nth(4)).toHaveAttribute('aria-current', 'true');
	await expect(colorsRail.locator('[tabindex="0"]')).toHaveCount(1);
	step(
		'colors rail lists worn categories in Wardrobe order and jumps, follows and keys through them'
	);
	await page.locator('.colors .swatch[aria-label="azure"]').first().click();
	await expect.poll(stage).not.toBe(before);
	assert.equal(
		await page.locator('.colors .swatch[aria-label="azure"]').first().getAttribute('aria-checked'),
		'true'
	);
	step('recolor changes the stage pixels');

	// The custom picker previews while it is dragged, but only its close adds one undo step.
	const pickWell = page.locator('.colors .swatch.pick').first();
	const picker = pickWell.locator('input[type="color"]');
	const picked = '#3366cc';
	const azureStage = await stage();
	await picker.evaluate((input, value) => {
		const element = input as HTMLInputElement;
		element.value = value;
		element.dispatchEvent(new Event('input', { bubbles: true }));
	}, picked);
	await expect.poll(stage).not.toBe(azureStage);
	assert.equal(
		await page.locator('.colors .swatch[aria-label="azure"]').first().getAttribute('aria-checked'),
		'true',
		'a dragged color is not committed yet'
	);
	await expect
		.poll(() => pickWell.evaluate((well) => getComputedStyle(well).backgroundColor))
		.toBe('rgb(51, 102, 204)');
	await picker.evaluate((input) => input.dispatchEvent(new Event('change', { bubbles: true })));
	assert.equal(
		await page.locator('.colors .swatch[aria-label="azure"]').first().getAttribute('aria-checked'),
		'false'
	);
	await page.getByRole('button', { name: /^Undo/ }).click();
	assert.equal(
		await page.locator('.colors .swatch[aria-label="azure"]').first().getAttribute('aria-checked'),
		'true',
		'one undo step takes back the whole drag'
	);
	await page.getByRole('button', { name: /^Undo/ }).click();
	assert.equal(
		await page.locator('.colors .swatch').first().getAttribute('aria-checked'),
		'true',
		'the drag was the only step after the swatch'
	);
	await page.locator('.colors .swatch[aria-label="azure"]').first().click();
	step('a dragged custom color previews live and commits as one undo step');

	await equipmentMode(page, 'Outfits');
	await page.getByRole('button', { name: 'Save current look', exact: true }).click();
	await page.locator('input[aria-label="Outfit name"]').fill('Smoke look');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.locator('.outfits .row', { hasText: 'Smoke look' }).waitFor();
	await expect(page.locator('.outfits .row', { hasText: 'Smoke look' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('.outfits .badge')).toHaveCount(0);
	step('outfit saved and selected without a redundant badge');

	await inspectStage(page);
	await page.keyboard.press('2');
	assert.equal(
		await page
			.locator('.canvas-bar')
			.getByRole('button', { name: 'Face east' })
			.getAttribute('aria-pressed'),
		'true'
	);
	await page.keyboard.press('0');
	assert.equal(await page.locator('.all-dirs canvas').count(), 4);
	await expectDirectionGrid(page, ['south', 'north', 'west', 'east'], 2);
	await page.keyboard.press('0');
	step('keyboard: direction + all directions');
	await page
		.getByRole('dialog', { name: 'Inspect character', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();

	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	await page.getByRole('button', { name: 'Appearance', exact: true }).click();
	await page.getByRole('radio', { name: 'Light', exact: true }).check();
	await expect(page.locator('[data-setting="theme"] .lucide-sun-moon')).toBeVisible();
	await expect(page.getByRole('radiogroup', { name: 'Theme', exact: true })).toHaveClass(
		/\bbu-segmented\b/
	);
	await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
	await page.getByRole('radio', { name: 'Light', exact: true }).press('ArrowLeft');
	await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
	await page.getByRole('radio', { name: 'Light', exact: true }).check();
	await page
		.getByRole('dialog', { name: 'Settings' })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
	step('theme switch');

	await reloadStudio(page, { waitUntil: 'networkidle' });
	await page.waitForSelector('.world-actors');
	assert.equal(await pressed('Wizard hat'), 'true');
	await equipmentMode(page, 'Outfits');
	assert.ok(await page.locator('.outfits .row', { hasText: 'Smoke look' }).isVisible());
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
	step('outfit, colors, presets and theme survive a reload');

	await page.getByRole('button', { name: 'Export' }).first().click();
	const dl = page.getByRole('button', { name: /Download ZIP · \d+ KB/ });
	await dl.waitFor();
	const [download] = await Promise.all([page.waitForEvent('download'), dl.click()]);
	const bytes = readFileSync((await download.path())!);
	assert.equal(bytes.subarray(0, 2).toString(), 'PK');
	for (const f of ['manifest.json', 'layers/head/hat_wizard/'])
		assert.ok(bytes.includes(Buffer.from(f)), `zip has ${f}`);
	step(`export ${download.suggestedFilename()} ${Math.round(bytes.length / 1024)} KB`);

	// zip names (stored uncompressed in the zip headers)
	assert.ok(bytes.includes(Buffer.from('README.txt')), 'zip has README.txt');
	assert.ok(!bytes.includes(Buffer.from('godot/')), 'the default ZIP has no Godot adapter');
	assert.ok(download.suggestedFilename().startsWith('adventurer-'), download.suggestedFilename());
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(page.locator('.toast').getByText('Export download started.')).toBeVisible();
	finish();
});

test('studio demo: base colors, Create size and direction pricing, stripped dev hooks and the offline banner', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	// ---- B15: base colors, Create options, offline banner ----
	await equipmentMode(page, 'Colors');
	assert.deepEqual(
		(await page.locator('.equipment-scroll .colors .mat > .muted').allTextContents()).slice(0, 3),
		['Shirt', 'Shorts', 'Skin']
	);
	step('base colors: Shirt, Shorts and Skin recolor separately');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const cost = async () => {
		const value = await page.locator('dialog .foot-note').textContent();
		assert.ok(value, 'Create cost is shown');
		return value;
	};
	const eight = await cost();
	assert.equal(
		await page
			.getByRole('button', { name: 'Top-down 8', exact: true })
			.getAttribute('aria-pressed'),
		'true'
	);
	assert.equal(
		await page.getByRole('spinbutton', { name: 'Body size', exact: true }).inputValue(),
		'64'
	);
	await page.getByRole('button', { name: 'Top-down 4', exact: true }).click();
	assert.equal(await cost(), eight); // creation draws every view once and animates none: directions do not change its price
	await page.getByRole('button', { name: '96', exact: true }).click();
	assert.equal(
		await page.getByRole('spinbutton', { name: 'Frame size', exact: true }).inputValue(),
		'128'
	);
	assert.notEqual(await cost(), eight); // the draw is priced by body size
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	step('Create: visible size and direction controls update frame and full generation cost');
	assert.equal(
		await page.evaluate(() => !!window.__queue || !!window.__studio),
		false,
		'the production build strips the queue and Studio hooks'
	);
	await context.setOffline(true);
	await page.locator('.offline-banner', { hasText: 'You’re offline' }).waitFor();
	await pickItem(page, 'Wizard hat'); // everything else still works
	await context.setOffline(false);
	await page.locator('.offline-banner').waitFor({ state: 'detached' });
	step('offline: banner shown, back online: banner gone (queue pause checked on the dev server)');
	finish();
});

test('studio demo: New character fits an HD window and smaller screens scroll to the same fields', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await page.setViewportSize({ width: 1920, height: 1080 });
	await openDemo(page);
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const creator = page.getByRole('dialog', { name: 'New character', exact: true });
	const body = creator.locator('.sheet-body');
	const foot = creator.locator('.sheet-foot');
	const create = creator.getByRole('button', { name: /^Create/ });
	const fitsWithoutScrolling = () => body.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
	// The window's name and the character's name share the bar; the form keeps only character controls.
	await expect(creator.locator('.sheet-head .sheet-title')).toHaveText('New character');
	await expect(creator.locator('.sheet-head .character-name')).toBeVisible();
	await expect.poll(fitsWithoutScrolling).toBe(true);
	await expect(create).toBeInViewport();
	step('1920x1080: the whole form and Create fit without scrolling the sheet');
	// 1440x900: the traits pair up, so the prompt excerpt clears the floating footer.
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(fitsWithoutScrolling).toBe(true);
	const [excerpt, footer] = await Promise.all([
		creator.getByRole('button', { name: 'Edit exact prompt', exact: true }).boundingBox(),
		foot.boundingBox()
	]);
	expect(excerpt!.y + excerpt!.height).toBeLessThanOrEqual(footer!.y);
	await expect(create).toBeInViewport();
	step('1440x900: paired traits keep the lowest field above the footer');
	// Expanding Advanced may scroll the sheet, but every field stays reachable and Create stays put.
	await creator.locator('details.advanced > summary').click();
	const seed = creator.getByRole('textbox', { name: 'Seed', exact: true });
	await seed.scrollIntoViewIfNeeded();
	await expect(seed).toBeInViewport();
	await expect(create).toBeInViewport();
	await creator.locator('details.advanced > summary').click();
	step('Advanced expands over a scrolling sheet, with Create fixed');
	// Phones and short landscape keep their scrolling layouts; the create action never leaves the viewport.
	for (const [width, height] of [
		[390, 844],
		[844, 390]
	] as const) {
		await page.setViewportSize({ width, height });
		await expect.poll(fitsWithoutScrolling).toBe(false);
		await body.evaluate((el) => el.scrollTo(0, 200));
		expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
		await expect(create).toBeInViewport();
		await body.evaluate((el) => el.scrollTo(0, 0));
	}
	step('390x844 and 844x390: the sheet scrolls with the action in place');
	finish();
});

test('studio demo: Create without a key opens Connect, Escape restores focus and Back closes a sheet', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	// ---- B10: sheets ----
	// T1 P0: Create without a key -> the Connect sheet replaces it (8afef4f)
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	await expect(page.locator('dialog').getByLabel('Name', { exact: true })).toBeFocused(); // first field focused, not Cancel (checked before fill() moves focus)
	await page.locator('dialog textarea').fill('a cheerful elf archer');
	await page
		.locator('dialog')
		.getByRole('button', { name: /^Create/ })
		.click();
	await page.waitForFunction(
		() => document.querySelector('dialog[open] h2')?.textContent === 'Connect PixelLab'
	);
	step('Create without a key opens Connect (P0 sheet chaining)');
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	assert.ok(
		await page.evaluate(() => document.activeElement?.classList.contains('project-btn')),
		'focus back on the menu button'
	);
	step('Esc closes, focus returns to the opener (P2-3)');
	await page.getByRole('button', { name: 'Export' }).first().click();
	await page.locator('dialog[open]').waitFor();
	await page.goBack();
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	const base = test.info().project.use.baseURL!;
	assert.ok(page.url().startsWith(base), page.url());
	step('browser back closes the sheet, stays in the app (P2-2)');
	finish();
});

test('studio demo: move views offer only their directions, call out items without frames and take arrow keys', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	await openDemo(page);
	await pickItem(page, 'Wizard hat'); // the hat has no north frames in the walk
	// ---- B10: move views (T1 P1-1) ----
	await inspectStage(page);
	await page.locator('.canvas-bar select').selectOption('cross-punch');
	for (const d of ['east', 'north', 'west'])
		assert.ok(
			await page
				.locator('.canvas-bar')
				.getByRole('button', { name: `Face ${d}` })
				.isDisabled(),
			`cross punch ${d} disabled`
		);
	assert.equal(
		await page
			.locator('.canvas-bar')
			.getByRole('button', { name: 'Face south' })
			.getAttribute('aria-pressed'),
		'true'
	);
	await page.getByRole('button', { name: 'All directions', exact: true }).click();
	await expectDirectionGrid(page, ['south'], 1);
	await page.getByRole('button', { name: 'Show south only', exact: true }).click();
	await page.locator('.canvas-bar select').selectOption('walk');
	await page.locator('.canvas-bar').getByRole('button', { name: 'Face north' }).click();
	await page.locator('.stage-note', { hasText: 'Wizard hat' }).waitFor();
	assert.ok(
		await page.locator('.stage-note').getByRole('button', { name: 'Make your own' }).isVisible()
	);
	await page.locator('.canvas-bar').getByRole('button', { name: 'Face south' }).click();
	assert.equal(await page.locator('.stage-note').count(), 0);
	step('cross punch is south only; a worn item without north frames is called out (P1-1)');

	// ---- T2: arrow keys in segmented controls ----
	await page.locator('.canvas-bar').getByRole('button', { name: 'Face south' }).focus();
	await page.keyboard.press('ArrowRight');
	assert.equal(
		await page
			.locator('.canvas-bar')
			.getByRole('button', { name: 'Face east' })
			.getAttribute('aria-pressed'),
		'true'
	);
	assert.ok(
		await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Face east')
	);
	step('arrow keys move the direction segmented control');
	await page
		.getByRole('dialog', { name: 'Inspect character', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	finish();
});

test('studio demo: production hides developer rigs and their disclosure', async ({
	context,
	page
}) => {
	const finish = await demoGuard(context);
	// Open the Studio first so the app creates its database before the dev rig is added.
	await openDemo(page);
	const idb = (
		put: {
			id: string;
			savedAt: string;
			manifest: { format: string; name: string };
			origin: string;
		} | null
	) =>
		page.evaluate(async (put) => {
			const q = indexedDB.open('pixeldoll');
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				q.onsuccess = () => resolve(q.result);
				q.onerror = () => reject(q.error);
			});
			const t = db.transaction('projects', 'readwrite');
			if (put) t.objectStore('projects').put(put, put.id);
			else t.objectStore('projects').delete('rig-e2edevrig00');
			await new Promise<void>((resolve, reject) => {
				t.oncomplete = () => resolve();
				t.onabort = () => reject(t.error);
			});
			db.close();
		}, put);
	await idb({
		id: 'rig-e2edevrig00',
		savedAt: '',
		manifest: { format: CURRENT_FORMAT, name: 'E2E dev rig' },
		origin: 'dev'
	});
	await page.reload();
	await page.locator('.project-btn').click();
	const projectMenu = page.locator('#project-menu');
	await expect(projectMenu).toBeVisible();
	await expect(projectMenu.getByText('Developer rigs', { exact: true })).toHaveCount(0);
	await expect(projectMenu.getByText('E2E dev rig', { exact: true })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await idb(null);
	step('production hides developer rigs and their disclosure');
	finish();
});

// ---- B10: other sizes ----
for (const [name, viewport] of [
	['phone', { width: 375, height: 812 }],
	['landscape', { width: 812, height: 375 }]
] as const)
	test.describe(`studio demo ${name}`, () => {
		test.use({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		test(`${name}: Outfits, Random look and Redo stay reachable`, async ({ context, page: p }) => {
			const finish = await demoGuard(context);
			await openDemo(p);
			// Redo lives in the bar (shown once there is something to redo), except on phone layouts, where it moves
			// into More.
			if (!(await p.locator('.experience.phone-layout').count()))
				await expect(p.locator('.header-redo')).toBeAttached();
			else {
				await p.getByRole('button', { name: 'More options', exact: true }).click();
				await expect(
					p.locator('#experience-options').getByRole('button', { name: /^Redo/ })
				).toBeVisible();
				await p.keyboard.press('Escape');
			}
			// Phones up to 430 px keep Random look in More.
			if (await p.locator('.header-random').isVisible()) await p.locator('.header-random').click();
			else {
				await p.getByRole('button', { name: 'More options', exact: true }).click();
				await p
					.locator('#experience-options')
					.getByRole('button', { name: 'Random look', exact: true })
					.click();
			}
			// Narrow phones keep Undo in More.
			if (await p.locator('.header-undo').isVisible())
				assert.ok(
					await p.getByRole('button', { name: /^Undo Random look/ }).isEnabled(),
					`${name}: random look`
				);
			else {
				await p.getByRole('button', { name: 'More options', exact: true }).click();
				await expect(
					p.locator('#experience-options').getByRole('button', { name: /^Undo Random look/ })
				).toBeEnabled();
				await p.keyboard.press('Escape');
			}
			await equipmentMode(p, 'Outfits');
			const addLook = p.getByRole('button', { name: 'Save current look' });
			const addLookBounds = await addLook.boundingBox();
			await addLook.click();
			const [list, input, save, cancel] = await Promise.all(
				[
					p.locator('.outfits .rows'),
					p.getByRole('textbox', { name: 'Outfit name' }),
					p.getByRole('button', { name: 'Save', exact: true }),
					p.locator('.outfits').getByRole('button', { name: 'Cancel', exact: true })
				].map((control) => control.boundingBox())
			);
			expect(input!.x).toBeCloseTo(list!.x);
			expect(input!.y).toBeCloseTo(addLookBounds!.y);
			expect(input!.height).toBeCloseTo(addLookBounds!.height);
			expect(cancel!.x + cancel!.width).toBeCloseTo(list!.x + list!.width);
			expect(input!.x + input!.width + 8).toBeCloseTo(save!.x);
			expect(save!.x + save!.width + 8).toBeCloseTo(cancel!.x);
			const focusClearance = await p
				.getByRole('textbox', { name: 'Outfit name' })
				.evaluate((field) => {
					const ring = getComputedStyle(field);
					return {
						available:
							field.getBoundingClientRect().left -
							field.closest('.panel-list')!.getBoundingClientRect().left,
						required: parseFloat(ring.outlineWidth) + parseFloat(ring.outlineOffset)
					};
				});
			expect(focusClearance.available).toBeGreaterThanOrEqual(focusClearance.required);
			await p.locator('input[aria-label="Outfit name"]').fill('Phone look');
			await p.getByRole('button', { name: 'Save', exact: true }).click();
			await p.locator('.row', { hasText: 'Phone look' }).waitFor();
			step(`${name}: Outfits, Random look and Redo reachable (P1-2)`);
			finish();
		});
	});

test.describe('studio demo tablet', () => {
	test.use({
		viewport: { width: 768, height: 1024 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true
	});
	test('tablet portrait: preview and wardrobe stay separate and nothing covers the character', async ({
		context,
		page: p
	}) => {
		const finish = await demoGuard(context);
		await openDemo(p);
		assert.ok(await p.locator('.slot-tiles').first().isVisible(), 'tablet: wardrobe tiles visible');
		const box = await p.locator('.world-stage').boundingBox(),
			rail = await p.locator('.equipment-rail').boundingBox();
		assert.ok(
			box && rail && (box.x + box.width <= rail.x + 1 || box.y + box.height <= rail.y + 1),
			`tablet: preview and wardrobe do not overlap ${JSON.stringify({ box, rail })}`
		);
		await equipmentGroup(p, 'Head');
		await p.locator('.item-tile', { hasText: 'Steel helmet' }).click();
		assert.equal(await p.locator('.drawer, .drawer-scrim').count(), 0);
		step(
			'tablet portrait: preview and wardrobe remain separate, nothing covers the character (P1-3)'
		);
		finish();
	});
});

// ---- B17: non-agent servers never auto-connect: no badge, Connect sheet, no dev-key option ----
// bootstrap.ts fetches the agent key only in Vite mode "agent" (npm run dev:agent), which this offline suite never
// uses, so the agentKey off switch is not exercised here; it is set anyway so nothing could ever spend.
test('studio demo: a non-agent server shows no agent badge and Connect has no dev-key option', async ({
	context,
	page: p
}) => {
	const finish = await demoGuard(context);
	await openDemo(p);
	await expect(p.locator('.agent-badge')).toHaveCount(0);
	await openAccount(p);
	await p.waitForFunction(
		() => document.querySelector('dialog[open] h2')?.textContent === 'Connect PixelLab'
	);
	assert.equal(
		await p
			.locator('dialog[open] [data-testid=dev-key], dialog[open] button', {
				hasText: /dev key/i
			})
			.count(),
		0
	);
	step('non-agent server: no agent badge, Connect sheet has no dev-key option');
	finish();
});

// IndexedDB writes started while a page unloads may never finish, so an edit inside the 400 ms autosave delay must survive.
test('an outfit edit survives an immediate reload inside the autosave delay', async ({ page }) => {
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	const hat = page.locator('.equipment-scroll').getByRole('button', { name: /^Wizard hat(,|$)/ });
	const worn = (await hat.getAttribute('aria-pressed')) === 'true' ? 'false' : 'true';
	await page.locator('.equipment-scroll .item-tile', { hasText: 'Wizard hat' }).click();
	await expect(hat).toHaveAttribute('aria-pressed', worn);
	// A page-initiated reload 20 ms later lost the edit every time before the localStorage snapshot (page.reload() did not).
	const loaded = page.waitForEvent('load');
	// A snapshot of a character deleted in another tab is swept when the character list loads.
	await page.evaluate(() => {
		localStorage.setItem('pixeldoll.unsaved.rig-deleted-elsewhere', '{}');
		setTimeout(() => location.reload(), 20);
	});
	await loaded;
	await enterStudio(page);
	await expect(hat).toHaveAttribute('aria-pressed', worn);
	expect(
		await page.evaluate(() =>
			Object.keys(localStorage).filter((k) => k.startsWith('pixeldoll.unsaved.'))
		)
	).toEqual([]); // saved, then cleared
});

// The unload snapshot replaces the saved dress state (never merges it), so a reset or removal survives too.
test('a color reset survives an immediate reload inside the autosave delay', async ({ page }) => {
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	const azure = () =>
		page
			.locator('.colors .swatches')
			.filter({ has: page.locator('[aria-label="azure"]') })
			.first()
			.locator('[aria-label="azure"]');
	await equipmentMode(page, 'Colors');
	await azure().click();
	await expect(azure()).toHaveAttribute('aria-checked', 'true');
	await reloadStudio(page); // azure is now the saved state (openProject awaits the save)
	await equipmentMode(page, 'Colors');
	await expect(azure()).toHaveAttribute('aria-checked', 'true');
	await page
		.locator('.colors .swatches')
		.filter({ has: page.locator('[aria-label="azure"]') })
		.first()
		.locator('.swatch')
		.first()
		.click();
	await expect(azure()).toHaveAttribute('aria-checked', 'false');
	const loaded = page.waitForEvent('load');
	await page.evaluate(() => {
		setTimeout(() => location.reload(), 20);
	});
	await loaded;
	await enterStudio(page);
	await equipmentMode(page, 'Colors');
	await expect(azure()).toHaveAttribute('aria-checked', 'false');
});

test('Inspector animation stays stable and eight-direction previews fit the panel', async ({
	page
}) => {
	await page.route('https://api.pixellab.ai/**', (route) => route.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	await page.getByRole('textbox', { name: 'What is it?', exact: true }).waitFor();
	await page
		.getByRole('dialog', { name: 'New item', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	// The copy is another character, so it opens on its standing move: pick the animated one this test watches.
	await selectPlaybackClip(page, 'walk');
	await pickItem(page, 'Red cape');
	let inspector = await selectedItemDetails(page);
	async function checkFrames() {
		const geometry: string[] = [],
			pixels: string[] = [];
		for (let frame = 0; frame < 8; frame++) {
			await page.waitForTimeout(110); // Authored playback continues while the item sheet is open.
			// One browser call per sample (it was ~12 round trips): the same boxes, read in the same instant.
			const sample = await inspector.evaluate((sheet) => {
				const box = (el: Element) => {
					const r = el.getBoundingClientRect();
					return { x: r.x, y: r.y, width: r.width, height: r.height };
				};
				const strip = sheet.querySelector('.dir-strip')!,
					sprites = [...strip.querySelectorAll('canvas')];
				return {
					strip: box(strip),
					actions: box(sheet.querySelector('.actions')!),
					sprites: sprites.map(box),
					pixels: sprites[0].toDataURL()
				};
			});
			geometry.push(JSON.stringify(sample.strip), JSON.stringify(sample.actions));
			pixels.push(sample.pixels);
			// getBoundingClientRect gives a hidden element a zero box (boundingBox() gave null), so require real size.
			for (const b of [sample.strip, ...sample.sprites])
				expect(b.width * b.height).toBeGreaterThan(0);
			for (const b of sample.sprites) {
				expect(b.x).toBeGreaterThanOrEqual(sample.strip.x);
				expect(b.x + b.width).toBeLessThanOrEqual(sample.strip.x + sample.strip.width);
			}
		}
		expect(new Set(geometry.filter((_, i) => i % 2 === 0)).size).toBe(1);
		expect(new Set(geometry.filter((_, i) => i % 2 === 1)).size).toBe(1);
		expect(new Set(pixels).size).toBeGreaterThan(1);
	}
	await checkFrames();
	// Delete asks in an alert over the details; Cancel keeps the item and the details open.
	await openItemSection(inspector, 'Item actions');
	await inspector.getByRole('button', { name: 'Move to Trash...', exact: true }).click();
	const deleteAlert = page.getByRole('alertdialog', { name: /^Move .+ to Trash\?$/ });
	await expect(deleteAlert.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(deleteAlert).toHaveCount(0);
	await expect(inspector).toBeVisible();
	await inspector.getByRole('button', { name: 'Close', exact: true }).click();
	await pickItem(page, 'Steel helmet');
	inspector = await selectedItemDetails(page);
	await expect(page.getByRole('alertdialog')).toHaveCount(0);

	await inspector.getByRole('button', { name: 'Close', exact: true }).click();

	// Disposable layout fixture: duplicate stored east artwork into the extra directions, without generation.
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download ZIP/ }).click();
	const files = await unzip(new Uint8Array(readFileSync((await (await download).path())!)));
	const data = JSON.parse(new TextDecoder().decode(files.get('project.json')));
	data.manifest.rig.directions = [
		'south',
		'south-east',
		'east',
		'north-east',
		'north',
		'north-west',
		'west',
		'south-west'
	].map((id) => ({ id }));
	const added = ['south-east', 'north-east', 'north-west', 'south-west', 'west'];
	for (const it of data.manifest.items) {
		for (const layer of it.layers)
			for (const dirs of Object.values(layer.cells ?? {}) as Record<string, unknown>[]) {
				for (const dir of added) dirs[dir] = dirs.east ?? dirs.south;
			}
		// Coverage follows the copied artwork.
		const covered = new Set<string>(it.coverage);
		for (const key of it.coverage ?? []) {
			const [anim, dir, cell] = key.split('/');
			const from = it.layers[0].cells[anim]?.east ? 'east' : 'south';
			if (dir === from) for (const to of added) covered.add(`${anim}/${to}/${cell}`);
		}
		if (it.coverage) it.coverage = [...covered];
	}
	files.set('project.json', new TextEncoder().encode(JSON.stringify(data)));
	const bytes = await zip([...files].map(([name, data]) => ({ name, data })));
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'eight-directions.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await page.getByRole('img', { name: 'Character import preview' }).waitFor();
	const setup = page.getByRole('switch', { name: /Set up the pose rig next/ });
	if (await setup.count()) await setup.uncheck();
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(playbackPicker(page)).toHaveAttribute('value', 'default'); // a new character, standing again
	await selectPlaybackClip(page, 'walk');
	await pickItem(page, 'Red cape');
	inspector = await selectedItemDetails(page);
	await expect(inspector.locator('.dir-strip canvas')).toHaveCount(8);
	await checkFrames();
	await inspector.getByRole('button', { name: 'Close', exact: true }).click();
	await inspectStage(page);
	await page.getByRole('button', { name: 'All directions', exact: true }).click();
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 900, height: 768 },
		{ width: 375, height: 812 },
		{ width: 812, height: 375 }
	]) {
		await page.setViewportSize(viewport);
		await expectDirectionGrid(
			page,
			[
				'north-west',
				'north',
				'north-east',
				'west',
				null,
				'east',
				'south-west',
				'south',
				'south-east'
			],
			3
		);
	}
	await page.getByRole('button', { name: 'Show east only', exact: true }).click();
	await expect(page.locator('.all-dirs')).toHaveCount(0);
	await expect(page.locator('.stage-art [role="img"]')).toHaveAttribute(
		'aria-label',
		/facing east/
	);
	// At the smallest desktop breakpoint both sidebars leave only 476px for the stage.
	// The toolbar itself fitted before this fix, but its Move label collapsed and overlapped the directions.
	await page.setViewportSize({ width: 900, height: 768 });
	const controls = page.locator('.canvas-bar');
	await expect(controls.getByRole('combobox', { name: 'Direction', exact: true })).toBeVisible();
	const moveBox = (await controls
		.getByRole('combobox', { name: 'Move', exact: true })
		.boundingBox())!;
	const dirBox = (await controls
		.getByRole('combobox', { name: 'Direction', exact: true })
		.boundingBox())!;
	expect(moveBox.width).toBeGreaterThan(50);
	expect(moveBox.x + moveBox.width).toBeLessThanOrEqual(dirBox.x);
	await page.setViewportSize({ width: 1440, height: 560 }); // Constrain the modal so its details actually need scrolling.
	inspector = await selectedItemDetails(page);
	const header = inspector.locator('.sheet-head'),
		top = (await header.boundingBox())!.y;
	const content = inspector.locator('.sheet-body');
	await content.hover();
	await page.mouse.wheel(0, 2000);
	await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	expect((await header.boundingBox())!.y).toBe(top);
	await inspector.getByRole('button', { name: 'Close', exact: true }).click();
	await pickItem(page, 'Wizard hat');
	await inspectStage(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'All directions', exact: true }).click();
	const warning = page.locator('.stage-note');
	await expect(warning).toBeVisible();
	const warningBox = (await warning.boundingBox())!;
	const firstView = (await page
		.getByRole('button', { name: 'Show north-west only', exact: true })
		.boundingBox())!;
	expect(firstView.y).toBeGreaterThanOrEqual(warningBox.y + warningBox.height);
	const art = page.locator('.stage-art');
	await art.hover();
	await page.mouse.wheel(0, 1000);
	const toolbar = (await page.locator('.canvas-bar').boundingBox())!;
	await expect
		.poll(async () => {
			const lastView = (await page
				.getByRole('button', { name: 'Show south-east only', exact: true })
				.boundingBox())!;
			return lastView.y + lastView.height;
		})
		.toBeLessThanOrEqual(toolbar.y);
});

test('desktop resize keeps preview controls and customization reachable across panels', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	for (const viewport of [
		{ width: 700, height: 650 },
		{ width: 600, height: 600 },
		{ width: 1440, height: 900 }
	]) {
		await page.setViewportSize(viewport);
		for (const mode of ['Wardrobe', 'Colors', 'Outfits', 'Moves'] as const) {
			await equipmentMode(page, mode);
			await expect(page.locator('.equipment-rail')).toBeVisible();
			const controls = (await page
				.getByRole('toolbar', { name: 'Preview controls' })
				.boundingBox())!;
			expect(controls.x).toBeGreaterThanOrEqual(0);
			expect(controls.x + controls.width).toBeLessThanOrEqual(viewport.width);
			expect(controls.y + controls.height).toBeLessThanOrEqual(viewport.height);
		}
		await equipmentMode(page, 'Wardrobe');
		await pickItem(page, 'Steel helmet');
		const item = await selectedItemDetails(page);
		await expect(item.locator('.insp-title')).toHaveText('Steel helmet');
		await item.getByRole('button', { name: 'Close', exact: true }).click();
	}
});

test('New item Enhance describes the item alone at its canvas size, then Undo restores it', async ({
	page,
	context
}) => {
	const enhanced: Record<string, unknown>[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith('/balance'))
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		if (path.endsWith('/enhance-pixen-prompt')) {
			enhanced.push(route.request().postDataJSON());
			return route.fulfill({
				json: { enhanced_prompt: 'A battered iron helmet with a riveted brim' }
			});
		}
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'test-only-not-a-real-key');
	});
	await openStudio(page, '/#/');
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	const navigation = settings.getByRole('navigation', { name: 'Settings', exact: true });
	await navigation.getByRole('button', { name: 'Item', exact: true }).click();
	const suggestions = settings.getByRole('region', { name: 'Prompt suggestions', exact: true });
	const titles = suggestions.getByRole('textbox', { name: /^Title: \d+$/ });
	const prompts = suggestions.getByRole('textbox', { name: /^Prompt \(English\): \d+$/ });
	// Each row's fields name that row, so rows are told apart by their names alone.
	await expect(titles.first()).toHaveAccessibleName('Title: 1');
	await expect(titles.last()).toHaveAccessibleName(`Title: ${await titles.count()}`);
	const crownTitle = titles.last();
	const crownPrompt = prompts.last();
	await crownTitle.fill('studioSlots.labels.head');
	await crownPrompt.fill('a bright gold crown with blue gems');
	await crownPrompt.press('Tab');
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	const item = page.getByRole('dialog', { name: 'New item', exact: true });
	const prompt = item.getByRole('textbox', { name: 'What is it?', exact: true });
	// All suggestions are visible, and titles typed by the user are literal.
	const ideas = item.getByRole('group', { name: 'Ideas', exact: true });
	await expect(ideas.getByRole('button')).toHaveText([
		'iron knight helmet',
		'hood',
		'wizard hat',
		'studioSlots.labels.head'
	]);
	await ideas.getByRole('button', { name: 'studioSlots.labels.head', exact: true }).click();
	await expect(prompt).toHaveValue('a bright gold crown with blue gems');
	// While the prompt holds an idea, the others stay to swap; typing your own hides them.
	await ideas.getByRole('button', { name: 'hood', exact: true }).click();
	await expect(prompt).toHaveValue('hood');
	await prompt.fill('iron helmet');
	await expect(ideas).toHaveCount(0);
	await item.getByRole('button', { name: 'Enhance', exact: true }).click();
	await expect(prompt).toHaveValue('A battered iron helmet with a riveted brim');
	expect(enhanced).toHaveLength(1);
	const body = enhanced[0] as { image_size: { width: number; height: number } };
	expect(body).toMatchObject({ description: 'iron helmet', no_background: true });
	expect(body.image_size.width % 4).toBe(0);
	expect(body.image_size.height % 4).toBe(0);
	await item.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(prompt).toHaveValue('iron helmet');
	await expect(prompt).toBeFocused();
	const slot = item.getByRole('button', { name: /^Where does it go\?: / });
	await expect(slot).toHaveAccessibleName('Where does it go?: Head');
	await slot.press('Enter');
	const slots = page.getByRole('menu', { name: 'Where does it go?' });
	await expect(slots.getByRole('menuitemradio', { name: 'Head', exact: true })).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(slot).not.toHaveAccessibleName('Where does it go?: Head');
});

test('Enhance keeps the template a new move opened with, and its settings', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith('/balance'))
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		if (path.endsWith('/enhance-animation-v3-prompt'))
			return route.fulfill({
				json: { enhanced_prompt: 'Sway gently, weight shifting side to side' }
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'test-only-not-a-real-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'New move', exact: true });
	const applied = move
		.getByRole('group', { name: 'Move templates', exact: true })
		.getByRole('button', { pressed: true });
	await expect(applied).toHaveCount(1);
	const template = (await applied.textContent())!.trim();
	const loop = move.getByRole('switch', { name: 'Loop', exact: true });
	const looping = await loop.isChecked();
	await loop.click();
	await move.getByRole('button', { name: 'Enhance', exact: true }).click();
	await expect(move.getByRole('textbox', { name: 'Describe the motion', exact: true })).toHaveValue(
		'Sway gently, weight shifting side to side'
	);
	// Enhancing is not typing: the opened template and the Loop change both stay.
	await expect(applied).toHaveText(template);
	await expect(loop).toBeChecked({ checked: !looping });
	await expect(
		move.getByRole('button', { name: new RegExp(`^Generate ${template}`) })
	).toBeVisible();
});

test('New move opens on the customized template prompt, and an added suggestion is a custom move', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		const ids = ['idle', 'walk', 'run', 'slash', 'hurt', 'death', 'cast'];
		localStorage.setItem(
			'pixeldoll.promptSuggestions.v1',
			JSON.stringify({
				move: {
					edits: Object.fromEntries(ids.map((id) => [id, { prompt: `${id}, edited` }])),
					added: [{ id: 'u_hop', title: 'Hop', prompt: 'hop in place' }]
				}
			})
		);
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'New move', exact: true });
	const templates = move.getByRole('group', { name: 'Move templates', exact: true });
	const description = move.getByRole('textbox', { name: 'Describe the motion', exact: true });
	await expect(templates.getByRole('button', { pressed: true })).toHaveCount(1);
	await expect(description).toHaveValue(/^[a-z]+, edited$/);
	// Its text names the template's own move, which must not count as a duplicate of it.
	await expect(move.getByRole('button', { name: /^Generate / })).toBeEnabled();
	await templates.getByRole('button', { name: 'Hop', exact: true }).click();
	// No template applies; the added suggestion shows as pressed only because the text is its prompt.
	await expect(templates.getByRole('button', { pressed: true })).toHaveText(['Hop']);
	await expect(description).toHaveValue('hop in place');
	await expect(move.getByRole('button', { name: /^Generate move/ })).toBeVisible();
});

test('picking the opening gait template after turning Loop off keeps the template', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		// Run first, so the sheet opens on it without it being picked.
		localStorage.setItem(
			'pixeldoll.promptSuggestions.v1',
			JSON.stringify({ move: { order: ['run', 'idle', 'walk', 'slash', 'hurt', 'death', 'cast'] } })
		);
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'New move', exact: true });
	const run = move
		.getByRole('group', { name: 'Move templates', exact: true })
		.getByRole('button', { name: 'Run', exact: true });
	const description = move.getByRole('textbox', { name: 'Describe the motion', exact: true });
	await expect(run).toHaveAttribute('aria-pressed', 'true');
	await move.getByRole('switch', { name: 'Loop', exact: true }).uncheck();
	await run.click();
	// The text follows Loop off, so the move stays the Run template rather than a described move.
	await expect(run).toHaveAttribute('aria-pressed', 'true');
	await expect(description).toHaveValue('running');
	await expect(move.getByRole('switch', { name: 'Loop', exact: true })).not.toBeChecked();
	await expect(move.getByRole('button', { name: /^Generate Run/ })).toBeVisible();
});

test('Advanced picks a qualified template for a registered character and shows its route', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path.endsWith('/balance'))
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		if (request.method() === 'GET' && path.includes('/characters/'))
			return route.fulfill({ json: { id: 'template-fixture' } });
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'test-only-not-a-real-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'New move', exact: true });
	await move.getByRole('button', { name: /^Advanced/ }).click();
	const picker = move.getByRole('combobox', { name: 'More templates', exact: true });
	await expect(picker).toBeEnabled();
	await picker.selectOption('getting-up');
	const description = move.getByRole('textbox', { name: 'Describe the motion', exact: true });
	await expect(description).toHaveValue('getting up from the ground');
	await expect(move.getByRole('slider', { name: 'Frames', exact: true })).toHaveAttribute(
		'aria-valuetext',
		'5 frames'
	);
	await expect(move.getByRole('switch', { name: 'Loop', exact: true })).not.toBeChecked();
	// The chosen template keeps a pill of its own, filled while it is the motion that will run.
	const pill = move
		.getByRole('group', { name: 'Move templates', exact: true })
		.getByRole('button', { name: 'Getting up', exact: true });
	await expect(pill).toHaveAttribute('aria-pressed', 'true');
	await expect(pill).not.toHaveAttribute('data-described');
	await move.locator('summary', { hasText: 'Details' }).click();
	await expect(move.getByText(/getting-up skeleton-v3 template/)).toBeVisible();
	// Editing the prompt makes it a described move without releasing the pill.
	await description.fill('getting up slowly');
	await expect(pill).toHaveAttribute('data-described', '');
	await expect(move.getByText(/pixminimax motion/)).toBeVisible();
	// The field does not claim the template while the prompt is described, so choosing it again restores it.
	await picker.selectOption('getting-up');
	await expect(description).toHaveValue('getting up from the ground');
	await expect(pill).not.toHaveAttribute('data-described');
	await expect(move.getByText(/getting-up skeleton-v3 template/)).toBeVisible();
	// The picker belongs to Skeleton V3 alone.
	await move
		.getByRole('combobox', { name: 'Motion model', exact: true })
		.selectOption('pixminimax');
	await expect(move.getByRole('combobox', { name: 'More templates', exact: true })).toHaveCount(0);
});

test('a picked template reaches PixelLab as a template request', async ({
	page,
	context
}, info) => {
	const motionBodies: Record<string, unknown>[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path.endsWith('/balance'))
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		if (request.method() === 'GET' && path.includes('/characters/'))
			return route.fulfill({ json: { id: 'template-fixture' } });
		if (request.method() === 'POST' && path.endsWith('/characters/animations'))
			motionBodies.push(request.postDataJSON() as Record<string, unknown>);
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'test-only-not-a-real-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'New move', exact: true });
	await move.getByRole('button', { name: /^Advanced/ }).click();
	await move
		.getByRole('combobox', { name: 'More templates', exact: true })
		.selectOption('getting-up');
	await move.getByRole('button', { name: /^Generate Getting up/ }).click();
	await expect.poll(() => motionBodies.length, { timeout: 15_000 }).toBeGreaterThan(0);
	// The motion request names the template, not the prompt, and asks for no described action or frame count.
	for (const body of motionBodies)
		expect(body).toMatchObject({
			mode: 'skeleton-v3',
			template_animation_id: 'getting-up',
			animation_name: 'getting-up'
		});
	expect(motionBodies.some((body) => (body.directions as string[]).includes('south'))).toBe(true);
	expect(motionBodies[0]).not.toHaveProperty('action_description');
	expect(motionBodies[0]).not.toHaveProperty('frame_count');
});

test('New item submits with Ctrl+Enter or Cmd+Enter without replacing plain Return', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixeldoll.creation.items', JSON.stringify({ method: 'skel' }));
	});
	await openStudio(page, '/#/');
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	const item = page.getByRole('dialog', { name: 'New item', exact: true });
	await expect(item.getByRole('status').filter({ hasText: 'Using Frame editing' })).toBeVisible();
	const prompt = item.getByRole('textbox', { name: 'What is it?', exact: true });
	const make = item.getByRole('button', { name: /^Make/ });
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await prompt.fill('   ');
	await prompt.press('Control+Enter');
	await expect(make).toBeDisabled();
	await expect(connect).toHaveCount(0);
	await page.setViewportSize({ width: 390, height: 844 });
	const choose = page.waitForEvent('filechooser');
	const drop = item.getByRole('button', { name: 'Add image', exact: true });
	await drop.click();
	const dropHeight = (await drop.boundingBox())!.height;
	expect(dropHeight).toBeGreaterThanOrEqual(44);
	expect(dropHeight).toBeLessThan(64);
	const artwork = makeImg(16, 16);
	const filename = `${'festival-hat-revision-'.repeat(6)}reference.png`;
	for (let column = 1; column < 13; column++)
		artwork.data.set([20, 150, 24, 255], (16 + column) * 4);
	await (
		await choose
	).setFiles({
		name: filename,
		mimeType: 'image/png',
		buffer: Buffer.from(await encodePngBytes(artwork))
	});
	const attachment = item.getByRole('button', {
		name: 'Choose a different reference image',
		exact: true
	});
	const thumbnail = attachment.locator('.reference-thumbnail');
	await expect(thumbnail).toHaveAttribute('viewBox', '1 1 12 1');
	expect(
		await thumbnail.evaluate(
			(svg: SVGSVGElement) => svg.viewBox.baseVal.width * svg.getScreenCTM()!.a
		)
	).toBeGreaterThan(dropHeight);
	await expect(attachment.locator('image')).toHaveAttribute('width', '16');
	await expect(attachment).toHaveAccessibleDescription(new RegExp(filename.replace('.', '\\.')));
	await expect(item.getByRole('status').filter({ hasText: 'Reference attached.' })).toBeAttached();
	const attachmentHeight = (await attachment.boundingBox())!.height;
	expect(attachmentHeight).toBe(80);
	const dimensions = attachment.getByText('16 × 16 px', { exact: true });
	const name = attachment.getByText(filename, { exact: true });
	const label = item.getByText('Reference (optional)', { exact: true });
	const foreground = await name.evaluate((file) => getComputedStyle(file).color);
	await expect(label).toHaveCSS('color', foreground);
	await expect(label.getByText('(optional)', { exact: true })).not.toHaveCSS('color', foreground);
	for (const width of [320, 1440]) {
		await page.setViewportSize({ width, height: 844 });
		const dimensionsBox = (await dimensions.boundingBox())!;
		const attachmentBox = (await attachment.boundingBox())!;
		expect(dimensionsBox.x + dimensionsBox.width).toBeLessThan(
			attachmentBox.x + attachmentBox.width
		);
		const nameBox = (await name.boundingBox())!;
		expect(dimensionsBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
		expect(dimensionsBox.x).toBeCloseTo(nameBox.x);
		expect(await dimensions.evaluate((size) => size.scrollWidth === size.clientWidth)).toBe(true);
		expect(await name.evaluate((file) => file.scrollWidth > file.clientWidth)).toBe(true);
	}
	const square = makeImg(54, 53);
	square.data.fill(255);
	await item.locator('.reference input[type=file]').setInputFiles({
		name: 'square.png',
		mimeType: 'image/png',
		buffer: Buffer.from(await encodePngBytes(square))
	});
	await expect(attachment).toContainText('54 × 53 px');
	await expect(attachment).toHaveCSS('height', `${attachmentHeight}px`);
	await expect(item.getByRole('button', { name: 'Remove reference' })).toHaveCSS(
		'height',
		`${attachmentHeight}px`
	);
	expect((await thumbnail.boundingBox())!.height).toBeLessThan(attachmentHeight);
	await item.locator('.reference input[type=file]').setInputFiles({
		name: filename,
		mimeType: 'image/png',
		buffer: Buffer.from(await encodePngBytes(artwork))
	});
	await expect(attachment).toContainText(filename);
	await page.setViewportSize({ width: 390, height: 844 });
	await prompt.fill('a leather hat');
	await prompt.press('Enter');
	await expect(prompt).toHaveValue('a leather hat\n');
	await expect(item).toBeVisible();
	await expect(make).toBeEnabled();
	await prompt.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
	await prompt.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, repeat: true });
	await expect(connect).toHaveCount(0);
	for (const shortcut of ['Control+Enter', 'Meta+Enter']) {
		await prompt.press(shortcut);
		await expect(connect).toBeVisible();
		await connect.getByRole('button', { name: 'Close', exact: true }).click();
		await newItem(page, 'Head');
		await expect(prompt).toHaveValue('a leather hat\n');
		await expect(attachment).toContainText(filename);
		await expect(make).toContainText(/~\d+ gens/);
	}
	await page.setViewportSize({ width: 844, height: 390 });
	await item.getByRole('button', { name: 'Remove reference', exact: true }).click();
	await expect(drop).toBeFocused();
	expect((await drop.boundingBox())!.height).toBeCloseTo(dropHeight);
	await item.getByRole('button', { name: /^Where does it go\?: / }).click();
	await page
		.getByRole('menu', { name: 'Where does it go?' })
		.getByRole('menuitemradio', { name: 'Main hand', exact: true })
		.click();
	await expect(drop).toHaveAccessibleDescription(/Max 64 × 64 px/);
	const sword = makeImg(192, 64);
	sword.data.fill(255);
	await item.locator('.reference input[type=file]').setInputFiles({
		name: 'sword.png',
		mimeType: 'image/png',
		buffer: Buffer.from(await encodePngBytes(sword))
	});
	await expect(attachment).toContainText('64 × 21 px');
	await expect(attachment).toHaveCSS('height', `${attachmentHeight}px`);
});

test('canceling Connect preserves generation drafts and discards the pending action', async ({
	page
}) => {
	const paidRequests: string[] = [];
	await page.route('https://api.pixellab.ai/**', async (route) => {
		if (
			route.request().method() === 'GET' &&
			new URL(route.request().url()).pathname === '/v2/balance'
		) {
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 0 }
				}
			});
		} else {
			paidRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	const item = page.getByRole('dialog', { name: 'New item', exact: true });
	await item.getByRole('button', { name: /^Where does it go\?: / }).click();
	await page
		.getByRole('menu', { name: 'Where does it go?' })
		.getByRole('menuitemradio', { name: 'Main hand', exact: true })
		.click();
	await item.getByRole('textbox', { name: 'What is it?', exact: true }).fill('a silver sword');
	await item.getByRole('radio', { name: 'azure', exact: true }).click();
	await expect(item.getByRole('button', { name: /^Make/ })).toContainText(/~\d+ gens/);
	await expect(
		item.getByText(
			'Consistency checks run automatically. If issues are detected, you choose whether to keep the item or request a paid retry. No quality retries or repairs run without your request. PixelLab may bill dollars and queue time varies.',
			{ exact: true }
		)
	).toBeVisible();
	await item.getByRole('button', { name: /^Make/ }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await newItem(page, 'Head');
	await expect(item.getByRole('textbox', { name: 'What is it?', exact: true })).toHaveValue(
		'a silver sword'
	);
	await expect(
		item.getByRole('button', { name: 'Where does it go?: Main hand', exact: true })
	).toBeVisible();
	await expect(item.getByRole('radio', { name: 'azure', exact: true })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await item.getByRole('button', { name: 'Close', exact: true }).click();

	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const character = page.getByRole('dialog', { name: 'New character', exact: true });
	await character
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('a cheerful elf archer');
	await character.getByRole('combobox', { name: 'Build', exact: true }).selectOption('Broad');
	await character.getByRole('button', { name: 'Top-down 8', exact: true }).click();
	await character.getByRole('button', { name: '96', exact: true }).click();
	await character.getByRole('textbox', { name: 'Name', exact: true }).fill('Archer draft');
	await character.getByRole('button', { name: /^Create/ }).click();
	await expect(page.getByRole('dialog', { name: 'Connect PixelLab' })).toBeVisible();
	// Back from Connect returns to New character, which keeps every choice.
	await page.goBack();
	await expect(page.getByRole('dialog', { name: 'Connect PixelLab' })).toHaveCount(0);
	await expect(character.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'a cheerful elf archer'
	);
	await expect(character.getByRole('combobox', { name: 'Build', exact: true })).toHaveValue(
		'Broad'
	);
	await expect(character.getByRole('button', { name: 'Top-down 8', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(character.getByRole('button', { name: '96', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(character.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
		'Archer draft'
	);
	// Leaving the typed draft asks first; Discard drops it with its pending creation.
	await character.getByRole('button', { name: 'Back', exact: true }).click();
	await page
		.getByRole('alertdialog', { name: 'Discard changes?', exact: true })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();

	// Connecting later must not start the character generation canceled above.
	await openAccount(page);
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-manual-qa-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await page.locator('.project-btn').click();
	await expect(page.getByRole('menuitem', { name: 'PixelLab account', exact: true })).toContainText(
		'42 gens'
	);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(paidRequests).toEqual([]);
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Character selection', exact: true }).click();
	await page
		.locator('.character-rows .character-row')
		.filter({ has: page.getByText('Adventurer (Demo)', { exact: true }) })
		.click();
	await page.locator('.customize-action').click();
	await expect(page.locator('.project-btn .name-text')).toHaveText('Adventurer (Demo)');
	// The page heading names the character outside the menu button (a heading cannot sit inside a button).
	await expect(page.getByRole('heading', { level: 1, name: 'Adventurer' })).toHaveCount(1);
	await expect(page.locator('.project-btn h1')).toHaveCount(0);
});

test('closing Connect before its code loads still discards the pending action', async ({
	page
}) => {
	const paidRequests: string[] = [];
	await page.route('https://api.pixellab.ai/**', async (route) => {
		if (
			route.request().method() === 'GET' &&
			new URL(route.request().url()).pathname === '/v2/balance'
		) {
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 0 }
				}
			});
		} else {
			paidRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
			await route.abort();
		}
	});
	// Hold the Connect sheet's chunk so the sheet closes before ConnectSheet ever mounts.
	let release!: () => void,
		connectFetches = 0;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(/\/ConnectSheet-[\w-]+\.js$/, async (route) => {
		connectFetches++;
		await held;
		await route.continue();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const character = page.getByRole('dialog', { name: 'New character', exact: true });
	await character
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('a cheerful elf archer');
	await character.getByRole('textbox', { name: 'Name', exact: true }).fill('Archer draft');
	await character.getByRole('button', { name: /^Create/ }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect.poll(() => connectFetches).toBeGreaterThan(0);
	await page.goBack();
	release();

	// Connecting later must not start the character generation abandoned above.
	await openAccount(page);
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-manual-qa-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0); // a revived action would open its progress sheet here
	await page.locator('.project-btn').click();
	await expect(page.getByRole('menuitem', { name: 'PixelLab account', exact: true })).toContainText(
		'42 gens'
	);
	await page.keyboard.press('Escape');
	expect(paidRequests).toEqual([]);
});

// CI shards are contiguous slices of the test order. This heavy test (about 28 s) is registered among light tests, away
// from its two stale-review variants at the end and from the studio demo and Inspector tests above; heavy neighbors share
// one slow shard (docs/testing/test-performance.md).
test('free item color matching is offline, scoped, persistent and preserves saved recolors and warnings', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	context.on('request', (r) => {
		if (r.url().startsWith('https://api.pixellab.ai/')) requests.push(r.method());
	});
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await freePaletteFixture(page),
		pane = await selectedItemDetails(page);
	const eligibility = await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			item = s.store.project.manifest.items.find((it: { id: string }) => it.id === id);
		return {
			route: item.route,
			key: item.key,
			dressed: !!item.dressed.west,
			frames: s.store.project.manifest.rig.animations.find((a: { id: string }) => a.id === 'walk')
				.sources.west.keypoints.length
		};
	}, fixture.itemId);
	expect(eligibility).toMatchObject({
		route: 'skeleton-pose',
		key: 'green',
		dressed: true,
		frames: 8
	});
	const action = pane.getByRole('button', { name: /^Match item colors.*Free$/ });
	await expect(action).toBeVisible();
	await expect(pane).toContainText('Match 2 pixels in 2 saved Walk frames facing west');
	await expect(pane).toContainText('2 unmatched eligible pixels stay unchanged');
	await expect(pane).toContainText('No PixelLab call is made');
	await context.setOffline(true);
	await action.click();
	await expect(pane.getByText('Matched 2 pixels in 2 frames.', { exact: true })).toBeVisible();
	await expect(action).toHaveCount(0);
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.doc.rev++;
	});
	await expect(pane.getByText('Matched 2 pixels in 2 frames.', { exact: true })).toBeVisible();
	await context.setOffline(false);
	const after = await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			projectPath = '/src/lib/store/project.ts',
			projectModule = await import(projectPath);
		const ctx = await projectModule.loadProject(s.doc.id),
			item = ctx.rec.manifest.items.find((it: { id: string }) => it.id === id),
			image = ctx.project.images.get(item.layers[0].cells.walk.west[0]);
		const unscoped = structuredClone(item.layers);
		for (const layer of unscoped) delete layer.cells.walk.west;
		return {
			materials: ctx.rec.manifest.materials,
			presets: ctx.rec.manifest.presets,
			variants: s.doc.variants,
			qa: item.qa,
			warnings: item.designWarnings,
			provenance: item.provenance,
			rig: ctx.rec.manifest.rig,
			unscoped,
			pixels: [...image.data.slice((40 * 96 + 40) * 4, (40 * 96 + 44) * 4)],
			audit: item.paletteRepairs,
			selected: s.ui.selected,
			anim: s.ui.anim,
			dir: s.ui.dir
		};
	}, fixture.itemId);
	for (const key of [
		'materials',
		'presets',
		'variants',
		'qa',
		'warnings',
		'provenance',
		'rig',
		'unscoped'
	] as const)
		expect(after[key]).toEqual(fixture[key]);
	expect(after.pixels).toEqual([
		128, 128, 128, 255, 240, 240, 240, 255, 192, 128, 96, 255, 16, 16, 16, 255
	]);
	expect(after).toMatchObject({ selected: fixture.itemId, anim: 'walk', dir: 'west' });
	expect(after.audit).toHaveLength(1);
	expect(after.audit[0]).toMatchObject({ version: 'neutral-owned-v1', anim: 'walk', dir: 'west' });
	await expect(pane.locator('.badge.accepted')).toHaveText('Accepted');
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.anim = 'walk';
		s.ui.dir = 'west';
		s.pick(id);
	}, fixture.itemId);
	await selectedItemDetails(page);
	await expect(pane.locator('.badge.accepted')).toHaveText('Accepted');
	await expect(pane.getByRole('button', { name: /^Match item colors.*Free$/ })).toHaveCount(0);
	// The saved recolor survives: the item's colors live in the Colors tab, which Recolor opens.
	await openItemSection(pane, 'Customize');
	await pane.getByRole('button', { name: 'Recolor', exact: true }).click();
	await expect(
		page
			.locator(`.color-sections [data-owner="${fixture.itemId}"]`)
			.getByRole('radio', { name: 'azure', exact: true })
			.first()
	).toHaveAttribute('aria-checked', 'true');
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Export', exact: true });
	await sheet.getByRole('radio', { name: /PNG \+ JSON/ }).click();
	const download = sheet.getByRole('button', { name: /^Download ZIP/ });
	await expect(download).toBeEnabled();
	const event = page.waitForEvent('download');
	await download.click();
	const file = await event,
		path = await file.path();
	expect(path).not.toBeNull();
	const entries = await unzip(new Uint8Array(readFileSync(path!)));
	const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')!));
	expect(
		manifest.items.find((it: { id: string }) => it.id === fixture.itemId).paletteRepairs
	).toHaveLength(1);
	expect(manifest.materials).toEqual(fixture.materials);
	expect(requests).toEqual([]);
});

// Synthetic keys only: exercise the production bundle without contacting PixelLab.
for (const initial of ['shared', 'old-only', 'both'] as const) {
	test(
		'remembered key: ' + initial + ' uses only the shared name and Forget survives reload',
		async ({ page }) => {
			const shared = 'test-shared-key-1234';
			const legacy = 'test-legacy-key-5678';
			let requests = 0;
			await page.route('https://api.pixellab.ai/**', async (route) => {
				requests++;
				expect(route.request().method()).toBe('GET');
				expect(new URL(route.request().url()).pathname).toBe('/v2/balance');
				expect(route.request().headers().authorization).toBe('Bearer ' + shared);
				await route.fulfill({
					json: {
						subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
						credits: { usd: 0 }
					}
				});
			});
			await page.addInitScript(
				({ initial, shared, legacy }) => {
					localStorage.setItem('pixeldoll.agentKey', 'off');
					localStorage.setItem('pixeldoll.welcomed', '1');
					if (sessionStorage.getItem('seeded')) return;
					sessionStorage.setItem('seeded', '1');
					if (initial === 'shared' || initial === 'both')
						localStorage.setItem('pixellabApiKey', shared);
					if (initial !== 'shared') localStorage.setItem('pixeldoll.apiKey', legacy);
					localStorage.setItem('pixellab-backpack:key-kept', 'other-app-legacy-key');
				},
				{ initial, shared, legacy }
			);
			await openStudio(page, '/#/');
			await expect(page.locator('.project-btn .name-text')).toHaveText('Adventurer (Demo)');
			await expect(page.locator('.world-actors').first()).toBeVisible();
			await page.locator('.project-btn').click();
			await page
				.getByRole('menuitem', {
					name: initial === 'old-only' ? 'Connect PixelLab…' : 'PixelLab account',
					exact: true
				})
				.click();
			const dialog = page.getByRole('dialog', {
				name: initial === 'old-only' ? 'Connect PixelLab' : 'PixelLab usage',
				exact: true
			});
			if (initial === 'old-only') {
				await expect(dialog.getByRole('button', { name: 'Forget key' })).toHaveCount(0);
				await expect(dialog.getByLabel('Paste your Secret API key', { exact: true })).toHaveValue(
					''
				);
				expect(requests).toBe(0);
			} else {
				await expect(dialog.getByText(/Connected and remembered/)).toBeVisible();
				expect(requests).toBeGreaterThan(0);
			}
			expect(
				await page.evaluate(() => [
					localStorage.getItem('pixellabApiKey'),
					localStorage.getItem('pixeldoll.apiKey')
				])
			).toEqual([initial === 'old-only' ? null : shared, initial === 'shared' ? null : legacy]);
			if (initial !== 'old-only') await dialog.getByRole('button', { name: 'Forget key' }).click();
			const beforeReload = requests;
			await reloadStudio(page);
			expect(
				await page.evaluate(() => [
					localStorage.getItem('pixellabApiKey'),
					localStorage.getItem('pixeldoll.apiKey'),
					localStorage.getItem('pixellab-backpack:key-kept')
				])
			).toEqual([null, initial === 'shared' ? null : legacy, 'other-app-legacy-key']);
			await page.locator('.project-btn').click();
			await expect(
				page.getByRole('menuitem', { name: 'Connect PixelLab…', exact: true })
			).toBeVisible();
			await page.keyboard.press('Escape');
			expect(requests).toBe(beforeReload);
		}
	);
}

test('setup and move drafts survive canceled connection and stay scoped to their character', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		requests.push(route.request().method());
		await route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/');
	await page.locator('.world-actors').first().waitFor();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download ZIP/ }).click();
	const files = await unzip(new Uint8Array(readFileSync((await (await downloading).path())!)));
	const data = JSON.parse(new TextDecoder().decode(files.get('project.json')));
	const m = data.manifest;
	m.name = 'Connection draft fixture';
	const poses = JSON.parse(readFileSync('dev-fixtures/s4rig/keypoints.json', 'utf8'));
	const { toApi } = await import('../../src/lib/rig/poses.ts');
	const body = m.items.find((i: { id: string }) => i.id === m.rig.baseItem).layers[0];
	m.rig.rest = {};
	for (const d of m.rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf)) {
		const keypoints = toApi(poses[`walk/${d.id}/0`], m.rig.cell);
		m.rig.rest[d.id] = { image: body.cells.walk[d.id][0], keypoints };
		for (const a of m.rig.animations) {
			a.sources ??= {};
			a.sources[d.id] = {
				route: 'skeleton-v3',
				keypoints: Array.from({ length: a.cells }, () => keypoints)
			};
		}
	}
	const vest =
		m.items.find((i: { id: string }) => i.id === 'vest_leather') ??
		m.items.find((i: { slot: string }) => i.slot === 'top_inner');
	body.cells.default = Object.fromEntries(
		Object.entries(m.rig.rest).map(([dir, rest]) => [dir, [(rest as { image: string }).image]])
	);
	m.rig.animations = m.rig.animations.filter((clip: { id: string }) => clip.id !== 'default');
	m.rig.animations.unshift({
		id: 'default',
		cells: 1,
		loop: true,
		frames: [{ cell: 0, ms: 100 }]
	});
	vest.route = 'skeleton-pose';
	vest.key = 'magenta';
	vest.dressed = Object.fromEntries(
		Object.entries(m.rig.rest).map(([d, r]) => [d, (r as { image: string }).image])
	);
	data.character = { id: 'offline-draft-fixture', looks: 'Stored offline test artwork' };
	files.set('project.json', new TextEncoder().encode(JSON.stringify(data)));
	const archive = await zip([...files].map(([name, data]) => ({ name, data })));
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Import from device...', exact: true }).click();
	await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'draft-fixture.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(archive)
	});
	await page.getByRole('img', { name: 'Character import preview', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText(m.name);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click();
	const setup = page.getByRole('dialog', { name: 'Set up character', exact: true });
	await setup
		.getByRole('textbox', { name: /Existing appearance/ })
		.fill('Blue vest, bald, gray shorts');
	await setup.getByRole('button', { name: /^Set up ·/ }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click();
	await expect(setup.getByRole('textbox', { name: /Existing appearance/ })).toHaveValue(
		'Blue vest, bald, gray shorts'
	);
	await setup.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await equipmentMode(page, 'Moves');
	// A set-up character never flashes the setup notice while its record is still being read.
	await page.evaluate(() => {
		const seen = window as unknown as { setupNoticeSeen?: boolean };
		seen.setupNoticeSeen = false;
		new MutationObserver(() => {
			if (document.body.textContent?.includes('pose rig to add moves')) seen.setupNoticeSeen = true;
		}).observe(document.body, { subtree: true, childList: true, characterData: true });
	});
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'New move', exact: true })).toBeVisible();
	const move = page.getByRole('dialog', { name: /^(New move|Redraw .+)$/ });
	await expect(move.getByRole('textbox', { name: /^Describe the motion$/ })).toBeVisible();
	expect(
		await page.evaluate(() => (window as unknown as { setupNoticeSeen?: boolean }).setupNoticeSeen)
	).toBe(false);
	const description = move.getByRole('textbox', { name: /^Describe the (motion|replacement)$/ });
	// Templates are suggestions under the prompt: pressed while applied.
	const templates = move.getByRole('group', { name: 'Move templates', exact: true });
	const cast = templates.getByRole('button', { name: 'Cast', exact: true });
	const applied = templates.getByRole('button', { pressed: true });
	await expect(description).toBeVisible();
	await expect(applied).toHaveCount(1);
	await cast.click();
	await description.focus();
	await expect(cast).toHaveAttribute('aria-pressed', 'true');
	// Cast's authored keyframes run while its prompt stands; editing the prompt outlines the pill.
	await expect(cast).not.toHaveAttribute('data-described');
	await expect(cast).toHaveAttribute('title', "Uses this move's built-in motion.");
	const describedBy = await cast.getAttribute('aria-describedby');
	await expect(move.locator(`#${describedBy}`)).toHaveText("Uses this move's built-in motion.");
	// The fill is the visible signal, so the two states must actually paint differently.
	await expect(cast).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await description.fill('cast with a wide overhead sweep');
	await expect(cast).toHaveAttribute('data-described', '');
	await expect(cast).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(move.locator(`#${describedBy}`)).toHaveText(
		'PixelLab animates this move from your prompt instead of its built-in motion.'
	);
	await expect(move.getByRole('button', { name: /^Generate Cast/ })).toBeEnabled();
	// Pressing the applied template again lets the text stand as a custom move.
	await cast.click();
	await expect(applied).toHaveCount(0);
	await expect(description).toHaveValue('cast with a wide overhead sweep');
	await description.fill('walk');
	await expect(move.getByRole('button', { name: /^Generate / })).toBeDisabled();
	await expect(move.getByText('Directions to redraw')).toHaveCount(0);
	await expect(move).toContainText('Walk is already a move option.');
	await description.fill('jumping in place');
	await expect(applied).toHaveCount(0);
	const first = templates.getByRole('button').first();
	await first.press('Enter');
	await expect(first).toHaveAttribute('aria-pressed', 'true');
	await expect(description).not.toHaveValue('jumping in place');
	await first.click();
	await description.fill('jumping in place');
	await description.clear();
	await expect(move.getByRole('button', { name: /^Generate / })).toBeDisabled();
	await expect(applied).toHaveCount(0);
	await description.fill('jumping in place');
	const advanced = move.getByRole('button', { name: /^Advanced/ });
	await advanced.click();
	const model = move.getByRole('combobox', { name: 'Motion model' });
	const slider = move.getByRole('slider', { name: 'Frames' });
	await expect(model).toHaveValue('skeleton-v3');
	await expect(model.getByRole('option')).toHaveText(['PixMiniMax', 'Skeleton V3', 'V3']);
	// The open list prices each model; the closed field keeps only the chosen name, and Generate shows the same price.
	await model.click();
	const listed = model.getByRole('option', { name: /^PixMiniMax ~\d+ gens$/ });
	const price = (await listed.locator('.model-cost').textContent())!;
	await listed.click();
	await expect(model).toHaveValue('pixminimax');
	await expect(model.getByRole('button')).toHaveText('PixMiniMax');
	await expect(move.getByRole('button', { name: /^Generate / })).toContainText(price);
	await model.selectOption('skeleton-v3');
	await slider.press('Home');
	await expect(slider).toHaveAttribute('aria-valuetext', '3 frames');
	await model.selectOption('pixminimax');
	await slider.press('End');
	await expect(slider).toHaveAttribute('aria-valuetext', '40 frames');
	await slider.press('ArrowLeft');
	await expect(slider).toHaveAttribute('aria-valuetext', '36 frames');
	await slider.press('End');
	await model.selectOption('v3');
	await expect(slider).toHaveAttribute('aria-valuetext', '16 frames');
	await slider.press('Home');
	await slider.press('ArrowRight');
	await expect(slider).toHaveAttribute('aria-valuetext', '6 frames');
	await move.getByRole('button', { name: 'Default (8 frames)', exact: true }).click();
	await expect(slider).toHaveAttribute('aria-valuetext', '8 frames');
	await model.selectOption('skeleton-v3');
	await expect(slider).toHaveAttribute('aria-valuetext', '8 frames');
	await expect(move.getByRole('checkbox', { name: new RegExp(vest.name) })).toHaveCount(0);
	// The s2 body stands on its frame's last row: the move warns and offers free room first, keeping every choice.
	await expect(move).toContainText('This move may step past the 64 px frame');
	await move.getByRole('button', { name: 'Make room', exact: true }).click();
	await expect(page.locator('.toast')).toContainText('Frame adjusted');
	await expect(move).not.toContainText('This move may step past');
	await expect(description).toHaveValue('jumping in place');
	await expect(move.getByRole('button', { name: /^Generate / })).toContainText('Connect PixelLab');
	await move.getByRole('button', { name: /^Generate / }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	const defaultsTab = await context.newPage();
	await defaultsTab.goto(page.url());
	await defaultsTab.evaluate(() => {
		localStorage.setItem('pixeldoll.creation.moves', JSON.stringify({ model: 'v3', frames: 6 }));
		localStorage.setItem('pixeldoll.creation.states', JSON.stringify({ model: 'pixen' }));
		localStorage.setItem('pixeldoll.creation.items', JSON.stringify({ method: 'anchor' }));
	});
	await defaultsTab.close();
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	await expect(description).toHaveValue('jumping in place');
	await expect(model).toHaveValue('skeleton-v3');
	await expect(move.getByRole('checkbox', { name: new RegExp(vest.name) })).toHaveCount(0);
	await expect(applied).toHaveCount(0);
	await cast.click();
	await expect(description).toBeEnabled();
	await expect(description).toHaveValue('cast');
	await expect(move.getByRole('button', { name: /^Generate / })).toBeEnabled();
	await expect(cast).toHaveAttribute('aria-pressed', 'true');
	await expect(advanced).toHaveCount(1);
	await expect(templates.getByRole('button', { name: 'Ride', exact: true })).toHaveCount(0);
	await move.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	await description.fill('A jump that starts low');
	await expect(slider).toHaveAttribute('aria-valuetext', '6 frames');
	await cast.click();
	await expect(slider).toHaveAttribute('aria-valuetext', '8 frames');
	await move.getByRole('button', { name: /^Generate / }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	await expect(cast).toHaveAttribute('aria-pressed', 'true');
	await expect(slider).toHaveAttribute('aria-valuetext', '8 frames');
	await cast.click();
	await expect(slider).toHaveAttribute('aria-valuetext', '6 frames');
	await advanced.click();
	await expect(model).toHaveValue('v3');
	await model.selectOption('pixminimax');
	await expect(move).toContainText(/Saved Frames is unavailable here.*Automatic \(8 frames\)/i);
	await model.selectOption('v3');
	await expect(slider).toHaveAttribute('aria-valuetext', '6 frames');
	await slider.press('Home');
	await cast.click();
	await expect(slider).toHaveAttribute('aria-valuetext', '4 frames');
	await model.selectOption('pixminimax');
	await move.getByRole('button', { name: 'Close', exact: true }).click();
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	await description.fill('A jump that starts low');
	await expect(slider).toHaveAttribute('aria-valuetext', '6 frames');
	await move.getByRole('button', { name: 'Close', exact: true }).click();
	await page
		.getByRole('alertdialog', { name: 'Discard changes?', exact: true })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await page.getByRole('button', { name: 'More actions for Walk', exact: true }).click();
	await page.getByRole('menuitem', { name: /^Redraw/ }).click();
	if (!(await model.isVisible())) await advanced.click();
	await expect(model).toHaveValue('skeleton-v3');
	await move.getByRole('button', { name: 'Close', exact: true }).click();
	await equipmentMode(page, 'States');
	await page.getByRole('button', { name: 'New State...', exact: true }).click();
	const state = page.getByRole('dialog', { name: 'New State', exact: true });
	await state.getByRole('switch', { name: 'Edit this pose' }).check();
	await expect(state.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('pixen');
	await state.getByRole('combobox', { name: 'Model', exact: true }).selectOption('pro');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'New State...', exact: true }).click();
	await state.getByRole('switch', { name: 'Edit this pose' }).check();
	await expect(state.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('pixen');
	await page.keyboard.press('Escape');
	await newItem(page, 'Head');
	const item = page.getByRole('dialog', { name: 'New item', exact: true });
	await expect(item.getByRole('combobox', { name: 'Animation method' })).toHaveValue('anchor');
	await item.getByRole('combobox', { name: 'Animation method' }).selectOption('skel');
	await page.keyboard.press('Escape');
	await newItem(page, 'Head');
	await expect(item.getByRole('combobox', { name: 'Animation method' })).toHaveValue('anchor');
	await page.keyboard.press('Escape');
	await equipmentMode(page, 'Moves');
	await page.locator('.project-btn').click();
	await page.getByRole('menuitemradio', { name: 'Adventurer (demo)', exact: true }).click();
	// Wait for the switch itself: clicking Add a move before the demo replaced the fixture raced the load (the old flake).
	await expect(page.locator('.project-btn .name-text')).toHaveText('Adventurer (Demo)');
	await expect(page.locator('.move-list')).toBeVisible();
	// The draft stays with its character: the read-only demo offers no Add a move at all.
	await expect(page.getByRole('button', { name: 'New move...', exact: true })).toHaveCount(0);
	expect(requests).toEqual([]);
});

test('radio groups and tabs use one Tab stop and arrow selection', async ({ page, context }) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixeldoll.export.engine', 'unknown-engine');
	});
	await openStudio(page, '/');
	await expect(page.locator('.world-actors').first()).toBeVisible();
	// The slot rail is section navigation with one Tab stop; Down arrow moves to and shows the next slot.
	const tabs = page.getByRole('navigation', { name: 'Equipment slots', exact: true });
	await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
	await tabs.getByRole('button', { name: /^Head\b/ }).click();
	await tabs.getByRole('button', { name: /^Head\b/ }).focus();
	await page.keyboard.press('ArrowDown');
	await expect(tabs.getByRole('button', { name: /^Hair\b/ })).toBeFocused();
	await expect(tabs.getByRole('button', { name: /^Hair\b/ })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
	await page.keyboard.press('End');
	await expect(tabs.getByRole('button').last()).toBeFocused();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.keyboard.press('Home');
	await expect(tabs.getByRole('button').first()).toBeFocused();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const engines = page.getByRole('group', { name: 'Export format', exact: true });
	await expect(engines.getByRole('radio', { name: 'PNG + JSON', exact: true })).toBeChecked();
	await expect(engines.getByRole('radio', { name: /Godot/ })).toBeEnabled();
	await engines.getByRole('radio', { name: /Godot/ }).focus();
	await expect(engines.getByRole('radio', { name: /Godot/ })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(engines.getByRole('radio', { name: /Unity/ })).toBeFocused();
	await expect(engines.getByRole('radio', { name: /Unity/ })).toBeChecked();
	await page.keyboard.press('Tab');
	await expect(engines.getByRole('radio', { name: /Phaser/ })).not.toBeFocused();
	await page
		.getByRole('dialog', { name: 'Export', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const editor = page.getByRole('tablist', { name: 'Prompt editor', exact: true });
	await expect(editor.locator('[tabindex="0"]')).toHaveCount(1);
	await editor.getByRole('tab', { name: 'Appearance', exact: true }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(editor.getByRole('tab', { name: 'Prompt', exact: true })).toBeFocused();
	await expect(editor.getByRole('tab', { name: 'Prompt', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(editor.locator('[tabindex="0"]')).toHaveCount(1);
	await page.keyboard.press('ArrowLeft');
	const skin = page.getByRole('combobox', { name: 'Skin', exact: true });
	await expect(skin).toHaveValue('Not set');
	await skin.focus();
	await expect(skin).toBeFocused();
	await page.keyboard.press('Space'); // Open the native select before moving its highlighted option.
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter'); // Commit native Windows/Chromium select navigation.
	await expect(skin).toHaveValue('Deep brown');
	await page.keyboard.press('Tab');
	await expect(skin).not.toBeFocused();
});

test('draft review can inspect every generated move and only its available views', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const s = (
			window as unknown as {
				__studio: {
					ui: { playing: boolean; frame: number; anim: string; selected: string };
					doc: { id: string };
					store: { project: any; results: Record<string, unknown> };
					gens: unknown[];
					loadGens: () => Promise<void>;
				};
			}
		).__studio;
		await s.loadGens();
		s.ui.playing = false;
		s.ui.frame = 0;
		s.ui.anim = 'walk';
		const p = s.store.project,
			it = p.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: it.id,
					name: 'Review fixture',
					slot: it.slot,
					prompt: 'hat',
					key: 'magenta',
					anims: ['walk', 'cross-punch'],
					dirs: ['south', 'east', 'north'],
					clipDirs: { walk: ['south', 'east', 'north'], 'cross-punch': ['south'] }
				},
				calls: [],
				keySwitched: false,
				log: []
			},
			input: { name: 'Review fixture', slot: it.slot, prompt: 'hat' },
			phase: 'review',
			status: 'Review'
		});
		s.store.results[it.id] = { cells: [], qa: null, g1: new Map(), preview: p };
		s.ui.selected = 'gen:' + it.id;
	});
	await reviewSelectedDraft(page);
	const review = page.locator('.gen');
	await expect(review.getByRole('button', { name: /^Generate again/ })).toContainText('~');
	await expect(
		review.getByText(
			'Generate again redraws the standing design in the character’s directions at the displayed estimate. Generate other moves separately after you like it. Further quality retries or repairs require another request. PixelLab may bill some calls in dollars; queue time varies.',
			{ exact: true }
		)
	).toBeVisible();
	await expect(review.getByRole('combobox', { name: 'Preview move', exact: true })).toHaveValue(
		'walk'
	);
	await expect(review.locator('.review-grid figure')).toHaveCount(4);
	const before = await review
		.locator('canvas')
		.first()
		.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
	await review
		.getByRole('combobox', { name: 'Preview move', exact: true })
		.selectOption('cross-punch');
	await expect(playbackPicker(page)).toHaveAttribute('value', 'cross-punch');
	await expect(review.locator('.review-grid figure')).toHaveCount(1);
	await expect(review.getByRole('img', { name: /facing south/ })).toBeVisible();
	expect(
		await review
			.locator('canvas')
			.first()
			.evaluate((c) => (c as HTMLCanvasElement).toDataURL())
	).not.toBe(before);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		(await import(path)).ui.anim = 'walk';
	});
	await expect(playbackPicker(page)).toHaveAttribute('value', 'walk');
	await expect(review.getByRole('combobox', { name: 'Preview move', exact: true })).toHaveValue(
		'walk'
	);
	await expect(review.locator('.review-grid figure')).toHaveCount(4);
	// Details must react to ledger-only completion; the draft itself does not change when usage arrives.
	await page.evaluate(() => {
		const w = window as unknown as {
			__studio: { ui: { selected: string }; gens: any[] };
			__queue: { recs: Map<string, any>; emit: () => void };
		};
		const g = w.__studio.gens.find((g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected);
		g.draft.calls = [
			{ kind: 'edit', cells: ['walk/south/0'], seed: 1, rerolls: 0, old: [], recId: 'spent-first' },
			{ kind: 'edit', cells: ['walk/east/0'], seed: 2, rerolls: 0, old: [], recId: 'spent-second' }
		];
		for (const [id, gens] of [
			['spent-first', 10],
			['spent-second', 0]
		] as const)
			w.__queue.recs.set(id, {
				id,
				label: id,
				method: 'POST',
				endpoint: '/synthetic',
				params: {},
				inputs: [],
				requestHash: id,
				state: 'done',
				createdAt: 1,
				nextAt: 0,
				attempts: 1,
				jobs: [],
				gens,
				usd: 0
			});
		w.__queue.emit();
	});
	await review.getByText('Details', { exact: true }).click();
	const spent = review.locator('dt:has-text("Spent") + dd');
	await expect(spent).toHaveText('10 gens');
	const beforeDraft = await page.evaluate(() => {
		const w = window as unknown as {
			__studio: { ui: { selected: string }; gens: any[] };
			__queue: { recs: Map<string, any>; emit: () => void };
		};
		const draft = w.__studio.gens.find(
			(g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected
		).draft;
		const snapshot = JSON.stringify(draft);
		w.__queue.recs.get('spent-second').usd = 0.08;
		w.__queue.emit();
		return snapshot;
	});
	await expect(spent).toHaveText('10 gens + $0.080');
	expect(
		await page.evaluate(() => {
			const w = window as unknown as { __studio: { ui: { selected: string }; gens: any[] } };
			return JSON.stringify(
				w.__studio.gens.find((g) => 'gen:' + g.draft.spec.id === w.__studio.ui.selected).draft
			);
		})
	).toBe(beforeDraft);
});

test('a draft can be worn while it loads: landed views show, pending ones say loading, and it is never saved', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	type Studio = {
		REQUEST_TEXT: number;
		ui: { playing: boolean; anim: string; dir: string };
		doc: { id: string; items: Record<string, string | null>; drafts: Record<string, string> };
		store: { project: any; results: Record<string, unknown> };
		gens: any[];
		loadGens: () => Promise<void>;
	};
	await page.evaluate(async () => {
		const s = (window as unknown as { __studio: Studio }).__studio;
		await s.loadGens();
		s.ui.playing = false;
		s.ui.anim = 'walk';
		s.ui.dir = 'south';
		// a generating helm whose south walk landed; east (west mirrors it) and north are still on their way
		const p = s.store.project,
			hat = p.manifest.items.find((i: { id: string }) => i.id === 'hat_wizard'),
			keys = (dir: string) => Array.from({ length: 8 }, (_, i) => `walk/${dir}/${i}`);
		const item = {
			...structuredClone(hat),
			id: 'loading_helm',
			name: 'Loading helm',
			status: 'draft',
			materials: [],
			coverage: keys('south'),
			pending: [...keys('east'), ...keys('north')]
		};
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: 'loading_helm',
					name: 'Loading helm',
					slot: 'head',
					prompt: 'a helm',
					key: 'green',
					anims: ['walk'],
					dirs: ['south', 'east', 'north']
				},
				calls: [],
				keySwitched: false,
				log: []
			},
			input: { name: 'Loading helm', slot: 'head', prompt: 'a helm' },
			phase: 'running',
			status: 'Adding the other moves',
			requestText: s.REQUEST_TEXT
		});
		s.store.results = {
			...s.store.results,
			loading_helm: {
				cells: [],
				qa: null,
				g1: new Map(),
				preview: {
					manifest: { ...p.manifest, items: [...p.manifest.items, item] },
					images: p.images
				}
			}
		};
	});
	// run a function against the dev-only studio state (serialized like page.evaluate's own functions)
	const studio = <T>(fn: (s: Studio, arg: string) => T, arg = '') =>
		page.evaluate(
			({ src, arg }) =>
				new Function('s', 'arg', `return (${src})(s, arg)`)(
					(window as unknown as { __studio: Studio }).__studio,
					arg
				),
			{ src: fn.toString(), arg }
		) as Promise<T>;
	const before = await studio((s) => ({ ...s.doc.items }));
	const tile = page.locator('.equipment-scroll').getByRole('button', { name: /^Loading helm, / });
	await tile.click();
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	expect(await studio((s) => ({ items: { ...s.doc.items }, drafts: { ...s.doc.drafts } }))).toEqual(
		{ items: before, drafts: { head: 'loading_helm' } }
	);
	const notes = page.locator('.world-loading-items');
	const coverage = page.getByRole('button', { name: '1 equipped item needs frames', exact: true });
	await expect(page.locator('.world-stage')).toHaveAttribute('data-facing', 'south');
	await expect(page.locator('.world-stage')).toHaveAttribute('data-lineup', /north/);
	await expect(
		notes,
		'South is ready, but the visible companion facings are still loading'
	).toHaveText('Loading helm loading: East, North');
	await expect(coverage).toHaveCount(0);
	for (const dir of ['east', 'west', 'north']) {
		await studio((s, d) => {
			s.ui.dir = d;
		}, dir);
		await expect(notes).toHaveText('Loading helm loading: East, North');
		await expect(page.locator('.world-coverage', { hasText: 'hidden' })).toHaveCount(0);
		await expect(coverage).toHaveCount(0);
	}
	await expect(page.locator('.gen')).toHaveCount(0);
	await tile.click();
	await expect(tile).toHaveAttribute('aria-pressed', 'false');
	await expect(notes).toHaveCount(0);
	await tile.click();
	await expect(notes).toHaveText('Loading helm loading: East, North');
	// finished with gaps: those views are missing (hidden and said so), no longer loading; Discard takes the draft off
	await studio((s) => {
		s.gens.find((g) => g.draft.spec.id === 'loading_helm').phase = 'review';
	});
	await expect(notes).toHaveCount(0);
	await expect(coverage).toBeInViewport();
	await coverage.click();
	await expect(page.locator('#preview-coverage')).toContainText('Loading helm');
	await coverage.click();
	await page.getByRole('button', { name: 'More options for Loading helm', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Review item...', exact: true }).click();
	await page.locator('.gen').getByRole('button', { name: 'Discard', exact: true }).click();
	await expect(tile).toHaveCount(0);
	await expect(coverage).toHaveCount(0);
	expect(
		await studio((s) => ({
			items: { ...s.doc.items },
			drafts: { ...s.doc.drafts },
			presets: JSON.stringify(s.store.project.manifest.presets)
		}))
	).toMatchObject({ items: before, drafts: {} });
	expect(await studio((s) => JSON.stringify(s.store.project.manifest))).not.toContain(
		'loading_helm'
	);
	expect(requests).toEqual([]);
});

/** Tab A holds a failed character create (which keeps the jobs there); tab B opens second and follows. */
async function busyFirstTab(
	page: Page,
	context: import('@playwright/test').BrowserContext,
	posts: string[]
) {
	await context.route('https://api.pixellab.ai/**', (r) => {
		if (r.request().method() === 'POST') posts.push(r.request().url());
		return r.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/');
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('pixeldoll');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const db = r.result,
						t = db.transaction('projects', 'readwrite');
					t.objectStore('projects').put(
						{
							id: 'studio-create:rig-failed-x',
							status: 'failed',
							error: 'Saved terminal failure',
							spec: {
								name: 'Failed',
								description: 'body',
								size: 48,
								directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }],
								seed: 1,
								projectId: 'rig-failed-x'
							}
						},
						'studio-create:rig-failed-x'
					);
					t.oncomplete = () => {
						db.close();
						resolve();
					};
				};
			})
	);
	await reloadStudio(page);
	const second = await context.newPage();
	await openStudio(second, '/');
	await second.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(second.locator('#experience-options')).toContainText('Other tab');
	await second.keyboard.press('Escape');
	await second.locator('.project-btn').click();
	await second
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await second.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const create = second.getByRole('dialog', { name: 'New character', exact: true });
	await create
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('a cheerful copper clockwork scout');
	await create.getByRole('button', { name: /^Create/ }).click();
	const activity = second.getByRole('dialog', { name: 'Activity', exact: true });
	const notice = activity.locator('.act-list > :first-child');
	await expect(notice.getByRole('heading', { name: 'Waiting for another tab' })).toBeVisible();
	await expect(notice).toContainText('Keep Activity open');
	await expect(activity.getByText('Nothing generating.', { exact: true })).toHaveCount(0);
	await expect(activity.getByRole('button', { name: 'Cancel request', exact: true })).toBeVisible();
	return { second, activity };
}

test('a click waiting on a busy first tab continues as soon as that tab is idle, without closing it', async ({
	page,
	context
}) => {
	const posts: string[] = [];
	const { second, activity } = await busyFirstTab(page, context, posts);
	await second.waitForTimeout(1500); // several handoff requests: the failed create keeps the jobs in the first tab
	await expect(activity).toBeVisible();
	await expect(second.getByRole('dialog', { name: 'Connect PixelLab', exact: true })).toHaveCount(
		0
	);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page
		.locator('#experience-options')
		.getByRole('button', { name: /Activity/ })
		.click();
	await page
		.getByRole('dialog', { name: 'Activity', exact: true })
		.getByRole('button', { name: /Open New character.*Failed/ })
		.click();
	// The failed creation's footer Discard releases its jobs.
	await page
		.getByRole('dialog', { name: 'New character', exact: true })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toBeHidden();
	await expect(second.getByRole('dialog', { name: 'Connect PixelLab', exact: true })).toBeVisible({
		timeout: 15000
	}); // no key: Connect
	expect(posts).toEqual([]);
});

for (const dismissal of ['Back', 'Cancel request'] as const) {
	test(`leaving Activity by ${dismissal} cancels a waiting click, so closing the busy tab later starts nothing`, async ({
		page,
		context
	}) => {
		const posts: string[] = [];
		const { second, activity } = await busyFirstTab(page, context, posts);
		if (dismissal === 'Back') await second.goBack();
		else await activity.getByRole('button', { name: dismissal, exact: true }).click();
		await expect(activity).toHaveCount(0);
		// Both routes step back to New character, where the click waited; its own More reopens Activity.
		await second
			.getByRole('dialog', { name: 'New character', exact: true })
			.getByRole('button', { name: 'More options', exact: true })
			.click();
		await second
			.locator('#experience-options')
			.getByRole('button', { name: /Activity/ })
			.click();
		await expect(activity).toBeVisible();
		await expect(activity.getByRole('heading', { name: 'Waiting for another tab' })).toHaveCount(0);
		await expect(activity.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
		await page.close(); // with Activity open again, as a user who only looks
		await expect(activity).not.toContainText('Running in another tab', { timeout: 15000 });
		await second.waitForTimeout(1000); // the takeover has resumed; nothing waits to run
		await expect(second.getByRole('dialog', { name: 'Connect PixelLab', exact: true })).toHaveCount(
			0
		);
		expect(posts).toEqual([]);
	});
}

test('a tab that is not running the generations still opens New item from an item’s menu', async ({
	page,
	context
}) => {
	await editableCopy(page);
	const second = await context.newPage();
	await openStudio(second, '/');
	await second.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(second.locator('#experience-options')).toContainText('Other tab');
	await second.keyboard.press('Escape');
	await equipmentGroup(second, 'Head');
	await second.getByRole('button', { name: 'More options for Steel helmet', exact: true }).click();
	// Opening the sheet spends nothing, so only its Make button waits for this tab to take over the jobs.
	await itemMenu(second)
		.getByRole('menuitem', { name: 'Create a variant...', exact: true })
		.click();
	await expect(second.getByRole('dialog', { name: 'New item', exact: true })).toBeVisible();
	await expect(second.getByRole('dialog', { name: 'Activity', exact: true })).toHaveCount(0);
});

test('Create in a second tab takes the jobs from the idle first tab at once and preserves its draft', async ({
	page,
	context
}) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await context.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/');
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const follower = await context.newPage();
	// Records whether Activity ever opened in this tab, however briefly.
	await follower.addInitScript(() => {
		new MutationObserver(() => {
			if (document.querySelector('dialog[open] .sheet-title')?.textContent === 'Activity')
				(window as unknown as { sawActivity: boolean }).sawActivity = true;
		}).observe(document, { childList: true, subtree: true, characterData: true });
	});
	await openStudio(follower, '/');
	await follower.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(follower.locator('#experience-options')).toContainText('Other tab');
	await follower.keyboard.press('Escape');
	async function openCreate() {
		await follower.locator('.project-btn').click();
		await follower
			.locator('#project-menu')
			.getByRole('button', { name: 'New character', exact: true })
			.click();
		await follower.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
		return follower.getByRole('dialog', { name: 'New character', exact: true });
	}
	let create = await openCreate();
	await create
		.getByRole('textbox', { name: 'Details', exact: true })
		.fill('a cheerful copper clockwork scout');
	await create.getByRole('button', { name: 'Side-scroller 2', exact: true }).click();
	await create.getByRole('button', { name: /^Create/ }).click();
	// The first tab runs nothing, so it hands the jobs over and the click continues here (no key: Connect) without
	// Activity ever opening. A busy first tab keeps them and the click waits in Activity (the tests above).
	const connect = follower.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await expect(connect).toBeVisible({ timeout: 15000 });
	expect(await follower.evaluate(() => 'sawActivity' in window)).toBe(false);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(page.locator('#experience-options')).toContainText('Other tab');
	await page.keyboard.press('Escape');
	await connect.getByRole('button', { name: 'Close', exact: true }).click();
	create = await openCreate();
	await expect(create.getByRole('textbox', { name: 'Details', exact: true })).toHaveValue(
		'a cheerful copper clockwork scout'
	);
	await expect(
		create.getByRole('button', { name: 'Side-scroller 2', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	expect(requests).toEqual([]);
});

test('mixed malformed draft calls cannot claim Clean when surviving frame checks pass', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const s = (
			window as unknown as {
				__studio: {
					ui: { playing: boolean; anim: string; selected: string };
					doc: { id: string };
					store: { project: any; results: Record<string, unknown> };
					gens: unknown[];
					loadGens: () => Promise<void>;
				};
			}
		).__studio;
		await s.loadGens();
		s.ui.playing = false;
		s.ui.anim = 'walk';
		const p = s.store.project,
			it = p.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		const calls = ['south', 'east'].map((d) => ({
			kind: 'pose',
			cells: ['walk/' + d + '/0'],
			seed: 1,
			rerolls: 0,
			old: []
		}));
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: it.id,
					name: 'Mixed malformed fixture',
					slot: it.slot,
					prompt: 'hat',
					key: 'magenta',
					anims: ['walk'],
					dirs: ['south', 'east']
				},
				calls,
				keySwitched: false,
				log: []
			},
			input: { name: 'Mixed malformed fixture', slot: it.slot, prompt: 'hat' },
			phase: 'review',
			status: 'Review'
		});
		// The valid call's cells pass; an excluded malformed call remains an independent G1 failure.
		s.store.results = {
			...s.store.results,
			[it.id]: {
				cells: [],
				qa: { qa: { status: 'pass' }, warnings: [], failCalls: new Map(), softCalls: new Set() },
				g1: new Map([[1, 'G1 0 outputs for 3 requested frames']]),
				preview: p
			}
		};
		s.ui.selected = 'gen:' + it.id;
	});
	await reviewSelectedDraft(page);
	const review = page.locator('.gen');
	await expect(review.locator('.badge.look')).toHaveText('Needs a look');
	await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeDisabled();
	await expect(
		review.getByText('PixelLab returned an unexpected image', { exact: true })
	).toBeVisible();
	await expect(review.locator('.badge.clean')).toHaveCount(0);
	await expect(review.getByText('Every frame passed the checks.', { exact: true })).toHaveCount(0);
	await page.evaluate(() => {
		const s = (
			window as unknown as {
				__studio: { ui: { selected: string }; store: { results: Record<string, any> } };
			}
		).__studio;
		const id = s.ui.selected.slice(4),
			r = s.store.results[id];
		const count = r.preview.manifest.rig.animations.find(
			(a: { id: string }) => a.id === 'walk'
		).cells;
		const cells = ['south', 'east'].flatMap((dir) =>
			Array.from({ length: count }, (_, i) => ({ key: `walk/${dir}/${i}` }))
		);
		s.store.results = {
			...s.store.results,
			[id]: {
				...r,
				cells,
				g1: new Map([[1, 'D1 keyframe rest/east/0: 25 % gray smudges in a colorful design']])
			}
		};
	});
	await expect(review.locator('.badge.look')).toHaveText('Needs a look');
	await expect(review.getByText('The design has gray smudges', { exact: true })).toBeVisible();
	await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled();
	for (const [warning, reason] of [
		[
			'G8 idle/west: hand positions are missing for 4 of 4 frames; set up the character’s pose rig and check this view',
			'Hand positions are unavailable; set up the pose rig and check this view (idle, west)'
		],
		[
			'G8 idle/west: grip side is unclear (0 right / 0 left frames); check that the item stays in the intended hand',
			'The grip side is unclear; check the intended hand (idle, west)'
		],
		[
			'G8 idle/west: item is more than 6 px from both hands in 4 of 4 frames; check its grip',
			'The grip could not be confirmed; inspect the item at the hand (idle, west)'
		]
	]) {
		await page.evaluate((warning) => {
			const s = (
				window as unknown as {
					__studio: { ui: { selected: string }; store: { results: Record<string, any> } };
				}
			).__studio;
			const id = s.ui.selected.slice(4),
				r = s.store.results[id];
			s.store.results = {
				...s.store.results,
				[id]: { ...r, g1: new Map(), qa: { ...r.qa, warnings: [warning] } }
			};
		}, warning);
		await expect(review.locator('.badge.look')).toHaveText('Needs a look');
		await expect(review.getByText(reason, { exact: true })).toBeVisible();
		await expect(review.getByText('The item switches hands', { exact: true })).toHaveCount(0);
		await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled();
	}
	await page.evaluate(() => {
		const s = (
			window as unknown as {
				__studio: { ui: { selected: string }; store: { results: Record<string, any> } };
			}
		).__studio;
		const id = s.ui.selected.slice(4),
			r = s.store.results[id];
		s.store.results = {
			...s.store.results,
			[id]: { ...r, g1: new Map(), qa: { ...r.qa, warnings: [] } }
		};
	});
	await expect(review.locator('.badge.clean')).toHaveText('Clean');
	await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeEnabled();
	await expect(review.getByText('Every frame passed the checks.', { exact: true })).toBeVisible();
	expect(requests).toEqual([]);
});

test('a stopped item draft keeps its available frames for free, and an unreadable paid review offers a free Try again', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	// The draft's calls: walk (its design move) and the first half of cross-punch finished, its second half failed at PixelLab.
	await page.evaluate(async () => {
		const path = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ path);
		const now = Date.now();
		for (const [id, state] of [
			['keep-available-walk', 'done'],
			['keep-available-punch-start', 'done'],
			['keep-available-punch-end', 'failed']
		])
			await db.put('jobs', id, {
				id,
				label: 'Available hat',
				method: 'POST',
				endpoint: '/edit-animation-v2',
				params: { seed: 1 },
				inputs: [],
				requestHash: id.length.toString(16).padStart(64, '0'),
				state,
				attempts: 1,
				nextAt: 0,
				createdAt: now,
				submittedAt: now,
				finishedAt: now,
				jobs: [],
				...(state === 'failed' ? { error: 'Offline fixture failure' } : {}),
				gens: state === 'done' ? 1 : 0,
				usd: 0
			});
	});
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(/* @vite-ignore */ path);
		await s.loadGens();
		// The built-in demo is not stored, so the draft belongs to a saved copy of it.
		await s.copyDemo();
		s.ui.playing = false;
		s.ui.anim = 'cross-punch';
		const p = s.store.project,
			hat = p.manifest.items.find((i: { id: string }) => i.id === 'hat_wizard'),
			frames = hat.layers[0].cells,
			planned = (anim: string, dir: string) =>
				Array.from(
					{ length: p.manifest.rig.animations.find((a: { id: string }) => a.id === anim).cells },
					(_, i) => `${anim}/${dir}/${i}`
				);
		const cell = (key: string, call: number) => {
			const [anim, dir, i] = key.split('/'),
				// The demo hat has no cross-punch frames, so its walk frames stand in for them.
				layer = p.images.get(frames[anim]?.[dir]?.[+i] ?? frames.walk.south[+i]),
				mask = new Uint8Array(layer.w * layer.h);
			for (let px = 0; px < mask.length; px++) mask[px] = layer.data[px * 4 + 3] ? 1 : 0;
			return {
				key,
				call,
				base: layer,
				input: layer,
				out: layer,
				layer,
				mask,
				area: mask.reduce((n: number, v: number) => n + v, 0)
			};
		};
		const calls = [
			{
				cells: [...planned('walk', 'south'), ...planned('walk', 'east')],
				recId: 'keep-available-walk'
			},
			{ cells: planned('cross-punch', 'south').slice(0, 3), recId: 'keep-available-punch-start' },
			{ cells: planned('cross-punch', 'south').slice(3), recId: 'keep-available-punch-end' }
		].map((call) => ({ kind: 'pose', seed: 1, rerolls: 0, old: [], ...call }));
		const preview = {
			...structuredClone(hat),
			id: 'available_hat',
			name: 'Available hat',
			status: 'draft'
		};
		preview.layers[0].cells['cross-punch'] = {
			south: planned('cross-punch', 'south').map((_, i) => (i < 3 ? frames.walk.south[i] : null))
		};
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: 'available_hat',
					name: 'Available hat',
					slot: 'head',
					prompt: 'a hat',
					key: 'magenta',
					anims: ['walk', 'cross-punch'],
					dirs: ['south', 'east'],
					// The demo's cross-punch has only a south view.
					clipDirs: { walk: ['south', 'east'], 'cross-punch': ['south'] }
				},
				calls,
				keySwitched: false,
				log: []
			},
			input: { name: 'Available hat', slot: 'head', prompt: 'a hat' },
			phase: 'review',
			status: 'Review',
			requestText: s.REQUEST_TEXT
		});
		s.store.results = {
			...s.store.results,
			available_hat: {
				cells: calls.slice(0, 2).flatMap((call, k) => call.cells.map((key) => cell(key, k))),
				qa: {
					qa: {
						status: 'pass',
						minKeyKept: 1,
						maxKeyOutside: 0,
						minAreaRatio: 1,
						maxAreaCV: 0,
						maxPaletteDist: 0,
						clipPx: 0,
						rerolls: 0,
						cells: {},
						clips: {}
					},
					warnings: [],
					failCalls: new Map(),
					softCalls: new Set()
				},
				g1: new Map(),
				preview: {
					manifest: { ...p.manifest, items: [...p.manifest.items, preview] },
					images: p.images
				}
			}
		};
		s.ui.selected = 'gen:available_hat';
	});
	await reviewSelectedDraft(page);
	const review = page.locator('.gen'),
		paid = review.getByRole('region', { name: 'Paid results', exact: true }),
		keepAvailable = paid.getByRole('button', { name: 'Keep available frames · Free', exact: true });
	// The free keep is offered beside the priced re-roll, and names the view it leaves missing.
	await expect(keepAvailable).toBeVisible();
	await expect(paid.getByRole('button', { name: /^Re-roll failed calls · ~\d/ })).toBeVisible();
	await expect(paid).toContainText(
		/Saves every frame that came back\. Missing: Cross.punch South \(3 of 6 frames\)\./i
	);
	await expect(review.getByRole('button', { name: 'Keep it', exact: true })).toBeDisabled();
	// An unreadable paid review hides its choices behind a free Try again, which recovers once the character reads again.
	const original = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(/* @vite-ignore */ statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ dbPath);
		const record = await db.get('projects', s.doc.id);
		await db.put('projects', s.doc.id, {
			...record,
			manifest: { ...record.manifest, format: -1 }
		});
		s.store.results = { ...s.store.results, available_hat: { ...s.store.results.available_hat } };
		return record;
	});
	await expect(
		review.getByText(
			'Your paid results could not be read, so the ways to reuse them are hidden. Nothing was lost.',
			{ exact: true }
		)
	).toBeVisible();
	await expect(paid).toHaveCount(0);
	const tryAgain = review.getByRole('button', { name: 'Try again', exact: true });
	await page.evaluate(async (record) => {
		const path = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ path);
		await db.put('projects', record.id, record);
	}, original);
	await tryAgain.click();
	await expect(keepAvailable).toBeVisible();
	await expect(tryAgain).toHaveCount(0);
	await keepAvailable.click();
	await expect(page.getByText('Available hat added', { exact: true })).toBeVisible();
	await expect(review).toHaveCount(0);
	const saved = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(/* @vite-ignore */ statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ dbPath);
		const item = (await db.get('projects', s.doc.id)).manifest.items.find(
			(i: { id: string }) => i.id === 'available_hat'
		);
		const views = (anim: string) =>
			Object.fromEntries(
				Object.entries(item.layers[0].cells[anim] ?? {}).map(([dir, cells]) => [
					dir,
					(cells as (string | null)[]).filter(Boolean).length
				])
			);
		return { status: item.qa.status, walk: views('walk'), punch: views('cross-punch') };
	});
	expect(saved).toEqual({
		status: 'accepted',
		walk: { south: 8, east: 8 },
		punch: { south: 3 }
	});
	// The saved item lists the view it still lacks among its missing frames.
	const details = await selectedItemDetails(page);
	await expect(details.locator('dl', { hasText: 'Missing frames' })).toContainText(
		/Missing frames.*cross-punch\/south/
	);
	expect(requests.filter((method) => method === 'POST')).toEqual([]);
});

test('a stopped character creation whose paid review cannot be read offers a free Try again that recovers it', async ({
	page,
	context
}, info) => {
	const api = new CharacterApi();
	await context.route('https://*.pixellab.ai/**', async (route) => {
		const req = route.request(),
			body = req.postDataJSON();
		// The registration answers without a character, so the paid drawing stops the creation at its review.
		const response =
			new URL(req.url()).pathname === '/v2/create-character-v3' && body?.reference_image
				? (api.calls.push({ method: req.method(), path: '/v2/create-character-v3', body }),
					Response.json({ usage: { type: 'generations', generations: 0.25 } }))
				: await api.handle(req.method(), req.url(), body);
		await route.fulfill({
			status: response.status,
			headers: Object.fromEntries(response.headers),
			body: Buffer.from(await response.arrayBuffer())
		});
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.locator('.project-btn').click();
	await page
		.locator('#project-menu')
		.getByRole('button', { name: 'New character', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Create from scratch...', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'New character', exact: true });
	await sheet.getByRole('textbox', { name: 'Details', exact: true }).fill('A plain human');
	await sheet.getByRole('button', { name: 'Side-scroller 2', exact: true }).click();
	await sheet.getByRole('button', { name: 'Create character', exact: true }).click();
	await page
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('offline-fixture-not-a-real-key');
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Connect', exact: true })
		.click();
	const paid = sheet.getByRole('region', { name: 'Paid results', exact: true });
	await expect(paid.getByRole('button', { name: /^Register the drawn views again/ })).toBeVisible({
		timeout: 60_000
	});
	const posts = () => api.calls.filter((call) => call.method === 'POST').length,
		posted = posts();
	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);
	// The paid drawing's saved views go missing, so the review cannot be read.
	const removed = await page.evaluate(async () => {
		const path = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ path);
		const records = await db.all('jobs'),
			shas: string[] = records
				.filter((r: { endpoint: string }) => r.endpoint === '/create-character-v3')
				.flatMap((r: { jobs: { results?: { sha: string }[] }[] }) =>
					r.jobs.flatMap((job) => job.results ?? []).map((result) => result.sha)
				);
		const blobs: [string, Blob][] = [];
		for (const sha of shas) {
			const blob = await db.getBlob(sha);
			if (!blob) continue;
			blobs.push([sha, blob]);
			await db.del('blobs', sha);
		}
		(window as unknown as { removedViews: [string, Blob][] }).removedViews = blobs;
		return blobs.length;
	});
	expect(removed).toBeGreaterThan(0);
	const reopen = () =>
		page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				s = await import(/* @vite-ignore */ path);
			s.reviewFailedCreate(s.creates.find((run: { error?: unknown }) => run.error).id);
		});
	await reopen();
	await expect(
		sheet.getByText(
			'Your paid results could not be read, so the ways to reuse them are hidden. Nothing was lost.',
			{ exact: true }
		)
	).toBeVisible();
	await expect(paid).toHaveCount(0);
	const tryAgain = sheet.getByRole('button', { name: 'Try again', exact: true });
	await expect(tryAgain).toBeVisible();
	// Once the views can be read again, the free Try again brings back every way on without a request.
	await page.evaluate(async () => {
		const path = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ path);
		for (const [sha, blob] of (window as unknown as { removedViews: [string, Blob][] })
			.removedViews)
			await db.put('blobs', sha, blob);
	});
	await tryAgain.click();
	await expect(paid.getByRole('button', { name: /^Register the drawn views again/ })).toBeVisible();
	await expect(tryAgain).toHaveCount(0);
	expect(posts()).toBe(posted);
});

test('long item and outfit names leave wardrobe controls inside the desktop sidebar', async ({
	page,
	context
}, info) => {
	await context.route('https://api.pixellab.ai/**', (r) => r.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.setViewportSize({ width: 1280, height: 720 });
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const name =
		'Polished copper clockwork adventurer ceremonial full helmet with a very long descriptive name';
	await page.evaluate((name) => {
		const s = (
			window as unknown as { __studio: { ui: { playing: boolean }; store: { project: any } } }
		).__studio;
		s.ui.playing = false;
		const p = s.store.project,
			head = p.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		s.store.project = {
			...p,
			manifest: {
				...p.manifest,
				items: p.manifest.items.map((i: { id: string }) => (i.id === head.id ? { ...i, name } : i)),
				presets: p.manifest.presets.map((v: object, n: number) => (n === 0 ? { ...v, name } : v))
			}
		};
	}, name);
	const wear = page.locator('.equipment-scroll').getByRole('button', { name, exact: true });
	await expect(wear).toBeVisible();
	await expect(wear).toHaveAttribute('aria-pressed', 'true');
	const dimensions = await page.locator('.equipment-rail').evaluate((side) => {
		const box = side.getBoundingClientRect();
		// The outer rail permits the documented 8px focus/swatch paint overflow.
		const overflows = [
			side,
			...side.querySelectorAll('.equipment-scroll, .slot-tiles, .item-tile, .tile-name')
		]
			// Tile labels truncate with a visible ellipsis by design; nothing else may overflow.
			.filter(
				(n) =>
					n.scrollWidth > n.clientWidth + (n === side ? 8 : 1) &&
					getComputedStyle(n).textOverflow !== 'ellipsis'
			)
			.map((n) => n.className);
		const controls = [...side.querySelectorAll('.item-tile, .tile-more')].map((n) => {
			const r = n.getBoundingClientRect();
			return { left: r.left, right: r.right, width: r.width };
		});
		return { left: box.left, right: box.right, overflows, controls };
	});
	expect(dimensions.overflows).toEqual([]);
	for (const c of dimensions.controls) {
		expect(c.left).toBeGreaterThanOrEqual(dimensions.left);
		expect(c.right).toBeLessThanOrEqual(dimensions.right);
		expect(c.width).toBeGreaterThanOrEqual(24);
	}
	await page
		.locator('.equipment-scroll')
		.getByRole('button', { name: 'Empty head', exact: true })
		.click();
	await expect(wear).toHaveAttribute('aria-pressed', 'false');
	await equipmentMode(page, 'Outfits');
	const saved = page.locator('.outfits .row').filter({ hasText: name });
	await expect(saved).toBeVisible();
	const outfitDimensions = await page.locator('.equipment-rail').evaluate((el) => ({
		width: el.clientWidth,
		scroll: el.scrollWidth,
		rows: [...el.querySelectorAll('.outfits .row')].map((row) => ({
			width: row.clientWidth,
			scroll: row.scrollWidth
		}))
	}));
	expect(outfitDimensions.scroll).toBeLessThanOrEqual(outfitDimensions.width + 8);
	for (const row of outfitDimensions.rows) expect(row.scroll).toBeLessThanOrEqual(row.width + 1);
});

test('interrupted character specifications retain their own estimates', async ({
	page,
	context
}, info) => {
	const calls: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		calls.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/formDrafts.ts',
			{ formDrafts } = await import(path);
		const configPath = '/src/studio/characterConfig.ts',
			{ newCharacterDraft, setPreset } = await import(configPath);
		// Form drafts are memory-only. A valid current form must not change a persisted older request.
		formDrafts.character = newCharacterDraft();
		setPreset(formDrafts.character, 'unique');
		const pathToState = '/src/studio/state.svelte.ts';
		const s = (await import(pathToState)) as typeof import('../../src/studio/state.svelte.ts');
		// A stored interrupted run keeps its own direction plan and size; the new form's defaults must not alter its pricing.
		const spec = {
			description: 'Interrupted run',
			name: 'Interrupted run',
			seed: 123,
			size: 48,
			directions: (['south', 'east', 'north', 'west'] as const).map((id) => ({ id }))
		};
		s.creates.push({
			id: 'rig-cost-fixture',
			spec,
			error: 'Stored interruption',
			running: false,
			projectId: '',
			progress: null,
			views: []
		});
		s.reviewFailedCreate('rig-cost-fixture');
	});
	const create = page.getByRole('dialog', { name: 'New character', exact: true });
	// Creation is priced by the draw (body size) plus a standing-joint fallback per direction; it makes no animation.
	await expect(create.getByRole('button', { name: /^Generate again/ })).toContainText('2–5 gens');
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		const s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
		s.creates[0].spec.directions = (
			[
				'south',
				'south-east',
				'east',
				'north-east',
				'north',
				'north-west',
				'west',
				'south-west'
			] as const
		).map((id) => ({ id }));
	});
	await expect(create.getByRole('button', { name: /^Generate again/ })).toContainText('2–5 gens');
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		const s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
		s.creates[0].spec.size = 128; // the stored run, not the 64 px form draft, sets the price
	});
	await expect(create.getByRole('button', { name: /^Generate again/ })).toContainText('3–5 gens');
	expect(calls).toEqual([]);
});

test('character retry preserves the direction plan and allocates a fresh publication identity', async ({
	page,
	context
}, info) => {
	const unexpected: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		if (
			route.request().method() === 'GET' &&
			new URL(route.request().url()).pathname.endsWith('/balance')
		)
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		else {
			unexpected.push(route.request().method());
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		const s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
		await s.loadGens();
		const put = IDBObjectStore.prototype.put;
		(window as unknown as { originalCreatePut: IDBObjectStore['put'] }).originalCreatePut = put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-create:prior-attempt-identity')
				throw new Error('Synthetic draft persistence stopped before any paid request');
			return put.call(this, value, key);
		};
		const spec = {
			projectId: 'prior-attempt-identity',
			description: 'Retry body',
			name: 'Retry fixture',
			size: 48,
			directions: (['south', 'east', 'north', 'west'] as const).map((id) => ({ id })),
			seed: 0
		};
		s.creates.push({
			id: 'prior-attempt-identity',
			spec,
			error: 'Prior interrupted attempt',
			running: false,
			projectId: '',
			progress: null,
			views: []
		});
		s.reviewFailedCreate('prior-attempt-identity');
	});
	try {
		await page
			.getByRole('dialog', { name: 'New character', exact: true })
			.getByRole('button', { name: /^Generate again/ })
			.click();
		const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
		await connect
			.getByLabel('Paste your Secret API key', { exact: true })
			.fill('synthetic-retry-test-key');
		await connect.getByRole('button', { name: 'Connect', exact: true }).click();
		await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toBeVisible();
		await expect(page.getByRole('dialog', { name: 'New character', exact: true })).toContainText(
			'Synthetic draft persistence stopped before any paid request'
		);
		const retry = await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts';
			const s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
			const { spec } = s.creates[0];
			return {
				projectId: spec.projectId,
				seed: spec.seed,
				directions: spec.directions
			};
		});
		expect(retry.projectId).toBeTruthy();
		expect(retry.projectId).not.toBe('prior-attempt-identity');
		expect(retry.seed).not.toBe(0);
		expect(retry.directions).toEqual([
			{ id: 'south' },
			{ id: 'east' },
			{ id: 'north' },
			{ id: 'west' }
		]);
		expect(unexpected).toEqual([]);
	} finally {
		await page.evaluate(() => {
			const w = window as unknown as { originalCreatePut: IDBObjectStore['put'] };
			IDBObjectStore.prototype.put = w.originalCreatePut;
		});
	}
});

test('Activity distinguishes unknown progress and credits while item guidance keeps the tab open', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request();
		if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/balance')) {
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 0, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		} else {
			if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const w = window as unknown as {
			__studio: {
				ui: { selected: string };
				doc: { id: string };
				store: { project: any };
				gens: any[];
				loadGens: () => Promise<void>;
			};
			__queue: {
				disconnect: () => void;
				key: string;
				paused: string | null;
				recs: Map<string, any>;
				emit: () => void;
			};
		};
		const s = w.__studio,
			q = w.__queue;
		await s.loadGens();
		// Render deferred/synchronous states without letting the queue send or poll anything.
		q.disconnect();
		q.recs.clear();
		q.key = 'synthetic-key';
		q.paused = null;
		const common = {
			method: 'POST',
			params: {},
			inputs: [],
			state: 'submitting',
			createdAt: Date.now(),
			submittedAt: Date.now() - 125000,
			nextAt: 0,
			attempts: 1,
			gens: 0,
			usd: 0
		};
		q.recs.set('sync-estimate', {
			...common,
			id: 'sync-estimate',
			label: 'Finding joints fixture',
			endpoint: '/estimate-skeleton',
			requestHash: 'sync-estimate',
			jobs: []
		});
		q.recs.set('awaiting-id', {
			...common,
			id: 'awaiting-id',
			label: 'Submitting fixture',
			endpoint: '/edit-animation-v2',
			requestHash: 'awaiting-id',
			jobs: []
		});
		q.recs.set('known-progress', {
			...common,
			id: 'known-progress',
			label: 'Reported progress fixture',
			endpoint: '/edit-animation-v2',
			requestHash: 'known-progress',
			state: 'running',
			jobs: [
				{
					id: 'known-job',
					status: 'running',
					done: false,
					progress: 0.37,
					queuePosition: 4,
					results: []
				}
			]
		});
		q.emit();
		const it = s.store.project.manifest.items.find((i: { slot: string }) => i.slot === 'head');
		s.gens.push({
			draft: {
				rigId: s.doc.id,
				spec: {
					id: it.id,
					name: 'Waiting fixture',
					slot: it.slot,
					prompt: 'hat',
					key: 'magenta',
					anims: ['walk'],
					dirs: ['south', 'east', 'north']
				},
				calls: [],
				keySwitched: false,
				log: []
			},
			input: { name: 'Waiting fixture', slot: it.slot, prompt: 'hat' },
			phase: 'running',
			status: 'Starting'
		});
		s.ui.selected = 'gen:' + it.id;
	});
	await expect(page.locator('.gen')).toHaveCount(0);
	await page.getByRole('button', { name: 'More options for Waiting fixture', exact: true }).click();
	const menu = page.locator('#item-menu');
	await expect(menu).toContainText(/Keep this tab open|Waiting for your PixelLab key/);
	await expect(menu).not.toContainText('picks up where it left off');
	await menu.getByRole('menuitem', { name: 'Activity...', exact: true }).click();
	const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
	await expect(activity.locator('#activity-submitting-stop')).toHaveText(
		'Stop is unavailable until PixelLab responds.'
	);
	await expect(activity.locator('#activity-submitting-stop')).toBeVisible();
	for (const label of ['Finding joints fixture', 'Submitting fixture']) {
		const row = activity
			.locator('.act-group li')
			.filter({ has: page.getByText(label, { exact: true }) });
		await expect(row.locator('.act-main .small')).toHaveText('Waiting for PixelLab');
		await expect(row.locator('.ring')).toHaveClass(/spin/);
		await expect(row.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
		await expect(row.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
		await expect(row.getByRole('button', { name: 'Stop', exact: true })).toHaveAttribute(
			'aria-describedby',
			'activity-submitting-stop'
		);
		await expect(
			row.getByRole('button', { name: 'Stop', exact: true })
		).toHaveAccessibleDescription('Stop is unavailable until PixelLab responds.');
		await expect(row.locator('.act-meta')).toContainText(/\d+:\d{2}/);
	}
	const known = activity
		.locator('.act-group li')
		.filter({ has: page.getByText('Reported progress fixture', { exact: true }) });
	await expect(known.locator('.act-main .small')).toHaveText('37% · #4 in line');
	await expect(known.locator('.ring')).not.toHaveClass(/spin/);
	await expect(known.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
	await page.evaluate(() => {
		const q = (window as unknown as { __queue: { paused: string | null; emit: () => void } })
			.__queue;
		q.paused = 'credits';
		q.emit();
	});
	await expect(activity).toContainText(
		'PixelLab credits are insufficient. Jobs wait until credits are available.'
	);
	await expect(activity).not.toContainText('Out of generations');
	await expect(activity.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
	await page.evaluate(() => {
		const q = (window as unknown as { __queue: { paused: string | null; emit: () => void } })
			.__queue;
		q.paused = 'offline';
		q.emit();
	});
	await expect(activity).toContainText(
		'You’re offline. Queued work waits; submitted jobs may finish. Reconnect to resume known jobs.'
	);
	await activity.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'More options for Waiting fixture', exact: true }).click();
	await expect(menu).toContainText(/Paused while you are offline|Waiting for your PixelLab key/);
	expect(posts).toEqual([]);
});

test('generation tiles keep fixed geometry across progress and terminal states', async ({
	page
}, info) => {
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath),
			queuePath = '/src/lib/pixellab/queue.ts',
			{ queue } = await import(queuePath),
			projectPath = '/src/lib/store/project.ts',
			project = await import(projectPath),
			routePath = '/src/studio/itemRoute.ts',
			{ itemRoute } = await import(routePath);
		queue.disconnect();
		const base = state.store.project.manifest.items.find(
			(item: { slot: string }) => item.slot === 'body'
		);
		state.store.project = {
			...state.store.project,
			manifest: {
				...state.store.project.manifest,
				items: [
					...state.store.project.manifest.items,
					...Array.from({ length: 4 }, (_, index) => ({
						...base,
						id: 'layout-hair-' + index,
						slot: 'hair',
						name: 'Saved hair ' + index
					}))
				]
			}
		};
		const input = {
				name: 'PonytailWithAnExtremelyLongUnbrokenRibbonTitle',
				slot: 'hair',
				prompt: 'a ponytail'
			},
			draft = await itemRoute.draft(await project.loadProject(state.doc.id), input, []);
		draft.calls[0].recId = 'geometry-fixture';
		state.gens.push({
			draft,
			input,
			phase: 'running',
			status: 'Designing',
			requestText: state.REQUEST_TEXT
		});
		queue.key = 'synthetic-layout-key';
		queue.recs.set('geometry-fixture', {
			id: 'geometry-fixture',
			state: 'running',
			submittedAt: Date.now(),
			jobs: [{ id: 'remote', progress: 0, results: [] }],
			label: 'Ponytail',
			params: {},
			inputs: [],
			createdAt: Date.now(),
			method: 'POST',
			endpoint: '/edit-animation-v2',
			gens: 0,
			usd: 0,
			attempts: 1
		});
		queue.emit();
	});
	const tile = page.locator('[data-tile^="gen:"]');
	for (const theme of ['dark', 'light']) {
		for (const [width, height] of [
			[320, 568],
			[844, 390],
			[1440, 900]
		]) {
			await page.setViewportSize({ width, height });
			await equipmentGroup(page, 'Hair');
			for (const variant of [
				'zero',
				'progress',
				'complete',
				'queued',
				'paused',
				'overrun',
				'failed',
				'review',
				'canceled',
				'save'
			]) {
				await page.evaluate(
					async ({ variant, theme }) => {
						const statePath = '/src/studio/state.svelte.ts',
							state = await import(statePath),
							queuePath = '/src/lib/pixellab/queue.ts',
							{ queue } = await import(queuePath),
							generation = state.gens[0],
							rec = queue.recs.get('geometry-fixture')!;
						state.ui.theme = theme;
						state.applyTheme();
						generation.phase =
							variant === 'review'
								? 'review'
								: ['failed', 'canceled', 'save'].includes(variant)
									? 'failed'
									: 'running';
						generation.canceled = variant === 'canceled' || variant === 'save';
						generation.cancelSaveFailed = variant === 'save';
						generation.error = variant === 'failed' ? 'Synthetic failure' : undefined;
						queue.paused = variant === 'paused' ? 'offline' : null;
						rec.state =
							variant === 'queued' ? 'queued' : variant === 'complete' ? 'done' : 'running';
						rec.submittedAt =
							variant === 'queued'
								? undefined
								: Date.now() - (variant === 'overrun' ? 3_600_000 : 0);
						rec.jobs[0].progress = variant === 'zero' ? 0 : variant === 'complete' ? 1 : 0.16;
						queue.emit();
					},
					{ variant, theme }
				);
				const expectedStatus: Record<string, string | RegExp> = {
					zero: /~[1-9]min left/,
					progress: /~[1-9]min left/,
					complete: 'Checking frames',
					queued: 'Queued',
					paused: 'Paused',
					overrun: 'Taking longer',
					failed: 'Failed',
					review: 'Review',
					canceled: 'Canceled',
					save: 'Save cancellation'
				};
				await expect(tile.locator('.generation-time')).toHaveText(expectedStatus[variant]);
				await expect(tile.locator('.generation-ring')).toHaveCount(
					['failed', 'review', 'canceled', 'save'].includes(variant) ? 0 : 1
				);
				await expect(tile.locator('.generation-percent')).toHaveCount(
					['failed', 'review', 'canceled', 'save'].includes(variant) ? 0 : 1
				);
				await expect(page.locator('[data-tile^="layout-hair-"]')).toHaveCount(4);
				await expectGenerationTileGeometry(
					tile,
					!['failed', 'review', 'canceled', 'save'].includes(variant)
				);
			}
		}
	}
});

test('item tile cancellation confirms cost, retries failed saves and stays canceled after reload', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		if (request.method() !== 'GET') requests.push(request.method() + ' ' + path);
		if (request.method() === 'POST')
			return route.fulfill({ status: 202, json: { background_job_id: 'cancel-item-fixture' } });
		if (path === '/v2/background-jobs/cancel-item-fixture')
			return route.fulfill({
				json: { id: 'cancel-item-fixture', status: 'processing', last_response: { progress: 0.42 } }
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-cancel-item-key');
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.startItem({ name: 'Ponytail', slot: 'hair', prompt: 'a ponytail' });
	});
	await equipmentGroup(page, 'Hair');
	const tile = page.locator('[data-tile^="gen:"]');
	await expect(page.getByRole('progressbar', { name: /progress/ })).toHaveAttribute(
		'aria-valuenow',
		'42'
	);
	await expect(tile).toContainText(/~[1-9]min left/);
	await expect(tile).toContainText('Ponytail');
	await expect(page.locator('.gen')).toHaveCount(0);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		state.gens[0].input.name = 'Ponytail with a long ribbon';
	});
	for (const theme of ['dark', 'light']) {
		await page.evaluate(async (theme) => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			state.ui.theme = theme;
			state.applyTheme();
		}, theme);
		for (const [width, height] of [
			[320, 568],
			[844, 390],
			[1440, 900]
		]) {
			await page.setViewportSize({ width, height });
			await equipmentGroup(page, 'Hair');
			await tile.scrollIntoViewIfNeeded();
			await expectGenerationTileGeometry(tile);
			await page.screenshot({
				path: info.outputPath('generation-' + theme + '-' + width + '.png')
			});
		}
	}
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		state.gens[0].input.name = 'Ponytail';
	});
	await tile.focus();
	await page.keyboard.press('Shift+F10');
	const menu = page.locator('#item-menu');
	await menu.getByRole('menuitem', { name: 'Cancel generation...', exact: true }).click();
	const cancelAlert = page.getByRole('alertdialog', { name: 'Cancel Ponytail?' });
	await expect(menu).not.toBeVisible();
	await expect(cancelAlert.getByRole('button', { name: 'Keep', exact: true })).toBeFocused();
	await expect(cancelAlert).toContainText('Generations already used are not refunded');
	await page.keyboard.press('Escape');
	await expect(cancelAlert).toHaveCount(0);
	const more = page.getByRole('button', { name: 'More options for Ponytail', exact: true });
	await expect(more).toBeFocused();
	await more.click();
	await menu.getByRole('menuitem', { name: 'Cancel generation...', exact: true }).click();
	await cancelAlert.getByRole('button', { name: 'Keep', exact: true }).click();
	await expect(cancelAlert).toHaveCount(0);
	await expect(tile).toContainText('42%');
	await more.click();
	await menu.getByRole('menuitem', { name: 'Cancel generation...', exact: true }).click();
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		(window as unknown as { restoreItemPut: () => void }).restoreItemPut = () =>
			(IDBObjectStore.prototype.put = put);
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-drafts') throw new Error('Synthetic cancellation save failure');
			return put.call(this, value, key);
		};
	});
	await cancelAlert.getByRole('button', { name: 'Cancel item', exact: true }).click();
	// A failed save stays in the alert; after closing it, the menu offers to save the cancellation again.
	await expect(cancelAlert.getByRole('alert')).toContainText('Synthetic cancellation save failure');
	await cancelAlert.getByRole('button', { name: 'Keep', exact: true }).click();
	await expect(more).toBeFocused();
	await more.click();
	await expect(
		menu.getByRole('menuitem', { name: 'Save cancellation', exact: true })
	).toBeVisible();
	await page.evaluate(() => (window as unknown as { restoreItemPut: () => void }).restoreItemPut());
	await menu.getByRole('menuitem', { name: 'Save cancellation', exact: true }).click();
	await expect(menu).not.toBeVisible();
	await expect(more).toBeFocused();
	await reloadStudio(page);
	await equipmentGroup(page, 'Hair');
	await expect(page.locator('[data-tile^="gen:"]')).toHaveAttribute(
		'aria-label',
		'Ponytail, Canceled'
	);
	await page.getByRole('button', { name: 'More options for Ponytail', exact: true }).click();
	await menu.getByRole('menuitem', { name: 'Review item...', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Item review', exact: true })).toBeVisible();
	await page.locator('.gen').getByRole('button', { name: 'Discard', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts';
			return (await import(path)).ui.sheet;
		})
	).toBeNull();
	expect(requests).toEqual(['POST /v2/edit-animation-v2']);
});

test('cancel during the initial item save never starts a paid runner', async ({ page }, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	const result = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		const put = IDBObjectStore.prototype.put;
		let cancellation: Promise<boolean> | undefined,
			first = true;
		IDBObjectStore.prototype.put = function (value, key) {
			const request = put.call(this, value, key);
			if (key === 'studio-drafts' && first) {
				first = false;
				cancellation = state.cancelGen(state.gens[0]);
			}
			return request;
		};
		try {
			await state.startItem({ name: 'Early cancellation', slot: 'hair', prompt: 'short hair' });
			await cancellation;
			return {
				phase: state.gens[0].phase,
				canceled: state.gens[0].canceled,
				calls: state.gens[0].draft.calls.map((call: { recId?: string }) => call.recId)
			};
		} finally {
			IDBObjectStore.prototype.put = put;
		}
	});
	expect(result).toMatchObject({ phase: 'failed', canceled: true });
	expect(result.calls.every((id: string | undefined) => id === undefined)).toBe(true);
});

test('an accepted item failure shows the reported charge and saved job without a paid retry', async ({
	page,
	context
}, info) => {
	await page.addInitScript(() => localStorage.setItem('pixeldoll.developerMode', '1'));
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (request.method() === 'POST') posts.push(path);
		if (path === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		if (path === '/v2/edit-animation-v2')
			return route.fulfill({ status: 202, json: { background_job_id: 'offline-dress-failure' } });
		if (path === '/v2/background-jobs/offline-dress-failure')
			return route.fulfill({
				json: {
					id: 'offline-dress-failure',
					status: 'failed',
					usage: { type: 'usd', usd: 0 },
					last_response: { code: 3006, error: 'Generation failed' }
				}
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-dress-failure-key');
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	const id = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.startItem({ name: 'Trouser fixture', slot: 'legs', prompt: 'tactical pants' });
		return state.gens[0].draft.spec.id;
	});
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const path = '/src/lib/store/db.ts',
					db = await import(path);
				return (await db.get('projects', 'studio-drafts'))?.gens[0]?.phase;
			})
		)
		.toBe('failed');
	await reloadStudio(page);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openGenerationReview(id);
	}, id);
	const review = page.locator('.gen');
	await expect(review).toContainText('PixelLab accepted the request but could not finish it.');
	await expect(review).toContainText('PixelLab reported no charge for this attempt.');
	await expect(review).toContainText('Generate again starts a new paid attempt.');
	await page
		.getByRole('dialog', { name: 'Item review', exact: true })
		.locator('.sheet-head')
		.getByRole('button', { name: 'Inspect API calls', exact: true })
		.click();
	const savedCall = page.locator('[aria-label="API calls"]:popover-open .peek-call');
	await savedCall.locator(':scope > summary').click();
	await expect(
		savedCall.getByText(
			'Job offline-dress-failure failed: Generation failed (PixelLab code 3006)',
			{
				exact: true
			}
		)
	).toBeVisible();
	await page.keyboard.press('Escape');
	await review.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Item review', exact: true })).toBeHidden();
	expect(posts).toEqual(['/v2/edit-animation-v2']);
});

test('new item progress, previews and completion survive reload without submitting completed jobs again', async ({
	page,
	context
}, info) => {
	let completed = false;
	const posts: string[] = [],
		errors: string[] = [];
	let images: { type: string; base64: string }[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		if (request.method() === 'POST') {
			posts.push(path);
			if (path === '/v2/edit-animation-v2') {
				images = request.postDataJSON().frames.map((frame: { image: { base64: string } }) => ({
					type: 'base64',
					base64: frame.image.base64
				}));
				return route.fulfill({ status: 202, json: { background_job_id: 'offline-item-progress' } });
			}
		}
		if (path === '/v2/background-jobs/offline-item-progress')
			return route.fulfill({
				json: {
					id: 'offline-item-progress',
					status: completed ? 'completed' : 'processing',
					created_at: '',
					usage: { type: 'generations', generations: 1 },
					last_response: completed ? { images } : { progress: 0.5 }
				}
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-item-progress-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await standingItemCharacter(page);
	const id = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id);
		if (rec.manifest.slots.some((slot: { id: string }) => slot.id === 'legs'))
			throw new Error('Expected Legs to be absent from the saved character');
		await s.startItem({ name: 'Progress fixture', slot: 'legs', prompt: 'tactical pants' });
		return s.gens[0].draft.spec.id;
	});
	await equipmentGroup(page, 'Legs');
	await expect(page.locator('.gen')).toHaveCount(0);
	const progress = page.getByRole('progressbar', {
		name: 'Progress fixture progress',
		exact: true
	});
	await expect(progress).toHaveAttribute('aria-valuenow', '50');
	const saved = () =>
		page.evaluate(async () => {
			const p = '/src/lib/store/db.ts',
				db = await import(p);
			return (await db.get('projects', 'studio-drafts')).gens[0];
		});
	const pending = await saved();
	expect(pending.draft.calls).toHaveLength(1);
	expect(pending.draft.calls[0].recId).toBeTruthy();
	await reloadStudio(page);
	await expect.poll(saved).toMatchObject({
		phase: 'running',
		draft: { calls: [{ recId: pending.draft.calls[0].recId }] }
	});
	completed = true;
	// The queue polls a running job every POLL_MS (5 s, src/lib/pixellab/queue.ts), so completion lands about one interval
	// later (measured 4.9-5.0 s): CI's default 5 s expect timeout failed this whenever the poll or extraction ran late.
	await expect.poll(saved, { timeout: 15_000 }).toMatchObject({ phase: 'review' });
	await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		await s.openGenerationReview(id);
	}, id);
	const gen = page.locator('.gen');
	await expect(gen).toContainText('Needs a look'); // Returning the unchanged mannequin deliberately fails item QA.
	await expect(gen.getByRole('progressbar')).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(async (id) => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				return !!s.store.results[id]?.preview;
			}, id)
		)
		.toBe(true);
	const slotOrder = await page.evaluate(async (id) => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		state.wearDraft(id);
		const ids = (slots: { id: string }[]) => slots.map((slot) => slot.id);
		return {
			stage: ids(state.view.project.manifest.slots),
			preview: ids(state.store.results[id].preview.manifest.slots),
			saved: ids((await db.get('projects', state.doc.id)).manifest.slots)
		};
	}, id);
	expect(slotOrder.saved).not.toContain('legs');
	const expectedOrder = [...slotOrder.saved];
	const torso = expectedOrder.indexOf('torso_inner');
	expect(torso).toBeGreaterThanOrEqual(0);
	expectedOrder.splice(torso, 0, 'legs');
	expect(slotOrder.preview).toEqual(expectedOrder);
	expect(slotOrder.stage).toEqual(slotOrder.preview);
	// Reproduce an older stuck draft whose runner never persisted its job reference.
	await page.evaluate(async () => {
		const p = '/src/lib/store/db.ts',
			db = await import(p);
		const record = await db.get('projects', 'studio-drafts'),
			g = record.gens[0];
		g.phase = 'running';
		g.status = 'Starting';
		delete g.draft.calls[0].recId;
		await db.put('projects', 'studio-drafts', record);
	});
	await reloadStudio(page);
	await expect.poll(saved).toMatchObject({
		phase: 'review',
		draft: { calls: [{ recId: pending.draft.calls[0].recId }] }
	});
	expect(posts).toEqual(['/v2/edit-animation-v2']);
	expect(errors).toEqual([]);
});

test('reload restores failed create, move and setup for review without paid submissions', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const r = route.request();
		if (r.method() === 'GET' && new URL(r.url()).pathname.endsWith('/balance'))
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { type: 'usd', usd: 1 }
				}
			});
		else {
			if (r.method() === 'POST') posts.push(new URL(r.url()).pathname);
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-failed-flow-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const s = (window as unknown as { __studio: { doc: { id: string }; store: { project: any } } })
			.__studio;
		const path = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ path);
		const common = {
			status: 'failed',
			error: 'Saved terminal failure; inspect Activity',
			progress: { step: 'animate', done: 4, total: 69, recIds: [] }
		};
		await db.put('projects', 'studio-create:rig-failed-browser-fixture', {
			...common,
			id: 'studio-create:rig-failed-browser-fixture',
			spec: {
				name: 'Failed character',
				description: 'body',
				size: 48,
				directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }],
				seed: 1,
				projectId: 'rig-failed-browser-fixture'
			}
		});
		await db.put('projects', 'studio-move', {
			...common,
			id: 'studio-move',
			projectId: s.doc.id,
			spec: { id: 'cast', action: 'cast', frames: 8, items: [], seed: 1 }
		});
		await db.put('projects', 'studio-setup', {
			...common,
			id: 'studio-setup',
			spec: {
				projectId: s.doc.id,
				baseHash: s.store.project.manifest.rig.baseHash,
				restAnim: 'idle',
				looks: 'body',
				seed: 1
			}
		});
	});
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const path = '/src/studio/state.svelte.ts',
					s = await import(/* @vite-ignore */ path);
				return [s.creates[0]?.error, s.moving.error, s.settingUp.error];
			})
		)
		.toEqual(Array(3).fill('Saved terminal failure; inspect Activity'));
	for (const [sheet, name] of [
		['create', 'New character'],
		['move', 'New move'],
		['setup', 'Set up character']
	] as const) {
		await page.evaluate(async (sheet) => {
			const path = '/src/studio/state.svelte.ts';
			const s = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
			if (sheet === 'create') s.reviewFailedCreate('rig-failed-browser-fixture');
			else s.ui.sheet = sheet;
		}, sheet);
		const dialog = page.getByRole('dialog', { name, exact: true });
		await expect(dialog).toContainText('Saved terminal failure; inspect Activity');
		await expect(dialog.locator('.steps-list .ring.spin')).toHaveCount(0);
		await page.keyboard.press('Escape');
	}
	const damaged = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(/* @vite-ignore */ statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ dbPath);
		const projectId = await state.copyDemo();
		const project = await db.get('projects', projectId);
		project.manifest.rig.rest = { south: { image: `sha256:${'f'.repeat(64)}` } };
		await db.put('projects', projectId, project);
		const setup = await db.get('projects', 'studio-setup');
		await db.put('projects', 'studio-setup', { ...setup, spec: { ...setup.spec, projectId } });
		return projectId as string;
	});
	await reloadStudio(page);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		const state = (await import(path)) as typeof import('../../src/studio/state.svelte.ts');
		state.ui.sheet = 'activity';
	});
	const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
	await activity.getByRole('button', { name: /Open Character setup/ }).click();
	await activity.getByRole('button', { name: 'Dismiss setup', exact: true }).click();
	await expect(activity.getByText(/Character setup ·/)).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(async (id) => {
				const path = '/src/lib/store/db.ts',
					db = await import(/* @vite-ignore */ path);
				return [!!(await db.get('projects', id)), !!(await db.get('projects', 'studio-setup'))];
			}, damaged)
		)
		.toEqual([true, false]);
	await page.evaluate(async () => {
		const path = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ path);
		const record = await db.get('projects', 'studio-move');
		await db.put('projects', 'studio-move', {
			...record,
			error: 'The review could not be saved. Use saved frames to recover it without another charge.'
		});
		localStorage.setItem('pixeldoll.locale', 'fr');
	});
	await page.reload();
	await page.locator('.customize-action').click();
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(() => {
		(window as unknown as { __studio: { ui: { sheet: string } } }).__studio.ui.sheet = 'move';
	});
	await expect(page.getByRole('dialog')).toContainText(
		'La vérification n’a pas pu être enregistrée. Utilisez les images enregistrées pour la récupérer sans frais supplémentaires.'
	);
	expect(posts).toEqual([]);
});

test('moves waiting behind another character’s failed move point to it', async ({ page }, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(/* @vite-ignore */ path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ dbPath);
		const failed = s.doc.id,
			rec = await db.get('projects', failed),
			waiting = 'rig-waiting-fixture';
		rec.manifest.name = 'Failed mover';
		await db.put('projects', failed, rec);
		await db.put('projects', waiting, {
			...rec,
			id: waiting,
			manifest: { ...rec.manifest, name: 'Waiting mover' }
		});
		await s.openProject(waiting);
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: failed,
			spec: { id: 'cast', action: 'cast', frames: 8, items: [], seed: 1 },
			status: 'failed',
			error: 'Cast stopped',
			requestText: s.REQUEST_TEXT,
			queued: [
				{ projectId: waiting, spec: { id: 'jump', action: 'jump', frames: 8, items: [], seed: 1 } }
			]
		});
	});
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: /^Jump Waiting for the failed move/ }).click();
	const sheet = page.getByRole('dialog', { name: 'New move', exact: true });
	await expect(sheet).toContainText(
		'Cast failed on Failed mover. New moves wait until you retry or discard it there, so its paid results stay recoverable. Open it for the options.'
	);
	await sheet.getByRole('button', { name: 'Open Failed mover', exact: true }).click();
	await expect(page.locator('.project-btn')).toContainText('Failed mover');
	// A paid retry discloses its estimate on the button itself, not only when saved frames exist.
	// The failed move's footer: Discard, New move, then the paid retry last.
	const cancel = sheet.getByRole('button', { name: 'Discard', exact: true });
	const startNew = sheet.getByRole('button', { name: 'New move…', exact: true });
	const retry = sheet.getByRole('button', { name: /^Generate again · ~[1-9]\d* gens$/ });
	for (const viewport of [page.viewportSize()!, { width: 320, height: 568 }]) {
		await page.setViewportSize(viewport);
		await expect(retry).toBeVisible();
		const cancelBox = (await cancel.boundingBox())!;
		const startNewBox = (await startNew.boundingBox())!;
		const retryBox = (await retry.boundingBox())!;
		const center = (box: { y: number; height: number }) => box.y + box.height / 2;
		expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(startNewBox.x);
		expect(startNewBox.x + startNewBox.width).toBeLessThanOrEqual(retryBox.x);
		expect(retryBox.x + retryBox.width).toBeLessThanOrEqual(viewport.width);
		expect(Math.abs(center(cancelBox) - center(startNewBox))).toBeLessThan(1);
		expect(Math.abs(center(cancelBox) - center(retryBox))).toBeLessThan(1);
	}
	await startNew.click();
	await expect(sheet.getByRole('textbox', { name: 'Describe the motion' })).toBeVisible();
	await expect(sheet.getByText('Cast stopped')).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Connect PixelLab' })).toHaveCount(0);
});

test('a move rig setup skipped is marked in the Moves list to make again', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(/* @vite-ignore */ path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ dbPath);
		const rec = await db.get('projects', s.doc.id),
			walk = rec.manifest.rig.animations.find((a: { id: string }) => a.id === 'walk');
		delete walk.sources;
		rec.rigQa = { ...rec.rigQa, redo: ['walk'] };
		await db.put('projects', s.doc.id, rec);
	});
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await expect(
		page.getByRole('button', {
			name: /^Walk .*Joints not found: redraw it to animate items on it/
		})
	).toBeVisible();
});

test('the priced rig setup preflight names a move it will skip for an empty frame', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		if (route.request().method() === 'POST') posts.push(new URL(route.request().url()).pathname);
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(/* @vite-ignore */ statePath),
			projectPath = '/src/lib/store/project.ts',
			project = await import(/* @vite-ignore */ projectPath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(/* @vite-ignore */ dbPath),
			pngPath = '/src/lib/image/png.ts',
			png = await import(/* @vite-ignore */ pngPath),
			rawPath = '/src/lib/image/pngraw.ts',
			raw = await import(/* @vite-ignore */ rawPath);
		const id = await s.copyDemo(),
			{ rec, project: loaded } = await project.loadProject(id),
			m = rec.manifest,
			cells = m.items.find((i: { id: string }) => i.id === m.rig.baseItem).layers[0].cells,
			frame = loaded.images.get(cells['cross-punch'].south[2]);
		// Setup needs all four cardinal views drawn; the demo mirrors west, so draw it as a copy of east.
		for (const direction of m.rig.directions) delete direction.mirrorOf;
		for (const clip of Object.values(cells) as Record<string, string[]>[])
			if (clip.east) clip.west = [...clip.east];
		m.items = m.items.filter((i: { id: string }) => i.id === m.rig.baseItem);
		// A fully transparent frame mid-move: setup skips that move rather than refusing or spending on it.
		const empty = await db.putBlob(await raw.encodePngBytes(png.makeImg(frame.w, frame.h)));
		cells['cross-punch'].south[2] = `sha256:${empty}`;
		await db.put('projects', id, rec);
		await s.openProject(id);
	});
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Set up character…', exact: true }).click();
	const setup = page.getByRole('dialog', { name: 'Set up character', exact: true });
	await expect(setup).toContainText(/unique body frames · [\d.]+ gens estimated/);
	await expect(
		setup.getByText(
			'Cross punch will be skipped: each has an empty frame, so nothing is spent on it. Fix those frames or make the moves again to animate items on them.',
			{ exact: true }
		)
	).toBeVisible();
	expect(posts).toEqual([]);
});

test('Activity shows plan-derived capacity without a manual override or network request', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/lib/pixellab/queue.ts',
			{ queue } = await import(/* @vite-ignore */ path);
		queue.disconnect();
		queue.setBalance(
			{ subscription: { status: 'active', plan: 'Tier 2: Pixel Artisan' } },
			queue.key
		);
		(window as unknown as { __studio: { ui: { sheet: string } } }).__studio.ui.sheet = 'activity';
	});
	const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
	await expect(activity.getByTestId('queue-capacity')).toHaveText('Up to 10 jobs at once.');
	await activity.getByText('Details', { exact: true }).click();
	await expect(activity.getByRole('spinbutton', { name: 'Parallel calls' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(activity).toHaveCount(0);
	expect(requests).toEqual([]);
});

test('accepted held-item review reasons survive actual reload without claiming a hand switch', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const name = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await s.copyDemo();
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((it: { slot: string }) => it.slot === 'main_hand');
		const part = {
			minKeyKept: 1,
			maxKeyOutside: 0,
			minAreaRatio: 1,
			maxAreaCV: 0,
			maxPaletteDist: 0,
			clipPx: 0,
			status: 'accepted'
		};
		item.qa = {
			...part,
			motionReviewClips: 1,
			rerolls: 0,
			cells: {},
			handedness: 'ok',
			grip: { R: 4, L: 0, amb: 4, none: 4 },
			clips: {
				'idle/west': { ...part, hand: '?', grip: { R: 0, L: 0, amb: 4, none: 0 } },
				'idle/north': { ...part, grip: { R: 0, L: 0, amb: 0, none: 0 } },
				'idle/east': { ...part, hand: '?', grip: { R: 0, L: 0, amb: 0, none: 4 } },
				'idle/south': { ...part, hand: 'r', grip: { R: 4, L: 0, amb: 0, none: 0 } }
			}
		};
		await db.put('projects', s.doc.id, rec);
		return item.name;
	});
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await pickItem(page, name);
	const pane = await selectedItemDetails(page);
	await expect(pane.locator('.badge.accepted')).toHaveText('Accepted');
	// The review reasons sit in the quality checks disclosure, one intentional step from the summary.
	await openItemSection(pane, 'Quality checks');
	await expect(
		pane.getByText('The grip side is unclear; check the intended hand (idle, west)', {
			exact: true
		})
	).toBeVisible();
	await expect(
		pane.getByText('Handedness could not be confirmed; inspect the intended hand (idle, north)', {
			exact: true
		})
	).toBeVisible();
	await expect(
		pane.getByText('The grip could not be confirmed; inspect the item at the hand', { exact: true })
	).toBeVisible();
	await expect(
		pane.getByText("Check the item's size and angle as it moves", { exact: true })
	).toBeVisible();
	await expect(pane.getByText('The item switches hands', { exact: true })).toHaveCount(0);
	await expect(pane.getByText(/Hand positions are unavailable/)).toHaveCount(0);
	expect(requests).toEqual([]);
});

test('Export discloses saved item and body review flags without blocking analysis downloads', async ({
	page,
	context
}, info) => {
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const names = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await s.copyDemo();
		const rec = await db.get('projects', s.doc.id),
			items = rec.manifest.items.filter((it: { slot: string }) => it.slot !== 'body').slice(0, 4);
		const qa = {
			minKeyKept: 1,
			maxKeyOutside: 0,
			minAreaRatio: 1,
			maxAreaCV: 0,
			maxPaletteDist: 0,
			clipPx: 0,
			rerolls: 0,
			cells: {},
			clips: {}
		};
		items[0].qa = { ...qa, status: 'fail' };
		items[1].qa = { ...qa, status: 'warn' };
		items[2].qa = { ...qa, status: 'accepted' };
		items[2].designWarnings = ['D1 keyframe rest/west/0: gray smudges'];
		items[3].qa = { ...qa, status: 'pass' };
		items[3].designWarnings = ['D1 keyframe rest/south/0: gray smudges'];
		items[3].baseHash = 'sha256:' + 'f'.repeat(64);
		rec.rigQa = {
			clips: {
				'walk/east': { fails: ['arms 2.77 px off the requested pose'] },
				'walk/west': { fails: ['arms 2.10 px off the requested pose'] },
				'idle/south': { fails: [] },
				'removed/south': { fails: ['historical removed clip'] },
				'cross-punch/west': { fails: ['historical unavailable view'] }
			}
		};
		await db.put('projects', s.doc.id, rec);
		return items.map((it: { name: string }) => it.name);
	});
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	if (await page.getByRole('dialog', { name: 'Item', exact: true }).count())
		await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Export', exact: true });
	await expect(sheet.getByText(/Some artwork needs a check/)).toBeVisible();
	await sheet.getByText('Export notes', { exact: true }).click();
	const itemNotice = sheet.getByText(/^Check this artwork before using it:/);
	for (const name of names) await expect(itemNotice).toContainText(name);
	const bodyNotice = sheet.getByText(/^Check body frames:/);
	await expect(bodyNotice).toContainText('Walk facing east, Walk facing west');
	await expect(bodyNotice).not.toContainText('Removed');
	await expect(bodyNotice).not.toContainText('Cross punch');
	await sheet.getByRole('radio', { name: /PNG \+ JSON/ }).click();
	const download = sheet.getByRole('button', { name: /^Download ZIP/ });
	await expect(download).toBeEnabled();
	const file = page.waitForEvent('download');
	await download.click();
	expect((await file).suggestedFilename()).toMatch(/generic\.pixeldoll\.zip$/);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id);
		for (const it of rec.manifest.items) {
			if (it.qa) it.qa.status = 'pass';
			delete it.designWarnings;
			it.baseHash = rec.manifest.rig.baseHash;
		}
		rec.rigQa = { clips: { 'walk/east': { fails: [] } } };
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(sheet.getByRole('button', { name: /^Download ZIP/ })).toBeEnabled();
	await expect(sheet.getByText(/^Check this artwork before using it:/)).toHaveCount(0);
	await expect(sheet.getByText(/^Check body frames:/)).toHaveCount(0);
	expect(requests).toEqual([]);
});

async function targetedRepairFixture(page: Page, keepMirrors = false) {
	await page.locator('.world-actors').first().waitFor();
	return page.evaluate(async (keepMirrors) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const posesPath = '/src/lib/rig/poses.ts',
			poses = await import(posesPath);
		await s.copyDemo();
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest,
			base = m.items.find((it: { id: string }) => it.id === m.rig.baseItem);
		if (!keepMirrors)
			m.rig.directions = m.rig.directions.map((d: { id: string }) => ({ id: d.id }));
		for (const it of m.items) {
			for (const layer of it.layers)
				for (const dirs of Object.values(layer.cells ?? {}) as any[])
					if (dirs.east && !dirs.west) dirs.west = [...dirs.east];
			it.coverage?.push(
				...it.coverage
					.filter((key: string) => key.split('/')[1] === 'east')
					.map((key: string) => key.replace('/east/', '/west/'))
			);
		}
		const points = poses.LABELS.map((label: string, i: number) => ({
			label,
			x: 0.3 + i * 0.01,
			y: 0.2 + i * 0.025
		}));
		m.rig.rest = {};
		for (const dir of m.rig.directions.map((d: { id: string }) => d.id)) {
			m.rig.rest[dir] = { image: base.layers[0].cells.walk[dir][0], keypoints: points };
			for (const a of m.rig.animations)
				if (base.layers[0].cells[a.id]?.[dir]?.length) {
					a.sources ??= {};
					a.sources[dir] = {
						route: 'skeleton-v3',
						keypoints: Array.from({ length: a.cells }, () => points)
					};
				}
		}
		// Imported characters always include a standing clip. Keep this fixture valid for standing-first item creation.
		base.layers[0].cells.default = Object.fromEntries(
			Object.entries(m.rig.rest).map(([dir, rest]) => [dir, [(rest as { image: string }).image]])
		);
		m.rig.animations = m.rig.animations.filter((a: { id: string }) => a.id !== 'default');
		m.rig.animations.unshift({
			id: 'default',
			cells: 1,
			loop: true,
			frames: [{ cell: 0, ms: 100 }],
			sources: Object.fromEntries(
				Object.entries(m.rig.rest).map(([dir, rest]) => [
					dir,
					{
						route: 'import',
						reference: (rest as { image: string }).image,
						keypoints: [(rest as { keypoints: unknown }).keypoints],
						motion: 'imported-rest',
						provenance: []
					}
				])
			)
		});
		const sword = m.items.find((it: { slot: string }) => it.slot === 'main_hand');
		sword.route = 'skeleton-pose';
		sword.key = 'green';
		sword.dressed = Object.fromEntries(
			Object.entries(m.rig.rest).map(([d, r]) => [d, (r as { image: string }).image])
		);
		rec.character = { id: 'offline-repair-fixture', looks: 'Stored offline fixture' };
		rec.rigQa = {
			clips: {
				'walk/east': { fails: ['arms off pose'] },
				'walk/west': { fails: ['arms off pose'] }
			}
		};
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		return { itemId: sword.id, itemName: sword.name };
	}, keepMirrors);
}

test('failed anchored moves offer cache-only recovery without an API key or a new request', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		if (route.request().method() === 'POST') posts.push(route.request().url());
		await route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const { itemId } = await targetedRepairFixture(page);
	await page.evaluate(async (itemId) => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			runPath = '/src/lib/items/run.ts';
		const s = await import(statePath),
			db = await import(dbPath),
			run = await import(runPath);
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((it: { id: string }) => it.id === itemId);
		item.route = 'ea2-anchor';
		item.standing = 'default';
		for (const layer of item.layers) delete layer.cells.walk;
		item.coverage = [];
		await db.put('projects', s.doc.id, rec);
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: s.doc.id,
			status: 'failed',
			error: run.ITEM_MOVE_SAVE_CONFLICT,
			// recovery routes on the stored code, never on the English text
			message: { key: 'itemRoute.errors.itemMoveSaveConflict' },
			requestText: s.REQUEST_TEXT,
			progress: { step: 'items', done: 0, total: 1, recIds: [] },
			spec: {
				id: 'walk',
				items: [itemId],
				dirs: ['east'],
				frames: 8,
				seed: 90,
				itemsOnly: true,
				itemMethod: 'anchor'
			}
		});
	}, itemId);
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page
		.getByRole('button', { name: 'Walk · Steel longsword Failed: tap for details' })
		.click();
	const sheet = page.getByRole('dialog', { name: 'New move', exact: true });
	await expect(sheet.getByRole('button', { name: /^Generate again/ })).toContainText('~10 gens');
	await sheet.getByRole('button', { name: 'Use saved frames', exact: true }).click();
	await expect(sheet).toContainText(
		'Completed frames matching the current body and equipment are unavailable. No generation was requested.'
	);
	await expect(page.getByRole('dialog', { name: 'Connect PixelLab' })).toHaveCount(0);
	expect(posts).toEqual([]);
});

/** Offline skeleton-v3 moves: each render echoes its first frame once per requested pose, and every joint check finds the
 *  fixture's standing joints. `holdUntilOthers` answers that direction's render only after the other renders completed. */
async function skeletonMoveApi(
	page: Page,
	context: BrowserContext,
	options: {
		/** The render of this direction is refused (never charged), so that view stops. */
		refuse?: string;
		/** Every frame of this direction comes back without joints. */
		jointless?: string;
		/** Every frame of this direction comes back in a color off the character's palette (a numbers-only body check). */
		recolor?: string;
	} = {}
) {
	const posts: string[] = [],
		jobs = new Map<string, { images: string[] }>(),
		finished = new Set<string>();
	let checked = 0;
	// A marker color nothing in the demo uses tells a jointless direction's frames apart at the joint check.
	const MARK = [3, 251, 7];
	const labels = await page.evaluate(async () => {
		const path = '/src/lib/rig/poses.ts';
		return (await import(path)).LABELS as string[];
	});
	const keypoints = labels.map((label, i) => ({ label, x: 0.3 + i * 0.01, y: 0.2 + i * 0.025 }));
	const marked = async (base64: string) => {
		const im = await decodePngBytes(Buffer.from(base64, 'base64'));
		for (let p = 0; p < im.w * im.h; p++)
			if (
				im.data[p * 4 + 3] &&
				im.data[p * 4] === MARK[0] &&
				im.data[p * 4 + 1] === MARK[1] &&
				im.data[p * 4 + 2] === MARK[2]
			)
				return true;
		return false;
	};
	const mark = async (base64: string, color = MARK) => {
		const im = await decodePngBytes(Buffer.from(base64, 'base64'));
		for (let p = 0; p < im.w * im.h; p++)
			if (im.data[p * 4 + 3]) im.data.set([...color, 255], p * 4);
		return Buffer.from(await encodePngBytes(im)).toString('base64');
	};
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (request.method() === 'GET' && path.endsWith('/balance'))
			return route.fulfill({
				json: {
					// Tier 3 runs every view's render at once, so a held view never blocks the others.
					subscription: {
						type: 'generations',
						status: 'active',
						plan: 'Tier 3',
						generations: 100,
						total: 100
					},
					credits: { type: 'usd', usd: 1 }
				}
			});
		if (request.method() === 'GET' && path.includes('/characters/'))
			return route.fulfill({ status: 404, json: { detail: 'Not available on this account' } });
		if (request.method() === 'POST') {
			const body = request.postDataJSON() as {
				direction?: string;
				keypoints?: unknown[];
				frame_count?: number;
				first_frame?: { base64: string };
				image?: { base64: string };
			};
			posts.push(path);
			if (path.endsWith('/estimate-skeleton')) checked++;
			if (path.endsWith('/estimate-skeleton'))
				return route.fulfill({
					json: {
						keypoints: body.image && (await marked(body.image.base64)) ? [] : keypoints,
						usage: { type: 'generations', generations: 0.1 }
					}
				});
			if (path.endsWith('/animate-pixminimax') || path.endsWith('/animate-with-skeleton-v3')) {
				if (body.direction === options.refuse) {
					// Answer only once the other three views have their renders and joint checks, so this one alone stops.
					for (let wait = 0; (finished.size < 3 || checked < 3) && wait < 200; wait++)
						await new Promise((resolve) => setTimeout(resolve, 100));
					return route.fulfill({ status: 422, json: { detail: 'Refused by the offline fixture' } });
				}
				const frame =
					body.direction === options.jointless
						? await mark(body.first_frame!.base64)
						: body.direction === options.recolor
							? await mark(body.first_frame!.base64, [40, 200, 230])
							: body.first_frame!.base64;
				const id = `skeleton-move-${jobs.size}-${body.direction}`;
				jobs.set(id, {
					images: Array.from({ length: body.keypoints?.length ?? body.frame_count! }, () => frame)
				});
				return route.fulfill({ json: { background_job_id: id } });
			}
			return route.abort();
		}
		const id = path.split('/').pop()!,
			job = jobs.get(id);
		if (job) {
			finished.add(id);
			return route.fulfill({
				json: {
					id,
					status: 'completed',
					created_at: '',
					usage: { type: 'generations', generations: 2 },
					last_response: { images: job.images.map((base64) => ({ type: 'base64', base64 })) }
				}
			});
		}
		return route.abort();
	});
	return posts;
}

async function generateNewSkeletonMove(page: Page, template: string) {
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'New move', exact: true });
	await sheet.getByRole('button', { name: template, exact: true }).click();
	await sheet.getByRole('button', { name: /^Advanced/ }).click();
	await sheet
		.getByRole('combobox', { name: 'Motion model', exact: true })
		.selectOption('skeleton-v3');
	await sheet.getByRole('button', { name: /^Generate / }).click();
	return sheet;
}

test('a new move whose one view stopped saves its finished views for free and ends the hold', async ({
	page,
	context
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-finished-views-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	const posts = await skeletonMoveApi(page, context, { refuse: 'west' });
	const sheet = await generateNewSkeletonMove(page, 'Idle');
	const paid = sheet.getByRole('region', { name: 'Paid results', exact: true });
	await expect(paid).toBeVisible({ timeout: 45_000 });
	await expect(paid).toContainText('West · Stopped');
	const save = paid.getByRole('button', { name: /^Save the finished views/ });
	await expect(save).toContainText('Free');
	await expect(paid).toContainText(
		'Saves South, East, and North for free, after review. West did not finish and is left out'
	);
	const sent = posts.length;
	await save.click();
	const review = page.getByRole('dialog', { name: 'Review move', exact: true });
	await review.getByRole('button', { name: 'Save move', exact: true }).click({ timeout: 45_000 });
	await expect(review).toBeHidden();
	// Saving offers equipment for the new move as a separate priced step; closing it buys nothing.
	const animate = page.getByRole('dialog', { name: 'Generate items', exact: true });
	await animate.getByRole('button', { name: 'Close', exact: true }).click();
	expect(posts.length).toBe(sent);
	const saved = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts';
		const s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			base = rec.manifest.items.find((it: { id: string }) => it.id === rec.manifest.rig.baseItem);
		return {
			views: Object.keys(base.layers[0].cells.idle ?? {}),
			hold: !!s.moving.error,
			record: (await db.get('projects', 'studio-move'))?.status ?? null
		};
	});
	expect(saved).toEqual({ views: ['south', 'east', 'north'], hold: false, record: null });
	// No failed-move hold: a new move opens on a fresh form.
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	await expect(sheet.getByRole('textbox', { name: 'Describe the motion' })).toBeVisible();
	await expect(sheet.getByRole('region', { name: 'Paid results', exact: true })).toHaveCount(0);
});

test('a replacement missing only numeric body checks lands in the staged review with a free Save', async ({
	page,
	context
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-numbers-only-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	const posts = await skeletonMoveApi(page, context, { recolor: 'east' });
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'More actions for Walk', exact: true }).click();
	await page.getByRole('menuitem', { name: /^Redraw/ }).click();
	const sheet = page.getByRole('dialog', { name: /^Redraw / });
	await sheet
		.getByRole('group', { name: 'Directions to redraw' })
		.getByRole('button', { name: 'West direction', exact: true })
		.click();
	await sheet.getByRole('button', { name: /^Replace Walk views/ }).click();
	const review = page.getByRole('dialog', { name: 'Review move', exact: true });
	const replace = review.getByRole('button', { name: 'Replace move', exact: true });
	await expect(replace).toBeEnabled({ timeout: 45_000 });
	// The paid frames are kept for a free choice: Save leads, Discard is beside it, and no paid re-roll leads.
	await expect(replace).toHaveAttribute('data-variant', 'primary');
	await expect(review.getByRole('button', { name: 'Discard draft', exact: true })).toBeEnabled();
	await expect(review.getByRole('button', { name: 'Regenerate…', exact: true })).toHaveAttribute(
		'data-variant',
		'outline'
	);
	await expect(review.getByText('Regenerate this move before saving it.')).toHaveCount(0);
	await expect(page.getByText(/still fails body-pose quality checks/)).toHaveCount(0);
	const sent = posts.length;
	await replace.click();
	await expect(review).toBeHidden();
	const east = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts';
		const s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id);
		return {
			draft: !!rec.moveReviews?.walk,
			hold: !!s.moving.error,
			posed: !!rec.manifest.rig.animations.find((a: { id: string }) => a.id === 'walk').sources
				?.east
		};
	});
	expect(east).toEqual({ draft: false, hold: false, posed: true });
	expect(posts.length).toBe(sent);
});

test('a view kept without poses names the move and view to make again before equipment', async ({
	page,
	context
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-keep-unposed-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const { itemId } = await targetedRepairFixture(page);
	const posts = await skeletonMoveApi(page, context, { jointless: 'west' });
	const sheet = await generateNewSkeletonMove(page, 'Idle');
	const paid = sheet.getByRole('region', { name: 'Paid results', exact: true });
	const keep = paid.getByRole('button', { name: /^Keep without fitting items/ });
	await expect(keep).toBeVisible({ timeout: 45_000 });
	await expect(keep).toContainText('Free');
	await expect(paid).toContainText('Saves the body frames as they are, for free.');
	const sent = posts.length;
	await keep.click();
	await expect
		.poll(
			() =>
				page.evaluate(async () => {
					const statePath = '/src/studio/state.svelte.ts',
						dbPath = '/src/lib/store/db.ts';
					const s = await import(statePath),
						db = await import(dbPath);
					const rec = await db.get('projects', s.doc.id),
						idle = rec.manifest.rig.animations.find((a: { id: string }) => a.id === 'idle');
					return idle && { redo: rec.rigQa?.redo, posed: Object.keys(idle.sources ?? {}) };
				}),
			{ timeout: 30_000 }
		)
		.toEqual({ redo: ['idle/west'], posed: ['south', 'east', 'north'] });
	expect(posts.length).toBe(sent);
	const animate = page.getByRole('dialog', { name: 'Generate items', exact: true });
	if (await animate.isVisible())
		await animate.getByRole('button', { name: 'Close', exact: true }).click();
	if (await sheet.isVisible())
		await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	// The Moves list marks the move to make again, and the item offers leave that view out.
	await equipmentMode(page, 'Moves');
	await expect(
		page.getByRole('button', { name: /^Idle .*Joints not found: redraw it to animate items on it/ })
	).toBeVisible();
	// The item's details name that view and its way on, with no price for it; nothing is bought.
	await page.evaluate(async (itemId) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.ui.anim = 'idle';
		s.wear(itemId);
		s.pick(itemId);
	}, itemId);
	const details = await selectedItemDetails(page);
	await expect(details).toContainText(
		'Idle West was kept without poses, so equipment is not fitted there. Make that view again to fit it.'
	);
	expect(posts.length).toBe(sent);
	// Another item on the same view that still can be made must not hide this one's redraw note, and a worn copy from
	// another body has no offer or note, so its own way on must stay reachable beside both.
	await details.getByRole('button', { name: 'Close', exact: true }).click();
	await page.evaluate(async (itemId) => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			source = rec.manifest.items.find((it: { id: string }) => it.id === itemId),
			clone = structuredClone(source),
			copied = structuredClone(source);
		clone.id = 'extra-helm';
		clone.name = 'Extra helm';
		clone.slot = 'head';
		for (const layer of clone.layers) {
			delete layer.cells.idle?.west;
			delete layer.cells.idle?.east;
		}
		clone.coverage = clone.coverage.filter((key: string) => !/^idle\/(west|east)\//.test(key));
		// A copy from another body cannot be posed here: no offer and no unposed note, only making one for this character.
		copied.id = 'copied-vest';
		copied.name = 'Copied vest';
		copied.slot = 'feet';
		copied.baseHash = 'sha256:otherbody';
		copied.copiedFrom = { id: 'other-body', name: 'Other body' };
		for (const layer of copied.layers) delete layer.cells.idle?.west;
		copied.coverage = copied.coverage.filter((key: string) => !key.startsWith('idle/west/'));
		rec.manifest.items.push(clone, copied);
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		if (s.doc.items.head !== clone.id) s.wear(clone.id);
		if (s.doc.items.feet !== copied.id) s.wear(copied.id);
		if (s.doc.items.main_hand !== itemId) s.wear(itemId);
		// The demo's other worn items are partial too; leave only these three so each way on is unambiguous.
		for (const slot of ['torso_inner', 'back', 'hair'])
			if (s.doc.items[slot]) s.wear(s.doc.items[slot]);
		s.ui.anim = 'idle';
		s.ui.dir = 'west';
		s.ui.all = false;
	}, itemId);
	await inspectStage(page);
	const stageNote = page.locator('.stage-note');
	await expect(stageNote.getByText('Idle West was kept without poses')).toHaveCount(1);
	await expect(stageNote.getByRole('button', { name: /^Make missing views/ })).toContainText(
		'gens'
	);
	await expect(stageNote.getByRole('button', { name: /^Make one for / })).toBeVisible();
	expect(posts.length).toBe(sent);
});

test('an item missing a standing view restores it from its saved design for free', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		if (route.request().method() === 'POST') posts.push(route.request().url());
		await route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const { itemId, itemName } = await targetedRepairFixture(page);
	// As a free copy leaves it when one standing body frame did not match its source: every view but south.
	const standing = (id: string) =>
		page.evaluate(async (id) => {
			const statePath = '/src/studio/state.svelte.ts',
				dbPath = '/src/lib/store/db.ts',
				s = await import(statePath),
				db = await import(dbPath);
			const rec = await db.get('projects', s.doc.id),
				item = rec.manifest.items.find((it: { id: string }) => it.id === id);
			// A view counts when it is recorded as covered and every layer stores its frame.
			return (item.coverage as string[])
				.filter(
					(key) =>
						key.startsWith('default/') &&
						item.layers.every(
							(layer: { cells: Record<string, Record<string, unknown[]>> }) =>
								layer.cells.default?.[key.split('/')[1]]?.length === 1
						)
				)
				.sort();
		}, id);
	await page.evaluate(async (itemId) => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((it: { id: string }) => it.id === itemId);
		item.coverage = item.coverage.filter((key: string) => key !== 'default/south/0');
		for (const layer of item.layers) delete layer.cells.default.south;
		item.provenance[0].produced = rec.manifest.rig.directions.map(
			(d: { id: string }) => `rest/${d.id}/0`
		);
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
	}, itemId);
	expect(await standing(itemId)).not.toContain('default/south/0');
	await pickItem(page, itemName);
	const details = await selectedItemDetails(page);
	const restore = details.getByRole('button', { name: /^Restore standing view/ });
	await expect(restore).toContainText('Free');
	await expect(details).toContainText(
		'Rebuilt from this item’s saved south design. Nothing is generated.'
	);
	await restore.click();
	await expect(page.locator('.bu-toast').last()).toContainText(
		`Restored ${itemName} facing south. No generations used.`
	);
	await expect(restore).toHaveCount(0);
	expect(await standing(itemId)).toContain('default/south/0');
	expect(posts).toEqual([]);
});

test('a custom move replacement keeps its name and reviews eligible equipment and costs', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest;
		const sword = m.items.find((item: { slot: string }) => item.slot === 'main_hand');
		sword.dressed = { east: sword.dressed.east };
		const custom = m.rig.animations.find((a: { id: string }) => a.id === 'walk');
		custom.id = 'idle';
		custom.sources.east.motion = 'pixminimax:idle, shift weight to the leading foot';
		custom.sources.west.route = 'v3';
		custom.sources.west.motion = 'v3:idle, shift weight to the leading foot';
		for (const item of m.items)
			for (const layer of item.layers)
				if (layer.cells?.walk) {
					layer.cells.idle = layer.cells.walk;
					delete layer.cells.walk;
				}
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
	});
	await equipmentMode(page, 'Moves');
	const redraw = async (name: string) => {
		await page.getByRole('button', { name: `More actions for ${name}`, exact: true }).click();
		await page.getByRole('menuitem', { name: /^Redraw/ }).click();
	};
	await redraw('Cross punch');
	const sheet = page.getByRole('dialog', { name: /^Redraw / });
	await expect(sheet).toHaveAccessibleName('Redraw Cross punch');
	await expect(sheet.getByRole('group', { name: 'Move templates', exact: true })).toHaveCount(0);
	const replacePunch = sheet.getByRole('button', { name: /^Replace Cross punch views/ });
	await sheet.getByRole('textbox', { name: 'Describe the replacement', exact: true }).fill('');
	await expect(replacePunch).toBeDisabled();
	await sheet
		.getByRole('textbox', { name: 'Describe the replacement', exact: true })
		.fill('Punch across the body');
	await expect(replacePunch).toBeEnabled();
	// The typed replacement is unsaved, so closing asks first.
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	await page
		.getByRole('alertdialog', { name: 'Discard changes?', exact: true })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await redraw('Idle');
	await expect(sheet).toHaveAccessibleName('Redraw Idle');
	const replace = sheet.getByRole('button', { name: /^Replace Idle views/ });
	await expect(
		sheet.getByRole('textbox', { name: 'Describe the replacement', exact: true })
	).toHaveValue('idle, shift weight to the leading foot');
	await sheet.getByRole('textbox', { name: 'Describe the replacement', exact: true }).fill('');
	await expect(replace).toBeDisabled();
	await expect(sheet).toContainText('Describe this move before generating it.');
	await sheet
		.getByRole('textbox', { name: 'Describe the replacement', exact: true })
		.fill('Step sideways and shift weight to the leading foot');
	await expect(replace).toBeEnabled();
	await expect(replace).toContainText('Connect PixelLab');
	const sword = sheet.getByRole('checkbox', { name: /Steel longsword/ });
	await expect(sword).toHaveCount(0);
	await expect(sheet).not.toContainText('No items included');
	const directions = sheet.getByRole('group', { name: 'Directions to redraw' });
	const west = directions.getByRole('button', { name: 'West direction', exact: true });
	const east = directions.getByRole('button', { name: 'East direction', exact: true });
	await west.click();
	await directions.getByRole('button', { name: 'South direction', exact: true }).click();
	await directions.getByRole('button', { name: 'North direction', exact: true }).click();
	await expect(sword).toHaveCount(0);
	await west.click();
	await expect(sword).toHaveCount(0);
	await east.click();
	await expect(sheet.getByRole('textbox', { name: 'Describe the replacement' })).toHaveValue(
		'Step sideways and shift weight to the leading foot'
	);
	await expect(replace).toBeEnabled();
	const advanced = sheet.getByRole('button', { name: /^Advanced/ });
	await expect(advanced).toContainText('V3');
	await expect(sheet.getByText('Kept: 8 frames', { exact: true })).toBeVisible();
	await expect(
		sheet.getByRole('combobox', { name: 'Motion model', exact: true })
	).not.toBeVisible();
	await advanced.click();
	await expect(sheet.getByRole('slider', { name: 'Frames', exact: true })).toHaveCount(0);
	await expect(sheet.getByText('Kept: 8 frames', { exact: true })).toBeVisible();
	const model = sheet.getByRole('combobox', { name: 'Motion model', exact: true });
	await expect(model).toHaveValue('v3');
	await expect(sheet).toContainText('No items included');
	await east.click();
	await expect(model).toHaveValue('skeleton-v3');
	await expect(sheet.getByRole('textbox', { name: 'Describe the replacement' })).toHaveValue(
		'Step sideways and shift weight to the leading foot'
	);
	await model.selectOption('pixminimax');
	await east.click();
	await expect(model).toHaveValue('pixminimax');
	await model.selectOption('skeleton-v3');
	await expect(sheet.getByRole('button', { name: 'End frame', exact: true })).toBeDisabled();
	const start = sheet.getByRole('button', { name: 'Start frame', exact: true });
	await start.click();
	await sheet.getByRole('button', { name: 'From device', exact: true }).click();
	const startWarning = page.getByRole('alertdialog', { name: 'Use a custom start frame?' });
	await expect(startWarning).toBeVisible();
	await startWarning.getByRole('button', { name: 'Keep default' }).click();
	const transfer = await page.evaluateHandle(
		(bytes) => {
			const data = new DataTransfer();
			data.items.add(new File([new Uint8Array(bytes)], 'start.png', { type: 'image/png' }));
			return data;
		},
		Array.from(readFileSync('dev-fixtures/s4rig/walk_east_0.png'))
	);
	await start.dispatchEvent('drop', { dataTransfer: transfer });
	await expect(startWarning).toBeVisible();
	await expect(start).not.toContainText('start.png');
	await startWarning.getByRole('button', { name: 'Continue', exact: true }).click();
	await expect(start).toContainText('start.png');
	// The typed description is unsaved, so closing asks first.
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	await page
		.getByRole('alertdialog', { name: 'Discard changes?', exact: true })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	const custom = page.getByRole('textbox', { name: 'Describe the motion', exact: true });
	await custom.fill('jumping in place');
	const add = page.getByRole('dialog', { name: 'New move', exact: true });
	await expect(add.getByRole('button', { name: /^Generate / })).toBeEnabled();
	await expect(add.getByText('Directions to redraw')).toHaveCount(0);
	const loop = add.getByRole('switch', { name: 'Loop', exact: true });
	await expect(loop).not.toBeChecked();
	await expect(add.getByRole('slider', { name: 'Frames', exact: true })).toBeVisible();
	const addAdvanced = add.getByRole('button', { name: /^Advanced/ });
	const addModel = add.getByRole('combobox', { name: 'Motion model', exact: true });
	if (!(await addModel.isVisible())) await addAdvanced.click();
	await addModel.selectOption('v3');
	const frameTabs = add.getByRole('tablist', { name: 'Start and end frames', exact: true });
	const directionTabs = frameTabs.getByRole('tab');
	const firstDirection = directionTabs.first();
	const lastDirection = directionTabs.last();
	await firstDirection.click();
	await loop.check();
	const end = add.getByRole('button', { name: 'End frame', exact: true });
	await expect(end).toContainText('Same as start');
	const originalViewport = page.viewportSize()!;
	await page.setViewportSize({ width: 320, height: 700 });
	const frameHelp = add.getByRole('button', { name: 'Start and end frames', exact: true });
	await frameHelp.click();
	const frameTooltip = page.getByRole('tooltip').filter({ hasText: 'guide the opening pose' });
	await expect(frameTooltip).toBeVisible();
	await expect(frameTooltip).toContainText('make a loop smoother');
	await frameHelp.press('Escape');
	await expect(frameTooltip).toBeHidden();
	await expect(add).toBeVisible();
	await expect(frameTabs).toHaveCount(1);
	await expect(directionTabs).toHaveCount(4);
	for (const name of ['South', 'East', 'North', 'West']) {
		await expect(frameTabs.getByRole('tab', { name, exact: true })).toHaveCount(1);
	}
	const frameCopy = end.locator('.reference-copy');
	await expect(frameCopy).toBeVisible();
	await expect
		.poll(() =>
			end.evaluate((tile) => {
				const box = tile.getBoundingClientRect();
				const copy = tile.querySelector('.reference-copy')!.getBoundingClientRect();
				return copy.top >= box.top && copy.bottom <= box.bottom;
			})
		)
		.toBe(true);
	// Paste sits beside Remove, inside the tile, without covering it.
	const endPaste = (await end
		.locator('xpath=..')
		.getByRole('button', { name: 'Paste from clipboard', exact: true })
		.boundingBox())!;
	const endRemove = (await add
		.getByRole('button', { name: 'Remove end frame', exact: true })
		.boundingBox())!;
	const endTile = (await end.boundingBox())!;
	expect(endPaste.x + endPaste.width).toBeLessThanOrEqual(endRemove.x + 1);
	expect(endPaste.x).toBeGreaterThanOrEqual(endTile.x);
	expect(endPaste.y).toBeGreaterThanOrEqual(endTile.y);
	expect(endPaste.y + endPaste.height).toBeLessThanOrEqual(endTile.y + endTile.height);
	await page.setViewportSize(originalViewport);
	await add.getByRole('button', { name: 'Remove end frame', exact: true }).click();
	await expect(end).toContainText('No end frame');
	await end.click();
	const [endPicker] = await Promise.all([
		page.waitForEvent('filechooser'),
		add.getByRole('button', { name: 'From device', exact: true }).click()
	]);
	await endPicker.setFiles('dev-fixtures/s4rig/walk_east_1.png');
	await expect(end).toContainText('walk_east_1.png');
	const addStart = add.getByRole('button', { name: 'Start frame', exact: true });
	await addStart.click();
	await add.getByRole('button', { name: 'Same as end', exact: true }).click();
	await expect(addStart).toContainText('walk_east_1.png');
	await firstDirection.press('End');
	await expect(lastDirection).toBeFocused();
	await expect(lastDirection).toHaveAttribute('aria-selected', 'true');
	await expect(end).toContainText('Same as start');
	await lastDirection.press('Home');
	await expect(firstDirection).toBeFocused();
	await expect(end).toContainText('walk_east_1.png');
	await add.getByRole('button', { name: 'Remove reference', exact: true }).click();
	await loop.click();
	const reset = page.getByRole('alertdialog', { name: 'Change Loop and reset end frames?' });
	await reset.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(loop).toBeChecked();
	await expect(end).toContainText('walk_east_1.png');
	await loop.click();
	await reset.getByRole('button', { name: 'Change Loop', exact: true }).click();
	await expect(loop).not.toBeChecked();
	await expect(end).toContainText('No end frame');
	await expect(add.getByRole('button', { name: 'Ride', exact: true })).toHaveCount(0);
	for (const name of ['Walk', 'Run']) {
		await add.getByRole('button', { name, exact: true }).click();
		await expect(custom).toHaveValue(/continuous even strides/);
		await expect(loop).toBeChecked();
		await expect(end).toContainText('Same as start');
	}
	await end.click();
	await add
		.getByRole('combobox', { name: 'From this character', exact: true })
		.selectOption('default/0');
	await expect(end).toContainText('Standing');
});

async function oversizedItemFixture(page: Page, itemId: string) {
	await page.evaluate(async (id) => {
		const sPath = '/src/studio/state.svelte.ts',
			s = await import(sPath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const pPath = '/src/lib/store/project.ts',
			projectModule = await import(pPath),
			iPath = '/src/lib/items/items.ts',
			items = await import(iPath),
			pngPath = '/src/lib/image/pngraw.ts',
			png = await import(pngPath),
			rigPath = '/src/lib/rig/rig.ts',
			rig = await import(rigPath);
		const ctx = await projectModule.loadProject(s.doc.id),
			item = ctx.rec.manifest.items.find((it: { id: string }) => it.id === id),
			padded = new Map<string, string>();
		const pad = async (hash: string) => {
			if (!padded.has(hash)) {
				const image = items.padImg(ctx.project.images.get(hash), 16);
				const cell = await rig.cellHash(image);
				await db.put('blobs', cell.slice(7), new Blob([await png.encodePngBytes(image)]));
				padded.set(hash, cell);
			}
			return padded.get(hash);
		};
		for (const layer of item.layers) {
			layer.cell = { w: 96, h: 96 };
			layer.pivot = { x: ctx.rec.manifest.rig.pivot.x + 16, y: ctx.rec.manifest.rig.pivot.y + 16 };
			for (const dirs of Object.values(layer.cells) as any[])
				for (const [dir, cells] of Object.entries(dirs) as [string, (string | null)[]][])
					dirs[dir] = await Promise.all(cells.map((hash) => (hash ? pad(hash) : null)));
		}
		for (const [dir, hash] of Object.entries(item.dressed) as [string, string][])
			item.dressed[dir] = await pad(hash);
		await db.put('projects', s.doc.id, ctx.rec);
		await s.openProject(s.doc.id);
		s.ui.anim = 'walk';
		s.ui.dir = 'west';
		s.pick(id);
	}, itemId);
}

test('targeted move replacement scopes views, estimates and retained drafts before any paid work', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	const enhancements: {
		action: string;
		engine: string;
		frame_count: number;
		end: string;
	}[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else if (
			r.request().method() === 'GET' &&
			new URL(r.request().url()).pathname.includes('/characters/')
		)
			await r.fulfill({ status: 404, json: { detail: 'Not available on this account' } });
		else if (new URL(r.request().url()).pathname.endsWith('/enhance-animation-v3-prompt')) {
			const { action, engine, frame_count, first_frame, last_frame } = r.request().postDataJSON();
			// Which end frame the enhancer saw: none, the start again (a loop), or another image.
			const end = !last_frame
				? 'none'
				: last_frame.base64 === first_frame.base64
					? 'start'
					: 'other';
			enhancements.push({ action, engine, frame_count, end });
			await r.fulfill({ json: { enhanced_prompt: 'Swing each arm in time with the strides' } });
		} else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'More actions for Walk', exact: true }).click();
	await page.getByRole('menuitem', { name: /^Redraw/ }).click();
	const sheet = page.getByRole('dialog', { name: /^Redraw / });
	const directions = sheet.getByRole('group', { name: 'Directions to redraw' });
	const east = directions.getByRole('button', { name: 'East direction', exact: true });
	const west = directions.getByRole('button', { name: 'West direction', exact: true });
	await expect(directions).toHaveAccessibleDescription(/Replacing these views hides equipment/);
	await expect(east).toHaveAttribute('aria-pressed', 'true');
	await expect(west).toHaveAttribute('aria-pressed', 'true');
	await expect(directions.getByRole('button', { name: 'South direction' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(directions.getByRole('button', { name: 'North direction' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(sheet.getByRole('checkbox', { name: new RegExp(fixture.itemName) })).toHaveCount(0);
	await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toContainText(
		'Connect PixelLab'
	);
	await east.press('Space');
	await west.click();
	await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toBeDisabled();
	await east.click();
	await expect(sheet.getByRole('button', { name: /^Replace Walk views/ })).toContainText(
		'Connect PixelLab'
	);
	const model = sheet.getByRole('combobox', { name: 'Motion model', exact: true });
	if (!(await model.isVisible())) await sheet.getByRole('button', { name: /^Advanced/ }).click();
	await expect(
		sheet.getByRole('group', { name: 'Start and end frames East', exact: true })
	).toBeVisible();
	await sheet.getByRole('button', { name: /^Replace Walk views/ }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab' })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	await expect(east).toHaveAttribute('aria-pressed', 'true');
	await expect(west).toHaveAttribute('aria-pressed', 'false');
	await page.evaluate(() => {
		const original = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move')
				throw new Error('Offline repair persistence stopped before paid work');
			return original.call(this, value, key);
		};
	});
	await sheet.getByRole('button', { name: /^Replace Walk views/ }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-targeted-repair-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	expect(posts).toEqual([]);
	const prompt = sheet.getByRole('textbox', { name: 'Describe the replacement', exact: true });
	const originalPrompt = await prompt.inputValue();
	const enhance = sheet.getByRole('button', { name: 'Enhance', exact: true });
	await expect(enhance).toHaveAccessibleDescription(/0\.05 gens/);
	await enhance.click();
	await expect(prompt).toHaveValue('Swing each arm in time with the strides');
	await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(prompt).toHaveValue(originalPrompt);
	// This redraw uses Skeleton V3, which takes no end frame, so Enhance sees none either.
	expect(enhancements).toEqual([
		{ action: originalPrompt, engine: 'pixminimax', frame_count: 8, end: 'none' }
	]);
	await sheet.getByRole('button', { name: /^Replace Walk views.*~6 gens/ }).click();
	await expect(sheet).toContainText('Offline repair persistence stopped before paid work');
	const scope = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		return s.moving.spec;
	});
	expect(scope).toMatchObject({
		id: 'walk',
		motionSource: 'standalone',
		replace: true,
		dirs: ['east'],
		items: [],
		reviewBeforePublish: true,
		poseStyle: 'visible-side-v1'
	});
	const suggestion = sheet.getByRole('button', { name: /^Review Skeleton V3/ });
	await expect(suggestion).toHaveCount(0);
	const before = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		const messagePath = '/src/lib/message.ts';
		const { LocalizedError } = await import(messagePath);
		const manifest = state.store.project.manifest;
		for (const item of manifest.items)
			if (item.id !== manifest.rig.baseItem && !state.moving.spec.items.includes(item.id))
				for (const layer of item.layers) if (layer.cells?.walk) delete layer.cells.walk.east;
		state.moving.spec = {
			...state.moving.spec,
			animation: {
				model: 'pixminimax',
				frameCount: 8,
				references: { east: { end: { width: 64, height: 64, base64: 'unused-end' } } }
			}
		};
		state.moving.error = new LocalizedError(
			'Fixture QA failure',
			'create.errors.replacementFailsQa'
		);
		return JSON.stringify(manifest);
	});
	await expect(suggestion).toContainText('~6 gens');
	await suggestion.click();
	const review = page.getByRole('dialog', { name: 'Review Skeleton V3', exact: true });
	await expect(review).toContainText('8 frames');
	await expect(review).toContainText('Directions: East');
	await expect(review).toContainText('End frame: Not available for this model');
	await expect(review.getByRole('checkbox', { name: new RegExp(fixture.itemName) })).toHaveCount(0);
	await expect(review.getByRole('button', { name: /^Replace Walk views/ })).toContainText(
		'~6 gens'
	);
	await review.getByRole('button', { name: 'Back', exact: true }).click();
	await expect(suggestion).toBeVisible();
	const after = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		return {
			manifest: JSON.stringify(state.store.project.manifest),
			model: state.moving.spec.animation.model
		};
	});
	expect(after).toEqual({ manifest: before, model: 'pixminimax' });
	await page.evaluate(async (manifest) => {
		const state = await import('/src/studio/state.svelte.ts' as string);
		const db = await import('/src/lib/store/db.ts' as string);
		const { app } = await import('/src/lib/app.svelte.ts' as string);
		const record = await db.get('projects', state.doc.id);
		record.manifest = JSON.parse(manifest);
		await db.put('projects', state.doc.id, record);
		app.keyRejected = true;
	}, before);
	await suggestion.click();
	await review.getByRole('button', { name: /^Replace Walk views/ }).click();
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-reconnected-repair-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(sheet).toContainText('Offline repair persistence stopped before paid work');
	const confirmed = await page.evaluate(async () => {
		const state = await import('/src/studio/state.svelte.ts' as string);
		return state.moving.spec;
	});
	expect(confirmed).toMatchObject({
		id: 'walk',
		replace: true,
		dirs: ['east'],
		items: [],
		reviewBeforePublish: true,
		animation: { model: 'skeleton-v3', frameCount: 8 },
		seed: expect.any(Number)
	});
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		state.moving.spec.animation.model = 'skeleton-v3';
	});
	await expect(suggestion).toHaveCount(0);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		const walk = state.store.project.manifest.rig.animations.find(
			(clip: { id: string }) => clip.id === 'walk'
		);
		Object.assign(walk.sources.east, { route: 'v3', motion: 'v3:walk' });
		state.moving.error = '';
		state.moving.spec = { ...state.moving.spec, itemsOnly: true, replace: false };
		state.moving.qualityDirs = ['east'];
		state.moving.done = true;
	});
	const completed = page.getByRole('dialog', { name: 'New move', exact: true });
	await completed.getByRole('button', { name: /^Review Skeleton V3/ }).click();
	await expect(review).toContainText('Directions: East');
	await expect(review.getByRole('button', { name: /^Replace Walk views/ })).toContainText(
		'~6 gens'
	);
	await review.getByRole('button', { name: 'Back', exact: true }).click();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		const walk = state.store.project.manifest.rig.animations.find(
			(clip: { id: string }) => clip.id === 'walk'
		);
		walk.cells = 16;
		for (const source of Object.values(walk.sources) as { keypoints: unknown[] }[])
			source.keypoints = [...source.keypoints, ...source.keypoints];
		state.moving.qualityDirs = ['east'];
	});
	await expect(completed.getByRole('button', { name: /^Review Skeleton V3/ })).toHaveCount(0);
	expect(posts).toEqual([]);
	expect(errors).toEqual([]);
});

test('targeted move replacement names mirrored effects without offering a separate redraw', async ({
	page
}, info) => {
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page, true);
	// Walk remembers the pose it was generated from, so a redraw starts there by default.
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const p = s.store.project,
			rest = p.manifest.rig.rest.east;
		const animations = p.manifest.rig.animations.map(
			(clip: { id: string; sources?: { east?: object } }) =>
				clip.id === 'walk'
					? {
							...clip,
							sources: {
								...clip.sources,
								east: { ...clip.sources?.east, referenceKeypoints: rest.keypoints }
							}
						}
					: clip
		);
		s.store.project = { ...p, manifest: { ...p.manifest, rig: { ...p.manifest.rig, animations } } };
	});
	// Another move of this character is running: Redraw still opens its own form, not that move's progress.
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.moving.spec = { id: 'run' };
		s.moving.projectId = s.doc.id;
		s.moving.progress = { done: 1, total: 8 };
	});
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'More actions for Walk', exact: true }).click();
	await page.getByRole('menuitem', { name: /^Redraw/ }).click();
	await expect(
		page
			.getByRole('dialog', { name: 'Redraw Walk', exact: true })
			.getByRole('textbox', { name: 'Describe the replacement', exact: true })
	).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.moving.spec = null;
		s.moving.projectId = '';
		s.moving.progress = null;
	});
	// A redraw starts from its original frame, and Standing stays a real choice away from it.
	const start = page.getByRole('button', { name: /^Start from: / });
	await expect(start).toHaveAccessibleName('Start from: Original starting frame');
	await start.click();
	await page
		.getByRole('menu', { name: 'Start from' })
		.getByRole('menuitemradio', { name: 'Standing', exact: true })
		.click();
	await expect(start).toHaveAccessibleName('Start from: Standing');
	const directions = page.getByRole('group', { name: 'Directions to redraw' });
	await expect(directions.getByRole('button', { name: /West direction/ })).toHaveCount(0);
	await expect(directions).toHaveAccessibleDescription(/Mirrored views also change: West/);
	await directions.getByRole('button', { name: 'East direction', exact: true }).click();
	await expect(directions).not.toHaveAccessibleDescription(/Mirrored views also change/);
});

test('stage makes all missing item views while explicit repair stays on the current view', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page, true);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		const p = s.store.project,
			item = p.manifest.items.find((it: { id: string }) => it.id === id);
		// Both extra views have body frames and clip joints. One lacks the item design, the other lacks rest joints.
		const rig = p.manifest.rig,
			body = p.manifest.items.find((it: { id: string }) => it.id === rig.baseItem),
			walk = rig.animations.find((a: { id: string }) => a.id === 'walk');
		for (const dir of ['north-east', 'south-east']) {
			rig.directions.push({ id: dir });
			body.layers[0].cells.walk[dir] = [...body.layers[0].cells.walk.south];
			walk.sources[dir] = { ...walk.sources.south };
			rig.rest[dir] = { ...rig.rest.south };
		}
		item.dressed['south-east'] = item.dressed.south;
		delete rig.rest['south-east'].keypoints;
		for (const layer of item.layers) {
			delete layer.cells.walk.south;
			delete layer.cells.walk.east;
			delete layer.cells.walk.west;
		}
		item.coverage = item.coverage.filter((key: string) => !/^walk\/(south|east|west)\//.test(key));
		// Every other item already has the new view, so only this one tests a shown view the offer leaves out.
		for (const other of p.manifest.items) {
			if (other.id === id || other.id === rig.baseItem) continue;
			for (const layer of other.layers)
				if (layer.cells?.walk?.south) layer.cells.walk['south-east'] = [...layer.cells.walk.south];
			other.coverage?.push(
				...other.coverage
					.filter((key: string) => key.startsWith('walk/south/'))
					.map((key: string) => key.replace('walk/south/', 'walk/south-east/'))
			);
		}
		s.store.project = {
			...p,
			manifest: {
				...p.manifest,
				items: p.manifest.items.map((it: { id: string }) => (it.id === id ? { ...item } : it))
			}
		};
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath),
			rec = await db.get('projects', s.doc.id);
		rec.manifest = s.store.project.manifest;
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		s.ui.anim = 'walk';
		s.ui.dir = 'west';
		s.ui.all = false;
		s.pick(id);
		const original = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move') throw new Error('Scoped repair stopped before paid work');
			return original.call(this, value, key);
		};
	}, fixture.itemId);
	await inspectStage(page);
	const stageNote = page.locator('.stage-note');
	// The extra view on stage has no rest joints: the offer makes the other missing views, and the item keeps its own
	// way on for this one instead of only a price that leaves it missing.
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.ui.dir = 'south-east';
	});
	await expect(stageNote.getByRole('button', { name: /^Make missing views/ })).toContainText(
		'~6 gens'
	);
	await expect(stageNote.getByRole('button', { name: /^Make it again/ })).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.ui.dir = 'west';
	});
	await expect(stageNote.getByRole('button', { name: /^Make it again/ })).toHaveCount(0);
	const make = stageNote.getByRole('button', { name: /^Make missing views/ });
	await expect(make).toContainText('~6 gens');
	await expect(make).not.toContainText('...');
	await expect(make.locator('[data-surface-chevron]')).toHaveCount(0);
	await make.click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-partial-repair-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	let sheet = page.getByRole('dialog', { name: 'New move', exact: true });
	await expect(sheet).toContainText('Scoped repair stopped before paid work');
	const poseScope = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		return s.moving.spec;
	});
	expect(poseScope).toMatchObject({ id: 'walk', dirs: ['south', 'east'], items: [fixture.itemId] });
	expect(poseScope.replace).toBeUndefined();
	expect(poseScope.itemMethod).toBeUndefined();
	// The stopped repair's footer Discard leaves it, as Cancel did.
	await sheet.getByRole('button', { name: 'Discard', exact: true }).click();
	await expect(sheet).toBeHidden();
	await selectedItemDetails(page);
	const repair = page.getByRole('button', { name: /^Repair item/ });
	const redraw = page.getByRole('button', { name: /^Redraw item/ });
	const simulateRepairPlan = (tier: number) =>
		page.evaluate(async (tier) => {
			const appPath = '/src/lib/app.svelte.ts',
				queuePath = '/src/lib/pixellab/queue.ts';
			const { app } = await import(appPath),
				{ queue } = await import(queuePath);
			const balance = {
				...app.balance,
				subscription: { ...app.balance.subscription, plan: `Tier ${tier}`, status: 'active' }
			};
			app.balance = balance;
			queue.setBalance(balance, queue.key);
		}, tier);
	const expectRepairTiers = async (
		tierOneGens: number,
		tierTwoGens: number,
		redrawGens: number
	) => {
		await simulateRepairPlan(0);
		await expect(repair).toBeDisabled();
		await expect(redraw).toBeDisabled();
		await expect(repair).toHaveAttribute('aria-describedby', 'item-repair-tier');
		await expect(page.locator('#item-repair-tier')).toContainText('Tier 1 required');
		for (const [tier, gens] of [
			[1, tierOneGens],
			[2, tierTwoGens]
		]) {
			await simulateRepairPlan(tier);
			await expect(repair).toBeEnabled();
			await expect(redraw).toBeEnabled();
			await expect(redraw).toContainText(`~${redrawGens} gens`);
			await expect(repair).toContainText(`~${gens} gens`);
			await expect(page.locator('#item-repair-tier')).toHaveCount(0);
			const requests = page.getByText('This repair uses 3 PixelLab generation requests.', {
				exact: false
			});
			if (gens === 30) await expect(requests).toBeVisible();
			else await expect(requests).toHaveCount(0);
		}
	};
	await expectRepairTiers(10, 10, 10);
	await oversizedItemFixture(page, fixture.itemId);
	await expectRepairTiers(30, 15, 15);
	await repair.click();
	sheet = page.getByRole('dialog', { name: 'Repair item frames', exact: true });
	await expect(sheet).toContainText('Scoped repair stopped before paid work');
	const gridScope = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		return s.moving.spec;
	});
	expect(gridScope).toMatchObject({
		id: 'walk',
		dirs: ['east'],
		items: [fixture.itemId],
		itemMethod: 'grid'
	});
	expect(gridScope.replace).toBeUndefined();
	expect(posts).toEqual([]);
});

test('a repair whose later batch fails offers its finished repairs for free and keeps the rest', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	const outputs = new Map<string, Record<string, unknown>>();
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: {
						plan: 'Tier 1',
						type: 'generations',
						status: 'active',
						generations: 100,
						total: 100
					},
					credits: { type: 'usd', usd: 0 }
				}
			});
		if (request.method() === 'POST') {
			posts.push(path);
			// The second batch is refused, so only the first, paid batch comes back.
			if (path === '/v2/inpaint-v3' && posts.length === 1) {
				const id = 'offline-partial-repair-1';
				outputs.set(id, { image: request.postDataJSON().inpainting_image.image });
				return route.fulfill({ status: 202, json: { background_job_id: id } });
			}
			return route.fulfill({ status: 422, json: { detail: 'Synthetic batch refusal' } });
		}
		const id = path.split('/').at(-1)!;
		if (outputs.has(id))
			return route.fulfill({
				json: {
					id,
					status: 'completed',
					created_at: '',
					usage: { type: 'generations', generations: 10 },
					last_response: outputs.get(id)
				}
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-partial-repair-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const { itemId } = await targetedRepairFixture(page);
	// Sixteen walk frames need two Tier 1 grids (fifteen frames and one), so a later batch exists to fail.
	await page.evaluate(async (id) => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts';
		const state = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', state.doc.id),
			m = rec.manifest,
			walk = m.rig.animations.find((a: { id: string }) => a.id === 'walk'),
			count = walk.cells;
		walk.cells = count * 2;
		walk.frames = [
			...walk.frames,
			...walk.frames.map((f: { cell: number }) => ({ ...f, cell: f.cell + count }))
		];
		for (const source of Object.values(walk.sources ?? {}) as { keypoints?: unknown[] }[])
			if (source.keypoints) source.keypoints = [...source.keypoints, ...source.keypoints];
		for (const item of m.items) {
			for (const layer of item.layers)
				for (const [dir, row] of Object.entries(layer.cells?.walk ?? {}) as [string, unknown[]][])
					layer.cells.walk[dir] = [...row, ...row];
			for (const [dir, row] of Object.entries(item.baseCut?.walk ?? {}) as [string, unknown[]][])
				item.baseCut.walk[dir] = [...row, ...row];
			if (item.coverage)
				item.coverage = [
					...item.coverage,
					...item.coverage
						.filter((key: string) => key.startsWith('walk/'))
						.map((key: string) => {
							const [anim, dir, index] = key.split('/');
							return `${anim}/${dir}/${Number(index) + count}`;
						})
				];
			if (item.qa?.cells)
				for (const [key, cell] of Object.entries(item.qa.cells)) {
					const [anim, dir, index] = key.split('/');
					if (anim === 'walk') item.qa.cells[`walk/${dir}/${Number(index) + count}`] = cell;
				}
		}
		const sword = m.items.find((it: { id: string }) => it.id === id);
		sword.slot = 'torso_inner';
		sword.layers = sword.layers.slice(0, 1);
		await db.put('projects', state.doc.id, rec);
		await state.openProject(state.doc.id);
	}, itemId);
	const saved = () =>
		page.evaluate(async (id) => {
			const statePath = '/src/studio/state.svelte.ts',
				dbPath = '/src/lib/store/db.ts';
			const state = await import(statePath),
				db = await import(dbPath);
			const rec = await db.get('projects', state.doc.id);
			const item = rec.manifest.items.find((it: { id: string }) => it.id === id);
			return {
				west: item.layers[0].cells.walk.west as string[],
				east: item.layers[0].cells.walk.east as string[],
				provenance: item.provenance.length as number
			};
		}, itemId);
	const before = await saved();
	expect(before.west).toHaveLength(16);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		state.ui.anim = 'walk';
		state.ui.dir = 'west';
		state.ui.all = false;
		state.pick(id);
	}, itemId);
	await selectedItemDetails(page);
	await page.getByRole('button', { name: /^Repair item/ }).click();
	const review = page.getByRole('dialog', { name: 'Review item repair' });
	// The note names what is kept and why the later batch stopped.
	const stoppedNote = review.getByText(
		'A later batch stopped, so 1 frame keeps its current art (16). Nothing more was bought.'
	);
	await expect(stoppedNote).toBeVisible();
	await expect(stoppedNote).toContainText('did not finish (failed). It was not sent again.');
	const useFinished = review.getByRole('button', { name: 'Use finished repairs', exact: true });
	await expect(useFinished).toBeEnabled();
	await expect(review.getByRole('button', { name: 'Keep current', exact: true })).toBeEnabled();
	// Nothing was saved while the review waits, and the refused batch was not sent again.
	expect(await saved()).toEqual(before);
	expect(posts).toEqual(['/v2/inpaint-v3', '/v2/inpaint-v3']);
	await useFinished.click();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	const after = await saved();
	expect(after.east).toEqual(before.east);
	expect(after.west).toHaveLength(16);
	expect(after.west[15]).toBe(before.west[15]);
	expect(after.west.slice(0, 15)).not.toEqual(before.west.slice(0, 15));
	expect(after.provenance).toBe(before.provenance + 1);
	expect(posts).toEqual(['/v2/inpaint-v3', '/v2/inpaint-v3']);
});

test('paid item repair review survives reload and both decisions send no extra request', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	const outputs = new Map<string, Record<string, unknown>>();
	let plan = 'Tier 1';
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: {
						plan,
						type: 'generations',
						status: 'active',
						generations: 100,
						total: 100
					},
					credits: { type: 'usd', usd: 0 }
				}
			});
		if (request.method() === 'POST') {
			posts.push(path);
			if (path === '/v2/inpaint-v3') {
				const id = `offline-repair-review-${posts.length}`;
				outputs.set(id, { image: request.postDataJSON().inpainting_image.image });
				return route.fulfill({ status: 202, json: { background_job_id: id } });
			}
			if (path === '/v2/edit-images-v2') {
				const id = `offline-redraw-review-${posts.length}`;
				outputs.set(id, { images: [request.postDataJSON().edit_images[0].image] });
				return route.fulfill({ status: 202, json: { background_job_id: id } });
			}
		}
		const id = path.split('/').at(-1)!;
		if (outputs.has(id))
			return route.fulfill({
				json: {
					id,
					status: 'completed',
					created_at: '',
					usage: { type: 'generations', generations: 10 },
					last_response: outputs.get(id)
				}
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-repair-review-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const { itemId } = await targetedRepairFixture(page);
	const openRepair = async (action = /^Repair item/) => {
		await page.evaluate(async (id) => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			state.ui.anim = 'walk';
			state.ui.dir = 'west';
			state.ui.all = false;
			state.pick(id);
		}, itemId);
		await selectedItemDetails(page);
		await page.getByRole('button', { name: action }).click();
	};
	const saved = () =>
		page.evaluate(async (id) => {
			const statePath = '/src/studio/state.svelte.ts',
				dbPath = '/src/lib/store/db.ts';
			const state = await import(statePath),
				db = await import(dbPath);
			const rec = await db.get('projects', state.doc.id);
			const item = rec.manifest.items.find((it: { id: string }) => it.id === id);
			return {
				west: item.layers[0].cells.walk.west,
				east: item.layers[0].cells.walk.east,
				provenance: item.provenance.length
			};
		}, itemId);
	await page.evaluate(async (id) => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts';
		const state = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', state.doc.id),
			manifest = rec.manifest;
		const item = manifest.items.find((it: { id: string }) => it.id === id);
		item.slot = 'torso_inner';
		item.layers = item.layers.slice(0, 1);
		await db.put('projects', state.doc.id, rec);
		await state.openProject(state.doc.id);
	}, itemId);
	const before = await saved();
	await openRepair();
	const review = page.getByRole('dialog', { name: 'Review item repair' });
	await expect(review.getByRole('img', { name: 'Repaired frame 1', exact: true })).toBeVisible();
	await expect(review.getByRole('img', { name: 'Current frame 1', exact: true })).toBeVisible();
	expect(await saved()).toEqual(before);
	await review.getByRole('button', { name: 'Close', exact: true }).click();
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: /Review item repair/ }).click();
	await review.getByRole('button', { name: 'Keep current', exact: true }).click();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	expect(await saved()).toEqual(before);
	expect(posts).toEqual(['/v2/inpaint-v3']);
	await openRepair();
	await review.getByRole('button', { name: 'Use repaired frames', exact: true }).click();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	const after = await saved();
	expect(after.east).toEqual(before.east);
	expect(after.west).not.toEqual(before.west);
	expect(after.provenance).toBe(before.provenance + 1);
	expect(posts).toEqual(['/v2/inpaint-v3', '/v2/inpaint-v3']);
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move' && value.status === 'review')
				throw new Error('Synthetic review write failure');
			return put.call(this, value, key);
		};
	});
	await openRepair(/^Redraw item/);
	const redrawReview = page.getByRole('dialog', { name: 'Review item redraw' });
	await expect(
		redrawReview.getByRole('img', { name: 'Redrawn frame 1', exact: true })
	).toBeVisible();
	await expect(redrawReview).toContainText('its review could not be saved');
	plan = 'Free';
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: /Failed: tap for details/ }).click();
	await page.getByRole('button', { name: 'Use saved frames', exact: true }).click();
	await expect(
		redrawReview.getByRole('img', { name: 'Redrawn frame 1', exact: true })
	).toBeVisible();
	expect(await saved()).toEqual(after);
	await redrawReview.getByRole('button', { name: 'Use redrawn frames', exact: true }).click();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	expect(await saved()).toMatchObject({ east: before.east, provenance: after.provenance + 1 });
	expect(posts).toEqual(['/v2/inpaint-v3', '/v2/inpaint-v3', '/v2/edit-images-v2']);
});

test('the item sheet offers one priced edit-images-v2 request and holds its result for review', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	const outputs = new Map<string, Record<string, unknown>>();
	// A synthetic 92 px, four-direction character whose jeans have only their standing design (test/fixtures/item-sheet.ts).
	const character = await sheetCharacter(),
		views = ['south', 'east', 'north'] as const,
		measured = itemSheetWindows(
			character.manifest,
			character.images,
			character.manifest.items.find((it) => it.id === 'jeans')!,
			'walk',
			views
		)!,
		plan = itemSheetCells('walk', 'default', views, 6, measured),
		gens = itemSheetLayout(measured.cell, 3, 6)!.gens;
	await context.route('https://api.pixellab.ai/**', async (route) => {
		const request = route.request(),
			path = new URL(request.url()).pathname;
		if (path === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: {
						plan: 'Tier 1',
						type: 'generations',
						status: 'active',
						generations: 100,
						total: 100
					},
					credits: { type: 'usd', usd: 0 }
				}
			});
		if (request.method() === 'POST' && path === '/v2/edit-images-v2') {
			posts.push(path);
			const sent = await decodePngBytes(
				Buffer.from(request.postDataJSON().edit_images[0].image.base64, 'base64')
			);
			// The offline model draws the jeans on every frame, but redraws the body in the north row (a failed, usable view).
			const sheet = answer(sent, plan, measured.cell, character.jeans, (dir) =>
				dir === 'north' ? 'naked' : 'jeans'
			);
			const id = `offline-item-sheet-${posts.length}`,
				base64 = Buffer.from(await encodePngBytes(sheet)).toString('base64');
			outputs.set(id, { images: [{ type: 'base64', base64, format: 'png' }] });
			return route.fulfill({ status: 202, json: { background_job_id: id } });
		}
		const id = path.split('/').at(-1)!;
		if (outputs.has(id))
			return route.fulfill({
				json: {
					id,
					status: 'completed',
					created_at: '',
					usage: { type: 'generations', generations: 15 },
					last_response: outputs.get(id)
				}
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-item-sheet-key');
		localStorage.setItem('pixeldoll.developerMode', '1');
		localStorage.setItem(
			'pixeldoll.creation.moves',
			JSON.stringify({ model: 'skeleton-v3', frames: 'auto', itemDrawing: 'sheet' })
		);
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = {
		manifest: character.manifest,
		images: Object.fromEntries(
			await Promise.all(
				[...character.images].map(
					async ([h, im]) => [h, Buffer.from(await encodePngBytes(im)).toString('base64')] as const
				)
			)
		)
	};
	const projectId: string = await page.evaluate(async (raw) => {
		const statePath = '/src/studio/state.svelte.ts',
			createPath = '/src/studio/create.ts',
			pngPath = '/src/lib/image/pngraw.ts';
		const s = await import(statePath),
			create = await import(createPath),
			png = await import(pngPath);
		const images = new Map();
		for (const [h, b64] of Object.entries(raw.images as Record<string, string>))
			images.set(h, await png.decodePngBytes(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
		const id = await create.saveCopy({ manifest: raw.manifest, images }, 'Sheet fixture');
		await s.refreshProjects();
		await s.openProject(id);
		s.ui.anim = 'walk';
		s.pick('jeans');
		return id;
	}, fixture);
	const walkCells = () =>
		page.evaluate(async (id) => {
			const dbPath = '/src/lib/store/db.ts',
				db = await import(dbPath);
			const rec = await db.get('projects', id);
			return rec.manifest.items.find((it: { id: string }) => it.id === 'jeans').layers[0].cells
				.walk;
		}, projectId);
	const pane = await selectedItemDetails(page);
	const make = pane.getByRole('button', { name: /^Make for Walk/ });
	await expect(make).toContainText(`~${gens} gens`);
	await pane.getByRole('button', { name: 'Inspect API calls', exact: true }).click();
	const api = page.getByRole('dialog', { name: 'API calls', exact: true });
	await expect(api).toContainText('/edit-images-v2');
	await expect(api).toContainText('one sheet');
	await expect(api).not.toContainText('/edit-animation-v2');
	await api.getByRole('button', { name: 'Close API calls', exact: true }).click();
	await make.click();
	const review = page.getByRole('dialog', { name: 'Review item redraw' });
	await expect(review.getByRole('img', { name: 'Redrawn frame 6', exact: true })).toHaveCount(3);
	await expect(review).toContainText('North, frame 6');
	// The failed north view is shown, but kept only on request.
	await expect(
		review.getByRole('checkbox', {
			name: 'Also keep North, which did not pass their checks',
			exact: true
		})
	).not.toBeChecked();
	expect(await walkCells()).toBeUndefined();
	await review.getByRole('button', { name: 'Use redrawn frames', exact: true }).click();
	await expect
		.poll(async () => Object.keys((await walkCells()) ?? {}).sort())
		.toEqual(['east', 'south']);
	expect(posts).toEqual(['/v2/edit-images-v2']);
});

test('unsafe imported equipment prices its frozen route and discloses suspicious joints on held offers', async ({
	page,
	context
}, info) => {
	const posts: string[] = [],
		errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await context.route('https://api.pixellab.ai/**', (route) => {
		posts.push(route.request().method());
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest,
			item = m.items.find((i: { id: string }) => i.id === id);
		item.slot = 'torso_inner';
		const points = m.rig.rest.south.keypoints.map((p: { label: string }) => {
			const side = p.label.startsWith('LEFT') ? -1 : p.label.startsWith('RIGHT') ? 1 : 0;
			const joint = p.label.replace(/^(LEFT|RIGHT) /, '');
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
			)[joint];
			return { label: p.label, x: 0.5 + side * spread, y };
		});
		const bad = points.map((p: { label: string; x: number }) =>
			/SHOULDER|HIP/.test(p.label)
				? { ...p, x: 1 - p.x }
				: p.label === 'LEFT EAR'
					? { ...p, x: 0.62 }
					: p
		);
		m.rig.rest.south.keypoints = points;
		const walk = m.rig.animations.find((a: { id: string }) => a.id === 'walk');
		walk.sources.south = {
			route: 'import',
			keypoints: Array.from({ length: walk.cells }, (_, i) => (i === 1 ? bad : points))
		};
		for (const layer of item.layers) delete layer.cells.walk.south;
		item.coverage = item.coverage.filter((key: string) => !key.startsWith('walk/south/'));
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		s.ui.anim = 'walk';
		s.ui.dir = 'south';
		s.ui.all = false;
		s.wear(id);
		s.pick(id);
		s.ui.group = 'torso_inner';
	}, fixture.itemId);
	await inspectStage(page);
	const stageMake = page
		.locator('.stage-note')
		.getByRole('button', { name: /^Make missing views/ });
	await expect(stageMake).toContainText('~10 gens');
	await selectedItemDetails(page);
	await expect(page.getByRole('button', { name: /^Make for Walk/ })).toContainText('~10 gens');
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			item = rec.manifest.items.find((i: { id: string }) => i.id === id);
		item.slot = 'main_hand';
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		s.wear(id);
		s.pick(id);
	}, fixture.itemId);
	// A held item cannot use the frozen grid. It used to be refused here; it is now priced on its measured joints with the
	// suspicious frames named on the quote before anything is bought.
	await expect(page.getByRole('button', { name: /^Make for Walk/ })).toBeEnabled();
	await expect(page.getByRole('button', { name: /^Make for Walk/ })).toContainText('gens');
	await expect(
		page.locator('.notice').filter({ hasText: 'Some measured joints look unusual' }).first()
	).toContainText('frame 2');
	await page
		.getByRole('dialog', { name: 'Item', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await inspectStage(page);
	await expect(stageMake).toBeEnabled();
	await expect(
		page.locator('.stage-note .notice').filter({ hasText: 'Some measured joints look unusual' })
	).toBeVisible();
	expect(posts).toEqual([]);
	expect(errors).toEqual([]);
});

test('deferred item repair refuses changed artwork and price after Connect', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (route) => {
		if (
			route.request().method() === 'GET' &&
			new URL(route.request().url()).pathname.endsWith('/balance')
		)
			await route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(route.request().method());
			await route.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.ui.anim = 'walk';
		s.ui.dir = 'west';
		s.pick(id);
	}, fixture.itemId);
	await selectedItemDetails(page);
	const repair = page.getByRole('button', { name: /^Repair item/ });
	await expect(repair).toContainText('~10 gens');
	await repair.click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await oversizedItemFixture(page, fixture.itemId);
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-delayed-item-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Repair item frames', exact: true })).toContainText(
		'review its current estimate'
	);
	expect(posts).toEqual([]);
});

test('reviewed joint-check recovery reuses cached body identity, discloses charges and persists consent before work', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const { itemId } = await targetedRepairFixture(page);
	const original = await page.evaluate(async (itemId) => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const projectPath = '/src/lib/store/project.ts',
			projectModule = await import(projectPath),
			posePath = '/src/lib/rig/poses.ts',
			poses = await import(posePath);
		const clipPath = '/src/lib/rig/clips.ts',
			clips = await import(clipPath),
			createPath = '/src/studio/create.ts',
			create = await import(createPath);
		const queuePath = '/src/lib/pixellab/queue.ts',
			q = await import(queuePath),
			routePath = '/src/lib/pixellab/routes.ts',
			routes = await import(routePath);
		const normPath = '/src/lib/rig/normalize.ts',
			norm = await import(normPath),
			pngPath = '/src/lib/image/pngraw.ts',
			pngRaw = await import(pngPath);
		const spec = {
			id: 'slash',
			action: 'slash',
			frames: 8,
			items: [itemId],
			seed: 421,
			replace: true,
			dirs: ['west'],
			poseStyle: 'visible-side-v1'
		};
		const { rec, project } = await projectModule.loadProject(s.doc.id),
			rig = rec.manifest.rig,
			rest = rig.rest.west,
			image = project.images.get(rest.image);
		const keypoints = poses
			.authoredPoses(
				spec.action,
				poses.fromApi(rest.keypoints, rig.cell),
				'west',
				rig.cell.w,
				spec.poseStyle
			)
			.map((p: unknown) => poses.toApi(p, rig.cell));
		const req = clips.rawClip({
			first: await create.b64(image),
			rest: rest.keypoints,
			keypoints,
			description: rec.character.looks,
			action: 'slash, empty hands, no weapon, no props, no effects',
			dir: 'west',
			seed: spec.seed + 101,
			view: rig.view
		});
		const sha = await db.putBlob(await pngRaw.encodePngBytes(image));
		const secondImage = { ...image, data: new Uint8ClampedArray(image.data) };
		for (let i = 0; i < secondImage.data.length; i += 4)
			if (secondImage.data[i + 3]) {
				secondImage.data[i] ^= 32;
				break;
			}
		const secondSha = await db.putBlob(await pngRaw.encodePngBytes(secondImage));
		const raw = {
			id: 'offline-body-done',
			tag: 'studio-move',
			method: req.method,
			endpoint: req.path,
			...(await q.requestIdentity(req)),
			state: 'done',
			attempts: 1,
			nextAt: 0,
			createdAt: Date.now(),
			jobs: [
				{
					id: 'offline-results',
					status: 'done',
					done: true,
					results: keypoints.map((_: unknown, i: number) => ({
						label: String(i),
						sha: i ? secondSha : sha
					}))
				}
			],
			gens: 3,
			usd: 0
		};
		await db.put('jobs', raw.id, raw);
		const clean = clips.largestComponent(norm.normalize(image, 64, 64, 128, 64).img).img;
		const estimate = routes.routes.estimateSkeleton(routes.png(await create.b64(clean)));
		const lost = {
			id: 'offline-joint-lost',
			tag: 'studio-move',
			method: estimate.method,
			endpoint: estimate.path,
			...(await q.requestIdentity(estimate)),
			state: 'lost',
			attempts: 1,
			nextAt: 0,
			createdAt: Date.now() + 1,
			submittedAt: Date.now(),
			jobs: [],
			gens: 0,
			usd: 0,
			error: 'Synthetic HTTP 500; unknown paid outcome'
		};
		await db.put('jobs', lost.id, lost);
		const secondClean = clips.largestComponent(
			norm.normalize(secondImage, 64, 64, 128, 64).img
		).img;
		const pendingReq = routes.routes.estimateSkeleton(routes.png(await create.b64(secondClean)));
		await db.put('jobs', 'offline-joint-pending', {
			...lost,
			id: 'offline-joint-pending',
			state: 'queued',
			attempts: 0,
			...(await q.requestIdentity(pendingReq))
		});
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: s.doc.id,
			spec,
			status: 'failed',
			error: 'Joint-check outcome unknown',
			progress: { step: 'save', done: 0, total: 1, recIds: [] }
		});
		return { spec, projectId: s.doc.id };
	}, itemId);
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const record = await db.get('projects', state.doc.id),
			excluded = new Set(
				Object.values(record.manifest.rig.rest as Record<string, { image: string }>).map((rest) =>
					rest.image.slice(7)
				)
			);
		for (const job of await db.all('jobs'))
			for (const sub of job.jobs ?? [])
				for (const result of sub.results ?? []) excluded.add(result.sha);
		const hash = record.manifest.items
			.filter((item: { id: string }) => item.id !== record.manifest.rig.baseItem)
			.flatMap((item: { layers: { cells: Record<string, Record<string, string[]>> }[] }) =>
				item.layers.flatMap((layer) =>
					Object.values(layer.cells).flatMap((dirs) => Object.values(dirs).flat())
				)
			)
			.find((hash: string) => hash && !excluded.has(hash.slice(7)));
		if (!hash) throw new Error('Recovery fixture needs unrelated equipment pixels');
		const original = IDBObjectStore.prototype.get,
			audit: {
				reads: number;
				stacks: string[];
				failRest: boolean;
				pauseRest: boolean;
				ready: boolean;
				release: () => void;
			} = {
				reads: 0,
				stacks: [],
				failRest: true,
				pauseRest: true,
				ready: false,
				release: () => {
					throw new Error('Standing image read is not ready');
				}
			},
			restHash = record.manifest.rig.rest.west.image.slice(7);
		(window as unknown as { recoveryBlobAudit: typeof audit }).recoveryBlobAudit = audit;
		IDBObjectStore.prototype.get = function (query) {
			if (this.name === 'blobs' && query === hash.slice(7)) {
				const error = new Error('Unrelated equipment must not be decoded for recovery');
				audit.reads++;
				audit.stacks.push(error.stack ?? error.message);
				throw error;
			}
			if (this.name === 'blobs' && query === restHash && audit.failRest) {
				audit.failRest = false;
				throw new Error('Synthetic standing image storage failure');
			}
			if (this.name === 'blobs' && query === restHash && audit.pauseRest) {
				audit.pauseRest = false;
				const transaction = this.transaction;
				Object.defineProperty(transaction, 'oncomplete', {
					set(callback: (this: IDBTransaction, event: Event) => void) {
						transaction.addEventListener(
							'complete',
							(event) => {
								audit.ready = true;
								audit.release = () => callback.call(transaction, event);
							},
							{ once: true }
						);
					}
				});
			}
			return original.call(this, query);
		};
	});
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	const sheet = page.getByRole('dialog', { name: /^Redraw / });
	await expect(sheet).toContainText('Joint-check outcome unknown');
	await expect(sheet.getByText('Posing your items', { exact: true })).not.toHaveClass(/\bdone\b/);
	// A failed review read is shown with a free Try again; Generate again stays available (startMove guards live requests).
	await expect(sheet).toContainText('Your paid results could not be read');
	await expect(sheet.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	await expect(sheet.getByRole('status')).toHaveText('Checking cached frames…');
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { recoveryBlobAudit: { ready: boolean } }).recoveryBlobAudit.ready
			)
		)
		.toBe(true);
	await page.evaluate(() =>
		(
			window as unknown as { recoveryBlobAudit: { release: () => void } }
		).recoveryBlobAudit.release()
	);
	await expect(sheet).toContainText(
		'Wait for the current joint checks to finish before recovering them.'
	);
	// Deliberately changed (soft gates): the queued sibling check is still live, so the paid-result review holds its choices
	// and says so, even though another check of that view was lost.
	await expect(sheet.getByRole('status')).toHaveText(
		'Some paid requests are still running at PixelLab. These choices unlock when they finish.'
	);
	await expect(sheet.getByRole('button', { name: 'Retry joint checks', exact: true })).toHaveCount(
		0
	);
	await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath),
			statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath),
			qPath = '/src/lib/pixellab/queue.ts',
			q = await import(qPath);
		const row = await db.get('jobs', 'offline-joint-pending'),
			rec = await db.get('projects', s.doc.id);
		row.state = 'done';
		row.response = { keypoints: rec.manifest.rig.rest.west.keypoints };
		await db.put('jobs', row.id, row);
		await q.queue.load();
	});
	const diagnosis = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			c = '/src/studio/create.ts',
			create = await import(c);
		try {
			return await create.measurementRecoveryPlan(s.moving.projectId, s.moving.spec);
		} catch (e) {
			return String(e);
		}
	});
	expect(diagnosis).toMatchObject({ checks: 1, recordIds: ['offline-joint-lost'] });
	expect(diagnosis.checkHashes).toHaveLength(1);
	await expect(
		sheet.getByRole('button', { name: 'Retry joint checks', exact: true })
	).toBeVisible();
	const audited = await page.evaluate(
		() =>
			(window as unknown as { recoveryBlobAudit: { reads: number; stacks: string[] } })
				.recoveryBlobAudit
	);
	expect(audited.reads, audited.stacks.join('\n')).toBe(0);
	await expect(sheet).toContainText('Retry 1 unfinished joint check ·');
	await expect(sheet).toContainText('estimated 0.1 gens or $0.005');
	await expect(sheet).toContainText(
		'Unknown checks may already have charged; retrying can charge again'
	);
	await sheet.getByRole('button', { name: 'Retry joint checks', exact: true }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await expect(connect).toBeVisible();
	await connect.getByRole('button', { name: 'Close', exact: true }).click();
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	await expect(
		sheet.getByRole('button', { name: 'Retry joint checks', exact: true })
	).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as unknown as { recoveryBlobAudit: { reads: number } }).recoveryBlobAudit.reads
		)
	).toBe(0);
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move' && value.status === 'running')
				throw new Error('Offline consent storage blocked');
			return put.call(this, value, key);
		};
	});
	await sheet.getByRole('button', { name: 'Retry joint checks', exact: true }).click();
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-measurement-recovery-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(sheet).toContainText('Offline consent storage blocked');
	const pending = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		return { spec: s.moving.spec, projectId: s.moving.projectId };
	});
	expect(pending.projectId).toBe(original.projectId);
	expect(pending.spec).toMatchObject(original.spec);
	expect(pending.spec.measurementRecovery).toMatchObject({
		recordIds: ['offline-joint-lost'],
		checkHashes: diagnosis.checkHashes
	});
	expect(pending.spec.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/);
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	const currentRig = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const queuePath = '/src/lib/pixellab/queue.ts',
			q = await import(queuePath),
			replacePath = '/src/studio/replaceMove.ts',
			replace = await import(replacePath);
		const rec = await db.get('projects', s.doc.id);
		for (const id of ['offline-joint-lost', 'offline-joint-pending']) {
			const row = await db.get('jobs', id);
			row.state = 'done';
			row.response = { keypoints: rec.manifest.rig.rest.west.keypoints };
			delete row.error;
			await db.put('jobs', id, row);
		}
		rec.manifest.rig.pivot.x++; // Invalidate old consent without changing standing pixels or the cached requests.
		await db.put('projects', rec.id, rec);
		s.store.project = { ...s.store.project, manifest: rec.manifest };
		await q.queue.load();
		s.ui.sheet = 'move';
		return replace.moveRigVersion(rec);
	});
	// The completed cached slash frames touch the border, so reusing them as-is would fail the body checks.
	// The free choice is to review and keep them, never a paid retry.
	const keep = sheet.getByRole('button', { name: 'Keep frames', exact: true });
	await expect(keep).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Reuse cached frames', exact: true })).toHaveCount(
		0
	);
	await expect(sheet.getByRole('button', { name: 'Retry joint checks', exact: true })).toHaveCount(
		0
	);
	await expect(sheet.getByRole('button', { name: 'Discard', exact: true })).toBeVisible();
	await expect(sheet).toContainText(
		'Keep saves them as they are, body only, with no PixelLab request.'
	);
	await expect(sheet).toContainText('opaque pixels touch the frame border; check framing');
	await expect(sheet.getByRole('img', { name: /frame 1$/ })).toBeVisible();
	await expect(sheet).not.toContainText('Unknown checks may already have charged');
	await keep.click();
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				return s.moving.spec?.measurementRecovery?.keep?.qaHash?.length;
			})
		)
		.toBe(64);
	await expect(sheet).toContainText('Offline consent storage blocked');
	const reused = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		return s.moving.spec;
	});
	expect(reused).toMatchObject({ ...original.spec, items: [] });
	expect(reused.measurementRecovery).toMatchObject({
		recordIds: [],
		checkHashes: [],
		rigVersion: currentRig
	});
	expect(reused.measurementRecovery.keep.qaHash).toMatch(/^[a-f0-9]{64}$/);
	expect(reused.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/);
	expect(reused.measurementRecovery.id).not.toBe(pending.spec.measurementRecovery.id);
	expect(reused.measurementRecovery.rigVersion).not.toBe(
		pending.spec.measurementRecovery.rigVersion
	);
	expect(
		await page.evaluate(
			() => (window as unknown as { recoveryBlobAudit: { reads: number } }).recoveryBlobAudit.reads
		)
	).toBe(0);
	expect(posts).toEqual([]);
	expect(errors).toEqual([]);
});

test('bounded body color correction discloses changed checks and equipment cost before durable consent', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 42, total: 100 },
					credits: { usd: 1 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	const original = await page.evaluate(async (itemId) => {
		const sPath = '/src/studio/state.svelte.ts',
			s = await import(sPath),
			dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const pPath = '/src/lib/store/project.ts',
			projectModule = await import(pPath),
			posePath = '/src/lib/rig/poses.ts',
			poses = await import(posePath);
		const clipPath = '/src/lib/rig/clips.ts',
			clips = await import(clipPath),
			cPath = '/src/studio/create.ts',
			create = await import(cPath);
		const qPath = '/src/lib/pixellab/queue.ts',
			q = await import(qPath),
			rPath = '/src/lib/pixellab/routes.ts',
			routes = await import(rPath);
		const pngPath = '/src/lib/image/png.ts',
			png = await import(pngPath),
			rawPath = '/src/lib/image/pngraw.ts',
			rawPng = await import(rawPath);
		const restImage = png.makeImg(64, 64);
		for (let y = 12; y < 60; y++)
			for (let x = 25; x < 39; x++) restImage.data.set([0, 0, 0, 255], (y * 64 + x) * 4);
		for (let i = 0; i < 8; i++)
			restImage.data.set([32 * i, 32 * i, 32 * i, 255], (13 * 64 + 25 + i) * 4);
		const rec = await db.get('projects', s.doc.id);
		rec.manifest.rig.rest.west.image =
			'sha256:' + (await db.putBlob(await rawPng.encodePngBytes(restImage)));
		await db.put('projects', s.doc.id, rec);
		const { project } = await projectModule.loadProject(s.doc.id),
			rig = rec.manifest.rig,
			rest = rig.rest.west,
			image = project.images.get(rest.image);
		const spec = {
			id: 'slash',
			action: 'slash',
			frames: 8,
			items: [itemId],
			seed: 421,
			replace: true,
			dirs: ['west'],
			poseStyle: 'visible-side-v1'
		};
		const keypoints = poses
			.authoredPoses(
				spec.action,
				poses.fromApi(rest.keypoints, rig.cell),
				'west',
				rig.cell.w,
				spec.poseStyle
			)
			.map((p: unknown) => poses.toApi(p, rig.cell));
		const req = clips.rawClip({
			first: await create.b64(image),
			rest: rest.keypoints,
			keypoints,
			description: rec.character.looks,
			action: 'slash, empty hands, no weapon, no props, no effects',
			dir: 'west',
			seed: spec.seed + 101,
			view: rig.view
		});
		const results = [];
		for (let i = 0; i < keypoints.length; i++) {
			const frame = { ...image, data: new Uint8ClampedArray(image.data) };
			frame.data.set([32 * i, 32 * i, 32 * i, 255], (14 * 64 + 25) * 4);
			for (let n = 0; n < 27; n++)
				frame.data.set([13, 5, 2, 255], ((20 + Math.floor(n / 14)) * 64 + 25 + (n % 14)) * 4);
			results.push({ label: String(i), sha: await db.putBlob(await rawPng.encodePngBytes(frame)) });
			const estimate = routes.routes.estimateSkeleton(routes.png(await create.b64(frame)));
			const row = {
				id: 'palette-original-check-' + i,
				tag: 'studio-rig',
				method: estimate.method,
				endpoint: estimate.path,
				...(await q.requestIdentity(estimate)),
				state: 'done',
				attempts: 1,
				nextAt: 0,
				createdAt: Date.now(),
				jobs: [],
				response: { keypoints: keypoints[i] },
				gens: 0.1,
				usd: 0
			};
			await db.put('jobs', row.id, row);
		}
		await db.put('jobs', 'palette-cached-body', {
			id: 'palette-cached-body',
			tag: 'studio-rig',
			method: req.method,
			endpoint: req.path,
			...(await q.requestIdentity(req)),
			state: 'done',
			attempts: 1,
			nextAt: 0,
			createdAt: Date.now(),
			jobs: [{ id: 'palette-offline-results', status: 'done', done: true, results }],
			gens: 3,
			usd: 0
		});
		await db.put('projects', 'studio-move', {
			id: 'studio-move',
			projectId: s.doc.id,
			spec,
			status: 'failed',
			error: 'Palette fit failed; existing body kept'
		});
		return { spec, projectId: s.doc.id };
	}, fixture.itemId);
	await reloadStudio(page);
	await expect(page.locator('.world-actors').first()).toBeVisible();
	await expect
		.poll(async () =>
			page.evaluate(async () => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				return s.moving.error;
			})
		)
		.toBe('Palette fit failed; existing body kept');
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	const sheet = page.getByRole('dialog', { name: /^Redraw / });
	await expect(sheet).toContainText('Palette fit failed; existing body kept');
	const action = sheet.getByRole('button', { name: 'Match body colors', exact: true });
	await expect(action).toBeVisible();
	await expect(sheet).toContainText('Match 216 nearby color pixels');
	await expect(sheet).toContainText('8 cached West frames');
	await expect(sheet).toContainText('estimated 0.8 gens or $0.041');
	await expect(sheet).toContainText('estimated 3 additional gens');
	await expect(sheet).toContainText('Existing body views are kept if a check still fails');
	await action.click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab' });
	await connect.getByRole('button', { name: 'Close', exact: true }).click();
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.ui.sheet = 'move';
	});
	await expect(action).toBeVisible();
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move' && value.status === 'running')
				throw new Error('Color consent storage blocked');
			return put.call(this, value, key);
		};
	});
	await action.click();
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-body-color-key');
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(sheet).toContainText('Color consent storage blocked');
	const consent = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		return s.moving.spec;
	});
	expect(consent).toMatchObject(original.spec);
	expect(consent.bodyPaletteRepair).toMatchObject({ version: 'near-rest-v1' });
	expect(consent.bodyPaletteRepair.checkHashes).toHaveLength(8);
	expect(new Set(consent.bodyPaletteRepair.checkHashes).size).toBe(8);
	expect(
		consent.bodyPaletteRepair.checkHashes.every((hash: string) => /^[a-f0-9]{64}$/.test(hash))
	).toBe(true);
	expect(consent.bodyPaletteRepair.id).toMatch(/^[a-f0-9-]{36}$/);
	expect(consent.measurementRecovery).toBeUndefined();
	await sheet.getByRole('button', { name: /^Generate again · ~[1-9]\d* gens$/ }).click();
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p);
				return s.moving.spec?.seed;
			})
		)
		.not.toBe(original.spec.seed);
	const fresh = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		return s.moving.spec;
	});
	expect(fresh.seed).not.toBe(original.spec.seed);
	expect(fresh.bodyPaletteRepair).toBeUndefined();
	expect(fresh.measurementRecovery).toBeUndefined();
	expect(posts).toEqual([]);
	expect(errors).toEqual([]);
});

test('standing-first items quote only standing and offer actual custom moves one at a time', async ({
	page,
	context
}, info) => {
	await page.addInitScript(() => localStorage.setItem('pixeldoll.developerMode', '1'));
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', async (r) => {
		if (r.request().method() === 'GET' && new URL(r.request().url()).pathname.endsWith('/balance'))
			await r.fulfill({
				json: {
					subscription: {
						type: 'generations',
						status: 'active',
						plan: 'Tier 3',
						generations: 1000,
						total: 1000
					},
					credits: { usd: 0 }
				}
			});
		else {
			posts.push(r.request().method());
			await r.abort();
		}
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		// Priced as posed on a separate body until Settings switches to drawing on the move frames below.
		localStorage.setItem(
			'pixeldoll.creation.moves',
			JSON.stringify({ model: 'skeleton-v3', frames: 'auto', itemDrawing: 'skeleton' })
		);
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page);
	await page.evaluate(async (id) => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			s = await import(statePath),
			db = await import(dbPath);
		const rec = await db.get('projects', s.doc.id),
			m = rec.manifest,
			item = m.items.find((i: { id: string }) => i.id === id);
		for (const a of m.rig.animations)
			if (a.id !== 'default') {
				const before = a.id,
					after = 'custom_' + before.replaceAll('-', '_');
				a.id = after;
				for (const it of m.items)
					for (const layer of it.layers)
						if (layer.cells?.[before]) {
							layer.cells[after] = layer.cells[before];
							delete layer.cells[before];
						}
			}
		for (const layer of item.layers) {
			layer.cells = { default: layer.cells.default };
			if (layer.cells.default) delete layer.cells.default.north;
		}
		item.standing = 'default';
		await db.put('projects', s.doc.id, rec);
		await s.openProject(s.doc.id);
		s.pick(id);
	}, fixture.itemId);
	await newItem(page, 'Main hand');
	const newSheet = page.getByRole('dialog', { name: 'New item', exact: true });
	await newSheet.getByRole('textbox', { name: 'What is it?', exact: true }).fill('a steel sword');
	await expect(newSheet).toContainText('Make the standing design first');
	await newSheet.getByRole('button', { name: 'Inspect API calls', exact: true }).click();
	const peek = page.getByRole('dialog', { name: 'API calls', exact: true });
	await expect(peek.getByText('Dress standing views', { exact: false })).toBeVisible();
	await expect(peek.getByText('Pose equipment', { exact: false })).toHaveCount(0);
	await peek.getByRole('button', { name: 'Close API calls', exact: true }).click();
	// The typed prompt asks before it is dropped.
	await newSheet.getByRole('button', { name: 'Close', exact: true }).click();
	await page
		.getByRole('alertdialog', { name: 'Discard changes?', exact: true })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	// A saved move counts its drawn items and offers the missing ones together; Standing never needs it.
	await selectPlaybackClip(page, 'custom_walk');
	await equipmentMode(page, 'Moves');
	await expect(page.getByRole('button', { name: /^Custom walk preview/ })).toContainText(
		'0 of 6 items drawn'
	);
	await page.getByRole('button', { name: 'More actions for Custom walk', exact: true }).click();
	await page.getByRole('menuitem', { name: /^Generate items/ }).click();
	const picker = page.getByRole('dialog', { name: 'Generate items for Custom walk', exact: true });
	const pickerRow = picker.getByRole('button', { name: new RegExp(fixture.itemName) });
	await expect(pickerRow).toContainText('12 gens');
	await expect(picker.getByRole('button', { name: 'Generate items', exact: true })).toBeDisabled();
	await pickerRow.click();
	await expect(picker).toContainText('~12 more gens');
	await picker.getByRole('button', { name: 'Generate 1 item', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await equipmentMode(page, 'States');
	await page.getByRole('button', { name: 'More actions for Standing', exact: true }).click();
	await expect(page.getByRole('menuitem', { name: /^Rename/ })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: /^Generate items/ })).toHaveCount(0);
	await page.keyboard.press('Escape');
	// The dimmed tile asks instead of switching Preview to Standing: draw it for this move, or wear it anyway.
	await equipmentGroup(page, 'Main hand');
	const tile = page.locator(`[data-tile="${fixture.itemId}"]`);
	const choice = page.locator('#item-choice');
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	await expect(tile).toHaveAttribute('aria-haspopup', 'menu');
	await tile.click();
	await expect(tile).toHaveAttribute('aria-expanded', 'true');
	const generateFor = choice.getByRole('menuitem', { name: /^Generate for Custom walk/ });
	await expect(generateFor).toContainText('~12 gens');
	await generateFor.click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await tile.click();
	await choice.getByRole('menuitem', { name: 'Take off', exact: true }).click();
	await expect(tile).toHaveAttribute('aria-pressed', 'false');
	await expect(playbackPicker(page)).toHaveAttribute('value', 'custom_walk');
	await tile.click();
	// Wear names where Preview goes to show it.
	await choice.getByRole('menuitem', { name: 'Wear for Standing', exact: true }).click();
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	await expect(playbackPicker(page)).toHaveAttribute('value', 'default');
	await expect(tile).not.toHaveAttribute('aria-haspopup');
	// Items drawn on a saved move show on its row and their tiles, never as rows of their own.
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path),
			spec = { id: 'custom_walk', items: [id], frames: 4, seed: 1, itemsOnly: true };
		s.moving.projectId = s.doc.id;
		s.moving.progress = {
			step: 'items',
			done: 1,
			total: 4,
			recIds: [],
			items: { [id]: { done: 1, total: 4 } },
			item: id
		};
		s.moving.spec = spec;
		s.moving.queued = [{ projectId: s.doc.id, spec: { ...spec, id: 'custom_cross_punch' } }];
	}, fixture.itemId);
	await expect(tile).toHaveAccessibleName(/drawing for Custom walk, 25%/);
	await expect(tile).toContainText('25%');
	await equipmentMode(page, 'Moves');
	await expect(page.getByRole('button', { name: /^Custom walk preview/ })).toContainText(
		`Drawing ${fixture.itemName}`
	);
	await expect(page.getByRole('button', { name: /^Custom cross punch preview/ })).toContainText(
		'1 item queued'
	);
	await expect(
		page.getByRole('button', { name: new RegExp(` · ${fixture.itemName}`) })
	).toHaveCount(0);
	// The tab with the work carries a dot, red when its job failed; More only marks work the tabs do not show, with the
	// same 6px dot.
	const movesTab = page.locator('#customization-tab-moves'),
		statesTab = page.locator('#customization-tab-states'),
		more = page.getByRole('button', { name: 'More options', exact: true });
	const dot = (target: Locator, pseudo: string) =>
		target.evaluate((node, pseudo) => {
			const probe = document.createElement('i');
			probe.style.color = 'var(--bu-danger)';
			node.append(probe);
			const danger = getComputedStyle(probe).color;
			probe.remove();
			const owner = pseudo === 'label' ? node.querySelector('.bu-tab-label')! : node;
			const color = getComputedStyle(owner, '::after').backgroundColor;
			if (getComputedStyle(owner, '::after').content === 'none') return 'none';
			return color === danger ? 'red' : 'accent';
		}, pseudo);
	await expect(movesTab).toHaveAttribute('data-activity', 'busy');
	await expect(statesTab).not.toHaveAttribute('data-activity');
	await expect(more).not.toHaveAttribute('data-activity');
	expect(await dot(movesTab, 'label')).toBe('accent');
	await expect(movesTab).toHaveAccessibleDescription(
		'Work here is running, waiting or ready to review'
	);
	// Outside Preview, Moves and States are disabled, so their work moves to More's dot.
	await page.getByRole('button', { name: 'Top-down', exact: true }).click();
	await expect(movesTab).not.toHaveAttribute('data-activity');
	await expect(more).toHaveAttribute('data-activity', 'busy');
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	await equipmentMode(page, 'Moves');
	await expect(movesTab).toHaveAttribute('data-activity', 'busy');
	await expect(more).not.toHaveAttribute('data-activity');
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.moving.queued = [
			...s.moving.queued,
			{
				projectId: s.doc.id,
				spec: { id: 'default', items: [id], frames: 1, seed: 1, itemsOnly: true }
			}
		];
		s.moving.error = 'synthetic failure';
	}, fixture.itemId);
	await expect(statesTab).toHaveAttribute('data-activity', 'busy');
	await expect(movesTab).toHaveAttribute('data-activity', 'stopped');
	await expect(more).not.toHaveAttribute('data-activity');
	expect(await dot(movesTab, 'label')).toBe('red');
	expect(await dot(statesTab, 'label')).toBe('accent');
	await expect(movesTab).toHaveAccessibleDescription('Work here needs attention');
	// This character's item drafts mark Wardrobe (gold, red when one failed); another character's mark More instead.
	const wardrobeTab = page.locator('#customization-tab-wardrobe');
	const draft = (phase: string, own: boolean) =>
		page.evaluate(
			async ({ phase, own }) => {
				const path = '/src/studio/state.svelte.ts',
					s = await import(path);
				s.gens.splice(0, s.gens.length, {
					phase,
					status: '',
					draft: {
						rigId: own ? s.doc.id : 'another-character',
						spec: { id: 'dot-draft' },
						calls: []
					},
					input: { slot: 'head', name: 'Dot draft' }
				});
			},
			{ phase, own }
		);
	await draft('running', true);
	await expect(wardrobeTab).toHaveAttribute('data-activity', 'busy');
	expect(await dot(wardrobeTab, 'label')).toBe('accent');
	await expect(more).not.toHaveAttribute('data-activity');
	await draft('failed', true);
	await expect(wardrobeTab).toHaveAttribute('data-activity', 'stopped');
	expect(await dot(wardrobeTab, 'label')).toBe('red');
	await expect(more).not.toHaveAttribute('data-activity');
	await draft('running', false);
	await expect(wardrobeTab).not.toHaveAttribute('data-activity');
	await expect(more).toHaveAttribute('data-activity', 'busy');
	expect(await dot(more, 'button')).toBe('accent');
	const size = (target: Locator, pseudo: string) =>
		target.evaluate((node, pseudo) => {
			const after = getComputedStyle(
				pseudo === 'label' ? node.querySelector('.bu-tab-label')! : node,
				'::after'
			);
			return [after.width, after.height];
		}, pseudo);
	expect(await size(more, 'button')).toEqual(await size(movesTab, 'label'));
	await draft('failed', false);
	await expect(more).toHaveAttribute('data-activity', 'stopped');
	expect(await dot(more, 'button')).toBe('red');
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.gens.splice(0, s.gens.length);
	});
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			s = await import(path);
		s.moving.queued = [];
		s.moving.spec = null;
		s.moving.progress = null;
		s.moving.error = '';
	});
	await expect(page.getByRole('button', { name: /^Custom walk preview/ })).toContainText(
		'0 of 6 items drawn'
	);
	await expect(movesTab).not.toHaveAttribute('data-activity');
	await expect(statesTab).not.toHaveAttribute('data-activity');
	await expect(more).not.toHaveAttribute('data-activity');
	expect(posts).toEqual([]);
	const coverage = page.getByRole('button', { name: /equipped items? needs? frames/ });
	await selectPlaybackClip(page, 'default');
	await page.getByRole('button', { name: 'Face north', exact: true }).click();
	await expect(coverage).toBeVisible();
	await page.getByRole('button', { name: 'Top-down', exact: true }).click();
	await expect(page.locator('.world-coverage')).toContainText('hidden (missing frames)');
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	await expect(coverage).toBeVisible();
	await page.setViewportSize({ width: 844, height: 390 });
	await selectPlaybackClip(page, 'custom_walk');
	await expect(coverage).toBeInViewport();
	await coverage.click();
	const gaps = page.locator('#preview-coverage');
	await expect(gaps).toContainText('Missing frames for Custom walk');
	const missingItem = gaps.getByRole('button', { name: fixture.itemName, exact: true });
	await expect(missingItem).toBeInViewport();
	await missingItem.click();
	await page.setViewportSize({ width: 1440, height: 900 });
	const pane = page.getByRole('dialog', { name: 'Item', exact: true });
	const moves = pane.getByRole('combobox', { name: 'Generate item for move', exact: true });
	await expect(moves.locator('option')).toHaveText(['Custom walk', 'Custom cross punch']);
	await moves.selectOption('custom_walk');
	await expect(pane.getByRole('button', { name: /^Make for Custom walk/ })).toContainText(
		'~12 gens'
	);
	// Coverage marks each move this item is drawn for, and one action fills every missing move together.
	await openItemSection(pane, 'Quality checks');
	const coverageList = pane.getByRole('list', { name: 'Move coverage', exact: true });
	await expect(coverageList.getByRole('listitem', { name: 'Standing: missing' })).toBeVisible();
	await expect(coverageList.getByRole('listitem', { name: 'Custom walk: missing' })).toBeVisible();
	await expect(
		coverageList.getByRole('listitem', { name: 'Custom cross punch: missing' })
	).toBeVisible();
	await expect(pane.getByText('Missing 3 moves', { exact: true })).toBeVisible();
	const fillMissing = pane.getByRole('button', { name: /^Fill missing moves/ });
	await expect(fillMissing).toContainText('~15 gens');
	await fillMissing.click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		(await import(path)).ui.sheet = 'item';
	});
	const peekCalls = async (endpoint: string, other: string) => {
		await pane.getByRole('button', { name: 'Inspect API calls', exact: true }).click();
		const api = page.getByRole('dialog', { name: 'API calls', exact: true });
		await expect(api).toContainText(endpoint);
		await expect(api).not.toContainText(other);
		await api.getByRole('button', { name: 'Close API calls', exact: true }).click();
	};
	await peekCalls('/animate-with-skeleton-v3', '/edit-animation-v2');
	// Settings > Creation > Moves now draws items on the move's own frames: the open offer follows it.
	await page.evaluate(async () => {
		const path = '/src/studio/settingsDefaults.svelte.ts';
		localStorage.setItem(
			'pixeldoll.creation.moves',
			JSON.stringify({ model: 'skeleton-v3', frames: 'auto', itemDrawing: 'anchor' })
		);
		(await import(path)).noteCreationSettings();
	});
	await expect(pane.getByRole('button', { name: /^Make for Custom walk/ })).not.toContainText(
		'~12 gens'
	);
	await peekCalls('/edit-animation-v2', '/animate-with-skeleton-v3');
	await pane.getByRole('button', { name: /^Make for Custom walk/ }).click();
	const connect = page.getByRole('dialog', { name: 'Connect PixelLab', exact: true });
	await connect
		.getByLabel('Paste your Secret API key', { exact: true })
		.fill('synthetic-progressive-key');
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (value, key) {
			if (key === 'studio-move' && value.status === 'running')
				throw new Error('Progressive scope captured before spending');
			return put.call(this, value, key);
		};
	});
	await connect.getByRole('button', { name: 'Connect', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'New move', exact: true })).toContainText(
		'Progressive scope captured before spending'
	);
	const scope = await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		return (await import(path)).moving.spec;
	});
	expect(scope).toMatchObject({
		id: 'custom_walk',
		items: [fixture.itemId],
		itemsOnly: true,
		itemMethod: 'anchor'
	});
	expect(scope.dirs).toEqual(['south', 'east', 'north', 'west']);
	expect(posts).toEqual([]);
});

test('move review gates item selection and shows live estimates without spending', async ({
	page,
	context
}, info) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const posts: string[] = [];
	await context.route('https://*.pixellab.ai/**', (route) => {
		if (route.request().method() === 'POST') posts.push(route.request().url());
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	const fixture = await targetedRepairFixture(page, true);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		(await import(path)).ui.sheet = 'move';
	});
	const sheet = page.getByRole('dialog', { name: 'New move', exact: true });
	await expect(sheet.getByRole('checkbox')).toHaveCount(0);
	await expect(sheet.getByRole('button', { name: /^Generate / })).toBeEnabled();
	const seedReview = (seed: number) =>
		page.evaluate(async (seed) => {
			const statePath = '/src/studio/state.svelte.ts';
			const dbPath = '/src/lib/store/db.ts';
			const replacePath = '/src/studio/replaceMove.ts';
			const s = await import(statePath);
			const db = await import(dbPath);
			const { moveCandidateInput } = await import(replacePath);
			const rec = await db.get('projects', s.doc.id);
			const rig = rec.manifest.rig;
			const base = rec.manifest.items.find((item: { id: string }) => item.id === rig.baseItem);
			const animation = rig.animations.find((move: { id: string }) => move.id === 'walk');
			animation.frames[0].ms = 137;
			const cells = { ...base.layers[0].cells.walk };
			delete cells.west;
			rec.moveReviews = {
				walk: {
					spec: {
						id: 'walk',
						action: 'walk',
						seed,
						replace: true,
						reviewBeforePublish: true,
						items: [],
						animation: { model: 'pixminimax', frameCount: 8, loop: false }
					},
					input: moveCandidateInput(rec, 'walk'),
					dirs: ['east'],
					animation: structuredClone(animation),
					basePlayback: { loop: animation.loop, moveLoop: animation.moveLoop },
					cells,
					provenance: [],
					provenanceStart: base.provenance.length,
					anchors: {},
					skeletons: {},
					checks: {
						'walk/east': { feetDrift: 4, paletteFit: 1, border: 0, fails: [], warnings: [] }
					},
					warnings: ['walk/east: silhouette bottom differs up to 4 px from standing reference'],
					itemsBlocked: true
				}
			};
			if (seed === 76) animation.loop = animation.moveLoop = true;
			await db.put('projects', s.doc.id, rec);
		}, seed);
	const savedPlayback = () =>
		page.evaluate(async () => {
			const statePath = '/src/studio/state.svelte.ts';
			const dbPath = '/src/lib/store/db.ts';
			const { doc } = await import(statePath);
			const { get } = await import(dbPath);
			const rec = await get('projects', doc.id);
			const { loop, moveLoop, frames } = rec.manifest.rig.animations.find(
				(move: { id: string }) => move.id === 'walk'
			);
			return { loop, moveLoop, firstMs: frames[0].ms };
		});
	await seedReview(75);
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: /Walk Review move/ }).click();
	const review = page.getByRole('dialog', { name: 'Review move', exact: true });
	await review.getByText('Quality notes', { exact: true }).click();
	await expect(review.getByText(/silhouette bottom differs up to 4 px/)).toBeVisible();
	await review.getByRole('button', { name: /^Review Skeleton V3.*~/ }).click();
	const retry = page.getByRole('dialog', { name: /^Redraw / });
	await expect(retry.getByRole('combobox', { name: 'Motion model' })).toHaveValue('skeleton-v3');
	await expect(retry.getByRole('switch', { name: 'Loop', exact: true })).not.toBeChecked();
	await expect(retry.getByRole('button', { name: /^Replace Walk views/ })).toContainText('~6 gens');
	await retry.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: /Walk Review move/ }).click();
	await expect(review.getByRole('button', { name: 'Replace move', exact: true })).toBeEnabled();
	await expect(review.getByRole('button', { name: new RegExp(fixture.itemName) })).toHaveCount(0);
	await review.getByRole('button', { name: 'Close', exact: true }).click();
	// A staged draft was drawn on this frame: Adjust frame waits for it instead of leaving it behind.
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		const s = await import(path);
		s.ui.frameProject = s.doc.id;
		s.ui.sheet = 'adjustFrame';
	});
	const frame = page.getByRole('dialog', { name: 'Adjust frame', exact: true });
	await expect(frame).toContainText(
		'Save or discard the move waiting for review before adjusting the frame.'
	);
	await frame.getByRole('button', { name: 'Up', exact: true }).click();
	await expect(frame.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	// The nudge is an unsaved edit, so leaving asks first.
	await page.keyboard.press('Escape');
	await page
		.getByRole('alertdialog', { name: 'Discard changes?', exact: true })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await expect(frame).toBeHidden();
	await page.getByRole('button', { name: /Walk Review move/ }).click();
	const compass = review.getByRole('group', { name: 'Directions', exact: true });
	const north = compass.getByRole('button', { name: 'North direction' });
	const east = compass.getByRole('button', { name: 'East direction' });
	const south = compass.getByRole('button', { name: 'South direction' });
	const west = compass.getByRole('button', { name: /West direction.*Mirrors East/ });
	await expect(east).toHaveAttribute('aria-pressed', 'true');
	await south.click();
	await east.click();
	await expect(south).toHaveAttribute('aria-pressed', 'false');
	await expect(east).toHaveAttribute('aria-pressed', 'true');
	const pixels = (direction: string) =>
		review
			.getByRole('img', { name: `Walk preview, ${direction}`, exact: true })
			.locator('canvas')
			.evaluate((canvas: HTMLCanvasElement) => ({
				width: canvas.width,
				data: Array.from(
					canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
				)
			}));
	await north.click();
	await expect(north).toHaveAttribute('aria-pressed', 'true');
	const retained = await pixels('North');
	expect(retained.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
	await east.click();
	const original = await pixels('East');
	await west.click();
	await expect(west).toHaveAttribute('aria-pressed', 'true');
	const mirrored = await pixels('West');
	expect(mirrored.width).toBe(original.width);
	expect(mirrored.data).not.toEqual(original.data);
	expect(
		mirrored.data.every((value, index) => {
			const row = Math.floor(index / (mirrored.width * 4));
			const column = Math.floor(index / 4) % mirrored.width;
			return (
				value ===
				original.data[(row * mirrored.width + mirrored.width - 1 - column) * 4 + (index % 4)]
			);
		})
	).toBe(true);
	await review.getByRole('button', { name: 'Next frame', exact: true }).click();
	await expect(review.getByText(/^Frame 2 of /)).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		const s = await import(path);
		s.moving.queued = [
			{ projectId: s.doc.id, spec: { id: 'idle', frames: 4, items: [], seed: 1 } }
		];
	});
	const replace = review.getByRole('button', { name: 'Replace move', exact: true });
	await expect(replace).toBeDisabled();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts';
		(await import(path)).moving.queued = [];
	});
	await page.setViewportSize({ width: 320, height: 720 });
	await replace.click();
	const picker = page.getByRole('dialog', { name: 'Generate items', exact: true });
	const item = picker.getByRole('button', { name: new RegExp(fixture.itemName) });
	const animate = picker.getByRole('button', { name: /^Generate (items|1 item)$/ });
	await expect(item).toHaveAttribute('aria-pressed', 'false');
	await expect(picker).toContainText('~0 more gens');
	expect(await savedPlayback()).toEqual({ loop: false, moveLoop: false, firstMs: 137 });
	await expect(animate).toBeDisabled();
	const price = Number((await item.innerText()).match(/(\d+) gens/)?.[1]);
	expect(price).toBeGreaterThan(0);
	await expect(item.locator('canvas')).toBeVisible();
	await item.press('Space');
	await expect(item).toHaveAttribute('aria-pressed', 'true');
	await expect(animate).toHaveAccessibleName('Generate 1 item');
	await expect(picker).toContainText(`~${price} more gens`);
	await item.click();
	await expect(animate).toBeDisabled();
	await item.click();
	const handoff = await page.evaluate(async () => {
		const queuePath = '/src/lib/pixellab/queue.ts';
		const statePath = '/src/studio/state.svelte.ts';
		const { queue } = await import(queuePath);
		const { ui, cancelWaitingForTab } = await import(statePath);
		const role = queue.role;
		const requests: boolean[] = [];
		queue.role = 'follower';
		queue.requestHandoff = (want: boolean) => requests.push(want);
		try {
			const dialog = document.querySelector('dialog[open]')!;
			const button = (name: string) =>
				Array.from(dialog.querySelectorAll('button')).find(
					(button) =>
						button.textContent?.trim() === name || button.getAttribute('aria-label') === name
				)!;
			button('Generate 1 item').click();
			button('Close').click();
			return { requests: [...requests], waiting: ui.waitingForTab };
		} finally {
			cancelWaitingForTab();
			queue.role = role;
			Reflect.deleteProperty(queue, 'requestHandoff');
		}
	});
	expect(handoff).toEqual({ requests: [true, false], waiting: false });
	await expect(picker).not.toBeVisible();
	await expect(page.getByRole('button', { name: /Walk Review move/ })).toHaveCount(0);
	expect(posts).toEqual([]);
	await seedReview(76);
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: /Walk Review move/ }).click();
	await replace.click();
	await expect(picker).toBeVisible();
	expect(await savedPlayback()).toEqual({ loop: true, moveLoop: true, firstMs: 137 });
	// Items are optional: Not now spends nothing, and the move's own menu offers the same choice later.
	await expect(picker).toContainText(
		'You can generate items for Walk later from its menu in Moves.'
	);
	await picker.getByRole('button', { name: 'Not now', exact: true }).click();
	await expect(picker).toBeHidden();
	await page.getByRole('button', { name: 'More actions for Walk', exact: true }).click();
	await page.getByRole('menuitem', { name: /^Generate items/ }).click();
	const later = page.getByRole('dialog', { name: 'Generate items for Walk', exact: true });
	await later.getByRole('button', { name: new RegExp(fixture.itemName) }).click();
	await later.getByRole('button', { name: 'Generate 1 item', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await seedReview(77);
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	const walkReview = page.getByRole('button', { name: /Walk Review move/ });
	await walkReview.click();
	await review.getByRole('button', { name: 'Regenerate…', exact: true }).click();
	const replacement = page.getByRole('dialog', { name: /^Redraw / });
	await expect(replacement.getByRole('switch', { name: 'Loop', exact: true })).not.toBeChecked();
	await replacement.getByRole('button', { name: 'Close', exact: true }).click();
	await walkReview.click();
	await review.getByRole('button', { name: 'Discard draft', exact: true }).click();
	await page.getByRole('button', { name: 'New move...', exact: true }).click();
	await replacement.getByRole('button', { name: /^Replace Walk views/ }).click();
	const staleRegeneration = await page.evaluate(async () => {
		const path = '/src/studio/formDrafts.ts';
		return (await import(path)).formDrafts.move?.regeneration ?? null;
	});
	expect(staleRegeneration).toBeNull();
	await page
		.getByRole('dialog', { name: 'Connect PixelLab', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	expect(posts).toEqual([]);
});

test('reviewed move animates the chosen item and exports layered frames using offline artwork', async ({
	page,
	context
}, info) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const posts: string[] = [];
	let images: { type: string; base64: string }[] = [];
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
		if (request.method() === 'POST') posts.push(path);
		if (path === '/v2/animate-with-skeleton-v3')
			return route.fulfill({ json: { background_job_id: 'offline-helmet' } });
		if (path.endsWith('/offline-helmet'))
			return route.fulfill({ json: { status: 'completed', last_response: { images } } });
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'offline-move-smoke-key');
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page, true);
	images = await page.evaluate(async () => {
		const load = (path: string) => import(path);
		const { doc } = await load('/src/studio/state.svelte.ts');
		const { loadProject } = await load('/src/lib/store/project.ts');
		const db = await load('/src/lib/store/db.ts');
		const { cellHash } = await load('/src/lib/rig/rig.ts');
		const { toChroma } = await load('/src/lib/image/chroma.ts');
		const { encodePngBytes } = await load('/src/lib/image/pngraw.ts');
		const { bytesToBase64 } = await load('/src/lib/image/png.ts');
		const { moveCandidateInput } = await load('/src/studio/replaceMove.ts');
		const { rec, project } = await loadProject(doc.id);
		const { rig, items } = rec.manifest;
		const body = items.find((item: { id: string }) => item.id === rig.baseItem);
		const helmet = items.find((item: { id: string }) => item.id === 'helmet_steel');
		const cells = { ...body.layers[0].cells.walk };
		delete cells.west;
		const artwork = cells.east.map((hash: string, index: number) => {
			const mannequin = toChroma(project.images.get(hash), 'green');
			const layer = project.images.get(helmet.layers[0].cells.walk.east[index]);
			if (layer.w !== mannequin.w || layer.h !== mannequin.h)
				throw new Error('Fixture sizes differ');
			for (let offset = 0; offset < layer.data.length; offset += 4)
				if (layer.data[offset + 3])
					mannequin.data.set(layer.data.subarray(offset, offset + 4), offset);
			return mannequin;
		});
		const dressing = await cellHash(artwork[0]);
		await db.put('blobs', dressing.slice(7), new Blob([await encodePngBytes(artwork[0])]));
		Object.assign(helmet, { route: 'skeleton-pose', key: 'green', dressed: { east: dressing } });
		const animation = rig.animations.find((move: { id: string }) => move.id === 'walk');
		const basePlayback = { loop: animation.loop, moveLoop: animation.moveLoop };
		rec.moveReviews = {
			walk: {
				spec: {
					id: 'walk',
					seed: 812,
					replace: true,
					reviewBeforePublish: true,
					items: [],
					animation: { model: 'skeleton-v3', loop: false }
				},
				input: moveCandidateInput(rec, 'walk'),
				dirs: ['east'],
				animation,
				basePlayback,
				cells,
				provenance: [],
				provenanceStart: body.provenance.length,
				anchors: {},
				skeletons: {},
				checks: {},
				warnings: []
			}
		};
		await db.put('projects', doc.id, rec);
		return Promise.all(
			artwork.map(async (frame: unknown) => ({
				type: 'base64',
				base64: bytesToBase64(await encodePngBytes(frame))
			}))
		);
	});
	await reloadStudio(page);
	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: /Walk Review move/ }).click();
	await page.getByRole('button', { name: 'Replace move', exact: true }).click();
	const items = page.getByRole('dialog', { name: 'Generate items' });
	const helmet = items.getByRole('button', { name: /Steel helmet/i });
	await expect(helmet).toHaveAttribute('aria-pressed', 'false');
	expect(
		await page.evaluate(async () => {
			const statePath = '/src/studio/state.svelte.ts';
			const dbPath = '/src/lib/store/db.ts';
			const { doc } = await import(statePath);
			const { get } = await import(dbPath);
			const rec = await get('projects', doc.id);
			return rec.manifest.rig.animations.find((move: { id: string }) => move.id === 'walk')
				.moveLoop;
		})
	).toBe(false);
	expect(posts).toEqual([]);
	await helmet.click();
	await items.getByRole('button', { name: 'Generate 1 item' }).click();
	await page
		.getByRole('dialog', { name: 'New move', exact: true })
		.getByRole('button', { name: 'Done', exact: true })
		.click({ timeout: 30_000 });
	expect(posts).toEqual(['/v2/animate-with-skeleton-v3']);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Export', exact: true });
	await sheet.getByRole('radio', { name: /PNG \+ JSON/ }).click();
	const download = page.waitForEvent('download');
	await sheet.getByRole('button', { name: /^Download ZIP/ }).click();
	const entries = await unzip(new Uint8Array(readFileSync((await (await download).path())!)));
	const manifestEntry = entries.get('manifest.json');
	expect(manifestEntry).toBeDefined();
	const manifest: Manifest = JSON.parse(new TextDecoder().decode(manifestEntry));
	expect(manifest.rig.animations.find((move) => move.id === 'walk')).toMatchObject({
		loop: false,
		cells: 8
	});
	const exportedHelmet = manifest.items.find((item) => item.id === 'helmet_steel');
	expect(exportedHelmet?.coverage).toEqual(
		expect.arrayContaining(images.map((_, index) => `walk/east/${index}`))
	);
	const layer = exportedHelmet!.layers[0];
	const helmetSheet = layer.sheets?.walk;
	expect(helmetSheet).toBeDefined();
	const spriteSheet = await decodePngBytes(entries.get(helmetSheet!)!);
	const { w: cellWidth, h: cellHeight } = layer.cell ?? manifest.rig.cell;
	const east = manifest.rig.directions.findIndex((direction) => direction.id === 'east');
	for (let frame = 0; frame < 8; frame++) {
		const hasPixels = Array.from({ length: cellHeight }, (_, row) => {
			const offset = ((east * cellHeight + row) * spriteSheet.w + frame * cellWidth) * 4;
			return spriteSheet.data.subarray(offset, offset + cellWidth * 4);
		}).some((row) => row.some((value, index) => index % 4 === 3 && value > 0));
		expect(hasPixels, `helmet east frame ${frame} has visible pixels`).toBe(true);
	}
	expect(errors).toEqual([]);
});

test('draft retry prices a fresh item plan rather than historical grid fallbacks and stops when pricing is unavailable', async ({
	page,
	context
}, info) => {
	await page.addInitScript(() => localStorage.setItem('pixeldoll.developerMode', '1'));
	const requests: string[] = [];
	await context.route('https://api.pixellab.ai/**', (r) => {
		requests.push(r.request().method());
		return r.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await targetedRepairFixture(page);
	const expected = await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			routePath = '/src/studio/itemRoute.ts',
			route = await import(routePath);
		const projectPath = '/src/lib/store/project.ts',
			projectModule = await import(projectPath);
		await s.loadGens();
		const ctx = await projectModule.loadProject(s.doc.id),
			input = { name: 'Fresh retry price', slot: 'main_hand', prompt: 'a steel sword' };
		const draft = route.itemRoute.draft(ctx, input, []);
		draft.calls = [
			{
				kind: 'grid',
				cells: Array.from({ length: 8 }, (_, i) => 'walk/west/' + i),
				seed: 1,
				old: [],
				rerolls: 2
			}
		];
		s.gens.push({
			draft,
			input,
			phase: 'failed',
			status: 'Stopped',
			error: 'Synthetic completed fallback failed review'
		});
		s.ui.selected = 'gen:' + draft.spec.id;
		return route.itemRoute.plan(ctx.rec.manifest.rig, ctx, input).gens;
	});
	await equipmentGroup(page, 'Main hand');
	await reviewSelectedDraft(page);
	const panel = page.locator('.gen'),
		retry = panel.getByRole('button', { name: /^Generate again/ });
	expect(expected).toBe(10); // only four padded standing references; walking frames are a separate purchase now
	await expect(retry).toBeEnabled();
	await expect(page.getByRole('dialog', { name: 'Item review', exact: true })).toBeVisible();
	await expect(page.locator('.equipment-scroll .gen')).toHaveCount(0);
	await page
		.getByRole('dialog', { name: 'Item review', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	// Wardrobe carries the stopped draft's warning dot (More leaves it to the tab); Activity in More lists the draft that
	// holds its slot and opens its review.
	await expect(page.locator('#customization-tab-wardrobe')).toHaveAttribute(
		'data-activity',
		'stopped'
	);
	const more = page.locator('.experience-header [popovertarget="experience-options"]');
	await expect(more).not.toHaveAttribute('data-activity');
	const disclosure = page.locator('#customization-toggle');
	await disclosure.click();
	await expect(more).toHaveAttribute('data-activity', 'stopped');
	await disclosure.click();
	await expect(more).not.toHaveAttribute('data-activity');
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page
		.locator('#experience-options')
		.getByRole('button', { name: /^Activity/ })
		.click();
	const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
	await expect(activity.getByText('Needs attention', { exact: true })).toBeVisible();
	await activity.getByRole('button', { name: /^Open Fresh retry price · / }).click();
	await page
		.getByRole('dialog', { name: 'Item review', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await equipmentGroup(page, 'Off hand');
	await expect(section(page, 'Off hand').locator('.gen')).toHaveCount(0);
	await equipmentGroup(page, 'Main hand');
	await reviewSelectedDraft(page);
	await expect(page.locator('.gen')).toHaveCount(1);
	await expect(retry).toBeEnabled();
	await expect(retry).toHaveText(`Generate again ~${expected} gens`);
	await page
		.getByRole('dialog', { name: 'Item review', exact: true })
		.locator('.sheet-head')
		.getByRole('button', { name: 'Inspect API calls', exact: true })
		.click();
	const retryPeek = page.getByRole('dialog', { name: 'API calls', exact: true });
	await retryPeek.locator('.scope-toggle').nth(1).click();
	await expect(retryPeek.getByText('Dress standing views', { exact: false })).toBeVisible();
	await expect(retryPeek.getByText('Dress frozen frames', { exact: false })).toHaveCount(0);
	await retryPeek.getByRole('button', { name: 'Close API calls', exact: true }).click();
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		const g = s.gens.find(
			(g: { draft: { spec: { id: string } } }) => 'gen:' + g.draft.spec.id === s.ui.selected
		);
		g.draft.calls.push({
			kind: 'grid',
			cells: Array.from({ length: 15 }, (_, i) => 'walk/east/' + i),
			seed: 2,
			old: [],
			rerolls: 2
		});
	});
	await expect(retry).toHaveText(`Generate again ~${expected} gens`);
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p);
		s.gens.find(
			(g: { draft: { spec: { id: string } } }) => 'gen:' + g.draft.spec.id === s.ui.selected
		).draft.rigId = 'rig-unavailable-retry-price';
	});
	await expect(panel).toContainText(
		'Could not estimate this retry. Reopen the character and try again.'
	);
	await expect(retry).toBeDisabled();
	expect(requests).toEqual([]);
});

async function freePaletteFixture(page: Page) {
	const fixture = await targetedRepairFixture(page);
	await oversizedItemFixture(page, fixture.itemId);
	const before = await page.evaluate(
		async ({ id }) => {
			const p = '/src/studio/state.svelte.ts',
				s = await import(p),
				dbPath = '/src/lib/store/db.ts',
				db = await import(dbPath);
			const pngPath = '/src/lib/image/png.ts',
				png = await import(pngPath),
				rawPath = '/src/lib/image/pngraw.ts',
				raw = await import(rawPath),
				rigPath = '/src/lib/rig/rig.ts',
				rig = await import(rigPath);
			const rec = await db.get('projects', s.doc.id),
				item = rec.manifest.items.find((it: { id: string }) => it.id === id),
				metalId = id + '-fixed-metal';
			const materials = [
				{
					id: metalId,
					owner: id,
					label: 'Metal',
					ramp: ['#808080', '#c0c0c0'],
					variants: { azure: ['#2255aa', '#77aaff'] }
				},
				{ id: id + '-fixed-outline', owner: id, label: 'Outline', ramp: ['#101010'], variants: {} }
			];
			rec.manifest.materials = [
				...rec.manifest.materials.filter((m: { owner: string }) => m.owner !== id),
				...materials
			];
			item.materials = materials.map((m) => m.id);
			item.status = 'accepted';
			item.baseHash = rec.manifest.rig.baseHash;
			item.designWarnings = ['D1 keyframe rest/west/0: gray smudges'];
			if (item.qa) item.qa.status = 'warn';
			const image = png.makeImg(96, 96);
			for (const [offset, rgb] of [
				[0, [133, 133, 133]],
				[1, [240, 240, 240]],
				[2, [192, 128, 96]],
				[3, [16, 16, 16]]
			] as [number, number[]][])
				image.data.set([...rgb, 255], (40 * 96 + 40 + offset) * 4);
			const hash = await rig.cellHash(image);
			await db.put('blobs', hash.slice(7), new Blob([await raw.encodePngBytes(image)]));
			for (const layer of item.layers)
				layer.cells.walk.west = Array.from({ length: 8 }, () => null);
			item.layers[0].cells.walk.west[0] = hash;
			item.layers[0].cells.walk.west[1] = hash;
			await db.put('projects', s.doc.id, rec);
			await s.openProject(s.doc.id);
			s.ui.anim = 'walk';
			s.ui.dir = 'west';
			s.ui.frame = 0;
			s.ui.playing = false;
			s.pick(id);
			s.setVariant(metalId, 'azure');
			await s.flushSave();
			const saved = await db.get('projects', s.doc.id),
				savedItem = saved.manifest.items.find((it: { id: string }) => it.id === id);
			const unscoped = structuredClone(savedItem.layers);
			for (const layer of unscoped) delete layer.cells.walk.west;
			return {
				projectId: s.doc.id,
				metalId,
				materials: saved.manifest.materials,
				presets: saved.manifest.presets,
				variants: s.doc.variants,
				qa: savedItem.qa,
				warnings: savedItem.designWarnings,
				provenance: savedItem.provenance,
				rig: saved.manifest.rig,
				unscoped,
				sourceHash: hash
			};
		},
		{ id: fixture.itemId }
	);
	const diagnosis = await page.evaluate(async (id) => {
		const p = '/src/studio/state.svelte.ts',
			s = await import(p),
			r = '/src/lib/items/run.ts',
			run = await import(r);
		try {
			return await run.itemPaletteRepairPlan(s.doc.id, id, 'walk', 'west');
		} catch (e) {
			return String(e);
		}
	}, fixture.itemId);
	expect(diagnosis).toMatchObject({ changedPixels: 2, changedFrames: [0, 1], unmatchedPixels: 2 });
	return { ...fixture, ...before };
}

for (const changed of ['item', 'rig'] as const)
	test(`free item color matching refuses a stale ${changed} review without changing any pixels`, async ({
		page,
		context
	}, info) => {
		const requests: string[] = [];
		await context.route('https://api.pixellab.ai/**', (r) => {
			requests.push(r.request().method());
			return r.abort();
		});
		await page.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
		});
		await openStudio(
			page,
			info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
		);
		const fixture = await freePaletteFixture(page),
			pane = await selectedItemDetails(page);
		await page.evaluate(async () => {
			const path = '/src/lib/i18n.ts',
				i18n = await import(path);
			await i18n.selectLanguage('fr');
		});
		const action = pane.getByRole('button', {
			name: /^Harmoniser les couleurs de l’objet.*Gratuit$/
		});
		await expect(action).toBeVisible();
		await page.evaluate(
			async ({ id, changed }) => {
				const p = '/src/studio/state.svelte.ts',
					s = await import(p),
					dbPath = '/src/lib/store/db.ts',
					db = await import(dbPath),
					rec = await db.get('projects', s.doc.id);
				if (changed === 'item')
					rec.manifest.items.find((it: { id: string }) => it.id === id).prompt +=
						', changed after preview';
				else rec.manifest.rig.view = rec.manifest.rig.view === 'side' ? 'low top-down' : 'side';
				await db.put('projects', s.doc.id, rec);
			},
			{ id: fixture.itemId, changed }
		);
		await context.setOffline(true);
		await action.click();
		await expect(pane).toContainText(
			'Cet équipement ou ses couleurs ont changé. Vérifiez de nouveau la mise en correspondance des couleurs.'
		);
		const saved = await page.evaluate(async (id) => {
			const p = '/src/studio/state.svelte.ts',
				s = await import(p),
				dbPath = '/src/lib/store/db.ts',
				db = await import(dbPath),
				rec = await db.get('projects', s.doc.id),
				it = rec.manifest.items.find((i: { id: string }) => i.id === id);
			return { hash: it.layers[0].cells.walk.west[0], audit: it.paletteRepairs };
		}, fixture.itemId);
		expect(saved.hash).toBe(fixture.sourceHash);
		expect(saved.audit).toBeUndefined();
		expect(requests).toEqual([]);
	});

// ---- Per-tile item menu (docs/design/2026-11-11-ui-refinement/ui-lab-7.html) and Wardrobe placement ----

async function editableCopy(page: Page, url = '/#/') {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, url);
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	await page.getByRole('textbox', { name: 'What is it?', exact: true }).waitFor();
	await page
		.getByRole('dialog', { name: 'New item', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
}
/** Open an item's details from its tile menu without changing what is worn. */
async function openItemDetails(page: Page, name: string) {
	await equipmentMode(page, 'Wardrobe');
	const more = page.getByRole('button', { name: `More options for ${name}`, exact: true }).first();
	await more.scrollIntoViewIfNeeded();
	await more.click();
	await page.getByRole('menuitem', { name: 'Details...', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Item', exact: true });
	await expect(dialog.locator('.insp-body')).toBeVisible();
	return dialog;
}

const itemMenu = (page: Page) => page.locator('#item-menu');

for (const kind of ['outfit', 'move'] as const) {
	test(`${kind} actions share mouse, keyboard and touch menus, download scoped ZIPs, and delete safely`, async ({
		page
	}) => {
		await editableCopy(page);
		await equipmentMode(page, kind === 'outfit' ? 'Outfits' : 'Moves');
		let name = 'Saved menu look';
		if (kind === 'outfit') {
			await equipmentGroup(page, 'Head');
			await section(page, 'Head')
				.getByRole('button', { name: /^Wizard hat(,|$)/ })
				.click();
			await equipmentMode(page, 'Outfits');
			await page.getByRole('button', { name: 'Save current look', exact: true }).click();
			await page.getByRole('textbox', { name: 'Outfit name' }).fill(name);
			await page.getByRole('button', { name: 'Save', exact: true }).click();
		} else name = 'Walk';
		const row =
			kind === 'outfit'
				? page.locator('.outfits .character-entry').filter({ hasText: name })
				: page.locator('.move-list .character-entry').filter({
						has: page.getByRole('button', { name: `More actions for ${name}`, exact: true })
					});
		const choice = row.locator('button').first();
		const trigger = row.getByRole('button', { name: `More actions for ${name}`, exact: true });
		// Desktop keeps the ⋮ out of sight until the row is hovered.
		await page.mouse.move(0, 0);
		await expect(trigger).toHaveCSS('opacity', '0');
		await choice.hover();
		await expect(trigger).toHaveCSS('opacity', '1');
		await page.mouse.move(0, 0);
		await expect(trigger).toHaveCSS('opacity', '0');
		const menu = page.getByRole('menu', { name: `Actions for ${name}`, exact: true });
		if (kind === 'outfit') {
			await expect(choice).toHaveAttribute('aria-pressed', 'true');
			const move = playbackPicker(page);
			const pause = page.getByRole('button', { name: 'Pause', exact: true });
			if (await pause.isVisible()) await pause.click();
			const stage = () =>
				page
					.locator('.world-actors')
					.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
			await selectPlaybackClip(page, 'default');
			const warning = page.getByRole('button', { name: /equipped items? needs? frames/ });
			await expect(warning).toBeHidden();
			const dressedDefault = await stage();
			await selectPlaybackClip(page, 'cross-punch');
			await expect(warning).toBeVisible();
			await expect.poll(stage).not.toBe(dressedDefault);
			await choice.click();
			await expect(move).toHaveAttribute('value', 'default');
			await expect(warning).toBeHidden();
			await expect.poll(stage).toBe(dressedDefault);
			await equipmentGroup(page, 'Head');
			await section(page, 'Head').getByRole('button', { name: 'Empty head', exact: true }).click();
			await selectPlaybackClip(page, 'walk');
			await equipmentMode(page, 'Outfits');
			await expect(choice).toHaveAttribute('aria-pressed', 'false');
			await choice.click();
			await expect(move).toHaveAttribute('value', 'default');
			await expect(choice).toHaveAttribute('aria-pressed', 'true');
			await expect.poll(stage).toBe(dressedDefault);
			await equipmentGroup(page, 'Head');
			await section(page, 'Head').getByRole('button', { name: 'Empty head', exact: true }).click();
			await equipmentMode(page, 'Outfits');
			await expect(choice).toHaveAttribute('aria-pressed', 'false');
		} else {
			await page.locator('.move-row').filter({ hasText: 'Cross punch' }).click();
			await expect(choice).toHaveAttribute('aria-pressed', 'false');
		}
		await trigger.click();
		await expect(menu).toBeVisible();
		await expect(trigger).toHaveAttribute('aria-expanded', 'true');
		await expect(menu.locator('hr')).toHaveCount(1);
		// The first action takes focus: Rename, as in character and item menus.
		await expect(menu.getByRole('menuitem', { name: 'Rename...', exact: true })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(trigger).toBeFocused();
		await choice.click({ button: 'right' });
		await expect(menu).toBeVisible();
		await page.keyboard.press('Escape');
		await choice.focus();
		await page.keyboard.press('Shift+F10');
		await expect(menu).toBeVisible();
		await page.keyboard.press('Escape');
		const originalViewport = page.viewportSize()!;
		const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme);
		for (const theme of ['dark', 'light']) {
			await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
			for (const viewport of [{ width: 390, height: 844 }, originalViewport]) {
				await page.setViewportSize(viewport);
				await equipmentMode(page, kind === 'outfit' ? 'Outfits' : 'Moves');
				await trigger.click();
				await expect(menu).toBeVisible();
				await expect(menu.locator('.bu-popover-arrow')).toBeVisible();
				await expect(menu.getByRole('menuitem', { name: 'Download ZIP', exact: true })).toHaveCSS(
					'padding-right',
					'12px'
				);
				const bounds = (await menu.locator('.menu-surface').boundingBox())!;
				expect(bounds.x).toBeGreaterThanOrEqual(0);
				expect(bounds.y).toBeGreaterThanOrEqual(0);
				expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
				expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
				await page.keyboard.press('Escape');
			}
		}
		await page.evaluate((theme) => {
			if (theme) document.documentElement.dataset.theme = theme;
			else delete document.documentElement.dataset.theme;
		}, originalTheme);
		const touch = await page.context().newCDPSession(page);
		for (const target of [choice, trigger]) {
			const box = (await target.boundingBox())!;
			await touch.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
			});
			await expect(menu).toBeVisible();
			await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			await expect(menu).toBeVisible();
			await page.keyboard.press('Escape');
		}
		const pointer = {
			pointerId: 71,
			pointerType: 'touch',
			isPrimary: true,
			button: 0,
			clientX: 80,
			clientY: 90
		};
		await choice.dispatchEvent('pointerdown', pointer);
		await choice.dispatchEvent('pointermove', { ...pointer, clientY: 120 });
		await choice.dispatchEvent('pointerup', pointer);
		await page.waitForTimeout(600);
		await expect(menu).toBeHidden();
		await expect(choice).toHaveAttribute('aria-pressed', 'false');
		await trigger.click();
		const downloaded = page.waitForEvent('download');
		await menu.getByRole('menuitem', { name: 'Download ZIP', exact: true }).click();
		const download = await downloaded;
		expect(download.suggestedFilename()).toMatch(
			kind === 'outfit' ? /saved-menu-look\.pixeldoll\.zip$/ : /walk\.pixeldoll\.zip$/
		);
		const { readCharacterZip } = await import('../../src/lib/store/import.ts');
		const imported = await readCharacterZip(new Uint8Array(readFileSync((await download.path())!)));
		if (kind === 'outfit') expect(imported.project.manifest.presets).toHaveLength(1);
		else
			expect(imported.project.manifest.rig.animations.map((move) => move.id)).toEqual([
				'default',
				'walk'
			]);
		await trigger.click();
		if (kind === 'move') {
			await menu.getByRole('menuitem', { name: 'Move to Trash…', exact: true }).click();
			const confirm = page.getByRole('alertdialog', {
				name: `Move ${name} to Trash?`,
				exact: true
			});
			await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
			await page.keyboard.press('Escape');
			await expect(row).toBeVisible();
			await trigger.click();
			await menu.getByRole('menuitem', { name: 'Move to Trash…', exact: true }).click();
			await confirm.getByRole('button', { name: 'Move to Trash', exact: true }).click();
		} else {
			await menu.getByRole('menuitem', { name: 'Delete outfit', exact: true }).click();
			await expect(page.getByRole('alertdialog')).toHaveCount(0);
			await expect(row).toHaveCount(0);
			await page.getByRole('button', { name: 'Undo Delete outfit', exact: true }).click();
			await expect(row).toBeVisible();
			await trigger.click();
			await menu.getByRole('menuitem', { name: 'Delete outfit', exact: true }).click();
		}
		await expect(row).toHaveCount(0);
		await reloadStudio(page);
		await equipmentMode(page, kind === 'outfit' ? 'Outfits' : 'Moves');
		await expect(row).toHaveCount(0);
		if (kind === 'move') {
			const remaining = page.locator('.move-list .character-entry');
			while ((await remaining.count()) > 0) {
				await remaining
					.last()
					.getByRole('button', { name: /^More actions/ })
					.click();
				await page.getByRole('menuitem', { name: 'Move to Trash…', exact: true }).click();
				await page
					.getByRole('alertdialog')
					.getByRole('button', { name: 'Move to Trash', exact: true })
					.click();
				await expect(page.getByRole('alertdialog')).toHaveCount(0);
			}
			await equipmentMode(page, 'States');
			await expect(remaining).toHaveCount(1);
			await remaining
				.getByRole('button', { name: 'More actions for Standing', exact: true })
				.click();
			await expect(
				page.getByRole('menuitem', { name: 'Move to Trash…', exact: true })
			).toHaveAttribute('aria-disabled', 'true');
			await expect(remaining).toContainText('Standing');
		}
	});
}

test('item long-press opens without wearing, cancels on movement, and downloads an editable item ZIP', async ({
	page
}) => {
	await editableCopy(page);
	await equipmentGroup(page, 'Head');
	const tile = section(page, 'Head').getByRole('button', { name: /^Wizard hat(,|$)/ });
	const worn = await tile.getAttribute('aria-pressed');
	await tile.click({ button: 'right' });
	await expect(itemMenu(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(itemMenu(page)).toBeHidden();
	const pointer = {
		pointerId: 71,
		pointerType: 'touch',
		isPrimary: true,
		button: 0,
		clientX: 80,
		clientY: 90
	};
	const touch = await page.context().newCDPSession(page);
	for (const target of [
		tile,
		section(page, 'Head').getByRole('button', { name: 'More options for Wizard hat', exact: true })
	]) {
		const box = (await target.boundingBox())!;
		await touch.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
		});
		await expect(itemMenu(page)).toBeVisible();
		await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect(itemMenu(page)).toBeVisible();
		await expect(tile).toHaveAttribute('aria-pressed', worn!);
		await page.keyboard.press('Escape');
		await expect(itemMenu(page)).toBeHidden();
	}
	await tile.dispatchEvent('pointerdown', pointer);
	await tile.dispatchEvent('pointermove', { ...pointer, clientY: 120 });
	await tile.dispatchEvent('pointerup', pointer);
	await expect(itemMenu(page)).toBeHidden();
	await tile.click();
	await expect(tile).not.toHaveAttribute('aria-pressed', worn!);
	await tile.click({ button: 'right' });
	const downloaded = page.waitForEvent('download');
	await itemMenu(page).getByRole('menuitem', { name: 'Download ZIP', exact: true }).click();
	const download = await downloaded;
	expect(download.suggestedFilename()).toMatch(/-hat_wizard\.pixeldoll\.zip$/);
	const bytes = readFileSync((await download.path())!);
	const { readCharacterZip } = await import('../../src/lib/store/import.ts');
	const imported = await readCharacterZip(new Uint8Array(bytes));
	expect(
		imported.project.manifest.items.filter((item) => !item.variantOf).map((item) => item.name)
	).toContain('Wizard hat');
	expect(imported.project.manifest.items.filter((item) => !item.variantOf)).toHaveLength(2);
});
const menuOpen = (page: Page) => itemMenu(page).evaluate((m) => m.matches(':popover-open'));
/** The open menu is an arrowed popover fully inside the viewport. */
async function expectAnchoredMenu(page: Page) {
	const menu = itemMenu(page);
	await expect.poll(() => menuOpen(page)).toBe(true);
	await expect(menu.locator('.bu-popover-arrow')).toBeVisible();
	const viewport = page.viewportSize()!;
	const box = (await menu.locator('.bu-popover-surface').boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
	expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test('item tiles open their own menu by ⋮, right-click and Shift+F10, and Escape returns to the ⋮', async ({
	page
}) => {
	await editableCopy(page);
	await page.getByRole('button', { name: 'More options', exact: true }).click();
	await page.getByRole('button', { name: 'Settings...', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Settings' })
		.getByRole('button', { name: 'Wardrobe', exact: true })
		.click();
	await page.getByRole('switch', { name: 'Hide shared items from demo character' }).uncheck();
	await page.keyboard.press('Escape');
	await equipmentGroup(page, 'Head');
	const head = section(page, 'Head');
	// The character's own tile: once it is deleted, the demo's own Wizard hat is offered from the demo instead, in the
	// same grid.
	const grid = head.getByRole('group', { name: 'Head items', exact: true });
	const hat = grid
		.getByRole('button', { name: /^Wizard hat(,|$)/ })
		.and(page.locator('.bu-tile:not(.shared-tile)'));
	const more = head.getByRole('button', { name: 'More options for Wizard hat', exact: true });
	await expect(more.locator('svg')).toHaveCount(1);
	// A sibling control, never nested in the tile, drawn 3 px inside its top-right corner at 28 by 25 px.
	expect(await more.evaluate((b) => !!b.closest('.item-tile'))).toBe(false);
	// Desktop keeps the ⋮ out of sight until the tile is hovered, without moving anything.
	await page.mouse.move(0, 0);
	await expect(more).toHaveCSS('opacity', '0');
	await hat.hover();
	await expect(more).toHaveCSS('opacity', '1');
	await page.mouse.move(0, 0);
	await expect(more).toHaveCSS('opacity', '0');
	await expect(more).toHaveAttribute('aria-haspopup', 'menu');
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	const hit = (await more.boundingBox())!;
	const tile = (await hat.boundingBox())!;
	expect([
		tile.x + tile.width - (hit.x + hit.width),
		hit.y - tile.y,
		hit.width,
		hit.height
	]).toEqual([3, 3, 28, 25]);
	// Only the top and right gaps extend the target; the bottom and left follow the visible button.
	expect(
		await more.evaluate((button) => {
			const reach = getComputedStyle(button, '::before');
			return [reach.content, reach.position, reach.top, reach.right, reach.width, reach.height];
		})
	).toEqual(['""', 'absolute', '-3px', '-3px', '31px', '28px']);
	const targets = await more.evaluate((button) => {
		const r = button.getBoundingClientRect();
		return [
			[r.left + r.width / 2, r.top - 2],
			[r.right + 2, r.top + r.height / 2],
			[r.right + 2, r.top - 2],
			[r.left + 1, r.bottom - 1],
			[r.left - 1, r.top + r.height / 2],
			[r.left + r.width / 2, r.bottom + 1]
		].map(([x, y]) =>
			document.elementFromPoint(x!, y!)?.closest('button')?.classList.contains('tile-more')
		);
	});
	expect(targets).toEqual([true, true, true, true, false, false]);
	// The worn check and status sit in the opposite, top-left corner, 6 px inside the 1 px border.
	const status = (await hat.locator('.tile-status, .bu-tile-check').first().boundingBox())!;
	expect(status.x).toBeCloseTo(tile.x + 7, 0);
	expect(status.x + status.width).toBeLessThan(hit.x);
	// Category actions retain their contextual 44 px targets.
	for (const name of ['Random head item', 'New head item']) {
		const box = (await head.getByRole('button', { name, exact: true }).boundingBox())!;
		expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
	}
	// Empty and New tiles have no menu.
	await expect(head.getByRole('button', { name: /^More options for Empty/ })).toHaveCount(0);

	await more.click();
	await expectAnchoredMenu(page);
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	const items = itemMenu(page).getByRole('menuitem');
	await expect(items.first()).toHaveAccessibleName('Details...');
	await expect(items.first()).toBeFocused();
	await expect(items.last()).toHaveAccessibleName('Move to Trash…');
	const iconOffsets = await items.evaluateAll((rows) =>
		rows.map(
			(row) =>
				row.querySelector('svg')!.getBoundingClientRect().left - row.getBoundingClientRect().left
		)
	);
	expect(iconOffsets).toEqual(Array(iconOffsets.length).fill(iconOffsets.at(-1)));
	await expect(itemMenu(page).getByRole('menuitem', { name: /Wear|Take off/ })).toHaveCount(0);
	await page.keyboard.press('ArrowDown');
	await expect(items.nth(1)).toHaveAccessibleName('Rename...');
	await expect(items.nth(1)).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(items.nth(2)).toHaveAccessibleName('Edit appearance…');
	await expect(items.nth(2)).toBeFocused();
	await page.keyboard.press('Escape');
	await expect.poll(() => menuOpen(page)).toBe(false);
	await expect(more).toBeFocused();
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	// Focus returns to a visible trigger, never an invisible control.
	await expect(more).toHaveCSS('opacity', '1');

	// The same ⋮ toggles it closed again.
	await more.click();
	await expect.poll(() => menuOpen(page)).toBe(true);
	await more.click();
	await expect.poll(() => menuOpen(page)).toBe(false);
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	// Tab and Shift+Tab out of the menu close it, like any menu; focus moves on rather than to the page.
	await more.click();
	await expect(items.first()).toBeFocused();
	await items.last().focus();
	await page.keyboard.press('Tab');
	await expect.poll(() => menuOpen(page)).toBe(false);
	expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
	await more.click();
	await expect(items.first()).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	// Shift+Tab from the first command reaches the header's Wear toggle, still inside the menu.
	await expect(
		itemMenu(page).getByRole('button', { name: 'Wear Wizard hat', exact: true })
	).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect.poll(() => menuOpen(page)).toBe(false);

	// A press on a tile while the menu is open only dismisses the menu: it never also wears or takes off that tile.
	const helmet = head.getByRole('button', { name: /^Steel helmet(,|$)/ });
	const helmetWorn = (await helmet.getAttribute('aria-pressed'))!;
	await more.click();
	await expect.poll(() => menuOpen(page)).toBe(true);
	await helmet.click();
	await expect.poll(() => menuOpen(page)).toBe(false);
	await expect(helmet).toHaveAttribute('aria-pressed', helmetWorn);
	// The next press acts as usual (pressed twice, so the outfit is unchanged).
	await helmet.click();
	await expect(helmet).not.toHaveAttribute('aria-pressed', helmetWorn);
	await helmet.click();
	await expect(helmet).toHaveAttribute('aria-pressed', helmetWorn);

	// The hat lacks north Walk and Cross punch frames (and more in this copy): a warning on its tile, in its name
	// and in its menu.
	await expect(hat).toHaveAccessibleName(/^Wizard hat, missing frames in \d+ moves$/);
	await expect(hat.locator('.tile-status[data-tone="warning"]')).toBeVisible();
	await hat.click({ button: 'right' });
	await expectAnchoredMenu(page);
	await expect(itemMenu(page)).toContainText('Wizard hat');
	await expect(itemMenu(page).locator('.item-menu-marks')).toContainText(
		/Missing frames in \d+ moves; it hides there\./
	);
	await page.keyboard.press('Escape');
	await expect(more).toBeFocused();

	await hat.focus();
	await page.keyboard.press('Shift+F10');
	await expectAnchoredMenu(page);
	await expect(items.first()).toBeFocused();

	// Wear is a toggle in the menu header, not a command: one fixed name, the state in aria-pressed, and a different
	// glyph and status line for each state.
	const toggle = itemMenu(page).getByRole('button', { name: 'Wear Wizard hat', exact: true });
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(toggle).toHaveAttribute('title', 'Wear');
	const glyph = () => toggle.locator('svg').getAttribute('class');
	const offGlyph = await glyph();
	await expect(itemMenu(page).locator('.item-menu-marks')).not.toContainText('Wearing');
	await toggle.click();
	await expect(hat).toHaveAttribute('aria-pressed', 'true');
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await expect(toggle).toHaveAccessibleName('Wear Wizard hat');
	await expect.poll(glyph).not.toBe(offGlyph);
	await expect(itemMenu(page).locator('.item-menu-marks')).toContainText('Wearing');

	// Delete asks first, focusing the safe choice.
	await items.last().click();
	const deleteAlert = page.getByRole('alertdialog', { name: 'Move Wizard hat to Trash?' });
	await expect(itemMenu(page)).not.toBeVisible();
	await expect(deleteAlert.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
	// Focus then lands on the next tile in the category, else the previous one (Empty at least), never the paid
	// New item button.
	const neighbor = await hat.evaluate((tile) => {
		const tiles = [...tile.closest('.slot-tiles')!.querySelectorAll<HTMLElement>('.bu-tile')];
		const at = tiles.indexOf(tile as HTMLElement);
		return (tiles[at + 1] ?? tiles[at - 1]).getAttribute('aria-label')!;
	});
	await deleteAlert.getByRole('button', { name: 'Move to Trash', exact: true }).click();
	await expect(hat).toHaveCount(0);
	await expect(grid.locator('.shared-tile', { hasText: 'Wizard hat' })).toHaveAccessibleName(
		/^Wizard hat, free from Adventurer(,|$)/
	);
	await expect(head.getByRole('button', { name: neighbor, exact: true })).toBeFocused();

	// Details opens the item sheet; closing it returns focus to this tile's ⋮.
	const helmetMore = head.getByRole('button', {
		name: 'More options for Steel helmet',
		exact: true
	});
	await helmetMore.click();
	await itemMenu(page).getByRole('menuitem', { name: 'Details...', exact: true }).click();
	const details = page.getByRole('dialog', { name: 'Item', exact: true });
	await expect(details.locator('.insp-title')).toHaveText('Steel helmet');
	await details.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(helmetMore).toBeFocused();

	// Scrolling the ⋮ out of view closes the menu; focus stays on that ⋮, without scrolling back or jumping to the header.
	await helmetMore.click();
	await expect.poll(() => menuOpen(page)).toBe(true);
	await page.locator('#wardrobe-list').evaluate((list) => (list.scrollTop += 2000));
	await expect.poll(() => menuOpen(page)).toBe(false);
	await expect(helmetMore).toBeFocused();
	await expect(helmetMore).not.toBeInViewport();

	// Phones get the same arrowed popover, kept on screen.
	await page.setViewportSize({ width: 390, height: 844 });
	await equipmentGroup(page, 'Head');
	await helmetMore.click();
	await expectAnchoredMenu(page);
	await page.keyboard.press('Escape');
	await expect(helmetMore).toBeFocused();
});

test('tile status shows on the tile and in its name, and Recolor opens the item’s colors', async ({
	page
}) => {
	await editableCopy(page);
	// The worn helmet hides the worn hair.
	await pickItem(page, 'Steel helmet');
	let details = await selectedItemDetails(page);
	await openItemSection(details, 'When worn, hide');
	const hairChip = details
		.getByRole('group', { name: 'When worn, hide', exact: true })
		.getByRole('button', { name: 'Hair', exact: true });
	await expect(hairChip).toHaveAttribute('aria-pressed', 'false');
	await hairChip.click();
	// The chip itself shows the saved hide (the manifest is raw state, refreshed through doc.rev).
	await expect(hairChip).toHaveAttribute('aria-pressed', 'true');
	await details.getByRole('button', { name: 'Close', exact: true }).click();
	await equipmentGroup(page, 'Hair');
	const hair = section(page, 'Hair').getByRole('button', {
		name: 'Messy brown hair, hidden by another item',
		exact: true
	});
	await expect(hair).toHaveAttribute('data-dim');
	// A worn tile shows its check mark, and beside it the hidden status, also in its name and dimmed art.
	await expect(hair.locator('.bu-tile-check')).toBeVisible();
	await expect(hair.locator('.tile-status[data-tone="hidden"]')).toHaveAttribute(
		'title',
		'Hidden by another item.'
	);
	await section(page, 'Hair')
		.getByRole('button', { name: 'More options for Messy brown hair', exact: true })
		.click();
	await expect(itemMenu(page)).toContainText('Hidden by another item');
	await page.keyboard.press('Escape');
	// No Demo badge on tiles.
	await expect(page.locator('.equipment-scroll .item-tile .badge')).toHaveCount(0);

	await pickItem(page, 'Red cape');
	details = await selectedItemDetails(page);
	// The trimmed sheet links to the Colors tab instead of repeating it.
	await expect(details.locator('.colors')).toHaveCount(0);
	await openItemSection(details, 'Customize');
	await details.getByRole('button', { name: 'Recolor', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(
		page
			.getByRole('tablist', { name: 'Customization panels', exact: true })
			.getByRole('tab', { name: 'Colors', exact: true })
	).toHaveAttribute('aria-selected', 'true');
	const heading = page.locator('.color-sections').getByRole('heading', { name: 'Red cape' });
	await expect(heading).toBeInViewport();
	const list = (await page.locator('.color-sections').boundingBox())!;
	expect(Math.abs((await heading.boundingBox())!.y - list.y)).toBeLessThan(24);
});

/** Page-data tests load the dev server, whose /src modules the preview server does not serve. */
const devBaseURL = (info: TestInfo) =>
	info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!;

const wornItem = (page: Page, slot: string) =>
	page.evaluate(
		async ({ path, slot }) => {
			const state = await import(path);
			return state.doc.items[slot] ?? null;
		},
		{ path: '/src/studio/state.svelte.ts', slot }
	);

const headLayerOverrides = (page: Page) =>
	page.evaluate(async (path) => {
		const state = await import(path);
		return (
			state.store.project?.manifest.slots.find((slot: { id: string }) => slot.id === 'head')
				?.zOverrides ?? []
		);
	}, '/src/studio/state.svelte.ts');

/** The worn helmet hides the worn hair through its When worn, hide chip. */
async function hideHairWithHelmet(page: Page) {
	await pickItem(page, 'Steel helmet');
	const details = await selectedItemDetails(page);
	await openItemSection(details, 'When worn, hide');
	await details
		.getByRole('group', { name: 'When worn, hide', exact: true })
		.getByRole('button', { name: 'Hair', exact: true })
		.click();
	await details.getByRole('button', { name: 'Close', exact: true }).click();
}

test('item details wears and takes off from its primary action', async ({ page }, info) => {
	await editableCopy(page, devBaseURL(info));
	const details = await openItemDetails(page, 'Wizard hat');
	await expect(details.locator('.insp-sub')).toContainText('Not worn');
	const wear = details.getByRole('button', { name: 'Wear', exact: true });
	// The primary action sits in the sheet footer, in view without scrolling the long details.
	await expect(wear).toBeInViewport();
	await wear.click();
	await expect.poll(() => wornItem(page, 'head')).toBe('hat_wizard');
	await expect(details.getByRole('button', { name: 'Take off', exact: true })).toBeVisible();
	await expect(details.locator('.insp-sub')).toContainText('Wearing');
	await details.getByRole('button', { name: 'Take off', exact: true }).click();
	await expect.poll(() => wornItem(page, 'head')).toBe(null);
	await expect(details.getByRole('button', { name: 'Wear', exact: true })).toBeVisible();
});

test('item details names what hides an item and shows it again', async ({ page }, info) => {
	await editableCopy(page, devBaseURL(info));
	await hideHairWithHelmet(page);
	const details = await openItemDetails(page, 'Messy brown hair');
	await expect(details.locator('.insp-sub')).toContainText('Hidden by another item');
	await expect(details.getByText('Hidden by Steel helmet', { exact: true })).toBeVisible();
	await details.getByRole('button', { name: 'Show Messy brown hair', exact: true }).click();
	await expect(details.locator('.insp-sub')).not.toContainText('Hidden by another item');
	await details.getByRole('button', { name: 'Close', exact: true }).click();
	await equipmentGroup(page, 'Hair');
	await expect(
		section(page, 'Hair')
			.getByRole('button', { name: /^Messy brown hair/ })
			.first()
	).not.toHaveAttribute('data-dim');
});

test('item details reorders layers for an unworn item, gates the ends and resets them', async ({
	page
}, info) => {
	await editableCopy(page, devBaseURL(info));
	const details = await openItemDetails(page, 'Wizard hat');
	const layerSection = await openItemSection(details, 'Layer order');
	const forward = details.getByRole('button', { name: 'Forward', exact: true });
	const backward = details.getByRole('button', { name: 'Backward', exact: true });
	// The hat is not worn; it is placed as if worn, so Backward works among the worn layers.
	await expect(backward).toBeEnabled();
	const before = await headLayerOverrides(page);
	await backward.click();
	await expect.poll(() => headLayerOverrides(page)).not.toEqual(before);
	await expect(details.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
	await expect(forward).toBeEnabled();
	// At the very back there is nothing left to move behind: the arrow disables instead of silently doing nothing.
	for (let step = 0; step < 8 && (await backward.isEnabled()); step++) await backward.click();
	await expect(backward).toBeDisabled();
	await expect(forward).toBeEnabled();
	// A disclosure toggles from the keyboard, and its controls stay reachable.
	const summary = details.locator('summary').filter({ hasText: 'Layer order' });
	await summary.focus();
	await page.keyboard.press('Enter');
	await expect(layerSection).not.toHaveAttribute('open', '');
	await page.keyboard.press('Space');
	await expect(layerSection).toHaveAttribute('open', '');
	await details.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect.poll(() => headLayerOverrides(page)).toEqual(before);
});

test('layer order explains why a hidden item cannot be reordered', async ({ page }, info) => {
	await editableCopy(page, devBaseURL(info));
	await hideHairWithHelmet(page);
	const details = await openItemDetails(page, 'Messy brown hair');
	await openItemSection(details, 'Layer order');
	await expect(details.getByRole('button', { name: 'Forward', exact: true })).toBeDisabled();
	await expect(details.getByRole('button', { name: 'Backward', exact: true })).toBeDisabled();
	await expect(
		details.getByText(/Another worn item hides this one, so its layer order cannot change here/)
	).toBeVisible();
});

for (const width of [1280, 390])
	test(`ordinary character loading starts Wardrobe at the top (${width}px)`, async ({
		page
	}, info) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
		});
		await page.setViewportSize({ width, height: 844 });
		const url = info.config.projects.find((project) => project.name === 'browser-selftests')!.use
			.baseURL!;
		await page.goto(url);
		await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 });
		await page.locator('.customize-action').click();
		const list = page.locator('#wardrobe-list');
		const atTop = async () => {
			await expect(list).toBeVisible();
			await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0);
			await expect(page.locator('[data-rail="head"]')).toHaveAttribute('aria-current', 'true');
		};
		await atTop();
		await equipmentGroup(page, 'Back');
		await list.evaluate((element) => (element.scrollTop += 25));
		const offset = await list.evaluate((element) => element.scrollTop);
		expect(offset).toBeGreaterThan(0);
		await equipmentMode(page, 'Colors');
		await equipmentMode(page, 'Wardrobe');
		await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(offset);
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject(state.doc.id, { quiet: true });
		});
		await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(offset);
		const copy = await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.copyDemo();
			return state.doc.id;
		});
		await atTop();
		await list.evaluate((element) => (element.scrollTop = 25));
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject('fixture:s2');
		});
		await atTop();
		await equipmentGroup(page, 'Back');
		await equipmentMode(page, 'Colors');
		await page.evaluate(async (id) => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject(id);
		}, copy);
		await equipmentMode(page, 'Wardrobe');
		await atTop();
		await list.evaluate((element) => (element.scrollTop = 25));
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject(state.doc.id);
		});
		await atTop();
		await list.evaluate((element) => (element.scrollTop = 25));
		await equipmentMode(page, 'Colors');
		await page.evaluate(async () => {
			const path = '/src/studio/state.svelte.ts',
				state = await import(path);
			await state.openProject(state.doc.id);
		});
		await equipmentMode(page, 'Wardrobe');
		await atTop();
		await page.reload();
		await expect(page.locator('.customize-action')).toBeEnabled({ timeout: 20_000 });
		await page.locator('.customize-action').click();
		await atTop();
	});

test('explicit item opens reveal shared IDs and quiet refresh keeps the selected tile in place', async ({
	page
}, info) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((project) => project.name === 'browser-selftests')!.use.baseURL!
	);
	const ids = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			state = await import(statePath);
		const projectPath = '/src/lib/store/project.ts',
			project = await import(projectPath);
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		const first = await state.copyDemo();
		const context = await project.loadProject(first);
		const helmet = context.rec.manifest.items.find(
			(item: { id: string }) => item.id === 'helmet_steel'
		);
		context.rec.manifest.items.unshift(
			...Array.from({ length: 24 }, (_, index) => ({
				...structuredClone(helmet),
				id: `extra-helmet-${index}`,
				name: `Extra helmet ${index}`
			}))
		);
		await db.put('projects', first, context.rec);
		await state.openProject(first);
		const second = await state.copyDemo();
		await state.openProject(first, { wear: 'hat_wizard' });
		return { first, second };
	});
	const list = page.locator('#wardrobe-list');
	const visibleBelowHeader = async () => {
		await expect
			.poll(() =>
				list.evaluate((element) => {
					const tile = element.querySelector('[data-tile="hat_wizard"]')!.getBoundingClientRect();
					const header = element.querySelector('.bu-section-head')!.getBoundingClientRect();
					return tile.top >= header.bottom && tile.bottom <= element.getBoundingClientRect().bottom;
				})
			)
			.toBe(true);
	};
	await visibleBelowHeader();
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openProject(id, { wear: 'hat_wizard' });
	}, ids.second);
	await visibleBelowHeader();
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openProject(state.doc.id, { wear: 'hat_wizard' });
	});
	await visibleBelowHeader();
	const before = await page.evaluate(() => ({
		selected: window.__studio!.ui.selected,
		scroll: document.querySelector('#wardrobe-list')!.scrollTop
	}));
	expect(before.selected).toBe('hat_wizard');
	expect(before.scroll).toBeGreaterThan(0);
	await page.evaluate(async () => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openProject(state.doc.id, { quiet: true });
	});
	expect(await page.evaluate(() => window.__studio!.ui.selected)).toBe(before.selected);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(before.scroll);
	await page.evaluate(async (id) => {
		const path = '/src/studio/state.svelte.ts',
			state = await import(path);
		await state.openProject(id);
	}, ids.first);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0);
	await page.evaluate(() => {
		window.__studio!.ui.selected = 'hat_wizard';
	});
	await visibleBelowHeader();
});

test('Wardrobe lands on a category picked while closed and reveals tiles below the sticky header', async ({
	page
}, info) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.setViewportSize({ width: 1280, height: 720 });
	// The dev server exposes the studio state (window.__studio) used to pick a category from elsewhere.
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await equipmentGroup(page, 'Back');
	await equipmentMode(page, 'Colors');
	// Another view (a review, a missing-frames link) picks a category while the Wardrobe is closed.
	await page.evaluate(() => {
		const s = (window as unknown as { __studio: { ui: { group: string; tab: string } } }).__studio;
		s.ui.group = 'main_hand';
		s.ui.tab = 'wardrobe';
	});
	const list = page.locator('#wardrobe-list');
	const top = async (name: string) =>
		(await section(page, name).boundingBox())!.y - (await list.boundingBox())!.y;
	await expect.poll(() => top('Main hand')).toBeLessThan(4);
	const rail = page.getByRole('navigation', { name: 'Equipment slots', exact: true });
	await expect(rail.getByRole('button', { name: /^Main hand\b/ })).toHaveAttribute(
		'aria-current',
		'true'
	);

	// A tile half under a category's sticky header is brought fully into view when selected.
	await equipmentGroup(page, 'Head');
	const head = section(page, 'Head');
	const header = head.locator('.bu-section-head');
	const hat = head.getByRole('button', { name: /^Wizard hat(,|$)/ });
	await list.evaluate((el) => (el.scrollTop += 50));
	await page.evaluate(() => {
		(window as unknown as { __studio: { ui: { selected: string } } }).__studio.ui.selected =
			'hat_wizard';
	});
	await expect
		.poll(async () => {
			const tile = (await hat.boundingBox())!,
				bar = (await header.boundingBox())!,
				box = (await list.boundingBox())!;
			return tile.y >= bar.y + bar.height && tile.y + tile.height <= box.y + box.height;
		})
		.toBe(true);
});

test('a hand item can be two-handed, takes both hands, and offers a matching item for the other hand', async ({
	page,
	context
}, info) => {
	const posts: string[] = [];
	await context.route('https://api.pixellab.ai/**', (route) => {
		if (route.request().method() === 'POST') posts.push(new URL(route.request().url()).pathname);
		if (new URL(route.request().url()).pathname === '/v2/balance')
			return route.fulfill({
				json: {
					subscription: { type: 'generations', status: 'active', generations: 100, total: 100 },
					credits: { type: 'usd', usd: 0 }
				}
			});
		return route.abort();
	});
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
		localStorage.setItem('pixellabApiKey', 'synthetic-two-handed-key');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	// An editable copy of the demo with a second hand item (the sword's art in the Off hand), worn with the sword.
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		const projectPath = '/src/lib/store/project.ts',
			project = await import(projectPath);
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await s.copyDemo();
		const ctx = await project.loadProject(s.doc.id),
			m = ctx.rec.manifest;
		const sword = m.items.find((i: { slot: string }) => i.slot === 'main_hand');
		m.items.push({
			...structuredClone(sword),
			id: 'round_shield',
			name: 'Round shield',
			slot: 'off_hand',
			materials: []
		});
		const slotsPath = '/src/lib/items/slots.ts',
			slots = await import(slotsPath);
		m.slots.push(slots.slotLadder(m.rig).find((slot: { id: string }) => slot.id === 'off_hand'));
		await db.put('projects', ctx.rec.id, ctx.rec);
		await s.openProject(ctx.rec.id);
		s.pick(sword.id);
		s.pick('round_shield');
	});
	const main = section(page, 'Main hand'),
		off = section(page, 'Off hand');
	const sword = main.getByRole('button', { name: /^Steel longsword(,|$)/ }),
		shield = off.getByRole('button', { name: /^Round shield(,|$)/ });
	await equipmentGroup(page, 'Main hand');
	await expect(sword).toHaveAttribute('aria-pressed', 'true');
	await expect(shield).toHaveAttribute('aria-pressed', 'true');

	await main.getByRole('button', { name: 'More options for Steel longsword', exact: true }).click();
	await expectAnchoredMenu(page);
	const twoHanded = itemMenu(page).getByRole('menuitemcheckbox', { name: 'Two-handed' });
	await expect(twoHanded).not.toBeChecked();
	await expect(
		itemMenu(page).getByRole('menuitem', { name: 'Make one for the Off hand...', exact: true })
	).toBeVisible();

	// Switching it on while worn takes the other hand's item off, says so, and Undo brings it back.
	await twoHanded.click();
	await expect(twoHanded).toBeChecked();
	await expect(itemMenu(page).locator('.item-menu-title small')).toContainText('Two-handed');
	await expect(itemMenu(page).getByRole('menuitem', { name: /^Make one for/ })).toHaveCount(0);
	await expect(
		page.getByText('Took off Round shield: Steel longsword is two-handed')
	).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(shield).toHaveAttribute('aria-pressed', 'false');
	await expect(sword).toHaveAttribute('aria-pressed', 'true');
	await expect(off).toContainText('Held by Steel longsword (two-handed).');

	// Putting something in the other hand takes the two-handed item off.
	await shield.click();
	await expect(shield).toHaveAttribute('aria-pressed', 'true');
	await expect(sword).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByText('Took off Steel longsword (two-handed)')).toBeVisible();
	await expect(off).not.toContainText('Held by');
	await page.getByRole('button', { name: /^Undo/ }).click();
	await expect(sword).toHaveAttribute('aria-pressed', 'true');
	await expect(shield).toHaveAttribute('aria-pressed', 'false');

	// The switch is undoable and off again offers the other hand.
	await page.getByRole('button', { name: /^Undo/ }).click();
	await expect(shield).toHaveAttribute('aria-pressed', 'true');
	await expect(off).not.toContainText('Held by');

	// Make one for the other hand opens New item for that hand with the same description; the Off hand item offers
	// the Main hand.
	await off.getByRole('button', { name: 'More options for Round shield', exact: true }).click();
	await expect(
		itemMenu(page).getByRole('menuitem', { name: 'Make one for the Main hand...', exact: true })
	).toBeVisible();
	await page.keyboard.press('Escape');
	await main.getByRole('button', { name: 'More options for Steel longsword', exact: true }).click();
	await itemMenu(page)
		.getByRole('menuitem', { name: 'Make one for the Off hand...', exact: true })
		.click();
	const sheet = page.getByRole('dialog', { name: 'New item', exact: true });
	await expect(
		sheet.getByRole('button', { name: 'Where does it go?: Off hand', exact: true })
	).toBeVisible();
	const prompt = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		return s.store.project.manifest.items.find((i: { slot: string }) => i.slot === 'main_hand')
			.prompt;
	});
	await expect(sheet.getByRole('textbox', { name: 'What is it?', exact: true })).toHaveValue(
		prompt
	);
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();

	// Enter toggles the switch like any menu item.
	await expect(page.getByRole('dialog', { name: 'New item', exact: true })).toHaveCount(0);
	await main.getByRole('button', { name: 'More options for Steel longsword', exact: true }).click();
	await expectAnchoredMenu(page);
	const toggle = itemMenu(page).getByRole('menuitemcheckbox', { name: 'Two-handed' });
	await toggle.focus();
	await page.keyboard.press('Enter');
	await expect(toggle).toBeChecked();
	await page.keyboard.press('Escape');
	await expect(shield).toHaveAttribute('aria-pressed', 'false');

	// An outfit keeps the Main hand even when only its Off hand differs from what is worn, and still counts as current.
	const outfit = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		const p = {
			id: 'both-hands',
			name: 'Both hands',
			items: { ...s.doc.items, off_hand: 'round_shield' },
			variants: { ...s.doc.variants }
		};
		s.applyPreset(p);
		return { main: s.doc.items.main_hand, off: s.doc.items.off_hand, same: s.sameOutfit(p) };
	});
	expect(outfit).toEqual({ main: 'sword_steel', off: null, same: true });

	// An item put on by Keep it that needs the other hand is one undoable edit.
	await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			s = await import(statePath);
		await s.openProject(s.doc.id, { wear: 'round_shield' });
	});
	await expect(shield).toHaveAttribute('aria-pressed', 'true');
	await expect(sword).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Undo Wear Round shield', exact: true }).click();
	await expect(sword).toHaveAttribute('aria-pressed', 'true');
	await expect(shield).toHaveAttribute('aria-pressed', 'false');
	expect(posts).toEqual([]);
});

test.describe('row and tile actions on a touch screen', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the ⋮ stays visible without hover', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('pixeldoll.agentKey', 'off');
			localStorage.setItem('pixeldoll.welcomed', '1');
		});
		await openStudio(page, '/#/');
		const tile = section(page, 'Head')
			.getByRole('button', { name: /^More options for / })
			.first();
		await expect(tile).toHaveCSS('opacity', '1');
		await equipmentMode(page, 'Outfits');
		await expect(page.locator('.outfits .character-more').first()).toHaveCSS('opacity', '1');
		await equipmentMode(page, 'Moves');
		await expect(page.locator('.move-list .character-more').first()).toHaveCSS('opacity', '1');
		expect(
			await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)
		).toBe(false);
	});
});

test('Fix frames: download, edit, review, replace, Undo and Restore for an item and the body, offline', async ({
	page,
	context
}, info) => {
	await context.route('https://*.pixellab.ai/**', (route) => route.abort());
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(
		page,
		info.config.projects.find((p) => p.name === 'browser-selftests')!.use.baseURL!
	);
	await page.evaluate(async () => {
		const p = '/src/studio/state.svelte.ts',
			s = (await import(p)) as typeof import('../../src/studio/state.svelte.ts');
		await s.copyDemo();
	});
	const pixels = (anim: string, itemId: string) =>
		page.evaluate(
			async ([anim, itemId]) => {
				const s = await import('/src/studio/state.svelte.ts' as string),
					fix = await import('/src/lib/frames/fix.ts' as string);
				return Array.from(fix.frameSheets(s.store.project, itemId, anim)[0].image.data as number[]);
			},
			[anim, itemId]
		);
	const original = await pixels('walk', 'helmet_steel');

	await page.getByRole('button', { name: 'More options for Steel helmet' }).click();
	await page.getByRole('menuitem', { name: /^Fix frames/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Fix frames' });
	await sheet.getByRole('combobox', { name: 'Move' }).selectOption('walk');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		sheet.getByRole('button', { name: 'Download PNG' }).click()
	]);
	expect(download.suggestedFilename()).toMatch(/-walk\.png$/);
	const png = await decodePngBytes(readFileSync((await download.path())!));
	expect([png.w, png.h]).toEqual([512, 256]);
	const edit = (x: number, y: number) => {
		const data = new Uint8ClampedArray(png.data);
		data.set([214, 60, 190, 255], (y * png.w + x) * 4);
		return encodePngBytes({ ...png, data });
	};
	const importPng = async (bytes: Uint8Array, name = 'edited.png') =>
		sheet.locator('input[type=file]').setInputFiles({
			name,
			mimeType: 'image/png',
			buffer: Buffer.from(bytes)
		});

	// Paste imports the clipboard image like a chosen file.
	await page.evaluate(() => {
		navigator.clipboard.read = async () => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 10;
			const png = await new Promise<Blob>((done) => canvas.toBlob((blob) => done(blob!)));
			return [new ClipboardItem({ 'image/png': png })];
		};
	});
	await sheet.getByRole('button', { name: 'Paste from clipboard', exact: true }).click();
	await expect(sheet.getByRole('alert')).toContainText('This PNG is 10×10 px');
	await importPng(await encodePngBytes(makeImg(10, 10)));
	await expect(sheet.getByRole('alert')).toContainText('need 512×256 px');

	await importPng(await edit(3 * 64 + 31, 12));
	const review = page.getByRole('dialog', { name: 'Review frames' });
	await expect(review).toContainText('1 frame changed');
	await expect(review).toContainText("1 new color won't change with Recolor.");
	await review.getByRole('button', { name: /^Replace 1 frame/ }).click();
	await expect(sheet).toContainText('Restore original · 1');
	expect(await pixels('walk', 'helmet_steel')).not.toEqual(original);
	// The notice body is inert: only its Undo button reverts the import.
	const toast = page.locator('.bu-toast-region');
	await toast.locator('.bu-notice-content').click();
	expect(await pixels('walk', 'helmet_steel')).not.toEqual(original);
	await toast.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => pixels('walk', 'helmet_steel')).toEqual(original);
	// Redo makes the import again, from the history it went to.
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(page.locator('.header-redo')).toHaveAccessibleName('Redo Fix frames');
	await page.locator('.header-redo').click();
	await expect.poll(() => pixels('walk', 'helmet_steel')).not.toEqual(original);
	await page.locator('.header-undo').click();
	await expect.poll(() => pixels('walk', 'helmet_steel')).toEqual(original);
	await page.getByRole('button', { name: 'More options for Steel helmet' }).click();
	await page.getByRole('menuitem', { name: /^Fix frames/ }).click();
	await sheet.getByRole('combobox', { name: 'Move' }).selectOption('walk');

	await importPng(await edit(3 * 64 + 31, 12));
	await review.getByRole('button', { name: /^Replace 1 frame/ }).click();
	await page.reload();
	await page.getByRole('button', { name: 'Customize Adventurer copy' }).first().click();
	await page.getByRole('button', { name: 'More options for Steel helmet' }).click();
	await page.getByRole('menuitem', { name: /^Details/ }).click();
	const itemPane = page.getByRole('dialog', { name: 'Item' });
	await openItemSection(itemPane, 'Customize');
	await itemPane.getByRole('button', { name: /^Fix frames/ }).click();
	await sheet.getByRole('combobox', { name: 'Move' }).selectOption('walk');
	await sheet.getByRole('button', { name: 'Restore original · 1' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(sheet.getByText('Restored 1 original frame.')).toBeVisible();
	expect(await pixels('walk', 'helmet_steel')).toEqual(original);
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	// Restoring is one history step: Undo brings the edited frame back and Redo restores it again.
	await expect(page.locator('.header-undo')).toHaveAccessibleName('Undo Restore originals');
	await page.locator('.header-undo').click();
	await expect.poll(() => pixels('walk', 'helmet_steel')).not.toEqual(original);
	await page.locator('.header-redo').click();
	await expect.poll(() => pixels('walk', 'helmet_steel')).toEqual(original);

	await equipmentMode(page, 'Moves');
	await page.getByRole('button', { name: 'More actions for Walk' }).click();
	await page.getByRole('menuitem', { name: /^Fix frames/ }).click();
	await expect(sheet.getByRole('combobox', { name: 'Frames of' })).toHaveValue('base');
	const body = await pixels('walk', 'base');
	const bodyPng = { w: 512, h: 256, data: new Uint8ClampedArray(body) };
	bodyPng.data.set([40, 200, 240, 255], (20 * 512 + 30) * 4);
	await importPng(await encodePngBytes(bodyPng), 'adventurer-body-walk.png');
	await expect(review).toContainText('Items fitted to these body frames stay worn');
	await review.getByRole('button', { name: /^Replace 1 frame/ }).click();
	await expect(sheet).toContainText('Restore original · 1');
	const fitted = await page.evaluate(async () => {
		const s = await import('/src/studio/state.svelte.ts' as string),
			m = s.store.project.manifest;
		return {
			stale: m.items.filter((i: { baseHash: string }) => i.baseHash !== m.rig.baseHash).length,
			worn: s.doc.items.head
		};
	});
	expect(fitted).toEqual({ stale: 0, worn: 'helmet_steel' });
});

test('a deleted item comes back from the notice, the history and the Trash after a reload', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await openStudio(page, '/#/');
	await newItem(page, 'Head');
	await page.getByRole('button', { name: 'Copy the demo body', exact: true }).click();
	await page.getByRole('textbox', { name: 'What is it?', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await pickItem(page, 'Red cape');
	const tile = () =>
		page.locator('.equipment-scroll .item-tile').getByText('Red cape', { exact: true });

	async function deleteItem() {
		const inspector = await selectedItemDetails(page);
		await openItemSection(inspector, 'Item actions');
		await inspector.getByRole('button', { name: 'Move to Trash...', exact: true }).click();
		const alert = page.getByRole('alertdialog', { name: /^Move .+ to Trash\?$/ });
		await alert.getByRole('button', { name: 'Move to Trash', exact: true }).click();
		await expect(alert).toHaveCount(0);
	}

	// The notice takes it back.
	await deleteItem();
	await expect(tile()).toHaveCount(0);
	const notice = page.locator('.bu-toast');
	await expect(notice).toContainText('Moved Red cape to Trash');
	await notice.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(tile()).toHaveCount(1);

	// The history takes it back too, without a reload.
	await deleteItem();
	await expect(tile()).toHaveCount(0);
	await page.keyboard.press('Control+z');
	await expect(tile()).toHaveCount(1);

	// After a reload the notice and the history are gone; the Library still has it.
	await deleteItem();
	await expect(tile()).toHaveCount(0);
	await reloadStudio(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await settings.getByRole('button', { name: 'Library', exact: true }).click();
	await settings.getByRole('button', { name: 'Trash', exact: true }).click();
	const recently = settings.getByRole('region', { name: 'Trash', exact: true });
	await expect(recently).toContainText('Red cape');
	// The first press only asks, in place; Escape takes the question back and a second press restores.
	const row = recently.getByRole('button', { name: 'Restore Red cape', exact: true });
	const asking = recently.getByRole('button', {
		name: 'Press again to restore Red cape',
		exact: true
	});
	await row.click();
	await expect(asking).toBeFocused();
	await expect(asking).toContainText('Press again to restore');
	await page.keyboard.press('Escape');
	await expect(row).toBeFocused();
	await expect(settings).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(asking).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByText('Restored Red cape')).toBeVisible();
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(tile()).toHaveCount(1);
});
