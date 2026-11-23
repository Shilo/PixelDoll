/** While a tile's menu is open, a press on a tile only dismisses the menu (the popover's light dismiss): its click must
 *  not also wear or take off that tile. Other buttons keep their own click. Returns the cleanup. */
export function swallowTilePress(menu: () => HTMLElement | undefined) {
	const down = (e: PointerEvent) => {
		const target = e.target instanceof Element ? e.target : null;
		if (!target?.closest('.bu-tile') || menu()?.contains(target)) return;
		const swallow = (click: MouseEvent) => {
			click.preventDefault();
			click.stopImmediatePropagation();
		};
		// Only the click this press makes; a press that turns into a scroll or drag makes none.
		const stop = () =>
			setTimeout(() => window.removeEventListener('click', swallow, { capture: true }));
		window.addEventListener('click', swallow, { capture: true, once: true });
		window.addEventListener('pointerup', stop, { capture: true, once: true });
		window.addEventListener('pointercancel', stop, { capture: true, once: true });
	};
	window.addEventListener('pointerdown', down, { capture: true });
	return () => window.removeEventListener('pointerdown', down, { capture: true });
}
