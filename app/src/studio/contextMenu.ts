export function contextMenu(node: HTMLElement, open: () => void) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let suppress = false;
	let origin: { x: number; y: number; id: number } | undefined;
	const cancel = () => {
		clearTimeout(timer);
		origin = undefined;
	};
	const down = (event: PointerEvent) => {
		cancel();
		suppress = false;
		if (event.pointerType === 'mouse' || event.button !== 0 || !event.isPrimary) return;
		origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
		timer = setTimeout(() => {
			open();
			suppress = true;
		}, 550);
	};
	const canceled = () => {
		cancel();
		suppress = false;
	};
	const move = (event: PointerEvent) => {
		if (
			origin &&
			(event.pointerId !== origin.id ||
				Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10)
		)
			cancel();
	};
	const click = (event: MouseEvent) => {
		if (!suppress) return;
		suppress = false;
		event.preventDefault();
		event.stopImmediatePropagation();
	};
	const touchEnd = (event: TouchEvent) => {
		if (suppress) event.preventDefault();
	};
	const context = (event: MouseEvent) => {
		event.preventDefault();
		cancel();
		if (!suppress) open();
	};
	const key = (event: KeyboardEvent) => {
		suppress = false;
		if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
		event.preventDefault();
		open();
	};
	node.addEventListener('pointerdown', down);
	node.addEventListener('click', click, true);
	node.addEventListener('touchend', touchEnd, { passive: false });
	node.addEventListener('contextmenu', context);
	node.addEventListener('keydown', key);
	window.addEventListener('pointermove', move, true);
	window.addEventListener('pointerup', cancel, true);
	window.addEventListener('pointercancel', canceled, true);
	window.addEventListener('scroll', canceled, true);
	return {
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('click', click, true);
			node.removeEventListener('touchend', touchEnd);
			node.removeEventListener('contextmenu', context);
			node.removeEventListener('keydown', key);
			window.removeEventListener('pointermove', move, true);
			window.removeEventListener('pointerup', cancel, true);
			window.removeEventListener('pointercancel', canceled, true);
			window.removeEventListener('scroll', canceled, true);
		}
	};
}
