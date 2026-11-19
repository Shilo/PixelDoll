<script lang="ts">
	import { t } from 'svelte-whisper';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	import type { Snippet } from 'svelte';
	import RowActions from './RowActions.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { Download } from './icons.ts';
	import { toast } from './state.svelte.ts';
	let {
		name,
		kind,
		locked = '',
		ondownload,
		ondelete,
		children
	}: {
		name: string;
		kind: 'outfit' | 'move';
		locked?: string;
		ondownload: () => Promise<void>;
		ondelete: () => void | Promise<void>;
		children: Snippet;
	} = $props();
	let deleting = $state(false);
	let busy = $state(false);
	let problem = $state<string | Message>('');
	async function remove() {
		busy = true;
		problem = '';
		try {
			await ondelete();
			deleting = false;
		} catch (error) {
			problem = errorMessage(error);
			if (kind === 'outfit') toast(problem, { tone: 'danger' });
		} finally {
			busy = false;
		}
	}
</script>

<RowActions {name} {children}>
	{#snippet actions(close)}
		<button
			class="row"
			role="menuitem"
			onclick={() => {
				close();
				void ondownload();
			}}><Download size={16} />{t('common.downloadZip')}</button
		>
		<hr class="bu-separator" />
		<DeleteRow
			label={kind === 'move'
				? t('savedActions.labelDeleteMove')
				: t('savedActions.labelDeleteOutfit')}
			{locked}
			onclick={() => {
				close();
				if (kind === 'move') deleting = true;
				else void remove();
			}}
		/>
	{/snippet}
</RowActions>
{#if deleting}
	<ConfirmDialog
		title={t('common.deleteNamed', { name })}
		action={t('common.delete')}
		{busy}
		problem={displayMessage(problem)}
		blocked={!!locked}
		oncancel={() => {
			deleting = false;
			problem = '';
		}}
		onconfirm={remove}
	>
		<p>{t('savedActions.thisRemovesTheMoveFromTheBody')}</p>
		{#if locked}<p>{locked}</p>{/if}
	</ConfirmDialog>
{/if}
