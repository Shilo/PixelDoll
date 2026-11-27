<script lang="ts">
	import { t } from 'svelte-whisper';
	import { openerLabel } from './openerLabel.ts';
	import { hasEnabledAudio } from './audio.svelte.ts';
	import { Volume2 } from './icons.ts';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openSettings } from './settingsNavigation.svelte.ts';

	let { row = false, onactivate }: { row?: boolean; onactivate?: () => void } = $props();
	const label = $derived(t('settings.audio.open'));
</script>

<button
	type="button"
	class={row ? 'row bu-action mobile-audio' : 'bu-action header-audio'}
	data-variant="quiet"
	style:display={hasEnabledAudio() ? undefined : 'none'}
	aria-label={label}
	aria-haspopup="dialog"
	title={row ? undefined : label}
	onclick={() => {
		onactivate?.();
		openSettings('audio');
	}}
	><Volume2 size={row ? 18 : 20} aria-hidden="true" />
	{#if row}<span class="row-name">{openerLabel(label)}</span><SurfaceChevron />{/if}</button
>
