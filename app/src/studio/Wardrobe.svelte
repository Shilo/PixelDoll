<script lang="ts" module>
	// Survives tab switches (the list unmounts) so returning to Wardrobe keeps the reader's place, for the same character
	// and only while no other view has picked a different category meanwhile.
	let memory: { id: string; open: number; group: string; scroll: number } | null = null;
</script>

<script lang="ts">
	import { contextMenu } from '../lib/input/contextMenu.ts';
	// One continuous list of every equipment category with sticky headers, and a slot rail that follows and drives it.
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { equipped, hiddenSlots, OTHER_HAND, twoHanded } from '../lib/compose/compose.ts';
	import { edgeFade, scrollToTop, stickyFade } from '@shilo/bronze-ui/svelte';
	import {
		crop,
		groupOf,
		groupLabel,
		GROUPS,
		HEALTH_LABEL,
		healthOf,
		missingFramesNote
	} from './model.ts';
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
		randomizeGroup,
		groupRandomChoices,
		shared,
		sharedKey,
		addShared,
		copyDemoAndAdd,
		isDemo,
		removeItem,
		withKey
	} from './state.svelte.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import { app } from '../lib/app.svelte.ts';
	import { generationStatus } from './generationStatus.ts';
	import { openGenerationReview } from './state.svelte.ts';
	import { watchListSpacer } from './listSpacer.ts';
	import Thumb from './Thumb.svelte';
	import Sprite from './Sprite.svelte';
	import GroupIcon from './GroupIcon.svelte';
	import SharedThumb from './SharedThumb.svelte';
	import ItemMenu from './ItemMenu.svelte';
	import {
		Ban,
		Check,
		CircleAlert,
		EllipsisVertical,
		EyeOff,
		Plus,
		Shuffle,
		TriangleAlert
	} from './icons.ts';

	const m = $derived(store.project?.manifest);
	let list = $state<HTMLElement>();
	let rail = $state<HTMLElement>();
	let spacer = $state(0);
	// The group the list itself last reported; any other change to ui.group came from elsewhere and scrolls to it.
	// Mount decides the first position (restore or show), so neither effect below acts on the initial values.
	let reported = untrack(() => ui.group);
	let reportedOpen = untrack(() => ui.wardrobeOpenRevision);
	let suppressSpy = false,
		spyFrame = 0;
	// The tile last brought into view, so a selection is revealed once (when it changes or its tile first appears).
	let revealed = untrack(() => ({ open: ui.wardrobeOpenRevision, key: ui.selected }));
	let menuFor = $state(''),
		menuOpen = $state(false);
	const seen = new SvelteSet<string>();
	const hidden = $derived(m ? hiddenSlots(m, equipped(m, doc.items)) : new Set<string>());
	/** Status words for a saved item: warnings (needs a look, made for another body, missing frames) and whether another
	 * worn item hides it. */
	function statusOf(it: NonNullable<typeof m>['items'][number]) {
		const h = m ? healthOf(m, it) : 'demo';
		return {
			look: h === 'look' || h === 'stale' ? HEALTH_LABEL[h] : '',
			missing: m ? missingFramesNote(m, it) : '',
			hidden: doc.items[it.slot] === it.id && hidden.has(it.slot)
		};
	}
	/** Stands for the Empty tile, which has no data-tile key, when picking where focus lands after a removal. */
	const EMPTY = 'empty';
	/** Remove an item for good, then focus the next tile in its category, else the previous one (the Empty tile at
	 * least), else the category's heading: never the page, and never the paid New item button. */
	async function remove(id: string) {
		const tile = list?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"]`);
		const group = tile?.closest<HTMLElement>('[data-group]')?.dataset.group;
		const tiles = [
			...(tile?.closest('.slot-tiles')?.querySelectorAll<HTMLElement>('.bu-tile') ?? [])
		];
		const at = tiles.indexOf(tile!),
			next = tiles[at + 1]?.dataset.tile,
			previous = at > 0 ? (tiles[at - 1].dataset.tile ?? EMPTY) : undefined;
		await removeItem(id);
		await tick();
		requestAnimationFrame(() => {
			const section = group
				? list?.querySelector<HTMLElement>(`[data-group="${CSS.escape(group)}"]`)
				: null;
			const find = (key?: string) =>
				key === EMPTY
					? section?.querySelector<HTMLElement>('.bu-tile[data-variant="empty"]')
					: key && list?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(key)}"]`);
			const heading = section?.querySelector<HTMLElement>('.bu-section-title');
			// The heading takes focus only from script, so it never joins the Tab order.
			heading?.setAttribute('tabindex', '-1');
			(find(next) || find(previous) || heading)?.focus();
		});
	}
	const menuItem = $derived(m?.items.find((i) => i.id === menuFor));
	const menuGeneration = $derived(genOf(menuFor));
	$effect(() => {
		if (menuOpen && menuFor.startsWith('gen:') && !menuGeneration)
			document.getElementById('item-menu')?.hidePopover();
	});
	let now = $state(Date.now());
	onMount(() => {
		const timer = window.setInterval(() => (now = Date.now()), 15_000);
		return () => window.clearInterval(timer);
	});
	function openMenu(wrap: HTMLElement) {
		const more = wrap.querySelector<HTMLButtonElement>('.tile-more');
		if (!more) return;
		document.getElementById('item-menu')?.hidePopover();
		// A click runs the same path as the ⋮ itself, so the popover anchors to it and focus returns there.
		more.focus({ preventScroll: true });
		more.click();
	}

	const making = $derived(
		new Set(gens.filter((x) => x.draft.rigId === doc.id).map((x) => itemKey(x.input)))
	);
	const sections = $derived(
		GROUPS.map((g) => {
			const items = m ? m.items.filter((i) => g.slots.includes(i.slot)) : [];
			const pending = gens.filter(
				(x) => x.draft.rigId === doc.id && g.slots.includes(x.input.slot)
			);
			const others = shared.items.filter(
				(x) => g.slots.includes(x.item.slot) && (x.fit !== 'remake' || !making.has(itemKey(x.item)))
			);
			const free = others.filter((x) => x.fit !== 'remake');
			return {
				g,
				label: groupLabel(g.id),
				items,
				pending,
				others,
				free,
				paid: others.filter((x) => x.fit === 'remake'),
				worn: items.some((i) => doc.items[i.slot] === i.id) || g.slots.some((s) => !!doc.drafts[s]),
				choices: m ? groupRandomChoices(g.id).length : 0,
				// a two-handed item worn in the other hand holds this one too
				holder: m
					? g.slots
							.filter((slot) => OTHER_HAND[slot])
							.map((slot) =>
								m.items.find((i) => i.slot === OTHER_HAND[slot] && view.items[i.slot] === i.id)
							)
							.find((i) => !!i && twoHanded(m, i))
					: undefined
			};
		})
	);
	const FIT_NAME = {
		copy: 'free copy',
		refit: 'free fit to check',
		unfitted: 'free, not fitted to this body',
		remake: 'make new'
	};
	const FIT_CAPTION = {
		copy: 'Free',
		refit: 'Free · check fit',
		unfitted: 'Free · not fitted',
		remake: ''
	};
	const sectionId = (id: string) => `wardrobe-${id.replace(/\s+/g, '-').toLowerCase()}`;

	function remember() {
		if (list)
			memory = {
				id: doc.id,
				open: ui.wardrobeOpenRevision,
				group: ui.group,
				scroll: list.scrollTop
			};
	}
	function spy() {
		spyFrame = 0;
		if (!list || suppressSpy) return;
		// A category is current once its section reaches the bottom of the sticky header.
		const head = list.querySelector<HTMLElement>('.bu-section-head');
		const top = list.getBoundingClientRect().top + (head?.offsetHeight ?? 0);
		let current = GROUPS[0].id;
		for (const el of list.querySelectorAll<HTMLElement>('[data-group]'))
			if (el.getBoundingClientRect().top <= top) current = el.dataset.group!;
		if (current !== ui.group) {
			reported = current;
			ui.group = current;
		}
		remember();
	}
	const scrolled = () => (spyFrame ||= requestAnimationFrame(spy));
	async function show(id: string, instant = false) {
		const section = list?.querySelector<HTMLElement>(`[data-group="${CSS.escape(id)}"]`);
		if (!list || !section) return;
		reported = id;
		ui.group = id;
		if (instant) {
			list.scrollTop =
				id === GROUPS[0].id
					? 0
					: list.scrollTop +
						section.getBoundingClientRect().top -
						list.getBoundingClientRect().top +
						1;
			remember();
			return;
		}
		// The spy stays off until the smooth scroll really ends, so passing categories never re-select the rail.
		suppressSpy = true;
		try {
			await scrollToTop(list, section, 1);
		} finally {
			suppressSpy = false;
			remember();
		}
	}
	/** Bring a tile fully into view below its category's sticky header, focus ring included. */
	function reveal(key: string) {
		const tile = list?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(key)}"]`);
		if (!list || !tile) return false;
		const head = tile.closest('[data-group]')?.querySelector<HTMLElement>('.bu-section-head');
		const box = list.getBoundingClientRect(),
			rect = tile.getBoundingClientRect(),
			ring = 6,
			top = box.top + (head?.offsetHeight ?? 0) + ring,
			bottom = box.bottom - ring;
		const delta =
			rect.top < top
				? rect.top - top
				: rect.bottom > bottom
					? Math.min(rect.bottom - bottom, rect.top - top)
					: 0;
		if (delta) {
			list.scrollTop += delta;
			remember();
		}
		return true;
	}
	$effect(() => {
		// Another view (a missing-frames link, a new item, a review) picked a category: bring it to the top.
		const id = ui.group;
		const open = ui.wardrobeOpenRevision;
		if (id !== reported || open !== reportedOpen) {
			reportedOpen = open;
			void tick().then(() => show(id, true));
		}
	});
	$effect(() => {
		// A selection made anywhere (a tile, Random, a new draft, a review) shows its whole tile once it exists.
		const key = ui.selected;
		const open = ui.wardrobeOpenRevision;
		void sections;
		if (!key) {
			revealed = { open, key };
			return;
		}
		if (untrack(() => revealed.open === open && revealed.key === key)) return;
		void tick().then(() => {
			if (ui.wardrobeOpenRevision === open && ui.selected === key && reveal(key))
				revealed = { open, key };
		});
	});
	$effect(() => {
		// Keep the current slot visible in a rail that scrolls.
		const id = ui.group;
		rail
			?.querySelector(`[data-rail="${CSS.escape(id)}"]`)
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
	onMount(() => {
		// Room under the last category so tapping its slot can still bring it to the top: sized before the first scroll.
		const last = list?.querySelector<HTMLElement>('[data-group]:last-of-type');
		const unwatch = list && last ? watchListSpacer(list, last, (h) => (spacer = h)) : undefined;
		const group = ui.group;
		const open = ui.wardrobeOpenRevision;
		void tick().then(() => {
			if (!list) return;
			if (memory?.id === doc.id && memory.open === open && memory.group === group)
				list.scrollTop = memory.scroll;
			else {
				void show(group, true);
				// A selection in the category just shown (a reviewed item) is revealed in it; one elsewhere stays put.
				const tile = list.querySelector(`[data-tile="${CSS.escape(ui.selected)}"]`);
				if (tile?.closest(`[data-group="${CSS.escape(group)}"]`) && reveal(ui.selected))
					revealed = { open, key: ui.selected };
			}
		});
		return () => {
			unwatch?.();
			cancelAnimationFrame(spyFrame);
		};
	});
	// Item art renders once a tile comes near the list's viewport; the list can hold many categories.
	const lazyArt = (key: string) => (node: HTMLElement) => {
		// Untracked: another tile becoming visible must not rebuild every tile's observer.
		if (untrack(() => seen.has(key))) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					seen.add(key);
					io.disconnect();
				}
			},
			{ root: node.closest('.section-list'), rootMargin: '100% 0px' }
		);
		io.observe(node);
		return () => io.disconnect();
	};
