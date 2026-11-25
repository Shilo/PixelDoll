import { on } from 'svelte/events';
import type { PanelSide } from './panelSettings.svelte.ts';
import { SWIPE } from './swipe.ts';

/** The panel's dock edge: the side rail's side, or the bottom sheet's bottom. */
export type DockEdge = PanelSide | 'bottom';

/** Whether a drag from the press to (dx, dy) pulls the panel into its dock edge. */
export function closesPanel(edge: DockEdge, dx: number, dy: number): boolean {
	if (edge === 'bottom') return dy >= SWIPE.distance && dy >= Math.abs(dx) * SWIPE.ratio;
	if (edge === 'right') return dx >= SWIPE.distance && dx >= Math.abs(dy) * SWIPE.ratio;
	return -dx >= SWIPE.distance && -dx >= Math.abs(dy) * SWIPE.ratio;
}

export interface PanelSwipeOptions {
	/** The edge the panel slides into; a rotation or a dock change cancels a drag. */
	readonly edge: DockEdge;
	/** Only an open panel can be dragged shut. */
	readonly enabled: boolean;
	/** Closes the panel through the caller's own toggle, so focus, scroll and the slide stay in one place. */
	onclose: () => void;
}

/**
 * Lets a mouse or a finger drag the panel shut by pulling its own chrome toward its dock edge. Attach it to the
 * sheet's handle and the panel's tab row: both are static panel chrome, so the stage, the panel's scrolling lists and
 * the live view's joystick keep every touch that starts on them.
 *
 * A press is not captured: capturing would retarget the click that ends an ordinary tap to the tab row, and the
 * panel's tabs would stop switching. Window listeners keep the drag alive when the pointer leaves the row instead.
 */
export function panelSwipe(node: HTMLElement, options: PanelSwipeOptions): () => void {
	let drag: { id: number; x: number; y: number; edge: DockEdge } | null = null;
	// A recognized drag that ends inside the row still clicks the tab it started on; swallow that one click.
	let suppressClick = false;
	const clear = () => {
		drag = null;
		delete node.dataset.panelDrag;
	};
	const end = (event: PointerEvent) => {
		if (drag?.id !== event.pointerId) return;
		const { x, y, edge } = drag;
		clear();
		// A dock that changed under the press (a rotation, a side preference) keeps the panel where it is.
		if (event.type !== 'pointerup' || !options.enabled || options.edge !== edge) return;
		if (!closesPanel(edge, event.clientX - x, event.clientY - y)) return;
		suppressClick = true;
		options.onclose();
	};
	const cleanups = [
		on(node, 'pointerdown', (event) => {
			suppressClick = false;
			if (
				!options.enabled ||
				drag ||
				!event.isPrimary ||
				(event.pointerType === 'mouse' && event.button !== 0)
			)
				return;
			drag = { id: event.pointerId, x: event.clientX, y: event.clientY, edge: options.edge };
			node.dataset.panelDrag = '';
		}),
		on(window, 'pointermove', (event) => {
			if (drag?.id !== event.pointerId) return;
			// A panel closed by another control mid-drag must not close again on release.
			if (!options.enabled) clear();
		}),
		on(window, 'pointerup', end),
		on(window, 'pointercancel', end),
		// A second finger means a pinch or a game press, not a drag: the first finger lets go without closing. A fresh
		// press also ends any suppression a drag left behind when its own click never arrived.
		on(
			window,
			'pointerdown',
			(event) => {
				if (drag && event.pointerId !== drag.id) clear();
				else if (!drag) suppressClick = false;
			},
			{ capture: true }
		),
		on(
			node,
			'click',
			(event) => {
				// Keyboard activation (detail 0) is no drag's click and stays with the tab.
				if (!suppressClick || event.detail === 0) return;
				suppressClick = false;
				event.preventDefault();
				event.stopImmediatePropagation();
			},
			{ capture: true }
		),
		on(window, 'blur', clear),
		on(window, 'resize', clear)
	];
	return () => {
		for (const cleanup of cleanups) cleanup();
		clear();
	};
}
