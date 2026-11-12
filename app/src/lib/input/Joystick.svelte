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
	const full = $derived(Math.hypot(snapshot.value.x, snapshot.value.y) >= 0.999);
</script>

{#if snapshot.origin}<div
		class="joystick {className}"
		class:horizontal={axis === 'x'}
		class:full
		style:left="{snapshot.origin.x}px"
		style:top="{snapshot.origin.y}px"
		style:--joystick-base="{size.base}px"
		style:--joystick-thumb="{size.thumb}px"
		style:--joystick-stroke="{size.stroke}px"
		aria-hidden="true"
	>
		<span
			class="joystick-thumb"
			style:transform="translate({snapshot.offset.x}px, {snapshot.offset.y}px)"
		></span>
	</div>{/if}

<style>
	/* Drawn over the world, not a panel, so it uses the theme's ink (text color) at low alpha rather than
	   panel borders or the accent: a quiet ring and a near-solid puck that flip together with the theme. */
	.joystick {
		position: fixed;
		box-sizing: border-box;
		width: var(--joystick-base);
		height: var(--joystick-base);
		translate: -50% -50%;
		border: var(--joystick-stroke) solid color-mix(in srgb, var(--bu-text) 38%, transparent);
		border-radius: 50%;
		/* A faint canvas halo keeps the ring readable over bright art. */
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--bu-canvas) 30%, transparent);
		display: grid;
		place-items: center;
		pointer-events: none;
		transition: border-color var(--bu-duration) ease-out;
		animation: joystick-in var(--bu-duration) ease-out;
	}
	/* Side-scrolling: a groove with a 4px reveal around the thumb. */
	.joystick.horizontal {
		height: calc(var(--joystick-thumb) + 2 * var(--joystick-stroke) + 8px);
		border-radius: 999px;
	}
	.joystick.full {
		border-color: color-mix(in srgb, var(--bu-text) 62%, transparent);
	}
	.joystick-thumb {
		box-sizing: border-box;
		width: var(--joystick-thumb);
		height: var(--joystick-thumb);
		border-radius: 50%;
		background: color-mix(in srgb, var(--bu-text) 88%, transparent);
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
		transition: background-color var(--bu-duration) ease-out;
	}
	.full .joystick-thumb {
		background-color: var(--bu-text);
	}
	@keyframes joystick-in {
		from {
			opacity: 0;
			scale: 0.92;
		}
	}
	@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
		.joystick {
			border-color: var(--bu-muted);
			box-shadow: none;
		}
		.joystick-thumb {
			background: var(--bu-text);
			box-shadow: 0 0 0 2px var(--bu-canvas);
		}
	}
	@media (prefers-contrast: more) {
		.joystick {
			border-color: var(--bu-text);
		}
	}
	@media (forced-colors: active) {
		.joystick {
			border-color: CanvasText;
			box-shadow: none;
		}
		.joystick.full {
			border-color: Highlight;
		}
		.joystick-thumb {
			background: Highlight;
			border: 2px solid CanvasText;
			box-shadow: none;
		}
	}
</style>
