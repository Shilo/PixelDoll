<script lang="ts">
	import { t } from 'svelte-whisper';
	import { ChevronLeft, ChevronRight, X } from '../icons.ts';
	import { claimSheetExit } from '../sheetExit.ts';
	import AgentBudget from './AgentBudget.svelte';
	import { budgetView } from './budget.ts';
	import { PALETTE, emptyCells, fitScale, paintSheet, uncoveredCells } from './evidence.ts';
	import { hideEvidence, panel, turnEvidence } from './panel.svelte.ts';

	const id = $props.id();
	let width = $state(0),
		height = $state(0);
	const image = $derived(panel.images[panel.index]);
	// CSS pixels per artwork pixel: the largest whole scale, up to the sheet's own, at which this one sheet fits.
	// 32 px side padding; 16 px bottom padding and 24 px for the caption.
	const scale = $derived(
		image ? fitScale(image.page, { width: width - 32, height: height - 40 }) : 1
	);
	const uncovered = $derived(image ? uncoveredCells(image.page) : []);
	const empty = $derived(image ? emptyCells(image.page) : []);
	const cellList = (cells: { row: string; column: string }[]) =>
		cells.map((cell) => `${cell.row} ${cell.column}`).join(', ');

	function openPanel(dialog: HTMLDialogElement) {
		const opener = document.activeElement;
		dialog.showModal();
		const release = claimSheetExit({ close: hideEvidence });
		// The native cancel event owns Escape while the Studio is behind the dialog; arrows turn the sheets.
		const keys = (event: KeyboardEvent) => {
			if (event.key === 'Escape') event.stopPropagation();
			else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
				event.preventDefault();
				turnEvidence(event.key === 'ArrowLeft' ? -1 : 1);
			}
		};
		dialog.addEventListener('keydown', keys);
		return () => {
			dialog.removeEventListener('keydown', keys);
			release();
			dialog.close();
			if (
				opener instanceof HTMLElement &&
				opener.isConnected &&
				!document.activeElement?.closest('dialog[open]')
			)
				opener.focus({ preventScroll: true });
		};
	}
</script>

{#if image}
	<dialog
		class="agent-evidence bu-dialog-surface"
		aria-labelledby="{id}-title"
		data-agent-evidence
		{@attach openPanel}
		oncancel={(event) => {
			event.preventDefault();
			hideEvidence();
		}}
	>
		<!-- The modal dialog makes the page behind it inert, so the budget and its End control come along. -->
		<AgentBudget />
		<header class:budget={$budgetView.active}>
			<h2 id="{id}-title">
				{t('agentEvidence.title', { subject: panel.title })}
			</h2>
			{#if panel.images.length > 1}
				<div class="pager">
					<button
						class="bu-btn"
						data-variant="ghost"
						aria-label={t('agentEvidence.previous')}
						onclick={() => turnEvidence(-1)}><ChevronLeft size={18} aria-hidden="true" /></button
					>
					<span data-agent-evidence-page
						>{t('agentEvidence.page', { page: panel.index + 1, pages: panel.images.length })}</span
					>
					<button
						class="bu-btn"
						data-variant="ghost"
						aria-label={t('agentEvidence.next')}
						onclick={() => turnEvidence(1)}><ChevronRight size={18} aria-hidden="true" /></button
					>
				</div>
			{/if}
			<button
				class="bu-btn"
				data-variant="ghost"
				aria-label={t('common.close')}
				onclick={hideEvidence}><X size={18} aria-hidden="true" /></button
			>
		</header>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users need to scroll through the evidence) -->
		<div
			class="sheets"
			bind:clientWidth={width}
			bind:clientHeight={height}
			tabindex="0"
			style:background={PALETTE.sheet}
			style:color={PALETTE.ink}
		>
			<figure>
				<figcaption>
					<span>{image.label}</span>
					<span>{t('agentEvidence.scale', { shown: scale, sheet: image.scale })}</span>
					{#if uncovered.length}
						<span title={cellList(uncovered)}>
							{t('agentEvidence.missingCells', { count: uncovered.length })}
						</span>
					{/if}
					{#if empty.length}
						<span title={cellList(empty)}>
							{t('agentEvidence.emptyCells', { count: empty.length })}
						</span>
					{/if}
				</figcaption>
				<canvas
					aria-hidden="true"
					{@attach (canvas) => {
						paintSheet(canvas.getContext('2d')!, image.page, scale);
					}}
				></canvas>
			</figure>
		</div>
	</dialog>
{/if}

<style>
	.agent-evidence {
		inset: 0;
		box-sizing: border-box;
		margin: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		padding: 0;
		overflow: hidden;
	}
	.agent-evidence[open] {
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
	}
	/* Room for the budget, which floats at the top center. */
	header.budget {
		padding-top: 48px;
	}
	h2 {
		flex: 1;
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.pager {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		white-space: nowrap;
	}
	.sheets {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 0 16px 16px;
	}
	figure {
		margin: 0;
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		min-height: 20px;
		margin-bottom: 4px;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	canvas {
		display: block;
		max-width: none;
		/* Drawn at whole CSS pixels per artwork pixel; the browser enlarges it to device pixels without smoothing. */
		image-rendering: pixelated;
	}
</style>
