import type { Balance } from '../../src/lib/pixellab/routes.ts'

/** Free account reads in request-safety tests must not consume the mocked paid response or POST counter. */
export const accountBalance: Balance = {
  credits: { type: 'usd', usd: 0 },
  subscription: { type: 'generations', status: 'active', plan: 'Tier 1: Pixel Artisan', generations: 1000, total: 1000 },
}
