<script lang="ts">
	// The report preview: exactly the text the public issue will carry, then Copy report or Open on GitHub, where the
	// user posts it with their own account. Centered like ConfirmDialog, with the safe choice first.
	import { t } from 'svelte-whisper';
	import type { ProblemReport } from '../lib/report/report.ts';
	import { reportText, reportUrl } from '../lib/report/report.ts';
	import { ExternalLink } from './icons.ts';
	import { backdropDismiss } from './backdropDismiss.ts';
	import { claimSheetExit } from './sheetExit.ts';
	import { closeReport } from './report.svelte.ts';

	let { report }: { report: ProblemReport } = $props();
	const id = $props.id();
	const text = $derived(reportText(report));
	const url = $derived(reportUrl(report));
	let dialog: HTMLDialogElement;
	let closeButton: HTMLButtonElement;
	// Feedback stays inside the modal: a toast would sit under its backdrop.
	let copied = $state<'' | 'done' | 'failed'>('');
	$effect(() => claimSheetExit({ alert: true, close: closeReport }));
	$effect(() => {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		dialog.showModal();
		closeButton.focus();
		return () => {
			dialog.close();
			if (opener?.isConnected && !document.activeElement?.closest('dialog[open]'))
				opener.focus({ preventScroll: true });
		};
	});
	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = 'done';
		} catch (error) {
			console.warn('copy report', error);
			copied = 'failed';
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialog}
	use:backdropDismiss={closeReport}
	class="report-dialog bu-dialog-surface"
	aria-labelledby="{id}-title"
	aria-describedby="{id}-body"
	onkeydown={(e) => e.stopPropagation()}
	oncancel={(e) => {
		e.preventDefault();
		closeReport();
	}}
>
	<h2 id="{id}-title">{t('report.title')}</h2>
	<p id="{id}-body" class="report-intro">{t('report.intro')}</p>
	<!-- Focusable so keyboard users can scroll a long report. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<pre
		class="report-preview"
		role="region"
		tabindex="0"
		aria-label={t('report.preview')}>{text}</pre>
	{#if copied === 'failed'}<p
			class="bu-notice"
			data-size="compact"
			data-tone="warning"
			role="alert"
		>
			{t('report.copyFailed')}
		</p>{/if}
	<p class="bu-sr" role="status" aria-live="polite">
		{copied === 'done' ? t('report.copied') : ''}
	</p>
	<!-- Whole buttons wrap, never their labels; the last (primary) one then fills its own row. -->
	<div class="report-actions">
		<button bind:this={closeButton} class="bu-btn" onclick={closeReport}>{t('common.close')}</button
		>
		<button class="bu-btn" onclick={copy}
			>{t(copied === 'done' ? 'report.copied' : 'report.copy')}</button
		>
		<!-- It stays open: a blocked popup would otherwise lose the report. -->
		<a class="bu-btn" data-variant="primary" href={url} target="_blank" rel="noreferrer"
			>{t('report.open')}<ExternalLink size={16} aria-hidden="true" /><span class="bu-sr"
				>{' ' + t('noticeLink.opensInANewTab')}</span
			></a
		>
	</div>
</dialog>

<style>
	.report-dialog {
		width: min(520px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		margin: auto;
		padding: 20px;
		/* Only when even a short preview cannot fit (a tiny screen, or the copy notice), the dialog itself scrolls. */
		overflow: auto;
	}
	/* A column whose preview gives up height first, so the actions stay in view on short screens. */
	.report-dialog[open] {
		display: flex;
		flex-direction: column;
	}
	.report-dialog > :not(.report-preview) {
		flex: none;
	}
	.report-dialog::backdrop {
		background: var(--bu-scrim);
	}
	h2 {
		margin: 0 0 8px;
		font-size: 18px;
		font-weight: 600;
		text-align: center;
	}
	.report-intro {
		margin: 0 0 12px;
		color: var(--bu-muted);
		font-size: 14px;
		text-align: center;
	}
	.report-preview {
		flex: 0 1 auto;
		min-height: 4.5em;
		max-height: 320px;
		margin: 0;
		padding: 10px 12px;
		overflow: auto;
		border-radius: var(--r-ctl);
		background: var(--bg-hover);
		font-size: 12px;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		user-select: text;
	}
	.bu-notice {
		margin: 12px 0 0;
	}
	.report-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 16px;
	}
	.report-actions > * {
		flex: 1 0 auto;
		min-height: 44px;
		height: auto;
		white-space: nowrap;
		gap: 6px;
		text-decoration: none;
	}
</style>