</script>

{#if m && view.project}
	<div class="wardrobe">
		<div
			class="section-list equipment-scroll"
			id="wardrobe-list"
			bind:this={list}
			onscroll={scrolled}
			{@attach stickyFade({ inside: 10, outside: 10 })}
		>
			{#each sections as s (s.g.id)}
				{@const g = s.g}
				{@const lower = s.label.toLowerCase()}
				{@const count = s.items.length + s.pending.length}
				{@const unfit = s.paid.find((x) => sharedKey(x) === ui.selected)}
				{@const demoPick = isDemo() ? s.free.find((x) => sharedKey(x) === ui.selected) : undefined}
				<section
					class="slot-section"
					data-group={g.id}
					id={sectionId(g.id)}
					aria-labelledby="{sectionId(g.id)}-title"
				>
					<div class="bu-section-head" data-current={ui.group === g.id || undefined}>
						<GroupIcon group={g.id} size={16} />
						<h3 class="bu-section-title" id="{sectionId(g.id)}-title">{s.label}</h3>
						<span class="bu-section-count"
							>{count}<span class="sr">{` ${count === 1 ? 'item' : 'items'}`}</span></span
						>
						<button
							class="bu-action section-action"
							data-variant="quiet"
							aria-label="Random {lower} item"
							title="Random {lower} item"
							disabled={!s.choices}
							onclick={() => randomizeGroup(g.id)}><Shuffle size={16} /></button
						>
						<button
							class="bu-action section-action section-add"
							data-variant="quiet"
							aria-label="New {lower} item"
							title="New {lower} item"
							onclick={() => openNewItem(g.id)}><Plus size={18} /></button
						>
					</div>
					<div class="section-body">
						{#if s.holder}<p class="section-note faint small">
								Held by {s.holder.name} (two-handed).
							</p>{/if}
						<div class="slot-tiles" role="group" aria-label="{s.label} items">
							<button
								class="bu-tile item-tile"
								data-variant="empty"
								aria-pressed={!s.worn}
								aria-label="Empty {lower}"
								onclick={() => clearSlots(g.slots)}
								><span class="bu-tile-art tile-art" aria-hidden="true"><Ban size={26} /></span><span
									class="bu-tile-label">Empty</span
								>{#if !s.worn}<span class="bu-tile-check" aria-hidden="true"><Check /></span
									>{/if}</button
							>
							{#each s.items as it (it.id)}
								{@const on = doc.items[it.slot] === it.id && !doc.drafts[it.slot]}
								{@const st = statusOf(it)}
								<!-- The ⋮ is a sibling of the tile, never nested in it; right-click and Shift+F10 open the same menu. -->
								<div class="tile-wrap" role="none" {@attach contextMenu(openMenu)}>
									<button
										class="bu-tile item-tile"
										data-selected={ui.selected === it.id || undefined}
										data-tile={it.id}
										data-dim={st.hidden || undefined}
										aria-pressed={on}
										aria-label={[
											it.name,
											st.look.toLowerCase(),
											st.missing.toLowerCase(),
											st.hidden ? 'hidden by another item' : ''
										]
											.filter(Boolean)
											.join(', ')}
										onclick={() => wear(it.id)}
									>
										<span class="bu-tile-art tile-art" aria-hidden="true" {@attach lazyArt(it.id)}
											>{#if seen.has(it.id)}<Thumb
													project={view.project}
													item={it}
													box={64}
												/>{/if}</span
										><span class="bu-tile-label tile-name">{it.name}</span>
										{#if on}<span class="bu-tile-check" aria-hidden="true"><Check /></span
											>{:else if st.look || st.missing}<span
												class="bu-tile-status tile-status"
												data-tone="warning"
												title={[st.look, st.missing].filter(Boolean).join(' · ')}
												aria-hidden="true"><TriangleAlert size={14} /></span
											>{:else if st.hidden}<span
												class="bu-tile-status tile-status"
												data-tone="hidden"
												title="Hidden by another item"
												aria-hidden="true"><EyeOff size={14} /></span
											>{/if}
									</button>
									<button
										class="bu-tile-more tile-more"
										popovertarget="item-menu"
										aria-haspopup="menu"
										aria-expanded={menuOpen && menuFor === it.id}
										aria-label="More options for {it.name}"
										title="Options"
										onclick={() => {
											// The same ⋮ toggles the menu closed; another tile's ⋮ reopens it for that tile.
											if (menuOpen && menuFor !== it.id)
												document.getElementById('item-menu')?.hidePopover();
											menuFor = it.id;
										}}><EllipsisVertical size={18} /></button
									>
								</div>
							{/each}
							{#each s.pending as x (x.draft.spec.id)}
								{@const p = genProgress(x, $queue.jobs)}
								{@const info = generationStatus(x, $queue.jobs, now, !!app.key, $queue.paused)}
								{@const on = doc.drafts[x.draft.spec.slot] === x.draft.spec.id}
								{@const preview = store.results[x.draft.spec.id]?.preview}
								{@const previewItem = preview?.manifest.items.find(
									(it) => it.id === x.draft.spec.id
								)}
								{@const firstFrame = store.results[x.draft.spec.id]?.thumbnail}
								{@const thumbnail = firstFrame ? crop(firstFrame) : null}
								<!-- a draft tile wears the draft like a saved item (display only, while it loads or awaits review) -->
								<div
									class="tile-wrap"
									role="none"
									oncontextmenu={(event) => {
										event.preventDefault();
										openMenu(event.currentTarget);
									}}
								>
									<button
										class="bu-tile item-tile"
										data-selected={ui.selected === `gen:${x.draft.spec.id}` || undefined}
										data-tile="gen:{x.draft.spec.id}"
										aria-label="{x.input.name}, {x.phase === 'running'
											? p.pct + '%, '
											: ''}{info.text}{x.phase !== 'running' && on ? ', Wearing' : ''}"
										aria-pressed={x.phase === 'running' ? on : undefined}
										aria-haspopup={x.phase !== 'running' ? 'dialog' : undefined}
										onclick={() =>
											x.phase !== 'running'
												? void openGenerationReview(x.draft.spec.id)
												: wearDraft(x.draft.spec.id)}
										onkeydown={(event) => {
											if (event.key === 'F10' && event.shiftKey) {
												event.preventDefault();
												openMenu(event.currentTarget.parentElement!);
											}
										}}
									>
										<span class="bu-tile-art tile-art" aria-hidden="true">
											<span class="generation-artwork" class:generating={x.phase === 'running'}>
												{#if thumbnail}<Sprite
														img={thumbnail}
														k={1}
														w={thumbnail.w}
														h={thumbnail.h}
														fitToBox
														label={x.input.name}
													/>
												{:else if preview && previewItem}<Thumb
														project={preview}
														item={previewItem}
														box={x.phase === 'running' ? 12 : 40}
													/>
												{:else if x.phase === 'failed'}<CircleAlert size={24} />
												{:else if x.phase !== 'running'}<GroupIcon group={g.id} size={24} />{/if}
											</span>
											{#if x.phase === 'running'}<span
													class="ring generation-ring"
													style:--p={p.pct}
												></span>{/if}
										</span>
										{#if x.phase === 'running'}<span
												class="generation-percent bu-muted small num"
												aria-hidden="true">{p.pct}%</span
											>{/if}
										<span class="generation-caption">
											<span class="generation-time bu-muted small num" aria-hidden="true"
												>{info.text}</span
											>
											<span class="bu-tile-label tile-name">{x.input.name}</span>
										</span>
										{#if info.attention}<span
												class="bu-tile-status tile-status"
												data-tone="warning"
												title={info.text}
												aria-hidden="true"><TriangleAlert size={14} /></span
											>{:else if on}<span class="bu-tile-check" aria-hidden="true"><Check /></span
											>{/if}
									</button>
									{#if x.phase === 'running'}<span
											class="sr"
											role="progressbar"
											aria-label="{x.input.name} progress"
											aria-valuenow={p.pct}
											aria-valuemin={0}
											aria-valuemax={100}
											aria-valuetext="{p.pct}%, {info.text}"
										></span>{/if}
									<button
										class="bu-tile-more tile-more"
										popovertarget="item-menu"
										aria-haspopup="menu"
										aria-expanded={menuOpen && menuFor === 'gen:' + x.draft.spec.id}
										title="Options"
										aria-label="More options for {x.input.name}"
										onclick={() => {
											if (menuOpen && menuFor !== 'gen:' + x.draft.spec.id)
												document.getElementById('item-menu')?.hidePopover();
											menuFor = 'gen:' + x.draft.spec.id;
										}}><EllipsisVertical size={18} /></button
									>
								</div>
							{/each}
							{#if !count}
								<button
									class="bu-tile item-tile"
									data-variant="add"
									aria-label="New {lower} item"
									onclick={() => openNewItem(g.id)}
									><span class="bu-tile-art tile-art" aria-hidden="true"><Plus size={26} /></span
									><span class="bu-tile-label">New</span></button
								>
							{/if}
						</div>
						{#if s.others.length}
							<div class="shared-items">
								<div class="shared-head">
									<h4 class="shared-title small">From your other characters</h4>
									{#if !s.free.length}<p class="faint small">Make new for {m.name}</p>
									{:else if s.paid.length}<p class="faint small">
											Free on the same frame size and view
										</p>{/if}
								</div>
								<div
									class="slot-tiles"
									role="group"
									aria-label="{s.label} from your other characters"
								>
									{#each s.others as x, i (sharedKey(x))}
										{@const key = sharedKey(x)}
										{@const adding = shared.adding === key}
										{@const remake = x.fit === 'remake'}
										{#if remake && i === s.free.length && s.free.length}<p
												class="shared-divider faint small"
											>
												Make new for {m.name}
											</p>{/if}
										<button
											class="bu-tile item-tile shared-tile"
											data-selected={ui.selected === key || undefined}
											data-tile={key}
											aria-pressed={remake || isDemo() ? ui.selected === key : undefined}
											aria-label="{x.item.name}, from {x.sourceName}, {FIT_NAME[x.fit]}"
											aria-busy={adding}
											disabled={!!shared.adding}
											onclick={() => (ui.selected === key ? (ui.selected = '') : addShared(x))}
										>
											<span class="bu-tile-art tile-art" aria-hidden="true" {@attach lazyArt(key)}
												>{#if seen.has(key)}<SharedThumb entry={x} />{/if}</span
											><span class="bu-tile-label tile-name">{x.item.name}</span><span
												class="tile-from faint small">from {x.sourceName}</span
											>
											{#if adding}<span class="tile-from faint small">Adding…</span
												>{:else if FIT_CAPTION[x.fit]}<span class="tile-from muted small"
													>{FIT_CAPTION[x.fit]}</span
												>{/if}
										</button>
										{#if demoPick === x}
											{@const name = demoPick.item.name}
											<div
												class="unfit"
												tabindex="-1"
												role="group"
												aria-label="Copy the demo to wear {name}"
												{@attach (el) => el.focus()}
											>
												<p class="small" id="demo-pick-why">
													The demo can’t change. Copy it to wear {name}.{#if demoPick.fit === 'unfitted'}{' '}
														It was drawn for {demoPick.sourceName}’s body, so it may not line up.{/if}
												</p>
												<button
													class="bu-action btn primary"
													data-variant="primary"
													aria-describedby="demo-pick-why demo-pick-note"
													aria-busy={shared.adding === sharedKey(demoPick)}
													disabled={!!shared.adding}
													onclick={() => copyDemoAndAdd(demoPick)}
													>Copy demo and wear <span class="cost">Free</span></button
												>
												<p class="faint small" id="demo-pick-note">
													Saves an editable copy of the demo on this device, or opens the one you
													made, and wears
													{name} there. Nothing is generated.
												</p>
											</div>
										{/if}
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
													Drawn new from the same description, so it may look different. It starts
													with the standing pose; you add moves later, each priced first.
												</p>
											</div>
										{/if}
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</section>
			{/each}
			{#if shared.error}<p class="notice warn small" role="alert">{shared.error}</p>{/if}
			{#if shared.skipped}<p class="faint small">
					Some items from other characters couldn’t be read.
				</p>{/if}
			<div class="list-spacer" style:height="{spacer}px" aria-hidden="true"></div>
		</div>
		<!-- Always mounted: a ⋮ click opens it in the same task, before the chosen item renders into it. -->
		<ItemMenu
			id={menuFor}
			generation={menuGeneration}
			generationInfo={menuGeneration
				? generationStatus(menuGeneration, $queue.jobs, now, !!app.key, $queue.paused)
				: undefined}
			status={menuItem ? statusOf(menuItem) : { look: '', missing: '', hidden: false }}
			onremove={(id) => void remove(id)}
			bind:open={menuOpen}
		/>
		<!-- Navigation over the list's sections (not tabs): arrows move along it like the other rails (Studio.svelte). -->
		<nav
			class="slot-rail bu-scroll-hidden bu-edge-fade"
			aria-label="Equipment slots"
			bind:this={rail}
			{@attach edgeFade({ axis: 'y', size: 24 })}
		>
			<ul class="slot-rail-list" data-arrows>
				{#each sections as s (s.g.id)}
					<li>
						<button
							class="bu-action slot-tab"
							data-variant="rail"
							data-rail={s.g.id}
							data-filled={s.worn || undefined}
							aria-current={ui.group === s.g.id ? 'true' : undefined}
							aria-label={s.worn ? `${s.label}, equipped` : s.label}
							tabindex={ui.group === s.g.id ? 0 : -1}
							onclick={() => show(s.g.id)}
							><GroupIcon group={s.g.id} size={22} /><span class="bu-rail-label">{s.label}</span><i
								class="bu-rail-dot"
								aria-hidden="true"
							></i></button
						>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
{/if}
