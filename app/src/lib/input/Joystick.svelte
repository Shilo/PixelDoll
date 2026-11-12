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
		style:--joystick-stroke="{size.stroke}px"
		aria-hidden="true"
	>
		<span
			class="joystick-thumb"
			style:transform="translate({snapshot.offset.x}px, {snapshot.offset.y}px)"
		></span>
	</div>{/if}

<style>
	/* A translucent bronze knob with a solid accent edge in a lightly tinted bronze ring, tuned against the
	   live world in both themes. Color-mixes of Bronze tokens only; geometry comes from the size props. */
	.joystick {
		position: fixed;
		box-sizing: border-box;
		width: var(--joystick-base);
		height: var(--joystick-base);
		translate: -50% -50%;
		border: var(--joystick-stroke) solid color-mix(in srgb, var(--bu-accent) 50%, transparent);
		border-radius: 50%;
		background: color-mix(in srgb, var(--bu-accent) 6%, transparent);
		/* A faint canvas halo keeps the ring readable over bright art. */
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--bu-canvas) 35%, transparent);
		display: grid;
		place-items: center;
		pointer-events: none;
		animation: joystick-in var(--bu-duration) ease-out;
	}
	/* Side-scrolling: a groove exactly as tall as the thumb inside its stroke, so the thumb fills it. */
	.joystick.horizontal {
		height: calc(var(--joystick-thumb) + 2 * var(--joystick-stroke));
		border-radius: 999px;
	}
	.joystick-thumb {
		box-sizing: border-box;
		width: var(--joystick-thumb);
		height: var(--joystick-thumb);
		border-radius: 50%;
		background: color-mix(in srgb, var(--bu-accent) 70%, transparent);
		border: 2px solid var(--bu-accent);
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.18);
	}
	@keyframes joystick-in {
		from {
			opacity: 0;
			scale: 0.92;
		}
	}
	@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
		.joystick {
			border-color: var(--bu-accent);
			background: none;
			box-shadow: none;
		}
		.joystick-thumb {
			background: var(--bu-accent);
			box-shadow: none;
		}
	}
	@media (forced-colors: active) {
		.joystick {
			border-color: CanvasText;
			box-shadow: none;
		}
		.joystick-thumb {
			background: Highlight;
			border-color: Highlight;
			box-shadow: none;
		}
	}
</style>
