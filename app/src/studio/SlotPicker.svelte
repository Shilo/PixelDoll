<script lang="ts">
	// Where a new item goes: one field that names the slot with its Wardrobe icon, opening every slot of this character.
	// Slots hidden from the Wardrobe come last under their own heading, so all slots stay one tap away.
	import { t } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	import type { Manifest } from '../lib/store/manifest.ts';
	import { popoverFocus } from './experience/focus.ts';
	import GroupIcon from './GroupIcon.svelte';
	import { Check, ChevronDown } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import { slotLabelMessage, type Category } from './slots.ts';

	let {
		manifest,
		categories,
		shown,
		value,
		label,
		disabled = false,
		onselect
	}: {
		manifest: Pick<Manifest, 'slots'> | undefined;
		categories: readonly Category[];
		/** Slots the Wardrobe shows; the rest are listed after them. */
		shown: readonly Category[];
		value: string;
		label: string;
		disabled?: boolean;
		onselect: (key: string) => void;
	} = $props();

	const menuId = $props.id();
	let menu: HTMLDivElement;
	let expanded = $state(false);
	const name = (key: string) => displayMessage(slotLabelMessage(manifest, key));
	const visible = $derived(categories.filter((c) => shown.some((s) => s.key === c.key)));
	const hidden = $derived(categories.filter((c) => !shown.some((s) => s.key === c.key)));
</script>

<div class="field slot-field">
	<span class="label" aria-hidden="true">{label}</span>
	<button
		type="button"
		class="slot-trigger bu-action"
		data-variant="field"
		aria-label="{label}: {name(value)}"
		aria-haspopup="menu"
		aria-expanded={expanded}
		popovertarget={menuId}
		{disabled}
		onkeydown={(event) => {
			if (!expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
				event.preventDefault();
				menu.showPopover({ source: event.currentTarget });
			}
		}}
	>
		<GroupIcon group={value} size={18} />
		<span class="slot-value">{name(value)}</span>
		<ChevronDown size={16} aria-hidden="true" />
	</button>
</div>
<div
	id={menuId}
	class="menu slot-menu bu-popover-anchor"
	data-placement="bottom-start"
	popover
	role="menu"
	aria-label={label}
	tabindex={-1}
	bind:this={menu}
	ontoggle={(event) => {
		expanded = event.newState === 'open';
		popoverFocus(event);
	}}
	onkeydown={(event) => {
		if (event.key === 'Tab')
			requestAnimationFrame(() => {
				if (menu.matches(':popover-open')) menu.hidePopover();
			});
	}}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		{#each visible as category (category.key)}{@render option(category.key)}{/each}
		{#if hidden.length}
			<div role="group" aria-label={t('wardrobe.notShown')}>
				<div class="menu-sec" aria-hidden="true">{t('wardrobe.notShown')}</div>
				{#each hidden as category (category.key)}{@render option(category.key)}{/each}
			</div>
		{/if}
	</div>
</div>

{#snippet option(key: string)}
	<button
		type="button"
		class="row slot-row bu-action"
		data-variant="quiet"
		role="menuitemradio"
		aria-checked={value === key}
		tabindex={-1}
		onclick={() => {
			if (value !== key) onselect(key);
			menu.hidePopover();
		}}
	>
		<GroupIcon group={key} size={18} />
		<span class="slot-name">{name(key)}</span>
		{#if value === key}<Check size={16} aria-hidden="true" />{/if}
	</button>
{/snippet}

<style>
	.slot-field {
		display: grid;
		gap: 4px;
	}
	.slot-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		padding: 8px 12px;
		font-size: 16px;
		text-align: start;
	}
	.slot-value,
	.slot-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.slot-trigger :global(svg),
	.slot-row :global(svg) {
		flex: none;
	}
	:global(.studio-app) .slot-menu {
		width: min(280px, calc(100vw - 16px));
	}
	.slot-menu .menu-surface {
		max-block-size: min(420px, 60dvh);
		overflow-y: auto;
	}
	.slot-menu .slot-row {
		gap: 10px;
		height: auto;
		min-height: 44px;
		padding: 4px 10px;
		font-size: inherit;
		text-align: start;
	}
</style>
