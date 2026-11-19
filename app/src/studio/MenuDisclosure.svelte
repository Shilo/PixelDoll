<script module lang="ts">
	import { SvelteSet } from 'svelte/reactivity';

	const expandedSections = new SvelteSet<string>();
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown, ChevronRight } from './icons.ts';

	let {
		sectionKey,
		label,
		icon,
		aside,
		children
	}: {
		sectionKey: string;
		label: string;
		icon?: Snippet;
		aside?: Snippet;
		children: Snippet;
	} = $props();
	const panelId = $props.id();
	const open = $derived(expandedSections.has(sectionKey));

	function toggle() {
		if (open) expandedSections.delete(sectionKey);
		else expandedSections.add(sectionKey);
	}
</script>

<button
	type="button"
	class="row bu-action"
	data-variant="quiet"
	aria-expanded={open}
	aria-controls={panelId}
	onclick={toggle}
>
	{@render icon?.()}
	<span class="row-name">{label}</span>
	{#if open}
		<ChevronDown size={16} aria-hidden="true" />
	{:else}
		{@render aside?.()}
		<ChevronRight size={16} aria-hidden="true" />
	{/if}
</button>
<div id={panelId} role="group" aria-label={label} hidden={!open}>
	{@render children()}
</div>
