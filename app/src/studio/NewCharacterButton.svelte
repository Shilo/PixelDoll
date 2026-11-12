<script lang="ts">
	import { ui } from './state.svelte.ts';
	import { Plus, Download, Sparkles } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import { popoverFocus } from './experience/focus.ts';
	let { row = false, compact = false }: { row?: boolean; compact?: boolean } = $props();
	const id = $props.id();
	let menu: HTMLElement;
	function choose(sheet: 'create' | 'importZip' | 'importPixelLab') {
		menu.hidePopover();
		document
			.querySelectorAll<HTMLElement>('[popover]:popover-open')
			.forEach((popover) => popover.hidePopover());
		ui.sheet = sheet;
	}
</script>

<button
	class="bu-action"
	class:new-character-row={row}
	class:selection-create={!row && !compact}
	class:cast-action={compact}
	data-variant={row ? 'row' : 'outline'}
	aria-label="New character"
	aria-haspopup="menu"
	popovertarget={id}
>
	<span class:new-character-icon={row}><Plus size={row ? 24 : 16} /></span><span
		>{compact ? 'New' : 'New character'}</span
	>
</button>
<div
	{id}
	class="menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	bind:this={menu}
	role="menu"
	aria-label="New character"
	ontoggle={popoverFocus}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		<button class="row" role="menuitem" onclick={() => choose('create')}
			><Sparkles size={16} />Create from scratch…</button
		>
		<button class="row" role="menuitem" onclick={() => choose('importZip')}
			><Download size={16} />Import from device…</button
		>
		<button class="row" role="menuitem" onclick={() => choose('importPixelLab')}
			><Download size={16} />Import from PixelLab…</button
		>
	</div>
</div>
