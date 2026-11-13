<script lang="ts">
	// One shared per-tile item menu (approved in docs/design/2026-11-11-ui-refinement/ui-lab-7.html): an arrowed popover
	// anchored to the tile's ⋮ at every size, with Wear as a toggle in its header.
	import PopoverArrow from './PopoverArrow.svelte';
	import { downloadItemZip } from './download.svelte.ts';
	import Thumb from './Thumb.svelte';
	import SharedThumb from './SharedThumb.svelte';
	import type { SharedItem } from '../lib/equipment/shared.ts';
	import TileMarks, { type Mark } from './TileMarks.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import { extendable } from './create.ts';
	import { groupOf, groupLabel, slotLabel } from './model.ts';
	import { OTHER_HAND, twoHanded } from '../lib/compose/compose.ts';
	import type { generationStatus } from './generationStatus.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import {
		ui,
		doc,
		store,
		view,
		wear,
		isDemo,
		openNewItem,
		toggleTwoHanded,
		cancelGen,
		openGenerationReview,
		addShared,
		type Gen
	} from './state.svelte.ts';
	import {
		Circle,
		Download,
		CircleCheck,
		CopyPlus,
		HandGrab,
		Info,
		RefreshCw,
		Trash
	} from './icons.ts';

	let {
		id,
		entry,
		marks,
		onremove,
		open = $bindable(false),
		generation,
		generationInfo
	}: {
		/** The item the menu is for. */
		id: string;
		/** Another character's item the menu is for instead. */
		entry?: SharedItem;
		/** The icons the item's tile shows (Wardrobe's marksOf or sharedMarks): the menu explains each one. */
		marks: Mark[];
		/** Removes the item for good once confirmed (Wardrobe moves focus to a neighbor afterwards). */
		onremove: (id: string) => void;
		open?: boolean;
		generation?: Gen;
		generationInfo?: ReturnType<typeof generationStatus>;
	} = $props();
	let menu = $state<HTMLElement>();
	/** The item awaiting its Delete alert; captured so the alert outlives the closed menu. */
	let deleting = $state<{ id: string; name: string } | null>(null);
	/** The running generation's Cancel alert is open. */
	let cancelling = $state(false);
	let cancelBusy = $state(false);
	let cancelError = $state('');
	async function cancel() {
		if (!generation) return;
		cancelBusy = true;
		cancelError = '';
		try {
			if (await cancelGen(generation)) {
				cancelling = false;
				close();
			}
		} catch (error) {
			cancelError =
				error instanceof Error
					? error.message
					: 'Could not save cancellation. Keep this tab open and try again.';
		} finally {
			cancelBusy = false;
		}
	}
	const m = $derived(store.project?.manifest);
	const it = $derived(m?.items.find((i) => i.id === id));
	const on = $derived(!!it && doc.items[it.slot] === it.id && !doc.drafts[it.slot]);
	const remakeOnly = $derived(!!m && !!it?.copiedFrom && !extendable(m, it.id));
	const otherHand = $derived(it ? OTHER_HAND[it.slot] : undefined);
	const both = $derived(!!m && !!it && twoHanded(m, it));
	// The header names the category; the lines below it explain each of the tile's icons.
	const sentence = $derived(
		it
			? [groupLabel(groupOf(it.slot).id), both ? 'Two-handed' : ''].filter(Boolean).join(' · ')
			: ''
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
	// Keep focus inside the menu when a row appears in place of another.
	const focusKeep = (node: HTMLElement) => {
		node.focus();
	};
	/** Close the menu (focus returns to its ⋮), then ask in an alert. */
	function ask(open: () => void) {
		close();
		open();
	}
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
		if (!open && !cancelling) cancelError = '';
		// Open on the first command, not the header's Wear toggle.
		popoverFocus(e, false);
		if (open)
			requestAnimationFrame(() =>
				menu?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true })
			);
	}}
