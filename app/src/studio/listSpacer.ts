import { watchSizes } from './watchSizes.ts';
// Room under a scroll list's last section so scrolling to it can bring it to the top, and no further: the list's own
// bottom padding already adds space below the spacer.
export function watchListSpacer(
	list: HTMLElement,
	last: HTMLElement,
	set: (height: number) => void
): () => void {
	return watchSizes([list, last], () =>
		set(
			Math.max(
				0,
				list.clientHeight - last.offsetHeight - parseFloat(getComputedStyle(list).paddingBottom)
			)
		)
	);
}
