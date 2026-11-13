<script lang="ts">
	import { Notice } from '@shilo/bronze-ui/svelte';
	import { onDestroy } from 'svelte';
	import { ui, activateToast, dismissToast, pauseToast, resumeToast } from './state.svelte.ts';
	import { experience } from './experience/state.svelte.ts';
	import { layout } from './experience/geometry.ts';
	import { restoreTrigger } from './experience/focus.ts';
	import { updateNotice } from './updateNotice.svelte.ts';
	import PwaNotice from './PwaNotice.svelte';
	import PendingIndicator from './PendingIndicator.svelte';

	let host = $state<HTMLDivElement>();
	let focusFrom: HTMLElement | null = null;
	let hovered = $state(false),
		focused = $state(false),
		hidden = $state(document.hidden);
	function restoreNoticeFocus() {
		if (host?.contains(document.activeElement)) restoreTrigger(focusFrom);
	}
	$effect(() => {
		// A dismissed host can disappear before pointerleave/focusout. New notices must not inherit that pause.
		hovered = !!host?.matches(':hover');
		focused = !!host?.contains(document.activeElement);
		if (!hovered) resumeToast('pointer');
		if (!focused) resumeToast('focus');
	});
	function dismiss() {
		const focused = host?.contains(document.activeElement);
		dismissToast();
		if (focused) restoreTrigger(focusFrom);
	}
	async function activate() {
		const focused = host?.contains(document.activeElement),
			from = focusFrom;
		try {
			await activateToast();
		} finally {
			if (focused && document.activeElement === document.body) restoreTrigger(from);
		}
	}
	let viewportWidth = $state(innerWidth),
		viewportHeight = $state(innerHeight);
	// Inside a sheet: under its header (title and close), centered over the sheet and above its bottom edge.
	let sheetBox = $state<{ top: number; left: number; right: number; bottom: number } | null>(null);
	$effect(() => {
		const dialog = host?.closest('dialog');
		if (!dialog) return void (sheetBox = null);
		const measure = () => {
			const box = dialog.getBoundingClientRect(),
				head = dialog.querySelector('.sheet-head')?.getBoundingClientRect();
			sheetBox = {
				top: Math.max(16, (head ?? box).bottom + 8),
				left: box.left,
				right: box.right,
				bottom: box.bottom
			};
		};
		measure();
		// The sheet slides in and resizes with its content; follow it.
		const observer = new ResizeObserver(measure);
		observer.observe(dialog);
		dialog.addEventListener('transitionend', measure);
		return () => {
			observer.disconnect();
			dialog.removeEventListener('transitionend', measure);
		};
	});
	// Under the top bar, centered over the stage column (the whole width over a sheet or in short landscape), at most
	// 420 px wide, and never down over the phone's equipment sheet or Preview's playback bar.
	const place = $derived.by(() => {
		if (sheetBox)
			return {
				top: sheetBox.top,
				center: (sheetBox.left + sheetBox.right) / 2,
				room: sheetBox.right - sheetBox.left - 32,
				height: Math.min(viewportHeight * 0.45, sheetBox.bottom - 12 - sheetBox.top)
			};
		const g = layout(viewportWidth, viewportHeight, experience.screen),
			studio = experience.screen === 'studio',
			bottom = Math.min(
				studio && g.sheet ? g.sheetTop - 12 : viewportHeight - 16,
				studio && experience.mode === 'preview' ? g.playbackTop - 12 : Infinity
			);
		return {
			top: g.toastTop,
			center: (g.column.l + g.column.r) / 2,
			room: g.column.r - g.column.l - 2 * g.edge,
			height: Math.min(viewportHeight * 0.45, bottom - g.toastTop)
		};
	});
	onDestroy(() => {
		resumeToast('pointer');
		resumeToast('focus');
	});
</script>

{#snippet pendingIndicator()}<PendingIndicator />{/snippet}

<svelte:document onvisibilitychange={() => (hidden = document.hidden)} />
<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />
{#if updateNotice.visible || (ui.toast && (ui.toastTone === 'danger' || !ui.sheet || ui.toastSheet === ui.sheet))}
	<div
		class="toast bu-toast-region"
		data-placement="top"
		style:--bu-toast-top="{place.top}px"
		style:--bu-toast-center="{place.center}px"
		style:--bu-toast-room="{place.room}px"
		style:--bu-toast-height="{Math.max(44, place.height)}px"
		bind:this={host}
		role="presentation"
		onpointerenter={() => {
			hovered = true;
			pauseToast('pointer');
		}}
		onpointerleave={() => {
			hovered = false;
			resumeToast('pointer');
		}}
		onfocusin={(e) => {
			if (!e.currentTarget.contains(e.relatedTarget as Node))
				focusFrom = e.relatedTarget as HTMLElement | null;
			focused = true;
			pauseToast('focus');
		}}
		onfocusout={(e) => {
			if (!e.currentTarget.contains(e.relatedTarget as Node)) {
				focused = false;
				resumeToast('focus');
			}
		}}
	>
		{#if ui.toast && (ui.toastTone === 'danger' || !ui.sheet || ui.toastSheet === ui.sheet)}<Notice
				class="bu-toast"
				title={ui.toastTitle || undefined}
				tone={ui.toastTone}
				indicator={ui.toastPending ? pendingIndicator : undefined}
				live
				onactivate={activate}
				ondismiss={dismiss}>{ui.toast}</Notice
			>{/if}
		<PwaNotice paused={hovered || focused || hidden} ondismiss={restoreNoticeFocus} />
	</div>
{/if}
