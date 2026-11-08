// Offline paired analysis. Reuse the validated trial evaluator and its final layer contact rows.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { over } from '../src/lib/compose/compose.ts';
import { colorCounts, fromHex } from '../src/lib/dress/palette.ts';
import { sha256, stableStringify } from '../src/lib/image/hash.ts';
import { base64ToBytes, makeImg, type Img } from '../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { cutGrid } from '../src/lib/items/items.ts';
import { evaluateTrialFrames } from './item-trial-evaluate.ts';
import { prepareTrial, type TrialPacket, type TrialRecord } from '../src/ui/item-trial/trial.ts';
import type { JobRec } from '../src/lib/pixellab/queue.ts';

const rgbAt = (image: Img, p: number) =>
	(image.data[p * 4] << 16) | (image.data[p * 4 + 1] << 8) | image.data[p * 4 + 2];
const channels = (color: number) => [color >> 16, (color >> 8) & 255, color & 255];
const decode = (png: string) => decodePngBytes(base64ToBytes(png));
const ordered = (images: { label: string; png: string; sha: string }[]) =>
	[...images].sort(
		(a, b) => Number(a.label.match(/\d+$/)?.[0] ?? 0) - Number(b.label.match(/\d+$/)?.[0] ?? 0)
	);

/** Independent RGB baseline, not a claim about the provider's quantizer. Exact ties use palette order. */
export function nearestPalette(image: Img, palette: readonly number[]): Img {
	assert.ok(palette.length, 'Nearest-color comparison needs a palette.');
	const data = image.data.slice(),
		matches = new Map<number, number>();
	for (let p = 0; p < image.w * image.h; p++) {
		if (!image.data[p * 4 + 3]) continue;
		const color = rgbAt(image, p);
		if (!matches.has(color)) {
			const source = channels(color);
			let nearest = palette[0],
				distance = Infinity;
			for (const candidate of palette) {
				const next = channels(candidate).reduce(
					(sum, value, c) => sum + (value - source[c]) ** 2,
					0
				);
				if (next < distance) {
					distance = next;
					nearest = candidate;
				}
			}
			matches.set(color, nearest);
		}
		data.set(channels(matches.get(color)!), p * 4);
	}
	return { ...image, data };
}

export function paletteMembership(image: Img, palette: ReadonlySet<number>) {
	let visiblePixels = 0,
		fullyOpaquePixels = 0,
		fractionalAlphaPixels = 0,
		palettePixels = 0;
	for (let p = 0; p < image.w * image.h; p++) {
		const alpha = image.data[p * 4 + 3];
		if (!alpha) continue;
		visiblePixels++;
		if (alpha === 255) fullyOpaquePixels++;
		else fractionalAlphaPixels++;
		if (palette.has(rgbAt(image, p))) palettePixels++;
	}
	return {
		visiblePixels,
		fullyOpaquePixels,
		fractionalAlphaPixels,
		palettePixels,
		outsidePalettePixels: visiblePixels - palettePixels,
		fraction: visiblePixels ? palettePixels / visiblePixels : null
	};
}

export function pixelAgreement(before: Img, after: Img) {
	assert.equal(before.w, after.w, 'Comparison widths differ.');
	assert.equal(before.h, after.h, 'Comparison heights differ.');
	let alphaMaskDifferentPixels = 0,
		alphaValueDifferentPixels = 0,
		visiblePixelsRemoved = 0,
		visiblePixelsAdded = 0,
		sharedVisiblePixels = 0,
		sharedVisibleRgbSamePixels = 0,
		sharedVisibleRgbaSamePixels = 0,
		exactRgbaPixels = 0;
	for (let p = 0; p < before.w * before.h; p++) {
		const a = before.data[p * 4 + 3],
			b = after.data[p * 4 + 3],
			sameRgb = rgbAt(before, p) === rgbAt(after, p);
		if (!!a !== !!b) alphaMaskDifferentPixels++;
		if (a && !b) visiblePixelsRemoved++;
		if (!a && b) visiblePixelsAdded++;
		if (a !== b) alphaValueDifferentPixels++;
		if (a && b) {
			sharedVisiblePixels++;
			if (sameRgb) sharedVisibleRgbSamePixels++;
			if (sameRgb && a === b) sharedVisibleRgbaSamePixels++;
		}
		if (sameRgb && a === b) exactRgbaPixels++;
	}
	return {
		pixels: before.w * before.h,
		alphaMaskDifferentPixels,
		alphaValueDifferentPixels,
		visiblePixelsRemoved,
		visiblePixelsAdded,
		sharedVisiblePixels,
		sharedVisibleRgbSamePixels,
		sharedVisibleRgbaSamePixels,
		exactRgbaPixels
	};
}

