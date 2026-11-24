<script lang="ts">
	// An Import page's ZIP: the drop area with Choose ZIP, or (after one was read) just a Choose another ZIP button. The page
	// itself takes drops anywhere on it.
	import { t } from 'svelte-whisper';
	import { FileArchive } from './icons.ts';
	import { preventFileNavigation } from './fileDrop.ts';
	let {
		busy,
		dragging,
		intro,
		compact = false,
		onfiles
	}: {
		busy: boolean;
		dragging: boolean;
		intro: string;
		compact?: boolean;
		onfiles: (files: File[]) => void;
	} = $props();
	let input = $state<HTMLInputElement>();
	function changed(e: Event) {
		const field = e.currentTarget as HTMLInputElement,
			files = Array.from(field.files ?? []);
		field.value = '';
		onfiles(files);
	}
</script>

<!-- A ZIP dropped beside the page is ignored instead of replacing the app. -->
<svelte:window ondragover={preventFileNavigation} ondrop={preventFileNavigation} />

{#if compact}
	<button
		class="bu-action btn sm another"
		data-variant="outline"
		disabled={busy}
		onclick={() => input?.click()}
		><FileArchive size={16} aria-hidden="true" />{t('import.chooseAnother')}</button
	>
{:else}
	<section
		class="bu-dialog-surface zip-drop"
		class:dragging
		aria-label={t('moveImport.dropArea')}
		aria-busy={busy}
	>
		<FileArchive size={32} />
		<strong aria-live="polite"
			>{busy ? t('import.reading') : dragging ? t('import.release') : t('moveImport.drop')}</strong
		>
		<span class="muted small">{intro}</span>
		<button
			class="bu-action btn"
			data-variant="outline"
			disabled={busy}
			onclick={() => input?.click()}>{t('import.chooseZip')}</button
		>
	</section>
{/if}
<input
	hidden
	type="file"
	accept=".zip,application/zip"
	aria-label={t('moveImport.zip')}
	bind:this={input}
	disabled={busy}
	onchange={changed}
/>

<style>
	.zip-drop {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 28px 16px;
		text-align: center;
	}
	.zip-drop.dragging {
		outline: 2px dashed var(--accent);
		outline-offset: -6px;
	}
	.another {
		justify-self: start;
		gap: 6px;
	}
</style>
