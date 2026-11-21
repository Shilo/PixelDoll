// Paid output is never thrown away. A step that stops after PixelLab returned results says which step stopped and why, so a
// review can show what was bought, reuse it through the queue's request cache and price only what is still missing.
import type { WhisperKey, WhisperVars } from 'svelte-whisper';
import { LocalizedError, type Message } from '../message.ts';
import { sanitizeActivityValue } from './activity.ts';
import { frameOrder } from './routes.ts';
import type { JobRec } from './queue.ts';
import type { ZipEntry } from '../store/zip.ts';
import type { Img } from '../image/png.ts';

/** Why a step stopped on completed paid output. `stopped`: the request itself ended without results and replays as such. */
export type PaidFailure =
	'overflow' | 'frame-count' | 'empty' | 'dropped' | 'joints' | 'stopped' | 'misaligned';
export interface PaidStep {
	/** Flow-defined step, such as `motion` or `render`. */
	step: string;
	failure: PaidFailure;
	/** The completed record whose output the step rejected. */
	recordId?: string;
	/** The planned price of buying only this step again. */
	gens?: number;
}
export class PaidStepError extends LocalizedError {
	constructor(
		english: string,
		key: WhisperKey,
		vars: WhisperVars | undefined,
		readonly paid: PaidStep
	) {
		super(english, key, vars);
	}
}

/** Every way on a review can offer. `enlarge-frame` is Make room and continue: Adjust frame first, then the same move. */
export type PaidOptionId =
	| 'resume'
	| 'lift'
	| 'reroll'
	| 'register'
	| 'reroll-calls'
	| 'keep-finished'
	| 'reroll-batch'
	| 'enlarge-frame';
/** One choice of a review, priced from the request cache: `gens` is 0 when everything it needs is already paid for. */
export interface PaidOption {
	id: PaidOptionId;
	label: Message;
	detail?: Message;
	gens: number;
	primary?: boolean;
	/** The option sends at least one request: it needs a connected key and the plan tier the flow already checks. */
	paid: boolean;
}
/** Labels are messages (variables may be messages or lists of them) so modules without the i18n runtime can build a review. */
export interface PaidView {
	label: Message;
	frames: { img: Img; label: Message }[];
	notes: (Message | string)[];
	state: 'ready' | 'pending' | 'failed';
}
export interface PaidReview {
	views: PaidView[];
	/** Reported generations of the completed records this attempt used. */
	spent: number;
	recordIds: string[];
	options: PaidOption[];
}

export const spentGens = (records: readonly Pick<JobRec, 'gens'>[]) =>
	+records.reduce((sum, r) => sum + (r.gens || 0), 0).toFixed(2);

const fileSafe = (value: string) => value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');

/** ZIP entries of the results PixelLab returned (as stored) plus the sanitized requests that bought them; never the key. */
export async function paidResultsZip(
	records: readonly JobRec[],
	read: (sha: string) => Promise<Blob | undefined>
): Promise<ZipEntry[]> {
	const entries: ZipEntry[] = [],
		requests: unknown[] = [];
	for (const [index, r] of records.entries()) {
		const folder = `${String(index + 1).padStart(2, '0')}-${fileSafe(r.endpoint) || 'request'}`;
		const files: { label: string; file: string }[] = [];
		for (const result of r.jobs.flatMap((job) => job.results).sort(frameOrder)) {
			const blob = await read(result.sha);
			if (!blob) continue;
			const file = `${folder}/${fileSafe(result.label) || 'result'}.png`;
			entries.push({ name: file, data: new Uint8Array(await blob.arrayBuffer()) });
			files.push({ label: result.label, file });
		}
		requests.push({
			id: r.id,
			label: r.label,
			method: r.method,
			endpoint: r.endpoint,
			params: r.params,
			state: r.state,
			createdAt: new Date(r.createdAt).toISOString(),
			gens: r.gens,
			usd: r.usd,
			...(r.costUnknown ? { costUnknown: true } : {}),
			...(r.error ? { error: r.error } : {}),
			response: r.response,
			results: files
		});
	}
	entries.push({
		name: 'requests.json',
		data: new TextEncoder().encode(
			JSON.stringify(
				sanitizeActivityValue({ format: 'pixeldoll-paid-results/1', requests }),
				null,
				2
			)
		)
	});
	return entries;
}
