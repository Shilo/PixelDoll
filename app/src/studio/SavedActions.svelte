<script lang="ts">
	import { t } from 'svelte-whisper';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	import type { Snippet } from 'svelte';
	import RowActions from './RowActions.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { Download, Grid2x2, Pencil, Plus, RefreshCw, Sparkles } from './icons.ts';
	import { toast } from './state.svelte.ts';
	let {
		name,
		kind,
		locked = '',
		onlocked,
		onrename,
		ondownload,
		onfixframes,
		oncapture,
		onredraw,
		ongenerateitems,
		ondelete,
		children
	}: {
		name: string;
		kind: 'outfit' | 'move' | 'state';
		locked?: string;
		/** Opens what causes the lock, when it can be shown. */
		onlocked?: () => void;
		/** Opens the Rename sheet; absent where names cannot be saved (a demo's moves). */
		onrename?: () => void;
		ondownload: () => Promise<void>;
		onfixframes?: () => void;
		oncapture?: () => void;
		/** Opens the move sheet to redraw this saved move. */
		onredraw?: () => void;
		/** Opens the picker for the equipment this move or State is still missing. */
		ongenerateitems?: () => void;
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
		{#if onrename}
			<button
				class="row"
				role="menuitem"
				onclick={() => {
					close();
					onrename();
				}}
				><Pencil size={16} aria-hidden="true" />{openerLabel(t('toolbar.rename'))}<SurfaceChevron
				/></button
			>
		{/if}
		{#if ongenerateitems}
			<button
				class="row"
				role="menuitem"
				onclick={() => {
					close();
					ongenerateitems();
				}}
				><Sparkles size={16} aria-hidden="true" />{openerLabel(
					t('itemGeneration.open')
				)}<SurfaceChevron /></button
			>
		{/if}
		{#if onredraw}
			<button
				class="row"
				role="menuitem"
				onclick={() => {
					close();
					onredraw();
				}}
				><RefreshCw size={16} aria-hidden="true" />{openerLabel(t('moves.redraw'))}<SurfaceChevron
				/></button
			>
		{/if}
		{#if onfixframes}
			<button
				class="row"
				role="menuitem"
				onclick={() => {
					close();
					onfixframes();
				}}><Grid2x2 size={16} />{openerLabel(t('fixFrames.open'))}<SurfaceChevron /></button
			>
		{/if}
		{#if oncapture}
			<button
				class="row"
				role="menuitem"
				onclick={() => {
					close();
					oncapture();
				}}><Plus size={16} />{openerLabel(t('stateCapture.add'))}<SurfaceChevron /></button
			>
		{/if}
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
			opens={kind !== 'outfit'}
			label={kind === 'move'
				? t('savedActions.labelDeleteMove')
				: kind === 'state'
					? t('savedActions.labelDeleteState')
					: t('savedActions.labelDeleteOutfit')}
			{locked}
			onclick={() => {
				close();
				if (kind !== 'outfit') deleting = true;
				else void remove();
			}}
		/>
	{/snippet}
</RowActions>
{#snippet viewLock()}
	<button
		class="bu-btn"
		onclick={() => {
			deleting = false;
			onlocked?.();
		}}>{openerLabel(t('deleteSheet.viewPendingWork'))}<SurfaceChevron /></button
	>
{/snippet}
{#if deleting}
	<ConfirmDialog
		title={t('common.deleteNamed', { name })}
		action={t('common.moveToTrash')}
		{busy}
		problem={displayMessage(problem)}
		blocked={!!locked}
		problemAction={locked && onlocked ? viewLock : undefined}
		oncancel={() => {
			deleting = false;
			problem = '';
		}}
		onconfirm={remove}
	>
		<p>
			{t(
				kind === 'state' ? 'savedActions.removeState' : 'savedActions.thisRemovesTheMoveFromTheBody'
			)}
		</p>
		{#if locked}<p>{locked}</p>{/if}
	</ConfirmDialog>
{/if}
