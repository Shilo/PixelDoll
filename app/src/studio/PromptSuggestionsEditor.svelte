<script lang="ts">
	import { ArrowDown, ArrowUp, Trash2 } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { t } from 'svelte-whisper';
	import type { SuggestionListKey } from './promptSuggestionDefaults.ts';
	import {
		addSuggestion,
		deleteSuggestion,
		editSuggestion,
		effectiveSuggestions,
		type StoredList
	} from './promptSuggestions.ts';
	import {
		defaultSuggestions,
		promptSuggestions,
		resetSuggestionLists,
		suggestionListAtDefaults,
		suggestionStorageUnreadable,
		updateSuggestions
	} from './promptSuggestions.svelte.ts';

	let { listKey }: { listKey: SuggestionListKey } = $props();
	const id = $props.id();
	const suggestions = $derived(promptSuggestions(listKey));
	const defaults = $derived(defaultSuggestions(listKey));
	const unreadable = $derived(suggestionStorageUnreadable());
	let error = $state<'save' | 'prompt'>();
	// The one field whose save failed: leaving it again retries, and no other field is saved unasked.
	let unsaved = $state<string>();
	let draft = $state<{ title: string; prompt: string }>();
	let draftTitle = $state<HTMLInputElement>();
	let addButton = $state<HTMLButtonElement>();
	let rows: HTMLOListElement;

	function save(update: (list: StoredList) => StoredList) {
		const saved = updateSuggestions(listKey, update);
		error = saved ? undefined : 'save';
		return saved;
	}

	function edit(
		suggestionId: string,
		field: 'title' | 'prompt',
		input: HTMLInputElement | HTMLTextAreaElement
	) {
		if (
			field === 'prompt' &&
			!input.value.trim() &&
			!defaults.some(({ id }) => id === suggestionId)
		)
			error = 'prompt';
		else if (!save((list) => editSuggestion(list, defaults, suggestionId, field, input.value))) {
			unsaved = `${suggestionId}:${field}`;
			return; // Keep the unsaved text so the user can try again.
		}
		unsaved = undefined;
		const effective = promptSuggestions(listKey).find(({ id }) => id === suggestionId);
		if (effective) input.value = effective[field];
	}

	async function move(suggestionId: string, offset: number, button: HTMLButtonElement) {
		const row = button.closest('li');
		if (
			!save((list) => {
				const order = effectiveSuggestions(defaults, list).map(({ id }) => id);
				const index = order.indexOf(suggestionId);
				const next = index + offset;
				if (index === -1 || next < 0 || next >= order.length) return list;
				[order[index], order[next]] = [order[next], order[index]];
				return { ...list, order };
			})
		)
			return;
		await tick();
		if (button.disabled || document.activeElement !== button) row?.querySelector('input')?.focus();
	}

	async function remove(suggestionId: string, index: number) {
		if (!save((list) => deleteSuggestion(list, defaults, suggestionId))) return;
		await tick();
		const nextRow = rows.children[Math.min(index, rows.children.length - 1)];
		(nextRow?.querySelector('input') ?? (draft ? draftTitle : addButton))?.focus();
	}

	async function beginAdd() {
		draft = { title: '', prompt: '' };
		await tick();
		draftTitle?.focus();
	}

	async function finishAdd() {
		if (!draft?.prompt.trim()) return;
		const entry = { id: `u_${crypto.randomUUID()}`, ...draft };
		if (!save((list) => addSuggestion(list, entry))) return;
		draft = undefined;
		await tick();
		rows.lastElementChild?.querySelector('input')?.focus();
	}

	async function cancelAdd() {
		draft = undefined;
		await tick();
		addButton?.focus();
	}

	async function restore() {
		const saved = resetSuggestionLists([listKey]);
		error = saved ? undefined : 'save';
		if (!saved) return;
		draft = undefined;
		await tick();
		rows.querySelector('input')?.focus();
	}
</script>

