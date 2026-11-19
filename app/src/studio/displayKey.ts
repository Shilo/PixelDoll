import { t, type WhisperKey } from 'svelte-whisper';
import type { Route } from '../lib/items/items.ts';

const keyText = {
	green: 'genCard.key.green',
	magenta: 'genCard.key.magenta',
	blue: 'genCard.key.blue',
	azure: 'genCard.key.azure',
	none: 'apiPeek.fields.none'
} as const satisfies Record<Route, WhisperKey>;

export const displayKey = (key: Route): string => t(keyText[key]);