/** Each four-neighbor edge is counted once, and only with opaque endpoints in both images. */
export function edgeComparison(before: Img, after: Img) {
	assert.equal(before.w, after.w, 'Comparison widths differ.');
	assert.equal(before.h, after.h, 'Comparison heights differ.');
	let sharedOpaquePairs = 0,
		distinctControlEdges = 0,
		collapsedControlEdges = 0,
		newColorEdges = 0;
	for (let y = 0; y < before.h; y++)
		for (let x = 0; x < before.w; x++) {
			const p = y * before.w + x;
			for (const q of [x + 1 < before.w ? p + 1 : -1, y + 1 < before.h ? p + before.w : -1]) {
				if (
					q < 0 ||
					[
						before.data[p * 4 + 3],
						before.data[q * 4 + 3],
						after.data[p * 4 + 3],
						after.data[q * 4 + 3]
					].some((alpha) => alpha !== 255)
				)
					continue;
				sharedOpaquePairs++;
				const distinctBefore = rgbAt(before, p) !== rgbAt(before, q),
					distinctAfter = rgbAt(after, p) !== rgbAt(after, q);
				if (distinctBefore) {
					distinctControlEdges++;
					if (!distinctAfter) collapsedControlEdges++;
				} else if (distinctAfter) newColorEdges++;
			}
		}
	return { sharedOpaquePairs, distinctControlEdges, collapsedControlEdges, newColorEdges };
}

interface Evidence {
	record: Omit<TrialRecord, 'packet'> & { packet: TrialPacket };
	job: JobRec;
	images: { label: string; png: string; sha: string }[];
}
interface Report {
	id: string;
	arm: string;
	requestHash: string;
	billingReported: boolean;
	usd: number | null;
	gens: number | null;
	status: string;
	warnings: string[];
	fails: string[];
	perFrame: {
		key: string;
		keyKept?: number;
		keyOutside?: number;
		paletteDistance: number;
		[key: string]: unknown;
	}[];
}

