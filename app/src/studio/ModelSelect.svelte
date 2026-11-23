<script lang="ts" generics="T extends string">
	// A model picker whose open list prices every model, while the closed field shows only the chosen name: its price
	// is already in the footer. Prices are asked for only once the list is opened, so they cost nothing until then.
	type Option = { value: T; label: string; disabled?: boolean };
	let {
		id,
		value,
		options,
		disabled = false,
		cost,
		onopen,
		onpick
	}: {
		id?: string;
		value: T;
		options: readonly Option[];
		disabled?: boolean;
		/** The price shown beside a model in the open list, or nothing. */
		cost: (value: T) => string | undefined;
		/** The list is about to open: start any pricing it needs. */
		onopen?: () => void;
		onpick: (value: T) => void;
	} = $props();

	// Browsers without the customizable select drop markup inside options and show the chosen option's whole text in
	// the field, so they keep plain names.
	const rich = typeof CSS !== 'undefined' && CSS.supports('appearance', 'base-select');
	let listing = $state(false);

	const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp']);
	function open(event: Event) {
		if (event instanceof KeyboardEvent && !OPEN_KEYS.has(event.key)) return;
		if (disabled || !rich) return;
		listing = true;
		onopen?.();
	}
	function close(event: FocusEvent) {
		if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null))
			listing = false;
	}
</script>

<select
	{id}
	class="bu-input input model-select"
	{value}
	{disabled}
	onpointerdown={open}
	onkeydown={open}
	onfocusout={close}
	onchange={(event) => {
		listing = false;
		onpick(event.currentTarget.value as T);
	}}
>
	<!-- The field names the chosen model itself: <selectedcontent> would copy its price in, and Svelte's mirroring of it
	froze the page once prices appeared in the options. -->
	{#if rich}<button>{options.find((option) => option.value === value)?.label}</button>{/if}
	{#each options as option (option.value)}
		{@const price = rich && listing && !option.disabled ? cost(option.value) : undefined}
		<option value={option.value} disabled={option.disabled}
			>{#if rich}<span class="model-name">{option.label}</span>{#if price}<span class="model-cost"
						>{price}</span
					>{/if}{:else}{option.label}{/if}</option
		>
	{/each}
</select>

<style>
	.model-select > button {
		display: contents;
	}
	.model-select option {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.model-cost {
		margin-inline-start: auto;
		color: var(--bu-muted);
		font-size: var(--bu-small);
		white-space: nowrap;
	}
</style>
