<script lang="ts">
	import { t } from 'svelte-whisper';
	import { releaseNews } from './releaseNews.svelte.ts';
</script>

{#if releaseNews.unseen}
	<span class="unseen-dot" aria-hidden="true"></span>
	<span class="sr">{t('releaseNews.unseen')}</span>
{/if}

<style>
	.unseen-dot {
		flex: none;
		inline-size: 6px;
		block-size: 6px;
		border-radius: 50%;
		background: var(--bu-accent);
	}
</style>
