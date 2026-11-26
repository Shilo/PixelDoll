<script lang="ts">
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	// Colors tab: the character, then each worn item, in one continuous list with sticky headers like Wardrobe, and a rail
	// of item icons that follows and drives it.
	import { onDestroy, tick } from 'svelte';
	import { edgeFade, stickyFade } from '@shilo/bronze-ui/svelte';
	import Colors from './Colors.svelte';
	import GroupIcon from './GroupIcon.svelte';
	import ListSearch from './ListSearch.svelte';
	import { matchesSearch } from '../lib/search/match.ts';
	import { watchListSpacer } from './listSpacer.ts';
	import { itemMaterialNames } from './materialNames.ts';
	import { createSearchVisibility } from './searchVisibility.svelte.ts';
	import { scrollToSection, sectionInView } from './sectionScroll.ts';
	import { categories } from './slots.ts';
	import { ui, doc, store, randomizeColors, resetColors } from './state.svelte.ts';
	import { PersonStanding, RotateCcw, Shuffle } from './icons.ts';

	const m = $derived(store.project?.manifest);
	// The same order as Wardrobe's categories, so an item is in the same place in both tabs.
	const order = $derived(new Map(m ? categories(m).map((c, i) => [c.key, i]) : []));
	const sections = $derived(
		m
			? m.items
					.filter((it) => it.id === m.rig.baseItem || doc.items[it.slot] === it.id)
					.sort(
						(a, b) =>
							+(b.id === m.rig.baseItem) - +(a.id === m.rig.baseItem) ||
							(order.get(a.slot) ?? Number.MAX_SAFE_INTEGER) -
								(order.get(b.slot) ?? Number.MAX_SAFE_INTEGER)
					)
					.map((it) => {
						const mats = m.materials.filter((x) => x.owner === it.id);
						const base = it.id === m.rig.baseItem;
						return {
							it,
							base,
							name: base ? t('common.character') : it.name,
							mats,
							names: itemMaterialNames(it, mats, m),
							free: mats.some((x) => !x.linkTo),
							changed: mats.some((x) => doc.variants[x.id] !== undefined)
						};
					})
					.filter((s) => s.mats.length)
			: []
	);
	let list = $state<HTMLElement>();
	let rail = $state<HTMLElement>();
	// Room under the last section so Recolor can still bring it to the top, as in Wardrobe.
	let spacer = $state(0);
	let query = $state('');
	// A matching section keeps all of its ramps: "shirt" should reveal that item's full color controls, not pick ramps.
	const matched = $derived(
		query.trim() ? sections.filter((s) => matchesSearch([s.name, ...s.names], query)) : sections
	);
	const search = createSearchVisibility({
		element: () => list,
		total: () => sections.length,
		query: () => query,
		reserve: () => spacer
	});
	// The section in view (or just chosen), which the rail highlights and focuses.
	let active = $state('');
	let suppressSpy = false,
		spyFrame = 0;
	const scrolled = () => (spyFrame ||= requestAnimationFrame(spy));
	function spy() {
		spyFrame = 0;
		if (!list || suppressSpy) return;
		const current = sectionInView(
			list,
			list.querySelectorAll<HTMLElement>('[data-owner]'),
			(section) => section.dataset.owner,
			matched[0]?.it.id ?? active
		);
		if (current !== active) active = current;
	}
	onDestroy(() => cancelAnimationFrame(spyFrame));
	/** Jump the list to one item, as the rail does; the spy stays off until a smooth scroll ends so passing sections never
	 *  flicker the highlight. */
	async function show(id: string, instant = false) {
		const section = list?.querySelector<HTMLElement>(`[data-owner="${CSS.escape(id)}"]`);
		if (!list || !section) return;
		active = id;
		if (instant) {
			void scrollToSection(list, section, { first: id === matched[0]?.it.id, instant: true });
			return;
		}
		suppressSpy = true;
		try {
			await scrollToSection(list, section);
		} finally {
			suppressSpy = false;
		}
	}
	// A query belongs to the character whose colors it filters.
	$effect(() => {
		void doc.id;
		query = '';
	});
	// A rail always highlights one of the sections it lists; a search that hides it moves to the first still shown.
	$effect(() => {
		const ids = matched.map((s) => s.it.id);
		if (!ids.includes(active)) active = ids[0] ?? '';
	});
	// Keep the highlighted tab visible in a rail that scrolls.
	$effect(() => {
		const id = active;
		rail
			?.querySelector(`[data-color-rail="${CSS.escape(id)}"]`)
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
	$effect(() => {
		void matched;
		const last = list?.querySelector<HTMLElement>('section:last-of-type');
		if (list && last) return watchListSpacer(list, last, (h) => (spacer = h));
	});
	$effect(() => {
		// Recolor in an item's details opens this tab on that item's section, once.
		const id = ui.colorsFocus;
		if (!id || !list) return;
		void tick().then(() => {
			if (list?.querySelector(`[data-owner="${CSS.escape(id)}"]`)) void show(id, true);
			ui.colorsFocus = '';
		});
	});
</script>

<div class="panel-stack">
	<ListSearch
		bind:value={query}
		label={t('search.colors')}
		placeholder={t('experience.placeholderSearch')}
		clearLabel={t('search.clear')}
		summary={t('search.results', { count: matched.length, total: sections.length })}
		shown={search.visible}
	/>
	<div class="color-panes">
		<div
			class="section-list equipment-scroll color-sections"
			bind:this={list}
			onscroll={scrolled}
			{@attach stickyFade({ inside: 10, outside: 10 })}
		>
			{#each matched as s (s.it.id)}
				{@const lower = s.name}
				{@const randomColorsMessage = s.base
					? message('colorSections.randomCharacterColors')
					: message('colorSections.randomLowerColors', { lower })}
				{@const resetColorsMessage = s.base
					? message('colorSections.resetCharacterColors')
					: message('colorSections.resetLowerColors', { lower })}
				<section class="slot-section" data-owner={s.it.id} aria-labelledby="colors-{s.it.id}">
					<div class="bu-section-head" data-current={active === s.it.id || undefined}>
						{#if s.base}<PersonStanding size={16} aria-hidden="true" />{:else}<GroupIcon
								group={s.it.slot}
								size={16}
							/>{/if}
						<h3 class="bu-section-title" id="colors-{s.it.id}">{s.name}</h3>
						<button
							class="bu-action section-action"
							data-variant="quiet"
							aria-label={t(randomColorsMessage.key, randomColorsMessage.vars)}
							title={t(randomColorsMessage.key, randomColorsMessage.vars)}
							disabled={!s.free}
							onclick={() => randomizeColors([s.it.id], randomColorsMessage)}
							><Shuffle size={16} /></button
						>
						<button
							class="bu-action section-action"
							data-variant="quiet"
							aria-label={t(resetColorsMessage.key, resetColorsMessage.vars)}
							title={t('colorSections.titleResetToOriginalColors')}
							disabled={!s.changed}
							onclick={() =>
								resetColors(
									s.mats.map((x) => x.id),
									resetColorsMessage
								)}><RotateCcw size={16} /></button
						>
					</div>
					<div class="section-body"><Colors only={s.it.id} /></div>
				</section>
			{/each}
			{#if !matched.length}
				{#if query.trim()}
					<p class="muted">{t('colors.noMatchingColors')}</p>
				{:else}
					<p class="muted">{t('colorSections.wearSomethingToChangeItsColors')}</p>
				{/if}
			{/if}
			{#if matched.length}<div
					class="list-spacer"
					style:height="{spacer}px"
					aria-hidden="true"
				></div>{/if}
		</div>
		{#if matched.length}
			<!-- Section navigation over the list, like Wardrobe's rail; arrows, Home and End are Studio.svelte's [data-arrows]. -->
			<div class="slot-rail-column">
				<nav
					class="slot-rail bu-scroll-hidden bu-edge-fade"
					aria-label={t('colors.categories')}
					bind:this={rail}
					{@attach edgeFade({ axis: 'y', size: 24 })}
				>
					<ul class="slot-rail-list" data-arrows>
						{#each matched as s (s.it.id)}
							<li>
								<button
									class="bu-action slot-tab"
									data-variant="rail"
									data-color-rail={s.it.id}
									aria-current={active === s.it.id ? 'true' : undefined}
									aria-label={s.name}
									tabindex={active === s.it.id ? 0 : -1}
									onclick={() => void show(s.it.id)}
									>{#if s.base}<PersonStanding size={24} aria-hidden="true" />{:else}<GroupIcon
											group={s.it.slot}
											size={24}
										/>{/if}<span class="bu-rail-label">{s.name}</span></button
								>
							</li>
						{/each}
					</ul>
				</nav>
			</div>
		{/if}
	</div>
</div>
