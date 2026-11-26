<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { canEditItemAppearance } from './appearanceSource.ts';
	import { t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { tick } from 'svelte';
	import { displayMessage, displayNestedMessage, errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	// One shared per-tile item menu (approved in docs/design/2026-11-11-ui-refinement/ui-lab-7.html): an arrowed popover
	// anchored to the tile's ⋮ at every size, with Wear as a toggle in its header.
	import PopoverArrow from './PopoverArrow.svelte';
	import { downloadItemZip } from './download.svelte.ts';
	import { HEALTH_LABEL, healthOf, missingFramesNote } from './model.ts';
	import Thumb from './Thumb.svelte';
	import SharedThumb from './SharedThumb.svelte';
	import type { SharedItem } from '../lib/equipment/shared.ts';
	import TileMarks, { type Mark } from './TileMarks.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import { swallowTilePress } from './tilePress.ts';
	import { extendable } from './movePricing.ts';
	import { slotLabelMessage } from './slots.ts';
	import { twoHanded } from '../lib/compose/compose.ts';
	import { canRecolor, recolorItem } from './recolorItem.ts';
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
		openRename,
		openAppearance,
		cancelGen,
		openGenerationReview,
		addShared,
		itemSlotTargets,
		openFrames,
		type Gen
	} from './state.svelte.ts';
	import {
		Check,
		Circle,
		Download,
		CircleCheck,
		Grid2x2,
		Info,
		ArrowRightLeft,
		ChevronLeft,
		Palette,
		Pencil,
		Sparkles,
		RefreshCw,
		Trash
	} from './icons.ts';

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
	const targets = $derived(m && it ? itemSlotTargets(m, it) : []);
	let pickingSlot = $state(false);
	async function showTargets(show: boolean) {
		pickingSlot = show;
		await tick();
		menu?.querySelector<HTMLElement>(show ? '[data-move-target]' : '[data-move-trigger]')?.focus();
	}
	const on = $derived(!!it && doc.items[it.slot] === it.id && !doc.drafts[it.slot]);
	const remakeOnly = $derived(!!m && !!it?.copiedFrom && !extendable(m, it.id));
	// What Details has for the player to review (checks, fit, missing frames): its row shows a dot and describes the reason
	// (its name stays "Details…"), pointing to where the tile's warning is dealt with. The demo has nothing to act on.
	const attentionId = $props.id();
	const attention = $derived.by(() => {
		if (!m || !it || isDemo()) return '';
		const health = healthOf(m, it);
		if (health === 'look' || health === 'stale' || health === 'unfitted')
			return displayMessage(HEALTH_LABEL[health]);
		const missing = missingFramesNote(m, it);
		return missing ? displayMessage(missing) : '';
	});
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
						t('itemMenu.remake', {
							name: m.name
						})
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
				<!-- One fixed name; aria-pressed carries the state, and the glyph changes from an empty to a checked circle. -->
				<button
					class="bu-action item-menu-wear"
					data-variant="outline"
					aria-pressed={on}
					aria-label={t('itemMenu.wearName', { name: it.name })}
					title={on ? t('itemMenu.titleWearingTakeOff') : t('common.wear')}
					onclick={() => wear(it.id)}
					>{#if on}<CircleCheck size={20} aria-hidden="true" />{:else}<Circle
							size={20}
							aria-hidden="true"
						/>{/if}</button
				>
			</div>
			<TileMarks {marks} list />
			{#if pickingSlot}
				<div
					role="menu"
					aria-label={t('wardrobe.moveItemTo')}
					tabindex="-1"
					onkeydown={(event) => {
						if (event.key !== 'Escape') return;
						event.preventDefault();
						void showTargets(false);
					}}
				>
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() => void showTargets(false)}
					>
						<ChevronLeft size={16} aria-hidden="true" />{t('export.sheet.back')}
					</button>
					{#each targets as target (target.key)}
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							data-move-target
							onclick={() => act(() => onmove(it.id, target.key))}
						>
							{displayMessage(slotLabelMessage(m, target.key))}
						</button>
					{/each}
				</div>
			{:else}
				<div role="menu" aria-labelledby="item-menu-name">
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						aria-describedby={attention ? attentionId : undefined}
						onclick={() =>
							act(() => {
								ui.selected = it.id;
								ui.sheet = 'item';
							})}
						><Info size={16} aria-hidden="true" />{openerLabel(
							t('common.detailsMenu')
						)}{#if attention}<span class="details-dot" aria-hidden="true"></span><span
								id={attentionId}
								hidden>{attention}</span
							>{/if}<SurfaceChevron /></button
					>
					<!-- The everyday changes first (free, then priced in the sheet that opens), then upkeep. Rare setup (two hands,
					     the other hand's copy) is in Details. Fix frames sits here as in every move's menu. -->
					{#if canRecolor(m, it.id, on)}<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() => act(() => recolorItem(it.id))}
							><Palette size={16} aria-hidden="true" />{t('itemPane.recolor')}</button
						>{/if}
					{#if !isDemo() && !it.variantOf && canEditItemAppearance(m, it)}<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							aria-haspopup="dialog"
							onclick={() => act(() => openAppearance(doc.id, it.id))}
							><Sparkles size={16} aria-hidden="true" />{t('appearance.action')}<SurfaceChevron
							/></button
						>{/if}
					{#if !isDemo() && it.prompt}
						<!-- The New item sheet that opens next prices the attempt before anything is spent. -->
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() =>
								act(() =>
									openNewItem(it.slot, {
										slot: it.slot,
										prompt: it.prompt,
										route: it.route
									})
								)}
							><RefreshCw size={16} aria-hidden="true" />{openerLabel(
								remakeOnly ? t('itemMenu.remake', { name: m.name }) : t('itemMenu.createVariant')
							)}<SurfaceChevron /></button
						>
					{/if}
					{#if !isDemo() && !it.variantOf}
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() => act(() => openRename(doc.id, { itemId: it.id }))}
						>
							<Pencil size={16} aria-hidden="true" />{openerLabel(
								t('toolbar.rename')
							)}<SurfaceChevron />
						</button>
					{/if}
					{#if targets.length}
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							data-move-trigger
							onclick={() => void showTargets(true)}
						>
							<ArrowRightLeft size={16} aria-hidden="true" />{openerLabel(
								t('wardrobe.moveItemTo')
							)}<SurfaceChevron />
						</button>
					{/if}
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() => act(() => openFrames(it.id))}
						><Grid2x2 size={16} aria-hidden="true" />{openerLabel(
							t('fixFrames.open')
						)}<SurfaceChevron /></button
					>
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() => act(() => void downloadItemZip(it.id))}
						><Download size={16} />{t('common.downloadZip')}</button
					>
					<hr class="bu-separator" />
					<DeleteRow
						opens
						class="bu-action"
						label={t('itemMenu.labelDeleteItem')}
						locked={isDemo() ? t('itemMenu.demoDeleteLocked') : ''}
						onclick={() => ask(() => (deleting = { id: it.id, name: it.name }))}
					/>
				</div>
			{/if}
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

<style>
	/* Same 6px dot as the Wardrobe tabs and More, in the tile badge's warning color, at the trailing edge just before the
	   chevron (the dot takes the chevron's auto margin). */
	.details-dot {
		flex: none;
		width: 6px;
		height: 6px;
		margin-inline-start: auto;
		border-radius: 50%;
		background: var(--warn);
	}
	.details-dot ~ :global(svg[data-surface-chevron]) {
		margin-inline-start: 8px;
	}
</style>
