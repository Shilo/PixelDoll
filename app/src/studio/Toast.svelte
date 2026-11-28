<script lang="ts">
	import { Notice } from '@shilo/bronze-ui/svelte';
	import { onDestroy } from 'svelte';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { t } from 'svelte-whisper';
	import { ui, activateToast, dismissToast, pauseToast, resumeToast } from './state.svelte.ts';
	import { experience, experienceLayout } from './experience/state.svelte.ts';
	import { restoreTrigger } from './experience/focus.ts';
	import { updateNotice } from './updateNotice.svelte.ts';
	import PwaNotice from './PwaNotice.svelte';
	import { pwa } from '../lib/pwa.ts';
	import PendingIndicator from './PendingIndicator.svelte';
	import ReportButton from './ReportButton.svelte';

	let host = $state<HTMLDivElement>();
	const showUpdate = $derived(updateNotice.visible && !updateNotice.aboutOpen);
	const showToast = $derived(
		ui.toast &&
			(!ui.toastAfterUpdate || !updateNotice.visible) &&
			(ui.toastTone === 'danger' || !ui.sheet || ui.toastSheet === ui.sheet)
	);
	$effect(() => {
		void ui.toast;
		void showUpdate;
		const label = t('toast.dismiss');
		for (const button of host?.querySelectorAll('.bu-notice-dismiss') ?? [])
			button.setAttribute('aria-label', label);
	});
	const toastId = $props.id();
	$effect(() => {
		void ui.toast;
		void ui.toastTitle;
		void ui.toastActionLabel;
		void ui.toastProblem;
		// Notice names its whole-surface button after all of its content, which would include "Report this problem".
		// Name it after the title and message alone. Scoped to this notice: the update notice shares the region.
		const surface = host?.querySelector('.studio-toast > .bu-notice-activate');
		if (!surface) return;
		const title = host?.querySelector('.studio-toast > .bu-notice-content > strong');
		if (title) title.id = `${toastId}-title`;
		surface.setAttribute(
			'aria-labelledby',
			[title && title.id, `${toastId}-message`].filter(Boolean).join(' ')
		);
	});
	let focusFrom: HTMLElement | null = null;
	let hovered = $state(false),
		focused = $state(false),
		hidden = $state(document.hidden);
	$effect(() => {
		const phase = updateNotice.phase;
		if (!updateNotice.visible || $pwa.reloading) return;
		if (updateNotice.aboutOpen || hovered || focused || hidden) {
			updateNotice.pause(phase);
			return;
		}
		// The clock survives sheet remounts. Only readiness or a new release starts a fresh window.
		const timer = setTimeout(() => updateNotice.expire(phase), updateNotice.delay(phase));
		return () => clearTimeout(timer);
	});
	function restoreNoticeFocus() {
		if (host?.contains(document.activeElement)) restoreTrigger(focusFrom);
	}
	$effect(() => {
		// A hidden tab stops the countdown: an Undo noticed on return is still there.
		if (hidden) pauseToast('hidden');
		else resumeToast('hidden');
	});
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
		const g = experienceLayout(viewportWidth, viewportHeight),
			studio = experience.screen === 'studio',
			bottom = Math.min(
				studio && g.sheet ? g.sheetTop - 12 : viewportHeight - 16,
				studio && !g.panelOnly && experience.mode === 'preview' ? g.playbackTop - 12 : Infinity
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
		resumeToast('hidden');
	});
</script>

{#snippet pendingIndicator()}<PendingIndicator />{/snippet}

<svelte:document onvisibilitychange={() => (hidden = document.hidden)} />
<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />
{#if showUpdate || showToast}
	<div
		class="toast bu-toast-region"
		class:toast-controls-only={typeof ui.toast === 'function' && !showUpdate}
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
		{#if ui.toast && showToast}<Notice
				class="bu-toast studio-toast"
				title={ui.toastTitle ? displayNestedMessage(ui.toastTitle) : undefined}
				tone={ui.toastTone}
				indicator={ui.toastPending ? pendingIndicator : undefined}
				live
				onactivate={typeof ui.toast !== 'function' && !ui.toastActionLabel ? activate : undefined}
				ondismiss={dismiss}
			>
				{#if typeof ui.toast === 'function'}{@render ui.toast()}{:else}<span id="{toastId}-message"
						>{Array.isArray(ui.toast)
							? ui.toast.map(displayNestedMessage).join(' ')
							: displayNestedMessage(ui.toast)}</span
					>{/if}
				{#if ui.toastActionLabel || ui.toastProblem}
					<div class="toast-actions">
						{#if ui.toastActionLabel}
							<button
								type="button"
								class="bu-action btn sm"
								data-variant="outline"
								data-trail="toast.action"
								onclick={activate}>{displayNestedMessage(ui.toastActionLabel)}</button
							>
						{/if}
						{#if ui.toastProblem}<ReportButton {...ui.toastProblem} outlined />{/if}
					</div>
				{/if}
			</Notice>{/if}
		{#if showUpdate}<PwaNotice ondismiss={restoreNoticeFocus} />{/if}
	</div>
{/if}

<style>
	.toast :global(.toast-actions) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-block-start: 6px;
	}
	.toast :global(.toast-actions > .compact-backup) {
		margin-block-start: 0;
	}
	@media (pointer: coarse) {
		.toast-controls-only {
			pointer-events: none;
		}
		.toast-controls-only :global(button) {
			pointer-events: auto;
		}
	}
</style>
