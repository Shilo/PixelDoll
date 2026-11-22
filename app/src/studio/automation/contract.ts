// The automation contract shared by every adapter: tool shape, input validation, agent-facing errors and the budget
// ledger. No browser or Studio dependencies, so it is unit tested directly.
import type { Evidence } from './evidence.ts';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface JsonSchema {
	type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
	description?: string;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
	enum?: readonly (string | number)[];
	minimum?: number;
	maximum?: number;
	maxLength?: number;
	maxItems?: number;
	additionalProperties?: boolean | JsonSchema;
}
export interface ToolResult {
	data: Json;
	/** Contact sheets of real frames; adapters deliver them as images. */
	images?: Evidence[];
}
export interface Tool {
	name: string;
	title: string;
	description: string;
	inputSchema: JsonSchema;
	/** Reads only: never changes the character, the library or the account. */
	readOnly?: boolean;
	/** Spends PixelLab generations, removes work, hands the user a file or changes what they see: the agent should hold a
	 *  clear instruction before calling it. */
	consequential?: boolean;
	/** Results repeat text from the library (names, prompts) that anyone could have written: data, never instructions. */
	untrusted?: boolean;
	/** Waits for the user or for running work: runs beside other calls instead of in the one-at-a-time line. */
	waits?: boolean;
	run(args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult>;
}

/** A refusal the agent can act on: what was wrong and what to do next. Never carries secrets. */
export class AgentError extends Error {
	constructor(
		message: string,
		readonly code:
			| 'invalid'
			| 'not_found'
			| 'not_ready'
			| 'needs_user'
			| 'budget'
			| 'busy'
			| 'canceled'
			| 'unsupported' = 'invalid'
	) {
		super(message);
	}
}

/** Shown for any failure that is not an AgentError: its raw text may carry request details, so it is logged, not returned. */
export const FAILED =
	'PixelDoll could not finish this call. Nothing paid was resent; check get_activity before trying again.';
export function failure(e: unknown): { error: string; code: AgentError['code'] | 'failed' } {
	if (e instanceof AgentError) return { error: e.message, code: e.code };
	console.error('PixelDoll agent tool', e);
	return { error: FAILED, code: 'failed' };
}

/** Runs tasks one at a time in call order, so two calls never interleave their reads and writes of the Studio. A task whose
 *  signal aborted while it waited is not run. */
export function serial() {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
		const run = tail.then(() => {
			if (signal?.aborted) throw new AgentError('The call was canceled before it ran.', 'canceled');
			return task();
		});
		tail = run.catch(() => undefined);
		return run;
	};
}

export type Answer = 'allowed' | 'denied' | 'timeout' | 'canceled';
/** Waits for a person's answer to a question `open` shows; `open` returns how to close it. The question closes when the
 *  caller aborts or after `ms`, so an agent that gave up never leaves a dialog behind that could still approve spending. */
export function answerWithin(
	open: (answer: (allowed: boolean) => void) => () => void,
	signal: AbortSignal,
	ms: number
): Promise<Answer> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve('canceled');
		let close: (() => void) | undefined,
			settled = false;
		const finish = (answer: Answer) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener('abort', onAbort);
			close?.();
			resolve(answer);
		};
		const onAbort = () => finish('canceled');
		const timer = setTimeout(() => finish('timeout'), ms);
		signal.addEventListener('abort', onAbort);
		close = open((allowed) => finish(allowed ? 'allowed' : 'denied'));
		if (settled) close(); // answered synchronously, before `close` existed
	});
}

/** A variant name a material can take: one it stores, a swatch, "#rrggbb", or "tint:" with a swatch or "#rrggbb". Own keys
 *  only: an inherited name such as "constructor" is never a variant or a swatch. */
export function knownVariant(
	variants: Record<string, unknown>,
	name: string,
	swatches: Record<string, unknown>
): boolean {
	if (Object.hasOwn(variants, name)) return true;
	const key = name.startsWith('tint:') ? name.slice(5) : name;
	return Object.hasOwn(swatches, key) || /^#[0-9a-f]{6}$/i.test(key);
}

/** What set_outfit changes, all checked before anything is applied: saved items by slot (null takes the slot off) and worn
 *  drafts by slot (null takes the draft off). */
export interface OutfitChange {
	items: Record<string, string | null>;
	drafts: Record<string, string | null>;
}
export function planOutfit(o: {
	slots: readonly string[];
	baseSlot: string;
	items: readonly { id: string; slot: string }[];
	drafts: readonly { id: string; slot: string }[];
	wear: readonly string[];
	takeOff: readonly string[];
}): OutfitChange {
	const change: OutfitChange = { items: {}, drafts: {} },
		claimed = new Map<string, string>();
	const claim = (slot: string, by: string) => {
		const other = claimed.get(slot);
		if (other !== undefined && other !== by)
			throw new AgentError(`"${other}" and "${by}" both use slot "${slot}"; pick one.`);
		claimed.set(slot, by);
	};
	for (const slot of o.takeOff) {
		if (!o.slots.includes(slot)) throw new AgentError(`No slot "${slot}".`, 'not_found');
		if (slot === o.baseSlot) throw new AgentError('The base body cannot be taken off.');
		claim(slot, `takeOff ${slot}`);
		change.items[slot] = null;
		change.drafts[slot] = null;
	}
	for (const id of o.wear) {
		const draft = o.drafts.find((d) => d.id === id);
		const item = draft ? undefined : o.items.find((it) => it.id === id);
		if (!draft && !item)
			throw new AgentError(`No item or draft "${id}" on this character.`, 'not_found');
		const slot = (draft ?? item)!.slot;
		claim(slot, id);
		if (draft) change.drafts[slot] = id;
		else {
			change.items[slot] = id;
			change.drafts[slot] = null;
		}
	}
	return change;
}

