<script lang="ts">
	// One sheet at a time (HIG): centered on desktop, bottom sheet on phones, trailing panel in phone landscape.
	// Fixed chrome (docs/design/2026-11-21-app-bars/plan.md): Back only at the start and only inside an inner pane, the
	// centered title, header tools, then the X at the end. A footer exists only for a commit, primary action last.
	import { openingTrigger, restoreTrigger } from './experience/focus.ts';
	import type { Component, Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import { WORLDS } from './experience/config.ts';
	import { ui, canReturnToCreator, returnToCreator } from './state.svelte.ts';
	import Toast from './Toast.svelte';
	import { developerModeEnabled } from './developerMode.svelte.ts';
	import { backdropDismiss } from './backdropDismiss.ts';
	import { claimSheetExit } from './sheetExit.ts';
	import SurfaceHeader from './SurfaceHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import GlobalActions from './GlobalActions.svelte';
	import MoreMenu from './MoreMenu.svelte';
	let {
		title,
		children,
		footer,
		heading,
		tools: ownTools,
		developer,
		back,
		backDiscards = false,
		backTo: backPlace,
		opener,
		exitNote,
		onclose,
		locked = false,
		dirty = false,
		wide = false,
		screen = false,
		className = ''
	}: {
		title: string;
		children: Snippet;
		/** Note first, then actions with the primary last. */
		footer?: Snippet;
		/** Inline content beside the title, such as a Name field or a page title. */
		heading?: Snippet;
		/** Icon buttons just before the X. */
		tools?: Snippet;
		/** Developer-mode tools, shown before the other tools. */
		developer?: Snippet;
		/** Steps back to the previous pane; present only inside an inner pane. */
		back?: () => void;
		/** Back drops the pane's unsaved state (`dirty`), so it asks first like the X. */
		backDiscards?: boolean;
		/** A sibling page this sheet opens (Export's Settings), in Back's place at the start. */
		opener?: { label: string; icon: Component; onclick: () => void };
		/** The id of a note about what leaving does (work that keeps running), read with the exit control. */
		exitNote?: string;
		/** The sheet Back returns to, when it is another sheet (names it "Back to …"). */
		backTo?: string;
		/** Leaves the sheet: the X, Escape, the backdrop and browser Back all ask for it. */
		onclose: () => void;
		/** An atomic save is running: no exit until it settles. */
		locked?: boolean;
		/** Leaving now would lose input, so the close request asks first. */
		dirty?: boolean;
		wide?: boolean;
		/** A full-window screen (New character): its bar matches the top bar it covers, Back at the start and Full
		 *  screen and More at the end, instead of the X. */
		screen?: boolean;
		className?: string;
	} = $props();
	let dlg: HTMLDialogElement;
	let titleElement = $state<HTMLHeadingElement>();
	/** The exit waiting on Discard changes?. */
	let discarding = $state<(() => void) | null>(null);
	/** The footer's height, so a full-window screen's form can scroll clear of a footer floating over it. */
	let footHeight = $state(0);
	// The native `close` event from our own unmount fires after a replacement sheet is already set; ignore it.
	let unmounting = false;
	// Without an inner pane of its own, a sheet opened over New character steps back to it.
	const backTo = $derived(back ?? (canReturnToCreator() ? returnToCreator : undefined));
	const backName = $derived(back ? backPlace : backTo ? t('create.sheet.title') : undefined);
	function guarded(exit: () => void) {
		if (locked || discarding) return;
		if (dirty) discarding = exit;
		else exit();
	}
	const requestClose = () => guarded(onclose);
	const goBack = $derived(backTo && backDiscards ? () => guarded(backTo as () => void) : backTo);
	$effect(() => {
		ui.sheetBusy = locked;
		return () => {
			ui.sheetBusy = false;
		};
	});
	$effect(() =>
		claimSheetExit({
			get back() {
				return goBack && !locked ? goBack : undefined;
			},
			close: requestClose
		})
	);
	$effect(() => {
		// focus goes back to what opened the sheet (a menu item -> its menu button); text sheets start in their first
		// field on fine pointers, every other sheet on its title so neither Back nor the X is the starting point
		const from = openingTrigger(),
			pop = from?.closest<HTMLElement>('[popover]');
		const opener = pop ? document.querySelector<HTMLElement>(`[popovertarget="${pop.id}"]`) : from;
		dlg.showModal();
		const field =
			matchMedia('(pointer: fine)').matches &&
			dlg.querySelector<HTMLElement>(
				':is(.sheet-heading, .sheet-body) :is(textarea, input:is([type=text], [type=password], :not([type])))'
			);
		if (field) field.focus();
		else titleElement?.focus({ preventScroll: true });
		return () => {
			unmounting = true;
			dlg.close();
			restoreTrigger(opener);
		};
	});
	const showDeveloper = $derived(!!developer && developerModeEnabled());
	const kind = $derived(
		ui.size === 'compact' ? 'bottom' : ui.size === 'landscape' ? 'side' : 'center'
	);
</script>

<dialog
	style:--creator-world="url('{WORLDS[ui.theme].backgrounds.creation}')"
	style:--sheet-foot-height="{footHeight}px"
	bind:this={dlg}
	class="sheet {kind} {className}"
	class:wide
	aria-labelledby="sheet-title"
	onclose={() => {
		if (!unmounting && !locked) onclose();
	}}
	oncancel={(e) => {
		e.preventDefault();
		requestClose();
	}}
	use:backdropDismiss={requestClose}
>
	<SurfaceHeader
		{title}
		titleId="sheet-title"
		bind:titleElement
		{heading}
		back={goBack ?? (screen ? requestClose : undefined)}
		{opener}
		titleAtStart={screen}
		{exitNote}
		backTo={backName}
		{locked}
		onclose={requestClose}
		end={screen ? globalActions : undefined}
	>
		{#snippet tools()}
			{#if showDeveloper}{@render developer?.()}{/if}
			{@render ownTools?.()}
		{/snippet}
	</SurfaceHeader>
	<div class="sheet-body">{@render children()}</div>
	{#if footer}<footer class="sheet-foot" bind:offsetHeight={footHeight}>
			{@render footer()}
		</footer>{/if}
	<Toast />
	{#if screen}<MoreMenu context="creator" />{/if}
</dialog>

{#snippet globalActions()}<GlobalActions />{/snippet}

{#if discarding}
	<ConfirmDialog
		title={t('common.discardChangesTitle')}
		action={t('common.discard')}
		cancel={t('common.keepEditing')}
		oncancel={() => (discarding = null)}
		onconfirm={() => {
			const exit = discarding;
			discarding = null;
			exit?.();
		}}
	>
		<p>{t('common.discardChangesBody')}</p>
	</ConfirmDialog>
{/if}
