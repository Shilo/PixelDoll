<script lang="ts">
	import type { Snippet } from 'svelte';
	import { contextMenu } from '../lib/input/contextMenu.ts';
	import { popoverFocus } from './experience/focus.ts';
	import { EllipsisVertical } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	let {
		name,
		children,
		actions
	}: { name: string; children: Snippet; actions: Snippet<[() => void]> } = $props();
	const menuId = $props.id();
	let more: HTMLButtonElement;
	let menu: HTMLElement;
	let expanded = $state(false);
	function open() {
		if (!menu.matches(':popover-open')) more.click();
	}
	function close() {
		menu.hidePopover();
	}
</script>

<div class="character-entry" {@attach contextMenu(open)}>
	{@render children()}
	<button
		bind:this={more}
		class="bu-action character-more"
		data-variant="quiet"
		aria-label={`More actions for ${name}`}
		aria-haspopup="menu"
		aria-expanded={expanded}
		popovertarget={menuId}><EllipsisVertical size={18} /></button
	>
</div>
<div
	id={menuId}
	class="menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	bind:this={menu}
	role="menu"
	aria-label={`Actions for ${name}`}
	ontoggle={(event) => {
		expanded = event.newState === 'open';
		popoverFocus(event);
	}}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">{@render actions(close)}</div>
</div>

<style>
	.character-entry {
		width: 100%;
	}
</style>
