<!-- A round on-screen game button for touch, drawn like the Joystick: a gesture track ring around an icon. It acts on
     press and never takes focus (gameAction.ts). -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { gameAction } from './gameAction.ts';
	let {
		label,
		size = 56,
		pressed,
		onactivate,
		children
	}: {
		label: string;
		/** Outer diameter in CSS px; at least 44 for a reliable thumb target. */
		size?: number;
		/** A toggle's state, such as Mount; omit for a momentary action such as Jump. */
		pressed?: boolean;
		onactivate: () => void;
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	class="touch-action bu-gesture-track"
	style:--touch-action-size="{Math.max(44, size)}px"
	tabindex="-1"
	aria-label={label}
	aria-pressed={pressed}
	{@attach gameAction(() => onactivate())}
>
	{@render children()}
</button>

<style>
	.touch-action {
		box-sizing: border-box;
		inline-size: var(--touch-action-size);
		block-size: var(--touch-action-size);
		border-width: 2px;
		padding: 0;
		display: grid;
		place-items: center;
		color: var(--bu-text);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		transition:
			scale var(--bu-duration) ease-out,
			border-color var(--bu-duration) ease-out,
			color var(--bu-duration) ease-out;
	}
	.touch-action :global(svg) {
		inline-size: 45%;
		block-size: 45%;
	}
	/* Pressed and toggled on read like the joystick's thumb: an accent rim. */
	.touch-action:global([data-pressed]),
	.touch-action[aria-pressed='true'] {
		border-color: var(--bu-accent);
		color: var(--bu-accent);
	}
	.touch-action:global([data-pressed]) {
		scale: 0.92;
		background: var(--bu-gesture-thumb);
	}
	@media (prefers-reduced-motion: reduce) {
		.touch-action {
			transition: none;
		}
	}
</style>
