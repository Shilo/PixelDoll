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
	import { ExternalLink } from './icons.ts';

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
		// The {:catch} block below shows a failed load; only a shown article counts as read.
		notes.then(
			() => onshown?.(),
			() => undefined
		);
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
	let bannerRoom = $state(0);
	let naturalWidth = $state(0);
	const bannerWidth = $derived(
		naturalWidth
			? naturalWidth * Math.max(1, Math.min(4, Math.floor(bannerRoom / naturalWidth)))
			: undefined
	);
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
		<div bind:clientWidth={bannerRoom} class="banner">
			{#if bannerFailed}
				{@render retry(() => (bannerFailed = false))}
			{:else}
				<img
					src={releaseUrl(`${entry.version}/banner.png`)}
					alt=""
					bind:naturalWidth
					width={bannerWidth}
					onerror={() => (bannerFailed = true)}
				/>
			{/if}
		</div>
		<div class="release-copy" lang={loaded.locale}>
			<p>{loaded.notes.intro}</p>
			{#if locale === 'en' && loaded.notes.joke}<p>{loaded.notes.joke}</p>{/if}
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
			<summary>
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
	}
	.banner img {
		display: block;
		max-inline-size: 100%;
		block-size: auto;
		image-rendering: pixelated;
	}
	.highlight h4,
	a {
		color: var(--bu-accent);
	}
	details {
		border-block-start: 1px solid var(--bu-line);
	}
	summary {
		padding-block: 12px;
		cursor: pointer;
	}
	.change-group + .change-group {
		margin-block-start: 12px;
	}
	details button,
	.banner button {
		margin-block-start: 8px;
	}
</style>
