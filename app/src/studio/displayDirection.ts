import { getLocale, t, type WhisperKey } from 'svelte-whisper';
import type { DirectionName } from '../lib/rig/rig.ts';

const directionNames = {
	south: 'directionNames.south',
	'south-east': 'directionNames.southEast',
	east: 'directionNames.east',
	'north-east': 'directionNames.northEast',
	north: 'directionNames.north',
	'north-west': 'directionNames.northWest',
	west: 'directionNames.west',
	'south-west': 'directionNames.southWest'
} as const satisfies Record<DirectionName, WhisperKey>;

const directionShort = {
	south: 'directionShort.south',
	'south-east': 'directionShort.southEast',
	east: 'directionShort.east',
	'north-east': 'directionShort.northEast',
	north: 'directionShort.north',
	'north-west': 'directionShort.northWest',
	west: 'directionShort.west',
	'south-west': 'directionShort.southWest'
} as const satisfies Record<DirectionName, WhisperKey>;

export function displayDirection(id: DirectionName): string {
	return t(directionNames[id]);
}

export function displayDirectionShort(id: DirectionName): string {
	return t(directionShort[id]);
}

export function displayDirectionInSentence(id: DirectionName): string {
	return getLocale() === 'en' ? id : displayDirection(id);
}
