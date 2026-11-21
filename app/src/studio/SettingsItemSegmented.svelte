<script lang="ts" generics="Value extends string">
	import type { Snippet } from 'svelte';
	let {
		label,
		setting,
		options,
		value,
		onselect,
		icon,
		optionIcon
	}: {
		label: string;
		setting?: string;
		options: readonly { value: Value; label: string }[];
		value: Value;
		onselect: (value: Value) => void;
		icon?: Snippet;
		optionIcon?: Snippet<[Value]>;
	} = $props();
	const group = $props.id();
</script>

<div class="settings-segmented" data-setting={setting}>
	<span class="label">{@render icon?.()} {label}</span>
	<div class="bu-segmented" role="radiogroup" aria-label={label}>
		{#each options as option (option.value)}
			<label class="bu-segment">
				<input
					type="radio"
					name={group}
					value={option.value}
					checked={value === option.value}
					onchange={() => onselect(option.value)}
				/>
				<span class="bu-segment-face">
					{#if optionIcon}<span class="option-icon">{@render optionIcon(option.value)}</span>{/if}
					<span>{option.label}</span>
				</span>
			</label>
		{/each}
	</div>
</div>

<style>
	.settings-segmented,
	.label {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.settings-segmented {
		min-height: 44px;
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.bu-segmented {
		flex: 1 1 11rem;
		max-inline-size: 15rem;
	}
	.bu-segment-face {
		min-height: 38px;
		gap: 6px;
	}
	.option-icon {
		display: flex;
	}
</style>
