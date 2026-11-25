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
	let frame = 0;
	// Size once before the list restores its scroll position; later observer updates are deferred so the spacer's own
	// layout change cannot re-enter the observer.
	size();
	const update = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			frame = 0;
			size();
		});
	};
	const observer = new ResizeObserver(update);
	observer.observe(list);
	observer.observe(last);
	return () => {
		cancelAnimationFrame(frame);
		observer.disconnect();
	};
}
