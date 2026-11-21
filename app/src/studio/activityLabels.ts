import { t } from 'svelte-whisper';
import type { JobRec } from '../lib/pixellab/queue.ts';

export const jobLabel = ({ label }: JobRec) =>
	/^skeleton sha256:.{8}/.test(label) ? t('activity.findingJoints') : label.replace(/^M3 /, '');

export const jobStateText = (state: JobRec['state']) => t(`activity.state.${state}`);
