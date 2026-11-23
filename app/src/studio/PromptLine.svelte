<script lang="ts">
	// The prompt behind a result under review: a code view up to four lines tall that scrolls when longer, and copies whole.
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { Check, Copy } from './icons.ts';
	import { toast } from './state.svelte.ts';

	let { text }: { text: string } = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
		} catch {
			toast(message('toolbar.selectPromptToCopy'), { tone: 'warning', report: false });
		}
	}
</script>

<div class="prompt-line">
	<!-- A long prompt scrolls inside the view, so keyboard users need to reach the scroller. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<code class="small prompt-text" role="region" aria-label={t('common.prompt')} tabindex="0"
		>{text}</code
	>
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
	/* Set like a code block so it reads as the entered prompt, not as interface copy. */
	.prompt-line {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 4px;
		min-inline-size: 0;
		padding-inline-start: 10px;
		background: var(--stage);
		border: 1px solid var(--bu-line);
		border-radius: var(--r-ctl);
	}
	.prompt-text {
		max-block-size: calc(4lh + 20px);
		padding-block: 10px;
		overflow-y: auto;
		font-family: var(--font-mono);
		line-height: 1.5;
		color: var(--bu-text);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		user-select: text;
		scrollbar-width: thin;
	}
	.prompt-line button {
		min-inline-size: 44px;
		min-block-size: 44px;
		display: grid;
		place-items: center;
	}
</style>
