// Accounting and receipts for fixed, caller-verified development diagnostics only.
import { get } from 'svelte/store';
import { routes, png, type InpaintV3 } from '../../lib/pixellab/routes.ts';
import { requestIdentity, type JobRec } from '../../lib/pixellab/queue.ts';
import { bytesToBase64 } from '../../lib/image/png.ts';
import * as db from '../../lib/store/db.ts';
import { labQueue, LAB_TAG, reconcileResearchJobs, existingLabRequest } from './run.ts';
import {
	RESEARCH_PHASE,
	reserveResearchCall,
	recordResearchOutcome,
	readResearchBudget
} from './research-budget.ts';

export interface FixedInpaintRecord<P = unknown> {
	version: 1;
	packet: P;
	callId: string;
	jobId?: string;
	error?: string;
}
export function readFixedInpaint<P = unknown>(key: string): FixedInpaintRecord<P> | null {
	const text = localStorage.getItem(key);
	if (!text) return null;
	const row = JSON.parse(text) as FixedInpaintRecord<P>;
	if (row.version !== 1) throw new Error('Unsupported fixed inpaint receipt.');
	return row;
}
/** The caller must verify its immutable packet and source pixels before dispatching. */
export async function dispatchFixedInpaint<P>(
	profile: { key: string; label: string; units: 25 },
	packet: P,
	input: InpaintV3
) {
	if (profile.units !== 25 || !profile.key.trim() || !profile.label.trim())
		throw new Error(
			'A fixed inpaint diagnostic needs its one-shot profile and 25-unit reservation.'
		);
	if (!labQueue.key) throw new Error('Connect the localhost agent session first.');
	await reconcileResearchJobs();
	if (!navigator.locks) throw new Error('Safe diagnostic accounting requires browser Web Locks.');
	return navigator.locks.request(profile.key, async () => {
		if (readFixedInpaint(profile.key))
			throw new Error(
				'This one-shot diagnostic already has a receipt or unknown outcome. It will not be resent.'
			);
		const request = routes.inpaintV3({
			description: input.description,
			inpainting_image: {
				image: png(input.inpainting_image.image.base64),
				size: {
					width: input.inpainting_image.size.width,
					height: input.inpainting_image.size.height
				}
			},
			mask_image: {
				image: png(input.mask_image.image.base64),
				size: { width: input.mask_image.size.width, height: input.mask_image.size.height }
			},
			seed: input.seed,
			no_background: input.no_background
		});
		const { requestHash } = await requestIdentity(request),
			existing = existingLabRequest(requestHash);
		if (existing)
			throw new Error(
				`This request already has receipt ${existing.id}. Inspect it instead of reserving or resending.`
			);
		const callId = RESEARCH_PHASE + '-' + requestHash,
			approval = await reserveResearchCall({
				id: callId,
				label: profile.label,
				stage: 'equipment',
				units: profile.units
			});
		if (!approval.created)
			throw new Error('This diagnostic already has a reservation. Inspect its existing result.');
		const state: FixedInpaintRecord<P> = { version: 1, packet, callId };
		localStorage.setItem(profile.key, JSON.stringify(state));
		try {
			const job = await labQueue.enqueue(request, {
				label: approval.record.label,
				tag: LAB_TAG,
				activityScope: LAB_TAG
			});
			state.jobId = job.id;
			localStorage.setItem(profile.key, JSON.stringify(state));
			await recordResearchOutcome(callId, { status: 'accepted', jobIds: [job.id] });
			return state;
		} catch (e) {
			state.error = e instanceof Error ? e.message : String(e);
			localStorage.setItem(profile.key, JSON.stringify(state));
			await recordResearchOutcome(callId, { status: 'unknown', note: state.error });
			throw e;
		}
	});
}
export async function exportFixedInpaint<P = unknown>(key: string) {
	await reconcileResearchJobs();
	const probe = readFixedInpaint<P>(key),
		job = probe?.jobId ? await db.get<JobRec>('jobs', probe.jobId) : undefined;
	const images = await Promise.all(
		(job?.jobs.flatMap((j) => j.results) ?? []).map(async (result) => {
			const blob = await db.getBlob(result.sha);
			if (!blob) throw new Error('A diagnostic result image is missing.');
			return { ...result, png: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
		})
	);
	return {
		version: 1,
		probe,
		job,
		images,
		budget: readResearchBudget(),
		currentQueueState: probe?.jobId
			? get(labQueue).jobs.find((j) => j.id === probe.jobId)?.state
			: null
	};
}
