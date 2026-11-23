import { t } from 'svelte-whisper';
import { moveLabel, moveName, type MoveRef } from './model.ts';

/** The move's name in the active language: a name the user gave it stays as typed. */
export function displayMove(id: string, moves: readonly MoveRef[] = []): string {
	const label = moveLabel(id, moves);
	const named = moves.some(
		(move) => typeof move !== 'string' && move.id === id && move.name !== undefined
	);
	if (
		!named &&
		id === 'standing' &&
		moves.some((move) => (typeof move === 'string' ? move : move.id) === 'default') &&
		label === moveLabel(id)
	)
		return `${label} (${id})`;
	const name = moveName(id, moves);
	return typeof name === 'string' ? name : t(name.key);
}
