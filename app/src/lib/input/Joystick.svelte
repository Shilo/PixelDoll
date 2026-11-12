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
		class="joystick {className}"
		class:horizontal={axis === 'x'}
		style:left="{snapshot.origin.x}px"
		style:top="{snapshot.origin.y}px"
		style:--joystick-base="{size.base}px"
		style:--joystick-thumb="{size.thumb}px"
		aria-hidden="true"
	>
		<span
			class="joystick-thumb"
			style:transform="translate({snapshot.offset.x}px, {snapshot.offset.y}px)"
		></span>
	</div>{/if}

<style>
	/* An open ring and a solid thumb in Bronze roles keep the world visible; only geometry is set here. */
	.joystick {
		position: fixed;
		box-sizing: border-box;
		width: var(--joystick-base);
		height: var(--joystick-base);
		translate: -50% -50%;
		border: 2px solid var(--bu-border);
		border-radius: 50%;
		display: grid;
		place-items: center;
		pointer-events: none;
		touch-action: none;
		animation: joystick-in var(--bu-duration) ease-out;
	}
	/* Side-scrolling: a horizontal track whose ends sit at full throw. */
	.joystick.horizontal {
		height: calc(var(--joystick-thumb) + 8px);
		border-radius: 999px;
	}
	.joystick-thumb {
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
