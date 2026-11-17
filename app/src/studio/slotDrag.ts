import { contextMenu as attachContextMenu } from '../lib/input/contextMenu.ts';

export function slotDrag(
	node: HTMLElement,
	options: {
		start: () => void;
		move: (x: number, y: number) => void;
		end: (commit: boolean) => void;
		armed?: (value: boolean) => void;
		menu?: (element: HTMLElement) => void;
	}
): () => void {
	let press: { kind: 'pointer' | 'touch'; id: number; x: number; y: number } | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let armed = false;
	let dragging = false;
	let suppressClick = false;
	const finish = (commit: boolean) => {
		const previous = press;
		const started = dragging;
		const wasArmed = armed;
		clearTimeout(timer);
		timer = undefined;
		press = undefined;
		dragging = false;
		armed = false;
		if (previous?.kind === 'pointer' && node.hasPointerCapture(previous.id))
			node.releasePointerCapture(previous.id);
		if (wasArmed) options.armed?.(false);
		if (started) options.end(commit);
	};
	const cancel = () => finish(false);
	const advance = (x: number, y: number, threshold: number) => {
		if (!press) return;
		if (!dragging) {
			if (Math.hypot(x - press.x, y - press.y) < threshold) return;
			dragging = true;
			suppressClick = true;
			if (press.kind === 'pointer') node.setPointerCapture(press.id);
			options.start();
		}
		if (dragging) options.move(x, y);
	};
	const pointerDown = (event: PointerEvent) => {
		if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary || press) return;
		suppressClick = false;
		press = { kind: 'pointer', id: event.pointerId, x: event.clientX, y: event.clientY };
	};
	const nextPointer = (event: PointerEvent) => {
		if (!press && event.pointerType !== 'touch') suppressClick = false;
	};
	const pointerMove = (event: PointerEvent) => {
		if (event.pointerType === 'touch' || press?.kind !== 'pointer' || event.pointerId !== press.id)
			return;
		advance(event.clientX, event.clientY, 6);
		if (dragging) event.preventDefault();
	};
	const pointerEnd = (event: PointerEvent) => {
		if (event.pointerType !== 'touch' && press?.kind === 'pointer' && event.pointerId === press.id)
			finish(event.type === 'pointerup');
	};
	const touchStart = (event: TouchEvent) => {
		if (event.touches.length !== 1 || press) return;
		const touch = event.touches[0]!;
		suppressClick = false;
		press = { kind: 'touch', id: touch.identifier, x: touch.clientX, y: touch.clientY };
		timer = setTimeout(() => {
			timer = undefined;
			armed = true;
			options.armed?.(true);
		}, 300);
	};
	const nextTouch = (event: TouchEvent) => {
		if (press && event.touches.length > 1) cancel();
		else if (!press) suppressClick = false;
	};
	const touchMove = (event: TouchEvent) => {
		if (press?.kind !== 'touch') return;
		if (event.touches.length !== 1) return cancel();
		const touch = event.touches[0]!;
		if (touch.identifier !== press.id) return cancel();
		if (!armed) {
			if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 8) cancel();
			return;
		}
		event.preventDefault();
		advance(touch.clientX, touch.clientY, 8);
	};
	const touchEnd = (event: TouchEvent) => {
		if (press?.kind !== 'touch') return;
		if (event.type !== 'touchcancel') {
			const id = press.id;
			if (!Array.from(event.changedTouches).some((touch) => touch.identifier === id)) return;
		}
		if (dragging) event.preventDefault();
		finish(event.type === 'touchend');
	};
	const click = (event: MouseEvent) => {
		if (!suppressClick || event.detail === 0) return;
		suppressClick = false;
		event.preventDefault();
		event.stopImmediatePropagation();
	};
	const contextMenu = (event: MouseEvent) => {
		if (press?.kind === 'touch' || dragging) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};
	const keyDown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape' || !press) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		cancel();
	};
	const visibility = () => {
		if (node.ownerDocument.hidden) cancel();
	};
	node.addEventListener('pointerdown', pointerDown);
	node.addEventListener('touchstart', touchStart, { passive: true });
	node.addEventListener('contextmenu', contextMenu, true);
	node.addEventListener('lostpointercapture', pointerEnd);
	window.addEventListener('click', click, true);
	window.addEventListener('pointerdown', nextPointer, true);
	window.addEventListener('pointermove', pointerMove, true);
	window.addEventListener('pointerup', pointerEnd, true);
	window.addEventListener('pointercancel', pointerEnd, true);
	window.addEventListener('touchstart', nextTouch, { capture: true, passive: true });
	window.addEventListener('touchmove', touchMove, { capture: true, passive: false });
	window.addEventListener('touchend', touchEnd, { capture: true, passive: false });
	window.addEventListener('touchcancel', touchEnd, true);
	window.addEventListener('keydown', keyDown, true);
	window.addEventListener('blur', cancel);
	node.ownerDocument.addEventListener('visibilitychange', visibility);
	const menuCleanup =
		options.menu &&
		attachContextMenu(
			(element) => {
				if (dragging) return;
				finish(false);
				suppressClick = true;
				options.menu!(element);
			},
			() => press?.kind === 'touch' && !dragging
		)(node);
	return () => {
		if (typeof menuCleanup === 'function') menuCleanup();
		cancel();
		node.removeEventListener('pointerdown', pointerDown);
		node.removeEventListener('touchstart', touchStart);
		node.removeEventListener('contextmenu', contextMenu, true);
		node.removeEventListener('lostpointercapture', pointerEnd);
		window.removeEventListener('click', click, true);
		window.removeEventListener('pointerdown', nextPointer, true);
		window.removeEventListener('pointermove', pointerMove, true);
		window.removeEventListener('pointerup', pointerEnd, true);
		window.removeEventListener('pointercancel', pointerEnd, true);
		window.removeEventListener('touchstart', nextTouch, true);
		window.removeEventListener('touchmove', touchMove, true);
		window.removeEventListener('touchend', touchEnd, true);
		window.removeEventListener('touchcancel', touchEnd, true);
		window.removeEventListener('keydown', keyDown, true);
		window.removeEventListener('blur', cancel);
		node.ownerDocument.removeEventListener('visibilitychange', visibility);
	};
}
