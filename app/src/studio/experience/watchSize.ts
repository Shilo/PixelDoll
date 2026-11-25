// Measures an element now, then again whenever it resizes. The first read is synchronous so callers can restore their
// layout before paint; observer updates are deferred so a resize written from the callback cannot re-enter the observer.
export function watchSize(element: HTMLElement, measure: () => void): () => void {
	let frame = 0;
	measure();
	const observer = new ResizeObserver(() => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			frame = 0;
			measure();
		});
	});
	observer.observe(element);
	return () => {
		cancelAnimationFrame(frame);
		observer.disconnect();
	};
}
