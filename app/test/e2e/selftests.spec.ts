import { openStudio } from './immersive-helpers.ts';
import { expect, test, type Locator } from '@playwright/test';
import { browserSelfTests } from '../../src/lib/selftests.ts';
import { readFile } from 'node:fs/promises';
import { unzip } from '../../src/lib/store/zip.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { cellHash, type DirectionName } from '../../src/lib/rig/rig.ts';
import { sha256 } from '../../src/lib/image/hash.ts';

test('offline Motion Lab edits and roundtrips motions without requesting generations', async ({
	page
}, testInfo) => {
	const paid: string[] = [],
		errors: string[] = [];
	await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	await page.route('https://*.pixellab.ai/**', (route) => {
		paid.push(route.request().method());
		return route.abort();
	});
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/motion-lab.html');
	await expect(page.getByRole('status')).toContainText('Offline lab ready');
	await page.getByRole('combobox', { name: 'Direction', exact: true }).selectOption('east');
	await expect(
		page.getByRole('spinbutton', { name: 'Camera bearing', exact: true })
	).not.toHaveValue('0');
	await page.getByRole('combobox', { name: 'Preset', exact: true }).selectOption('death');
	await expect(page.getByRole('checkbox', { name: 'Append terminal buffer' })).toBeChecked();
	await expect(page.getByRole('region', { name: 'Pose diagnostics' })).toContainText(
		'128 × 128 px'
	);
	await page.getByRole('combobox', { name: 'Preset', exact: true }).selectOption('idle');
	await page.getByRole('checkbox', { name: 'Correct reference joints' }).check();
	const field = page.getByRole('spinbutton', { name: 'X, fraction', exact: true }),
		previous = await field.inputValue();
	await field.fill(String(Number(previous) + 0.005));
	await page.getByRole('button', { name: 'Apply joint edit', exact: true }).click();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(field).toHaveValue(previous);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(field).not.toHaveValue(previous);
	const calibrated = await field.inputValue();
	await page.getByRole('combobox', { name: 'Preset', exact: true }).selectOption('walk');
	await expect(field).toHaveValue(calibrated);
	await page.getByRole('combobox', { name: 'Preset', exact: true }).selectOption('idle');
	await expect(field).toHaveValue(calibrated);
	await page.getByRole('spinbutton', { name: 'Camera elevation', exact: true }).fill('17');
	await page.getByRole('button', { name: 'Save body/view calibration', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Calibration saved');
	await page.getByRole('combobox', { name: 'Body', exact: true }).selectOption('chibi');
	await page.getByRole('combobox', { name: 'Body', exact: true }).selectOption('c27man');
	await page.getByRole('combobox', { name: 'Direction', exact: true }).selectOption('east');
	await expect(field).toHaveValue(calibrated);
	await expect(page.getByRole('spinbutton', { name: 'Camera elevation', exact: true })).toHaveValue(
		'17'
	);
	await page.reload();
	await expect(page.getByRole('status')).toContainText('Offline lab ready');
	await page.getByRole('combobox', { name: 'Direction', exact: true }).selectOption('east');
	await page.getByRole('checkbox', { name: 'Correct reference joints' }).check();
	await expect(field).toHaveValue(calibrated);
	await expect(page.getByRole('spinbutton', { name: 'Camera elevation', exact: true })).toHaveValue(
		'17'
	);
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save motion document' }).click();
	const file = await (await downloading).path();
	await page.getByRole('combobox', { name: 'Body', exact: true }).selectOption('chibi');
	await page.getByLabel('Import motion document', { exact: true }).setInputFiles(file!);
	await expect(page.getByRole('combobox', { name: 'Body', exact: true })).toHaveValue('c27man');
	await page.getByRole('combobox', { name: 'KayKit control', exact: true }).selectOption('walk');
	await expect(page.getByRole('combobox', { name: 'Preset', exact: true })).toHaveValue(
		'kaykit-walk'
	);
	await page.getByRole('combobox', { name: 'Body', exact: true }).selectOption('chibi');
	await expect(page.getByRole('combobox', { name: 'Preset', exact: true })).toHaveValue(
		'kaykit-walk'
	);
	await expect(page.getByRole('button', { name: /Generate candidate/ })).toBeDisabled();
	await page.getByRole('combobox', { name: 'Preset', exact: true }).selectOption('run');
	await page.getByRole('button', { name: 'Draft stance contacts', exact: true }).click();
	await page.getByRole('button', { name: 'Sample contact events', exact: true }).click();
	await expect(
		page.getByRole('spinbutton', { name: 'World Z speed, px/s', exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Remove authored contacts', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Sample contact events', exact: true })
	).toBeDisabled();
	await page.screenshot({ path: testInfo.outputPath('motion-lab.png'), fullPage: true });
	expect(paid).toEqual([]);
	expect(errors).toEqual([]);
});

test('Motion Lab preserves candidate review, buffer exclusion and authored hold in credential-free exports', async ({
	page
}, testInfo) => {
	await page.clock.install();
	const paid: string[] = [];
	await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	await page.route('https://*.pixellab.ai/**', (route) => {
		paid.push(route.request().method());
		return route.abort();
	});
	await page.goto('/motion-lab.html');
	await expect(page.getByRole('status')).toContainText('Offline lab ready');
	await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			modelPath = '/src/ui/motion-lab/model.ts',
			db = await import(dbPath),
			model = await import(modelPath),
			library = await (await fetch('/fixtures/motion-lab/library.json')).json();
		const document = model.newDocument(
				library,
				library.fixtures[0],
				library.clips.find((c: { id: string }) => c.id === 'death')
			),
			png = document.fixture.references.south.png;
		document.times = [0, 1.1, 2.2];
		document.durations = [1100, 1100, 400];
		const pngPath = '/src/lib/image/pngraw.ts',
			codec = await import(pngPath),
			native = await codec.decodePngBytes(Uint8Array.from(atob(png), (c) => c.charCodeAt(0)));
		const bytes = await codec.encodePngBytes(model.paddedReference(native, document.padding)),
			sha = await db.putBlob(bytes),
			now = Date.now();
		const rendered = model.renderPoses(document),
			params = {
				first_frame: { $blob: sha },
				first_frame_keypoints: rendered.result.rest,
				keypoints: rendered.poses
			};
		await db.put('jobs', 'motion-review-fixture', {
			id: 'motion-review-fixture',
			label: 'Review fixture',
			tag: 'motion-lab-2026-10-28',
			method: 'POST',
			endpoint: '/animate-with-skeleton-v3',
			params,
			inputs: [sha],
			requestHash: 'fixture',
			state: 'done',
			attempts: 1,
			nextAt: 0,
			createdAt: now,
			finishedAt: now,
			jobs: [
				{
					id: 'fixture-remote',
					status: 'completed',
					done: true,
					results: Array.from({ length: 4 }, (_, i) => ({ label: String(i), sha }))
				}
			],
			gens: 3,
			usd: 0
		});
		localStorage.setItem(
			'pixeldoll.motionLab.2026-10-28',
			JSON.stringify({
				version: 1,
				reservations: [
					{
						id: 'fixture',
						jobId: 'motion-review-fixture',
						estimate: 3,
						label: 'Review fixture',
						document,
						seed: 7,
						createdAt: new Date(now).toISOString()
					}
				]
			})
		);
	});
	await page.reload();
	const candidate = page
		.getByRole('article')
		.filter({ has: page.getByRole('heading', { name: 'Review fixture', exact: true }) });
	await expect(
		candidate.getByRole('button', { name: 'Export reviewed clip', exact: true })
	).toBeDisabled();
	await candidate.getByRole('button', { name: 'Inspect raw frame 4', exact: true }).click();
	await expect(candidate.getByRole('checkbox', { name: 'Use selected frame' })).not.toBeChecked();
	await candidate.getByRole('button', { name: 'Inspect raw frame 3', exact: true }).click();
	await candidate
		.getByRole('spinbutton', { name: 'Selected frame duration, ms', exact: true })
		.fill('450');
	await candidate
		.getByRole('combobox', { name: 'Review status', exact: true })
		.selectOption('accepted');
	await candidate
		.getByRole('textbox')
		.fill('Fixture for export persistence only; no visual qualification.');
	await page.evaluate(async () => {
		const path = '/src/ui/motion-lab/run.ts';
		await (await import(path)).connectLab();
	});
	await expect(candidate.getByRole('textbox')).toHaveValue(
		'Fixture for export persistence only; no visual qualification.'
	);
	await candidate.getByRole('button', { name: 'Save review', exact: true }).click();
	await expect(candidate.getByRole('status')).toHaveText('Review saved locally.');
	await page.reload();
	await expect(candidate.getByRole('textbox')).toHaveValue(
		'Fixture for export persistence only; no visual qualification.'
	);
	const downloading = page.waitForEvent('download');
	await candidate.getByRole('button', { name: 'Export reviewed clip', exact: true }).click();
	const output = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
	expect(output.frames).toHaveLength(3);
	expect(output.frames.at(-1).sourceIndex).toBe(2);
	expect(output.frames.at(-1).duration).toBe(1050);
	expect(output.frames[0].duration).toBe(1100);
	expect(output.frames[0].keypoints).toHaveLength(18);
	expect(output.reference.keypoints).toHaveLength(18);
	expect(output.loop).toBe(false);
	expect(output.kind).toBe('pixeldoll-reviewed-motion');
	expect(output.cell).toEqual({ w: 128, h: 128 });
	expect(output.pivot.x).toBe(output.fixture.pivot.x + 24);
	await candidate.getByRole('button', { name: 'Inspect raw frame 1', exact: true }).click();
	await candidate.getByRole('button', { name: 'Play candidate', exact: true }).click();
	await page.clock.runFor(4000);
	await expect(
		candidate.getByRole('button', { name: 'Play candidate', exact: true })
	).toBeVisible();
	await expect(candidate.getByText('Raw frame 3/4', { exact: true })).toBeVisible();
	expect(paid).toEqual([]);
	await candidate.getByRole('button', { name: 'Author held item', exact: true }).click();
	const editor = page.getByRole('region', { name: 'Authored held item', exact: true });
	await editor.getByLabel('Attachment PNG', { exact: true }).setInputFiles({
		name: 'synthetic-source.png',
		mimeType: 'image/png',
		buffer: Buffer.from(output.reference.png, 'base64')
	});
	await editor.getByRole('spinbutton', { name: 'Blade angle, degrees', exact: true }).fill('35');
	await editor
		.getByRole('textbox', { name: 'Attachment review notes', exact: true })
		.fill('Synthetic UI fixture only, no weapon quality claim.');
	await editor.getByRole('button', { name: 'Save attachment draft', exact: true }).click();
	await expect(editor.getByRole('status')).toContainText('saved locally');
	const attachmentDownload = page.waitForEvent('download');
	await editor.getByRole('button', { name: 'Save attachment document', exact: true }).click();
	const attachment = JSON.parse(await readFile((await (await attachmentDownload).path())!, 'utf8'));
	expect(attachment.body.hashes).toHaveLength(4);
	expect(attachment.frames[0].angle).toBe(35);
	expect(attachment.body.jobId).toBe('motion-review-fixture');
	expect(attachment.body.padding).toBeGreaterThan(0);
	const fixtureBody = await decodePngBytes(Buffer.from(output.reference.png, 'base64')),
		hint = output.frames[0].keypoints.find((k: { label: string }) => k.label === 'RIGHT ARM'),
		hand = { x: Math.floor(hint.x * fixtureBody.w), y: Math.floor(hint.y * fixtureBody.h) };
	expect(fixtureBody.data[(hand.y * fixtureBody.w + hand.x) * 4 + 3]).toBe(255);
	const sourceCanvas = editor.getByLabel('Attachment source artwork', { exact: true }),
		sourceBox = (await sourceCanvas.boundingBox())!;
	await sourceCanvas.click({
		position: {
			x: sourceBox.width * ((hand.x + 0.5) / 128),
			y: sourceBox.height * ((hand.y + 0.5) / 128)
		}
	});
	await expect(editor.getByRole('spinbutton', { name: 'Source grip x', exact: true })).toHaveValue(
		String(hand.x + 0.5)
	);
	await expect(editor.getByRole('spinbutton', { name: 'Source grip y', exact: true })).toHaveValue(
		String(hand.y + 0.5)
	);
	await editor.getByRole('combobox', { name: 'Source point', exact: true }).selectOption('axis');
	await sourceCanvas.click({
		position: { x: sourceBox.width * (96.25 / 128), y: sourceBox.height * (32.25 / 128) }
	});
	await expect(editor.getByRole('spinbutton', { name: 'Source axis x', exact: true })).toHaveValue(
		'96.5'
	);
	await editor.getByRole('checkbox', { name: 'Show grip guides', exact: true }).uncheck();
	const previewCanvas = editor.getByLabel('Attachment grip and occlusion editor', { exact: true });
	const opaquePreview = () =>
		previewCanvas.evaluate((element: HTMLCanvasElement) =>
			element
				.getContext('2d')!
				.getImageData(0, 0, element.width, element.height)
				.data.some((v, i) => i % 4 === 3 && v > 0)
		);
	await expect.poll(opaquePreview).toBe(true);
	await editor.getByRole('spinbutton', { name: 'Source grip x', exact: true }).fill('-1');
	await expect(editor.getByRole('alert')).toContainText('grip inside');
	await expect
		.poll(opaquePreview, { message: 'A failed render must clear the previous good frame' })
		.toBe(false);
	await expect
		.poll(() =>
			sourceCanvas.evaluate((canvas: HTMLCanvasElement) =>
				canvas
					.getContext('2d')!
					.getImageData(0, 0, canvas.width, canvas.height)
					.data.some((v, i) => i % 4 === 3 && v > 0)
			)
		)
		.toBe(true);
	await editor.screenshot({ path: testInfo.outputPath('failed-preview-cleared.png') });
	await editor.getByRole('combobox', { name: 'Source point', exact: true }).selectOption('grip');
	await sourceCanvas.click({
		position: {
			x: sourceBox.width * ((hand.x + 0.5) / 128),
			y: sourceBox.height * ((hand.y + 0.5) / 128)
		}
	});
	await expect.poll(opaquePreview).toBe(true);
	await expect(editor.getByRole('alert')).toHaveCount(0);
	// This transport fixture deliberately reuses one standing PNG for every death pose.
	// Its moving wrist hints are not valid contacts on that unchanged bitmap.
	for (let i = 0; i < 4; i++) {
		await editor
			.getByRole('button', { name: `Author attachment frame ${i + 1}`, exact: true })
			.click();
		const box = (await previewCanvas.boundingBox())!,
			nativeSize = fixtureBody.w + 2 * attachment.body.padding;
		await previewCanvas.click({
			position: {
				x: ((hand.x + attachment.body.padding + 0.5) * box.width) / nativeSize,
				y: ((hand.y + attachment.body.padding + 0.5) * box.height) / nativeSize
			}
		});
	}
	await editor.getByRole('button', { name: 'Author attachment frame 1', exact: true }).click();
	await editor.getByLabel('Authored frame PNG', { exact: true }).setInputFiles({
		name: 'wrong-canvas.png',
		mimeType: 'image/png',
		buffer: Buffer.from(output.reference.png, 'base64')
	});
	await expect(editor.getByRole('alert')).toContainText('Export the native frame first');
	await editor.getByRole('spinbutton', { name: 'Blade angle, degrees', exact: true }).fill('40');
	await expect.poll(opaquePreview).toBe(true);
	await expect(editor.getByRole('alert')).toContainText('Export the native frame first');
	await editor.getByRole('spinbutton', { name: 'Blade angle, degrees', exact: true }).fill('35');
	const authored = await page.evaluate(
		async ({ w, h }) => {
			const imagePath = '/src/lib/image/png.ts',
				codecPath = '/src/lib/image/pngraw.ts',
				image = await import(imagePath),
				codec = await import(codecPath),
				native = image.makeImg(w, h);
			native.data.set([120, 120, 120, 255], (3 * w + 4) * 4);
			native.data.set([90, 60, 30, 255], (4 * w + 4) * 4);
			return image.bytesToBase64(await codec.encodePngBytes(native));
		},
		{
			w: attachment.body.cell.w + 2 * attachment.body.padding,
			h: attachment.body.cell.h + 2 * attachment.body.padding
		}
	);
	await editor.getByLabel('Authored frame PNG', { exact: true }).setInputFiles({
		name: 'native-item.png',
		mimeType: 'image/png',
		buffer: Buffer.from(authored, 'base64')
	});
	await expect(editor.getByRole('status')).toContainText('Loaded native item art for frame 1');
	await expect(
		editor.getByRole('spinbutton', { name: 'Blade angle, degrees', exact: true })
	).toBeDisabled();
	await expect
		.poll(() =>
			editor
				.getByLabel('Attachment grip and occlusion editor', { exact: true })
				.evaluate((element: HTMLCanvasElement) =>
					Array.from(element.getContext('2d')!.getImageData(4, 3, 1, 1).data)
				)
		)
		.toEqual([120, 120, 120, 255]);
	await editor.getByRole('button', { name: 'Save attachment draft', exact: true }).click();
	await expect(editor.getByRole('status')).toContainText('saved locally');
	await page.reload();
	await candidate.getByRole('button', { name: 'Author held item', exact: true }).click();
	await expect(
		editor.getByRole('spinbutton', { name: 'Blade angle, degrees', exact: true })
	).toHaveValue('35');
	await expect(
		editor.getByRole('spinbutton', { name: 'Blade angle, degrees', exact: true })
	).toBeDisabled();
	const nativeDownload = page.waitForEvent('download');
	await editor.getByRole('button', { name: 'Export authored attachment', exact: true }).click();
	const entries = await unzip(
			new Uint8Array(await readFile((await (await nativeDownload).path())!))
		),
		entry = (name: string) => entries.get(name)!,
		manifest = JSON.parse(new TextDecoder().decode(entry('manifest.json'))),
		saved = JSON.parse(new TextDecoder().decode(entry('authoring.json')));
	expect(saved.frames[0].authoredPng).toBe(authored);
	expect(saved.frames[1].authoredPng).toBeUndefined();
	expect(saved.asset.png).toBe(output.reference.png);
	expect(saved.asset.grip).toEqual({ x: hand.x + 0.5, y: hand.y + 0.5 });
	expect(saved.asset.axis).toEqual({ x: 96.5, y: 32.5 });
	expect(manifest.qualified).toBe(false);
	expect(manifest.frames[0].source).toBe('authored-frame');
	expect(manifest.frames[0].authoredFrameSha256).toMatch(/^[a-f0-9]{64}$/);
	expect(manifest.frames[1].source).toBe('rigid-source');
	const nativeImage = await decodePngBytes(Buffer.from(authored, 'base64')),
		exportedImage = await decodePngBytes(entry('layers/0.png'));
	expect(exportedImage).toEqual(nativeImage);
	const frozen = await decodePngBytes(entry('body/0.png')),
		original = await decodePngBytes(Buffer.from(output.reference.png, 'base64')),
		p = attachment.body.padding;
	for (let y = 0; y < original.h; y++)
		expect(
			frozen.data.slice(((y + p) * frozen.w + p) * 4, ((y + p) * frozen.w + p + original.w) * 4)
		).toEqual(original.data.slice(y * original.w * 4, (y + 1) * original.w * 4));
	await editor.getByRole('button', { name: 'Author attachment frame 2', exact: true }).click();
	await expect(
		editor.getByRole('spinbutton', { name: 'Blade angle, degrees', exact: true })
	).toBeEnabled();
	await editor.getByRole('button', { name: 'Author attachment frame 1', exact: true }).click();
	await editor
		.getByRole('button', { name: 'Use source placement for this frame', exact: true })
		.click();
	await expect(
		editor.getByRole('spinbutton', { name: 'Blade angle, degrees', exact: true })
	).toBeEnabled();
	expect(paid).toEqual([]);
});

