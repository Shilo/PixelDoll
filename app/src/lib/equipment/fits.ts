// Fit-draft records the Studio reads at startup (list, prune, resume). The paid fitting pipeline in fit.ts loads only when
// a stage was left running, so it stays out of the startup bundle.
import * as db from '../store/db.ts';
import { queue } from '../pixellab/queue.ts';
import { lazy } from '../lazy.ts';
import type { FitDraft } from './types.ts';

export const leader = () => { if (queue.role === 'follower') throw new Error('Continue this fit in the active generation tab, or close that tab first.'); };
export const listFits = async (): Promise<FitDraft[]> => (await db.all<FitDraft>('projects')).filter((r) => r?.kind === 'equipment-fit-draft' && r.stage !== 'discarded').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export async function clearFinishedFits(before = Infinity): Promise<void> {
  leader();
  for (const f of await db.all<FitDraft>('projects')) if (f.kind === 'equipment-fit-draft' && ['accepted', 'discarded'].includes(f.stage) && Date.parse(f.updatedAt) <= before) await db.del('projects', f.id);
}
export async function resumeFits(): Promise<void> {
  if (queue.role === 'follower') return;
  await clearFinishedFits(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const running = (await listFits()).filter((f) => f.stage === 'rest-running' || f.stage === 'pose-running');
  if (running.length) (await lazy(() => import('./fit.ts'))).resumeStages(running);
}
