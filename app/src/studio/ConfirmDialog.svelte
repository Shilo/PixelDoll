<script lang="ts">
	// A short alert that confirms one destructive action: a question, at most a line or two of consequence, Cancel and
	// the action. It stays centered at every size, unlike sheets, and Cancel takes focus so Enter never destroys.
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import { TriangleAlert } from './icons.ts';
	import { backdropDismiss } from './backdropDismiss.ts';
	import { claimSheetExit } from './sheetExit.ts';
	let {
		title,
		action,
		busyAction = action,
		cancel,
		busy = false,
		problem = '',
		problemAction,
		blocked = false,
		actionButton,
		onconfirm,
		oncancel,
		children
	}: {
		title: string;
		/** The destructive button's label. */
		action: string;
		/** Its label while the action runs. */
		busyAction?: string;
		cancel?: string;
		busy?: boolean;
		/** Why the action failed or cannot run now. */
		problem?: string;
		problemAction?: Snippet;
		/** The action cannot run now (problem says why). */
		blocked?: boolean;
		actionButton?: Snippet<[label: string, disabled: boolean, activate: () => void]>;
		onconfirm: () => void;
		oncancel: () => void;
		children?: Snippet;
	} = $props();
	const id = $props.id();
	let dialog: HTMLDialogElement;
	let keep: HTMLButtonElement;
	function dismiss() {
		if (!busy) oncancel();
	}
	// Browser Back answers the alert first, with its safe choice.
	$effect(() => claimSheetExit({ alert: true, close: dismiss }));
	$effect(() => {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		dialog.showModal();
		keep.focus();
		return () => {
			dialog.close();
			if (opener?.isConnected && !document.activeElement?.closest('dialog[open]'))
				opener.focus({ preventScroll: true });
		};
	});
</script>

<!-- Keys stay with the alert: Escape cancels it here, never also leaving the screen behind it. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialog}
	use:backdropDismiss={dismiss}
	class="confirm-dialog bu-dialog-surface"
	role="alertdialog"
	aria-labelledby="{id}-title"
	aria-describedby={children ? `${id}-body` : undefined}
	onkeydown={(e) => e.stopPropagation()}
	oncancel={(e) => {
		e.preventDefault();
		dismiss();
	}}
>
	<h2 id="{id}-title">{title}</h2>
	{#if children}<div id="{id}-body" class="confirm-body">{@render children()}</div>{/if}
	{#if problem}<p class="notice warn small" role="alert">
			<TriangleAlert size={16} aria-hidden="true" /><span>{problem}</span>
		</p>{/if}
	{#if problemAction}<div class="problem-action">{@render problemAction()}</div>{/if}
	<div class="confirm-actions">
		<button
			bind:this={keep}
			class="bu-btn"
			data-trail="confirm.cancel"
			disabled={busy}
			onclick={oncancel}>{cancel ?? t('common.cancel')}</button
		>
		{#if actionButton}
			{@render actionButton(busy ? busyAction : action, busy || blocked, onconfirm)}
		{:else}
			<button
				class="bu-btn"
				data-variant="danger"
				data-trail="confirm.accept"
				disabled={busy || blocked}
				onclick={onconfirm}>{busy ? busyAction : action}</button
			>
		{/if}
	</div>
</dialog>

<style>
	.confirm-dialog {
		width: min(340px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		margin: auto;
		padding: 20px;
		overflow: auto;
		text-align: center;
	}
	.confirm-dialog::backdrop {
		background: var(--bu-scrim);
	}
	h2 {
		margin: 0 0 8px;
		font-size: 17px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.confirm-body {
		color: var(--bu-muted);
		font-size: 14px;
	}
	.confirm-body :global(p) {
		margin: 0;
	}
	.notice {
		margin: 12px 0 0;
		text-align: left;
	}
	.problem-action {
		margin-top: 8px;
	}
	/* The safe choice first, the named action last, as in every sheet footer; labels too long to share a row stack
	   in the same order. */
	.confirm-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 20px;
	}
	.confirm-actions > :global(*) {
		flex: 1 1 calc(50% - 4px);
	}
	.confirm-actions :global(button) {
		min-height: 44px;
		height: auto;
		white-space: normal;
	}
</style>
