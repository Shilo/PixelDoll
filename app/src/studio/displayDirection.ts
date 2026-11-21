import { getLocale, t } from 'svelte-whisper';
import type { DirectionName } from '../lib/rig/rig.ts';
import { directionNames, directionShort } from './directionKeys.ts';

export function displayDirection(id: DirectionName): string {
	return t(directionNames[id]);
}

export function displayDirectionShort(id: DirectionName): string {
	return t(directionShort[id]);
}

export function displayDirectionInSentence(id: DirectionName): string {
	return getLocale() === 'en' ? id : displayDirection(id);
}
