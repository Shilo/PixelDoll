<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import { contextMenu } from '../lib/input/contextMenu.ts';
	import { popoverFocus } from './experience/focus.ts';
	import { EllipsisVertical } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	let {
		name,
		key,
		entry = $bindable(),
		children,
		actions
	}: {
		name: string;
		/** Finds the row again in its list (`data-rows`), for focus after it goes to the Trash. */
		key?: string;
		entry?: HTMLElement;
		children?: Snippet;
		actions: Snippet<[() => void]>;
	} = $props();
	const menuId = $props.id();
	let more = $state<HTMLButtonElement>();
	let menu: HTMLElement;
	let expanded = $state(false);
	let anchor: DOMRect | undefined;
	export function show(source: HTMLElement, at?: DOMRect) {
		if (menu.matches(':popover-open')) close();
		anchor = at;
		menu.showPopover({ source });
	}
	function open() {
		if (!menu.matches(':popover-open')) more?.click();
	}
	function close() {
		menu.hidePopover();
	}
</script>

{#if children}<div
		class="character-entry hover-actions"
		data-row={key}
		bind:this={entry}
		{@attach contextMenu(open)}
	>
		{@render children()}
		<button
			bind:this={more}
			class="bu-action character-more hover-actions-button"
			data-variant="quiet"
			aria-label={t('experience.moreActionsFor', { name })}
			title={t('experience.moreActionsFor', { name })}
			aria-haspopup="menu"
			aria-expanded={expanded}
			popovertarget={menuId}><EllipsisVertical size={18} /></button
		>
	</div>{/if}
<div
	id={menuId}
	class="menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	bind:this={menu}
	role="menu"
	tabindex="-1"
	onkeydown={(event) => {
		// Tab or Shift+Tab leaves the menu, which closes; focus goes on from its trigger.
		if (event.key === 'Tab') close();
	}}
	onfocusout={(event) => {
		// Like any menu, Tab or Shift+Tab out of it closes it, so it never covers where the keyboard went.
		const to = event.relatedTarget;
		if (to instanceof HTMLElement && !menu.contains(to) && to !== more) close();
	}}
	aria-label={t('experience.actionsFor', { name })}
	ontoggle={(event) => {
		expanded = event.newState === 'open';
		popoverFocus(event, true, anchor);
		if (!expanded) anchor = undefined;
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
