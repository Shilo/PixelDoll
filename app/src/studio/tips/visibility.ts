/** Whole on screen: rendered, not transparent, inside the viewport and inside every scrolling or clipping ancestor, so a
 *  tip's arrow lands on the control itself rather than on a clipped edge or on nothing. */
export function fullyVisible(el: Element | null | undefined): boolean {
	if (!(el instanceof HTMLElement) || el.closest('[inert]')) return false;
	if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
	const r = el.getBoundingClientRect();
	if (r.width < 1 || r.height < 1) return false;
	if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1)
		return false;
	// A few pixels of slack: a 44 px hit area around a small icon may reach just past its scroller's edge.
	const slack = 6;
	for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
		const s = getComputedStyle(p);
		if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
		const b = p.getBoundingClientRect();
		if (
			r.top < b.top - slack ||
			r.bottom > b.bottom + slack ||
			r.left < b.left - slack ||
			r.right > b.right + slack
		)
			return false;
	}
	// Something drawn over it, such as a sticky section header, hides it as surely as clipping does: it must be on top
	// at its center and near each edge (inside the clipping slack).
	const x = r.left + r.width / 2,
		inset = Math.min(slack + 2, r.height / 2);
	return [r.top + inset, r.top + r.height / 2, r.bottom - inset].every((y) => {
		const top = document.elementsFromPoint(x, y).find((hit) => !hit.closest('.tip-layer'));
		return !!top && el.contains(top);
	});
}

/** A sheet or menu is open that does not hold the control: the tip would sit under it or compete. Manual popovers
 *  (help tooltips, drag previews) are passing hints, not places, and do not count. */
export function coveredByLayer(el: Element): boolean {
	return [...document.querySelectorAll('dialog[open], :popover-open:not([popover="manual"])')].some(
		(layer) => !layer.contains(el)
	);
}
