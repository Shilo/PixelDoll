<script lang="ts">
	// One action as a full-width row: what it does on the left, what it costs (or Free) on the right. The whole row is the
	// button, so hover and press come from the theme's action states. Rows stacked in a bordered list share one divider.
	import type { Component } from 'svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	let {
		icon: Icon,
		label,
		detail,
		aside,
		paid = false,
		disabled = false,
		describedby,
		opens = false,
		trail,
		onclick
	}: {
		icon: Component<{ size?: number; 'aria-hidden'?: 'true' }>;
		label: string;
		detail: string;
		/** The price or "Free". */
		aside: string;
		paid?: boolean;
		disabled?: boolean;
		/** Extra notes read with the row, such as a scope or tier note. */
		describedby?: string;
		/** It opens another surface, so it shows the chevron. */
		opens?: boolean;
		/** Static name for the problem-report trail (a string literal, never data). */
		trail?: string;
		onclick: () => void;
	} = $props();
	const id = $props.id();
</script>

<button
	class="tool-row bu-action"
	data-variant="quiet"
	{disabled}
	aria-labelledby="{id}-label"
	aria-describedby={[describedby, `${id}-detail`, `${id}-aside`].filter(Boolean).join(' ')}
	aria-haspopup={opens ? 'dialog' : undefined}
	data-trail={trail}
	{onclick}
>
	<Icon size={18} aria-hidden="true" />
	<span class="tool-text"
		><span class="tool-label" id="{id}-label">{label}</span><span
			class="tool-detail"
			id="{id}-detail">{detail}</span
		></span
	>
	<span class="tool-aside" id="{id}-aside" data-paid={paid || undefined}>{aside}</span>
	{#if opens}<SurfaceChevron />{/if}
</button>

<style>
	.tool-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 56px;
		padding: 8px 12px;
		text-align: start;
		border-radius: 0;
	}
	:global(.tool-row) + .tool-row {
		border-block-start: 1px solid var(--bu-line);
	}
	.tool-row > :global(svg:first-child) {
		color: var(--text-2);
	}
	.tool-text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.tool-label {
		overflow-wrap: anywhere;
		font-weight: 600;
	}
	.tool-detail {
		color: var(--text-2);
		font-size: var(--fs-sm);
		overflow-wrap: anywhere;
	}
	.tool-aside {
		font-size: var(--fs-sm);
		color: var(--ok);
		white-space: nowrap;
	}
	.tool-aside[data-paid] {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
</style>
