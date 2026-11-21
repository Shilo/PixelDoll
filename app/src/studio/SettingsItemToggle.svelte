<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	let {
		children,
		setting,
		...attributes
	}: HTMLInputAttributes & {
		children: Snippet;
		setting?: string;
	} = $props();
</script>

<label class="row bu-check" data-setting={setting}>
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
