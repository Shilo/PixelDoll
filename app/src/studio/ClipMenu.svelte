<script lang="ts">
	// A move's or State's actions, the same rows wherever its ⋮ opens: its row in the Moves or States tab (with View and
	// edit first) and its View and edit window (without). Frame tools, Redraw, new States and item drawing live in the
	// window, beside the frames they change; like every object's menu it ends with Rename, Download ZIP and Move to Trash
	// (docs/design/menus-and-details.md).
	import { t } from 'svelte-whisper';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import DeleteRow from './DeleteRow.svelte';
	import RenameRow from './RenameRow.svelte';
	import { Download, Eye } from './icons.ts';
	import { displayError } from '../lib/i18n.ts';
	import { doc, isDemo, openRename, store, ui } from './state.svelte.ts';
	import { downloadMoveZip } from './download.svelte.ts';
	import { moveDeletionBlocked } from './moveActions.svelte.ts';
	import { clipItemCoverage } from './itemGeneration.ts';

	let {
		id,
		kind,
		close,
		inWindow = false,
		leave,
		ontrash
	}: {
		/** The move or State. */
		id: string;
		kind: 'move' | 'state';
		/** Hides the menu before an action runs. */
		close: () => void;
		/** Opened from its own window: no View and edit row, and Rename returns there. */
		inWindow?: boolean;
		/** Remembers the window's place before Rename opens over it. */
		leave?: () => void;
		/** Asks before moving it to the Trash. */
		ontrash: () => void;
	} = $props();
	const trashLocked = $derived(displayError(moveDeletionBlocked(id)));
	// A move missing some of the character's gear: its window draws it, so the Fit gear tip points here.
	const fitsGear = $derived.by(() => {
		const m = store.project?.manifest,
			items = m && kind === 'move' && !isDemo() ? clipItemCoverage(m, id) : null;
		return !!items && items.drawn < items.total;
	});
</script>

{#if !inWindow}<button
		class="row"
		role="menuitem"
		data-tip-anchor={fitsGear ? 'generate-items' : undefined}
		data-trail="clipMenu.details"
		onclick={() => {
			close();
			ui.clip = id;
			ui.sheet = 'clip';
		}}><Eye size={16} />{openerLabel(t('common.detailsMenu'))}<SurfaceChevron /></button
	>{/if}
<RenameRow
	trail="clipMenu.rename"
	locked={isDemo() ? t('savedActions.demoRenameLocked') : ''}
	onclick={() => {
		close();
		leave?.();
		openRename(doc.id, { moveId: id, ...(inWindow ? { back: 'clip' as const } : {}) });
	}}
/>
<button
	class="row"
	role="menuitem"
	data-trail="clipMenu.download"
	onclick={() => {
		close();
		void downloadMoveZip(id);
	}}><Download size={16} />{t('common.downloadZip')}</button
>
<hr class="bu-separator" />
<DeleteRow
	opens
	trail="clipMenu.delete"
	label={kind === 'move' ? t('savedActions.labelDeleteMove') : t('savedActions.labelDeleteState')}
	locked={trashLocked}
	onclick={() => {
		close();
		ontrash();
	}}
/>
