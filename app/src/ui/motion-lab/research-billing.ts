import type { Job } from '../../lib/pixellab/routes.ts';

/** Known reported charges do not establish a final bill until every job is terminal and explicitly charged. */
export function summarizeResearchBilling(jobs: Pick<Job, 'id' | 'status' | 'usage'>[]): { status: 'accepted' | 'completed' | 'failed'; billedUnits: number; note: string } {
  if (!Array.isArray(jobs) || !jobs.length) throw new Error('Research billing needs at least one job record.');
  const ids = new Set<string>();
  let billedUnits = 0, missing = 0, pending = 0, failed = 0;
  for (const job of jobs) {
    if (!job || typeof job.id !== 'string' || !job.id.trim() || ids.has(job.id) || typeof job.status !== 'string' || !job.status.trim()) throw new Error('Research billing needs distinct job IDs and explicit statuses.');
    ids.add(job.id);
    if (job.status === 'failed') failed++;
    else if (job.status !== 'completed') pending++;
    const usage = job.usage;
    if (usage && usage.type !== 'generations' && usage.type !== 'usd') throw new Error(`Job ${job.id} returned an unsupported usage type.`);
    if (usage?.generations !== undefined && usage.generations !== null && (typeof usage.generations !== 'number' || !Number.isFinite(usage.generations) || usage.generations < 0)) throw new Error(`Job ${job.id} returned an invalid generation charge.`);
    if (usage?.type !== 'generations' || usage.generations === undefined || usage.generations === null) { missing++; continue; }
    billedUnits += usage.generations;
    if (!Number.isFinite(billedUnits)) throw new Error('Reported research generation charges exceed the supported numeric range.');
  }
  if (pending || missing) return { status: 'accepted', billedUnits, note: `Billing is not settled: ${pending} nonterminal job(s), ${missing} job(s) without an explicit generation charge. ${billedUnits} units are known reported charges only; retain the reservation.` };
  return { status: failed ? 'failed' : 'completed', billedUnits, note: `Billing is settled for all ${jobs.length} terminal jobs with explicit generation charges; ${failed} failed.` };
}
