<script lang="ts">
	// Shared customization content for the desktop rail and mobile sheet.
	import { popoverFocus } from './experience/focus.ts';
	import { crop, groupOf, GROUPS, HEALTH_LABEL, healthOf } from './model.ts';
	import {
		ui,
		doc,
		store,
		view,
		gens,
		wear,
		wearDraft,
		clearSlots,
		genOf,
		genProgress,
		openNewItem,
		randomize,
		isDemo,
		shared,
		sharedKey,
		addShared,
		withKey
	} from './state.svelte.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import Thumb from './Thumb.svelte';
	import Sprite from './Sprite.svelte';
	import GroupIcon from './GroupIcon.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import Colors from './Colors.svelte';
	import Moves from './Moves.svelte';
	import Lazy from './Lazy.svelte';
	import Outfits from './Outfits.svelte';
	import SharedThumb from './SharedThumb.svelte';
	import { CircleAlert, Ellipsis, Info, Plus, Shuffle, X, Check } from './icons.ts';

	const m = $derived(store.project?.manifest);
	let more = $state<HTMLElement>();
	const mainGroups = GROUPS.filter((g) => ['Head', 'Hair', 'Body'].includes(g.id));
	const extraGroups = GROUPS.filter((g) => !['Head', 'Hair', 'Body'].includes(g.id));
	const g = $derived(GROUPS.find((x) => x.id === ui.group) ?? GROUPS[0]);
	const items = $derived(m ? m.items.filter((i) => g.slots.includes(i.slot)) : []);
	const pending = $derived(
		gens.filter((x) => x.draft.rigId === doc.id && g.slots.includes(x.input.slot))
	);
	const sel = $derived(
		items.find((i) => i.id === ui.selected) ?? items.find((i) => doc.items[i.slot] === i.id)
	);
	// The selection area belongs to the browsed group: a draft selected in another group is not shown here.
	const gen = $derived.by(() => {
		const x = genOf(ui.selected);
		return x && g.slots.includes(x.input.slot) ? x : undefined;
	});
	const others = $derived(shared.items.filter((x) => g.slots.includes(x.item.slot)));
	// A tapped item of another character that does not fit this body takes the selection area.
	const unfit = $derived(others.find((x) => sharedKey(x) === ui.selected));
	const categoryName = $derived(g.id === 'Head' ? 'Headwear' : g.id);
	// T2: keep the selected slot chip in view (Body was half under the Random button on a 375 px phone)
	let chips = $state<HTMLElement>();
	$effect(() => {
		void ui.group;
		chips
			?.querySelector('[aria-selected="true"]')
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
</script>

<div class="panel">
	{#if ui.tab === 'wardrobe'}
		<div class="chip-row">
			<div class="slot-chips" role="tablist" aria-label="Slots" bind:this={chips}>
				{#each mainGroups as s (s.id)}
					{@const itemCount = m?.items.filter((i) => s.slots.includes(i.slot)).length ?? 0}
					{@const pendingCount = gens.filter(
						(x) => x.draft.rigId === doc.id && s.slots.includes(x.input.slot)
					).length}
					<button
						role="tab"
						class="bu-action slot-chip"
						data-variant="tab"
						aria-selected={ui.group === s.id}
						tabindex={ui.group === s.id ? 0 : -1}
						onclick={() => (ui.group = s.id)}
					>
						<GroupIcon group={s.id} size={18} /><span>{s.id}</span>
						{#if m}<span class="category-count small num"
								>{itemCount + pendingCount}<span class="sr">
									items{pendingCount ? ` (${pendingCount} pending)` : ''}</span
								></span
							>{/if}
					</button>
				{/each}
				<button
					class="slot-chip bu-action"
					data-variant="tab"
					aria-pressed={extraGroups.some((g) => g.id === ui.group)}
					popovertarget="more-equipment"><Ellipsis size={18} /><span>More</span></button
				>
				<div
					id="more-equipment"
					class="menu more-equipment bu-popover-anchor"
					data-placement="top-end"
					popover
					bind:this={more}
					ontoggle={popoverFocus}
				>
					<PopoverArrow />
					<div class="menu-surface bu-popover-surface bu-floating">
						<p class="menu-sec">Additional equipment</p>
						{#each extraGroups as group}<button
								class="row bu-action"
								data-variant="quiet"
								aria-pressed={ui.group === group.id}
								onclick={() => {
									ui.group = group.id;
									more?.hidePopover();
								}}><GroupIcon group={group.id} /><span>{group.id}</span></button
							>{/each}
					</div>
				</div>
			</div>
		</div>
		{#if m && view.project}
			<div class="equipment-heading">
				<h2>{categoryName}</h2>
				<span class="muted small"
					>{items.length + pending.length}
					{items.length + pending.length === 1 ? 'item' : 'items'}</span
				><button
					class="bu-action btn icon plain"
					data-variant="quiet"
					aria-label="Random look"
					title="Random look"
					onclick={randomize}><Shuffle size={18} /></button
				>
			</div>
			{#if items.length || pending.length}
				<div class="tiles" role="group" aria-label="{g.id} items">
					{#each items as it (it.id)}
						<button
							data-variant="tile"
							class="bu-action tile"
							class:sel={ui.selected === it.id}
							aria-pressed={doc.items[it.slot] === it.id && !doc.drafts[it.slot]}
							onclick={() => wear(it.id)}
						>
							<span class="tile-art" aria-hidden="true"
								><Thumb project={view.project} item={it} /></span
							><span class="tile-name">{it.name}</span>
							{#if doc.items[it.slot] === it.id && !doc.drafts[it.slot]}<span
									class="equipped-check"
									aria-hidden="true"><Check size={16} /></span
								>{/if}
						</button>
					{/each}
					{#each pending as x (x.draft.spec.id)}
						{@const p = genProgress(x, $queue.jobs)}
						{@const on = doc.drafts[x.draft.spec.slot] === x.draft.spec.id}
						{@const preview = store.results[x.draft.spec.id]?.preview}
						{@const previewItem = preview?.manifest.items.find((it) => it.id === x.draft.spec.id)}
						{@const firstFrame = store.results[x.draft.spec.id]?.thumbnail}
						{@const thumbnail = firstFrame ? crop(firstFrame) : null}
						<!-- a draft tile wears the draft like a saved item (display only, while it loads or awaits review) -->
						<button
							data-variant="tile"
							class="bu-action tile"
							class:sel={ui.selected === `gen:${x.draft.spec.id}`}
							aria-label="{x.input.name}, {p.label}"
							aria-pressed={on}
							onclick={() =>
								x.phase === 'failed'
									? (ui.selected = `gen:${x.draft.spec.id}`)
									: wearDraft(x.draft.spec.id)}
						>
							<span class="tile-art" aria-hidden="true">
								{#if thumbnail}<Sprite
										img={thumbnail}
										k={1}
										w={thumbnail.w}
										h={thumbnail.h}
										fitToBox
										label={x.input.name}
									/>
								{:else if preview && previewItem}<Thumb project={preview} item={previewItem} />
								{:else if x.phase === 'failed'}<CircleAlert size={24} />
								{:else if x.phase !== 'running'}<GroupIcon group={g.id} size={24} />{/if}
								{#if x.phase === 'running'}<span
										class="tile-progress"
										class:overlay={!!previewItem || !!thumbnail}
										><span class="ring" class:spin={!p.pct} style:--p={p.pct}></span></span
									>{/if}
							</span><span class="tile-name">{p.short}</span>
							{#if on}<span class="equipped-check" aria-hidden="true"><Check size={16} /></span
								>{/if}
						</button>
					{/each}
					<button
						data-variant="outline"
						class="bu-action equipment-none"
						aria-pressed={!items.some((i) => doc.items[i.slot] === i.id) &&
							!g.slots.some((s) => doc.drafts[s])}
						onclick={() => clearSlots(g.slots)}><X size={18} /><span>None</span></button
					>
				</div>
			{:else}
				<div class="category-empty" role="group" aria-label="{g.id} items">
					<span class="muted">No saved items</span>
				</div>
			{/if}
			{#if shared.error}<p class="notice warn small" role="alert">{shared.error}</p>{/if}
			{#if others.length}
				<div class="shared-items">
					<h3 class="shared-title small">From other characters</h3>
					<div class="tiles" role="group" aria-label="From other characters">
						{#each others as x (sharedKey(x))}
							<button
								data-variant="tile"
								class="bu-action tile"
								class:sel={ui.selected === sharedKey(x)}
								aria-label="{x.item.name}, from {x.sourceName}"
								aria-busy={shared.adding === sharedKey(x)}
								disabled={!!shared.adding}
								onclick={() => addShared(x)}
							>
								<span class="tile-art" aria-hidden="true"><SharedThumb entry={x} /></span><span
									class="tile-name">{x.item.name}</span
								><span class="tile-from faint small">from {x.sourceName}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
			{#if unfit}
				<div class="unfit" role="status">
					<p class="small">Made for {unfit.sourceName}. It doesn’t fit {m.name} yet.</p>
					<button
						class="bu-action btn primary"
						data-variant="primary"
						onclick={() =>
							withKey(() =>
								openNewItem(groupOf(unfit.item.slot).id, {
									slot: unfit.item.slot,
									prompt: unfit.item.prompt,
									name: unfit.item.name
								})
							)}>Make for {m.name}</button
					>
				</div>
			{:else if items.length || pending.length}
				{#if gen}
					<Lazy load={() => import('./GenCard.svelte')} sheet={false} g={gen} />
				{:else if sel}
					{@const h = healthOf(m, sel)}
					<div class="sel-row">
						<span class="sel-name">{sel.name}</span>
						{#if h !== 'demo' || isDemo()}<span class="badge {h}">{HEALTH_LABEL[h]}</span>{/if}
						<button
							class="bu-action btn icon plain"
							data-variant="quiet"
							aria-label="{sel.name} details"
							onclick={() => {
								ui.selected = sel.id;
								ui.sheet = 'item';
							}}><Info size={20} /></button
						>
					</div>
					<Colors only={sel.id} heading={false} />
				{/if}
			{/if}
			<button
				class="bu-action equipment-create"
				data-variant="primary"
				onclick={() => openNewItem(g.id)}
				><Plus size={18} /><span>New {g.id.toLowerCase()} item</span></button
			>
		{/if}
	{:else if ui.tab === 'outfits'}
		<Outfits />
	{:else if ui.tab === 'colors'}
		<Colors />
	{:else}
		<Moves />
	{/if}
</div>
