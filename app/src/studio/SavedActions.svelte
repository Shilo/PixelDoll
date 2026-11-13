<script lang="ts">
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
	let problem = $state('');
	async function remove() {
		busy = true;
		problem = '';
		try {
			await ondelete();
			deleting = false;
		} catch (error) {
			problem = error instanceof Error ? error.message : `Could not delete this ${kind}.`;
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
			}}><Download size={16} />Download ZIP</button
		>
		<hr class="bu-separator" />
		<DeleteRow
			label={kind === 'move' ? 'Delete move…' : 'Delete outfit'}
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
		title={`Delete ${name}?`}
		action="Delete"
		{busy}
		{problem}
		blocked={!!locked}
		oncancel={() => {
			deleting = false;
			problem = '';
		}}
		onconfirm={remove}
	>
		<p>This removes the move from the body and every item. This can't be undone.</p>
		{#if locked}<p>{locked}</p>{/if}
	</ConfirmDialog>
{/if}
