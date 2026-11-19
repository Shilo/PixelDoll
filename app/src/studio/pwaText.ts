import { t } from 'svelte-whisper';
import type { PwaError } from '../lib/pwa.ts';
import { displayNestedMessage } from './nestedMessage.ts';

/** A list holds the failures of one update check, which resumes by itself. */
export function displayPwaError(error: PwaError): string {
	return Array.isArray(error)
		? [...error.map(displayNestedMessage), t('pwa.checksResume')].join(' ')
		: displayNestedMessage(error);
}
