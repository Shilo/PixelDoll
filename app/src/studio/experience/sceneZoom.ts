import { on } from 'svelte/events';
import { settleZoom, zoomStep, type SceneZoom } from './zoom.ts';

export interface SceneZoomOptions {
	/** This screen's resolved zoom: the scale shown, its fit and the shared bounds. */
	readonly zoom: SceneZoom;
	readonly enabled: boolean;
	/** What a wheel turned while Ctrl or Cmd is held does: zoom too, or pass to the screen (Characters navigates). */
	modifiedWheel: 'zoom' | 'pass';
	/** A chosen scale, or null to show each screen's fit again. */
	onchange: (scale: number | null) => void;
	/** A one-finger horizontal swipe: 1 toward the next item (finger moving left), -1 toward the previous. */
	onswipe?: (direction: 1 | -1) => void;
}

// Trackpad pinches reach the page as wheel events with ctrlKey set, but no Control key press; tracking the real key
// tells a pinch (always zoom) from a wheel turned while Control is held.
let controlHeld = false;
let tracking = 0;
const trackControl = (event: KeyboardEvent) => {
	controlHeld = event.ctrlKey;
};
const releaseControl = () => {
	controlHeld = false;
};

/** A wheel turned while the person holds Ctrl or Cmd, as opposed to a plain wheel or a trackpad pinch. */
export function modifiedWheel(event: WheelEvent): boolean {
	return event.metaKey || (event.ctrlKey && controlHeld);
}

/** One wheel step: a mouse notch (about 100 px) steps once, however large; small trackpad scrolls add up to one. */
const WHEEL_STEP = 50;

/** A swipe travels this far horizontally, mostly sideways, to count. */
const SWIPE = { distance: 48, ratio: 1.5 };

