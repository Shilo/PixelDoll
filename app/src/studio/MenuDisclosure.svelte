<script lang="ts">
	import type { Snippet } from 'svelte';
	import { on } from 'svelte/events';
	import { ChevronDown, ChevronRight } from './icons.ts';

	let {
		label,
		icon,
		aside,
		children
	}: {
		label: string;
		icon?: Snippet;
		aside?: Snippet;
		children: Snippet;
	} = $props();
	const panelId = $props.id();
	let open = $state(false);

	function resetOnPopoverClose(button: HTMLButtonElement) {
		const popover = button.closest<HTMLElement>('[popover]');
		if (!popover) return;
		return on(popover, 'beforetoggle', (event) => {
			if (event.target === popover && event.newState === 'closed') open = false;
		});
	}
</script>

<button
	type="button"
	class="row bu-action"
	data-variant="quiet"
	aria-expanded={open}
	aria-controls={panelId}
	onclick={() => (open = !open)}
	{@attach resetOnPopoverClose}
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
