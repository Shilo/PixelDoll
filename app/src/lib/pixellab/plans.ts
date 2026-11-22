import type { Balance, Req } from './routes.ts';
import { LocalizedError } from '../message.ts';

// EDIT ACCOUNT LIMITS HERE. Agent entry point: AGENTS.md → PixelLab plan policy.
// These are maintained plan defaults, NOT numeric limits returned by /balance.
export const PLAN_JOB_LIMITS = {
	freeTrial: 1,
	tier1: 8,
	tier2: 10,
	tier3Plus: 20,
	unknown: 3
} as const;

/** Published monthly prices (USD) and generation allowances per tier, for cost estimates only; /balance reports neither.
 *  `low` is the lowest advertised discounted price. Sources and date: docs/pixellab-plans.md. */
export const PLAN_PRICES = {
	1: { low: 9, list: 12, generations: 2000 },
	2: { low: 22, list: 24, generations: 5000 },
	3: { low: 50, list: 50, generations: 10000 }
} as const;
export type PricedTier = keyof typeof PLAN_PRICES;

export const INPAINT_TIER_ONE_SIDE = 256;

/** Local tier 0 means Free/Trial; it is not an API enum. Unknown/enterprise stays unknown. */
export function accountTier(balance: Balance | null): number | null {
	const subscription = balance?.subscription;
	if (!subscription) return null;
	const status = subscription.status?.toLowerCase(),
		plan = subscription.plan?.trim() ?? '';
	if (['trial', 'none', 'expired'].includes(status ?? '')) return 0;
	if (status !== 'active' && status !== 'enterprise') return null;
	const tier = /^tier\s+(\d+)\b/i.exec(plan);
	if (tier) return Number(tier[1]);
	if (/^(free(?:\s*\/\s*trial)?|free\s+trial|trial)(?:\b|$)/i.test(plan)) return 0;
	return null;
}

export const GENERATION_RECOMMENDATION = {
	tier: 1,
	reason:
		'Free/Trial generations may have daily limits and limited availability during high demand. Review the estimated cost before continuing.'
} as const;

export const ENDPOINT_MINIMUM_TIERS: Readonly<Record<string, number>> = {
	'/edit-animation-v2': 1,
	'/edit-images-v2': 1,
	'/transfer-outfit-v2': 1,
	'/inpaint-v3': 1
};

export function inpaintTier(width: number, height: number): number {
	return Math.max(width, height) > INPAINT_TIER_ONE_SIDE ? 2 : 1;
}

export interface TierNeed {
	required: number;
	recommended?: number;
}

export type TierDecision =
	{ kind: 'ok' } | { kind: 'required' | 'recommended'; current: number; tier: number };

export function tierDecision(balance: Balance | null, need: TierNeed): TierDecision {
	const current = accountTier(balance);
	if (current === null) return { kind: 'ok' };
	if (current < need.required) return { kind: 'required', current, tier: need.required };
	const recommended = Math.max(need.required, need.recommended ?? need.required);
	return current < recommended
		? { kind: 'recommended', current, tier: recommended }
		: { kind: 'ok' };
}

/** Only restrictions relevant to our current REST calls; see docs/pixellab-plans.md. */
export function requestTier(
	req: Pick<Req, 'method'> & {
		endpoint: string;
		params: unknown;
		minimumTier?: number;
		tag?: string;
	}
): number {
	if (req.method !== 'POST') return 0;
	let minimum = Math.max(req.minimumTier ?? 0, ENDPOINT_MINIMUM_TIERS[req.endpoint] ?? 0);
	const body = req.params as {
		inpainting_image?: { size?: { width?: number; height?: number } };
	} | null;
	if (req.endpoint === '/inpaint-v3') {
		const size = body?.inpainting_image?.size;
		minimum = Math.max(minimum, inpaintTier(size?.width ?? 0, size?.height ?? 0));
	}
	return minimum;
}

export function workflowTier(requests: readonly Parameters<typeof requestTier>[0][]): number {
	return requests.reduce((minimum, request) => Math.max(minimum, requestTier(request)), 0);
}

export function planRestriction(
	balance: Balance | null,
	req: Parameters<typeof requestTier>[0]
): string | null {
	const decision = tierDecision(balance, { required: requestTier(req) });
	return decision.kind === 'required'
		? `Needs PixelLab Tier ${decision.tier} or higher. No request sent.`
		: null;
}

export function localizedPlanRestriction(raw: string): LocalizedError | undefined {
	const match = /^Needs PixelLab Tier (\d+) or higher\. No request sent\.$/.exec(raw);
	return match
		? new LocalizedError(raw, 'activity.planWait.tier', { tier: Number(match[1]) })
		: undefined;
}
