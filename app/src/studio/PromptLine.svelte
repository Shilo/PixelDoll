<script lang="ts">
	// The prompt behind a result under review, kept to one quiet line with a copy button.
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { Check, Copy } from './icons.ts';
	import { toast } from './state.svelte.ts';

	let { text }: { text: string } = $props();
	let copied = $state(false);
	// When the clipboard refuses, the whole prompt is shown so it can be selected by hand.
	let expanded = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
		} catch {
			expanded = true;
			toast(message('toolbar.selectPromptToCopy'), { tone: 'warning' });
		}
	}
</script>

<div class="prompt-line">
	<p class="small prompt-text" class:expanded title={text}>{text}</p>
	<button
		class="bu-action btn icon"
		data-variant="quiet"
		type="button"
		aria-label={t(copied ? 'toolbar.copiedPrompt' : 'toolbar.copyPrompt')}
		title={t('toolbar.copyPrompt')}
		onclick={copy}
		>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</button
	>
</div>

<style>
	/* Set like a code block so it reads as the exact text that was sent, not as UI copy. */
	.prompt-line {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 4px;
		min-inline-size: 0;
		padding-inline-start: 10px;
		background: var(--stage);
		border: 1px solid var(--bu-line);
		border-radius: var(--r-ctl);
	}
	.prompt-text {
		margin: 0;
		font-family: var(--font-mono);
		color: var(--bu-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.prompt-text.expanded {
		white-space: normal;
		overflow-wrap: anywhere;
		user-select: text;
	}
	.prompt-line button {
		min-inline-size: 44px;
		min-block-size: 44px;
		display: grid;
		place-items: center;
	}
</style>
