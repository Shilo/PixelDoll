<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { formatDate, getLocale, t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import ReleaseArticle from './ReleaseArticle.svelte';
	import { ChevronRight } from './icons.ts';
	import { releaseNews } from './releaseNews.svelte.ts';

	// The release list (with its headlines) loads only now, when the window opens.
	if (releaseNews.entries === undefined) void releaseNews.loadList();
	const latest = $derived(releaseNews.entries?.[0]);
	const older = $derived(releaseNews.entries?.slice(1));
	const locale = $derived(getLocale() || 'en');
	const expanded = new SvelteSet<string>();
	function dateLabel(date: string) {
		return formatDate(new Date(date), { dateStyle: 'medium', timeZone: 'UTC' });
	}
</script>

<Sheet
	title={t('releaseNews.title')}
	className="release-news-sheet"
	overlay
	topLayer
	onclose={releaseNews.close}
>
	<div class="release-news">
		{#if latest}
			{#key latest.version}
				<ReleaseArticle
					entry={latest}
					{locale}
					date={dateLabel(latest.date)}
					onshown={() => releaseNews.markShown(latest.version)}
				/>
			{/key}
		{:else if releaseNews.entries === null}
			<div class="release-error">
				<p role="alert">{t('releaseNews.loadError')}</p>
				<button
					class="bu-action"
					data-variant="outline"
					type="button"
					onclick={releaseNews.refresh}
				>
					{t('common.tryAgain')}
				</button>
			</div>
		{:else if releaseNews.entries}
			<p class="bu-muted">{t('releaseNews.empty')}</p>
		{:else}
			<p class="bu-muted" role="status">{t('common.loading')}</p>
		{/if}

		{#if older?.length}
			<section class="past-releases">
				<h3>{t('releaseNews.pastUpdates')}</h3>
				{#each older as entry (entry.version)}
					<details
						ontoggle={(event) => {
							if (event.currentTarget.open) expanded.add(entry.version);
						}}
					>
						<summary class="bu-action release-toggle" data-variant="outline">
							<ChevronRight size={16} aria-hidden="true" />
							<span>
								<bdi>v{entry.version}</bdi> ·
								<time datetime={entry.date}>{dateLabel(entry.date)}</time>
								·
								<span lang={entry.headline[locale] ? locale : 'en'}
									>{entry.headline[locale] || entry.headline.en}</span
								>
							</span>
						</summary>
						{#if expanded.has(entry.version)}
							<ReleaseArticle {entry} {locale} date={dateLabel(entry.date)} />
						{/if}
					</details>
				{/each}
			</section>
		{/if}
	</div>
</Sheet>

<style>
	.release-news {
		max-inline-size: 66ch;
		margin-inline: auto;
		overflow-wrap: anywhere;
	}
	.past-releases {
		margin-block-start: 28px;
	}
	.past-releases h3 {
		margin-block: 0 4px;
	}
	.past-releases {
		display: grid;
		gap: 8px;
	}
	.past-releases details[open] {
		padding-block-end: 16px;
	}
	.release-error p {
		margin-block-start: 0;
	}
</style>