export function sceneZoom(node: HTMLElement, options: SceneZoomOptions): () => void {
	const touches = new Map<number, { x: number; y: number }>();
	let distance = 0;
	let pinching = false;
	let suppressClick = false;
	let swipe: { id: number; x: number; y: number } | null = null;
	let wheelDistance = 0,
		lastWheelAt = -Infinity,
		pinchSettle = 0;
	const step = (direction: 1 | -1) => options.onchange(zoomStep(options.zoom, direction));
	// A pinch is direct manipulation and stays precise; released near the fit or a whole multiple, it lands on it.
	const settlePinch = () => options.onchange(settleZoom(options.zoom, options.zoom.scale));
	if (!tracking++) {
		window.addEventListener('keydown', trackControl, true);
		window.addEventListener('keyup', trackControl, true);
		window.addEventListener('blur', releaseControl);
	}
	const available = () => options.enabled && !document.querySelector('[popover]:popover-open');
	const change = (value: number) => {
		if (Number.isFinite(value))
			options.onchange(Math.min(options.zoom.max, Math.max(options.zoom.min, value)));
	};
	const editable = (target: EventTarget | null) =>
		target instanceof Element &&
		!!target.closest('input, textarea, select, [contenteditable], button:not(.cast-character), a');
	// Buttons and links have no wheel behavior of their own, so a wheel over the scene's caption still zooms it.
	const scrollsItself = (target: EventTarget | null) =>
		target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]');
	const span = () => {
		const points = [...touches.values()];
		return points.length === 2
			? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
			: 0;
	};
	const clear = () => {
		const held = [...touches.keys()];
		touches.clear();
		distance = 0;
		pinching = false;
		swipe = null;
		for (const pointerId of held)
			if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
	};
	function end(event: PointerEvent) {
		if (!touches.has(event.pointerId)) return;
		if (pinching) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
		touches.delete(event.pointerId);
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
		distance = span();
		if (!touches.size && pinching) {
			pinching = false;
			settlePinch();
		}
		if (swipe?.id !== event.pointerId) return;
		const dx = event.clientX - swipe.x,
			dy = event.clientY - swipe.y;
		swipe = null;
		if (
			event.type !== 'pointerup' ||
			!options.onswipe ||
			!available() ||
			Math.abs(dx) < SWIPE.distance ||
			Math.abs(dx) < Math.abs(dy) * SWIPE.ratio
		)
			return;
		// The lifted finger must not also tap the character it started on.
		suppressClick = true;
		options.onswipe(dx < 0 ? 1 : -1);
	}
	const cleanups = [
		on(
			node,
			'wheel',
			(event) => {
				if (
					!available() ||
					scrollsItself(event.target) ||
					event.altKey ||
					event.shiftKey ||
					(options.modifiedWheel === 'pass' && modifiedWheel(event)) ||
					!event.deltaY ||
					Math.abs(event.deltaX) > Math.abs(event.deltaY)
				)
					return;
				event.preventDefault();
				const delta =
					event.deltaY *
					(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
				// A trackpad pinch (Ctrl without the key held) follows the fingers precisely, like a touch pinch.
				if (event.ctrlKey && !modifiedWheel(event)) {
					change(options.zoom.scale * Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.01));
					clearTimeout(pinchSettle);
					pinchSettle = window.setTimeout(settlePinch, 200);
					return;
				}
				const now = performance.now();
				if (now - lastWheelAt > 400 || Math.sign(delta) !== Math.sign(wheelDistance))
					wheelDistance = 0;
				lastWheelAt = now;
				wheelDistance += delta;
				if (Math.abs(wheelDistance) < WHEEL_STEP) return;
				// The rest of a notch is dropped, so every notch is exactly one step.
				wheelDistance = 0;
				step(delta < 0 ? 1 : -1);
			},
			{ passive: false }
		),
		on(node, 'keydown', (event) => {
			if (
				!available() ||
				event.target !== node ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				event.isComposing
			)
				return;
			if (!['+', '=', '-', '0'].includes(event.key)) return;
			event.preventDefault();
			if (event.key === '0') options.onchange(null);
			else step(event.key === '-' ? -1 : 1);
		}),
		on(
			node,
			'pointerdown',
			(event) => {
				if (!touches.size) suppressClick = false;
				if (!available() || editable(event.target)) return;
				if (event.button === 1) {
					event.preventDefault();
					event.stopImmediatePropagation();
					options.onchange(null);
					return;
				}
				if (event.pointerType !== 'touch') return;
				touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
				if (touches.size < 2) {
					swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
					return;
				}
				swipe = null;
				event.preventDefault();
				event.stopImmediatePropagation();
				suppressClick = pinching = true;
				distance = span();
				for (const pointerId of touches.keys()) node.setPointerCapture(pointerId);
			},
			{ capture: true }
		),
		on(
			window,
			'pointermove',
			(event) => {
				if (!touches.has(event.pointerId)) return;
				if (!available()) {
					clear();
					return;
				}
				touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
				if (!pinching) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				const next = span();
				if (next > 0 && distance > 0) change((options.zoom.scale * next) / distance);
				distance = next;
			},
			{ capture: true, passive: false }
		),
		on(window, 'pointerup', end, { capture: true }),
		on(window, 'pointercancel', end, { capture: true }),
		on(node, 'lostpointercapture', (event) => {
			if (event.target === node && touches.has(event.pointerId)) clear();
		}),
		on(
			node,
			'click',
			(event) => {
				if (!suppressClick || event.detail === 0) return;
				event.preventDefault();
				event.stopImmediatePropagation();
			},
			{ capture: true }
		),
		on(node, 'auxclick', (event) => {
			if (event.button === 1 && available() && !editable(event.target)) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		}),
		on(window, 'blur', clear),
		on(window, 'resize', clear),
		on(document, 'visibilitychange', clear)
	];
	return () => {
		for (const cleanup of cleanups) cleanup();
		clear();
		clearTimeout(pinchSettle);
		if (!--tracking) {
			window.removeEventListener('keydown', trackControl, true);
			window.removeEventListener('keyup', trackControl, true);
			window.removeEventListener('blur', releaseControl);
			controlHeld = false;
		}
	};
}
