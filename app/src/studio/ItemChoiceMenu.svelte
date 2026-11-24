<script lang="ts">
	import { currentItemDrawing } from './settingsDefaults.svelte.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import PopoverArrow from './PopoverArrow.svelte';
	import Thumb from './Thumb.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import { swallowTilePress } from './tilePress.ts';
	import { displayMove } from './displayMove.ts';
	import { wearClip } from './model.ts';
	import { clipItemOffer, seeded } from './itemGeneration.ts';
	import { itemOfferAccess } from './itemOfferAccess.ts';
	import { Circle, CircleCheck, Sparkles } from './icons.ts';
	import { doc, pendingMoves, queueMoves, store, ui, view, wear, withKey } from './state.svelte.ts';
	import { setupRedoMoves } from '../lib/rig/setup.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';

	// A dimmed Wardrobe tile's own menu: its item has no frames for the move or State Preview shows, so a tap offers to
	// draw it there (priced) or to wear it anyway, instead of quietly switching Preview back to Standing.
	let {
		itemId = $bindable(''),
		open = $bindable(false)
	}: {
		/** The item the menu is for. */
		itemId?: string;
		open?: boolean;
	} = $props();
	let menu = $state<HTMLElement>();
	/** The character and move or State the menu was opened for: its price and action never follow a later change. */
	let projectId = $state(''),
		clip = $state('');
	const m = $derived(store.project?.manifest);
	const it = $derived(m?.items.find((item) => item.id === itemId));
	const move = $derived(displayMove(clip, m?.rig.animations ?? []));
	const on = $derived(!!it && doc.items[it.slot] === it.id && !doc.drafts[it.slot]);
	/** Where Preview goes when it is put on (wear in state.svelte.ts), named on the Wear row. */
	const shownIn = $derived(m && it && wearClip(m, it, clip));
	const pending = $derived(!!it && pendingMoves(projectId, it.id).some((spec) => spec.id === clip));
	const offer = $derived(
		open && m && it && !pending
			? clipItemOffer(m, it.id, clip, currentItemDrawing(), {
					redo: setupRedoMoves(store.exportRecord)
				})
			: null
	);
	const access = $derived(itemOfferAccess(m, offer?.specs ?? []));

	/** Opens the menu for an item, anchored to its tile. */
	export function show(id: string, tile: HTMLElement) {
		itemId = id;
		projectId = doc.id;
		clip = ui.anim;
		menu?.showPopover({ source: tile });
	}
	const close = () => menu?.hidePopover();
	// Another character, move or State, or the item gone (Undo, another tab) or no longer missing: the menu is stale.
	$effect(() => {
		if (open && (doc.id !== projectId || ui.anim !== clip || !it || pending || !offer)) close();
	});
	function generate() {
		if (!offer?.specs.length || access.error) return;
		const project = projectId,
			target = clip,
			id = itemId,
			specs = $state.snapshot(offer.specs);
		close();
		withKey(() => {
			if (doc.id !== project || pendingMoves(project, id).some((spec) => spec.id === target))
				return;
			void queueMoves(project, seeded(specs));
			ui.sheet = 'move';
		}, access.minimumTier);
	}
	$effect(() => {
		if (open) return swallowTilePress(() => menu);
	});
</script>

<div
	id="item-choice"
	class="menu item-menu bu-popover-anchor"
	data-placement="bottom-start"
	popover
	bind:this={menu}
	onfocusout={(e) => {
		// Tab or Shift+Tab out of the menu closes it, like the item menu; outside clicks are the popover's light dismiss.
		const to = e.relatedTarget;
		if (open && to instanceof HTMLElement && !menu?.contains(to)) close();
	}}
	ontoggle={(e) => {
		open = e.newState === 'open';
		popoverFocus(e);
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
					<strong id="item-choice-name">{it.name}</strong>
					<small>{t('itemGeneration.notDrawnFor', { move })}</small>
				</span>
			</div>
			<!-- Views kept without poses get no equipment from this offer: say which. -->
			{#each offer?.unposed ?? [] as note, i (i)}<p class="small muted item-choice-note">
					{displayNestedMessage(note)}
				</p>{/each}
			<div role="menu" aria-labelledby="item-choice-name">
				<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					disabled={offer?.gens == null || !!access.error || ui.waitingForTab}
					aria-describedby="item-choice-cost"
					onclick={generate}
					><Sparkles size={16} aria-hidden="true" />{t('itemGeneration.generateFor', {
						move
					})}<small class="row-aside"
						>{offer?.gens == null
							? t('common.unavailable')
							: t('moves.estimate', { gens: formatNumber(Math.ceil(offer.gens)) })}</small
					></button
				>
				<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					onclick={() => {
						close();
						wear(it.id);
					}}
					>{#if on}<CircleCheck size={16} aria-hidden="true" />{t('common.takeOff')}{:else}<Circle
							size={16}
							aria-hidden="true"
						/>{shownIn
							? t('itemGeneration.wearOn', { move: displayMove(shownIn, m.rig.animations) })
							: t('common.wear')}{/if}</button
				>
			</div>
			<p class="muted small item-choice-note" id="item-choice-cost">{t('moveSheet.costNotice')}</p>
			{#if access.error}<p class="notice warn small item-choice-note" role="status">
					{access.error}
				</p>{/if}
		</div>
	{/if}
</div>

<style>
	.item-choice-note {
		margin: 6px 8px 2px;
	}
</style>
