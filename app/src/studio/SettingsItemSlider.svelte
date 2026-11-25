<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	let {
		label,
		setting,
		valueText,
		...attributes
	}: HTMLInputAttributes & {
		label: string;
		setting?: string;
		valueText?: string;
	} = $props();
</script>

<label class="settings-slider" data-setting={setting}>
	<span>{label}</span>
	<span aria-hidden="true">{valueText ?? attributes.value}</span>
	<input {...attributes} type="range" class="bu-focus" aria-valuetext={valueText} />
</label>

<style>
	.settings-slider {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 12px;
		padding-block-start: 4px;
	}
	input {
		grid-column: 1 / -1;
		inline-size: 100%;
		min-block-size: 44px;
		margin: 0;
	}
</style>
