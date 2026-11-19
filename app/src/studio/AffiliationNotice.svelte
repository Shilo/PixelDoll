<script lang="ts">
	import { t } from 'svelte-whisper';
	import NoticeLink from './NoticeLink.svelte';

	let { multiline = false }: { multiline?: boolean } = $props();
</script>

<div class="affiliation-spacing">
	<NoticeLink
		href="https://pixellab.ai"
		label={t('affiliationNotice.labelPoweredByPixelLabNotAnOfficial')}
	>
		<span class={multiline ? 'multiline' : undefined}
			><span class="affiliation-sentence">{t('affiliationNotice.poweredByPixelLab')}</span>
			<span class="affiliation-sentence bu-muted">{t('affiliationNotice.notAnOfficialApp')}</span
			></span
		>
	</NoticeLink>
</div>

<style>
	.affiliation-sentence {
		display: inline-block;
		max-width: 100%;
	}
	.multiline > .affiliation-sentence {
		display: block;
	}
	:global(.menu) .affiliation-spacing {
		--notice-padding-block: 4px 0;
		--notice-padding-start: 7px;
		--notice-gap: 11px;
	}
</style>
