<script lang="ts">
	// A character row with its ⋮ (and right-click) menu: the shared character actions.
	import type { Snippet } from 'svelte';
	import RowActions from './RowActions.svelte';
	import CharacterMenu from './CharacterMenu.svelte';
	let { id, name, children }: { id: string; name: string; children: Snippet } = $props();
</script>

<RowActions {name} {children}>
	{#snippet actions(close)}<CharacterMenu {id} {close} />{/snippet}
</RowActions>
