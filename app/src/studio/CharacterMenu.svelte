<script lang="ts">
	// A character's actions, the same rows wherever its ⋮ opens: its row in the character lists (with View and edit
	// first) and its View and edit window (without). Frame, directions and cost tools live in the window, beside what they
	// change; like every object's menu it ends with Rename, Download ZIP and Move to Trash (docs/design/menus-and-details.md).
	import { t } from 'svelte-whisper';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { openAppearance, openRename, ui } from './state.svelte.ts';
	import { downloadCharacterZip } from './download.svelte.ts';
	import { Download, Eye, Sparkles } from './icons.ts';
	import DeleteRow from './DeleteRow.svelte';
	import DemoCopyRow from './DemoCopyRow.svelte';
	import RenameRow from './RenameRow.svelte';

	let {
		id,
		close,
		inWindow = false,
		leave
	}: {
		id: string;
		/** Hides the menu before an action runs. */
		close: () => void;
		/** Opened from the character's own window: no View and edit row, and the sheets it opens return there. */
		inWindow?: boolean;
		/** Remembers the window's place before Rename or Move to Trash opens over it; both return there. */
		leave?: () => void;
	} = $props();
	/** Close this menu and any menu it was opened from (the header picker), then go. */
	function go(action: () => void) {
		close();
		document
			.querySelectorAll<HTMLElement>('[popover]:popover-open')
			.forEach((popover) => popover.hidePopover());
		action();
	}
</script>

{#if !inWindow}<button
		class="row"
		role="menuitem"
		onclick={() =>
			go(() => {
				ui.details = id;
				ui.sheet = 'details';
			})}><Eye size={16} />{openerLabel(t('common.detailsMenu'))}<SurfaceChevron /></button
	>{/if}
{#if id.startsWith('rig-')}<button
		class="row"
		role="menuitem"
		aria-haspopup="dialog"
		onclick={() => go(() => openAppearance(id))}
		><Sparkles size={16} aria-hidden="true" />{t('appearance.action')}<SurfaceChevron /></button
	>{/if}
<DemoCopyRow {id} {close} />
<RenameRow
	locked={id.startsWith('fixture:') ? t('characterActions.demoRenameLocked') : ''}
	onclick={() =>
		go(() => {
			leave?.();
			openRename(id, inWindow ? { back: 'details' } : {});
		})}
/>
<button
	class="row"
	role="menuitem"
	onclick={() => {
		close();
		void downloadCharacterZip(id);
	}}><Download size={16} />{t('common.downloadZip')}</button
>
<hr class="bu-separator" />
<DeleteRow
	opens
	label={t('characterActions.labelDeleteCharacter')}
	locked={id.startsWith('fixture:') ? t('characterActions.demoDeleteLocked') : ''}
	onclick={() =>
		go(() => {
			leave?.();
			ui.deleting = id;
			ui.sheet = 'delete';
		})}
/>
