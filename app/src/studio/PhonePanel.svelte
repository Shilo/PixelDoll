<script lang="ts">
	// Customization content for the desktop rail and the phone sheet: one tab at a time. A character ZIP dropped on Wardrobe,
	// Moves or States opens New item, New move or New State on its Import page.
	import { t } from 'svelte-whisper';
	import { isDemo, openImport, store, ui, type ImportKind } from './state.svelte.ts';
	import Wardrobe from './Wardrobe.svelte';
	import ColorSections from './ColorSections.svelte';
	import Moves from './Moves.svelte';
	import Outfits from './Outfits.svelte';
	import { FileArchive } from './icons.ts';
	import { fileDrop } from './fileDrop.ts';

	const TAB_IMPORTS: Partial<Record<typeof ui.tab, ImportKind>> = {
		wardrobe: 'items',
		moves: 'moves',
		states: 'states'
	};
	const HINTS = {
		items: 'importDrop.items',
		moves: 'importDrop.moves',
		states: 'importDrop.states'
	} as const;
	const kind = $derived(isDemo() || !store.project ? undefined : TAB_IMPORTS[ui.tab]);
	let dragging = $state(false);
	const drop = fileDrop(
		() => !kind,
		(active) => (dragging = active),
		(files) => {
			if (kind) openImport(kind, files);
		}
	);
	// Listeners, not attributes: the tab panel stays a plain container for assistive technology.
	function dropZone(node: HTMLElement) {
		const events = [
			['dragenter', drop.enter],
			['dragleave', drop.leave],
			['dragover', drop.over],
			['drop', drop.drop]
		] as const;
		for (const [name, listener] of events) node.addEventListener(name, listener);
		return () => {
			for (const [name, listener] of events) node.removeEventListener(name, listener);
		};
	}
</script>

<div
	class="customize-panel"
	id="customization-panel"
	role="tabpanel"
	aria-labelledby="customization-tab-{ui.tab}"
	{@attach dropZone}
>
	{#if ui.tab === 'wardrobe'}
		<Wardrobe />
	{:else if ui.tab === 'outfits'}
		<div class="equipment-scroll panel-list"><Outfits /></div>
	{:else if ui.tab === 'colors'}
		<ColorSections />
	{:else}
		<div class="equipment-scroll panel-list">
			<Moves
				kind={ui.tab === 'states' ? 'state' : 'move'}
				onaddstate={isDemo()
					? undefined
					: () => {
							ui.stateCaptureMove = '';
							ui.sheet = 'stateCapture';
						}}
			/>
		</div>
	{/if}
	{#if dragging && kind}<div class="drop-hint" role="status">
			<FileArchive size={28} aria-hidden="true" /><strong>{t(HINTS[kind])}</strong>
		</div>{/if}
</div>

<style>
	.customize-panel {
		position: relative;
	}
	/* Over the tab while a file is dragged across it: what dropping here does. Pointer events pass to the panel, which
	   keeps the drag. */
	.drop-hint {
		position: absolute;
		inset: 8px;
		z-index: 5;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 10px;
		padding: 16px;
		text-align: center;
		border: 2px dashed var(--accent);
		border-radius: var(--bu-radius-panel);
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(2px);
		pointer-events: none;
	}
</style>
