<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	let {
		children,
		setting,
		tooltip,
		...attributes
	}: HTMLInputAttributes & {
		children: Snippet;
		setting?: string;
		/** Shown on hovering the whole row, not just the switch. */
		tooltip?: string;
	} = $props();
</script>

<label class="row bu-check" data-setting={setting} title={tooltip}>
	{@render children()}
	<input {...attributes} class="bu-switch" type="checkbox" role="switch" />
</label>

<style>
	.row {
		inline-size: 100%;
		min-height: 44px;
		padding-inline: 0;
	}
</style>
