<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { t } from 'svelte-whisper';
	import { ui } from './state.svelte.ts';
	import { Plus, FileArchive, CloudDownload, Sparkles } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import { popoverFocus } from './experience/focus.ts';
	let { row = false }: { row?: boolean } = $props();
	const id = $props.id();
	let menu: HTMLElement;
	function choose(sheet: 'create' | 'importZip' | 'importPixelLab') {
		menu.hidePopover();
		document
			.querySelectorAll<HTMLElement>('[popover]:popover-open')
			.forEach((popover) => popover.hidePopover());
		ui.sheet = sheet;
	}
</script>

<button
	class={['bu-action', { 'new-character-row': row, 'selection-create': !row }]}
	data-variant={row ? 'row' : 'outline'}
	aria-label={t('newCharacterButton.addCharacter')}
	title={row ? undefined : t('newCharacterButton.addCharacter')}
	aria-haspopup="menu"
	data-trail="newCharacter.open"
	popovertarget={id}
>
	<span class={{ 'new-character-icon': row }}><Plus size={row ? 24 : 16} aria-hidden="true" /></span
	><span class="new-character-label">{openerLabel(t('newCharacterButton.addCharacter'))}</span>
	<SurfaceChevron /></button
>
<div
	{id}
	class="menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	bind:this={menu}
	role="menu"
	aria-label={t('newCharacterButton.addCharacter')}
	ontoggle={popoverFocus}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		<!-- Creating is the one paid path here: say so before the form, not after it is filled in. -->
		<button
			class="row"
			role="menuitem"
			aria-labelledby="{id}-create"
			aria-describedby="{id}-paid"
			data-trail="newCharacter.create"
			onclick={() => choose('create')}
			><Sparkles size={16} /><span class="row-name"
				><span id="{id}-create">{openerLabel(t('newCharacterButton.createFromScratch'))}</span><span
					id="{id}-paid"
					class="row-reason bu-muted">{t('newCharacterButton.createNeedsKey')}</span
				></span
			><SurfaceChevron /></button
		>
		<button
			class="row"
			role="menuitem"
			data-trail="newCharacter.importZip"
			onclick={() => choose('importZip')}
			><FileArchive size={16} />{openerLabel(t('newCharacterButton.fromFile'))}<SurfaceChevron
			/></button
		>
		<button
			class="row"
			role="menuitem"
			data-trail="newCharacter.importPixelLab"
			onclick={() => choose('importPixelLab')}
			><CloudDownload size={16} />{openerLabel(t('newCharacterButton.fromPixelLab'))}<SurfaceChevron
			/></button
		>
	</div>
</div>
