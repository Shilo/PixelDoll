import type { Attachment } from 'svelte/attachments';

/**
 * A game button acts on press and never takes keyboard focus, so held movement keys and the stage's shortcuts keep
 * working while it is pressed. Press is its one activation path: a native click that follows a pointer (including the
 * stage's synthesized click for a second finger) does nothing, while a click without a pointer (assistive technology)
 * still activates it. `data-pressed` marks the press for styling.
 */
export function gameAction(activate: () => void): Attachment<HTMLButtonElement> {
	return (button) => {
		button.tabIndex = -1;
		button.dataset.gameAction = '';
		let pointer: number | null = null;
		const release = (event: PointerEvent) => {
			if (event.pointerId !== pointer) return;
			pointer = null;
			delete button.dataset.pressed;
		};
		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			event.preventDefault();
			if (button.disabled) return;
			pointer = event.pointerId;
			button.dataset.pressed = '';
			activate();
		};
		const click = (event: MouseEvent) => {
			event.preventDefault();
			if (event.detail === 0 && !button.disabled) activate();
		};
		// Mouse compatibility events would move focus to the button.
		const mousedown = (event: MouseEvent) => event.preventDefault();
		button.addEventListener('pointerdown', down);
		button.addEventListener('pointerup', release);
		button.addEventListener('pointercancel', release);
		button.addEventListener('pointerleave', release);
		button.addEventListener('click', click);
		button.addEventListener('mousedown', mousedown);
		return () => {
			button.removeEventListener('pointerdown', down);
			button.removeEventListener('pointerup', release);
			button.removeEventListener('pointercancel', release);
			button.removeEventListener('pointerleave', release);
			button.removeEventListener('click', click);
			button.removeEventListener('mousedown', mousedown);
		};
	};
}
