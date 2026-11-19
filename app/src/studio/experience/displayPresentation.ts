import { getLocale, t } from 'svelte-whisper';
import { directionLabel } from '../../lib/rig/directions.ts';
import { DIRECTIONS, type DirectionName } from '../../lib/rig/rig.ts';
import { displayDirection, displayDirectionInSentence } from '../displayDirection.ts';
import { displayMove } from '../displayMove.ts';
import type { PresentationNotice, RenderedPresentation } from './presentation.ts';

// Pending keys come from saved drafts, so an unknown direction keeps its raw label instead of breaking the frame.
const direction = (id: DirectionName) =>
	DIRECTIONS.includes(id) ? displayDirection(id) : directionLabel(id);

/** A world notice in the active language; raw diagnostics stay as written. */
export function displayPresentationNotice(notice: PresentationNotice): string {
	switch (notice.kind) {
		case 'missing-move': {
			const move = displayMove(notice.move),
				fallback = notice.fallback;
			return fallback.kind === 'nothing'
				? t('worldStage.notice.noMoveNothing', { move })
				: fallback.kind === 'still'
					? t('worldStage.notice.noMoveStill', { move })
					: t('worldStage.notice.noMovePlays', { move, fallback: displayMove(fallback.move) });
		}
		case 'missing-direction': {
			const move = displayMove(notice.move),
				facing = displayDirectionInSentence(notice.direction),
				fallback = notice.fallback;
			return fallback.kind === 'nothing'
				? t('worldStage.notice.noFramesNothing', { move, direction: facing })
				: fallback.kind === 'still'
					? t('worldStage.notice.noFramesStill', { move, direction: facing })
					: fallback.kind === 'move'
						? t('worldStage.notice.noFramesPlays', {
								move,
								direction: facing,
								fallback: displayMove(fallback.move)
							})
						: t('worldStage.notice.noFramesFaces', {
								move,
								direction: facing,
								fallback: displayDirectionInSentence(fallback.direction)
							});
		}
		case 'undeclared-direction':
			return t('worldStage.notice.undeclaredDirection');
		case 'hidden-items':
			return notice.direction
				? t('worldStage.notice.hiddenItems', {
						count: notice.count,
						move: displayMove(notice.move),
						direction: displayDirection(notice.direction)
					})
				: t('worldStage.notice.hiddenItemsInMove', {
						count: notice.count,
						move: displayMove(notice.move)
					});
		case 'diagnostic':
			return notice.text;
	}
}

/** Worn drafts still generating this view, one phrase per item. */
export function displayLoadingItems(loading: RenderedPresentation['loadingItems']): string[] {
	return loading.map(({ name, directions }) =>
		t('worldStage.notice.itemLoading', {
			item: name,
			directions: new Intl.ListFormat(getLocale() || 'en', { type: 'unit', style: 'short' }).format(
				directions.map(direction)
			)
		})
	);
}
