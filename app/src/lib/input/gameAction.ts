import type { Attachment } from 'svelte/attachments';

/**
 * A game button acts on press and never takes keyboard focus, so held movement keys and the stage's shortcuts keep
 * working while it is pressed. Press is its one activation path: a native click that follows a pointer (including the
 * stage's synthesized click for a second finger) does nothing, while a click without a pointer (assistive technology)
 * activates it and, for a held action, releases it at once. `data-pressed` marks the press for styling.
 *
 * With `release`, the action lasts while the button is held (Jump repeats, Attack keeps swinging): the pressing pointer is
 * captured, so sliding off the button keeps holding, and release runs once when it lifts, is canceled or the button goes.
 */
export function gameAction(
	activate: () => void,
	release?: () => void
): Attachment<HTMLButtonElement> {
	return (button) => {
		button.tabIndex = -1;
		button.dataset.gameAction = '';
		let pointer: number | null = null;
		const end = () => {
			if (pointer === null) return;
			pointer = null;
			delete button.dataset.pressed;
			release?.();
		};
		const lifted = (event: PointerEvent) => {
			if (event.pointerId === pointer) end();
		};
		// Releasing the primary button while another stays down sends a move, not an up (W3C chorded buttons).
		const moved = (event: PointerEvent) => {
			if (event.pointerId === pointer && !(event.buttons & 1)) end();
		};
		const down = (event: PointerEvent) => {
			if (event.button !== 0 || pointer !== null) return;
			event.preventDefault();
			if (button.disabled) return;
			pointer = event.pointerId;
			button.dataset.pressed = '';
			if (release) button.setPointerCapture(event.pointerId);
			activate();
		};
		const click = (event: MouseEvent) => {
			event.preventDefault();
			if (event.detail !== 0 || button.disabled) return;
			activate();
			release?.();
		};
		// Mouse compatibility events would move focus to the button.
		const mousedown = (event: MouseEvent) => event.preventDefault();
		// A held button keeps its press until the pointer lifts; a momentary one lets go when the pointer leaves.
		const events = [
			'pointerup',
			'pointercancel',
			release ? 'lostpointercapture' : 'pointerleave'
		] as const;
		button.addEventListener('pointerdown', down);
		button.addEventListener('pointermove', moved);
		for (const type of events) button.addEventListener(type, lifted);
		button.addEventListener('click', click);
		button.addEventListener('mousedown', mousedown);
		return () => {
			end();
			button.removeEventListener('pointerdown', down);
			button.removeEventListener('pointermove', moved);
			for (const type of events) button.removeEventListener(type, lifted);
			button.removeEventListener('click', click);
			button.removeEventListener('mousedown', mousedown);
		};
	};
}
