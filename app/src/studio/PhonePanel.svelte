<script lang="ts">
	// Shared customization content for the desktop rail and mobile sheet.
	import { popoverFocus } from './experience/focus.ts';
	import { crop, groupOf, GROUPS, HEALTH_LABEL, healthOf, mirroredHandsNote } from './model.ts';
	import { itemKey } from '../lib/equipment/copy.ts';
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
	// Requests this character is already making: an item to make new for it would only repeat one.
	const making = $derived(
		new Set(gens.filter((x) => x.draft.rigId === doc.id).map((x) => itemKey(x.input)))
	);
	const others = $derived(
		shared.items.filter(
			(x) => g.slots.includes(x.item.slot) && (x.fit !== 'remake' || !making.has(itemKey(x.item)))
		)
	);
	const free = $derived(others.filter((x) => x.fit !== 'remake'));
	const paid = $derived(others.filter((x) => x.fit === 'remake'));
	// A tapped item of another character that does not fit this body opens an offer under its tile.
	const unfit = $derived(paid.find((x) => sharedKey(x) === ui.selected));
	const FIT_NAME = { copy: 'free copy', refit: 'free fit to check', remake: 'make new' };
	const FIT_CAPTION = { copy: 'Free', refit: 'Free · check fit', remake: '' };
	const handNote = $derived(
		m && (g.id === 'Main hand' || g.id === 'Off hand') ? mirroredHandsNote(m.rig) : ''
	);
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
					{items.length + pending.length === 1 ? 'item' : 'items'}{others.length
						? ` · ${others.length} from others`
						: ''}</span
				><button
					class="bu-action btn icon plain"
					data-variant="quiet"
					aria-label="Random look"
					title="Random look"
					onclick={randomize}><Shuffle size={18} /></button
				>
			</div>
			{#if handNote}<p class="faint small hand-note">{handNote}</p>{/if}
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
					<span class="muted">No items yet</span>
				</div>
			{/if}
			{#if items.length || pending.length}
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
			<!-- Stays in place while an offer below is open, but yields the one primary action to it. -->
			<button
				class="bu-action equipment-create"
				data-variant={unfit ? 'outline' : 'primary'}
				onclick={() => openNewItem(g.id)}
				><Plus size={18} /><span>New {g.id.toLowerCase()} item</span></button
			>
			{#if shared.error}<p class="notice warn small" role="alert">{shared.error}</p>{/if}
			{#if others.length}
				<div class="shared-items">
					<div class="shared-head">
						<h3 class="shared-title small">From your other characters</h3>
						{#if !free.length}<p class="faint small">Make new for {m.name}</p>
						{:else if paid.length}<p class="faint small">Free when the body matches</p>{/if}
					</div>
					<div class="tiles shared-tiles" role="group" aria-label="From your other characters">
						{#each others as x, i (sharedKey(x))}
							{@const key = sharedKey(x)}
							{@const adding = shared.adding === key}
							{@const remake = x.fit === 'remake'}
							{#if remake && i === free.length && free.length}<p class="shared-divider faint small">
									Make new for {m.name}
								</p>{/if}
							<button
								data-variant="tile"
								class="bu-action tile"
								class:sel={ui.selected === key}
								aria-pressed={remake ? ui.selected === key : undefined}
								aria-label="{x.item.name}, from {x.sourceName}, {FIT_NAME[x.fit]}"
								aria-busy={adding}
								disabled={!!shared.adding}
								onclick={() => (ui.selected === key ? (ui.selected = '') : addShared(x))}
							>
								<span class="tile-art" aria-hidden="true"><SharedThumb entry={x} /></span><span
									class="tile-name">{x.item.name}</span
								><span class="tile-from faint small">from {x.sourceName}</span>
								{#if adding}<span class="tile-from faint small">Adding…</span
									>{:else if FIT_CAPTION[x.fit]}<span class="tile-from muted small"
										>{FIT_CAPTION[x.fit]}</span
									>{/if}
							</button>
							{#if unfit === x}
								{@const name = unfit.item.name}
								<div
									class="unfit"
									tabindex="-1"
									role="group"
									aria-label="Make {name} for {m.name}"
									{@attach (el) => el.focus()}
								>
									<p class="small" id="unfit-why">
										Drawn for {unfit.sourceName}’s body, so it doesn’t fit {m.name}.
									</p>
									<button
										class="bu-action btn primary"
										data-variant="primary"
										aria-describedby="unfit-why unfit-note"
										onclick={() =>
											withKey(() =>
												openNewItem(groupOf(unfit.item.slot).id, {
													slot: unfit.item.slot,
													prompt: unfit.item.prompt || name,
													name
												})
											)}>Make one for {m.name}</button
									>
									<p class="faint small" id="unfit-note">
										Drawn new from the same description, so it may look different. It starts with
										the standing pose; you add moves later, each priced first.
									</p>
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{/if}
			{#if shared.skipped}<p class="faint small">
					Some items from other characters couldn’t be read.
				</p>{/if}
		{/if}
	{:else if ui.tab === 'outfits'}
		<Outfits />
	{:else if ui.tab === 'colors'}
		<Colors />
	{:else}
		<Moves />
	{/if}
</div>
