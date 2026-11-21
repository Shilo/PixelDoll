import { getLocale, t } from 'svelte-whisper';
import { displayNestedMessage } from './nestedMessage.ts';
import type { Message } from '../lib/message.ts';
import { directionLabel } from '../lib/rig/directions.ts';
import { DIRECTIONS, type DirectionName } from '../lib/rig/rig.ts';
import { displayDirection } from './displayDirection.ts';
import { displayMove } from './displayMove.ts';

export function formatList(names: readonly string[]): string {
	return new Intl.ListFormat(getLocale() || 'en', { type: 'unit', style: 'short' }).format(names);
}

export function displayDirectionList(ids: readonly DirectionName[]): string {
	return getLocale() === 'en'
		? ids.map(directionLabel).join(', ')
		: formatList(ids.map(displayDirection));
}

export function displayDirectionProblem(problem: Message | string): string {
	if (typeof problem === 'string' || !problem.vars || Array.isArray(problem.vars))
		return displayNestedMessage(problem);
	const vars = problem.vars as Record<string, unknown>;
	switch (problem.key) {
		case 'directionProblem.mirrorSource': {
			const source = vars.source as DirectionName;
			return t(problem.key, {
				source: DIRECTIONS.includes(source) ? displayDirection(source) : directionLabel(source),
				mirror: displayDirection(vars.mirror as DirectionName)
			});
		}
		case 'directionProblem.moveArtwork':
			return t(problem.key, {
				moves: formatList(
					(vars.moves as string[]).map((id) => displayMove(id, vars.moveIds as string[]))
				)
			});
		case 'directionProblem.equipmentArtwork':
			return t(problem.key, { items: formatList(vars.items as string[]) });
		default:
			return displayNestedMessage(problem);
	}
}
