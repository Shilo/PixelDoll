<script lang="ts">
	// A typeable number between minus and plus buttons. Typing commits only an accepted number, so a half-typed draft is
	// never rewritten under the cursor; leaving the field with a rejected draft shows the committed value again, and the
	// buttons always step from the committed value.
	import { untrack } from 'svelte';
	import { Minus, Plus } from './icons.ts';
	let {
		value = $bindable(),
		min = 0,
		max = Infinity,
		step = 1,
		values,
		accept,
		suffix = '',
		disabled = false,
		labelledby,
		decreaseLabel,
		increaseLabel,
		onchange
	}: {
		value: number;
		min?: number;
		max?: number;
		step?: number;
		/** The only allowed values, ascending: the buttons move between them. */
		values?: readonly number[];
		/** Which typed numbers commit (default: whole numbers within min and max, or one of `values`). */
		accept?: (value: number) => boolean;
		suffix?: string;
		disabled?: boolean;
		labelledby: string;
		decreaseLabel: string;
		increaseLabel: string;
		onchange?: (value: number) => void;
	} = $props();
	const accepts = (n: number) =>
		accept ? accept(n) : values ? values.includes(n) : Number.isInteger(n) && n >= min && n <= max;
	let draft = $state(untrack(() => String(value)));
	$effect(() => {
		const committed = value;
		untrack(() => {
			if (Number(draft) !== committed || draft.trim() === '') draft = String(committed);
		});
	});
	const previous = $derived(
		values ? values.filter((n) => n < value).at(-1) : value - step >= min ? value - step : undefined
	);
	const next = $derived(
		values ? values.find((n) => n > value) : value + step <= max ? value + step : undefined
	);
	function commit(n: number) {
		value = n;
		draft = String(n);
		onchange?.(n);
	}
</script>

<div class="stepper">
	<button
		type="button"
		class="bu-action btn icon"
		data-variant="field"
		aria-label={decreaseLabel}
		disabled={disabled || previous === undefined}
		onclick={() => previous !== undefined && commit(previous)}><Minus size={16} /></button
	>
	<div class="number">
		<input
			class="bu-input input"
			aria-labelledby={labelledby}
			type="number"
			inputmode="numeric"
			{min}
			max={Number.isFinite(max) ? max : undefined}
			{step}
			{disabled}
			value={draft}
			oninput={(event) => {
				draft = event.currentTarget.value;
				const n = Number(draft);
				if (draft.trim() !== '' && accepts(n) && n !== value) {
					value = n;
					onchange?.(n);
				}
			}}
			onblur={() => {
				if (draft.trim() === '' || !accepts(Number(draft))) draft = String(value);
			}}
		/>{#if suffix}<span aria-hidden="true">{suffix}</span>{/if}
	</div>
	<button
		type="button"
		class="bu-action btn icon"
		data-variant="field"
		aria-label={increaseLabel}
		disabled={disabled || next === undefined}
		onclick={() => next !== undefined && commit(next)}><Plus size={16} /></button
	>
</div>

<style>
	/* One joined control: only its outer corners are rounded, and neighbors share a single border line. The buttons use
	   Bronze's field variant so their border and fill match the text field's. */
	.stepper {
		display: flex;
		align-items: stretch;
	}
	.btn.icon {
		position: relative;
		min-height: 44px;
		flex: 0 0 44px;
		width: 44px;
		padding: 0;
		justify-content: center;
	}
	.btn.icon:first-child {
		border-start-end-radius: 0;
		border-end-end-radius: 0;
	}
	.btn.icon:last-child {
		border-start-start-radius: 0;
		border-end-start-radius: 0;
	}
	.number {
		position: relative;
		flex: 1 1 96px;
		min-width: 0;
		margin-inline: -1px;
	}
	.number input {
		position: relative;
		height: 100%;
		border-radius: 0;
		text-align: center;
		font-variant-numeric: tabular-nums;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	/* Keep the focused part's full outline above its neighbors. */
	.btn.icon:focus-visible,
	.number input:focus-visible {
		z-index: 1;
	}
	.number:has(span) input {
		padding-right: 33px;
	}
	.number input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}
	.number > span {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-3);
		font-size: var(--fs-sm);
		pointer-events: none;
	}
</style>