>
	<PopoverArrow />
	{#if generation && generationInfo}
		<div class="menu-surface bu-popover-surface bu-floating">
			<div class="item-menu-head">
				<span class="item-menu-title"
					><strong id="generation-menu-name">{generation.input.name}</strong><small
						>{generationInfo.text}</small
					></span
				>
			</div>
			<div class="item-menu-confirm">
				<p class="small">{generationInfo.detail}</p>
				{#if generation.phase === 'running'}<p class="small">
						{generation.status || 'Preparing your item'} · {generation.input.prompt}
					</p>{/if}
				<div role="menu" aria-labelledby="generation-menu-name">
					{#if generation.cancelSaveFailed}<button
							{@attach focusKeep}
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							disabled={cancelBusy}
							onclick={cancel}>Save cancellation</button
						>{/if}
					{#if generation.phase !== 'running'}
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() => act(() => void openGenerationReview(generation!.draft.spec.id))}
							><Info size={16} />Review item…</button
						>
					{/if}
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() => act(() => (ui.sheet = 'activity'))}><Info size={16} />Activity…</button
					>
					{#if generation.phase === 'running' && $queue.role !== 'follower'}
						<button
							{@attach focusKeep}
							class="row bu-action danger"
							data-variant="quiet"
							role="menuitem"
							onclick={() => ask(() => (cancelling = true))}
							><Trash size={16} />Cancel generation…</button
						>
					{/if}
				</div>
				{#if generation.phase === 'running' && $queue.role === 'follower'}<p class="small">
						Cancel from the tab that is generating this item.
					</p>{/if}
				{#if cancelError && !cancelling}<p class="notice bad small" role="alert">
						{cancelError}
					</p>{/if}
			</div>
		</div>
	{:else if entry && m}
		{@const remake = entry.fit === 'remake'}
		<div class="menu-surface bu-popover-surface bu-floating">
			<div class="item-menu-head">
				<span class="item-menu-art" aria-hidden="true"><SharedThumb {entry} /></span>
				<span class="item-menu-title">
					<strong id="item-menu-name">{entry.item.name}</strong>
					<small>{groupLabel(groupOf(entry.item.slot).id)}</small>
				</span>
			</div>
			<TileMarks {marks} list />
			<div role="menu" aria-labelledby="item-menu-name">
				{#if !remake}
					<!-- Free: copies it to this character and wears it; the demo saves an editable copy of itself first. -->
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() => act(() => void addShared(entry))}
						><Circle size={16} aria-hidden="true" />{isDemo()
							? 'Wear in a copy of the demo'
							: 'Wear'}<small class="row-aside">Free</small></button
					>
				{/if}
				<!-- The New item sheet that opens next prices it before anything is spent; an item without a description is
				     described by its name. -->
				<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					onclick={() =>
						act(() =>
							openNewItem(groupOf(entry.item.slot).id, {
								slot: entry.item.slot,
								prompt: entry.item.prompt || entry.item.name,
								name: entry.item.name
							})
						)}
					><RefreshCw size={16} aria-hidden="true" />Make one for {m.name}…<small class="row-aside"
						>Paid</small
					></button
				>
			</div>
		</div>
	{:else if it && m && view.project}
		<div class="menu-surface bu-popover-surface bu-floating">
			<div class="item-menu-head">
				<span class="item-menu-art" aria-hidden="true"
					><Thumb project={view.project} item={it} /></span
				>
				<span class="item-menu-title">
					<strong id="item-menu-name">{it.name}</strong>
					<small>{sentence}</small>
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
			<TileMarks {marks} list />
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
				{#if otherHand}
					<!-- Free and instant: a two-handed item takes both hands (wearing it takes the other hand's item off). -->
					<label class="row bu-action bu-check item-menu-switch" data-variant="quiet">
						<span><HandGrab size={16} aria-hidden="true" />Two-handed</span>
						<input
							class="bu-switch"
							type="checkbox"
							role="menuitemcheckbox"
							aria-checked={both}
							checked={both}
							onchange={() => toggleTwoHanded(it.id)}
							onkeydown={(e) => {
								// a menu item takes Enter as well as Space (a native checkbox only toggles on Space)
								if (e.key !== 'Enter') return;
								e.preventDefault();
								toggleTwoHanded(it.id);
							}}
						/>
					</label>
					{#if !isDemo() && it.prompt && !both}
						<!-- The same description drawn for the other hand; the New item sheet prices it first. -->
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() =>
								act(() =>
									openNewItem(groupOf(otherHand).id, { slot: otherHand, prompt: it.prompt })
								)}
							><CopyPlus size={16} aria-hidden="true" />Make one for the {slotLabel(
								otherHand
							)}…<small class="row-aside">Paid</small></button
						>
					{/if}
				{/if}
				{#if !isDemo() && it.prompt}
					<!-- The New item sheet that opens next prices the attempt before anything is spent. -->
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() =>
							act(() =>
								openNewItem(groupOf(it.slot).id, {
									slot: it.slot,
									prompt: it.prompt,
									route: it.route
								})
							)}
						><RefreshCw size={16} aria-hidden="true" />{remakeOnly
							? `Make one for ${m.name}…`
							: 'Try again…'}<small class="row-aside">Paid</small></button
					>
				{/if}
				<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					onclick={() => act(() => void downloadItemZip(it.id))}
					><Download size={16} />Download ZIP</button
				>
				<hr class="bu-separator" />
				<DeleteRow
					class="bu-action"
					label="Delete item…"
					locked={isDemo() ? "Demo items can't be deleted" : ''}
					onclick={() => ask(() => (deleting = { id: it.id, name: it.name }))}
				/>
			</div>
		</div>
	{/if}
</div>
{#if deleting}
	{@const target = deleting}
	<ConfirmDialog
		title="Delete {target.name}?"
		action="Delete"
		oncancel={() => (deleting = null)}
		onconfirm={() => {
			const id = target.id;
			deleting = null;
			onremove(id);
		}}><p>This can't be undone.</p></ConfirmDialog
	>
{/if}
<!-- A failed save keeps the alert open to show why, even though the generation has already stopped. -->
{#if cancelling && generation && (generation.phase === 'running' || cancelError)}
	<ConfirmDialog
		title="Cancel {generation.input.name}?"
		action="Cancel item"
		busyAction="Canceling…"
		cancel="Keep"
		busy={cancelBusy}
		problem={cancelError}
		oncancel={() => {
			cancelling = false;
			cancelError = '';
		}}
		onconfirm={cancel}
		><p>
			Generations already used are not refunded, and requests already sent may still charge.
		</p></ConfirmDialog
	>
{/if}
