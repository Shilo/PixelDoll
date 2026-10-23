import type { Balance, Req } from './routes.ts';

// EDIT ACCOUNT LIMITS HERE. Agent entry point: AGENTS.md → PixelLab plan policy.
// These are maintained plan defaults, NOT numeric limits returned by /balance.
export const PLAN_JOB_LIMITS = {
  freeTrial: 1,
  tier1: 8,
  tier2: 10,
  tier3Plus: 20,
  unknown: 3,
} as const;

/** Local tier 0 means Free/Trial; it is not an API enum. Unknown/enterprise stays unknown. */
export function accountTier(balance: Balance | null): number | null {
  const subscription = balance?.subscription;
  if (!subscription) return null;
  const status = subscription.status?.toLowerCase(), plan = subscription.plan?.trim() ?? '';
  if (['trial', 'none', 'expired'].includes(status ?? '')) return 0;
  if (status !== 'active' && status !== 'enterprise') return null;
  const tier = /^tier\s+(\d+)\b/i.exec(plan);
  if (tier) return Number(tier[1]);
  if (/^(free(?:\s*\/\s*trial)?|free\s+trial|trial)(?:\b|$)/i.test(plan)) return 0;
  return null;
}

export const FREE_PLAN_NOTICE = 'Your key is valid. Skeleton animation and inpainting need PixelLab Tier 1 or higher. You can still browse and import characters, dress up, recolour, export and use available tools. Buying credits alone does not unlock paid-plan tools.';

/** Only restrictions relevant to our current REST calls; see docs/pixellab-plans.md. */
export function requestTier(req: Pick<Req, 'method'> & { endpoint: string; params: unknown; minimumTier?: number; tag?: string }): number {
  if (req.method !== 'POST') return 0;
  let minimum = req.minimumTier ?? 0; // Whole workflows declare this before their FIRST paid call.
  // Retained pre-policy character workflows also need protection before their base drawing/registration is charged.
  if (['studio-base', 'studio-rig', 'studio-move', 'studio-setup'].includes(req.tag ?? '')) minimum = Math.max(minimum, 1);
  if (['/animate-with-skeleton-v3', '/animate-pixminimax', '/transfer-outfit-v2'].includes(req.endpoint)) minimum = Math.max(minimum, 1);
  const body = req.params as { mode?: string; inpainting_image?: { size?: { width?: number; height?: number } } } | null;
  if (['/characters/animations', '/animate-character'].includes(req.endpoint) && ['skeleton-v3', 'pixminimax'].includes(body?.mode ?? '')) minimum = Math.max(minimum, 1);
  if (req.endpoint === '/inpaint-v3') {
    const size = body?.inpainting_image?.size;
    minimum = Math.max(minimum, (size?.width ?? 0) > 256 || (size?.height ?? 0) > 256 ? 2 : 1);
  }
  return minimum;
}

export function planRestriction(balance: Balance | null, req: Parameters<typeof requestTier>[0]): string | null {
  const tier = accountTier(balance), minimum = requestTier(req);
  return tier !== null && tier < minimum ? `Needs PixelLab Tier ${minimum} or higher. No request sent.` : null;
}
