// Room under a scroll list's last section so scrolling to it can bring it to the top, and no further: the list's own
// bottom padding already adds space below the spacer.
export function watchListSpacer(
	list: HTMLElement,
	last: HTMLElement,
	set: (height: number) => void
): () => void {
	const size = () =>
		set(
			Math.max(
				0,
				list.clientHeight - last.offsetHeight - parseFloat(getComputedStyle(list).paddingBottom)
			)
		);
	size();
	const observer = new ResizeObserver(size);
	observer.observe(list);
	observer.observe(last);
	return () => observer.disconnect();
}
