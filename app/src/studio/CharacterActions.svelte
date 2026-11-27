<script lang="ts">
	// The same actions open from a character row, sprite or name.
	import type { Snippet } from 'svelte';
	import RowActions from './RowActions.svelte';
	import CharacterMenu from './CharacterMenu.svelte';
	let { id, name, children }: { id: string; name: string; children?: Snippet } = $props();
	let rowActions: RowActions;
	export function show(source: HTMLElement, at?: DOMRect) {
		rowActions.show(source, at);
	}
</script>

<RowActions {name} key={id} {children} bind:this={rowActions}>
	{#snippet actions(close)}<CharacterMenu {id} {close} />{/snippet}
</RowActions>
