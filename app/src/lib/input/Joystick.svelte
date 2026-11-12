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
		class="joystick bu-floating {className}"
		class:track={axis === 'x'}
		style:left="{snapshot.origin.x}px"
		style:top="{snapshot.origin.y}px"
		style:--joystick-base="{size.base}px"
		style:--joystick-thumb="{size.thumb}px"
		style:--joystick-gap="{size.gap}px"
		aria-hidden="true"
	>
		<span
			class="joystick-thumb"
			style:transform="translate({snapshot.offset.x}px, {snapshot.offset.y}px)"
		></span>
	</div>{/if}

<style>
	/* Bronze's floating material and accent keep the stick in the theme; only geometry is set here. */
	.joystick {
		position: fixed;
		box-sizing: border-box;
		width: var(--joystick-base);
		height: var(--joystick-base);
		translate: -50% -50%;
		border-radius: 50%;
		display: grid;
		place-items: center;
		pointer-events: none;
		touch-action: none;
		animation: joystick-in var(--bu-duration) ease-out;
	}
	.joystick.track {
		height: calc(var(--joystick-thumb) + 2 * var(--joystick-gap));
		border-radius: 999px;
	}
	/* Marks the neutral center once the thumb moves off it. */
	.joystick::before {
		content: '';
		grid-area: 1 / 1;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--bu-muted);
	}
	.joystick-thumb {
		grid-area: 1 / 1;
		box-sizing: border-box;
		width: var(--joystick-thumb);
		height: var(--joystick-thumb);
		border-radius: 50%;
		background: var(--bu-accent);
		border: 1px solid var(--bu-border);
	}
	@keyframes joystick-in {
		from {
			opacity: 0;
		}
	}
</style>
