// Development-only accounting for the owner's second research allowance. Historical ledgers stay separate.
export const RESEARCH_PHASE = 'workflow-reconciliation-v1';
export const RESEARCH_BUDGET_KEY = 'pixeldoll.motionLab.researchBudget.2026-11-01';
export const RESEARCH_PRIOR_UNITS = 998, RESEARCH_TOTAL_CAP = 2000, RESEARCH_PHASE_CAP = 1000, RESEARCH_PILOT_CAP = 200;
// One calibrated two-frame repair replaces premature replication. Total pilot stays 200.
export const RESEARCH_STAGE_CAPS = { body: 25, equipment: 175, replication: 0 } as const;
export type ResearchStage = keyof typeof RESEARCH_STAGE_CAPS;
export type ResearchStatus = 'reserved' | 'accepted' | 'completed' | 'failed' | 'unknown';
export interface ResearchCall { id: string; label: string; stage: ResearchStage; units: number; status: ResearchStatus; at: string; jobIds?: string[]; billedUnits?: number; note?: string }
export interface ResearchGate { passed: boolean; notes: string; evidence: string[] }
export interface ResearchBudget { version: 1; phase: typeof RESEARCH_PHASE; calls: ResearchCall[]; gates: Partial<Record<ResearchStage, ResearchGate>> }
const stages = Object.keys(RESEARCH_STAGE_CAPS) as ResearchStage[], statuses: ResearchStatus[] = ['reserved', 'accepted', 'completed', 'failed', 'unknown'];
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
function ticks(value: number, zero = false) {
  const n = Math.round(value * 1_000_000);
  if (!Number.isFinite(value) || !Number.isSafeInteger(n) || n < (zero ? 0 : 1) || Math.abs(value - n / 1_000_000) > Number.EPSILON * Math.max(1, value) * 4) throw new Error('Generation units must be finite, positive and have at most six decimal places.');
  return n;
}
const charged = (row: ResearchCall) => Math.max(ticks(row.units), ticks(row.billedUnits ?? 0, true));
export function readResearchBudget(): ResearchBudget {
  const saved = localStorage.getItem(RESEARCH_BUDGET_KEY);
  if (!saved) return { version: 1, phase: RESEARCH_PHASE, calls: [], gates: {} };
  let ledger: ResearchBudget;
  try { ledger = JSON.parse(saved); } catch { throw new Error('Research budget JSON is invalid. Inspect the saved record before paid work.'); }
  if (ledger?.version !== 1 || ledger.phase !== RESEARCH_PHASE || !Array.isArray(ledger.calls) || !ledger.gates || typeof ledger.gates !== 'object' || Array.isArray(ledger.gates)) throw new Error('Unsupported research budget. Inspect the saved record before paid work.');
  const ids = new Set<string>();
  for (const row of ledger.calls) {
    if (!row || !text(row.id) || !text(row.label) || !stages.includes(row.stage) || !statuses.includes(row.status) || !text(row.at) || ids.has(row.id) || (row.jobIds !== undefined && (!Array.isArray(row.jobIds) || !row.jobIds.every(text)))) throw new Error('Invalid research reservation. Inspect the saved record before paid work.');
    charged(row); ids.add(row.id);
  }
  for (const [stage, gate] of Object.entries(ledger.gates)) if (!stages.includes(stage as ResearchStage) || !gate || typeof gate.passed !== 'boolean' || !text(gate.notes) || !Array.isArray(gate.evidence) || !gate.evidence.length || !gate.evidence.every(text)) throw new Error('Invalid research qualification gate. Inspect the saved record before paid work.');
  return ledger;
}
export function researchBudgetUsage(ledger = readResearchBudget()) {
  const stageUnits = Object.fromEntries(stages.map(stage => [stage, ledger.calls.filter(row => row.stage === stage).reduce((sum, row) => sum + charged(row), 0) / 1_000_000])) as Record<ResearchStage, number>;
  const reservedUnits = ledger.calls.reduce((sum, row) => sum + charged(row), 0) / 1_000_000;
  return { reservedUnits, billedUnits: ledger.calls.reduce((sum, row) => sum + ticks(row.billedUnits ?? 0, true), 0) / 1_000_000, stageUnits, pilotRemaining: Math.max(0, RESEARCH_PILOT_CAP - reservedUnits), phaseRemaining: Math.max(0, RESEARCH_PHASE_CAP - reservedUnits) };
}
async function mutate<T>(change: (ledger: ResearchBudget) => T): Promise<T> {
  if (!navigator.locks) throw new Error('Safe research accounting requires browser Web Locks.');
  return navigator.locks.request(RESEARCH_BUDGET_KEY, () => {
    const ledger = readResearchBudget(), result = change(ledger);
    localStorage.setItem(RESEARCH_BUDGET_KEY, JSON.stringify(ledger)); return structuredClone(result);
  });
}
function checkGate(ledger: ResearchBudget, stage: ResearchStage) {
  if (stage !== 'body' && ledger.gates.body?.passed !== true) throw new Error('The body qualification gate must pass before this stage.');
  if (stage === 'replication' && ledger.gates.equipment?.passed !== true) throw new Error('The equipment qualification gate must pass before replication.');
}
/** Dispatch only when created is true. Existing IDs are evidence/resume records, never permission to resend. */
export async function reserveResearchCall(input: Pick<ResearchCall, 'id' | 'label' | 'stage' | 'units'>) {
  if (!text(input.id) || !text(input.label) || !stages.includes(input.stage)) throw new Error('A research request needs an ID, label and valid stage.');
  const amount = ticks(input.units);
  return mutate(ledger => {
    const old = ledger.calls.find(row => row.id === input.id);
    if (old) {
      if (old.stage !== input.stage || ticks(old.units) !== amount || old.label !== input.label) throw new Error('This research identity already belongs to a different reservation.');
      return { created: false, record: old };
    }
    checkGate(ledger, input.stage);
    const used = researchBudgetUsage(ledger), total = ticks(used.reservedUnits, true);
    if (stages.some(stage => ticks(used.stageUnits[stage], true) > ticks(RESEARCH_STAGE_CAPS[stage], true))) throw new Error('A billed stage exceeded its allocation. Further research spending is blocked.');
    if (total + amount > ticks(RESEARCH_PILOT_CAP) || total + amount > ticks(RESEARCH_PHASE_CAP) || ticks(RESEARCH_PRIOR_UNITS) + total + amount > ticks(RESEARCH_TOTAL_CAP)) throw new Error('The approved research pilot or phase allowance is exhausted.');
    if (ticks(used.stageUnits[input.stage], true) + amount > ticks(RESEARCH_STAGE_CAPS[input.stage], true)) throw new Error('The research stage allocation is exhausted.');
    const record: ResearchCall = { ...input, units: amount / 1_000_000, status: 'reserved', at: new Date().toISOString() };
    ledger.calls.push(record); return { created: true, record };
  });
}
export async function recordResearchOutcome(id: string, outcome: { status: Exclude<ResearchStatus, 'reserved'>; jobIds?: string[]; billedUnits?: number; note?: string }) {
  if (!statuses.slice(1).includes(outcome.status) || (outcome.jobIds !== undefined && (!Array.isArray(outcome.jobIds) || !outcome.jobIds.every(text))) || (outcome.note !== undefined && !text(outcome.note))) throw new Error('Invalid research outcome.');
  if (outcome.billedUnits !== undefined) ticks(outcome.billedUnits, true);
  return mutate(ledger => {
    const row = ledger.calls.find(item => item.id === id); if (!row) throw new Error('Research reservation is missing.');
    if ((row.status === 'completed' || row.status === 'failed') && row.status !== outcome.status) throw new Error('A final research outcome cannot be replaced.');
    row.status = outcome.status;
    if (outcome.jobIds) row.jobIds = [...new Set([...(row.jobIds ?? []), ...outcome.jobIds])];
    if (outcome.note) row.note = outcome.note;
    // Record an overrun instead of concealing it; every later reservation uses the higher amount.
    if (outcome.billedUnits !== undefined) row.billedUnits = Math.max(row.billedUnits ?? 0, outcome.billedUnits);
    return row;
  });
}
export async function recordResearchGate(stage: ResearchStage, gate: ResearchGate) {
  if (!stages.includes(stage) || typeof gate.passed !== 'boolean' || !text(gate.notes) || !Array.isArray(gate.evidence) || !gate.evidence.length || !gate.evidence.every(text)) throw new Error('A qualification gate needs a result, notes and explicit evidence references.');
  return mutate(ledger => {
    if (gate.passed) checkGate(ledger, stage);
    ledger.gates[stage] = structuredClone(gate);
    // A revised upstream review invalidates approvals tied to its earlier evidence.
    for (const later of stages.slice(stages.indexOf(stage) + 1)) delete ledger.gates[later];
    return ledger.gates[stage]!;
  });
}
