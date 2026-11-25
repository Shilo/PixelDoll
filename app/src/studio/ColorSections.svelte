<script lang="ts">
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	// Colors tab: the character, then each worn item, in one continuous list with sticky headers like Wardrobe.
	import { tick } from 'svelte';
	import { stickyFade } from '@shilo/bronze-ui/svelte';
	import Colors from './Colors.svelte';
	import GroupIcon from './GroupIcon.svelte';
	import ListSearch from './ListSearch.svelte';
	import { matchesSearch } from '../lib/search/match.ts';
	import { watchListSpacer } from './listSpacer.ts';
	import { itemMaterialNames } from './materialNames.ts';
	import { createSearchVisibility } from './searchVisibility.svelte.ts';
	import { ui, doc, store, randomizeColors, resetColors } from './state.svelte.ts';
	import { PersonStanding, RotateCcw, Shuffle } from './icons.ts';

	const m = $derived(store.project?.manifest);
	const sections = $derived(
		m
			? m.items
					.filter((it) => it.id === m.rig.baseItem || doc.items[it.slot] === it.id)
					.sort((a, b) => +(b.id === m.rig.baseItem) - +(a.id === m.rig.baseItem))
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
	// A query belongs to the character whose colors it filters.
	$effect(() => {
		void doc.id;
		query = '';
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
			const section = list?.querySelector<HTMLElement>(`[data-owner="${CSS.escape(id)}"]`);
			if (list && section)
				list.scrollTop += section.getBoundingClientRect().top - list.getBoundingClientRect().top;
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
	<div
		class="section-list equipment-scroll color-sections"
		bind:this={list}
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
				<div class="bu-section-head">
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
</div>
