<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ui } from './state.svelte.ts';
	import { downloadCharacterZip } from './download.svelte.ts';
	import { EllipsisVertical, Download, Info } from './icons.ts';
	import DeleteRow, { DEMO_CHARACTER_LOCKED } from './DeleteRow.svelte';
	import { contextMenu } from '../lib/input/contextMenu.ts';
	import { popoverFocus } from './experience/focus.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	let { id, name, children }: { id: string; name: string; children: Snippet } = $props();
	const menuId = $props.id();
	let more: HTMLButtonElement;
	let menu: HTMLElement;
	function open() {
		if (!menu.matches(':popover-open')) more.click();
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
	ontoggle={popoverFocus}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		<button
			class="row"
			role="menuitem"
			onclick={() => {
				menu.hidePopover();
				void downloadCharacterZip(id);
			}}><Download size={16} />Download ZIP</button
		>
		<button
			class="row"
			role="menuitem"
			onclick={() => {
				menu.hidePopover();
				document
					.querySelectorAll<HTMLElement>('[popover]:popover-open')
					.forEach((popover) => popover.hidePopover());
				ui.details = id;
				ui.sheet = 'details';
			}}><Info size={16} />Details…</button
		>
		<DeleteRow
			label="Delete character…"
			locked={id.startsWith('fixture:') ? DEMO_CHARACTER_LOCKED : ''}
			onclick={() => {
				menu.hidePopover();
				document
					.querySelectorAll<HTMLElement>('[popover]:popover-open')
					.forEach((popover) => popover.hidePopover());
				ui.deleting = id;
				ui.sheet = 'delete';
			}}
		/>
	</div>
</div>
