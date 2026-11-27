<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { displayMessage, displayNestedMessage, errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	// One shared per-tile item menu (approved in docs/design/2026-11-11-ui-refinement/ui-lab-7.html): an arrowed popover
	// anchored to the tile's ⋮ at every size, with Wear as a toggle in its header.
	import PopoverArrow from './PopoverArrow.svelte';
	import ItemActions from './ItemActions.svelte';
	import Thumb from './Thumb.svelte';
	import SharedThumb from './SharedThumb.svelte';
	import type { SharedItem } from '../lib/equipment/shared.ts';
	import TileMarks, { type Mark } from './TileMarks.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import { swallowTilePress } from './tilePress.ts';
	import { slotLabelMessage } from './slots.ts';
	import { twoHanded } from '../lib/compose/compose.ts';
	import type { generationStatus } from './generationStatus.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import {
		ui,
		doc,
		store,
		view,
		isDemo,
		openNewItem,
		cancelGen,
		openGenerationReview,
		addShared,
		type Gen
	} from './state.svelte.ts';
	import { Check, Circle, Info, RefreshCw, Trash } from './icons.ts';

	let {
		id,
		entry,
		marks,
		onremove,
		onmove,
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
		onmove: (id: string, target: string) => void;
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
	let cancelError = $state<Message | string>('');
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
				error instanceof Error ? errorMessage(error) : message('itemMenu.cancelSaveError');
		} finally {
			cancelBusy = false;
		}
	}
	const m = $derived(store.project?.manifest);
	const it = $derived(m?.items.find((i) => i.id === id));
	let pickingSlot = $state(false);
	const on = $derived(!!it && doc.items[it.slot] === it.id && !doc.drafts[it.slot]);
	const both = $derived(!!m && !!it && twoHanded(m, it));
	// The header names the category; the lines below it explain each of the tile's icons.
	const sentence = $derived(
		it
			? [displayMessage(slotLabelMessage(m, it.slot)), both ? t('itemMenu.twoHanded') : '']
					.filter(Boolean)
					.join(' · ')
			: ''
	);
	function close() {
		menu?.hidePopover();
	}
	function act(fn: () => void) {
		close();
		fn();
	}
	// A press on a tile while the menu is open only dismisses the menu; other ⋮ buttons keep their own click (they reopen
	// the menu for their tile).
	$effect(() => {
		if (open) return swallowTilePress(() => menu);
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
		if (!open) pickingSlot = false;
		if (!open && !cancelling) cancelError = '';
		// Open on the first command, not the header's Wear toggle. A focus already inside the menu is left alone: under
		// load this frame can land after someone (or a keyboard-automation step) has already moved to another row.
		popoverFocus(e, false);
		if (open)
			requestAnimationFrame(() => {
				if (!menu || menu.contains(document.activeElement)) return;
				menu.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true });
			});
	}}
>
	<PopoverArrow />
	{#if generation && generationInfo}
		<div class="menu-surface bu-popover-surface bu-floating">
			<div class="item-menu-head">
				<span class="item-menu-title"
					><strong id="generation-menu-name">{generation.input.name}</strong><small
						>{displayMessage(generationInfo.text)}</small
					></span
				>
			</div>
			<div class="item-menu-confirm">
				<p class="small">{displayNestedMessage(generationInfo.detail)}</p>
				{#if generation.phase === 'running'}<p class="small">
						{t('itemMenu.runningDetail', {
							status: displayMessage(generation.status || message('itemMenu.preparing')),
							prompt: generation.input.prompt
						})}
					</p>{/if}
				<div role="menu" aria-labelledby="generation-menu-name">
					{#if generation.cancelSaveFailed}<button
							{@attach focusKeep}
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							disabled={cancelBusy}
							onclick={cancel}
							><Check size={16} aria-hidden="true" />{t(
								'generation.status.saveCancellation'
							)}</button
						>{/if}
					{#if generation.phase !== 'running'}
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() => act(() => void openGenerationReview(generation!.draft.spec.id))}
							><Info size={16} />{openerLabel(t('itemMenu.reviewItem'))}<SurfaceChevron /></button
						>
					{/if}
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() => act(() => (ui.sheet = 'activity'))}
						><Info size={16} />{openerLabel(t('itemMenu.activity'))}<SurfaceChevron /></button
					>
					{#if generation.phase === 'running' && $queue.role !== 'follower'}
						<button
							{@attach focusKeep}
							class="row bu-action danger"
							data-variant="quiet"
							role="menuitem"
							onclick={() => ask(() => (cancelling = true))}
							><Trash size={16} />{openerLabel(t('itemMenu.cancelGeneration'))}<SurfaceChevron
							/></button
						>
					{/if}
				</div>
				{#if generation.phase === 'running' && $queue.role === 'follower'}<p class="small">
						{t('itemMenu.cancelFromTheTabThatIsGenerating')}
					</p>{/if}
				{#if cancelError && !cancelling}<p class="notice bad small" role="alert">
						{displayMessage(cancelError)}<ReportButton error={cancelError} />
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
					<small>{displayMessage(slotLabelMessage(entry.source, entry.item.slot))}</small>
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
							? t('itemMenu.wearInACopyOfTheDemo')
							: t('common.wear')}<small class="row-aside">{t('common.free')}</small></button
					>
				{/if}
				<!-- The New item sheet that opens next prices it before anything is spent. -->
				<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					onclick={() =>
						act(() =>
							openNewItem(entry.item.slot, {
								slot: entry.item.slot,
								prompt: entry.item.prompt,
								name: entry.item.name
							})
						)}
					><RefreshCw size={16} aria-hidden="true" />{openerLabel(
						t('itemMenu.remake')
					)}<SurfaceChevron /></button
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
			</div>
			<TileMarks {marks} list />
			<ItemActions
				{m}
				{it}
				worn={on}
				labelledby="item-menu-name"
				bind:picking={pickingSlot}
				{act}
				onmove={(target) => onmove(it.id, target)}
				ondelete={() => (deleting = { id: it.id, name: it.name })}
			/>
		</div>
	{/if}
</div>
{#if deleting}
	{@const target = deleting}
	<ConfirmDialog
		title={t('common.deleteNamed', { name: target.name })}
		action={t('common.moveToTrash')}
		oncancel={() => (deleting = null)}
		onconfirm={() => {
			const id = target.id;
			deleting = null;
			onremove(id);
		}}><p>{t('common.deleteRecoverable')}</p></ConfirmDialog
	>
{/if}
<!-- A failed save keeps the alert open to show why, even though the generation has already stopped. -->
{#if cancelling && generation && (generation.phase === 'running' || cancelError)}
	<ConfirmDialog
		title={t('itemMenu.titleCancelName', { name: generation.input.name })}
		action={t('itemMenu.cancelItem')}
		busyAction={t('itemMenu.canceling')}
		cancel={t('itemMenu.keep')}
		busy={cancelBusy}
		problem={displayMessage(cancelError)}
		oncancel={() => {
			cancelling = false;
			cancelError = '';
		}}
		onconfirm={cancel}
		><p>
			{t('itemMenu.generationsAlreadyUsedAreNotRefundedAnd')}
		</p></ConfirmDialog
	>
{/if}
