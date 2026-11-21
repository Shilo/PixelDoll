<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	let {
		children,
		element = $bindable(),
		class: className,
		...attributes
	}: HTMLButtonAttributes & { children: Snippet; element?: HTMLButtonElement } = $props();
</script>

<button
	{...attributes}
	bind:this={element}
	type="button"
	class={['bu-action settings-action', className]}
	data-variant="outline"
>
	{@render children()}
</button>

<style>
	.settings-action {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		inline-size: 100%;
		height: auto;
		min-height: 44px;
		padding: 8px 12px;
		white-space: normal;
		overflow-wrap: anywhere;
		text-align: start;
	}
	.settings-action :global(svg) {
		flex: none;
	}
</style>
