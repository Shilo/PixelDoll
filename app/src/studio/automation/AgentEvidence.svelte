<script lang="ts">
	import { t } from 'svelte-whisper';
	import { X } from '../icons.ts';
	import { claimSheetExit } from '../sheetExit.ts';
	import { displayScale, paintSheet } from './evidence.ts';
	import { hideEvidence, panel } from './panel.svelte.ts';

	const id = $props.id();
	let width = $state(0),
		height = $state(0),
		dpr = $state(window.devicePixelRatio);
	const scale = $derived(
		displayScale(
			panel.images.map(({ page }) => page),
			width * dpr,
			(height - 28) * dpr
		)
	);

	function openPanel(dialog: HTMLDialogElement) {
		const opener = document.activeElement;
		dialog.showModal();
		const release = claimSheetExit({ close: hideEvidence });
		// The native cancel event owns Escape while the Studio is behind the dialog.
		const keepEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') event.stopPropagation();
		};
		dialog.addEventListener('keydown', keepEscape);
		let resolution: MediaQueryList;
		function watchResolution() {
			const ratio = window.devicePixelRatio;
			dpr = ratio;
			resolution = matchMedia(`(resolution: ${ratio}dppx)`);
			resolution.addEventListener('change', watchResolution, { once: true });
		}
		watchResolution();
		return () => {
			dialog.removeEventListener('keydown', keepEscape);
			resolution.removeEventListener('change', watchResolution);
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

{#if panel.images.length}
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
		<header>
			<h2 id="{id}-title">
				{t('agentEvidence.title', {
					subject: panel.images.length === 1 ? panel.title : panel.images[0].label
				})}
			</h2>
			<button
				class="bu-btn"
				data-variant="ghost"
				aria-label={t('common.close')}
				onclick={hideEvidence}><X size={18} aria-hidden="true" /></button
			>
		</header>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users need to scroll through the evidence) -->
		<div class="sheets" bind:clientHeight={height} tabindex="0">
			<div class="pages" bind:clientWidth={width}>
				{#each panel.images as image (image)}
					<figure>
						<figcaption>{image.label} · {scale}×</figcaption>
						<canvas
							aria-hidden="true"
							{@attach (canvas) => {
								const size = paintSheet(canvas.getContext('2d')!, image.page, scale);
								// One backing pixel per device pixel, including at fractional DPR.
								canvas.style.width = `${size.width / dpr}px`;
								canvas.style.height = `${size.height / dpr}px`;
							}}
						></canvas>
					</figure>
				{/each}
			</div>
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
		justify-content: space-between;
		gap: 8px;
		padding: 8px 16px;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.sheets {
		flex: 1;
		min-height: 0;
		overflow: auto;
		scrollbar-gutter: stable;
		padding: 0 16px 16px;
	}
	figure {
		margin: 0 0 8px;
	}
	figcaption {
		margin-bottom: 4px;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	canvas {
		display: block;
		max-width: none;
	}
</style>
