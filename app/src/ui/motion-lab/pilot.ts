// Controlled exact-reference experiment. All paid calls share the staged research budget.
import { get } from 'svelte/store';
import { api } from '../../lib/pixellab/client.ts';
import { routes, png, type Job } from '../../lib/pixellab/routes.ts';
import { requestIdentity, type JobRec } from '../../lib/pixellab/queue.ts';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import { base64ToBytes } from '../../lib/image/png.ts';
import { decodePngBytes } from '../../lib/image/pngraw.ts';
import * as db from '../../lib/store/db.ts';
import {
	labQueue,
	LAB_TAG,
	reconcileResearchJobs,
	exportEvidence,
	existingLabRequest
} from './run.ts';
import { browserMcp, type CustomMotionRequest } from './mcp.ts';
import {
	RESEARCH_PHASE,
	readResearchBudget,
	reserveResearchCall,
	recordResearchOutcome
} from './research-budget.ts';
import { summarizeResearchBilling } from './research-billing.ts';
import type { MotionFixture } from './model.ts';
const KEY = 'pixeldoll.motionPilot.2026-11-01',
	directions = ['south', 'east', 'north', 'west'] as const;
interface Pilot {
	version: 1;
	source: Record<string, string>;
	derived: string[];
	importCallId: string;
	importJobId?: string;
	reusedImport?: boolean;
	characterId?: string;
	verification?: {
		direction: string;
		canvas: [number, number];
		pngBytesIdentical: boolean;
		changedPixels: number;
	}[];
	instructions?: unknown;
	customCallId?: string;
	customReceipt?: unknown;
	character?: unknown;
	billing?: unknown;
}
export function readPilot(): Pilot | null {
	const saved = localStorage.getItem(KEY);
	if (!saved) return null;
	const value = JSON.parse(saved) as Pilot;
	if (value.version !== 1) throw new Error('Unsupported controlled pilot record.');
	return value;
}
const save = (value: Pilot) => localStorage.setItem(KEY, JSON.stringify(value));
async function sources(fixture: MotionFixture) {
	if (fixture.id !== 'c27man')
		throw new Error('The controlled pilot uses the stored adult 64 px benchmark.');
	return Object.fromEntries(
		await Promise.all(
			directions.map(async (d) => {
				const image = fixture.references[d]?.png;
				if (!image) throw new Error(`The ${d} reference is missing.`);
				return [d, await sha256(base64ToBytes(image))];
			})
		)
	);
}
export async function importPilot(fixture: MotionFixture) {
	if (!labQueue.key) throw new Error('Connect the localhost agent session first.');
	if (readPilot())
		throw new Error(
			'This import already has a record. Inspect its queue receipt; it will not be resent.'
		);
	await reconcileResearchJobs();
	const source = await sources(fixture),
		request = routes.createCharacterV3({
			description:
				'The identical bald paperdoll humanoid in the supplied reference views, empty hands, no props.',
			reference_image: png(fixture.references.south!.png),
			direction_images: Object.fromEntries(
				directions.filter((d) => d !== 'south').map((d) => [d, png(fixture.references[d]!.png)])
			),
			n_directions: 4,
			view: 'low top-down',
			template_id: 'mannequin',
			seed: 7,
			no_background: true
		});
	const { requestHash } = await requestIdentity(request),
		id = RESEARCH_PHASE + '-import-' + requestHash;
	const cached = existingLabRequest(requestHash);
	if (cached) {
		if (
			cached.state !== 'done' ||
			typeof (cached.response as { character_id?: unknown })?.character_id !== 'string' ||
			!(cached.response as { character_id: string }).character_id.trim()
		)
			throw new Error(
				`Existing ${cached.state} receipt ${cached.id} matches this import. Inspect it; no new reservation or request was created.`
			);
		save({
			version: 1,
			source,
			derived: fixture.directions.filter((d) => d.mirrorOf).map((d) => d.id),
			importCallId: 'offline-' + cached.id,
			importJobId: cached.id,
			reusedImport: true
		});
		return;
	}
	const reservation = await reserveResearchCall({
		id,
		label: 'Exact adult benchmark import, four supplied views',
		stage: 'body',
		units: 1
	});
	if (!reservation.created)
		throw new Error('This exact import has a reservation and cannot be resent.');
	const state: Pilot = {
		version: 1,
		source,
		derived: fixture.directions.filter((d) => d.mirrorOf).map((d) => d.id),
		importCallId: id
	};
	save(state);
	try {
		const job = await labQueue.enqueue(request, {
			label: reservation.record.label,
			tag: LAB_TAG,
			activityScope: LAB_TAG,
			playerRequested: true
		});
		state.importJobId = job.id;
		save(state);
		await recordResearchOutcome(id, { status: 'accepted', jobIds: [job.id] });
	} catch (e) {
		await recordResearchOutcome(id, { status: 'unknown', note: (e as Error).message });
		throw e;
	}
}
export async function verifyPilot(fixture: MotionFixture) {
	const state = readPilot();
	if (!state?.importJobId) throw new Error('An imported benchmark receipt is required.');
	if (stableStringify(await sources(fixture)) !== stableStringify(state.source))
		throw new Error('The selected reference pixels differ from the imported benchmark.');
	await reconcileResearchJobs();
	const job = get(labQueue).jobs.find((j) => j.id === state.importJobId);
	if (job?.state !== 'done')
		throw new Error(
			'The import has not completed. Read the existing queue result; do not submit again.'
		);
	const characterId = (job.response as { character_id?: string })?.character_id;
	if (!characterId) throw new Error('The completed import has no character ID.');
	const character = await api<{ rotation_urls?: Record<string, string> }>(
			labQueue.key,
			'GET',
			`/characters/${characterId}`
		),
		verification = [];
	for (const direction of directions) {
		const url = character.rotation_urls?.[direction];
		if (!url || !/^https:\/\/(backblaze|api)\.pixellab\.ai\//.test(url))
			throw new Error('An expected PixelLab reference URL is missing.');
		const response = await fetch(url, { cache: 'no-store' });
		if (!response.ok)
			throw new Error(`The ${direction} reference download failed (${response.status}).`);
		const bytes = new Uint8Array(await response.arrayBuffer()),
			actual = await decodePngBytes(bytes),
			expected = await decodePngBytes(base64ToBytes(fixture.references[direction]!.png));
		if (actual.w !== expected.w || actual.h !== expected.h)
			throw new Error(`The imported ${direction} canvas changed.`);
		let changedPixels = 0;
		for (let i = 0; i < actual.data.length; i += 4)
			if (
				(actual.data[i + 3] || expected.data[i + 3]) &&
				actual.data.subarray(i, i + 4).some((v, k) => v !== expected.data[i + k])
			)
				changedPixels++;
		verification.push({
			direction,
			canvas: [actual.w, actual.h] as [number, number],
			pngBytesIdentical: (await sha256(bytes)) === state.source[direction],
			changedPixels
		});
	}
	state.characterId = characterId;
	state.verification = verification;
	state.character = character;
	save(state);
	if (verification.some((v) => v.changedPixels))
		throw new Error('Imported reference pixels changed. The controlled comparison is blocked.');
	return verification;
}
function verified() {
	const state = readPilot();
	if (
		!state?.characterId ||
		state.verification?.length !== 4 ||
		state.verification.some((v) => v.changedPixels)
	)
		throw new Error('Verify all four exact imported reference views first.');
	return state;
}
export async function pilotInstructions() {
	const state = verified(),
		client = browserMcp(labQueue.key);
	await client.inspect();
	state.instructions = await client.instructions(state.characterId!);
	save(state);
	return state.instructions;
}
export async function pilotCustom() {
	const state = verified();
	if (!state.instructions)
		throw new Error('Read the character-specific free authoring instructions first.');
	if (state.customCallId)
		throw new Error(
			'This custom experiment already has a receipt or unknown outcome. It will not be resent.'
		);
	await reconcileResearchJobs();
	const client = browserMcp(labQueue.key);
	await client.inspect();
	const request: CustomMotionRequest = {
		character_id: state.characterId!,
		mode: 'skeleton-v3',
		animation_name: 'Controlled planted overhead, exact adult source',
		action_description: 'overhead strike with closed right fist',
		directions: ['south', 'east'],
		frame_count: 8,
		move: { name: 'chop', energy: 0.8 },
		poses: Array.from({ length: 8 }, (_, i) => ({
			frame: i + 1,
			right_foot: [0, 0, 0],
			left_foot: [0, 0, 0]
		}))
	};
	client.validateMotion(request);
	const id =
		RESEARCH_PHASE +
		'-custom-' +
		(await sha256(new TextEncoder().encode(stableStringify(request))));
	const reservation = await reserveResearchCall({
		id,
		label: request.animation_name,
		stage: 'body',
		units: 8
	});
	if (!reservation.created)
		throw new Error('This custom motion has a reservation and cannot be resent.');
	state.customCallId = id;
	save(state);
	try {
		const receipt = await client.animateMotion(request);
		state.customReceipt = receipt;
		save(state);
		const body = receipt as { isError?: boolean; content?: { text?: string }[] },
			ids = [
				...new Set(
					(body.content ?? []).flatMap((c) =>
						[...(c.text ?? '').matchAll(/job ([0-9a-f-]{36})\b/g)].map((m) => m[1])
					)
				)
			];
		await recordResearchOutcome(id, {
			status: body.isError ? 'failed' : ids.length === 2 ? 'accepted' : 'unknown',
			jobIds: ids,
			...(body.isError
				? {
						note: 'MCP returned an error without an explicit generation charge. Billing is unverified; retain the reservation.'
					}
				: {})
		});
		return receipt;
	} catch (e) {
		await recordResearchOutcome(id, { status: 'unknown', note: (e as Error).message });
		throw e;
	}
}
export async function refreshPilot() {
	await reconcileResearchJobs();
	const state = readPilot();
	if (!state?.characterId) return state;
	state.character = await api(labQueue.key, 'GET', `/characters/${state.characterId}`);
	const call = readResearchBudget().calls.find((c) => c.id === state.customCallId);
	if (call?.jobIds?.length) {
		const jobs = await Promise.all(
			call.jobIds.map((id) => api<Job>(labQueue.key, 'GET', `/background-jobs/${id}`))
		);
		state.billing = jobs.map((j) => ({ id: j.id, status: j.status, usage: j.usage ?? null }));
		const billing = summarizeResearchBilling(jobs);
		await recordResearchOutcome(call.id, {
			...billing,
			status: call.status === 'completed' || call.status === 'failed' ? call.status : billing.status
		});
	}
	save(state);
	return state;
}
export async function exportPilot() {
	await reconcileResearchJobs();
	if (labQueue.key && readPilot()?.characterId) await refreshPilot();
	const pilot = readPilot(),
		ids = new Set(pilot?.importJobId ? [pilot.importJobId] : []),
		jobs = (await db.all<JobRec>('jobs')).filter((j) => ids.has(j.id));
	return {
		version: 1,
		pilot,
		budget: readResearchBudget(),
		jobs,
		rawEvidence: await exportEvidence(RESEARCH_PHASE)
	};
}