test('Motion Lab blocks mirrors, unresolved reservations and an exhausted budget before paid transport', async ({
	page
}) => {
	const paid: string[] = [];
	await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	await page.route('https://*.pixellab.ai/**', (route) => {
		if (route.request().method() === 'POST') paid.push(route.request().url());
		return route.abort();
	});
	await page.goto('/motion-lab.html');
	await expect(page.getByRole('status')).toContainText('Offline lab ready');
	const result = await page.evaluate(async () => {
		const runPath = '/src/ui/motion-lab/run.ts',
			modelPath = '/src/ui/motion-lab/model.ts',
			run = await import(runPath),
			model = await import(modelPath),
			library = await (await fetch('/fixtures/motion-lab/library.json')).json();
		const messages: string[] = [];
		try {
			await run.generateCandidate(
				model.newDocument(library, library.fixtures[0], library.clips[0], 'west'),
				7
			);
		} catch (e) {
			messages.push((e as Error).message);
		}
		const doc = model.newDocument(library),
			original = run.labQueue.enqueue;
		let calls = 0;
		run.labQueue.setKey('synthetic-test-value');
		run.labQueue.enqueue = async () => {
			calls++;
			throw new Error('Simulated enqueue preparation failure');
		};
		try {
			await run.generateCandidate(doc, 7);
		} catch (e) {
			messages.push((e as Error).message);
		} finally {
			run.labQueue.enqueue = original;
		}
		try {
			await run.generateCandidate(doc, 7);
		} catch (e) {
			messages.push((e as Error).message);
		}
		const ledger = run.readLedger(),
			unresolved = ledger.reservations.length;
		ledger.reservations[0].estimate = run.LAB_CAP;
		localStorage.setItem('pixeldoll.motionLab.2026-10-28', JSON.stringify(ledger));
		try {
			await run.generateCandidate(doc, 8);
		} catch (e) {
			messages.push((e as Error).message);
		}
		const charged = {
			...ledger,
			reservations: ledger.reservations.map((r: Record<string, unknown>) => ({
				...r,
				jobId: 'charge-fixture'
			}))
		};
		return {
			messages,
			calls,
			unresolved,
			finalReservations: run.readLedger().reservations.length,
			chargedReserved: run.phaseReserved(charged, new Map([['charge-fixture', run.LAB_CAP + 5]])),
			cap: run.LAB_CAP
		};
	});
	expect(result.messages[0]).toContain('mirrored frozen');
	expect(result.messages[1]).toBe('Simulated enqueue preparation failure');
	expect(result.messages[2]).toContain('unresolved reservation');
	expect(result.messages[3]).toContain('allowance is exhausted');
	expect(result.calls).toBe(1);
	expect(result.unresolved).toBe(1);
	expect(result.finalReservations).toBe(1);
	expect(result.chargedReserved).toBe(result.cap + 5);
	expect(paid).toEqual([]);
});

