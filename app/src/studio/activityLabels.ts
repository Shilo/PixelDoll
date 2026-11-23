import { t } from 'svelte-whisper';
import type { JobRec } from '../lib/pixellab/queue.ts';
import { displayNestedMessage } from '../lib/i18n.ts';

/** A row's title: the localized one the request was made with, else its stored English label (older or untitled rows). */
export const jobLabel = ({ label, title }: Pick<JobRec, 'label' | 'title'>) =>
	title
		? displayNestedMessage(title)
		: /^skeleton sha256:.{8}/.test(label)
			? t('activity.findingJoints')
			: label.replace(/^M3 /, '');

export const jobStateText = (state: JobRec['state']) => t(`activity.state.${state}`);
