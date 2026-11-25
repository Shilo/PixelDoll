// Measures elements now, then again whenever any of them resizes. The first read is synchronous so callers can restore
// their layout before paint; observer updates are deferred so a resize written from the callback cannot re-enter it.
export function watchSizes(elements: readonly HTMLElement[], measure: () => void): () => void {
	let frame = 0;
	measure();
	const observer = new ResizeObserver(() => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			frame = 0;
			measure();
		});
	});
	for (const element of elements) observer.observe(element, { box: 'border-box' });
	return () => {
		cancelAnimationFrame(frame);
		observer.disconnect();
	};
}