test('Motion Lab stores visible sole marks and reports only sampled projected displacement', async ({
	page
}) => {
	const paid: string[] = [];
	await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	await page.route('https://*.pixellab.ai/**', (route) => {
		paid.push(route.request().method());
		return route.abort();
	});
	await page.goto('/motion-lab.html');
	await expect(page.getByRole('status')).toContainText('Offline lab ready');
	const sole = await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			modelPath = '/src/ui/motion-lab/model.ts',
			diagnosticsPath = '/src/ui/motion-lab/diagnostics.ts',
			codecPath = '/src/lib/image/pngraw.ts',
			db = await import(dbPath),
			model = await import(modelPath),
			diagnostics = await import(diagnosticsPath),
			codec = await import(codecPath),
			library = await (await fetch('/fixtures/motion-lab/library.json')).json();
		const doc = model.newDocument(
			library,
			library.fixtures[0],
			library.clips.find((c: { id: string }) => c.id === 'run'),
			'east'
		);
		doc.planting = diagnostics.proposePlanting(doc, [0, 50]);
		Object.assign(doc, diagnostics.contactSampling(doc));
		const png = doc.fixture.references.east.png,
			bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0)),
			image = await codec.decodePngBytes(bytes),
			sha = await db.putBlob(bytes),
			now = Date.now(),
			rendered = model.renderPoses(doc);
		let point = { x: 0, y: 0 };
		for (let y = Math.floor(image.h * 0.75); y < image.h; y++)
			for (let x = 0; x < image.w; x++)
				if (image.data[(y * image.w + x) * 4 + 3]) point = { x: x + 0.5, y: y + 0.5 };
		await db.put('jobs', 'sole-fixture', {
			id: 'sole-fixture',
			label: 'Synthetic sole fixture',
			tag: 'motion-lab-2026-10-28',
			method: 'POST',
			endpoint: '/animate-with-skeleton-v3',
			params: {
				first_frame: { $blob: sha },
				first_frame_keypoints: rendered.result.rest,
				keypoints: rendered.poses
			},
			inputs: [sha],
			requestHash: 'fixture',
			state: 'done',
			attempts: 1,
			nextAt: 0,
			createdAt: now,
			finishedAt: now,
			jobs: [
				{
					id: 'fixture-remote',
					status: 'completed',
					done: true,
					results: Array.from({ length: 12 }, (_, i) => ({ label: String(i), sha }))
				}
			],
			gens: 3,
			usd: 0
		});
		localStorage.setItem(
			'pixeldoll.motionLab.2026-10-28',
			JSON.stringify({
				version: 1,
				reservations: [
					{
						id: 'fixture',
						jobId: 'sole-fixture',
						estimate: 3,
						label: 'Synthetic sole fixture',
						document: doc,
						seed: 7,
						createdAt: new Date(now).toISOString()
					}
				]
			})
		);
		return { x: (point.x / image.w) * 320, y: (point.y / image.h) * 320 };
	});
	await page.reload();
	await page.getByRole('button', { name: 'Measure rendered soles', exact: true }).click();
	const editor = page.getByRole('region', { name: 'Rendered sole qualification', exact: true });
	await editor
		.getByRole('combobox', { name: 'Measured foot', exact: true })
		.selectOption('LEFT LEG');
	for (const frame of [2, 3]) {
		await page.getByRole('button', { name: `Inspect raw frame ${frame}`, exact: true }).click();
		await editor
			.getByLabel('Mark visible sole landmark', { exact: true })
			.click({ position: sole });
	}
	await editor
		.getByRole('textbox', { name: 'Sole review notes', exact: true })
		.fill('Synthetic UI fixture, not a rendered quality claim.');
	await editor.getByRole('button', { name: 'Save sole measurements', exact: true }).click();
	await expect(editor.getByRole('status')).toContainText('saved locally');
	const downloading = page.waitForEvent('download');
	await editor.getByRole('button', { name: 'Export sole measurements', exact: true }).click();
	const output = JSON.parse(await readFile((await (await downloading).path())!, 'utf8')),
		left = output.measurements.find((m: { foot: string }) => m.foot === 'LEFT LEG');
	expect(left.complete).toBe(true);
	expect(left.worldSpan).toBeGreaterThan(0.1);
	expect(output.qualified).toBe(false);
	await page.reload();
	await page.getByRole('button', { name: 'Measure rendered soles', exact: true }).click();
	await expect(editor.getByRole('textbox', { name: 'Sole review notes', exact: true })).toHaveValue(
		'Synthetic UI fixture, not a rendered quality claim.'
	);
	expect(paid).toEqual([]);
});

test('Motion Lab inspects MCP, guards one comparison and exports no credential or session', async ({
	page
}) => {
	await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	const requests: { method: string; params?: { name?: string } }[] = [];
	await page.route('https://*.pixellab.ai/**', async (route) => {
		if (!route.request().url().endsWith('/mcp')) return route.abort();
		const r = route.request().postDataJSON();
		requests.push(r);
		if (r.method === 'notifications/initialized') return route.fulfill({ status: 202, body: '' });
		const result =
			r.method === 'initialize'
				? { protocolVersion: '2025-03-26' }
				: r.method === 'tools/list'
					? {
							tools: [
								{
									name: 'animate_character',
									inputSchema: {
										properties: Object.fromEntries(
											[
												'character_id',
												'mode',
												'animation_name',
												'action_description',
												'directions',
												'frame_count',
												'move',
												'poses'
											].map((k) => [k, {}])
										)
									}
								},
								{ name: 'list_characters', inputSchema: {} },
								{ name: 'delete_character', inputSchema: {} }
							]
						}
					: { content: [{ type: 'text', text: 'Synthetic benchmark character' }] };
		return route.fulfill({
			contentType: 'text/event-stream',
			headers: {
				'mcp-session-id': 'synthetic-private-session',
				'access-control-expose-headers': 'mcp-session-id'
			},
			body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: r.id, result })}\n\n`
		});
	});
	await page.goto('/motion-lab.html');
	await expect(page.getByRole('status')).toContainText('Offline lab ready');
	const probe = page.getByRole('region', { name: 'Custom Skeleton v3 inspection', exact: true });
	await expect(
		probe.getByRole('button', { name: 'Inspect custom V3 MCP schema (free)', exact: true })
	).toBeDisabled();
	await page.evaluate(async () => {
		const path = '/src/ui/motion-lab/run.ts';
		(await import(path)).labQueue.setKey('synthetic-mcp-test-key');
	});
	await probe
		.getByRole('button', { name: 'Inspect custom V3 MCP schema (free)', exact: true })
		.click();
	await expect(probe.locator('pre')).toContainText('animate_character');
	await expect(probe.locator('pre')).not.toContainText('delete_character');
	await probe
		.getByRole('button', { name: 'Find benchmark characters (free)', exact: true })
		.click();
	await expect(probe.locator('pre')).toContainText('Synthetic benchmark character');
	const downloading = page.waitForEvent('download');
	await probe.getByRole('button', { name: 'Export custom V3 inspection', exact: true }).click();
	const text = await readFile((await (await downloading).path())!, 'utf8'),
		output = JSON.parse(text);
	expect(output.events).toHaveLength(2);
	expect(output.paidRequests).toBe(0);
	expect(text).not.toContain('synthetic-mcp-test-key');
	expect(text).not.toContain('synthetic-private-session');
	expect(requests.filter((r) => r.method === 'tools/call').map((r) => r.params?.name)).toEqual([
		'list_characters'
	]);
	await probe
		.getByRole('textbox', { name: 'Managed character ID', exact: true })
		.fill('f69d3f89-043e-4e04-b904-dd97871c5d06');
	const comparison = probe.getByRole('button', {
		name: 'Run planted overhead comparison, south and east (reserve 8 gens)',
		exact: true
	});
	await expect(comparison).toBeDisabled();
	await probe
		.getByRole('button', { name: 'Read custom V3 authoring instructions (free)', exact: true })
		.click();
	await expect(comparison).toBeEnabled();
	await comparison.click();
	await expect(comparison).toBeDisabled();
	await expect(probe).toContainText('Custom comparison: receipt; 8 generations reserved.');
	await page.reload();
	await expect(
		page
			.getByRole('region', { name: 'Custom Skeleton v3 inspection', exact: true })
			.getByRole('button', {
				name: 'Run planted overhead comparison, south and east (reserve 8 gens)',
				exact: true
			})
	).toBeDisabled();
	expect(requests.filter((r) => r.params?.name === 'animate_character')).toHaveLength(2);
});

for (const altered of [false, true])
	test(
		altered
			? 'controlled pilot blocks changed imported reference pixels before custom spending'
			: 'controlled pilot verifies identical source views and retains one bounded custom submission across reload',
		async ({ page }) => {
			await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
			let submitted: Record<string, any> = {},
				customCalls = 0,
				imports = 0;
			const character = '00000000-0000-4000-8000-000000000001',
				southJob = '00000000-0000-4000-8000-000000000002',
				eastJob = '00000000-0000-4000-8000-000000000003';
			await page.route('https://*.pixellab.ai/**', async (route) => {
				const req = route.request(),
					url = new URL(req.url());
				if (url.pathname === '/v2/create-character-v3') {
					imports++;
					submitted = req.postDataJSON();
					return route.fulfill({
						json: { character_id: character, usage: { type: 'generations', generations: 0.25 } }
					});
				}
				if (url.hostname === 'backblaze.pixellab.ai') {
					const dir = url.pathname.split('/').at(-1)!.replace('.png', ''),
						image =
							dir === 'south'
								? submitted.reference_image
								: submitted.direction_images[altered && dir === 'north' ? 'east' : dir];
					return route.fulfill({
						contentType: 'image/png',
						body: Buffer.from(image.base64, 'base64')
					});
				}
				if (url.pathname === `/v2/characters/${character}`)
					return route.fulfill({
						json: {
							rotation_urls: Object.fromEntries(
								['south', 'east', 'north', 'west'].map((d) => [
									d,
									`https://backblaze.pixellab.ai/pilot/${d}.png`
								])
							)
						}
					});
				if (url.pathname.startsWith('/v2/background-jobs/'))
					return route.fulfill({
						json: {
							id: url.pathname.split('/').at(-1),
							status: 'completed',
							usage: { type: 'generations', generations: 3 }
						}
					});
				if (url.pathname === '/mcp') {
					const r = req.postDataJSON();
					if (r.method === 'notifications/initialized')
						return route.fulfill({ status: 202, body: '' });
					let result: unknown = {};
					if (r.method === 'initialize') result = { protocolVersion: '2025-03-26' };
					else if (r.method === 'tools/list')
						result = {
							tools: [
								{
									name: 'animate_character',
									inputSchema: {
										properties: Object.fromEntries(
											[
												'character_id',
												'mode',
												'animation_name',
												'action_description',
												'directions',
												'frame_count',
												'move',
												'poses'
											].map((k) => [k, {}])
										)
									}
								}
							]
						};
					else {
						if (r.params.arguments.move) customCalls++;
						result = {
							content: [
								{
									type: 'text',
									text: r.params.arguments.move
										? `south: job ${southJob}\neast: job ${eastJob}`
										: 'Synthetic free instructions'
								}
							],
							isError: false
						};
					}
					return route.fulfill({ json: { jsonrpc: '2.0', id: r.id, result } });
				}
				return route.abort();
			});
			await page.goto('/motion-lab.html');
			await expect(page.getByRole('status')).toContainText('Offline lab ready');
			await page.evaluate(async () => {
				const p = '/src/ui/motion-lab/run.ts';
				(await import(p)).labQueue.setKey('synthetic-controlled-key');
			});
			const pilot = page.getByRole('region', {
					name: 'Controlled workflow research pilot',
					exact: true
				}),
				render = pilot.getByRole('button', {
					name: 'Render controlled custom south and east (reserve 8 gens)',
					exact: true
				});
			await expect(render).toBeDisabled();
			await pilot
				.getByRole('button', { name: 'Import exact benchmark views (reserve 1 gen)', exact: true })
				.click();
			await expect(pilot).toContainText('Import: done');
			expect(Object.keys(submitted.direction_images).sort()).toEqual(['east', 'north', 'west']);
			await pilot
				.getByRole('button', { name: 'Verify imported reference pixels (free)', exact: true })
				.click();
			if (altered) {
				await expect(pilot.getByRole('alert')).toContainText('Imported reference pixels changed');
				await expect(render).toBeDisabled();
				expect(imports).toBe(1);
				expect(customCalls).toBe(0);
				return;
			}
			await expect(pilot).toContainText('exact-reference check: passed');
			await pilot
				.getByRole('button', { name: 'Read controlled authoring instructions (free)', exact: true })
				.click();
			await expect(render).toBeEnabled();
			await render.click();
			await expect(render).toBeDisabled();
			await pilot
				.getByRole('button', { name: 'Refresh pilot receipts and costs', exact: true })
				.click();
			await expect(pilot).toContainText('6.25 new units reported; 9/271 conservatively reserved.');
			const downloading = page.waitForEvent('download');
			await pilot
				.getByRole('button', { name: 'Export controlled pilot evidence', exact: true })
				.click();
			const exported = await readFile((await (await downloading).path())!, 'utf8');
			expect(exported).not.toContain('synthetic-controlled-key');
			expect(
				JSON.parse(exported).pilot.verification.every(
					(v: { changedPixels: number }) => v.changedPixels === 0
				)
			).toBe(true);
			await page.reload();
			await expect(
				page
					.getByRole('region', { name: 'Controlled workflow research pilot', exact: true })
					.getByRole('button', {
						name: 'Render controlled custom south and east (reserve 8 gens)',
						exact: true
					})
			).toBeDisabled();
			expect(imports).toBe(1);
			expect(customCalls).toBe(1);
		}
	);

