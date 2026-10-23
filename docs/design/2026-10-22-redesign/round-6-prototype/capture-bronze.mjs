// Historical dependency experiment. Existing evidence is preserved; capture only a missing phase.
import { captureEvidence } from './capture-evidence.mjs';
const phase = process.argv[2];
await captureEvidence({
  phase, root: new URL('./evidence/bronze-dependency/', import.meta.url),
  runtimeTheme: phase === 'before' ? './glass-theme.css' : './bronze-theme.css',
  labels: ['Before · approved GlassKit prototype', 'After · @shilo/bronze-ui'],
  protectExisting: true,
  provenance: { experiment: 'bronze-dependency', description: 'Historical dependency integration experiment' },
});