<section class="editor" aria-labelledby={`${id}-heading`}>
	<h3 class="section-title" id={`${id}-heading`}>{t('promptSuggestions.heading')}</h3>
	{#if listKey === 'move'}
		<p class="bu-muted">{t('promptSuggestions.moveHelp')}</p>
	{/if}
	{#if unreadable}
		<p role="alert">{t('promptSuggestions.readFailed')}</p>
	{/if}
	{#if error}
		<p role="alert">
			{t(error === 'save' ? 'promptSuggestions.saveFailed' : 'promptSuggestions.promptRequired')}
		</p>
	{/if}
	<ol class="rows" bind:this={rows}>
		{#each suggestions as suggestion, index (suggestion.id)}
			<li class="row">
				<label
					>{t('promptSuggestions.title')}
					<input
						class="bu-input"
						aria-label={`${t('promptSuggestions.title')}: ${index + 1}`}
						value={suggestion.title}
						disabled={unreadable}
						onchange={(event) => edit(suggestion.id, 'title', event.currentTarget)}
						onblur={(event) =>
							unsaved === `${suggestion.id}:title` &&
							edit(suggestion.id, 'title', event.currentTarget)}
					/>
				</label>
				<label
					>{t('promptSuggestions.prompt')}
					<textarea
						class="bu-input"
						rows={2}
						aria-label={`${t('promptSuggestions.prompt')}: ${index + 1}`}
						value={suggestion.prompt}
						disabled={unreadable}
						onchange={(event) => edit(suggestion.id, 'prompt', event.currentTarget)}
						onblur={(event) =>
							unsaved === `${suggestion.id}:prompt` &&
							edit(suggestion.id, 'prompt', event.currentTarget)}></textarea>
				</label>
				<div class="actions">
					{#each [[-1, ArrowUp, t('wardrobe.moveUp')], [1, ArrowDown, t('wardrobe.moveDown')]] as const as [offset, Icon, label] (offset)}
						<button
							type="button"
							class="bu-btn"
							data-variant="quiet"
							data-icon
							aria-label={label}
							title={label}
							disabled={unreadable || index + offset < 0 || index + offset >= suggestions.length}
							onclick={(event) => move(suggestion.id, offset, event.currentTarget)}
						>
							<Icon size={16} aria-hidden="true" />
						</button>
					{/each}
					<button
						type="button"
						class="bu-btn"
						data-variant="quiet"
						data-icon
						aria-label={t('common.delete')}
						title={t('common.delete')}
						disabled={unreadable}
						onclick={() => remove(suggestion.id, index)}
					>
						<Trash2 size={16} aria-hidden="true" />
					</button>
				</div>
			</li>
		{/each}
	</ol>
	{#if draft}
		<div class="row">
			<label
				>{t('promptSuggestions.title')}
				<input
					class="bu-input"
					aria-label={`${t('promptSuggestions.title')}: ${suggestions.length + 1}`}
					bind:this={draftTitle}
					bind:value={draft.title}
				/>
			</label>
			<label
				>{t('promptSuggestions.prompt')}
				<textarea
					class="bu-input"
					rows={2}
					aria-label={`${t('promptSuggestions.prompt')}: ${suggestions.length + 1}`}
					bind:value={draft.prompt}></textarea>
			</label>
		</div>
	{/if}
	<div class="actions">
		{#if draft}
			<button
				type="button"
				class="bu-btn"
				disabled={unreadable || !draft.prompt.trim()}
				onclick={finishAdd}
			>
				{t('promptSuggestions.add')}
			</button>
			<button type="button" class="bu-btn" data-variant="quiet" onclick={cancelAdd}
				>{t('common.cancel')}</button
			>
		{:else}
			<button
				type="button"
				class="bu-btn"
				bind:this={addButton}
				disabled={unreadable}
				onclick={beginAdd}
			>
				{t('promptSuggestions.add')}
			</button>
		{/if}
		<button
			type="button"
			class="bu-btn"
			data-variant="quiet"
			disabled={suggestionListAtDefaults(listKey)}
			onclick={restore}
		>
			{t('promptSuggestions.restore')}
		</button>
	</div>
</section>

<style>
	.editor,
	.rows {
		display: grid;
		gap: 12px;
	}
	.editor {
		margin-block-start: 16px;
		min-inline-size: 0;
	}
	.editor :is(h3, p),
	.rows {
		margin: 0;
	}
	.rows {
		padding: 0;
		list-style: none;
	}
	/* The title shares its line with the row's actions; the prompt gets the full width below. */
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'title actions' 'prompt prompt';
		gap: 8px;
	}
	.row > label:first-child {
		grid-area: title;
	}
	.row > label:nth-child(2) {
		grid-area: prompt;
	}
	.row > .actions {
		grid-area: actions;
	}
	label {
		display: grid;
		gap: 4px;
	}
	label :is(input, textarea) {
		inline-size: 100%;
		min-inline-size: 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.row .actions {
		align-self: end;
	}
</style>
