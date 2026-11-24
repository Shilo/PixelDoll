<script lang="ts" module>
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	// Survives tab switches (the list unmounts) so returning to Wardrobe keeps the reader's place, for the same character
	// and only while no other view has picked a different category meanwhile.
	let memory: { id: string; open: number; group: string; scroll: number } | null = null;
</script>

<script lang="ts">
	import { currentItemDrawing } from './settingsDefaults.svelte.ts';
	import { formatNumber, formatPercent, getLocale, t } from 'svelte-whisper';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { contextMenu } from '../lib/input/contextMenu.ts';
	// One continuous list of every equipment category with sticky headers, and a slot rail that follows and drives it.
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { equipped, handSide, hiddenSlots, twoHanded } from '../lib/compose/compose.ts';
	import { experience } from './experience/state.svelte.ts';
	import { edgeFade, scrollToTop, stickyFade } from '@shilo/bronze-ui/svelte';
	import {
		crop,
		HEALTH_LABEL,
		healthOf,
		missingFramesNote,
		notShownIn,
		unfitText
	} from './model.ts';
	import { itemKey } from '../lib/equipment/copy.ts';
	import type { SharedItem } from '../lib/equipment/shared.ts';
	import TileMarks, { sortMarks, type Mark } from './TileMarks.svelte';
	import type { CellKey, Item, Manifest } from '../lib/store/manifest.ts';
	import {
		categories,
		shownCategories,
		slotBusyMessage,
		slotDef,
		slotLabelMessage,
		slotUseMessages
	} from './slots.ts';
	import { slotDrag } from './slotDrag.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { sharedItemsHidden } from './wardrobeVisibility.svelte.ts';
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
		removeItem,
		itemSlotTargets,
		moveItemToSlot,
		busySlots,
		slotUseHere,
		moveSlot,
		hideSlot,
		showSlot,
		showSlotAt,
		toast,
		isDemo,
		pendingMoves,
		characterItemJobs
	} from './state.svelte.ts';
	import { displayMove } from './displayMove.ts';
	import { extendable } from './movePricing.ts';
	import { clipItemOffer } from './itemGeneration.ts';
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
	import ItemChoiceMenu from './ItemChoiceMenu.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import {
		ArrowDown,
		ArrowUp,
		Ban,
		Check,
		ChevronRight,
		CircleAlert,
		CopyPlus,
		EllipsisVertical,
		Eye,
		EyeOff,
		GripVertical,
		Pencil,
		Plus,
		Shuffle
	} from './icons.ts';

	const outcomeFormatters = { render: displayNestedMessage, formatNumber };
	const m = $derived(store.project?.manifest);
	const formatList = (parts: string[]) =>
		new Intl.ListFormat(getLocale(), { type: 'unit' }).format(parts);
	let list = $state<HTMLElement>();
	let rail = $state<HTMLElement>();
	let spacer = $state(0);
	let notShownCurrent = $state(false);
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
			look: h === 'look' || h === 'stale' ? displayMessage(HEALTH_LABEL[h]) : '',
			unfit:
				h === 'unfitted' && m
					? unfitText(
							m,
							it.copiedFrom?.name ?? t('studioModel.anotherCharacter'),
							it.unfitted ?? [],
							t
						)
					: '',
			missing: m ? displayMessage(missingFramesNote(m, it)) : '',
			hidden: doc.items[it.slot] === it.id && hidden.has(it.slot),
			// Worn, but the move Preview shows has no frame of it in any view: its tile is pressed while the stage shows
			// nothing, and a tap to bring it back would take it off.
			unseen: doc.items[it.slot] === it.id && !doc.drafts[it.slot] && offMove(it)
		};
	}
	/** Preview's move has no frame of the item in any view, so the stage would not show it there: its tile dims, worn
	 * or not, so a move's usable items can be scanned at a glance. */
	const offMove = (it: NonNullable<typeof m>['items'][number]) =>
		!!m && experience.mode === 'preview' && notShownIn(m, it, ui.anim);
	let choice = $state<ItemChoiceMenu>(),
		choiceFor = $state(''),
		choiceOpen = $state(false);
	/** A tile dimmed because Preview's move or State has no frame of its item (worn or not) opens a menu to draw it there
	 *  or wear it, instead of wearing it at once; copies without their own design, the demo and items already queued for
	 *  it keep the direct tap. */
	const choosable = (it: NonNullable<typeof m>['items'][number]) =>
		!!m &&
		!isDemo() &&
		!!extendable(m, it.id) &&
		!pendingMoves(doc.id, it.id).some((spec) => spec.id === ui.anim);
	/** Pricing runs only on the tap (it is too slow for every render): no offer here (no joints for this move) wears. */
	function tapDimmed(it: NonNullable<typeof m>['items'][number], tile: HTMLElement) {
		if (
			m &&
			clipItemOffer(m, it.id, ui.anim, currentItemDrawing(), { images: store.project?.images })
		)
			choice?.show(it.id, tile);
		else wear(it.id);
	}
	/** Items being drawn on a saved move or State: their tiles show a ring and the share done (the one drawing now) or Queued. */
	const itemJobs = $derived(characterItemJobs(doc.id, $queue.jobs));
	const jobOf = (id: string) =>
		itemJobs.find((job) => job.item === id && job.status === 'drawing') ??
		itemJobs.find((job) => job.item === id);
	const wornMark: Mark = $derived({
		kind: 'worn',
		label: t('wardrobe.wearing'),
		text: t('wardrobe.wearingNote')
	});
	const unfitMark = (text: string): Mark => ({
		kind: 'unfitted',
		label: t('wardrobe.notFitted'),
		text
	});
	/** Moves an item has no art for here (it hides in them once worn). */
	const missingMark = (missing: string): Mark | false =>
		!!missing && {
			kind: 'missing',
			label: missing,
			text: t('wardrobe.missingNote', { coverage: missing })
		};
	/** Every corner icon an own item's tile shows, each with the words its tooltip and ⋮ menu give. */
	function marksOf(it: NonNullable<typeof m>['items'][number]): Mark[] {
		const st = statusOf(it);
		const from = it.copiedFrom?.name;
		return sortMarks([
			doc.items[it.slot] === it.id && !doc.drafts[it.slot] && wornMark,
			!!from && {
				kind: 'copied',
				label: t('wardrobe.copiedFrom', { from }),
				text: t('wardrobe.copiedFree', { from })
			},
			!!st.unfit && unfitMark(st.unfit),
			!!st.look && {
				kind: 'check',
				label: st.look,
				text: t('wardrobe.statusNote', { status: st.look })
			},
			missingMark(st.missing),
			st.hidden
				? {
						kind: 'hidden',
						label: t('itemPane.hiddenByAnotherItem'),
						text: t('wardrobe.hiddenNote')
					}
				: st.unseen && {
						kind: 'hidden',
						label: t('wardrobe.notShownInMove'),
						text: t('wardrobe.notShownInMoveNote')
					}
		]);
	}
	/** An accessible tile name: the item, then what its icons say (a worn tile says so with aria-pressed), then any
	 * status shown only by dimming. */
	const tileName = (name: string, marks: Mark[], ...extra: (string | undefined)[]) =>
		formatList([
			name,
			...[
				...marks.filter((mark) => mark.kind !== 'worn').map((mark) => mark.label),
				...extra.filter((text): text is string => !!text)
			].map((label) => (getLocale() === 'en' ? label[0].toLowerCase() + label.slice(1) : label))
		]);
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
	const sharedHidden = $derived(sharedItemsHidden(doc.id));
	const visibleShared = $derived(sharedHidden ? [] : shared.items);
	const menuShared = $derived(visibleShared.find((x) => sharedKey(x) === menuFor));
	const menuGeneration = $derived(genOf(menuFor));
	// A menu whose generation or shared item is gone (finished, or added from another tab) closes rather than stay empty.
	$effect(() => {
		if (
			menuOpen &&
			((menuFor.startsWith('gen:') && !menuGeneration) ||
				(menuFor.startsWith('shared:') && !menuShared))
		)
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
	/** The hand a category holds with, from its own definition (a built-in that holds nothing yet uses its default). */
	const sideOf = (key: string) => {
		const def = m && slotDef(m, key);
		return def ? handSide({ slots: [def] } as Manifest, key) : undefined;
	};
	const own = $derived(
		(m ? shownCategories(m, busySlots(m)) : []).map((c) => {
			const key = c.key,
				side = sideOf(key);
			const items = m ? m.items.filter((i) => i.slot === key) : [];
			const pending = gens.filter((x) => x.draft.rigId === doc.id && x.input.slot === key);
			const others = visibleShared.filter(
				(x) => x.item.slot === key && (x.fit !== 'remake' || !making.has(itemKey(x.item)))
			);
			return {
				key,
				label: displayMessage(slotLabelMessage(m, key)),
				items,
				pending,
				others,
				worn: items.some((i) => doc.items[i.slot] === i.id) || !!doc.drafts[key],
				choices: m ? groupRandomChoices(key).length : 0,
				// a two-handed item worn in the other hand holds this one too
				holder:
					m && side
						? m.items.find(
								(i) =>
									view.items[i.slot] === i.id &&
									!!sideOf(i.slot) &&
									sideOf(i.slot) !== side &&
									twoHanded(m, i)
							)
						: undefined,
				fromOthers: ''
			};
		})
	);
	/** Other characters' items in their own categories this character doesn't have: listed under the source's name, so they
	 *  can be worn. Wearing one adds the category here (copySlotPlan); until then it is not part of this character. */
	const fromOthers = $derived.by(() => {
		if (!m) return [];
		const known = new Set(categories(m).map((c) => c.key));
		const groups: Record<string, SharedItem[]> = {};
		for (const x of visibleShared) {
			if (known.has(x.item.slot) || x.item.slot === 'body') continue;
			// One that can't be worn here would only offer making it, in a category this character doesn't have.
			if (x.fit === 'remake') continue;
			(groups[x.item.slot] ??= []).push(x);
		}
		return Object.entries(groups).map(([key, others]) => {
			const names = [...new Set(others.map((x) => x.sourceName))];
			return {
				key,
				label: displayMessage(slotLabelMessage(others[0].source, key)),
				items: [] as Item[],
				pending: [] as typeof gens,
				others,
				worn: false,
				choices: 0,
				holder: undefined as Item | undefined,
				fromOthers: t('wardrobe.fromOthers', { sources: formatList(names), name: m.name })
			};
		});
	});
	const sections = $derived([...own, ...fromOthers]);
	/** This character's slots Wardrobe doesn't show, listed under Not shown at the bottom. */
	const notShown = $derived(
		m
			? categories(m)
					.filter((c) => !own.some((s) => s.key === c.key))
					.map((c) => ({ ...c, label: displayMessage(slotLabelMessage(m, c.key)) }))
			: []
	);
	/** Every corner icon another character's item shows here, each with the words its tooltip and ⋮ menu give. */
	function sharedMarks(x: SharedItem): Mark[] {
		if (!m) return [];
		const missing = x.fit === 'remake' ? '' : sharedMissing(x);
		return sortMarks([
			{
				kind: 'shared',
				label:
					x.fit === 'remake'
						? t('wardrobe.source', { from: x.sourceName })
						: t('wardrobe.sourceFree', { from: x.sourceName }),
				text:
					x.fit === 'remake'
						? t('wardrobe.sourceNote', { from: x.sourceName })
						: x.fit === 'copy'
							? t('wardrobe.sourceSameBody', { from: x.sourceName })
							: t('wardrobe.sourceCopy', { from: x.sourceName })
			},
			x.fit === 'remake' && {
				kind: 'blocked',
				label: t('wardrobe.cannotWear'),
				text: t('wardrobe.cannotWearNote', { name: m.name })
			},
			x.fit === 'unfitted' && unfitMark(unfitText(m, x.sourceName, x.notes ?? [], t)),
			x.fit === 'refit' && {
				kind: 'check',
				label: t('wardrobe.checkFit'),
				text: t('wardrobe.checkFitNote', { from: x.sourceName })
			},
			missingMark(missing)
		]);
	}
	/** Moves the item has no art for here, worded like an own item's missing frames (it hides in them once worn). */
	const sharedMissing = (x: SharedItem) =>
		m ? displayMessage(missingFramesNote(m, { ...x.item, coverage: x.cells as CellKey[] })) : '';
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
		let current = sections[0]?.key ?? ui.group;
		for (const el of list.querySelectorAll<HTMLElement>('[data-group]'))
			if (el.getBoundingClientRect().top <= top) current = el.dataset.group!;
		const notShownSection = list.querySelector<HTMLElement>('.not-shown');
		notShownCurrent = !!notShownSection && notShownSection.getBoundingClientRect().top <= top;
		if (current !== ui.group) {
			reported = current;
			ui.group = current;
		}
		remember();
	}
	const scrolled = () => (spyFrame ||= requestAnimationFrame(spy));
	let previousOrder = '';
	let restoreAnchor: { element: HTMLElement; top: number; key: string } | null = null;
	$effect.pre(() => {
		const order = own.map((slot) => slot.key).join('\0');
		const changed = previousOrder && order !== previousOrder;
		previousOrder = order;
		const anchor = restoreAnchor;
		restoreAnchor = null;
		if (!changed || !list || untrack(() => ui.group !== reported)) return;
		const top = list.scrollTop;
		void tick().then(() => {
			if (!list) return;
			const element = anchor?.element.isConnected
				? anchor.element
				: anchor &&
					list.querySelector<HTMLElement>(`[data-slot-button="${CSS.escape(anchor.key)}"]`);
			list.scrollTo({
				top:
					anchor && element
						? list.scrollTop + element.getBoundingClientRect().top - anchor.top
						: top,
				behavior: 'instant'
			});
			spy();
		});
	});
	async function show(id: string, instant = false) {
		const section = list?.querySelector<HTMLElement>(`[data-group="${CSS.escape(id)}"]`);
		if (!list || !section) return;
		notShownCurrent = false;
		reported = id;
		ui.group = id;
		if (instant) {
			list.scrollTop =
				id === sections[0]?.key
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
			?.querySelector(notShownCurrent ? '[data-not-shown]' : `[data-rail="${CSS.escape(id)}"]`)
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
	$effect(() => {
		void sections;
		void notShown.length;
		void notShownOpen;
		if (list && !untrack(() => sections.some((slot) => slot.key === ui.group))) {
			if (suppressSpy) list.scrollTo({ top: list.scrollTop, behavior: 'instant' });
			suppressSpy = false;
			scrolled();
		}
		const last =
			list?.querySelector<HTMLElement>('.not-shown') ??
			list?.querySelector<HTMLElement>('section[data-group]:last-of-type');
		return list && last ? watchListSpacer(list, last, (height) => (spacer = height)) : undefined;
	});
	onMount(() => {
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
			spy();
		});
		return () => {
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

	// ---------- slots: each header opens its slot's menu and drags to reorder; Not shown lists the rest ----------
	let announce = $state.raw<Message>();
	const announcement = $derived.by(() => {
		if (!announce) return '';
		const vars = Object.fromEntries(
			Object.entries(announce.vars ?? {}).map(([name, value]) => [
				name,
				typeof value === 'number' ? formatNumber(value) : value
			])
		);
		return displayNestedMessage({ ...announce, vars });
	});
	let slotMenu = $state<HTMLElement>();
	let slotFor = $state(''),
		slotMenuOpen = $state(false),
		notShownOpen = $state(false);
	const slotAt = $derived(own.findIndex((s) => s.key === slotFor));
	const slotEntry = $derived(
		own.find((slot) => slot.key === slotFor) ?? notShown.find((slot) => slot.key === slotFor)
	);
	const slotCustom = $derived(!!m && categories(m).some((c) => c.key === slotFor && c.custom));
	/** Why a slot can't be hidden now (it holds items or attempts), or '' when it is empty. */
	function hideBlock(key: string, label: string) {
		const use = slotUseHere(key);
		return displayMessage(
			slotBusyMessage(
				label,
				use,
				'hideWardrobe',
				new Intl.ListFormat(getLocale()).format(slotUseMessages(use).map(displayMessage)),
				use.stopped ? t('studioSlots.busy.dismissStopped') : ''
			)
		);
	}
	const slotHideBlock = $derived(slotAt >= 0 ? hideBlock(slotFor, own[slotAt].label) : '');
	// A slot gone from the list (hidden or deleted elsewhere, undo) closes its menu rather than act on a ghost.
	$effect(() => {
		if (slotMenuOpen && !slotEntry) slotMenu?.hidePopover();
	});
	const closeSlotMenu = () => slotMenu?.hidePopover();
	function openSlotMenu(key: string, element: HTMLElement) {
		closeSlotMenu();
		slotFor = key;
		element.focus({ preventScroll: true });
		slotMenu?.showPopover({ source: element });
	}
	async function settle(key: string) {
		await tick();
		spy();
		const button = list?.querySelector<HTMLElement>(`[data-slot-button="${CSS.escape(key)}"]`);
		const box = list?.getBoundingClientRect();
		const rect = button?.getBoundingClientRect();
		const visible = box && rect && rect.top >= box.top && rect.bottom <= box.bottom;
		const focus = visible
			? button
			: list?.querySelector<HTMLElement>(`[data-slot-button="${CSS.escape(ui.group)}"]`);
		focus?.focus({ preventScroll: true });
	}
	function moveTo(key: string, to: number) {
		try {
			moveSlot(key, to);
		} catch (e) {
			toast(errorMessage(e));
			return;
		}
		announce = message('wardrobe.slotMoved', {
			label: slotLabelMessage(m, key),
			position: to + 1,
			total: own.length
		});
		void settle(key);
	}
	async function hide(key: string) {
		const label = slotLabelMessage(m, key);
		if (hideBlock(key, displayMessage(label))) return;
		closeSlotMenu();
		const problem = await hideSlot(key).catch(errorMessage);
		if (problem) {
			toast(problem);
			return;
		}
		announce = message('wardrobe.slotHidden', { label });
		await tick();
		list?.querySelector<HTMLElement>('.not-shown-toggle')?.focus({ preventScroll: true });
	}
	async function showHidden(key: string, to?: number) {
		const label = slotLabelMessage(m, key);
		const index = notShown.findIndex((slot) => slot.key === key);
		const next = notShown[index + 1]?.key ?? notShown[index - 1]?.key;
		const anchor = to === undefined && list?.querySelector<HTMLElement>('.not-shown-toggle');
		if (anchor && list) {
			list.scrollTo({ top: list.scrollTop, behavior: 'instant' });
			restoreAnchor = { element: anchor, top: anchor.getBoundingClientRect().top, key };
		}
		try {
			if (to === undefined) showSlot(key);
			else showSlotAt(key, to);
		} catch (e) {
			restoreAnchor = null;
			toast(errorMessage(e));
			return;
		}
		await tick();
		const at = own.findIndex((s) => s.key === key);
		announce = message('wardrobe.slotShown', {
			label,
			position: at + 1,
			total: own.length
		});
		if (to !== undefined) void settle(key);
		else {
			const focus = next
				? list?.querySelector<HTMLElement>(`[data-show-slot="${CSS.escape(next)}"]`)
				: list?.querySelector<HTMLElement>(`[data-slot-button="${CSS.escape(key)}"]`);
			focus?.focus({ preventScroll: true });
		}
	}
	async function toggleNotShown() {
		const top = list?.scrollTop;
		notShownOpen = !notShownOpen;
		await tick();
		if (list && top !== undefined) list.scrollTo({ top, behavior: 'instant' });
		spy();
	}
	async function showNotShown() {
		notShownOpen = true;
		await tick();
		const section = list?.querySelector<HTMLElement>('.not-shown');
		if (!list || !section) return;
		list.scrollTo({ top: section.offsetTop, behavior: 'instant' });
		suppressSpy = false;
		spy();
	}
	/** Edit a custom slot, or start a custom copy of a built-in, in the Slots sheet. */
	function openSlotSettings(key: string) {
		closeSlotMenu();
		ui.slotTarget = key;
		ui.sheet = 'slots';
	}
	function addSlot() {
		ui.slotTarget = null;
		ui.sheet = 'slots';
	}

	// Dragging (slotDrag recognizes the gesture): the target is the header boundary nearest the pointer, measured on the
	// sections' own layout rather than where sticky headers appear, and nothing moves until the drop.
	type DragSource = { key: string; label: string; hidden: boolean; rail?: boolean; item?: Item };
	const EDGE = 48,
		MAX_SPEED = 14,
		/** How far past the first or last shown slot a drop still counts. */
		SLACK = 24,
		/** Half the gap between sections, where the drop line sits. */
		GAP = 8;
	/** `hides`: an empty list slot (not a rail tab, which is too easy to drop by accident) hides on Not shown. */
	let drag = $state<{
		source: DragSource;
		line: number | null;
		hides: boolean;
		overHide: boolean;
	} | null>(null);
	let itemDrop = $state('');
	const itemTargets = $derived(
		m && drag?.source.item ? itemSlotTargets(m, drag.source.item).map(({ key }) => key) : []
	);
	let armed = $state('');
	let armedItem = $state('');
	let pointer = $state({ x: 0, y: 0 });
	let dragFrame = 0;
	let dragPreview = $state<HTMLElement>();
	function itemDropTarget() {
		const hit = document.elementFromPoint(pointer.x, pointer.y);
		const section = hit?.closest<HTMLElement>('section[data-own]');
		const tab = hit?.closest<HTMLElement>('[data-rail][data-sortable]');
		const key =
			section && list?.contains(section)
				? section.dataset.group
				: tab && rail?.contains(tab)
					? tab.dataset.rail
					: undefined;
		return key && itemTargets.includes(key) ? key : '';
	}
	async function moveTileFromMenu(id: string, target: string) {
		const surface = list;
		if (!(await moveItemToSlot(id, target, { showDestination: true })) || surface !== list) return;
		await tick();
		if (surface === list)
			list
				?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"]`)
				?.focus({ preventScroll: true });
	}
	/** Whether the pointer is over Not shown in the list, where a dragged list slot is hidden. */
	function overNotShown(source: DragSource) {
		if (source.rail || source.item || source.hidden || !list) return false;
		const box = list.getBoundingClientRect();
		const rect = list.querySelector<HTMLElement>('.not-shown')?.getBoundingClientRect();
		const { x, y } = pointer;
		return (
			!!rect &&
			x >= rect.left &&
			x <= rect.right &&
			y >= Math.max(rect.top, box.top) &&
			y <= Math.min(rect.bottom, box.bottom)
		);
	}
	/** Where a drop at the pointer would land: the shown index, and the drop line's offset in the list. */
	function dropTarget(source: DragSource): { to: number; line: number } | null {
		if (source.rail) {
			if (!rail) return null;
			const box = rail.getBoundingClientRect();
			if (
				pointer.x < box.left ||
				pointer.x > box.right ||
				pointer.y < box.top ||
				pointer.y > box.bottom
			)
				return null;
			const tabs = [...rail.querySelectorAll<HTMLElement>('[data-sortable]')];
			const fixed = rail.querySelector<HTMLElement>('[data-not-shown]')?.getBoundingClientRect();
			if (fixed && pointer.y >= fixed.top) return null;
			const last = tabs.at(-1)?.getBoundingClientRect();
			if (!last || pointer.y > last.bottom + SLACK) return null;
			const gap = tabs.findIndex((tab) => {
				const rect = tab.getBoundingClientRect();
				return pointer.y < rect.top + rect.height / 2;
			});
			const index = gap < 0 ? tabs.length : gap;
			const from = own.findIndex((slot) => slot.key === source.key);
			if (from < 0 || index === from || index === from + 1) return null;
			const line =
				(tabs[index]?.getBoundingClientRect().top ?? last.bottom) - box.top + rail.scrollTop;
			return {
				to: index < from ? index : index - 1,
				line: Math.max(2, line - (index === tabs.length ? 2 : 0))
			};
		}
		if (!list) return null;
		const box = list.getBoundingClientRect(),
			{ x, y } = pointer;
		if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
		const at = y - box.top + list.scrollTop;
		const excluded = list.querySelector<HTMLElement>('.not-shown');
		if (excluded && at >= excluded.offsetTop) return null;
		for (const section of list.querySelectorAll<HTMLElement>('section:not([data-own])'))
			if (at >= section.offsetTop && at <= section.offsetTop + section.offsetHeight) return null;
		const shown = [...list.querySelectorAll<HTMLElement>('section[data-own]')];
		const bounds = shown.map((el) => el.offsetTop);
		const last = shown.at(-1);
		const end = last
			? last.offsetTop + last.offsetHeight
			: (list.querySelector<HTMLElement>('.not-shown')?.offsetTop ?? list.scrollHeight);
		if (last) bounds.push(end);
		else bounds.push(0);
		if (at < bounds[0] - SLACK || at > end + SLACK) return null;
		let gap = 0;
		bounds.forEach((b, i) => {
			if (Math.abs(b - at) < Math.abs(bounds[gap] - at)) gap = i;
		});
		if (!last) gap = 0;
		const line = gap ? bounds[gap] - GAP : bounds[0] + 2;
		if (source.hidden) return { to: gap, line };
		const from = own.findIndex((s) => s.key === source.key);
		if (from < 0 || gap === from || gap === from + 1) return null;
		return { to: gap < from ? gap : gap - 1, line };
	}
	function dragStep() {
		if (!drag || !list) return;
		const surface =
			drag.source.rail ||
			(drag.source.item && rail?.contains(document.elementFromPoint(pointer.x, pointer.y)))
				? rail
				: list;
		if (!surface) return;
		const box = surface.getBoundingClientRect(),
			{ x, y } = pointer;
		// Continuous edge scroll: every frame while the pointer rests near (or past) an edge over the list.
		if (x >= box.left && x <= box.right) {
			const speed =
				y < box.top + EDGE
					? -MAX_SPEED * Math.min(1, (box.top + EDGE - y) / EDGE)
					: y > box.bottom - EDGE
						? MAX_SPEED * Math.min(1, (y - (box.bottom - EDGE)) / EDGE)
						: 0;
			if (speed) surface.scrollTop += speed;
		}
		if (drag.source.item) itemDrop = itemDropTarget();
		else {
			drag.line = dropTarget(drag.source)?.line ?? null;
			drag.overHide = drag.hides && overNotShown(drag.source);
		}
		dragFrame = requestAnimationFrame(dragStep);
	}
	function dragOptions(source: DragSource) {
		return {
			armed: (value: boolean) => {
				if (source.item) {
					armedItem = value ? source.item.id : '';
					return;
				}
				if (value) armed = source.key;
				else if (armed === source.key) armed = '';
			},
			start: () => {
				armed = '';
				closeSlotMenu();
				if (source.item) document.getElementById('item-menu')?.hidePopover();
				// Stop a smooth scroll still bringing a slot to the top; the drag scrolls the list from here.
				list?.scrollTo({ top: list.scrollTop, behavior: 'instant' });
				drag = {
					source,
					line: null,
					hides:
						!source.item &&
						!source.rail &&
						!source.hidden &&
						!hideBlock(source.key, displayMessage(slotLabelMessage(m, source.key))),
					overHide: false
				};
				void tick().then(() => {
					if (drag) dragPreview?.showPopover();
				});
				announce = source.item
					? message('wardrobe.dragItem', { name: source.item.name })
					: message(source.rail ? 'wardrobe.dragInRail' : 'wardrobe.dragInList', {
							label: slotLabelMessage(m, source.key)
						});
				cancelAnimationFrame(dragFrame);
				dragFrame = requestAnimationFrame(dragStep);
			},
			move: (x: number, y: number) => {
				pointer = { x, y };
			},
			end: (commit: boolean) => {
				cancelAnimationFrame(dragFrame);
				const itemTarget = commit && source.item && drag ? itemDropTarget() : '';
				const target = commit && drag && !source.item ? dropTarget(drag.source) : null;
				const hideDrop = commit && !!drag && overNotShown(drag.source);
				dragPreview?.hidePopover();
				drag = null;
				itemDrop = '';
				armed = '';
				if (source.item) {
					if (itemTarget) void moveItemToSlot(source.item.id, itemTarget);
					else announce = message('wardrobe.dragCanceled');
					return;
				}
				if (hideDrop) {
					const block = hideBlock(source.key, displayMessage(slotLabelMessage(m, source.key)));
					if (block) toast(block);
					else void hide(source.key);
					return;
				}
				if (!target) {
					announce = commit
						? message('wardrobe.slotUnmoved', { label: slotLabelMessage(m, source.key) })
						: message('wardrobe.dragCanceled');
					return;
				}
				if (source.hidden) void showHidden(source.key, target.to);
				else {
					moveTo(source.key, target.to);
					if (source.rail)
						void tick().then(() =>
							rail
								?.querySelector<HTMLElement>(`[data-rail="${CSS.escape(source.key)}"]`)
								?.focus({ preventScroll: true })
						);
				}
			}
		};
	}
	onMount(() => () => cancelAnimationFrame(dragFrame));
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
			{#each sections as s (s.key)}
				{@const lower = getLocale() === 'en' ? s.label.toLowerCase() : s.label}
				{@const count = s.fromOthers ? s.others.length : s.items.length + s.pending.length}
				<section
					class="slot-section"
					data-group={s.key}
					data-own={!s.fromOthers || undefined}
					id={sectionId(s.key)}
					aria-labelledby="{sectionId(s.key)}-title"
				>
					<div
						class="bu-section-head"
						data-current={(drag?.source.item
							? itemDrop === s.key
							: !notShownCurrent && ui.group === s.key) || undefined}
						data-slot-head={!s.fromOthers || undefined}
						data-armed={armed === s.key || undefined}
						data-dragged={(!drag?.source.item && drag?.source.key === s.key) || undefined}
					>
						{#if s.fromOthers}<GroupIcon group={s.key} size={16} />{/if}
						<h3 class="bu-section-title" id="{sectionId(s.key)}-title" aria-label={s.label}>
							{#if s.fromOthers}{s.label}{:else}<button
									class="bu-action section-menu"
									aria-label={s.label}
									aria-describedby={`${sectionId(s.key)}-count`}
									data-slot-button={s.key}
									popovertarget="slot-menu"
									aria-haspopup="menu"
									aria-expanded={slotMenuOpen && slotFor === s.key}
									onclick={() => {
										// The same header toggles the menu closed; another header reopens it for its slot.
										if (slotMenuOpen && slotFor !== s.key) closeSlotMenu();
										slotFor = s.key;
									}}
									oncontextmenu={(e) => {
										e.preventDefault();
										if (!armed && !drag && !(slotMenuOpen && slotFor === s.key))
											e.currentTarget.click();
									}}
									{@attach (node) =>
										untrack(() =>
											slotDrag(node, dragOptions({ key: s.key, label: s.label, hidden: false }))
										)}
									><span class="slot-drag-icon"
										><GroupIcon group={s.key} size={16} /><GripVertical
											class="slot-grip"
											size={16}
										/></span
									><span class="section-menu-name">{s.label}</span><span
										class="bu-section-count"
										id={`${sectionId(s.key)}-count`}
										><span aria-hidden="true">{formatNumber(count)}</span><span class="sr"
											>{t('wardrobe.itemCount', { count, n: formatNumber(count) })}</span
										></span
									></button
								>{/if}
						</h3>
						{#if s.fromOthers}<span class="bu-section-count"
								><span aria-hidden="true">{formatNumber(count)}</span><span class="sr"
									>{t('wardrobe.itemCount', { count, n: formatNumber(count) })}</span
								></span
							>{/if}
						{#if !s.fromOthers}
							<button
								class="bu-action section-action"
								data-variant="quiet"
								aria-label={t('wardrobe.randomLowerItem', { lower })}
								title={t('wardrobe.randomLowerItem', { lower })}
								disabled={!s.choices}
								onclick={() => randomizeGroup(s.key)}><Shuffle size={16} /></button
							>
							<button
								class="bu-action section-action"
								data-variant="quiet"
								aria-label={t('wardrobe.newLowerItem', { lower })}
								title={t('wardrobe.newLowerItem', { lower })}
								onclick={() => openNewItem(s.key)}><Plus size={18} /></button
							>
						{/if}
					</div>
					<div class="section-body">
						{#if s.fromOthers}<p class="section-note faint small">{s.fromOthers}</p>{/if}
						{#if s.holder}<p class="section-note faint small">
								{t('wardrobe.heldBy', { name: s.holder.name })}
							</p>{/if}
						<div
							class="slot-tiles"
							role="group"
							aria-label={t('wardrobe.labelItems', { label: s.label })}
						>
							{#if !s.fromOthers}
								<button
									class="bu-tile item-tile"
									data-variant="empty"
									aria-pressed={!s.worn}
									aria-label={t('wardrobe.emptyLower', { lower })}
									onclick={() => clearSlots([s.key])}
									><span class="bu-tile-art tile-art" aria-hidden="true"><Ban size={26} /></span
									><span class="bu-tile-label">{t('wardrobe.empty')}</span>{#if !s.worn}<span
											class="tile-marks"
											aria-hidden="true"
											><span class="bu-tile-check" title={t('wardrobe.titleNothingWornHere')}
												><Check /></span
											></span
										>{/if}</button
								>
							{/if}
							{#each s.items as it (it.id)}
								{@const on = doc.items[it.slot] === it.id && !doc.drafts[it.slot]}
								{@const marks = marksOf(it)}
								{@const shownHidden = marks.some((x) => x.kind === 'hidden')}
								{@const away = !shownHidden && offMove(it)}
								{@const chooses = offMove(it) && choosable(it)}
								{@const job = jobOf(it.id)}
								{@const jobMove = job && displayMove(job.clip, m?.rig.animations ?? [])}
								<!-- The ⋮ is a sibling of the tile, never nested in it; right-click and Shift+F10 open the same menu. -->
								<div
									class="tile-wrap hover-actions"
									role="none"
									{@attach (node) =>
										untrack(() =>
											slotDrag(node, {
												...dragOptions({ key: s.key, label: it.name, hidden: false, item: it }),
												menu: openMenu,
												allowStart: (target) =>
													target instanceof Element &&
													!!target.closest('.item-tile') &&
													!!m &&
													itemSlotTargets(m, it).length > 0
											})
										)}
								>
									<button
										class="bu-tile item-tile"
										data-selected={ui.selected === it.id || armedItem === it.id || undefined}
										data-item-armed={armedItem === it.id || undefined}
										data-tile={it.id}
										data-dim={shownHidden || away || undefined}
										aria-pressed={on}
										aria-haspopup={chooses ? 'menu' : undefined}
										aria-expanded={chooses ? choiceOpen && choiceFor === it.id : undefined}
										aria-label={tileName(
											it.name,
											marks,
											away ? t('wardrobe.notShownInMove') : undefined,
											job?.status === 'drawing'
												? t('wardrobe.itemDrawing', {
														move: jobMove!,
														percent: formatPercent(job.percent / 100)
													})
												: job
													? t('wardrobe.itemQueued', { move: jobMove! })
													: undefined
										)}
										onclick={(event) =>
											chooses ? tapDimmed(it, event.currentTarget) : wear(it.id)}
									>
										<span class="bu-tile-art tile-art" aria-hidden="true" {@attach lazyArt(it.id)}
											>{#if seen.has(it.id)}<Thumb
													project={view.project}
													item={it}
													box={64}
												/>{/if}{#if job}<span
													class="bu-ring ring generation-ring"
													style:--p={job.status === 'drawing' ? job.percent : undefined}
												></span>{/if}</span
										>{#if job}<span class="generation-caption"
												><span class="generation-time bu-muted small num" aria-hidden="true"
													>{job.status === 'drawing'
														? formatPercent(job.percent / 100)
														: t('generation.status.queued')} · {jobMove}</span
												><span class="bu-tile-label tile-name">{it.name}</span></span
											>{:else}<span class="bu-tile-label tile-name">{it.name}</span>{/if}
										<TileMarks {marks} />
									</button>
									<button
										class="bu-tile-more tile-more hover-actions-button"
										popovertarget="item-menu"
										aria-haspopup="menu"
										aria-expanded={menuOpen && menuFor === it.id}
										aria-label={t('wardrobe.moreOptionsForName', { name: it.name })}
										title={t('wardrobe.titleOptions')}
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
								{@const info = generationStatus(
									x,
									$queue.jobs,
									now,
									!!app.key,
									$queue.paused,
									outcomeFormatters
								)}
								{@const status = displayMessage(info.text)}
								{@const on = doc.drafts[x.draft.spec.slot] === x.draft.spec.id}
								{@const preview = store.results[x.draft.spec.id]?.preview}
								{@const previewItem = preview?.manifest.items.find(
									(it) => it.id === x.draft.spec.id
								)}
								{@const firstFrame = store.results[x.draft.spec.id]?.thumbnail}
								{@const thumbnail = firstFrame ? crop(firstFrame) : null}
								<!-- a draft tile wears the draft like a saved item (display only, while it loads or awaits review) -->
								<div
									class="tile-wrap hover-actions"
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
										aria-label={x.phase === 'running'
											? t('wardrobe.generationTileRunning', {
													name: x.input.name,
													percent: formatPercent(p.pct / 100),
													status
												})
											: on
												? t('wardrobe.generationTileWearing', { name: x.input.name, status })
												: t('wardrobe.generationTile', { name: x.input.name, status })}
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
												{:else if x.phase !== 'running'}<GroupIcon group={s.key} size={24} />{/if}
											</span>
											{#if x.phase === 'running'}<span
													class="bu-ring ring generation-ring"
													style:--p={p.pct}
												></span>{/if}
										</span>
										{#if x.phase === 'running'}<span
												class="generation-percent bu-muted small num"
												aria-hidden="true">{formatPercent(p.pct / 100)}</span
											>{/if}
										<span class="generation-caption">
											<span class="generation-time bu-muted small num" aria-hidden="true"
												>{status}</span
											>
											<span class="bu-tile-label tile-name">{x.input.name}</span>
										</span>
										<TileMarks
											marks={sortMarks([
												on && wornMark,
												info.attention && { kind: 'check', label: status, text: status }
											])}
										/>
									</button>
									{#if x.phase === 'running'}<span
											class="sr"
											role="progressbar"
											aria-label={t('wardrobe.nameProgress', { name: x.input.name })}
											aria-valuenow={p.pct}
											aria-valuemin={0}
											aria-valuemax={100}
											aria-valuetext={t('wardrobe.generationProgress', {
												percent: formatPercent(p.pct / 100),
												status
											})}
										></span>{/if}
									<button
										class="bu-tile-more tile-more hover-actions-button"
										popovertarget="item-menu"
										aria-haspopup="menu"
										aria-expanded={menuOpen && menuFor === 'gen:' + x.draft.spec.id}
										title={t('wardrobe.titleOptions')}
										aria-label={t('wardrobe.moreOptionsForName', { name: x.input.name })}
										onclick={() => {
											if (menuOpen && menuFor !== 'gen:' + x.draft.spec.id)
												document.getElementById('item-menu')?.hidePopover();
											menuFor = 'gen:' + x.draft.spec.id;
										}}><EllipsisVertical size={18} /></button
									>
								</div>
							{/each}
							{#each s.others as x (sharedKey(x))}
								{@const key = sharedKey(x)}
								{@const adding = shared.adding === key}
								{@const remake = x.fit === 'remake'}
								{@const marks = sharedMarks(x)}
								<!-- Like an own tile: the tile wears it (on the demo, in a saved copy), the ⋮ explains how it fits. -->
								<div class="tile-wrap hover-actions" role="none" {@attach contextMenu(openMenu)}>
									<button
										class="bu-tile item-tile shared-tile"
										data-selected={ui.selected === key || undefined}
										data-tile={key}
										data-dim={remake || adding || undefined}
										aria-label={tileName(x.item.name, marks)}
										aria-busy={adding}
										aria-disabled={!!shared.adding || undefined}
										aria-haspopup={remake ? 'menu' : undefined}
										aria-expanded={remake ? menuOpen && menuFor === key : undefined}
										onclick={(e) =>
											remake ? openMenu(e.currentTarget.parentElement!) : addShared(x)}
									>
										<span class="bu-tile-art tile-art" aria-hidden="true" {@attach lazyArt(key)}
											>{#if seen.has(key)}<SharedThumb entry={x} />{/if}</span
										><span class="bu-tile-label tile-name">{x.item.name}</span>
										<TileMarks {marks} />
									</button>
									<button
										class="bu-tile-more tile-more hover-actions-button"
										popovertarget="item-menu"
										aria-haspopup="menu"
										aria-expanded={menuOpen && menuFor === key}
										aria-label={t('wardrobe.moreOptionsForName', { name: x.item.name })}
										title={t('wardrobe.titleOptions')}
										onclick={() => {
											if (menuOpen && menuFor !== key)
												document.getElementById('item-menu')?.hidePopover();
											menuFor = key;
										}}><EllipsisVertical size={18} /></button
									>
								</div>
							{/each}
							{#if !count && !s.fromOthers}
								<button
									class="bu-tile item-tile"
									data-variant="add"
									aria-label={t('wardrobe.newLowerItem', { lower })}
									onclick={() => openNewItem(s.key)}
									><span class="bu-tile-art tile-art" aria-hidden="true"><Plus size={26} /></span
									><span class="bu-tile-label">{t('common.new')}</span></button
								>
							{/if}
						</div>
					</div>
				</section>
			{/each}
			{#if !own.length}<p class="faint small no-slots">
					{t('wardrobe.noSlotsAreShownShowOneBelow')}
				</p>{/if}
			{#if notShown.length}
				<div class="not-shown">
					<button
						class="bu-action bu-section-head not-shown-toggle"
						data-current={(drag ? drag.overHide : notShownCurrent) || undefined}
						data-variant="quiet"
						aria-expanded={notShownOpen}
						aria-controls="wardrobe-not-shown"
						onclick={() => void toggleNotShown()}
						><EyeOff size={16} aria-hidden="true" /><span class="bu-section-title"
							>{t('wardrobe.notShown')}</span
						><span class="bu-section-count not-shown-count">{formatNumber(notShown.length)}</span
						><ChevronRight class="not-shown-chevron" size={16} aria-hidden="true" /></button
					>
					<div id="wardrobe-not-shown" hidden={!notShownOpen}>
						<p class="faint small not-shown-note" id="wardrobe-not-shown-note">
							{t('wardrobe.dragASlotOrTapItsEye')}
						</p>
						<ul class="not-shown-list" aria-describedby="wardrobe-not-shown-note">
							{#each notShown as c (c.key)}
								<li
									class="not-shown-row"
									data-armed={armed === c.key || undefined}
									data-dragged={drag?.source.key === c.key || undefined}
									{@attach (node) =>
										untrack(() =>
											slotDrag(node, {
												...dragOptions({ key: c.key, label: c.label, hidden: true }),
												menu: (element) =>
													openSlotMenu(
														c.key,
														element.querySelector<HTMLButtonElement>('[data-show-slot]')!
													)
											})
										)}
								>
									<button
										class="bu-action not-shown-slot"
										aria-label={t('slotsSheet.showLabel', { label: c.label })}
										data-show-slot={c.key}
										popovertarget="slot-menu"
										aria-haspopup="menu"
										aria-expanded={slotMenuOpen && slotFor === c.key}
										onclick={(event) => {
											event.preventDefault();
											void showHidden(c.key);
										}}
										><span class="slot-drag-icon"
											><GroupIcon group={c.key} size={18} /><GripVertical
												class="slot-grip"
												size={18}
											/></span
										>
										<span class="not-shown-name">{c.label}</span><Eye
											size={18}
											aria-hidden="true"
										/></button
									>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}
			{#if shared.framesError}<p class="notice warn small" role="alert">
					{displayNestedMessage(shared.framesError)}
				</p>{/if}
			{#if !sharedHidden && shared.error}<p class="notice warn small" role="alert">
					{displayNestedMessage(shared.error)}
				</p>{/if}
			{#if !sharedHidden && shared.skipped}<p class="faint small">
					{t('wardrobe.someItemsFromOtherCharactersCouldnT')}
				</p>{/if}
			<div class="list-spacer" style:height="{spacer}px" aria-hidden="true"></div>
			{#if drag?.line != null && !drag.source.rail}<div
					class="bu-separator slot-drop-line"
					style:top="{drag.line}px"
					aria-hidden="true"
				></div>{/if}
		</div>
		<div
			class="bu-popover-anchor slot-drag-preview"
			data-positioned
			popover="manual"
			bind:this={dragPreview}
			style:left="{pointer.x + 16}px"
			style:--drag-x="{pointer.x + 16}px"
			style:top="{Math.max(8, pointer.y - (drag?.source.item ? 84 : 64))}px"
			aria-hidden="true"
		>
			<div class="bu-popover-surface bu-floating slot-drag-label">
				{#if drag?.source.item}
					<span class="drag-item-art"
						><Thumb project={view.project} item={drag.source.item} box={48} /></span
					>
					<span class="drag-item-caption">
						<span class="bu-tile-label">{drag.source.label}</span>
						{#if itemDrop}<small>{displayMessage(slotLabelMessage(m, itemDrop))}</small>{/if}
					</span>
				{:else}
					<GripVertical size={18} />{drag?.source.label}
				{/if}
			</div>
		</div>
		<!-- One shared slot menu, anchored to the header that opened it (like the item menu). -->
		<div
			id="slot-menu"
			class="menu bu-popover-anchor"
			data-placement="bottom-start"
			popover
			role="menu"
			aria-label={slotEntry
				? t('wardrobe.slotLabel', { label: slotEntry.label })
				: t('wardrobe.slot')}
			bind:this={slotMenu}
			ontoggle={(e) => {
				slotMenuOpen = e.newState === 'open';
				popoverFocus(e);
			}}
		>
			<PopoverArrow />
			<div class="menu-surface bu-popover-surface bu-floating">
				{#if slotEntry}
					{@const s = slotEntry}
					{#if slotAt < 0}
						<button
							class="row"
							data-variant="quiet"
							role="menuitem"
							onclick={() => {
								closeSlotMenu();
								void showHidden(s.key);
							}}><Eye size={16} aria-hidden="true" />{t('wardrobe.showSlot')}</button
						>
					{:else}
						<button
							class="row"
							data-variant="quiet"
							role="menuitem"
							aria-disabled={slotAt === 0 || undefined}
							onclick={() => {
								if (slotAt === 0) return;
								closeSlotMenu();
								moveTo(s.key, slotAt - 1);
							}}><ArrowUp size={16} aria-hidden="true" />{t('wardrobe.moveUp')}</button
						>
						<button
							class="row"
							data-variant="quiet"
							role="menuitem"
							aria-disabled={slotAt === own.length - 1 || undefined}
							onclick={() => {
								if (slotAt === own.length - 1) return;
								closeSlotMenu();
								moveTo(s.key, slotAt + 1);
							}}><ArrowDown size={16} aria-hidden="true" />{t('wardrobe.moveDown')}</button
						>
						<button
							class="row"
							data-variant="quiet"
							role="menuitem"
							aria-disabled={!!slotHideBlock || undefined}
							onclick={() => void hide(s.key)}
							><EyeOff size={16} aria-hidden="true" /><span class="row-name"
								>{t('wardrobe.hideSlot')}{#if slotHideBlock}<small class="row-reason"
										>{slotHideBlock}</small
									>{/if}</span
							></button
						>
						<hr />
					{/if}
					<button
						class="row"
						data-variant="quiet"
						role="menuitem"
						onclick={() => openSlotSettings(s.key)}
						>{#if slotCustom}<Pencil size={16} aria-hidden="true" />{openerLabel(
								t('wardrobe.editSlot')
							)}{:else}<CopyPlus size={16} aria-hidden="true" />{openerLabel(
								t('wardrobe.makeACustomCopy')
							)}{/if}<SurfaceChevron /></button
					>
				{/if}
			</div>
		</div>
		<p class="sr" aria-live="polite">{announcement}</p>
		<!-- Always mounted: a ⋮ click opens it in the same task, before the chosen item renders into it. -->
		<ItemMenu
			id={menuFor}
			entry={menuShared}
			marks={menuShared ? sharedMarks(menuShared) : menuItem ? marksOf(menuItem) : []}
			generation={menuGeneration}
			generationInfo={menuGeneration
				? generationStatus(
						menuGeneration,
						$queue.jobs,
						now,
						!!app.key,
						$queue.paused,
						outcomeFormatters
					)
				: undefined}
			onremove={(id) => void remove(id)}
			onmove={(id, target) => void moveTileFromMenu(id, target)}
			bind:open={menuOpen}
		/>
		<ItemChoiceMenu bind:this={choice} bind:itemId={choiceFor} bind:open={choiceOpen} />
		<!-- Navigation over the list's sections (not tabs): arrows move along it like the other rails (Studio.svelte). -->
		<div class="slot-rail-column">
			<nav
				class="slot-rail bu-scroll-hidden bu-edge-fade"
				aria-label={t('wardrobe.equipmentSlots')}
				bind:this={rail}
				{@attach edgeFade({ axis: 'y', size: 24 })}
			>
				<ul class="slot-rail-list" data-arrows>
					{#each sections as s (s.key)}
						<li>
							<button
								class="bu-action slot-tab"
								data-variant="rail"
								data-rail={s.key}
								popovertarget={!s.fromOthers ? 'slot-menu' : undefined}
								data-sortable={!s.fromOthers || undefined}
								data-armed={armed === s.key || undefined}
								data-dragged={(!drag?.source.item && drag?.source.key === s.key) || undefined}
								data-filled={s.worn || undefined}
								aria-current={!notShownCurrent && ui.group === s.key ? 'true' : undefined}
								aria-label={s.worn ? t('wardrobe.equipped', { label: s.label }) : s.label}
								aria-haspopup={!s.fromOthers ? 'menu' : undefined}
								aria-expanded={!s.fromOthers ? slotMenuOpen && slotFor === s.key : undefined}
								tabindex={!notShownCurrent && ui.group === s.key ? 0 : -1}
								onclick={(event) => {
									event.preventDefault();
									show(s.key);
								}}
								{@attach (node) =>
									s.fromOthers
										? undefined
										: untrack(() =>
												slotDrag(node, {
													...dragOptions({ key: s.key, label: s.label, hidden: false, rail: true }),
													menu: (element) => openSlotMenu(s.key, element)
												})
											)}
								><span class="slot-drag-icon"
									><GroupIcon group={s.key} size={22} /><GripVertical
										class="slot-grip"
										size={22}
									/></span
								><span class="bu-rail-label">{s.label}</span><i
									class="bu-rail-dot"
									aria-hidden="true"
								></i></button
							>
						</li>
					{/each}
					{#if notShown.length}<li>
							<button
								class="bu-action slot-tab"
								data-variant="rail"
								data-not-shown
								aria-current={notShownCurrent ? 'true' : undefined}
								tabindex={notShownCurrent || !sections.some((slot) => slot.key === ui.group)
									? 0
									: -1}
								aria-label={t('wardrobe.notShownLengthSlots', {
									length: formatNumber(notShown.length)
								})}
								onclick={() => void showNotShown()}
								><EyeOff size={22} aria-hidden="true" /><span class="bu-rail-label"
									>{t('wardrobe.notShown')}</span
								></button
							>
						</li>{/if}
				</ul>
				{#if drag?.source.rail && drag.line != null}<div
						class="bu-separator slot-drop-line"
						style:top="{drag.line}px"
						aria-hidden="true"
					></div>{/if}
			</nav>
			<!-- Outside the scrolling tabs, so it never scrolls away. -->
			<div class="slot-rail-footer">
				<button
					class="bu-action slot-tab slot-add"
					data-variant="rail"
					aria-label={t('slotsSheet.titleAddSlot')}
					aria-haspopup="dialog"
					title={t('slotsSheet.titleAddSlot')}
					onclick={addSlot}
					><Plus size={22} aria-hidden="true" /><span class="bu-rail-label"
						>{t('wardrobe.addSlot')}</span
					></button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.item-tile[data-tile] {
		user-select: none;
		-webkit-touch-callout: none;
	}

	.drag-item-caption {
		display: grid;
		min-inline-size: 0;
	}
	.drag-item-art {
		display: grid;
		place-items: center;
		inline-size: 48px;
		block-size: 48px;
		flex: none;
	}
</style>
