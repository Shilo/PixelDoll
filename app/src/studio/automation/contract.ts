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
	/** Spends PixelLab generations or removes work: the agent should hold a clear instruction before calling it. */
	consequential?: boolean;
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
			| 'unsupported' = 'invalid'
	) {
		super(message);
	}
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
	/** Return a reservation whose request was never sent (the start was refused before any call). */
	release(what: string, generations: number) {
		const i = this.#spends.findLastIndex((s) => s.what === what && s.generations === generations);
		if (i >= 0) this.#spends.splice(i, 1);
	}
}
