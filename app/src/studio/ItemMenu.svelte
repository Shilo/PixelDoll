<script lang="ts">
	// One shared per-tile item menu (approved in docs/design/2026-11-11-ui-refinement/ui-lab-7.html): an arrowed popover
	// anchored to the tile's ⋮ at every size, with Wear as a toggle in its header.
	import PopoverArrow from './PopoverArrow.svelte';
	import Thumb from './Thumb.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import { extendable } from './create.ts';
	import { groupOf, groupLabel } from './model.ts';
	import { ui, doc, store, view, wear, isDemo, withKey, openNewItem } from './state.svelte.ts';
	import { Circle, CircleCheck, Info, RefreshCw, Trash, TriangleAlert, EyeOff } from './icons.ts';

	let {
		id,
		status,
		onremove,
		open = $bindable(false)
	}: {
		/** The item the menu is for. */
		id: string;
		/** The item's status words (see Wardrobe's statusOf). */
		status: { look: string; missing: string; hidden: boolean };
		/** Removes the item for good once confirmed (Wardrobe moves focus to a neighbor afterwards). */
		onremove: (id: string) => void;
		open?: boolean;
	} = $props();
	let menu = $state<HTMLElement>();
	let confirming = $state(false);
	const m = $derived(store.project?.manifest);
	const it = $derived(m?.items.find((i) => i.id === id));
	const on = $derived(!!it && doc.items[it.slot] === it.id && !doc.drafts[it.slot]);
	const remakeOnly = $derived(!!m && !!it?.copiedFrom && !extendable(m, it.id));
	const warn = $derived(!!(status.look || status.missing));
	// Worn items say so first; any status follows, and an item with neither names its category.
	const sentence = $derived(
		[
			on ? 'Wearing' : '',
			status.look,
			status.missing,
			status.hidden ? 'Hidden by another item' : ''
		]
			.filter(Boolean)
			.join(' · ') || (it ? groupLabel(groupOf(it.slot).id) : '')
	);
	function close() {
		menu?.hidePopover();
	}
	function act(fn: () => void) {
		close();
		fn();
	}
	// A press on a tile while the menu is open only dismisses the menu (the popover's light dismiss); its click must not
	// also wear or take off that tile. Other ⋮ buttons keep their own click (they reopen the menu for their tile).
	$effect(() => {
		if (!open) return;
		const down = (e: PointerEvent) => {
			const target = e.target instanceof Element ? e.target : null;
			if (!target?.closest('.bu-tile') || menu?.contains(target)) return;
			const swallow = (click: MouseEvent) => {
				click.preventDefault();
				click.stopImmediatePropagation();
			};
			// Only the click this press makes; a press that turns into a scroll or drag makes none.
			const stop = () =>
				setTimeout(() => window.removeEventListener('click', swallow, { capture: true }));
			window.addEventListener('click', swallow, { capture: true, once: true });
			window.addEventListener('pointerup', stop, { capture: true, once: true });
			window.addEventListener('pointercancel', stop, { capture: true, once: true });
		};
		window.addEventListener('pointerdown', down, { capture: true });
		return () => window.removeEventListener('pointerdown', down, { capture: true });
	});
	// Keep focus inside the menu when its rows swap for the removal confirmation.
	const focusKeep = (node: HTMLElement) => {
		node.focus();
	};
</script>

<div
	id="item-menu"
	class="menu item-menu bu-popover-anchor"
	data-placement="bottom-start"
	popover
	bind:this={menu}
	onfocusout={(e) => {
		// Like any menu, Tab or Shift+Tab out of it (or focus moved elsewhere) closes it. A null target is a click on the
		// menu's own text or a row swapped out; outside clicks are light-dismissed by the popover itself. A ⋮ being
		// pressed (:active) is left to its own click, which toggles this menu or reopens it for that tile.
		const to = e.relatedTarget;
		if (
			open &&
			to instanceof HTMLElement &&
			!menu?.contains(to) &&
			!to.matches('[popovertarget="item-menu"]:active')
		)
			close();
	}}
	ontoggle={(e) => {
		open = e.newState === 'open';
		if (!open) confirming = false;
		// Open on the first command, not the header's Wear toggle.
		popoverFocus(e, false);
		if (open)
			requestAnimationFrame(() =>
				menu?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true })
			);
	}}
>
	<PopoverArrow />
	{#if it && m && view.project}
		<div class="menu-surface bu-popover-surface bu-floating">
			<div class="item-menu-head">
				<span class="item-menu-art" aria-hidden="true"
					><Thumb project={view.project} item={it} /></span
				>
				<span class="item-menu-title">
					<strong id="item-menu-name">{it.name}</strong>
					<small class:look={warn}
						>{#if warn}<TriangleAlert size={12} aria-hidden="true" />{:else if status.hidden}<EyeOff
								size={12}
								aria-hidden="true"
							/>{/if}<span>{sentence}</span></small
					>
				</span>
				<!-- One fixed name; aria-pressed carries the state, and the glyph changes from an empty to a checked circle. -->
				<button
					class="bu-action item-menu-wear"
					data-variant="outline"
					aria-pressed={on}
					aria-label="Wear {it.name}"
					title={on ? 'Wearing (take off)' : 'Wear'}
					onclick={() => wear(it.id)}
					>{#if on}<CircleCheck size={20} aria-hidden="true" />{:else}<Circle
							size={20}
							aria-hidden="true"
						/>{/if}</button
				>
			</div>
			{#if confirming}
				<div class="item-menu-confirm" role="group" aria-labelledby="item-menu-confirm">
					<p class="small" id="item-menu-confirm">Remove {it.name} for good?</p>
					<div class="actions">
						<button
							class="bu-action btn danger"
							data-variant="outline"
							onclick={() => act(() => onremove(it.id))}><Trash size={14} />Remove for good</button
						>
						<button
							class="bu-action btn plain"
							data-variant="quiet"
							{@attach focusKeep}
							onclick={() => (confirming = false)}>Keep</button
						>
					</div>
				</div>
			{:else}
				<div role="menu" aria-labelledby="item-menu-name">
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() =>
							act(() => {
								ui.selected = it.id;
								ui.sheet = 'item';
							})}><Info size={16} aria-hidden="true" />Details…</button
					>
					{#if !isDemo() && it.prompt}
						<!-- The New item sheet that opens next prices the attempt before anything is spent. -->
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() =>
								act(() =>
									withKey(() =>
										openNewItem(groupOf(it.slot).id, { slot: it.slot, prompt: it.prompt })
									)
								)}
							><RefreshCw size={16} aria-hidden="true" />{remakeOnly
								? `Make one for ${m.name}…`
								: 'Try again…'}<small class="row-aside">Paid</small></button
						>
					{/if}
					{#if !isDemo()}
						<hr class="bu-separator" />
						<button
							class="row bu-action danger"
							data-variant="quiet"
							role="menuitem"
							onclick={() => (confirming = true)}
							><Trash size={16} aria-hidden="true" />Remove…</button
						>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