test('browser PNG and IndexedDB self-tests preserve every registered check', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	await page.route('https://api.pixellab.ai/**', (route) => route.abort());
	await page.goto('/#/selftest');
	const result = page.getByTestId('selftest');
	// Wait for the run to finish (the shard's first cold dev-server load may be slow), then fail at once with the harness log.
	await expect(result).toHaveAttribute('data-failures', /^\d+$/, { timeout: 20_000 });
	const text = await result.innerText(),
		lines = text.split('\n');
	expect(await result.getAttribute('data-failures'), text).toBe('0');
	expect(lines).toHaveLength(browserSelfTests.length + 1);
	for (const [name] of browserSelfTests) expect(lines).toContain('ok   ' + name);
	expect(lines.at(-1)).toBe('all self-tests passed');
	expect(errors).toEqual([]);
});

test('move QA survives real storage, ZIP export and directional replacements', async ({ page }) => {
	const errors: string[] = [],
		paid: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.route('https://api.pixellab.ai/**', (route) => {
		paid.push(route.request().method());
		return route.abort();
	});
	await page.goto('/test/fixtures/qa-summary.html');
	const run = async (id: string) => {
		await page.locator(`#${id}`).click();
		await expect(page.getByRole('status')).toHaveText(`PASS ${id}`);
	};
	const value = (key: string) =>
		page
			.locator('#summary tr')
			.filter({ has: page.getByRole('rowheader', { name: key, exact: true }) })
			.locator('td');
	await run('create');
	await expect(value('status')).toHaveText('pass');
	await run('add');
	await expect(value('status')).toHaveText('fail');
	await expect(value('shiftedFrames')).toHaveText('2');
	await expect(value('maxKeyOutside')).toHaveText('0.2');
	await page.reload();
	await run('reload');
	await expect(value('status')).toHaveText('fail');
	await run('south');
	await expect(value('shiftedFrames')).toHaveText('1');
	await expect(value('status')).toHaveText('fail');
	await run('roundtrip');
	await run('east');
	await expect(value('status')).toHaveText('pass');
	await expect(value('shiftedFrames')).toHaveText('0');
	await expect(value('strayPx')).toHaveText('0');
	await run('roundtrip');
	await run('legacy');
	await expect(value('status')).toHaveText('warn');
	await expect(value('legacy')).toContainText('"clips"');
	expect(errors).toEqual([]);
	expect(paid).toEqual([]);
});

test('copying a demo publishes its images atomically against concurrent garbage collection', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await openStudio(page, '/');
	await expect(page.locator('.world-actors')).toBeVisible();
	const result = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			dbPath = '/src/lib/store/db.ts',
			projectPath = '/src/lib/store/project.ts';
		const state = await import(statePath),
			db = await import(dbPath),
			project = await import(projectPath);
		let done = false;
		const copying = state.copyDemo().finally(() => {
			done = true;
		});
		while (!done) await db.gcBlobs();
		const id = await copying,
			saved = await project.loadProject(id);
		return {
			current: state.doc.id,
			id,
			name: saved.rec.manifest.name,
			images: saved.project.images.size
		};
	});
	expect(result.current).toBe(result.id);
	expect(result.name).toBe('Adventurer copy');
	expect(result.images).toBeGreaterThan(0);
});

