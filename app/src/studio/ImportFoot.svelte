<script lang="ts">
	// An Import page's footer: free, then Import the chosen moves, States or items.
	import { t } from 'svelte-whisper';
	let { busy, disabled, onimport }: { busy: boolean; disabled: boolean; onimport: () => void } =
		$props();
</script>

<span class="foot-note muted small">{t('moveImport.free')}</span>
<button
	class="bu-action btn primary"
	data-variant="primary"
	disabled={disabled || busy}
	onclick={onimport}>{busy ? t('moveImport.importing') : t('moveImport.import')}</button
>
