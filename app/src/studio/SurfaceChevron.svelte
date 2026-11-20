<script lang="ts">
	import { ChevronRight } from './icons.ts';
	let { compact = false }: { compact?: boolean } = $props();
</script>

<ChevronRight
	size={compact ? 12 : 16}
	aria-hidden="true"
	data-surface-chevron={compact ? 'compact' : ''}
/>

<style>
	:global(svg[data-surface-chevron]) {
		flex: none;
		align-self: center;
		margin-inline-start: auto;
	}
	:global(svg[data-surface-chevron='compact']) {
		margin-inline-start: 0;
	}
</style>
