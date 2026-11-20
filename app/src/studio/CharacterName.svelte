<script lang="ts">
	import { t } from 'svelte-whisper';
	import { openerLabel, openerName } from './openerLabel.ts';
	let { id, name, opener = false }: { id: string; name: string; opener?: boolean } = $props();
</script>

{#if id.startsWith('fixture:')}{name.replace(/ \(demo\)$/i, '')}
	<span class="bu-muted"
		>{opener ? openerLabel(t('characterName.demo')) : t('characterName.demo')}</span
	>{:else if opener}<span class="name-opener-value">{openerName(name).slice(0, -3)}</span><span
		class="name-opener-suffix">...</span
	>
{:else}{name}{/if}
