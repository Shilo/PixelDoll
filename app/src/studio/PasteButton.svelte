<script lang="ts">
	import { t } from 'svelte-whisper';
	import { ClipboardPaste } from './icons.ts';
	import { canPasteImages, clipboardImages } from './clipboard.ts';

	let {
		disabled = false,
		class: className = '',
		onfiles,
		onerror
	}: {
		disabled?: boolean;
		class?: string;
		onfiles: (files: File[]) => void;
		onerror: (error: unknown) => void;
	} = $props();
	let reading = $state(false);

	async function paste() {
		if (disabled || reading) return;
		reading = true;
		try {
			onfiles(await clipboardImages());
		} catch (error) {
			onerror(error);
		} finally {
			reading = false;
		}
	}
</script>

{#if canPasteImages()}
	<button
		type="button"
		class={['bu-action paste', className]}
		data-variant="quiet"
		aria-label={t('clipboard.paste')}
		title={t('clipboard.paste')}
		disabled={disabled || reading}
		onclick={() => void paste()}><ClipboardPaste size={16} /></button
	>
{/if}

<style>
	.paste {
		inline-size: 32px;
		block-size: 32px;
		min-block-size: 32px;
		padding: 0;
		flex: none;
	}
</style>
