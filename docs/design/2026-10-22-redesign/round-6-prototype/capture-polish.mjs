// Keep this follow-up's evidence separate from the preserved dependency migration.
import { captureEvidence } from './capture-evidence.mjs';
const phase = process.argv[2];
await captureEvidence({
  phase, root: new URL('./evidence/polish/', import.meta.url),
  runtimeTheme: './bronze-theme.css',
  labels: ['Before · follow-up review', 'After · composition and interaction polish'],
  protectExisting: true, supplements: phase === 'after',
  provenance: { experiment: 'composition-polish', baseline: '878321aeb8653871c4a0f8990e52a53048e091c9' },
});
