<script lang="ts">
	// A typeable number between minus and plus buttons. The buttons stay within min and max; typing is left to the caller to
	// validate, so a half-typed value is never rewritten under the cursor.
	import { Minus, Plus } from './icons.ts';
	let {
		value = $bindable(),
		min = 0,
		max = Infinity,
		step = 1,
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
		suffix?: string;
		disabled?: boolean;
		labelledby: string;
		decreaseLabel: string;
		increaseLabel: string;
		onchange?: (value: number) => void;
	} = $props();
	const current = $derived(Number.isFinite(value) ? value : min);
	function by(delta: number) {
		value = Math.max(min, Math.min(max, current + delta));
		onchange?.(value);
	}
</script>

<div class="stepper">
	<button
		type="button"
		class="bu-action btn icon"
		data-variant="outline"
		aria-label={decreaseLabel}
		disabled={disabled || current - step < min}
		onclick={() => by(-step)}><Minus size={16} /></button
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
			bind:value
			oninput={() => onchange?.(value)}
		/>{#if suffix}<span aria-hidden="true">{suffix}</span>{/if}
	</div>
	<button
		type="button"
		class="bu-action btn icon"
		data-variant="outline"
		aria-label={increaseLabel}
		disabled={disabled || current + step > max}
		onclick={() => by(step)}><Plus size={16} /></button
	>
</div>

<style>
	.stepper {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}
	.btn.icon {
		min-height: 44px;
		flex: 0 0 44px;
		width: 44px;
		padding: 0;
		justify-content: center;
	}
	.number {
		position: relative;
		flex: 1 1 96px;
		min-width: 0;
	}
	.number input {
		height: 100%;
		font-variant-numeric: tabular-nums;
		appearance: textfield;
		-moz-appearance: textfield;
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
