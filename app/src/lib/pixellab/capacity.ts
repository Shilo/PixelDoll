import type { Balance } from './routes.ts';

// Public /balance identifies the plan, but does not expose live free slots or custom account limits.
// Published tier ceilings: https://www.pixellab.ai/#pricing (verified 2026-10-22).
export function planCapacity(balance: Balance): { limit: number; plan: string | null } {
  const { status, plan } = balance.subscription ?? {};
  if (status === 'active' && /^Tier 3\s*:/i.test(plan ?? '')) return { limit: 20, plan: plan! };
  if (status === 'active' && /^Tier 2\s*:/i.test(plan ?? '')) return { limit: 10, plan: plan! };
  // Free, Tier 1, expired, enterprise and unknown plans have no verified public numeric ceiling.
  return { limit: 3, plan: null };
}

/** Reserve remote jobs, not HTTP requests. Studio submits animation directions separately. */
export function requestedSlots(endpoint: string, params: unknown): number {
  if (endpoint !== '/characters/animations' && endpoint !== '/animate-character') return 1;
  const b = params as { directions?: unknown; mode?: string; template_animation_id?: string } | null;
  return Array.isArray(b?.directions) && b.directions.length ? b.directions.length
    : b?.mode === 'skeleton-v3' || b?.template_animation_id ? 8 : 1;
}