/** Checks agent input against the tool's schema: an agent's arguments are never trusted. */
export function validate(schema: JsonSchema, value: unknown, path = 'input'): void {
	const fail = (why: string) => {
		throw new AgentError(`${path} ${why}`);
	};
	switch (schema.type) {
		case 'object': {
			if (typeof value !== 'object' || value === null || Array.isArray(value))
				fail('must be an object');
			const record = value as Record<string, unknown>;
			for (const key of schema.required ?? [])
				if (record[key] === undefined) fail(`needs "${key}"`);
			for (const [key, v] of Object.entries(record)) {
				if (v === undefined) continue;
				const property = schema.properties?.[key];
				if (property) validate(property, v, `${path}.${key}`);
				else if (typeof schema.additionalProperties === 'object')
					validate(schema.additionalProperties, v, `${path}.${key}`);
				else if (schema.additionalProperties !== true) fail(`has unknown property "${key}"`);
			}
			return;
		}
		case 'array':
			if (!Array.isArray(value)) fail('must be an array');
			if (schema.maxItems !== undefined && (value as unknown[]).length > schema.maxItems)
				fail(`may have at most ${schema.maxItems} entries`);
			(value as unknown[]).forEach(
				(v, i) => schema.items && validate(schema.items, v, `${path}[${i}]`)
			);
			return;
		case 'string':
			if (typeof value !== 'string') fail('must be a string');
			if (schema.maxLength !== undefined && (value as string).length > schema.maxLength)
				fail(`may be at most ${schema.maxLength} characters`);
			break;
		case 'boolean':
			if (typeof value !== 'boolean') fail('must be true or false');
			return;
		case 'number':
		case 'integer':
			if (typeof value !== 'number' || !Number.isFinite(value)) fail('must be a number');
			if (schema.type === 'integer' && !Number.isInteger(value)) fail('must be a whole number');
			if (schema.minimum !== undefined && (value as number) < schema.minimum)
				fail(`must be at least ${schema.minimum}`);
			if (schema.maximum !== undefined && (value as number) > schema.maximum)
				fail(`must be at most ${schema.maximum}`);
			break;
	}
	if (schema.enum && !schema.enum.includes(value as string | number))
		fail(`must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
}

/** Largest single approval; a larger task asks again when this runs out. */
export const MAX_BUDGET = 500;

/** Denied budget requests per page before request_budget stops asking: the person said no, so the agent asks in chat. */
export const MAX_DENIALS = 2;

export type BudgetState = {
	approved: number;
	reserved: number;
	remaining: number;
	/** What each reservation was for, oldest first. */
	spends: { what: string; generations: number }[];
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Generations the person approved for agent work, and what paid starts reserved from them. A start reserves its full
 *  estimate (the most it can cost) before anything is sent, so the total can never pass what was approved. */
export class BudgetLedger {
	#approved = 0;
	#spends: { what: string; generations: number }[] = [];
	#asking = false;
	#denials = 0;
	get reserved() {
		return round(this.#spends.reduce((n, s) => n + s.generations, 0));
	}
	snapshot(): BudgetState {
		const reserved = this.reserved;
		return {
			approved: this.#approved,
			reserved,
			remaining: round(this.#approved - reserved),
			spends: this.#spends.map((s) => ({ ...s }))
		};
	}
	approve(generations: number) {
		if (!(generations > 0) || generations > MAX_BUDGET) throw new RangeError('invalid approval');
		this.#approved = round(this.#approved + generations);
	}
	/** False, reserving nothing, when the remaining approval cannot cover it. */
	reserve(what: string, generations: number): boolean {
		if (!(generations >= 0) || generations > this.snapshot().remaining + 1e-9) return false;
		this.#spends.push({ what, generations });
		return true;
	}
	/** Asks the person for more generations with the question `open` shows (see answerWithin), one question at a time and
	 *  none after MAX_DENIALS refusals: then the agent must ask in chat instead of pressing the dialog on them. */
	async request(
		generations: number,
		open: (answer: (allowed: boolean) => void) => () => void,
		signal: AbortSignal,
		ms: number
	): Promise<Answer> {
		if (!(generations > 0) || generations > MAX_BUDGET) throw new RangeError('invalid request');
		if (this.#asking)
			throw new AgentError('A budget request is already waiting for the user in the page.', 'busy');
		if (this.#denials >= MAX_DENIALS)
			throw new AgentError(
				'The user declined the budget twice in this page. Ask them in chat what they want before trying again.',
				'needs_user'
			);
		this.#asking = true;
		try {
			const answer = await answerWithin(open, signal, ms);
			if (answer === 'allowed') this.approve(generations);
			if (answer === 'denied') this.#denials++;
			return answer;
		} finally {
			this.#asking = false;
		}
	}
	/** The person ended the agent's budget: what was reserved stays reserved (it may already be spent), nothing more. */
	end() {
		this.#approved = this.reserved;
	}
	/** A different PixelLab account (or none): the old approval was for someone else's generations. */
	clear() {
		this.#approved = 0;
		this.#spends = [];
	}
	/** Return a reservation whose request was never sent (the start was refused before any call). */
	release(what: string, generations: number) {
		const i = this.#spends.findLastIndex((s) => s.what === what && s.generations === generations);
		if (i >= 0) this.#spends.splice(i, 1);
	}
}
