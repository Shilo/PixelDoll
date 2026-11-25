<script lang="ts">
	import { t } from 'svelte-whisper';
	import { Volume2 } from './icons.ts';
	import { openSettings } from './settingsNavigation.svelte.ts';
</script>

<button
	type="button"
	class="bu-action header-audio"
	data-variant="quiet"
	aria-label={t('settings.audio.open')}
	aria-haspopup="dialog"
	title={t('settings.audio.open')}
	onclick={() => openSettings('audio')}><Volume2 size={18} aria-hidden="true" /></button
>
