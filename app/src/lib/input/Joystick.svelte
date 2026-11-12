<!-- Presentation only: draws a Joystick snapshot at its client-coordinate origin. Input stays with the host surface. -->
<script lang="ts">
	import type { JoystickAxis, JoystickSize, JoystickSnapshot } from './joystick.ts';
	let {
		snapshot,
		size,
		axis = 'xy',
		class: className = ''
	}: {
		snapshot: JoystickSnapshot;
		size: JoystickSize;
		axis?: JoystickAxis;
		class?: string;
	} = $props();
</script>

{#if snapshot.origin}<div
		class="joystick bu-gesture-track {className}"
		class:horizontal={axis === 'x'}
		data-axis={axis}
		style:left="{snapshot.origin.x}px"
		style:top="{snapshot.origin.y}px"
		style:--joystick-base="{size.base}px"
		style:--joystick-thumb="{size.thumb}px"
		style:--joystick-stroke="{size.stroke}px"
		aria-hidden="true"
	>
		<span
			class="joystick-thumb bu-gesture-thumb"
			style:transform="translate({snapshot.offset.x}px, {snapshot.offset.y}px)"
		></span>
	</div>{/if}

<style>
	.joystick {
		position: fixed;
		box-sizing: border-box;
		width: var(--joystick-base);
		height: var(--joystick-base);
		translate: -50% -50%;
		border-width: var(--joystick-stroke);
		display: grid;
		place-items: center;
		pointer-events: none;
		animation: joystick-in var(--bu-duration) ease-out;
	}
	/* Side-scrolling: a groove exactly as tall as the thumb inside its stroke, so the thumb fills it. */
	.joystick.horizontal {
		height: calc(var(--joystick-thumb) + 2 * var(--joystick-stroke));
	}
	.joystick-thumb {
		box-sizing: border-box;
		width: var(--joystick-thumb);
		height: var(--joystick-thumb);
		border-width: var(--joystick-stroke);
	}
	@keyframes joystick-in {
		from {
			opacity: 0;
			scale: 0.92;
		}
	}
</style>
