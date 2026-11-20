<script lang="ts">
	import { t } from 'svelte-whisper';
	let { id, name }: { id: string; name: string } = $props();
</script>

{#if id.startsWith('fixture:')}{name.replace(/ \(demo\)$/i, '')}
	<span class="bu-muted">{t('characterName.demo')}</span>{:else}{name}{/if}
