// Prepare a palette-only comparison from the public frozen campaign. No connection or submission path is called.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { colorCounts, toHex } from '../src/lib/dress/palette.ts';
import { base64ToBytes } from '../src/lib/image/png.ts';
import { decodePngBytes } from '../src/lib/image/pngraw.ts';
import { stableStringify } from '../src/lib/image/hash.ts';
import { prepareTrial, prepareTrialPlan, type TrialPlan } from '../src/ui/item-trial/trial.ts';

const source = JSON.parse(
	readFileSync(resolve('test-results-item-trials/packets/matched-item-trials.plan.json'), 'utf8')
) as TrialPlan;
const ledger = JSON.parse(
	readFileSync(resolve('../docs/research/evidence/item-trials-2026-11-06.json'), 'utf8')
) as {
	planHash: string;
	reports: {
		id: string;
		arm: string;
		packetHash: string;
		requestHash: string;
		receiptId: string;
		usd: number;
		gens: number;
	}[];
};
const original = await prepareTrialPlan(source);
assert.equal(original.planHash, ledger.planHash, 'The frozen source plan changed.');
assert.equal(
	original.trials.length,
	60,
	'The retained comparison must contain all 60 original trials.'
);
for (const trial of original.trials) {
	const receipt = ledger.reports.find((row) => row.id === trial.packet.id && row.arm === trial.arm);
	assert.ok(receipt, `No retained identity for ${trial.packet.id}/${trial.arm}.`);
	assert.equal(trial.packetHash, receipt.packetHash, 'An original packet identity changed.');
	assert.equal(trial.requestHash, receipt.requestHash, 'An original request identity changed.');
}

const controls = source.trials.filter(
	(trial) =>
		trial.arm === 'edit' &&
		trial.packet.conditioning === 'raw' &&
		['b-tunic', 'b-cloak'].includes(trial.packet.caseId) &&
		['south', 'east'].includes(trial.packet.direction) &&
		[110601, 110602].includes(trial.packet.seed)
);
assert.equal(
	controls.length,
	8,
	'The palette comparison requires eight distinct retained controls.'
);
const trials: TrialPlan['trials'] = [],
	pairs = [];
for (const row of controls) {
	const control = await prepareTrial(row.packet, row.arm);
	// These PNGs are the exact production inputCell-conditioned request images, including every visible key-ramp shade.
	const images = await Promise.all(
		[control.sourcePng, ...control.targetPngs].map((png) => decodePngBytes(base64ToBytes(png)))
	);
	const colors = [...colorCounts(images).keys()].sort((a, b) => a - b).map(toHex);
	assert.ok(
		colors.length >= 2 && colors.length <= 256,
		`${row.packet.id} has ${colors.length} colors; no colors were truncated or quantized.`
	);
	const packet = {
		...structuredClone(row.packet),
		id: `${row.packet.id}-palette`,
		label: `${row.packet.label} / exact target palette`,
		conditioning: 'raw-target-palette',
		targetPalette: { colors }
	};
	const variant = await prepareTrial(packet, row.arm);
	const { target_palette, ...body } = variant.request.body as Record<string, unknown>;
	assert.deepEqual(target_palette, { colors });
	assert.equal(
		stableStringify(body),
		stableStringify(control.request.body),
		'A request field besides target_palette changed.'
	);
	assert.equal(variant.request.method, control.request.method);
	assert.equal(variant.request.path, control.request.path);
	assert.equal(
		stableStringify([...variant.inputs].sort()),
		stableStringify([...control.inputs].sort()),
		'Input PNG identities changed.'
	);
	assert.equal(variant.packet.seed, control.packet.seed);
	assert.notEqual(variant.requestHash, control.requestHash);
	const receipt = ledger.reports.find((row) => row.requestHash === control.requestHash)!;
	assert.equal(receipt.usd, 0.08, 'The cash inference requires the retained control receipt.');
	assert.equal(receipt.gens, 0);
	trials.push(structuredClone(row), { packet, arm: row.arm });
	pairs.push({
		controlId: row.packet.id,
		variantId: packet.id,
		paletteColors: colors.length,
		controlPacketHash: control.packetHash,
		controlRequestHash: control.requestHash,
		controlReceiptId: receipt.receiptId,
		variantPacketHash: variant.packetHash,
		variantRequestHash: variant.requestHash,
		inputs: control.inputs,
		seed: control.packet.seed,
		estimatedGenerations: variant.estimatedGenerations,
		expectedResults: variant.expectedResults
	});
}
const plan: TrialPlan = {
	version: 1,
	kind: 'pixeldoll-item-trial-plan',
	id: 'matched-target-palette-2026-11-06-r1',
	label: 'Exact palette conditioning against retained controls',
	trials
};
const prepared = await prepareTrialPlan(plan);
assert.equal(prepared.trials.length, 16);
const output = resolve('test-results-item-trials/palette');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'target-palette.plan.json'), JSON.stringify(plan));
const summary = {
	planId: plan.id,
	planHash: prepared.planHash,
	originalPlanHash: original.planHash,
	unchangedOriginalIdentities: original.trials.length,
	retainedControls: controls.length,
	newRequests: pairs.length,
	estimatedNewGenerations: pairs.reduce((n, pair) => n + pair.estimatedGenerations, 0),
	inferredUsdFromControlReceipts: pairs.length * 0.08,
	providerQuote: false,
	pairs
};
writeFileSync(resolve(output, 'plan-summary.json'), JSON.stringify(summary, null, 2));
console.log(
	JSON.stringify(
		{
			planHash: summary.planHash,
			unchangedOriginalIdentities: summary.unchangedOriginalIdentities,
			retainedControls: summary.retainedControls,
			newRequests: summary.newRequests,
			estimatedNewGenerations: summary.estimatedNewGenerations,
			inferredUsdFromControlReceipts: summary.inferredUsdFromControlReceipts,
			providerQuote: false,
			palettes: pairs.map((pair) => ({ id: pair.variantId, colors: pair.paletteColors }))
		},
		null,
		2
	)
);
console.log(
	`Prepared ${pairs.length} new requests and ${controls.length} retained controls in ${output}. No requests were submitted.`
);
