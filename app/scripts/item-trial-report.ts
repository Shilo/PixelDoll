// Reevaluate retained trial output through production extraction. Offline only.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { base64ToBytes, makeImg, type Img } from '../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { recompose } from '../src/lib/items/items.ts';
import { evaluateTrialFrames } from './item-trial-evaluate.ts';
import { over } from '../src/lib/compose/compose.ts';
import { sha256, stableStringify } from '../src/lib/image/hash.ts';
import { prepareTrial } from '../src/ui/item-trial/trial.ts';
import type { TrialPacket, TrialRecord } from '../src/ui/item-trial/trial.ts';
import type { JobRec } from '../src/lib/pixellab/queue.ts';

interface Evidence {
	record: Omit<TrialRecord, 'packet'> & { packet: TrialPacket };
	job?: JobRec;
	images: { label: string; png: string; sha: string }[];
}
const directory = resolve(process.argv[2] ?? 'test-results-item-trials/evidence');
const output = resolve(directory, 'report');
mkdirSync(output, { recursive: true });
const sortedIdentity = (values: string[]) => stableStringify([...values].sort());
const reports = [];
const inputs = readdirSync(directory)
	.filter((name) => name.endsWith('.json'))
	.flatMap((file) => {
		const value = JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as
			Evidence | { kind: string; trials: Evidence[] };
		if ('kind' in value && value.kind === 'pixeldoll-item-trial-evidence') {
			if (!Array.isArray(value.trials) || !value.trials.length)
				throw new Error(`${file} has no trial evidence.`);
			return value.trials.map((evidence, index) => ({
				file: `${file} trial ${index + 1}`,
				evidence
			}));
		}
		return [{ file, evidence: value as Evidence }];
	});
const seenRequests = new Set<string>();
for (const { file, evidence } of inputs) {
	if (!evidence.record || !evidence.job)
		throw new Error(`${file} lacks its saved request and receipt.`);
	if (evidence.job.state !== 'done')
		throw new Error(`${file} has unfinished state ${evidence.job.state}.`);
	const { packet, arm } = evidence.record;
	if (seenRequests.has(evidence.record.requestHash))
		throw new Error(`${file} duplicates a request already included in this report.`);
	seenRequests.add(evidence.record.requestHash);
	const prepared = await prepareTrial(packet, arm);
	if (
		prepared.packetHash !== evidence.record.packetHash ||
		prepared.requestHash !== evidence.record.requestHash ||
		evidence.job.requestHash !== prepared.requestHash ||
		prepared.expectedResults !== evidence.record.expectedResults ||
		sortedIdentity(prepared.inputs) !== sortedIdentity(evidence.record.inputHashes) ||
		sortedIdentity(prepared.inputs) !== sortedIdentity(evidence.job.inputs)
	)
		throw new Error(`${file} does not match its immutable packet and request identity.`);
	const savedOutputs = evidence.job.jobs.flatMap((job) => job.results);
	const outputIdentity = (image: { label: string; sha: string }) =>
		stableStringify({ label: image.label, sha: image.sha });
	if (
		savedOutputs.length !== prepared.expectedResults ||
		sortedIdentity(savedOutputs.map(outputIdentity)) !==
			sortedIdentity(evidence.images.map(outputIdentity)) ||
		new Set(evidence.images.map((image) => image.label)).size !== prepared.expectedResults
	)
		throw new Error(`${file} has missing or duplicated result frames.`);
	for (const result of evidence.images) {
		if (
			(await sha256(base64ToBytes(result.png))) !== result.sha ||
			!evidence.job.jobs.some((job) =>
				job.results.some((image) => image.sha === result.sha && image.label === result.label)
			)
		)
			throw new Error(`${file} has an output outside its saved receipt.`);
	}
	const frames = await Promise.all(
		[...evidence.images]
			.sort(
				(a, b) => Number(a.label.match(/\d+$/)?.[0] ?? 0) - Number(b.label.match(/\d+$/)?.[0] ?? 0)
			)
			.map((result) => decodePngBytes(base64ToBytes(result.png)))
	);
	const { raw, base, expected, expectedCuts, cells, qa, perFrame } = await evaluateTrialFrames(
		packet,
		arm,
		frames,
		file
	);
	const sheet = makeImg(packet.cell.w * cells.length, packet.cell.h * 5);
	const rows: Img[][] = [
		base,
		raw,
		cells.map((cell) => cell.layer),
		cells.map(recompose),
		cells.map((cell, index) =>
			recompose({ base: cell.base, layer: expected[index], cut: expectedCuts[index] })
		)
	];
	rows.forEach((images, row) =>
		images.forEach((image, col) => over(sheet, image, col * packet.cell.w, row * packet.cell.h))
	);
	const name = `${packet.id}-${arm}`;
	writeFileSync(resolve(output, `${name}.png`), await encodePngBytes(sheet));
	const protectedBody = perFrame.reduce((sum, frame) => sum + frame.protectedBody, 0);
	const protectedOffKey = perFrame.reduce((sum, frame) => sum + frame.protectedOffKey, 0);
	const billingReported =
		evidence.job.jobs.length > 0 &&
		evidence.job.jobs.every((job) => {
			const usage = job.usage;
			const value =
				usage?.type === 'usd'
					? usage.usd
					: usage?.type === 'generations'
						? usage.generations
						: undefined;
			return typeof value === 'number' && Number.isFinite(value) && value >= 0;
		});
	const report = {
		id: packet.id,
		arm,
		endpoint: evidence.job.endpoint,
		billingReported,
		usd: billingReported ? evidence.job.usd : null,
		gens: billingReported ? evidence.job.gens : null,
		durationMs:
			evidence.job.finishedAt === undefined
				? null
				: evidence.job.finishedAt - (evidence.job.submittedAt ?? evidence.job.createdAt),
		requestHash: evidence.record.requestHash,
		status: qa.qa.status,
		warnings: qa.warnings,
		fails: [...qa.failCalls.values()].flat(),
		worstIoU: Math.min(...perFrame.map((frame) => frame.iou)),
		protectedBody,
		protectedOffKey,
		perFrame
	};
	reports.push(report);
	writeFileSync(resolve(output, `${name}.json`), JSON.stringify(report, null, 2));
}
writeFileSync(resolve(output, 'summary.json'), JSON.stringify(reports, null, 2));
console.log(
	JSON.stringify(
		reports.map(({ id, arm, usd, gens, status, worstIoU, protectedBody, protectedOffKey }) => ({
			id,
			arm,
			usd,
			gens,
			status,
			worstIoU,
			protectedBody,
			protectedOffKey
		})),
		null,
		2
	)
);
