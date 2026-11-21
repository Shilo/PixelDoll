import { t, type WhisperKey } from 'svelte-whisper';
import { moveLabel, type MoveRef } from './model.ts';

const labels: Readonly<Record<string, WhisperKey>> = {
	default: 'moveNames.default',
	idle: 'moveNames.idle',
	walk: 'moveNames.walk'
};

/** The move's name in the active language: a name the user gave it stays as typed. */
export function displayMove(id: string, moves: readonly MoveRef[] = []): string {
	const label = moveLabel(id, moves);
	const named = moves.some(
		(move) => typeof move !== 'string' && move.id === id && move.name !== undefined
	);
	return !named && Object.hasOwn(labels, id) && label === moveLabel(id) ? t(labels[id]) : label;
}
