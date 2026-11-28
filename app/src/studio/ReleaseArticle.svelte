<script lang="ts">
	import { formatNumber, t } from 'svelte-whisper';
	import {
		fetchReleaseChanges,
		fetchReleaseNotes,
		releaseUrl,
		type ReleaseChanges,
		type ReleaseEntry
	} from '../lib/releases.ts';
	import { repository } from '../lib/repository.ts';
	import { ChevronRight, ExternalLink } from './icons.ts';

	let {
		entry,
		locale,
		date,
		onshown
	}: { entry: ReleaseEntry; locale: string; date: string; onshown?: () => void } = $props();
	let notesAttempt = $state(0);
	const notes = $derived.by(() => {
		void notesAttempt;
		return fetchReleaseNotes(entry.version, locale);
	});
	$effect(() => {
		// The {:catch} block below shows a failed load; only an article still on screen once loaded counts as read.
		let shown = true;
		notes.then(
			() => shown && onshown?.(),
			() => undefined
		);
		return () => {
			shown = false;
		};
	});
	let changes = $state.raw<ReleaseChanges | null>();
	let fetchingChanges = false;
	async function loadChanges() {
		if (fetchingChanges || changes) return;
		fetchingChanges = true;
		changes = undefined;
		try {
			changes = await fetchReleaseChanges(entry.version);
		} catch {
			changes = null;
		} finally {
			fetchingChanges = false;
		}
	}
	const groupLabels = {
		new: 'releaseNews.new',
		improved: 'releaseNews.improved',
		fixed: 'releaseNews.fixed'
	} as const;
	const linkHint = $props.id();

	let bannerFailed = $state(false);
</script>

{#snippet loading()}<p class="bu-muted" role="status">{t('common.loading')}</p>{/snippet}
{#snippet retry(action: () => void)}
	<div>
		<p role="alert">{t('releaseNews.loadError')}</p>
		<button class="bu-action" data-variant="outline" type="button" onclick={action}>
			{t('common.tryAgain')}
		</button>
	</div>
{/snippet}

{#await notes}
	{@render loading()}
{:then loaded}
	<article>
		<header>
			<h3 lang={loaded.locale}>{loaded.notes.headline}</h3>
			<p class="bu-muted">
				<time datetime={entry.date}>{date}</time> · <bdi>v{entry.version}</bdi>
			</p>
		</header>
		<div class="banner">
			{#if bannerFailed}
				{@render retry(() => (bannerFailed = false))}
			{:else}
				<img
					src={releaseUrl(entry.banner ? `${entry.version}/banner.png` : 'banner.png')}
					alt=""
					width="320"
					height="160"
					onerror={() => (bannerFailed = true)}
				/>
			{/if}
		</div>
		<div class="release-copy" lang={loaded.locale}>
			<p>{loaded.notes.intro}</p>
			{#each loaded.notes.highlights as highlight, i (`${i}-${highlight.title}`)}
				<section class="highlight">
					<h4>{highlight.title}</h4>
					<p>{highlight.text}</p>
				</section>
			{/each}
		</div>
		{#if loaded.notes.fixes.length}
			<section>
				<h4>{t('releaseNews.fixed')}</h4>
				<ul lang={loaded.locale}>
					{#each loaded.notes.fixes as fix, i (`${i}-${fix.text}`)}
						<li>{fix.text}</li>
					{/each}
				</ul>
			</section>
		{/if}
		<details
			ontoggle={(event) => {
				if (event.currentTarget.open && changes === undefined) void loadChanges();
			}}
		>
			<summary class="bu-action release-toggle" data-variant="outline">
				<ChevronRight size={16} aria-hidden="true" />
				{changes
					? t('releaseNews.allChangesCount', {
							count: changes.total,
							n: formatNumber(changes.total)
						})
					: t('releaseNews.allChanges')}
			</summary>
			{#if changes}
				<span id={linkHint} hidden>{t('noticeLink.opensInANewTab')}</span>
				{#each changes.groups as group (group.kind)}
					<section class="change-group">
						<h4>{t(groupLabels[group.kind])}</h4>
						<ul lang="en">
							{#each group.items as item (item.sha)}
								<li>
									<a
										href={`${repository}/commit/${item.sha}`}
										target="_blank"
										rel="noopener noreferrer"
										aria-describedby={linkHint}
										>{item.text} <ExternalLink size={12} aria-hidden="true" /></a
									>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{:else if changes === null}
				{@render retry(loadChanges)}
			{:else}
				{@render loading()}
			{/if}
		</details>
	</article>
{:catch}
	{@render retry(() => notesAttempt++)}
{/await}

<style>
	article,
	.release-copy {
		display: grid;
		gap: 16px;
	}
	h3,
	h4,
	p,
	ul {
		margin: 0;
	}
	h3 {
		margin-block-end: 4px;
	}
	h4 {
		margin-block-end: 4px;
	}
	p,
	li {
		line-height: 1.5;
	}
	ul {
		padding-inline-start: 1.25em;
		list-style: disc;
	}
	/* Release banners are 320x160 pixel art (app/scripts/release/banner.ts): full width, hard pixel edges. */
	.banner img {
		display: block;
		inline-size: 100%;
		block-size: auto;
		image-rendering: pixelated;
	}
	.highlight h4,
	a {
		color: var(--bu-accent);
	}
	/* Collapsed sections are full-width touch targets: an outlined row with a chevron that turns when open. */
	:global(.release-toggle) {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		inline-size: 100%;
		min-block-size: 44px;
		text-align: start;
		list-style: none;
		cursor: pointer;
	}
	:global(.release-toggle::-webkit-details-marker) {
		display: none;
	}
	:global(.release-toggle > svg) {
		flex: none;
		transition: rotate 150ms ease;
	}
	:global(details[open] > .release-toggle > svg) {
		rotate: 90deg;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.release-toggle > svg) {
			transition: none;
		}
	}
	details[open] > :global(.release-toggle) {
		margin-block-end: 12px;
	}
	.change-group + .change-group {
		margin-block-start: 12px;
	}
	/* A long list reads as text: quiet links that underline on hover, with the new-tab icon kept on the line. */
	.change-group a {
		color: inherit;
		text-decoration: none;
	}
	.change-group a:hover,
	.change-group a:focus-visible {
		color: var(--bu-accent);
		text-decoration: underline;
	}
	.change-group a :global(svg) {
		display: inline;
		vertical-align: -1px;
		opacity: 0.6;
	}
	details button,
	.banner button {
		margin-block-start: 8px;
	}
</style>
