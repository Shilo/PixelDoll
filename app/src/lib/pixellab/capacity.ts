import type { Balance } from './routes.ts';
import { accountTier, PLAN_JOB_LIMITS } from './plans.ts';

// Numeric defaults live in plans.ts. /balance reports identity, not a numeric concurrency limit.
export function planCapacity(balance: Balance): { limit: number; plan: string | null } {
  const tier = accountTier(balance);
  const limit = tier === null ? PLAN_JOB_LIMITS.unknown : tier >= 3 ? PLAN_JOB_LIMITS.tier3Plus
    : tier === 2 ? PLAN_JOB_LIMITS.tier2 : tier === 1 ? PLAN_JOB_LIMITS.tier1 : PLAN_JOB_LIMITS.freeTrial;
  return { limit, plan: tier === null ? null : tier === 0 ? 'Free / Trial' : balance.subscription.plan! };
}

/** Reserve remote jobs, not HTTP requests. Studio submits animation directions separately. */
export function requestedSlots(endpoint: string, params: unknown): number {
  if (endpoint !== '/characters/animations' && endpoint !== '/animate-character') return 1;
  const b = params as { directions?: unknown; mode?: string; template_animation_id?: string } | null;
  return Array.isArray(b?.directions) && b.directions.length ? b.directions.length
    : b?.mode === 'skeleton-v3' || b?.template_animation_id ? 8 : 1;
}
