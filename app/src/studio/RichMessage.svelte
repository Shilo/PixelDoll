<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t, type WhisperKey, type WhisperVars } from 'svelte-whisper';

	let {
		key,
		vars,
		slots
	}: {
		key: WhisperKey;
		vars?: WhisperVars;
		slots: Record<string, Snippet>;
	} = $props();

	const variable = (name: string) =>
		vars && Object.hasOwn(vars, name) ? (vars as Record<string, unknown>)[name] : undefined;
	const parts = $derived.by(() => {
		const count = variable('count');
		return t(key, typeof count === 'number' ? { count } : undefined).split(/(\{[^{}]+\})/);
	});
</script>

{#each parts as part, index (index)}{#if index % 2}{@const name = part
			.slice(1, -1)
			.trim()}{#if Object.hasOwn(slots, name)}{@render slots[name]()}{:else}{variable(name) ??
				part}{/if}{:else}{part}{/if}{/each}
