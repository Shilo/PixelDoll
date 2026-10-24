// Regression repair evidence. Never recapture a historical baseline from a changed runtime.
import { captureEvidence } from './capture-evidence.mjs';
const phase = process.argv[2];
await captureEvidence({
  phase, root: new URL('./evidence/regression-repair/', import.meta.url),
  runtimeTheme: './bronze-theme.css',
  labels: ['Before · reported prototype', 'After · repaired prototype'],
  protectExisting: phase === 'before', supplements: phase === 'after',
  provenance: { experiment: 'regression-repair', description: phase === 'before' ? 'Reported package consumer before repair' : 'Repaired package consumer; compare preserved 003bef2 baseline separately in regression-review.html' },
});
if (phase === 'after') await import('./build-regression-review.mjs');
