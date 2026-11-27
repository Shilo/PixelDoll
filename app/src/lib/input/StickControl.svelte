<!-- A resting on-screen stick, such as Attack at the lower right: its round base waits where the layout puts it, showing an
     icon. A press anywhere on it centers the stick on the finger, a drag past the rim pulls it along (joystick.ts), and
     lifting snaps it back. It owns its one pointer and never takes focus, like the game buttons (gameAction.ts). -->
<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import JoystickView from './Joystick.svelte';
	import {
		IDLE,
		Joystick,
		joystickTravel,
		type JoystickAxis,
		type JoystickSize,
		type JoystickSnapshot
	} from './joystick.ts';
	let {
		label,
		size,
		deadZone,
		axis = 'xy',
		onchange,
		onactivate,
		children
	}: {
		label: string;
		size: JoystickSize;
		deadZone: number;
		axis?: JoystickAxis;
		/** Every press, drag and release; `starting` is true only on the accepted pointerdown. */
		onchange: (snapshot: JoystickSnapshot, starting: boolean) => void;
		/** A click without a pointer (assistive technology): one action along the current facing. */
		onactivate: () => void;
		/** Shown at rest only; a held stick shows its thumb instead. */
		children: Snippet;
	} = $props();
	let base: HTMLButtonElement;
	let stick: Joystick | null = null,
		snapshot = $state.raw<JoystickSnapshot>(IDLE);
	function set(next: JoystickSnapshot, starting = false) {
		if (next === snapshot) return;
		snapshot = next;
		onchange(next, starting);
	}
	function down(e: PointerEvent) {
		if (e.button !== 0 || stick) return;
		e.preventDefault();
		const r = base.getBoundingClientRect();
		const next = new Joystick({
			axis,
			travel: joystickTravel(size),
			deadZone,
			follow: true,
			centerOnPress: true,
			rest: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
			activationRadius: r.width / 2
		});
		const taken = next.begin(e.pointerId, { x: e.clientX, y: e.clientY });
		// The base is round: a press in its bounding box's corner is not on it.
		if (taken.pointerId !== e.pointerId) return;
		e.stopPropagation();
		stick = next;
		base.setPointerCapture(e.pointerId);
		set(taken, true);
	}
	function move(e: PointerEvent) {
		if (stick) set(stick.move(e.pointerId, { x: e.clientX, y: e.clientY }));
	}
	function up(e: PointerEvent) {
		if (stick?.snapshot.pointerId === e.pointerId) cancel();
	}
	export function cancel() {
		if (!stick) return;
		stick = null;
		set(IDLE);
	}
	onDestroy(cancel);
</script>

<svelte:window onblur={cancel} />
<button
	type="button"
	class="stick-control bu-gesture-track"
	class:held={snapshot.pointerId !== null}
	style:--stick-base="{size.base}px"
	style:--stick-stroke="{size.stroke}px"
	tabindex="-1"
	aria-label={label}
	data-game-action=""
	bind:this={base}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onlostpointercapture={up}
	onmousedown={(e) => e.preventDefault()}
	onclick={(e) => {
		e.preventDefault();
		if (e.detail === 0) onactivate();
	}}
>
	{@render children()}
</button>
<JoystickView class="stick-control-held" {snapshot} {size} {axis} />

<style>
	.stick-control {
		box-sizing: border-box;
		inline-size: var(--stick-base);
		block-size: var(--stick-base);
		border-width: var(--stick-stroke);
		padding: 0;
		display: grid;
		place-items: center;
		color: var(--bu-text);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
	}
	.stick-control :global(svg) {
		inline-size: 32%;
		block-size: 32%;
	}
	/* Held, the moving stick stands in for the resting base, which stays as the captured hit target. */
	.stick-control.held {
		opacity: 0;
	}
	:global(.stick-control-held) {
		z-index: 5;
		animation: none !important;
	}
</style>
