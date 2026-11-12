<script lang="ts">
	// Colors tab: the character, then each worn item, in one continuous list with sticky headers like Wardrobe.
	import { tick } from 'svelte';
	import { stickyFade } from '@shilo/bronze-ui/svelte';
	import Colors from './Colors.svelte';
	import GroupIcon from './GroupIcon.svelte';
	import { groupOf } from './model.ts';
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
							name: base ? 'Character' : it.name,
							mats,
							free: mats.some((x) => !x.linkTo),
							changed: mats.some((x) => doc.variants[x.id] !== undefined)
						};
					})
					.filter((s) => s.mats.length)
			: []
	);
	let list = $state<HTMLElement>();
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

<div
	class="section-list equipment-scroll color-sections"
	bind:this={list}
	{@attach stickyFade({ inside: 10, outside: 10 })}
>
	{#each sections as s (s.it.id)}
		{@const lower = s.base ? 'character' : s.name.toLowerCase()}
		<section class="slot-section" data-owner={s.it.id} aria-labelledby="colors-{s.it.id}">
			<div class="bu-section-head">
				{#if s.base}<PersonStanding size={16} aria-hidden="true" />{:else}<GroupIcon
						group={groupOf(s.it.slot).id}
						size={16}
					/>{/if}
				<h3 class="bu-section-title" id="colors-{s.it.id}">{s.name}</h3>
				<button
					class="bu-action section-action"
					data-variant="quiet"
					aria-label="Random {lower} colors"
					title="Random {lower} colors"
					disabled={!s.free}
					onclick={() => randomizeColors([s.it.id], `Random ${lower} colors`)}
					><Shuffle size={16} /></button
				>
				<button
					class="bu-action section-action"
					data-variant="quiet"
					aria-label="Reset {lower} colors"
					title="Reset to original colors"
					disabled={!s.changed}
					onclick={() =>
						resetColors(
							s.mats.map((x) => x.id),
							`Reset ${lower} colors`
						)}><RotateCcw size={16} /></button
				>
			</div>
			<div class="section-body"><Colors only={s.it.id} /></div>
		</section>
	{:else}
		<p class="muted">Wear something to change its colors.</p>
	{/each}
</div>
