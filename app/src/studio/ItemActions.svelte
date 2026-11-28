<script lang="ts">
	// An item's actions, the same rows in the same order wherever its ⋮ opens: its Wardrobe tile (with View and edit
	// first) and its View and edit window (without). Everyday changes first (free, then priced in the sheet that opens),
	// then Move to slot; like every object's menu it ends with Rename, Download ZIP and Move to Trash. Rare setup and frame
	// fixes live in the window's sections, next to what they change (docs/design/menus-and-details.md).
	import { tick } from 'svelte';
	import { t } from 'svelte-whisper';
	import type { Item, Manifest } from '../lib/store/manifest.ts';
	import { displayMessage } from '../lib/i18n.ts';
	import { canEditItemAppearance } from './appearanceSource.ts';
	import DeleteRow from './DeleteRow.svelte';
	import RenameRow from './RenameRow.svelte';
	import { downloadItemZip } from './download.svelte.ts';
	import { HEALTH_LABEL, healthOf, missingFramesNote } from './model.ts';
	import { extendable } from './movePricing.ts';
	import { openerLabel } from './openerLabel.ts';
	import { canRecolor, recolorItem } from './recolorItem.ts';
	import { slotLabelMessage } from './slots.ts';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import {
		doc,
		ui,
		isDemo,
		itemSlotTargets,
		openAppearance,
		openCopyForSelf,
		openNewItem,
		openRename
	} from './state.svelte.ts';
	import {
		ArrowRightLeft,
		ChevronLeft,
		Download,
		Eye,
		Palette,
		RefreshCw,
		Sparkles
	} from './icons.ts';

	let {
		m,
		it,
		inDetails = false,
		labelledby,
		label,
		picking = $bindable(false),
		act,
		leave = (go) => go(),
		onmove,
		ondelete
	}: {
		m: Manifest;
		it: Item;
		/** Opened from the item's details window: no Details row, and the sheets it opens return there. */
		inDetails?: boolean;
		labelledby?: string;
		label?: string;
		/** Move to slot shows its slots in place of the rows. */
		picking?: boolean;
		/** Closes the menu, then runs the action. */
		act: (action: () => void) => void;
		/** Wraps opening a sheet that returns here (the details window keeps its place). */
		leave?: (go: () => void) => void;
		onmove: (target: string) => void;
		ondelete: () => void;
	} = $props();

	let root = $state<HTMLElement>();
	const back = $derived(inDetails ? ('item' as const) : undefined);
	const targets = $derived(itemSlotTargets(m, it));
	const remakeOnly = $derived(!!it.copiedFrom && !extendable(m, it.id));
	async function showTargets(show: boolean) {
		picking = show;
		await tick();
		root?.querySelector<HTMLElement>(show ? '[data-move-target]' : '[data-move-trigger]')?.focus();
	}
	// What Details has for the player to review (checks, fit, missing frames): its row shows a dot and describes the reason
	// (its name stays "Details…"), pointing to where the tile's warning is dealt with. The demo has nothing to act on.
	const attentionId = $props.id();
	const attention = $derived.by(() => {
		if (inDetails || isDemo()) return '';
		const health = healthOf(m, it);
		if (health === 'look' || health === 'stale' || health === 'unfitted')
			return displayMessage(HEALTH_LABEL[health]);
		const missing = missingFramesNote(m, it);
		return missing ? displayMessage(missing) : '';
	});
</script>

<div class="item-actions" bind:this={root}>
	{#if picking}
		<div
			role="menu"
			aria-label={t('wardrobe.moveItemTo')}
			tabindex="-1"
			onkeydown={(event) => {
				if (event.key !== 'Escape') return;
				event.preventDefault();
				event.stopPropagation();
				void showTargets(false);
			}}
		>
			<button
				class="row bu-action"
				data-variant="quiet"
				role="menuitem"
				data-trail="itemActions.moveBack"
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
					data-trail="itemActions.moveTo"
					onclick={() => act(() => onmove(target.key))}
				>
					{displayMessage(slotLabelMessage(m, target.key))}
				</button>
			{/each}
		</div>
	{:else}
		<div role="menu" aria-labelledby={labelledby} aria-label={label}>
			{#if !inDetails}<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					aria-describedby={attention ? attentionId : undefined}
					data-trail="itemActions.details"
					onclick={() =>
						act(() => {
							ui.selected = it.id;
							ui.sheet = 'item';
						})}
					><Eye size={16} aria-hidden="true" />{openerLabel(
						t('common.detailsMenu')
					)}{#if attention}<span class="details-dot" aria-hidden="true"></span><span
							id={attentionId}
							hidden>{attention}</span
						>{/if}<SurfaceChevron /></button
				>{/if}
			{#if canRecolor(m, it.id)}<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					data-trail="itemActions.recolor"
					onclick={() => act(() => recolorItem(it.id))}
					><Palette size={16} aria-hidden="true" />{t('itemPane.recolor')}</button
				>{/if}
			{#if !isDemo() && !it.variantOf && canEditItemAppearance(m, it)}<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					aria-haspopup="dialog"
					data-trail="itemActions.appearance"
					onclick={() => act(() => leave(() => openAppearance(doc.id, it.id, back)))}
					><Sparkles size={16} aria-hidden="true" />{t('appearance.action')}<SurfaceChevron
					/></button
				>{/if}
			{#if !isDemo() && it.prompt}
				<!-- The New item sheet that opens next prices the attempt before anything is spent. -->
				<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					data-trail="itemActions.remake"
					onclick={() =>
						act(() =>
							remakeOnly
								? openCopyForSelf(it)
								: openNewItem(it.slot, { slot: it.slot, prompt: it.prompt, route: it.route })
						)}
					><RefreshCw size={16} aria-hidden="true" />{openerLabel(
						remakeOnly ? t('itemMenu.remake') : t('itemMenu.createVariant')
					)}<SurfaceChevron /></button
				>
			{/if}
			{#if targets.length}
				<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					data-move-trigger
					data-trail="itemActions.move"
					onclick={() => void showTargets(true)}
				>
					<ArrowRightLeft size={16} aria-hidden="true" />{openerLabel(
						t('wardrobe.moveItemTo')
					)}<SurfaceChevron />
				</button>
			{/if}
			{#if !it.variantOf}<RenameRow
					trail="itemActions.rename"
					class="bu-action"
					locked={isDemo() ? t('itemMenu.demoRenameLocked') : ''}
					onclick={() => act(() => leave(() => openRename(doc.id, { itemId: it.id, back })))}
				/>{/if}
			<button
				class="row bu-action"
				data-variant="quiet"
				role="menuitem"
				data-trail="itemActions.download"
				onclick={() => act(() => void downloadItemZip(it.id))}
				><Download size={16} aria-hidden="true" />{t('common.downloadZip')}</button
			>
			<hr class="bu-separator" />
			<DeleteRow
				opens
				trail="itemActions.delete"
				class="bu-action"
				label={t('itemMenu.labelDeleteItem')}
				locked={isDemo() ? t('itemMenu.demoDeleteLocked') : ''}
				onclick={() => act(ondelete)}
			/>
		</div>
	{/if}
</div>

<style>
	.item-actions {
		display: contents;
	}
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
