<script lang="ts">
	// One collapsible section of a View and edit window: chevron, name, and its state at the far end (as in the API calls
	// popover). The caller's body goes in a `.window-body` child.
	import type { Snippet } from 'svelte';
	import { Check, ChevronRight, TriangleAlert } from './icons.ts';

	let {
		label,
		state,
		nested = false,
		open = $bindable(false),
		element = $bindable(),
		children
	}: {
		label: string;
		/** What the section holds, at a glance: a warning, done, or a neutral note. */
		state?: { text: string; tone: 'warn' | 'ok' | 'neutral' };
		/** One level deeper (About's Technical details): lighter name, ruled above. */
		nested?: boolean;
		open?: boolean;
		element?: HTMLDetailsElement;
		children: Snippet;
	} = $props();
</script>

<details class="window-section" class:nested bind:this={element} bind:open>
	<summary>
		<ChevronRight size={16} aria-hidden="true" />
		<h3 class="section-name">{label}</h3>
		{#if state}<span class="section-state" data-tone={state.tone}
				>{#if state.tone === 'warn'}<TriangleAlert
						size={13}
						aria-hidden="true"
					/>{:else if state.tone === 'ok'}<Check
						size={13}
						aria-hidden="true"
					/>{/if}{state.text}</span
			>{/if}
	</summary>
	{@render children()}
</details>

<style>
	.window-section {
		min-width: 0;
		border-block-end: 1px solid var(--bu-line);
	}
	.window-section.nested {
		border-block: 1px solid var(--bu-line);
		border-block-end: 0;
		margin-block-start: 8px;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 4px;
		cursor: pointer;
		list-style: none;
		border-radius: 8px;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover {
		background: var(--bg-hover);
	}
	summary > :global(svg) {
		flex: none;
		color: var(--text-3);
		transition: transform var(--dur);
	}
	.window-section[open] > summary > :global(svg) {
		transform: rotate(90deg);
	}
	.section-name {
		margin: 0;
		min-width: 0;
		font: 600 var(--fs) / 1.3 var(--font-ui);
	}
	.nested .section-name {
		font-weight: 400;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.section-state {
		margin-inline-start: auto;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		font-size: var(--fs-sm);
		color: var(--text-3);
		text-align: end;
	}
	.section-state[data-tone='warn'] {
		color: var(--warn);
	}
	.section-state[data-tone='ok'] {
		color: var(--ok);
	}
	/* Defaults at one class's weight, so a section's own body layout (Outfit's two columns) wins. */
	:global(:where(.window-section) > .window-body) {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		padding: 4px 4px 16px 28px;
	}
	:global(:where(.window-section.nested) > .window-body) {
		padding-inline-start: 24px;
	}
	@media (max-width: 420px) {
		:global(:where(.window-section:not(.nested)) > .window-body) {
			padding-inline-start: 4px;
		}
	}
</style>
