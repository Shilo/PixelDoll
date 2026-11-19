<script lang="ts">
	import { t } from 'svelte-whisper';
	import type { Snippet } from 'svelte';
	import { ExternalLink, Info } from './icons.ts';

	let {
		href,
		tone = 'info',
		label,
		children,
		indicator
	}: {
		href: string;
		tone?: 'info' | 'warning';
		label?: string;
		children: Snippet;
		indicator?: Snippet;
	} = $props();
</script>

<a
	class="bu-btn notice-link"
	data-variant="quiet"
	{href}
	target="_blank"
	rel="noreferrer"
	aria-label={label}
>
	<span class="bu-notice notice-content" data-variant="quiet" data-tone={tone}>
		<span class="bu-notice-indicator notice-icon" aria-hidden="true">
			{#if indicator}{@render indicator()}{:else}<Info />{/if}
		</span>
		<span class="bu-notice-content">{@render children()}</span>
		<span class="external-icon bu-muted" aria-hidden="true"><ExternalLink size={14} /></span>
	</span>
	<span class="bu-sr"> {t('noticeLink.opensInANewTab')}</span>
</a>

<style>
	.notice-link {
		display: block;
		padding: var(--notice-padding-block, 2px) 0;
		min-height: 44px;
		text-align: start;
		line-height: inherit;
	}
	.notice-content {
		align-items: center;
		padding-block: 0;
		padding-inline-start: var(--notice-padding-start, 16px);
		gap: var(--notice-gap, 12px);
	}
	.notice-content > .notice-icon {
		margin-top: 0;
		height: 1lh;
	}
	.bu-notice-content {
		display: grid;
	}
	.external-icon {
		display: grid;
		place-items: center;
		flex: none;
	}
	.external-icon :global(svg) {
		width: 14px;
		height: 14px;
	}
</style>
