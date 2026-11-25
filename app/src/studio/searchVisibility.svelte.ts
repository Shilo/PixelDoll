// Keeps a list's search field honest: it appears once the unfiltered list is longer than a glance, and it stays
// while a query is active, even when the filter leaves nothing behind.
import { searchFieldVisible } from '../lib/search/visibility.ts';

export function createSearchVisibility(options: {
	element: () => HTMLElement | undefined;
	total: () => number;
	query: () => string;
	minItems?: number;
	/** Height inside the scroll box that is reserved room, not content (the list spacer). */
	reserve?: () => number;
	/** False when the list holds nothing searchable, so it must not show the field even if it scrolls. */
	canSearch?: () => boolean;
}) {
	let overflowing = $state(false);
	$effect(() => {
		// Measure only the unfiltered list: a query must never hide its own field by shrinking the results.
		if (options.query()) return;
		const element = options.element();
		if (!element) return;
		// Measuring inside the observer's own callback and then resizing the list with the field can leave the browser
		// reporting a loop; defer the read and write to the next frame instead.
		let frame = 0;
		const measure = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				frame = 0;
				const reserved = options.reserve?.() ?? 0;
				const next = element.scrollHeight - reserved > element.clientHeight + 1;
				if (next !== overflowing) overflowing = next;
			});
		};
		measure();
		const resize = new ResizeObserver(measure);
		resize.observe(element);
		// Rows and thumbnails arrive after mount without resizing the viewport.
		const mutations = new MutationObserver(measure);
		mutations.observe(element, { childList: true, subtree: true, characterData: true });
		return () => {
			cancelAnimationFrame(frame);
			resize.disconnect();
			mutations.disconnect();
		};
	});
	return {
		get visible() {
			return searchFieldVisible({
				query: options.query(),
				overflowing,
				total: options.total(),
				minItems: options.minItems,
				canSearch: options.canSearch?.()
			});
		}
	};
}
