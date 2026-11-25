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
	// The spacer changes the list's own layout, so writing it inside the observer would re-enter the observer. Measure
	// and set on the next frame instead, coalescing bursts of resizes.
	let frame = 0;
	const update = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			frame = 0;
			size();
		});
	};
	update();
	const observer = new ResizeObserver(update);
	observer.observe(list);
	observer.observe(last);
	return () => {
		cancelAnimationFrame(frame);
		observer.disconnect();
	};
}