async function main() {
	const directory = resolve(process.argv[2] ?? 'test-results-item-trials/palette-evidence');
	const files = readdirSync(directory).filter((name) => name.endsWith('.json'));
	assert.equal(
		files.length,
		1,
		'The palette evidence directory must contain only one complete 16-trial evidence bundle at its root.'
	);
	const bytes = readFileSync(resolve(directory, files[0]));
	const bundle = JSON.parse(bytes.toString('utf8')) as {
		kind: string;
		planId: string;
		planHash: string;
		trials: Evidence[];
	};
	assert.equal(
		bundle.kind,
		'pixeldoll-item-trial-evidence',
		'Expected a complete exported trial plan.'
	);
	assert.equal(
		bundle.planId,
		'matched-target-palette-2026-11-06-r1',
		'The export belongs to another plan.'
	);
	assert.equal(
		bundle.planHash,
		'd42231a4ec5e841549c8ed552f8776457179208df8818c0d0721336218a2da97',
		'The exported plan identity changed.'
	);
	assert.equal(
		bundle.trials.length,
		16,
		'Keep all eight controls and eight variants, including quality failures.'
	);
	// The shared evaluator refuses missing/unfinished receipts and independently validates every request and output hash.
	process.argv[2] = directory;
	await import('./item-trial-report.ts');
	const reportDirectory = resolve(directory, 'report');
	const reports = JSON.parse(
		readFileSync(resolve(reportDirectory, 'summary.json'), 'utf8')
	) as Report[];
	assert.equal(reports.length, 16, 'Every trial needs a freshly validated report.');
	const preparedLedger = JSON.parse(
		readFileSync(resolve('../docs/research/evidence/target-palette-plan-2026-11-06.json'), 'utf8')
	) as {
		planHash: string;
		pairs: { variantId: string; variantPacketHash: string; variantRequestHash: string }[];
	};
	assert.equal(bundle.planHash, preparedLedger.planHash);
	const prior = JSON.parse(
		readFileSync(resolve('../docs/research/evidence/item-trials-2026-11-06.json'), 'utf8')
	) as {
		reports: {
			id: string;
			arm: string;
			packetHash: string;
			requestHash: string;
			receiptId: string;
			outputs: { label: string; sha: string }[];
		}[];
	};
	const variants = bundle.trials.filter((row) => row.record.packet.targetPalette);
	assert.equal(variants.length, 8, 'Expected eight palette variants.');
	const pairs = [];
	for (const variant of variants) {
		const packet = variant.record.packet,
			controlId = packet.id.replace(/-palette$/, '');
		assert.notEqual(controlId, packet.id, 'A palette variant needs the recorded -palette suffix.');
		const control = bundle.trials.find(
			(row) => row.record.packet.id === controlId && row.record.arm === 'edit'
		);
		assert.ok(control, `Missing retained control ${controlId}.`);
		assert.equal(variant.record.arm, 'edit');
		const planned = preparedLedger.pairs.find((pair) => pair.variantId === packet.id);
		assert.ok(planned, 'The variant was not in the committed prepared plan.');
		assert.equal(
			variant.record.packetHash,
			planned.variantPacketHash,
			'The prepared variant packet changed.'
		);
		assert.equal(
			variant.record.requestHash,
			planned.variantRequestHash,
			'The prepared variant request changed.'
		);
		const known = prior.reports.find((row) => row.id === controlId && row.arm === 'edit');
		assert.ok(known, 'The control has no earlier committed receipt.');
		assert.equal(control.record.packetHash, known.packetHash);
		assert.equal(control.record.requestHash, known.requestHash);
		assert.equal(control.job.id, known.receiptId);
		const outputIdentity = (images: { label: string; sha: string }[]) =>
			stableStringify(
				images
					.map(({ label, sha }) => ({ label, sha }))
					.sort((a, b) => a.label.localeCompare(b.label))
			);
		assert.equal(
			outputIdentity(control.images),
			outputIdentity(known.outputs),
			'The retained control output identities changed.'
		);
		const [controlPrepared, variantPrepared] = await Promise.all([
			prepareTrial(control.record.packet, 'edit'),
			prepareTrial(packet, 'edit')
		]);
		const { target_palette, ...variantBody } = variantPrepared.request.body as Record<
			string,
			unknown
		>;
		assert.equal(
			stableStringify(variantBody),
			stableStringify(controlPrepared.request.body),
			'A request condition besides target_palette changed.'
		);
		assert.deepEqual(target_palette, packet.targetPalette);
		assert.equal(controlPrepared.request.method, variantPrepared.request.method);
		assert.equal(controlPrepared.request.path, variantPrepared.request.path);
		assert.equal(
			stableStringify([...controlPrepared.inputs].sort()),
			stableStringify([...variantPrepared.inputs].sort()),
			'Submitted PNG identities changed.'
		);
		assert.equal(control.record.packet.seed, packet.seed);
		const palette = packet.targetPalette!.colors.map(fromHex),
			paletteSet = new Set(palette);
		assert.deepEqual(
			palette,
			[...palette].sort((a, b) => a - b),
			'The baseline requires the recorded sorted palette order.'
		);
		const standing = await decode(packet.reference.layer),
			approvedColors = new Set(colorCounts([standing]).keys());
		const controlOutputs = await Promise.all(
			ordered(control.images).map((image) => decode(image.png))
		);
		const controlRaw = controlOutputs.slice(1);
		const paidRaw = await Promise.all(
			ordered(variant.images)
				.slice(1)
				.map((image) => decode(image.png))
		);
		const reportOf = (row: Evidence) => {
			const report = reports.find((report) => report.requestHash === row.record.requestHash);
			assert.ok(report, 'A validated report is missing.');
			return report;
		};
		const controlReport = reportOf(control),
			variantReport = reportOf(variant),
			{ w, h } = packet.cell,
			count = packet.targets.length;
		const layers = async (row: Evidence) => {
			const sheet = await decodePngBytes(
				readFileSync(resolve(reportDirectory, `${row.record.packet.id}-edit.png`))
			);
			assert.equal(sheet.h, h * 5, 'The validated contact layout changed.');
			return cutGrid(sheet, count * 5, w, h, count).slice(count * 2, count * 3);
		};
		const [controlLayers, paidLayers] = await Promise.all([layers(control), layers(variant)]);
		const nearestEvaluation = await evaluateTrialFrames(
			control.record.packet,
			'edit',
			controlOutputs.map((image) => nearestPalette(image, palette)),
			`Offline nearest baseline ${controlId}`
		);
		const nearest = nearestEvaluation.raw;
		const perFrame = controlRaw.map((raw, i) => ({
			key: packet.targets[i].key,
			control: {
				rawPalette: paletteMembership(raw, paletteSet),
				gearStandingPalette: paletteMembership(controlLayers[i], approvedColors),
				qa: controlReport.perFrame[i]
			},
			paid: {
				rawPalette: paletteMembership(paidRaw[i], paletteSet),
				gearStandingPalette: paletteMembership(paidLayers[i], approvedColors),
				qa: variantReport.perFrame[i]
			},
			paidVersusControl: {
				pixels: pixelAgreement(raw, paidRaw[i]),
				edges: edgeComparison(raw, paidRaw[i]),
				gearPixels: pixelAgreement(controlLayers[i], paidLayers[i]),
				gearEdges: edgeComparison(controlLayers[i], paidLayers[i])
			},
			nearest: {
				rawPalette: paletteMembership(nearest[i], paletteSet),
				gearStandingPalette: paletteMembership(nearestEvaluation.cells[i].layer, approvedColors),
				qa: nearestEvaluation.perFrame[i],
				versusControl: pixelAgreement(raw, nearest[i]),
				edgesVersusControl: edgeComparison(raw, nearest[i]),
				versusPaid: pixelAgreement(nearest[i], paidRaw[i]),
				gearVersusControl: pixelAgreement(controlLayers[i], nearestEvaluation.cells[i].layer),
				gearEdgesVersusControl: edgeComparison(controlLayers[i], nearestEvaluation.cells[i].layer),
				gearVersusPaid: pixelAgreement(nearestEvaluation.cells[i].layer, paidLayers[i])
			}
		}));
		const sheet = makeImg(w * count, h * 7);
		// Rows: control/paid/nearest raw, control/paid/nearest extracted gear, approved isolated standing reference.
		[
			controlRaw,
			paidRaw,
			nearest,
			controlLayers,
			paidLayers,
			nearestEvaluation.cells.map((cell) => cell.layer),
			Array.from({ length: count }, () => standing)
		].forEach((row, y) => row.forEach((image, x) => over(sheet, image, x * w, y * h)));
		writeFileSync(
			resolve(reportDirectory, `${packet.id}-comparison.png`),
			await encodePngBytes(sheet)
		);
		const receipt = (report: Report, row: Evidence) => ({
			id: row.job.id,
			requestHash: row.record.requestHash,
			billingReported: report.billingReported,
			usd: report.usd,
			gens: report.gens,
			status: report.status,
			warnings: report.warnings,
			fails: report.fails
		});
		pairs.push({
			id: controlId,
			seed: packet.seed,
			paletteColors: palette.length,
			control: receipt(controlReport, control),
			paid: receipt(variantReport, variant),
			nearestQa: {
				kind: 'offline-counterfactual',
				status: nearestEvaluation.qa.qa.status,
				warnings: nearestEvaluation.qa.warnings,
				fails: [...nearestEvaluation.qa.failCalls.values()].flat()
			},
			perFrame
		});
	}
	const billing = (rows: Report[]) => ({
		reported: rows.every((row) => row.billingReported),
		usd: rows.every((row) => row.usd !== null)
			? rows.reduce((sum, row) => sum + row.usd!, 0)
			: null,
		gens: rows.every((row) => row.gens !== null)
			? rows.reduce((sum, row) => sum + row.gens!, 0)
			: null
	});
	const comparison = {
		version: 1,
		planId: bundle.planId,
		planHash: bundle.planHash,
		evidenceSha256: await sha256(bytes),
		definitions: {
			nearest:
				'Euclidean RGB nearest palette; exact ties follow sorted RGB palette order; alpha and hidden transparent RGB unchanged. This is an independent baseline, not a claimed provider implementation.',
			edges:
				'Each horizontal or vertical edge counted once; both endpoints must be alpha 255 in both images. Collapsed means distinct control RGB becomes equal comparison RGB. Geometry differences are separate.',
			gearStandingPalette:
				'Exact RGB membership in the approved same-facing isolated standing art, not independently labeled material ownership.'
		},
		receipts: {
			newPaid: billing(reports.filter((report) => report.id.endsWith('-palette'))),
			retainedControls: billing(reports.filter((report) => !report.id.endsWith('-palette')))
		},
		pairs
	};
	writeFileSync(
		resolve(reportDirectory, 'palette-comparison.json'),
		JSON.stringify(comparison, null, 2)
	);
	console.log(JSON.stringify({ pairs: pairs.length, ...comparison.receipts }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
