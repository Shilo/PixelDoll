// Brings one Settings row (`data-setting="<entry>"`) into view: scrolls to it, focuses its first control and briefly
// highlights it. Shared by every button that opens Settings at a specific place (openSettings(section, entry)).

const HIGHLIGHT_MS = 1600;
const WAIT_MS = 3000;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The first control a person would use in the row, or the row itself. */
function firstControl(row: HTMLElement) {
	return (
		row.querySelector<HTMLElement>('input:checked:not(:disabled)') ??
		row.querySelector<HTMLElement>(
			'button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]'
		) ??
		row
	);
}

let highlightOwner = 0;

/** Waits (up to a few seconds, for rows that render after their data loads) and reveals the row. Resolves to whether
 *  it was found; a missing row is not an error, Settings simply stays at the top of the page. An aborted request
 *  (the person navigated or typed meanwhile) never scrolls or moves focus. */
export async function revealSetting(
	container: HTMLElement,
	entry: string,
	signal?: AbortSignal
): Promise<boolean> {
	const end = performance.now() + WAIT_MS;
	// One frame first, so a page's own opening focus (Settings starts on its search) has run and this one lands last.
	await new Promise((resolve) => requestAnimationFrame(resolve));
	let row: HTMLElement | null = null;
	while (!(row = container.querySelector<HTMLElement>(`[data-setting="${CSS.escape(entry)}"]`))) {
		if (signal?.aborted || performance.now() > end || !container.isConnected) return false;
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}
	if (signal?.aborted) return false;
	row.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
	// A row can name what takes focus ([data-reveal-focus], such as its heading, so the next Tab enters its controls);
	// otherwise the row itself when focusable, else its first control.
	(
		row.querySelector<HTMLElement>('[data-reveal-focus]') ??
		(row.hasAttribute('tabindex') ? row : firstControl(row))
	).focus({ preventScroll: true });
	// Only the newest highlight clears itself, so an older timer never removes a newer mark.
	const owner = ++highlightOwner;
	container
		.querySelectorAll<HTMLElement>('[data-highlight]')
		.forEach((el) => delete el.dataset.highlight);
	row.dataset.highlight = '';
	const marked = row;
	setTimeout(() => {
		if (owner === highlightOwner) delete marked.dataset.highlight;
	}, HIGHLIGHT_MS);
	return true;
}
