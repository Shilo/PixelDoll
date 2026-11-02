import { expect, test } from 'vitest';
import type { Job, Usage } from '../../src/lib/pixellab/routes.ts';
import { summarizeResearchBilling } from '../../src/ui/motion-lab/research-billing.ts';

const job = (id: string, status: string, generations?: number): Pick<Job, 'id' | 'status' | 'usage'> => ({ id, status, ...(generations === undefined ? {} : { usage: { type: 'generations', generations } }) });

test('partial failed and pending jobs retain every explicit charge without finalizing billing', () => {
  expect(summarizeResearchBilling([job('failed', 'failed', 2), job('pending', 'processing', 1)])).toMatchObject({ status: 'accepted', billedUnits: 3, note: expect.stringContaining('not settled') });
});

test('terminal jobs without explicit generation usage remain unsettled rather than claiming zero cost', () => {
  const partial = summarizeResearchBilling([job('done', 'completed', 3), job('missing', 'completed')]);
  expect(partial).toMatchObject({ status: 'accepted', billedUnits: 3 });
  expect(partial.note).toContain('1 job(s) without an explicit generation charge');
  expect(partial.note).toContain('known reported charges only');
  const absent = summarizeResearchBilling([job('unreported', 'failed')]);
  expect(absent.status).toBe('accepted'); expect(absent.billedUnits).toBe(0); expect(absent.note).toContain('retain the reservation');
});

test('completed jobs finalize their explicit generation charges, including fractional and zero bills', () => {
  expect(summarizeResearchBilling([job('import', 'completed', 0.25), job('clip', 'completed', 3), job('free', 'completed', 0)])).toEqual({ status: 'completed', billedUnits: 3.25, note: 'Billing is settled for all 3 terminal jobs with explicit generation charges; 0 failed.' });
});

test('a failed terminal job finalizes only when every terminal job has an explicit bill', () => {
  expect(summarizeResearchBilling([job('done', 'completed', 3), job('failed', 'failed', 1)])).toEqual({ status: 'failed', billedUnits: 4, note: 'Billing is settled for all 2 terminal jobs with explicit generation charges; 1 failed.' });
  expect(summarizeResearchBilling([job('done', 'completed', 3), job('failed', 'failed')]).status).toBe('accepted');
});

test.each([-1, NaN, Infinity, -Infinity, '3'])('invalid generation charge %s is surfaced instead of converted to zero', value => {
  const invalid = { ...job('invalid', 'completed'), usage: { type: 'generations', generations: value } as Usage };
  expect(() => summarizeResearchBilling([invalid])).toThrow('invalid generation charge');
});

test('USD usage does not establish a generation charge and invalid usage types are rejected', () => {
  expect(summarizeResearchBilling([{ ...job('usd', 'completed'), usage: { type: 'usd', usd: 0.1 } }])).toMatchObject({ status: 'accepted', billedUnits: 0, note: expect.stringContaining('not settled') });
  expect(() => summarizeResearchBilling([{ ...job('invalid-mixed', 'completed'), usage: { type: 'usd', usd: 0.1, generations: -1 } }])).toThrow('invalid generation charge');
  expect(() => summarizeResearchBilling([{ ...job('wrong', 'completed'), usage: { type: 'unexpected' } as unknown as Usage }])).toThrow('unsupported usage type');
});

test('empty records and duplicate or absent job IDs cannot silently omit or double-count charges', () => {
  expect(() => summarizeResearchBilling([])).toThrow('at least one job');
  expect(() => summarizeResearchBilling([job('', 'completed', 3)])).toThrow('distinct job IDs');
  expect(() => summarizeResearchBilling([job('same', 'completed', 3), job('same', 'completed', 3)])).toThrow('distinct job IDs');
});