test('Motion Lab research grids retain raw inspection without motion review controls or paid requests', async ({
	page
}) => {
	const paid: string[] = [],
		errors: string[] = [];
	await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
	await page.route('https://*.pixellab.ai/**', (route) => {
		if (route.request().method() === 'POST') paid.push(route.request().url());
		return route.abort();
	});
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/motion-lab.html');
	await expect(page.getByRole('status')).toContainText('Offline lab ready');
	await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			pngPath = '/src/lib/image/png.ts',
			codecPath = '/src/lib/image/pngraw.ts',
			labPath = '/src/ui/motion-lab/run.ts';
		const db = await import(dbPath),
			png = await import(pngPath),
			codec = await import(codecPath),
			lab = await import(labPath),
			grid = png.makeImg(288, 288);
		for (let y = 48; y < 96; y++)
			for (let x = 48; x < 64; x++) grid.data.set([0, 150, 0, 255], (y * grid.w + x) * 4);
		const sha = await db.putBlob(await codec.encodePngBytes(grid)),
			now = Date.now();
		await db.put('jobs', 'research-grid-fixture', {
			id: 'research-grid-fixture',
			label: 'Fixed research grid fixture',
			tag: lab.LAB_TAG,
			method: 'POST',
			endpoint: '/inpaint-v3',
			params: {},
			inputs: [],
			requestHash: 'offline-research-grid',
			state: 'done',
			attempts: 1,
			nextAt: 0,
			createdAt: now,
			finishedAt: now,
			jobs: [
				{
					id: 'offline-grid-result',
					status: 'completed',
					done: true,
					results: [{ label: '0', sha }]
				}
			],
			gens: 15,
			usd: 0
		});
	});
	await page.reload();
	const card = page.getByRole('article').filter({
		has: page.getByRole('heading', { name: 'Fixed research grid fixture', exact: true })
	});
	await expect(card.getByRole('img', { name: 'Raw generated frame 1', exact: true })).toBeVisible();
	await card.getByRole('button', { name: 'Inspect raw frame 1', exact: true }).click();
	await expect(
		card.getByRole('button', { name: 'Inspect raw frame 1', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(
		card.getByText(
			"This research grid has no authored motion document. Use the selected experiment's evidence export for offline assessment.",
			{ exact: true }
		)
	).toBeVisible();
	for (const name of [
		'Play candidate',
		'Save review',
		'Export reviewed clip',
		'Author held item',
		'Measure rendered soles'
	])
		await expect(card.getByRole('button', { name, exact: true })).toHaveCount(0);
	await expect(card.getByRole('checkbox', { name: 'Use selected frame' })).toHaveCount(0);
	await expect(
		card.getByRole('spinbutton', { name: 'Selected frame duration, ms', exact: true })
	).toHaveCount(0);
	await expect(
		card.getByRole('spinbutton', { name: 'Final local hold, ms', exact: true })
	).toHaveCount(0);
	await expect(card.getByRole('combobox', { name: 'Review status', exact: true })).toHaveCount(0);
	await expect(card.getByRole('textbox')).toHaveCount(0);
	await expect(card.getByRole('alert')).toHaveCount(0);
	expect(
		await page.evaluate(() => localStorage.getItem('pixeldoll.motionLab.2026-10-28'))
	).toBeNull();
	expect(paid).toEqual([]);
	expect(errors).toEqual([]);
});

test('native eight-direction starter pack reviews exact frames, exports evidence and imports into Studio without paid requests', async ({
	page
}, testInfo) => {
	const requests: string[] = [],
		errors: string[] = [];
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem('pixeldoll.welcomed', '1');
	});
	await page.route('https://*.pixellab.ai/**', (route) => {
		requests.push(route.request().method());
		return route.abort();
	});
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/motion-lab.html');
	await expect(page.getByRole('status')).toContainText('Offline lab ready');
	await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			imagePath = '/src/lib/image/png.ts',
			codecPath = '/src/lib/image/pngraw.ts',
			rigPath = '/src/lib/rig/rig.ts',
			posesPath = '/src/lib/rig/poses.ts';
		const db = await import(dbPath),
			image = await import(imagePath),
			codec = await import(codecPath),
			{ DIRECTIONS, cellHash, baseHashOf } = await import(rigPath),
			{ LABELS } = await import(posesPath);
		const rest: Record<string, unknown> = {},
			standing: Record<string, string[]> = {},
			blobs = new Map<string, Blob>();
		for (const [index, direction] of DIRECTIONS.entries()) {
			const im = image.makeImg(32, 32);
			im.data.set([220 + index, 120, 80, 255], (20 * 32 + 16) * 4);
			im.data.set([180, 70, 40, 255], (27 * 32 + 16) * 4);
			const hash = await cellHash(im),
				bytes = await codec.encodePngBytes(im);
			blobs.set(hash.slice(7), new Blob([bytes], { type: 'image/png' }));
			standing[direction] = [hash];
			rest[direction] = {
				image: hash,
				keypoints: LABELS.map((label: string) => ({ label, x: 0.5, y: 0.5 }))
			};
		}
		const rig = {
			template: 'mannequin',
			view: 'low top-down',
			cell: { w: 32, h: 32 },
			pivot: { x: 16, y: 28 },
			directions: DIRECTIONS.map((id: string) => ({ id })),
			rest,
			animations: [{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 150 }] }],
			baseItem: 'body',
			baseHash: `sha256:${'a'.repeat(64)}`
		};
		rig.baseHash = await baseHashOf(
			rig,
			Object.fromEntries(DIRECTIONS.map((d: string) => [`default/${d}/0`, standing[d][0]]))
		);
		const manifest = {
			format: 'pixeldoll/2',
			name: 'Synthetic starter source',
			app: 'Offline UI fixture, no art qualification',
			rig,
			materials: [],
			slots: [{ id: 'body', z: 10, class: 'base', required: true }],
			items: [
				{
					id: 'body',
					name: 'Synthetic body',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					materials: [],
					prompt: 'Synthetic native standing source',
					layers: [{ id: 'main', role: 'fg', z: 10, cells: { default: standing } }],
					baseHash: rig.baseHash,
					provenance: []
				}
			],
			presets: [{ id: 'source', name: 'Source', items: { body: 'body' }, variants: {} }]
		};
		const record = {
			id: 'rig-starter-native-eight',
			savedAt: new Date().toISOString(),
			manifest,
			origin: 'studio',
			character: { id: 'synthetic-starter-character', looks: 'Synthetic body' }
		};
		await db.putCharacter(record.id, record, blobs);
		const mirrored = structuredClone(record);
		mirrored.id = 'rig-starter-mirrored-eight';
		mirrored.manifest.name = 'Synthetic mirrored source';
		Object.assign(
			mirrored.manifest.rig.directions.find((d: { id: string }) => d.id === 'west'),
			{ mirrorOf: 'east' }
		);
		await db.put('projects', mirrored.id, mirrored);
		localStorage.setItem('pixeldoll.studio.project', record.id);
	});
	const starter = page.getByRole('region', { name: 'Eight-direction starter pack', exact: true });
	await starter.getByRole('button', { name: 'Refresh saved results', exact: true }).click();
	await starter
		.getByRole('combobox', { name: 'Studio source', exact: true })
		.selectOption('rig-starter-mirrored-eight');
	await starter.getByRole('button', { name: 'Prepare native source', exact: true }).click();
	await expect(starter.getByRole('alert')).toContainText('independently authored');
	await starter
		.getByRole('combobox', { name: 'Studio source', exact: true })
		.selectOption('rig-starter-native-eight');
	await starter.getByRole('button', { name: 'Prepare native source', exact: true }).click();
	await expect(starter.getByRole('status')).toContainText(
		'Preparation is free. Existing paid calls and reservations are retained.'
	);
	const freePreparation = await page.evaluate(() =>
		localStorage.getItem('pixeldoll.starterPack.2026-11-02')!
	);
	await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			starterPath = '/src/ui/motion-lab/starter-pack.ts',
			contractsPath = '/src/lib/rig/starter-presets.ts',
			runPath = '/src/ui/motion-lab/run.ts';
		const db = await import(dbPath),
			starter = await import(starterPath),
			{ starterRequest } = await import(contractsPath),
			{ LAB_TAG } = await import(runPath);
		const state = starter.readStarter(),
			plan = state.plans.walk,
			request = starterRequest(plan, ['south', 'east']),
			id = 'unsent-starter-ui';
		await db.put('jobs', id, {
			id,
			label: 'Synthetic unsent starter',
			tag: LAB_TAG,
			method: 'POST',
			endpoint: request.path,
			params: request.body,
			inputs: [],
			requestHash: 'synthetic-unsent',
			state: 'failed',
			attempts: 0,
			requestStarted: false,
			nextAt: 0,
			createdAt: Date.now(),
			jobs: [],
			gens: 0,
			usd: 0
		});
		state.calls.push({ id, recordId: id, plan, directions: ['south', 'east'], units: 8 });
		localStorage.setItem(starter.STARTER_KEY, JSON.stringify(state));
	});
	await starter.getByRole('button', { name: 'Refresh saved results', exact: true }).click();
	await starter
		.getByRole('button', { name: 'Resolve unsent walk attempt · Free', exact: true })
		.click();
	await expect(starter.getByRole('status')).toContainText('No request was sent');
	const unsentProof = await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			starterPath = '/src/ui/motion-lab/starter-pack.ts',
			db = await import(dbPath),
			starter = await import(starterPath),
			state = starter.readStarter();
		return {
			resolved: !!state.calls[0].resolvedNotSentAt,
			held: starter.starterHeld(state, await starter.starterJobs(state)),
			record: await db.get('jobs', 'unsent-starter-ui')
		};
	});
	expect(unsentProof).toMatchObject({
		resolved: true,
		held: 0,
		record: { state: 'failed', requestStarted: false, jobs: [] }
	});
	// Reset the separate complete-pack fixture to free preparation. The unsent receipt itself remains retained.
	await page.evaluate(
		(value) => localStorage.setItem('pixeldoll.starterPack.2026-11-02', value),
		freePreparation
	);
	await expect(
		starter.getByRole('button', { name: 'Generate south + east · Est. 8 gens', exact: true })
	).toBeDisabled();
	const pinned = await page.evaluate(async () => {
		const starterPath = '/src/ui/motion-lab/starter-pack.ts',
			projectPath = '/src/lib/store/project.ts',
			dbPath = '/src/lib/store/db.ts';
		const starter = await import(starterPath),
			projects = await import(projectPath),
			db = await import(dbPath),
			state = starter.readStarter();
		return {
			id: state.sourceSnapshotId,
			exists: !!(await db.get('projects', state.sourceSnapshotId)),
			listed: (await projects.listProjects()).some(
				(p: { id: string }) => p.id === state.sourceSnapshotId
			)
		};
	});
	expect(pinned.id).toMatch(/^starter-source-/);
	expect(pinned.exists).toBe(true);
	expect(pinned.listed).toBe(false);
	expect(
		await starter
			.getByRole('combobox', { name: 'Studio source', exact: true })
			.locator('option')
			.evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value))
	).not.toContain(pinned.id);
	const expected = await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			imagePath = '/src/lib/image/png.ts',
			codecPath = '/src/lib/image/pngraw.ts',
			rigPath = '/src/lib/rig/rig.ts',
			runPath = '/src/ui/motion-lab/run.ts',
			starterPath = '/src/ui/motion-lab/starter-pack.ts',
			presetPath = '/src/lib/rig/starter-presets.ts';
		const db = await import(dbPath),
			image = await import(imagePath),
			codec = await import(codecPath),
			{ DIRECTIONS, cellHash } = await import(rigPath),
			{ LAB_TAG } = await import(runPath),
			starter = await import(starterPath),
			{ starterRequest } = await import(presetPath);
		const session = starter.readStarter();
		if (session.calls.length) throw new Error('Free preparation submitted work.');
		const expected: {
				preset: string;
				direction: string;
				index: number;
				size: number;
				rgbaHash: string;
				outputHash: string;
			}[] = [],
			now = Date.now();
		for (const [action, preset] of ['idle', 'walk', 'slash'].entries()) {
			const plan = session.plans[preset],
				receipts: unknown[] = [];
			let pilotReview: unknown;
			for (const [batch, directions] of [
				['south', 'east'],
				DIRECTIONS.filter((d: string) => !['south', 'east'].includes(d))
			].entries()) {
				const id = `starter-${preset}-${batch}`,
					group = `starter-group-${preset}`,
					jobs = [];
				for (const direction of directions) {
					const results = [];
					for (let index = 0; index < plan.frames; index++) {
						const size = direction === 'north' ? 40 : 48,
							offset = direction === 'north' ? 4 : 0;
						const im = image.makeImg(size, size);
						im.data.set(
							[100 + action, 20 + DIRECTIONS.indexOf(direction), 30 + index, 255],
							(20 * size + 10) * 4
						);
						im.data.set([40, 55, 60, 255], (21 * size + 11) * 4);
						const placed = image.makeImg(48, 48);
						placed.data.set(
							[100 + action, 20 + DIRECTIONS.indexOf(direction), 30 + index, 255],
							((20 + offset) * 48 + 10 + offset) * 4
						);
						placed.data.set([40, 55, 60, 255], ((21 + offset) * 48 + 11 + offset) * 4);
						const sha = await db.putBlob(await codec.encodePngBytes(im));
						results.push({ label: `${direction}/${index}`, sha, w: size, h: size });
						expected.push({
							preset,
							direction,
							index,
							size,
							rgbaHash: await cellHash(im),
							outputHash: await cellHash(placed)
						});
					}
					jobs.push({ id: `${preset}-${direction}`, status: 'completed', done: true, results });
				}
				const response = {
					animation_group_id: group,
					directions,
					background_job_ids: jobs.map((job) => job.id),
					status: 'completed'
				};
				const request = starterRequest(plan, directions, receipts),
					record = {
						id,
						label: `Synthetic starter ${preset}`,
						tag: LAB_TAG,
						method: 'POST',
						endpoint: request.path,
						params: request.body,
						inputs: [],
						requestHash: `synthetic-starter-${preset}-${batch}`,
						state: 'done',
						attempts: 1,
						nextAt: 0,
						createdAt: now,
						finishedAt: now,
						response,
						jobs,
						gens: directions.length * 3,
						usd: 0
					};
				await db.put('jobs', id, record);
				session.calls.push({
					id: `call-${id}`,
					plan,
					directions,
					units: directions.length * 4,
					recordId: id,
					...(pilotReview ? { pilotReview } : {})
				});
				const contractsPath = '/src/lib/rig/starter-presets.ts',
					{ validateStarterReceipt } = await import(contractsPath);
				receipts.push(validateStarterReceipt(plan, directions, response, receipts));
				if (batch === 0)
					pilotReview = {
						...(await starter.describeStarterPilot(
							await starter.starterFrames(
								session,
								preset,
								await starter.starterJobs(session),
								false
							)
						)),
						notes: 'Synthetic pilot reviewed for transport only, not art quality.'
					};
			}
		}
		localStorage.setItem(starter.STARTER_KEY, JSON.stringify(session));
		return expected;
	});
	await starter.getByRole('button', { name: 'Refresh saved results', exact: true }).click();
	const paidBindings = await page.evaluate(
		() => JSON.parse(localStorage.getItem('pixeldoll.starterPack.2026-11-02')!).plans
	);
	await starter.getByRole('button', { name: 'Prepare native source', exact: true }).click();
	const preparedAgain = await page.evaluate(() =>
		JSON.parse(localStorage.getItem('pixeldoll.starterPack.2026-11-02')!)
	);
	expect(preparedAgain.plans).toEqual(paidBindings);
	expect(preparedAgain.calls).toHaveLength(6);
	// Optional rejected research must never become a prerequisite for the free standing idle.
	const validIdleRecord = await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath),
			record = await db.get('jobs', 'starter-idle-1');
		const malformed = structuredClone(record);
		malformed.response.animation_group_id = 'different-idle-group';
		await db.put('jobs', malformed.id, malformed);
		return record;
	});
	await starter
		.getByRole('button', { name: 'Load complete three-action pack', exact: true })
		.click();
	await expect(starter.getByRole('status')).toContainText('Generated idle could not be archived');
	await expect(starter.getByRole('status')).toContainText(
		'retained in the saved job journal, not included in this free pack'
	);
	await starter
		.getByRole('textbox', { name: 'Layout review notes', exact: true })
		.fill(
			'Standing idle with valid walk and attack reviewed; malformed breathing research intentionally excluded.'
		);
	await starter
		.getByRole('checkbox', {
			name: 'I reviewed whole-view alignment and the common pivot. This does not certify anatomy or weapon quality.',
			exact: true
		})
		.check();
	const freeDownload = page.waitForEvent('download');
	await starter
		.getByRole('button', { name: 'Export experimental Studio pack · Free', exact: true })
		.click();
	const freeBytes = new Uint8Array(await readFile((await (await freeDownload).path())!)),
		freeFiles = await unzip(freeBytes),
		freePack = (await readCharacterZip(freeBytes)).project;
	const freeEvidence = JSON.parse(
			new TextDecoder().decode(freeFiles.get('starter-evidence.json')!)
		),
		freeIdle = freeEvidence.clips.find((c: { preset: string }) => c.preset === 'idle');
	expect([...freeFiles.keys()].filter((name) => name.startsWith('raw/'))).toHaveLength(136);
	expect(freeIdle).toMatchObject({
		playableSource: 'standing-reference',
		researchOnly: false,
		jobs: [],
		frames: []
	});
	expect(freeIdle).not.toHaveProperty('animationGroupId');
	expect(freeIdle).not.toHaveProperty('binding');
	expect(freePack.manifest.rig.animations.find((a) => a.id === 'idle')).toMatchObject({
		cells: 1,
		frames: Array(4).fill({ cell: 0, ms: 150 })
	});
	for (const standing of freeEvidence.source.rest) {
		expect(
			freePack.manifest.items[0].layers[0].cells!.idle[standing.direction as DirectionName]
		).toEqual([standing.outputHash]);
		expect(await cellHash(freePack.images.get(standing.outputHash)!)).toBe(standing.outputHash);
	}
	for (const preset of ['walk', 'slash']) {
		const required = freeEvidence.clips.find((c: { preset: string }) => c.preset === preset);
		expect(required.jobs).toHaveLength(8);
		expect(required.frames).toHaveLength(64);
	}
	await starter.getByRole('combobox', { name: 'Starter action', exact: true }).selectOption('idle');
	await starter
		.getByRole('combobox', { name: 'Idle art source', exact: true })
		.selectOption('generated');
	await starter
		.getByRole('button', { name: 'Load complete three-action pack', exact: true })
		.click();
	await expect(starter.getByRole('alert')).toContainText('mismatched starter receipt');
	await page.evaluate(async (record) => {
		const dbPath = '/src/lib/store/db.ts',
			db = await import(dbPath);
		await db.put('jobs', record.id, record);
	}, validIdleRecord);
	await starter
		.getByRole('combobox', { name: 'Idle art source', exact: true })
		.selectOption('standing');
	const retained = await page.evaluate(async () => {
		const dbPath = '/src/lib/store/db.ts',
			starterPath = '/src/ui/motion-lab/starter-pack.ts',
			projectPath = '/src/lib/store/project.ts';
		const db = await import(dbPath),
			starter = await import(starterPath),
			projects = await import(projectPath),
			state = starter.readStarter();
		// The negative mirror fixture shares the same blobs, so remove it too before testing real pin reachability.
		await db.deleteCharacter(state.projectId);
		await db.deleteCharacter('rig-starter-mirrored-eight');
		const queuePath = '/src/lib/pixellab/queue.ts',
			{ Queue } = await import(queuePath),
			studio = new Queue({ locks: null, channel: 'starter-cleanup-proof' });
		const labRecords = await db.all('jobs'),
			old = Date.now() - 8 * 86_400_000;
		for (const record of labRecords)
			await db.put('jobs', record.id, { ...record, createdAt: old, finishedAt: old });
		const sample = labRecords[0];
		await db.put('jobs', 'old-studio', {
			...sample,
			id: 'old-studio',
			tag: 'studio-cleanup-proof',
			createdAt: old,
			finishedAt: old
		});
		await studio.load();
		const startupRemoved = await studio.clearFinished(
			(r: { createdAt: number; finishedAt?: number }) =>
				(r.finishedAt ?? r.createdAt) > Date.now() - 7 * 86_400_000
		);
		await db.put('jobs', 'finished-studio', {
			...sample,
			id: 'finished-studio',
			tag: 'studio-cleanup-proof'
		});
		await studio.load();
		const explicitRemoved = await studio.clearFinished(() => false);
		studio.disconnect();
		const orphan = await db.putBlob(new Uint8Array([21, 22, 23])),
			removed = await db.gcBlobs(),
			retained = await starter.loadStarterSource(state);
		const jobs = await starter.starterJobs(state);
		for (const preset of ['idle', 'walk', 'slash'])
			await starter.starterFrames(state, preset, jobs);
		localStorage.removeItem('pixeldoll.studio.project'); // The directly seeded fixture is no longer a Studio destination.
		return {
			originalExists: !!(await db.get('projects', state.projectId)),
			pinExists: !!(await db.get('projects', state.sourceSnapshotId)),
			images: retained.project.images.size,
			pinListed: (await projects.listProjects()).some(
				(p: { id: string }) => p.id === state.sourceSnapshotId
			),
			removed,
			orphanExists: !!(await db.getBlob(orphan)),
			startupRemoved,
			explicitRemoved,
			labJobsRetained: jobs.size
		};
	});
	expect(retained).toMatchObject({
		originalExists: false,
		pinExists: true,
		images: 8,
		pinListed: false,
		orphanExists: false,
		startupRemoved: 1,
		explicitRemoved: 1,
		labJobsRetained: 6
	});
	expect(retained.removed).toBeGreaterThan(0);
	await page.reload();
	await expect(starter.getByRole('combobox', { name: 'Studio source', exact: true })).toHaveValue(
		'rig-starter-native-eight'
	);
	await expect(
		starter.getByRole('button', { name: 'Prepare native source', exact: true })
	).toBeDisabled();
	await expect(
		starter.getByRole('button', { name: 'Generate south + east · Est. 8 gens', exact: true })
	).toBeDisabled();
	await starter
		.getByRole('button', { name: 'Load complete three-action pack', exact: true })
		.click();
	await expect(starter.getByRole('status')).toContainText(
		'Still idle is free; any retained generated idle is research evidence'
	);
	const motion = starter.getByLabel('Starter native motion', { exact: true });
	const pixel = (x: number, y: number) =>
		motion.evaluate(
			(canvas: HTMLCanvasElement, point) => [
				...canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data
			],
			{ x, y }
		);
	const opaque = () =>
		motion.evaluate((canvas: HTMLCanvasElement) =>
			canvas
				.getContext('2d')!
				.getImageData(0, 0, canvas.width, canvas.height)
				.data.some((v, i) => i % 4 === 3 && v > 0)
		);
	const directions = [
		'south',
		'south-east',
		'east',
		'north-east',
		'north',
		'north-west',
		'west',
		'south-west'
	];
	for (const [action, preset] of ['idle', 'walk', 'slash'].entries()) {
		await starter
			.getByRole('combobox', { name: 'Starter action', exact: true })
			.selectOption(preset);
		if (preset === 'idle') {
			await expect(
				starter.getByRole('combobox', { name: 'Idle art source', exact: true })
			).toHaveValue('standing');
			await expect(
				starter.getByRole('combobox', { name: 'Native source sample', exact: true })
			).toHaveCount(0);
			await expect(
				starter.getByRole('spinbutton', { name: 'Motion X', exact: true })
			).toBeDisabled();
			await expect(
				starter.getByRole('button', { name: 'Generate south + east · Est. 8 gens', exact: true })
			).toBeDisabled();
		}
		for (const [d, direction] of directions.entries()) {
			await starter
				.getByRole('combobox', { name: 'Native view', exact: true })
				.selectOption(direction);
			const offset = direction === 'north' ? 4 : 0;
			if (preset === 'idle')
				await expect.poll(() => pixel(24, 28)).toEqual([220 + d, 120, 80, 255]);
			else
				await expect
					.poll(() => pixel(10 + offset, 20 + offset))
					.toEqual([100 + action, 20 + d, 30, 255]);
		}
	}
	await starter.getByRole('button', { name: 'Previous native frame', exact: true }).click();
	await expect.poll(() => pixel(10, 20)).toEqual([102, 27, 37, 255]);
	await starter.getByRole('button', { name: 'Next native frame', exact: true }).click();
	const sharedSources = [7, 1, 1, 3, 4, 5, 6, 7],
		sourceSample = starter.getByRole('combobox', { name: 'Native source sample', exact: true });
	for (const [slot, sample] of sharedSources.entries()) {
		await sourceSample.selectOption(String(sample));
		await expect(
			starter.getByText(`slash south-west, frame ${slot + 1}/8 · native sample ${sample + 1}`, {
				exact: true
			})
		).toBeVisible();
		await expect.poll(() => pixel(10, 20)).toEqual([102, 27, 30 + sample, 255]);
		await starter.getByRole('button', { name: 'Next native frame', exact: true }).click();
	}
	for (const [d, direction] of directions.entries()) {
		await starter
			.getByRole('combobox', { name: 'Native view', exact: true })
			.selectOption(direction);
		const offset = direction === 'north' ? 4 : 0;
		await expect(sourceSample).toHaveValue('7');
		await expect.poll(() => pixel(10 + offset, 20 + offset)).toEqual([102, 20 + d, 37, 255]);
	}
	// The managed native frames have no 2D joint hints. Authoring must start unmeasured,
	// bind the placed playback slots, and never substitute a guessed hand or root speed.
	await starter.getByRole('combobox', { name: 'Native view', exact: true }).selectOption('north');
	const openAuthoring = starter.getByRole('button', {
		name: 'Open hand and foot review · Free',
		exact: true
	});
	await openAuthoring.click();
	const attachmentEditor = starter.getByRole('region', { name: 'Authored held item', exact: true });
	const footEditor = starter.getByRole('region', { name: 'Native 2D foot review', exact: true });
	await expect(
		footEditor.getByRole('spinbutton', { name: 'Native travel X, px/s', exact: true })
	).toHaveValue('');
	await expect(
		footEditor.getByRole('spinbutton', { name: 'Native travel Y, px/s', exact: true })
	).toHaveValue('');
	const clickPixel = async (canvas: Locator, x: number, y: number) => {
		const dimensions = await canvas.evaluate((element: HTMLCanvasElement) => ({
				w: element.width,
				h: element.height
			})),
			box = (await canvas.boundingBox())!;
		await canvas.click({
			position: {
				x: ((x + 0.5) * box.width) / dimensions.w,
				y: ((y + 0.5) * box.height) / dimensions.h
			}
		});
	};
	const attachmentPng = await page.evaluate(async () => {
		const imagePath = '/src/lib/image/png.ts',
			codecPath = '/src/lib/image/pngraw.ts',
			image = await import(imagePath),
			codec = await import(codecPath),
			source = image.makeImg(3, 3);
		source.data.set([180, 180, 180, 255], 4);
		source.data.set([100, 60, 30, 255], 16);
		return image.bytesToBase64(await codec.encodePngBytes(source));
	});
	await attachmentEditor.getByLabel('Attachment PNG', { exact: true }).setInputFiles({
		name: 'synthetic-directional-axe.png',
		mimeType: 'image/png',
		buffer: Buffer.from(attachmentPng, 'base64')
	});
	await expect(attachmentEditor.getByRole('status')).toContainText('No frame joints were supplied');
	const attachmentCanvas = attachmentEditor.getByLabel('Attachment grip and occlusion editor', {
		exact: true
	});
	const attachmentExport = attachmentEditor.getByRole('button', {
		name: 'Export authored attachment',
		exact: true
	});
	await expect(attachmentExport).toBeDisabled();
	await expect(
		attachmentEditor.getByRole('spinbutton', { name: 'Target grip X, px', exact: true })
	).toHaveCount(0);
	await expect
		.poll(() =>
			attachmentCanvas.evaluate((canvas: HTMLCanvasElement) => {
				const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
				return {
					w: canvas.width,
					h: canvas.height,
					opaque: data.filter((v, i) => i % 4 === 3 && v > 0).length,
					palm: [...canvas.getContext('2d')!.getImageData(38, 48, 1, 1).data]
				};
			})
		)
		.toEqual({ w: 96, h: 96, opaque: 2, palm: [102, 24, 37, 255] });
	await clickPixel(attachmentCanvas, 2, 2);
	await expect(attachmentEditor.getByRole('alert')).toContainText(
		'Choose an opaque visible palm pixel'
	);
	await expect(
		attachmentEditor.getByRole('spinbutton', { name: 'Target grip X, px', exact: true })
	).toHaveCount(0);
	await attachmentEditor
		.getByRole('button', { name: 'Save attachment draft', exact: true })
		.click();
	await expect(attachmentEditor.getByRole('status')).toContainText('saved locally');
	const unmarkedDraft = await page.evaluate(() =>
		JSON.parse(
			localStorage.getItem(
				Object.keys(localStorage).find((k) => k.startsWith('pixeldoll.motionAttachment.'))!
			)!
		)
	);
	expect(unmarkedDraft.frames).toHaveLength(8);
	for (const frame of unmarkedDraft.frames) expect(frame).not.toHaveProperty('grip');
	const sourceCanvas = attachmentEditor.getByLabel('Attachment source artwork', { exact: true });
	await clickPixel(sourceCanvas, 1, 1);
	await attachmentEditor
		.getByRole('combobox', { name: 'Source point', exact: true })
		.selectOption('axis');
	await clickPixel(sourceCanvas, 1, 0);
	await attachmentEditor.getByRole('checkbox', { name: 'Show grip guides', exact: true }).uncheck();
	await attachmentEditor
		.getByRole('spinbutton', { name: 'Occlusion brush, px', exact: true })
		.fill('1');
	for (let index = 0; index < 8; index++) {
		await attachmentEditor
			.getByRole('button', { name: `Author attachment frame ${index + 1}`, exact: true })
			.click();
		await attachmentEditor
			.getByRole('combobox', { name: 'Canvas action', exact: true })
			.selectOption('grip');
		await clickPixel(attachmentCanvas, 38, 48);
		await expect(
			attachmentEditor.getByRole('spinbutton', { name: 'Target grip X, px', exact: true })
		).toHaveValue('38.5');
		await expect(
			attachmentEditor.getByRole('spinbutton', { name: 'Target grip Y, px', exact: true })
		).toHaveValue('48.5');
		if (index < 7) await expect(attachmentExport).toBeDisabled();
		await attachmentEditor
			.getByRole('combobox', { name: 'Canvas action', exact: true })
			.selectOption('paint');
		await clickPixel(attachmentCanvas, 38, 48);
	}
	await expect(attachmentExport).toBeEnabled();
	await attachmentEditor
		.getByRole('button', { name: 'Author attachment frame 2', exact: true })
		.click();
	await attachmentEditor.getByRole('checkbox', { name: 'Show grip guides', exact: true }).check();
	await attachmentEditor
		.getByRole('spinbutton', { name: 'Target grip X, px', exact: true })
		.fill('2.5');
	await expect(attachmentEditor.getByRole('alert')).toContainText('opaque visible palm');
	await expect(
		attachmentEditor.getByRole('spinbutton', { name: 'Target grip X, px', exact: true })
	).toBeEnabled();
	const bareAttachmentBody = () =>
		attachmentCanvas.evaluate((canvas: HTMLCanvasElement) => {
			const context = canvas.getContext('2d')!,
				data = context.getImageData(0, 0, canvas.width, canvas.height).data;
			return {
				opaque: data.filter((v, i) => i % 4 === 3 && v > 0).length,
				palm: [...context.getImageData(38, 48, 1, 1).data]
			};
		});
	await expect.poll(bareAttachmentBody).toEqual({ opaque: 2, palm: [102, 24, 31, 255] });
	await attachmentExport.click();
	await expect(attachmentEditor.getByRole('alert')).toContainText('opaque visible palm');
	await attachmentEditor
		.getByRole('combobox', { name: 'Canvas action', exact: true })
		.selectOption('grip');
	await clickPixel(attachmentCanvas, 38, 48);
	await expect(attachmentEditor.getByRole('alert')).toHaveCount(0);
	await attachmentEditor.getByRole('checkbox', { name: 'Show grip guides', exact: true }).uncheck();
	await attachmentEditor
		.getByRole('textbox', { name: 'Attachment review notes', exact: true })
		.fill('Synthetic eight-slot transport check only. Not qualified weapon artwork.');
	const attachmentDownload = page.waitForEvent('download');
	await attachmentExport.click();
	const attachmentFiles = await unzip(
		new Uint8Array(await readFile((await (await attachmentDownload).path())!))
	);
	const attachmentManifest = JSON.parse(
		new TextDecoder().decode(attachmentFiles.get('manifest.json')!)
	);
	const attachmentDocument = JSON.parse(
		new TextDecoder().decode(attachmentFiles.get('authoring.json')!)
	);
	expect(attachmentManifest).toMatchObject({
		qualified: false,
		direction: 'north',
		loop: false,
		cell: { w: 96, h: 96 },
		pivot: { x: 48, y: 60 }
	});
	expect(attachmentManifest.frames).toHaveLength(8);
	expect(attachmentDocument.body.hashes).toHaveLength(8);
	expect([...attachmentFiles.keys()].filter((name) => /^(body|layers)\//.test(name))).toHaveLength(
		16
	);
	for (const [slot, sourceIndex] of sharedSources.entries()) {
		const expectedHash = expected.find(
			(row) => row.preset === 'slash' && row.direction === 'north' && row.index === sourceIndex
		)!.outputHash;
		expect(attachmentManifest.frames[slot]).toMatchObject({
			index: slot,
			bodySha: expectedHash,
			ms: 100,
			included: true,
			source: 'rigid-source',
			hiddenPixels: 1
		});
		expect(attachmentDocument.body.hashes[slot]).toBe(expectedHash);
		expect(attachmentDocument.frames[slot].grip).toEqual({ x: 38.5, y: 48.5 });
		const body = await decodePngBytes(attachmentFiles.get(`body/${slot}.png`)!);
		expect([body.w, body.h]).toEqual([96, 96]);
		const unpadded = { w: 48, h: 48, data: new Uint8ClampedArray(48 * 48 * 4) };
		for (let y = 0; y < 48; y++)
			unpadded.data.set(
				body.data.subarray(((y + 24) * 96 + 24) * 4, ((y + 24) * 96 + 72) * 4),
				y * 48 * 4
			);
		expect(await cellHash(unpadded)).toBe(expectedHash);
		const layer = await decodePngBytes(attachmentFiles.get(`layers/${slot}.png`)!);
		expect([...layer.data.subarray((48 * 96 + 38) * 4, (48 * 96 + 38) * 4 + 4)]).toEqual([
			0, 0, 0, 0
		]);
		expect(layer.data.filter((v, i) => i % 4 === 3 && v > 0)).toHaveLength(1);
	}
	const clippedDocument = structuredClone(attachmentDocument);
	clippedDocument.asset.png = await page.evaluate(async () => {
		const imagePath = '/src/lib/image/png.ts',
			codecPath = '/src/lib/image/pngraw.ts',
			image = await import(imagePath),
			codec = await import(codecPath),
			source = image.makeImg(256, 3);
		source.data.set([180, 180, 180, 255], 4);
		source.data.set([100, 60, 30, 255], (256 + 1) * 4);
		source.data.set([180, 180, 180, 255], (256 + 255) * 4);
		return image.bytesToBase64(await codec.encodePngBytes(source));
	});
	await attachmentEditor.getByLabel('Import attachment document', { exact: true }).setInputFiles({
		name: 'clipped-source.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(clippedDocument))
	});
	await expect(
		attachmentEditor.getByText(/1 source pixels clip outside the canvas\./)
	).toBeVisible();
	await attachmentExport.click();
	await expect(attachmentEditor.getByRole('alert')).toContainText('clips source artwork');
	await attachmentEditor
		.getByRole('button', { name: 'Save attachment draft', exact: true })
		.click();
	await expect(attachmentEditor.getByRole('status')).toContainText('saved locally');
	const clippedDraft = await page.evaluate(
		(id) => JSON.parse(localStorage.getItem('pixeldoll.motionAttachment.' + id)!),
		attachmentDocument.body.jobId
	);
	expect(clippedDraft.asset.png).toBe(clippedDocument.asset.png);
	expect(clippedDraft.frames[0].grip).toEqual({ x: 38.5, y: 48.5 });
	const offBodyDocument = structuredClone(attachmentDocument);
	offBodyDocument.frames[0].grip = { x: 2.5, y: 48.5 };
	await attachmentEditor.getByRole('checkbox', { name: 'Show grip guides', exact: true }).check();
	await attachmentEditor.getByLabel('Import attachment document', { exact: true }).setInputFiles({
		name: 'off-body-contact.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(offBodyDocument))
	});
	await expect(attachmentEditor.getByRole('alert')).toContainText('opaque visible palm');
	await expect.poll(bareAttachmentBody).toEqual({ opaque: 2, palm: [102, 24, 37, 255] });
	await attachmentEditor
		.getByRole('combobox', { name: 'Canvas action', exact: true })
		.selectOption('grip');
	await clickPixel(attachmentCanvas, 38, 48);
	await expect(attachmentEditor.getByRole('alert')).toHaveCount(0);
	const footCanvas = footEditor.getByLabel('Mark native visible foot', { exact: true });
	await expect(
		footEditor.getByRole('button', { name: 'Save native foot draft', exact: true })
	).toBeEnabled();
	await clickPixel(footCanvas, 2, 2);
	await expect(footEditor.getByRole('alert')).toContainText('Choose an opaque pixel');
	await clickPixel(footCanvas, 14, 24);
	await footEditor
		.getByRole('textbox', { name: 'Native foot review notes', exact: true })
		.fill('One synthetic visible mark. Travel speed intentionally unknown.');
	const footDownload = page.waitForEvent('download');
	await footEditor.getByRole('button', { name: 'Export native foot review', exact: true }).click();
	const footReview = JSON.parse(await readFile((await (await footDownload).path())!, 'utf8'));
	expect(footReview).toMatchObject({
		qualified: false,
		speed: { x: null, y: null },
		marks: [{ frame: 0, track: 'A', landmark: 'heel', stance: 'stance-1', x: 14, y: 24 }],
		measurements: { qualified: false, partial: true, intervalHolds: [] }
	});
	expect(footReview.binding.hashes).toEqual(attachmentDocument.body.hashes);
	expect(footReview.binding.durations).toEqual(Array(8).fill(100));
	expect(footReview.measurements.stances[0].boundarySpanPx).toBeNull();
	const rejectStaleAttachment = async () => {
		await expect(attachmentEditor).toHaveCount(0);
		await openAuthoring.click();
		await expect(
			attachmentEditor.getByLabel('Attachment source artwork', { exact: true })
		).toHaveCount(0);
		await attachmentEditor.getByLabel('Import attachment document', { exact: true }).setInputFiles({
			name: 'stale-attachment.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(attachmentDocument))
		});
		await expect(attachmentEditor.getByRole('alert')).toContainText(
			'does not match these exact frozen frames'
		);
		await expect(
			attachmentEditor.getByLabel('Attachment source artwork', { exact: true })
		).toHaveCount(0);
	};
	await sourceSample.selectOption('0');
	await rejectStaleAttachment();
	await sourceSample.selectOption('7');
	const authoredMotionX = starter.getByRole('spinbutton', { name: 'Motion X', exact: true });
	await authoredMotionX.fill('5');
	await authoredMotionX.press('Tab');
	await rejectStaleAttachment();
	await starter.getByRole('combobox', { name: 'Native view', exact: true }).selectOption('east');
	await rejectStaleAttachment();
	await starter.getByRole('button', { name: 'Close hand and foot review', exact: true }).click();
	await starter.getByRole('combobox', { name: 'Native view', exact: true }).selectOption('north');
	await authoredMotionX.fill('4');
	await authoredMotionX.press('Tab');
	await starter
		.getByRole('combobox', { name: 'Native view', exact: true })
		.selectOption('south-west');
	const reviewed = starter.getByRole('checkbox', {
		name: 'I reviewed whole-view alignment and the common pivot. This does not certify anatomy or weapon quality.',
		exact: true
	});
	const exportButton = starter.getByRole('button', {
		name: 'Export experimental Studio pack · Free',
		exact: true
	});
	await starter
		.getByRole('textbox', { name: 'Layout review notes', exact: true })
		.fill('Synthetic eight-view alignment reviewed. This test does not certify art quality.');
	await reviewed.check();
	await expect(exportButton).toBeEnabled();
	await sourceSample.selectOption('1');
	await expect(reviewed).not.toBeChecked();
	await sourceSample.selectOption('7');
	await reviewed.check();
	const motionX = starter.getByRole('spinbutton', { name: 'Motion X', exact: true });
	await motionX.fill('1');
	await motionX.press('Tab');
	await expect(reviewed).not.toBeChecked();
	await motionX.fill('0.5');
	await motionX.press('Tab');
	await expect(starter.getByRole('alert')).toContainText('integer');
	await expect.poll(opaque).toBe(false);
	await motionX.fill('-100');
	await motionX.press('Tab');
	await expect(starter.getByRole('alert')).toContainText('clips visible artwork');
	await expect.poll(opaque).toBe(false);
	await motionX.fill('0');
	await motionX.press('Tab');
	await expect.poll(opaque).toBe(true);
	await expect(starter.getByRole('alert')).toHaveCount(0);
	await reviewed.check();
	const downloading = page.waitForEvent('download');
	await exportButton.click();
	const bytes = new Uint8Array(await readFile((await (await downloading).path())!)),
		files = await unzip(bytes),
		parsed = await readCharacterZip(bytes);
	const evidence = JSON.parse(new TextDecoder().decode(files.get('starter-evidence.json')!));
	expect(evidence).toMatchObject({
		qualified: false,
		equippedQualified: false,
		providerTiming: false
	});
	expect(evidence.clips.map((c: { animationGroupId: string }) => c.animationGroupId)).toEqual([
		'starter-group-idle',
		'starter-group-walk',
		'starter-group-slash'
	]);
	expect([...files.keys()].filter((name) => name.startsWith('raw/'))).toHaveLength(168);
	expect(parsed.extra).toEqual({});
	expect(parsed.project.manifest.rig.pivot).toEqual({ x: 24, y: 36 });
	expect(parsed.project.manifest.rig.directions).toEqual(directions.map((id) => ({ id })));
	expect(parsed.project.manifest.rig.animations.map((a) => [a.id, a.cells, a.loop])).toEqual([
		['default', 1, true],
		['idle', 1, true],
		['walk', 8, true],
		['slash', 6, false]
	]);
	const idle = parsed.project.manifest.rig.animations.find((a) => a.id === 'idle')!;
	expect(idle.frames).toEqual(Array(4).fill({ cell: 0, ms: 150 }));
	expect(idle).not.toHaveProperty('source');
	const stillIdle = evidence.clips.find((clip: { preset: string }) => clip.preset === 'idle');
	expect(stillIdle).toMatchObject({
		playableSource: 'standing-reference',
		researchOnly: true,
		sourceFrames: [],
		uniquePlayableSourceFrames: []
	});
	expect(stillIdle.frames).toHaveLength(32);
	for (const direction of directions) {
		const standing = evidence.source.rest.find(
			(r: { direction: string }) => r.direction === direction
		);
		const playable = stillIdle.playableFrames.find(
			(r: { direction: string }) => r.direction === direction
		);
		expect(playable).toEqual({
			direction,
			sourceKind: 'standing-reference',
			cell: 0,
			outputHash: standing.outputHash
		});
		expect(
			parsed.project.manifest.items[0].layers[0].cells!.idle[direction as DirectionName]
		).toEqual([standing.outputHash]);
	}
	expect(
		parsed.project.manifest.rig.animations.find((a) => a.id === 'slash')!.frames.map((f) => f.cell)
	).toEqual([0, 1, 1, 2, 3, 4, 5, 0]);
	const curatedAttack = evidence.clips.find((clip: { preset: string }) => clip.preset === 'slash');
	expect(curatedAttack.sourceFrames).toEqual(sharedSources);
	expect(curatedAttack.uniquePlayableSourceFrames).toEqual([7, 1, 3, 4, 5, 6]);
	expect(curatedAttack.playableFrames).toHaveLength(48);
	expect(curatedAttack.nativeCells.north).toEqual({ w: 40, h: 40 });
	expect(curatedAttack.nativeCells.east).toEqual({ w: 48, h: 48 });
	expect(evidence.layout.offsets.slash.north).toEqual({ x: 4, y: 4 });
	expect(parsed.project.manifest.items[0].qa).toMatchObject({ status: 'warn', unmeasured: true });
	for (const frame of expected) {
		const row = evidence.clips
			.find((clip: { preset: string }) => clip.preset === frame.preset)
			.frames.find(
				(f: { direction: string; index: number }) =>
					f.direction === frame.direction && f.index === frame.index
			);
		const raw = files.get(row.path)!,
			decoded = await decodePngBytes(raw);
		expect([decoded.w, decoded.h]).toEqual([frame.size, frame.size]);
		expect(await cellHash(decoded)).toBe(frame.rgbaHash);
		expect(`sha256:${await sha256(raw)}`).toBe(row.archivePngHash);
		if (frame.preset === 'idle' || (frame.preset === 'slash' && [0, 2].includes(frame.index))) {
			expect(row).not.toHaveProperty('outputHash');
			expect(row).not.toHaveProperty('playableCell');
			expect(parsed.project.images.has(frame.outputHash)).toBe(false);
		} else expect(row.outputHash).toBe(frame.outputHash);
	}
	await openStudio(page, '/');
	await page.locator('.project-btn').click();
	await page.getByRole('menuitem', { name: 'Import character…', exact: true }).click();
	await page.getByLabel('Character ZIP', { exact: true }).setInputFiles({
		name: 'starter.pixeldoll.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(bytes)
	});
	await expect(
		page.getByRole('img', { name: 'Character import preview', exact: true })
	).toBeVisible();
	await page
		.getByRole('checkbox', { name: 'Set up the pose rig next (recommended)', exact: true })
		.uncheck();
	await page.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(
		page.getByRole('heading', {
			name: 'EXPERIMENTAL Synthetic starter source starter pack',
			exact: true
		})
	).toBeVisible();
	const pause = page.getByRole('button', { name: 'Pause', exact: true });
	if (await pause.count()) await pause.click();
	await page.getByRole('combobox', { name: 'Move', exact: true }).selectOption('slash');
	await page.getByRole('button', { name: 'Inspect', exact: true }).click();
	const inspect = page.getByRole('dialog', { name: 'Inspect character', exact: true });
	await expect(
		inspect.getByRole('combobox', { name: 'Move', exact: true }).locator('option')
	).toHaveText(['Default', 'Idle', 'Walk', 'Slash']);
	await expect(
		inspect.getByRole('group', { name: 'Direction', exact: true }).getByRole('button')
	).toHaveCount(8);
	await inspect.getByRole('button', { name: 'Face north-west', exact: true }).click();
	await expect(
		inspect.getByRole('button', { name: 'Face north-west', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect
		.poll(() =>
			inspect
				.getByRole('img')
				.locator('canvas')
				.evaluate((canvas: HTMLCanvasElement) => {
					const scale = canvas.width / 48;
					return [
						...canvas
							.getContext('2d')!
							.getImageData(Math.floor(10.5 * scale), Math.floor(20.5 * scale), 1, 1).data
					];
				})
		)
		.toEqual([102, 25, 37, 255]);
	await expect(inspect.getByText('Frame 1 of 8', { exact: true })).toBeVisible();
	await inspect.getByRole('button', { name: 'Next frame', exact: true }).click();
	await expect(inspect.getByText('Frame 2 of 8', { exact: true })).toBeVisible();
	const studioPixel = () =>
		inspect
			.getByRole('img')
			.locator('canvas')
			.evaluate((canvas: HTMLCanvasElement) => {
				const scale = canvas.width / 48;
				return [
					...canvas
						.getContext('2d')!
						.getImageData(Math.floor(10.5 * scale), Math.floor(20.5 * scale), 1, 1).data
				];
			});
	await expect.poll(studioPixel).toEqual([102, 25, 31, 255]);
	await inspect.getByRole('button', { name: 'Next frame', exact: true }).click();
	await expect(inspect.getByText('Frame 3 of 8', { exact: true })).toBeVisible();
	await expect.poll(studioPixel).toEqual([102, 25, 31, 255]);
	await inspect.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Export', exact: true })).toContainText(
		'Saved quality or appearance flags'
	);
	await page.screenshot({ path: testInfo.outputPath('starter-pack-studio-warnings.png') });
	expect(requests).toEqual([]);
	expect(errors).toEqual([]);
});
