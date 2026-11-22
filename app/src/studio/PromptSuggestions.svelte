<script module lang="ts">
	export interface PromptSuggestion {
		/** Stable key; for a move template, the move id. */
		id: string;
		/** What the pill says, in the user's language. */
		label: string;
		/** The English text it puts in the prompt. */
		prompt: string;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { t } from 'svelte-whisper';
	// Ready-made prompts as quiet pills right under a prompt box: no heading, the pill shape is the cue. Ideas only fill
	// text, so they step aside once the user writes their own; templates that also apply settings stay, pressed while
	// applied.
	let {
		suggestions,
		label,
		value,
		active,
		limit = 3,
		onpick
	}: {
		suggestions: readonly PromptSuggestion[];
		/** The group's name for screen readers, such as "Item ideas". */
		label: string;
		/** The prompt's current text. */
		value: string;
		/** The applied template's id. Set for templates (they stay visible and show as pressed); omit for ideas. */
		active?: string;
		/** How many show before More; the rest follow in order. */
		limit?: number;
		onpick: (suggestion: PromptSuggestion) => void;
	} = $props();

	const templates = $derived(active !== undefined);
	let all = $state(false);
	const visible = $derived(all ? suggestions : suggestions.slice(0, limit));
	const text = $derived(value.trim());
	// Ideas show while the box is empty or still holds one of them, so swapping ideas never costs typed text.
	const shown = $derived(
		templates || !text || suggestions.some((suggestion) => suggestion.prompt === text)
	);
</script>

{#if shown && suggestions.length}
	<div class="prompt-suggestions" role="group" aria-label={label}>
		{#each visible as suggestion (suggestion.id)}
			<button
				type="button"
				class="suggestion"
				aria-pressed={templates ? active === suggestion.id : undefined}
				onclick={() => onpick(suggestion)}>{suggestion.label}</button
			>
		{/each}
		{#if visible.length < suggestions.length}
			<button
				type="button"
				class="suggestion more"
				onclick={async (event) => {
					const group = event.currentTarget.parentElement!;
					all = true;
					await tick();
					group.querySelectorAll<HTMLButtonElement>('button')[limit]?.focus();
				}}>{t('common.more')}</button
			>
		{/if}
	</div>
{/if}

<style>
	.prompt-suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-block-start: 4px;
	}
	/* Ghost pills: a soft fill says "tap me" without competing with the prompt or the form's real buttons. */
	.suggestion {
		min-block-size: 28px;
		padding: 0 10px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bu-text) 5%, transparent);
		color: var(--bu-muted);
		font: inherit;
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.suggestion:hover {
		border-color: var(--bu-border);
		color: var(--bu-text);
	}
	.suggestion:focus-visible {
		outline: 2px solid var(--bu-focus);
		outline-offset: 2px;
	}
	.more {
		background: none;
		color: var(--accent-text);
	}
	.suggestion[aria-pressed='true'] {
		border-color: color-mix(in srgb, var(--accent) 55%, transparent);
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	@media (pointer: coarse) {
		.suggestion {
			min-block-size: 36px;
			padding: 0 12px;
		}
	}
</style>
