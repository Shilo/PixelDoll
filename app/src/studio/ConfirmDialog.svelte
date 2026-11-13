<script lang="ts">
	// A short alert that confirms one destructive action: a question, at most a line or two of consequence, Cancel and
	// the action. It stays centered at every size, unlike sheets, and Cancel takes focus so Enter never destroys.
	import type { Snippet } from 'svelte';
	import { TriangleAlert } from './icons.ts';
	let {
		title,
		action,
		busyAction = action,
		cancel = 'Cancel',
		busy = false,
		problem = '',
		blocked = false,
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
		/** The action cannot run now (problem says why). */
		blocked?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
		children?: Snippet;
	} = $props();
	const id = $props.id();
	let dialog: HTMLDialogElement;
	let keep: HTMLButtonElement;
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
	class="confirm-dialog bu-dialog-surface"
	role="alertdialog"
	aria-labelledby="{id}-title"
	aria-describedby={children ? `${id}-body` : undefined}
	onkeydown={(e) => e.stopPropagation()}
	oncancel={(e) => {
		e.preventDefault();
		if (!busy) oncancel();
	}}
>
	<h2 id="{id}-title">{title}</h2>
	{#if children}<div id="{id}-body" class="confirm-body">{@render children()}</div>{/if}
	{#if problem}<p class="notice warn small" role="alert">
			<TriangleAlert size={16} aria-hidden="true" /><span>{problem}</span>
		</p>{/if}
	<div class="confirm-actions">
		<button bind:this={keep} class="bu-btn" disabled={busy} onclick={oncancel}>{cancel}</button>
		<button class="bu-btn" data-variant="danger" disabled={busy || blocked} onclick={onconfirm}
			>{busy ? busyAction : action}</button
		>
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
	.confirm-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 20px;
	}
	.confirm-actions button {
		min-height: 44px;
	}
</style>
