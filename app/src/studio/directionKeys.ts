// Catalog keys of direction names, free of the i18n runtime so non-UI modules can name a direction in a Message.
import type { WhisperKey } from 'svelte-whisper';
import type { DirectionName } from '../lib/rig/rig.ts';

export const directionNames = {
	south: 'directionNames.south',
	'south-east': 'directionNames.southEast',
	east: 'directionNames.east',
	'north-east': 'directionNames.northEast',
	north: 'directionNames.north',
	'north-west': 'directionNames.northWest',
	west: 'directionNames.west',
	'south-west': 'directionNames.southWest'
} as const satisfies Record<DirectionName, WhisperKey>;

/** Direction names inside a sentence ("no south view"): lowercase where the language does not capitalize them. */
export const directionInline = {
	south: 'directionInline.south',
	'south-east': 'directionInline.southEast',
	east: 'directionInline.east',
	'north-east': 'directionInline.northEast',
	north: 'directionInline.north',
	'north-west': 'directionInline.northWest',
	west: 'directionInline.west',
	'south-west': 'directionInline.southWest'
} as const satisfies Record<DirectionName, WhisperKey>;

export const directionShort = {
	south: 'directionShort.south',
	'south-east': 'directionShort.southEast',
	east: 'directionShort.east',
	'north-east': 'directionShort.northEast',
	north: 'directionShort.north',
	'north-west': 'directionShort.northWest',
	west: 'directionShort.west',
	'south-west': 'directionShort.southWest'
} as const satisfies Record<DirectionName, WhisperKey>;
