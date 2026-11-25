<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	const id = $props.id();
	let {
		label,
		accessibleLabel = label,
		setting,
		valueText,
		icon,
		trailing,
		...attributes
	}: HTMLInputAttributes & {
		label: string;
		accessibleLabel?: string;
		setting?: string;
		valueText?: string;
		icon?: Snippet;
		trailing?: Snippet;
	} = $props();
</script>

<div class="settings-slider">
	<label for={id} title={label}>
		{@render icon?.()}
		<span>{label}</span>
	</label>
	<div class="range" data-setting={setting}>
		<input
			{...attributes}
			{id}
			type="range"
			class="bu-focus"
			aria-label={accessibleLabel}
			aria-valuetext={valueText}
		/>
	</div>
	<span class="value" aria-hidden="true">{valueText ?? attributes.value}</span>
	{@render trailing?.()}
</div>

<style>
	.settings-slider {
		display: grid;
		grid-template-columns: minmax(0, 36%) minmax(44px, 1fr) 5ch auto;
		align-items: center;
		gap: 8px;
	}
	label {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	label > :global(svg) {
		flex: none;
	}
	label span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.value {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}
	input {
		display: block;
		inline-size: 100%;
		min-block-size: 44px;
		margin: 0;
	}
</style>
