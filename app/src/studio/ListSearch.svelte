<script lang="ts">
	import { Search, X } from './icons.ts';
	// One search field for the Studio's lists. The owner decides when it is worth showing (searchVisibility.svelte.ts)
	// and filters its own rows; this only edits the query and clears it again.
	let {
		value = $bindable(''),
		label,
		placeholder = label,
		clearLabel,
		summary = '',
		shown = true,
		flush = false
	}: {
		value?: string;
		label: string;
		placeholder?: string;
		clearLabel: string;
		summary?: string;
		shown?: boolean;
		flush?: boolean;
	} = $props();
	let input = $state<HTMLInputElement>();
	function clear() {
		value = '';
		input?.focus();
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && value) {
			event.preventDefault();
			clear();
		}
	}
</script>

{#if shown}
	<div class="list-search" class:flush>
		<div class="search-field">
			<span class="magnifier"><Search size={16} aria-hidden="true" /></span>
			<input
				class="bu-input"
				type="search"
				bind:this={input}
				{placeholder}
				aria-label={label}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				bind:value
				onkeydown={keydown}
			/>
			{#if value}<button
					class="bu-action btn icon plain clear"
					data-variant="quiet"
					type="button"
					aria-label={clearLabel}
					title={clearLabel}
					onclick={clear}><X size={14} /></button
				>{/if}
		</div>
		<span class="sr" aria-live="polite" aria-atomic="true">{value ? summary : ''}</span>
	</div>
{/if}

<style>
	.list-search {
		flex: none;
		padding: 4px 5px 8px;
	}
	.list-search.flush {
		flex: 1;
		min-width: 0;
		padding: 0;
	}
	.search-field {
		position: relative;
		display: flex;
		flex-direction: row;
		align-items: center;
	}
	.bu-input {
		flex: 1;
		min-height: 44px;
		font-size: 16px;
		padding-inline: 34px 48px;
	}
	/* One clear control: the native one has no accessible name and duplicates ours. */
	.bu-input::-webkit-search-cancel-button,
	.bu-input::-webkit-search-decoration {
		appearance: none;
	}
	.magnifier {
		position: absolute;
		inset-inline-start: 12px;
		top: 50%;
		translate: 0 -50%;
		display: flex;
		color: var(--bu-muted);
		pointer-events: none;
	}
	.clear {
		position: absolute;
		inset-inline-end: 0;
		top: 50%;
		translate: 0 -50%;
		z-index: 1;
		width: 44px;
		height: 44px;
	}
</style>
