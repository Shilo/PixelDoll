<script lang="ts">
	let { id, name }: { id: string; name: string } = $props();
</script>

{#if id.startsWith('fixture:')}{name.replace(/ \(demo\)$/i, '')}
	<span class="bu-muted">(Demo)</span>{:else}{name}{/if}
