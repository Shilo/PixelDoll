<script lang="ts">
	// The report preview: exactly the text the public issue will carry, then Copy report or Open on GitHub, where the
	// user posts it with their own account. A centered sheet like the others: the X in the header, actions in the footer.
	import { t } from 'svelte-whisper';
	import type { ProblemReport } from '../lib/report/report.ts';
	import { reportText, reportUrl } from '../lib/report/report.ts';
	import { Check, Copy, ExternalLink, Github } from './icons.ts';
	import SurfaceHeader from './SurfaceHeader.svelte';
	import { backdropDismiss } from './backdropDismiss.ts';
	import { claimSheetExit } from './sheetExit.ts';
	import { closeReport } from './report.svelte.ts';

	let { report }: { report: ProblemReport } = $props();
	const id = $props.id();
	const text = $derived(reportText(report));
	const url = $derived(reportUrl(report));
	let dialog: HTMLDialogElement;
	let title = $state<HTMLHeadingElement>();
	// Feedback stays inside the modal: a toast would sit under its backdrop.
	let copied = $state<'' | 'done' | 'failed'>('');
	$effect(() => claimSheetExit({ alert: true, close: closeReport }));
	$effect(() => {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		dialog.showModal();
		// The title, not an action: nothing is copied or opened by a stray Enter.
		title?.focus();
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
	class="sheet center report-dialog"
	aria-labelledby="{id}-title"
	aria-describedby="{id}-body"
	onkeydown={(e) => e.stopPropagation()}
	oncancel={(e) => {
		e.preventDefault();
		closeReport();
	}}
>
	<SurfaceHeader
		title={t('report.title')}
		titleId="{id}-title"
		onclose={closeReport}
		bind:titleElement={title}
	/>
	<div class="sheet-body">
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
	</div>
	<!-- Whole buttons wrap, never their labels; the primary stays last. -->
	<footer class="sheet-foot report-actions">
		<button class="bu-btn" data-trail="report.copy" onclick={copy}
			>{#if copied === 'done'}<Check size={16} aria-hidden="true" />{:else}<Copy
					size={16}
					aria-hidden="true"
				/>{/if}<span>{t(copied === 'done' ? 'report.copied' : 'report.copy')}</span></button
		>
		<!-- It stays open: a blocked popup would otherwise lose the report. -->
		<a
			class="bu-btn"
			data-variant="primary"
			data-trail="report.open"
			href={url}
			target="_blank"
			rel="noreferrer"
			><Github size={16} /><span>{t('report.open')}</span><ExternalLink
				size={16}
				aria-hidden="true"
			/><span class="bu-sr">{' ' + t('noticeLink.opensInANewTab')}</span></a
		>
	</footer>
</dialog>

<style>
	/* A column whose preview gives up height first, so the header and actions stay in view on short screens. */
	.report-dialog {
		max-height: calc(100dvh - 32px);
	}
	.report-dialog[open] {
		display: flex;
		flex-direction: column;
	}
	.report-intro {
		margin: 0;
		color: var(--bu-muted);
		font-size: 14px;
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
		margin: 0;
	}
	/* The standard sheet footer: buttons as wide as their labels, at the end, primary last. */
	.report-actions > * {
		gap: 6px;
		white-space: nowrap;
		text-decoration: none;
	}
</style>
