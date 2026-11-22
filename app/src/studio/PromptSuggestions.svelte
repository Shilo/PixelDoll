<script lang="ts">
	import type { PromptSuggestion } from './promptSuggestions.ts';
	// Ready-made prompts as quiet pills right under a prompt box: no heading, the pill shape is the cue. Ideas only fill
	// text: one shows as pressed while the text is exactly its prompt, and they step aside once the user writes their own.
	// Templates that also apply settings stay, pressed while applied, through any edit.
	let {
		suggestions,
		label,
		value,
		active,
		onpick
	}: {
		suggestions: readonly PromptSuggestion[];
		/** The group's name for screen readers, such as "Item ideas". */
		label: string;
		/** The prompt's current text. */
		value: string;
		/** The applied template's id. Set for templates (they stay visible, the applied one pressed); omit for ideas. */
		active?: string;
		onpick: (suggestion: PromptSuggestion) => void;
	} = $props();

	const templates = $derived(active !== undefined);
	const text = $derived(value.trim());
	// Ideas show while the box is empty or still holds one of them, so swapping ideas never costs typed text.
	const shown = $derived(
		templates || !text || suggestions.some((suggestion) => suggestion.prompt === text)
	);
</script>

{#if shown && suggestions.length}
	<div class="prompt-suggestions" role="group" aria-label={label}>
		{#each suggestions as suggestion (suggestion.id)}
			<button
				type="button"
				class="suggestion"
				aria-pressed={suggestion.action
					? active === suggestion.action
					: suggestion.prompt.trim() === text}
				onclick={() => onpick(suggestion)}>{suggestion.title}</button
			>
		{/each}
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
		max-inline-size: 100%;
		overflow-wrap: anywhere;
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
	.suggestion[aria-pressed='true'] {
		border-color: color-mix(in srgb, var(--accent) 55%, transparent);
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	@media (pointer: coarse) {
		.suggestion {
			min-block-size: 44px;
			padding: 0 12px;
		}
	}
</style>
