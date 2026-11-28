<script lang="ts">
	// "Move {name} to Trash?" for anything the Trash keeps: what it removes, why it cannot go yet (with a way to the work
	// that blocks it), and the error when moving it fails, so the dialog stays open to say so.
	import { t } from 'svelte-whisper';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';

	let {
		name,
		body,
		locked = '',
		onlocked,
		onconfirm,
		oncancel
	}: {
		name: string;
		/** What moving it to the Trash removes. */
		body: string;
		/** Why it cannot be moved yet. */
		locked?: string;
		/** Opens what blocks it, when that can be shown. */
		onlocked?: () => void;
		onconfirm: () => void | Promise<void>;
		oncancel: () => void;
	} = $props();
	let busy = $state(false);
	let problem = $state<string | Message>('');
	async function confirm() {
		busy = true;
		problem = '';
		try {
			await onconfirm();
		} catch (error) {
			problem = errorMessage(error);
		} finally {
			busy = false;
		}
	}
</script>

{#snippet viewLock()}
	<button
		class="bu-btn"
		data-trail="trash.viewPendingWork"
		onclick={() => {
			oncancel();
			onlocked?.();
		}}>{openerLabel(t('deleteSheet.viewPendingWork'))}<SurfaceChevron /></button
	>
{/snippet}
<ConfirmDialog
	title={t('common.deleteNamed', { name })}
	action={t('common.moveToTrash')}
	{busy}
	problem={displayMessage(problem)}
	blocked={!!locked}
	problemAction={locked && onlocked ? viewLock : undefined}
	{oncancel}
	onconfirm={confirm}
>
	<p>{body}</p>
	{#if locked}<p>{locked}</p>{/if}
</ConfirmDialog>
