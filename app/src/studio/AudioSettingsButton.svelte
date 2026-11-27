<script lang="ts">
	import { t } from 'svelte-whisper';
	import { hasEnabledAudio } from './audio.svelte.ts';
	import { Volume2 } from './icons.ts';
	import { openSettings } from './settingsNavigation.svelte.ts';
</script>

<button
	type="button"
	class="bu-action header-audio"
	data-trail="toolbar.audio"
	data-variant="quiet"
	style:display={hasEnabledAudio() ? undefined : 'none'}
	aria-label={t('settings.audio.open')}
	aria-haspopup="dialog"
	title={t('settings.audio.open')}
	onclick={() => openSettings('audio')}><Volume2 size={18} aria-hidden="true" /></button
>
