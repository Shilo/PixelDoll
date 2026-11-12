import { on } from 'svelte/events';

export interface SceneZoomOptions {
	readonly value: number;
	readonly min: number;
	readonly max: number;
	readonly enabled: boolean;
	wheel: 'modified' | 'plain';
	onchange: (value: number) => void;
}

export function sceneZoom(node: HTMLElement, options: SceneZoomOptions): () => void {
	const touches = new Map<number, { x: number; y: number }>();
	let distance = 0;
	let pinching = false;
	let suppressClick = false;
	const available = () => options.enabled && !document.querySelector('[popover]:popover-open');
	const change = (value: number) => {
		if (Number.isFinite(value))
			options.onchange(Math.min(options.max, Math.max(options.min, value)));
	};
	const editable = (target: EventTarget | null) =>
		target instanceof Element &&
		!!target.closest('input, textarea, select, [contenteditable], button:not(.cast-character), a');
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
		if (!touches.size) pinching = false;
	}
	const cleanups = [
		on(
			node,
			'wheel',
			(event) => {
				if (
					!available() ||
					editable(event.target) ||
					event.altKey ||
					event.shiftKey ||
					(options.wheel === 'modified' && !event.ctrlKey && !event.metaKey) ||
					!event.deltaY ||
					Math.abs(event.deltaX) > Math.abs(event.deltaY)
				)
					return;
				event.preventDefault();
				const delta =
					event.deltaY *
					(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
				change(options.value * Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002));
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
			change(event.key === '0' ? 1 : options.value * (event.key === '-' ? 1 / 1.1 : 1.1));
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
					change(1);
					return;
				}
				if (event.pointerType !== 'touch') return;
				touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
				if (touches.size < 2) return;
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
				if (next > 0 && distance > 0) change((options.value * next) / distance);
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
	};
}
