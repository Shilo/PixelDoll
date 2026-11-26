<script lang="ts" module>
	import type { DirectionName } from '../lib/store/manifest.ts';
	type Section = 'moves' | 'quality' | 'outfit' | 'about';
	/** Where the window was when it handed over to a sheet with a way back (Fix frames, Edit appearance), so coming back
	 *  shows the same move, facing, sections and scroll position instead of starting over. */
	let resume: {
		id: string;
		anim: string;
		dir: DirectionName;
		open: Record<Section, boolean>;
		scroll: number;
	} | null = null;
</script>

<script lang="ts">
	// Item details (docs/design/production-experience.md): what the item is, what it looks like, and one place per job.
	// Moves & States adds missing artwork, Quality reviews and fixes one view, Outfit sets layer order and hiding, About
	// says how it was made. Wear is the only footer action; the rest of the item's verbs live in the ⋮ menu, as on its tile.
	import { tick, untrack } from 'svelte';
	import { currentItemDrawing } from './settingsDefaults.svelte.ts';
	import { setPanelOpen } from './experience/state.svelte.ts';
	import { popoverFocus } from './experience/focus.ts';
	import Sheet from './Sheet.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { canEditItemAppearance } from './appearanceSource.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { displayMessage, displayNestedMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	import {
		displayDirection,
		displayDirectionInSentence,
		displayDirectionShort
	} from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { displayKey } from './displayKey.ts';
	import { coverageGaps, moveDirs } from '../lib/dress/dress.ts';
	import { hidesOf, oppositeHands, twoHanded } from '../lib/compose/compose.ts';
	import { SLOTS } from '../lib/items/items.ts';
	import {
		gapMoves,
		keepWithoutRefusal,
		itemPaletteRepairPlan,
		restorableViews,
		type ItemPaletteRepairPlan
	} from '../lib/items/run.ts';
	import {
		missingItemMoves,
		itemMoveOffer,
		moveMinimumTier,
		unposedItemMoves,
		type MoveSpec
	} from './create.ts';
	import { setupRedoMoves } from '../lib/rig/setup.ts';
	import { extendable } from './movePricing.ts';
	import { seeded, itemClipDrawn } from './itemGeneration.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { app } from '../lib/app.svelte.ts';
	import { accountTier, tierDecision } from '../lib/pixellab/plans.ts';
	import { downloadItemZip } from './download.svelte.ts';
	import TierNotice from './TierNotice.svelte';
	import PoseIssues from './PoseIssues.svelte';
	import GenerationDetails from './GenerationDetails.svelte';
	import { movePlan } from './apiPlans.ts';
	import ApiPeek from './ApiPeek.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Sprite from './Sprite.svelte';
	import SpritePreview, { type SpriteView } from './SpritePreview.svelte';
	import {
		HEALTH_LABEL,
		cropAll,
		healthOf,
		itemAcceptWaits,
		itemPreviewFrames,
		plainReasonMessage,
		qaReasonMessages,
		refitNotes,
		unfitText,
		uniqueBy
	} from './model.ts';
	import { defaultFrontOrder, slotLabelMessage } from './slots.ts';
	import {
		ui,
		doc,
		store,
		view,
		wear,
		toast,
		toggleHide,
		toggleTwoHanded,
		otherHandOf,
		itemHiders,
		showHiddenItem,
		showFrame,
		moveLayer,
		itemLayerNeighbors,
		placedOutfitCell,
		resetLayer,
		removeItem,
		isDemo,
		openNewItem,
		openRename,
		openAppearance,
		withKey,
		startMove,
		queueMoves,
		pendingMoves,
		moving,
		settingUp,
		matchItemPalette,
		acceptItemIssues,
		shared,
		copyFromSource,
		restoreFromDesign,
		openPendingWork,
		openFrames
	} from './state.svelte.ts';
	import {
		ArrowUp,
		ArrowDown,
		Check,
		ChevronRight,
		CircleCheck,
		Download,
		EllipsisVertical,
		EyeOff,
		Grid2x2,
		LoaderCircle,
		Maximize,
		Palette,
		Pencil,
		RefreshCw,
		RotateCcw,
		Sparkles,
		TriangleAlert,
		WandSparkles,
		Wrench
	} from './icons.ts';

	type Tone = 'warn' | 'ok' | 'neutral';

	let { id }: { id: string } = $props();
	const m = $derived(store.project?.manifest);
	const slotName = (key: string) => displayMessage(slotLabelMessage(m, key));
	const number = (value: number) =>
		formatNumber(value, { useGrouping: false, maximumFractionDigits: 20 });
	const formatList = (parts: (string | number)[]) => {
		const values = parts.map((part) => (typeof part === 'number' ? number(part) : part));
		return getLocale() === 'en' && values.length > 1
			? values.slice(0, -1).join(', ') + ' and ' + values.at(-1)
			: new Intl.ListFormat(getLocale()).format(values);
	};
	const directionName = (id: string) => {
		const direction = m?.rig.directions.find((entry) => entry.id === id);
		return direction ? displayDirectionInSentence(direction.id) : id;
	};
	const moveRefs = $derived(m?.rig.animations ?? []);
	const it = $derived(m?.items.find((i) => i.id === id));
	const on = $derived(!!it && doc.items[it.slot] === it.id && !doc.drafts[it.slot]);
	const health = $derived(m && it ? healthOf(m, it) : 'demo');

	// Details looks at its own move and facing, starting from the stage's: reviewing another view here leaves the outfit
	// the player was comparing on the stage as it was.
	const resumed = untrack(() => (resume?.id === id ? resume : null));
	resume = null;
	let scopeAnim = $state(resumed?.anim ?? untrack(() => ui.anim));
	let scopeDir = $state<DirectionName>(resumed?.dir ?? untrack(() => ui.dir));
	const anim = $derived(
		m?.rig.animations.find((a) => a.id === scopeAnim) ??
			m?.rig.animations.find((a) => a.id === ui.anim) ??
			m?.rig.animations[0]
	);
	const animId = $derived(anim?.id ?? ui.anim);
	const facing = $derived<DirectionName>(
		m?.rig.directions.some((direction) => direction.id === scopeDir)
			? scopeDir
			: (m?.rig.directions[0]?.id ?? ui.dir)
	);
	const sourceDir = $derived(m?.rig.directions.find((d) => d.id === facing)?.mirrorOf ?? facing);
	const moveName = $derived(displayMove(animId, moveRefs));
	const made = $derived(m ? moveDirs(m, animId) : []);

	// ---------- preview ----------
	// One shared crop across every frame and direction, rather than resizing the strip on each playback tick.
	const previews = $derived(view.project && it ? itemPreviewFrames(view.project, it, animId) : []);
	const frameIndex = $derived(previews.length ? ui.frame % previews.length : 0);
	const strip = $derived(previews[frameIndex] ?? []);
	/** Whether the item has its own (or mirrored) artwork in a direction and playback frame of the shown move. */
	const drawnAt = (direction: { id: DirectionName; mirrorOf?: DirectionName }, frame: number) => {
		const cell = anim?.frames[frame]?.cell;
		return (
			cell != null &&
			!!it?.layers.some((layer) => {
				const cells = layer.cells?.[animId];
				return !!(cells?.[direction.id] ?? cells?.[direction.mirrorOf ?? direction.id])?.[cell];
			})
		);
	};
	const directions = $derived(m?.rig.directions.filter((d) => made.includes(d.id)) ?? []);
	const k = $derived(
		strip.length
			? Math.max(1, Math.floor(Math.min(60 / strip[0].w, 64 / strip[0].h, 6) * ui.dpr))
			: 1
	);
	// Short landscape keeps the strip low so the sections start above the fold.
	const tile = $derived(ui.size === 'landscape' ? 40 : 64);
	/** Arrow keys move the facing choice (one Tab stop for the group), as in any radio group. */
	function facingKey(event: KeyboardEvent) {
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
		if (!step || !directions.length) return;
		event.preventDefault();
		const group = (event.currentTarget as HTMLElement).parentElement,
			at = directions.findIndex((direction) => direction.id === facing);
		scopeDir = directions[(at + step + directions.length) % directions.length].id;
		void tick().then(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
	}
	let viewer = $state.raw<{ views: SpriteView[]; view: number; frame: number } | null>(null);
	function openViewer(directionId: string, frame = frameIndex) {
		if (!m) return;
		const views = directions.map((direction) => ({
			id: direction.id,
			label: displayDirection(direction.id),
			short: displayDirectionShort(direction.id),
			frames: previews.map((row, index) =>
				drawnAt(direction, index) ? (row[m.rig.directions.indexOf(direction)] ?? null) : null
			)
		}));
		viewer = {
			views,
			view: Math.max(
				0,
				views.findIndex((entry) => entry.id === directionId)
			),
			frame
		};
	}

	// ---------- visibility ----------
	const hiders = $derived(it ? itemHiders(it.slot) : []);
	const hiddenNow = $derived(on && hiders.length > 0);

	// ---------- coverage and missing moves ----------
	const gaps = $derived(m && it ? coverageGaps(m, it) : []);
	const moveGaps = $derived(
		gaps.filter((g) => g.startsWith(`${animId}/`)).map((g) => g.split('/')[1])
	);
	const redo = $derived(setupRedoMoves(store.exportRecord));
	const offerTier = (offer: { specs: MoveSpec[] } | null) =>
		m ? Math.max(0, ...(offer?.specs ?? []).map((s) => moveMinimumTier(m, s))) : 0;
	const tierBlocked = (required: number) =>
		tierDecision(app.balance, { required }).kind === 'required';
	// Work already running for this item stays visible in the list instead of leaving a lower count with no explanation.
	const pendingMoveIds = $derived(
		m && it ? [...new Set(pendingMoves(doc.id, it.id).map((spec) => spec.id))] : []
	);
	const missingMoves = $derived.by(() => {
		if (!m || !it || isDemo()) return [];
		return missingItemMoves(m, it.id, currentItemDrawing(), 0, store.project?.images).filter(
			(spec) => !pendingMoveIds.includes(spec.id)
		);
	});
	// Moves whose views were all kept without poses get no offer; they are named so the player knows to make them again.
	const unposedMoves = $derived(
		m && it && !isDemo() ? unposedItemMoves(m, it.id, currentItemDrawing(), redo) : []
	);
	const moveOffers = $derived(
		m ? new Map(missingMoves.map((spec) => [spec.id, itemMoveOffer(m, [spec], redo)])) : new Map()
	);
	const eligible = $derived(
		missingMoves.filter((spec) => moveOffers.get(spec.id)?.gens != null).map((spec) => spec.id)
	);
	// The staged move starts picked when it is missing, else the first one: a selection never spends, and the button names
	// the total before anything is bought.
	let chosen = $state<string[] | null>(null);
	const selected = $derived(
		(chosen ?? (eligible.includes(ui.anim) ? [ui.anim] : eligible.slice(0, 1))).filter((id) =>
			eligible.includes(id)
		)
	);
	const selectedSpecs = $derived(missingMoves.filter((spec) => selected.includes(spec.id)));
	const missingOffer = $derived(
		m && selectedSpecs.length ? itemMoveOffer(m, selectedSpecs, redo) : null
	);
	const missingTier = $derived(offerTier(missingOffer));
	const perMoveGens = $derived(eligible.map((id) => Math.ceil(moveOffers.get(id)?.gens ?? 0)));
	// Per-move prices only say something when they differ; otherwise the total on the button is enough.
	const showMovePrices = $derived(new Set(perMoveGens).size > 1);
	function toggleMove(id: string, checked: boolean) {
		chosen = checked ? [...selected, id] : selected.filter((move) => move !== id);
	}
	function generateMoves() {
		if (!missingOffer?.specs.length || missingOffer.gens == null || tierBlocked(missingTier))
			return;
		const projectId = doc.id,
			specs = seeded($state.snapshot(missingOffer.specs));
		withKey(() => {
			void queueMoves(projectId, specs);
			ui.sheet = 'move';
		}, missingTier);
	}
	// Every move and State the body has, with the directions this item lacks there (same rules as clipMissingItems).
	const clips = $derived(
		m && it
			? playbackClips(m.rig.animations).flatMap(({ key }) => {
					const drawn = itemClipDrawn(m, it!.id, key);
					if (drawn == null) return [];
					const missing = gaps.filter((g) => g.startsWith(`${key}/`)).map((g) => g.split('/')[1]);
					return [
						{
							id: key,
							name: displayMove(key, moveRefs),
							drawn,
							missing,
							none: !drawn && missing.length >= moveDirs(m, key).length
						}
					];
				})
			: []
	);
	const incomplete = $derived(clips.filter((clip) => !clip.drawn).length);
	const freeFrames = $derived(it ? (shared.free[it.id] ?? 0) : 0);
	const copyOffer = $derived(!!freeFrames && !!it?.copiedFrom && !isDemo());
	// Standing views this item lacks that its own saved designs can fill for free, whatever move is shown.
	const restorable = $derived(
		m && it && !isDemo() ? restorableViews(m, it).map((key) => key.split('/')[1]) : []
	);
	// A copy without its own standing design cannot be extended to more moves: only an item made for this character can.
	const remakeOnly = $derived(!!m && !!it?.copiedFrom && !extendable(m, it.id));

	// ---------- quality and one-view fixes ----------
	const repairSpec = $derived(
		it &&
			anim &&
			it.route === 'skeleton-pose' &&
			it.key &&
			it.dressed?.[sourceDir] &&
			anim.sources?.[sourceDir]?.keypoints?.length === anim.cells
			? {
					id: anim.id,
					frames: anim.cells,
					items: [it.id],
					dirs: [sourceDir],
					itemMethod: 'grid' as const,
					preferTierOneRepair: (accountTier(app.balance) ?? 1) < 2 ? (true as const) : undefined,
					itemsOnly: true as const,
					seed: 0
				}
			: null
	);
	const repairOffer = $derived(m && repairSpec ? itemMoveOffer(m, [repairSpec], redo) : null);
	const redrawOffer = $derived(
		m && repairSpec
			? itemMoveOffer(
					m,
					[{ ...repairSpec, preferTierOneRepair: undefined, redrawItem: true }],
					redo
				)
			: null
	);
	// Fixing a facing that others mirror updates those too.
	const mirrored = $derived(
		!isDemo() && !!repairSpec && !!m?.rig.directions.some((d) => d.mirrorOf === sourceDir)
	);
	const fixChoices = $derived(
		[
			{
				id: 'repair',
				icon: Wrench,
				label: t('itemPane.repairView'),
				feature: t('itemPane.repairFeature'),
				offer: repairOffer,
				help: t('itemPane.repairHelp')
			},
			{
				id: 'redraw',
				icon: WandSparkles,
				label: t('itemPane.redrawView'),
				feature: t('itemPane.redrawFeature'),
				offer: redrawOffer,
				help: t('itemPane.redrawHelp')
			}
		].map((choice) => {
			const spec = choice.offer?.specs[0],
				requests =
					m && spec
						? movePlan({ manifest: m }, spec).filter((call) => call.method === 'POST').length
						: 0,
				repairGens = repairOffer?.gens,
				redrawGens = redrawOffer?.gens;
			// Several requests, and how the redraw compares with the repair, are said before anything is bought.
			const notes = [
				choice.help,
				requests > 1
					? t(choice.id === 'repair' ? 'itemPane.repairRequests' : 'itemPane.redrawRequests', {
							count: requests,
							n: number(requests)
						})
					: '',
				choice.id === 'redraw' &&
				repairGens != null &&
				redrawGens != null &&
				redrawGens !== repairGens
					? t(redrawGens < repairGens ? 'itemPane.redrawSaves' : 'itemPane.redrawCostsMore', {
							count: Math.abs(Math.ceil(repairGens) - Math.ceil(redrawGens)),
							n: number(Math.abs(Math.ceil(repairGens) - Math.ceil(redrawGens)))
						})
					: ''
			];
			return { ...choice, help: notes.filter(Boolean).join(' '), tier: offerTier(choice.offer) };
		})
	);
	const repairBusy = $derived(
		(!!moving.spec && !moving.done) || (!!settingUp.spec && !settingUp.done)
	);
	// Free local accepts wait only for work on this character that involves this item (itemAcceptWaits).
	const acceptWaits = $derived(!!it && itemAcceptWaits(it.id, doc.id, moving, settingUp));
	function repairFrames(offer: typeof repairOffer, tier: number) {
		if (!offer?.specs[0]) return;
		const projectId = doc.id,
			spec = {
				...$state.snapshot(offer.specs[0]),
				seed: 1 + Math.floor(Math.random() * 1_000_000)
			};
		withKey(() => {
			void startMove(projectId, spec);
			ui.sheet = 'move';
		}, tier);
	}
	let colorPlan = $state<ItemPaletteRepairPlan | null>(null);
	let colorBusy = $state(false);
	let colorError = $state<Message | string>('');
	let colorDone = $state<{ pixels: number; frames: number }>();
	const colorScope = $derived(`${doc.id}|${it?.id ?? ''}|${animId}|${sourceDir}`);
	$effect(() => {
		void colorScope;
		colorError = '';
		colorDone = undefined;
	});
	$effect(() => {
		const projectId = doc.id,
			itemId = it?.id,
			clip = anim?.id,
			dir = sourceDir;
		void doc.rev;
		let current = true;
		colorPlan = null;
		if (!isDemo() && itemId && clip)
			void itemPaletteRepairPlan(projectId, itemId, clip, dir)
				.then((plan) => {
					if (current) colorPlan = plan;
				})
				.catch(() => {});
		return () => {
			current = false;
		};
	});
	async function matchColors() {
		if (!colorPlan || !it || !anim || colorBusy) return;
		const projectId = doc.id,
			itemId = it.id,
			clip = anim.id,
			dir = sourceDir,
			reviewed = $state.snapshot(colorPlan);
		const sameView = () =>
			doc.id === projectId && it?.id === itemId && anim?.id === clip && sourceDir === dir;
		colorBusy = true;
		colorError = '';
		colorDone = undefined;
		try {
			await matchItemPalette(projectId, itemId, clip, dir, reviewed);
			if (sameView())
				colorDone = { pixels: reviewed.changedPixels, frames: reviewed.changedFrames.length };
		} catch (e) {
			if (sameView()) colorError = errorMessage(e);
		} finally {
			colorBusy = false;
		}
	}
	// The pending-work notice explains a disabled action, so it shows only while one it covers is actually waiting.
	const pendingBlocks = $derived(
		(repairBusy && (!!repairSpec || !!colorPlan)) ||
			(acceptWaits && (it?.qa?.status === 'warn' || it?.qa?.status === 'fail'))
	);
	const designReasons = $derived(
		uniqueBy(
			(it?.designWarnings ?? []).flatMap((reason) => reason.split('; ')).map(plainReasonMessage),
			displayMessage
		).map(displayMessage)
	);
	const notes = $derived(
		m && it ? refitNotes(m, it, t, { direction: directionName, list: formatList }) : []
	);
	// A re-fit's checks were measured on the source body; its fit notes replace them. An unfitted copy keeps its source's
	// pixels, so the source's findings (a grip in the wrong hand) still describe them.
	const reasons = $derived(
		it?.qa && !it.refit
			? qaReasonMessages(
					it.qa,
					SLOTS.find((s) => s.id === it.slot)?.class === 'held',
					it.route === 'skeleton-pose' && it,
					m?.rig
				).map(displayMessage)
			: []
	);
	const findings = $derived(
		(health === 'look' || health === 'unfitted' || health === 'accepted') && reasons.length
	);
	// A re-fit's issues are its fit, which only a new item for this body fixes: nothing to accept.
	const canAccept = $derived(
		!isDemo() &&
			!!it &&
			!it.refit &&
			!it.unfitted &&
			health === 'look' &&
			(it.qa?.status === 'warn' || it.qa?.status === 'fail')
	);
	let acceptingIssues = $state(false);
	let acceptanceError = $state<Message | string>('');
	// The moves an item with checks to accept is missing frames in: it can be kept without them, never with partial frames.
	const keepWithout = $derived(m && it ? gapMoves(m, it) : []);
	// Never without the move the item is designed or anchored from: those gaps take the paid redraw.
	const keepRefusal = $derived(m && it ? keepWithoutRefusal(m, it, keepWithout) : undefined);
	async function acceptIssues(withoutGaps = false) {
		if (!it || acceptingIssues) return;
		const projectId = doc.id,
			itemId = it.id,
			reviewed = $state.snapshot(it),
			without = withoutGaps ? [...keepWithout] : undefined;
		acceptingIssues = true;
		acceptanceError = '';
		try {
			await acceptItemIssues(projectId, itemId, reviewed, without);
		} catch (error) {
			if (doc.id === projectId && it?.id === itemId) acceptanceError = errorMessage(error);
		} finally {
			acceptingIssues = false;
		}
	}
	const hasFixTools = $derived(!isDemo() && (!!repairSpec || !!colorPlan));
	const hasQuality = $derived(
		!!designReasons.length || !!findings || !!notes.length || canAccept || health === 'accepted'
	);

	// ---------- outfit: layer order and hiding ----------
	const ladder = $derived(m && it ? defaultFrontOrder(m, it) : []);
	const customOrder = $derived.by(() => {
		void doc.rev;
		return (
			JSON.stringify(
				m?.slots
					.find((slot) => slot.id === it?.slot)
					?.zOverrides?.filter((rule) => rule.layer === 'fg') ?? []
			) !== JSON.stringify(ladder)
		);
	});
	let onlyDir = $state(false);
	const neighbors = $derived(it ? itemLayerNeighbors(it.id, animId, facing, onlyDir) : null);
	// The outfit preview shows the frame where the last step made a difference, else the first one.
	let witness = $state(0);
	$effect(() => {
		void animId;
		void facing;
		witness = 0;
	});
	const outfitCell = $derived.by(() => {
		void doc.rev;
		const cell = it ? placedOutfitCell(it.id, witness, animId, facing) : null;
		// Cropped to the outfit so a small sprite in a large frame still reads.
		return cell ? (cropAll([cell])[0] ?? cell) : null;
	});
	const outfitK = $derived(
		outfitCell
			? Math.max(1, Math.floor(Math.min(112 / outfitCell.w, 112 / outfitCell.h, 4) * ui.dpr))
			: 1
	);
	const layerName = (entry?: { name: string; slot: string; back: boolean; itemId: string }) => {
		if (!entry || !m) return '';
		const twin = equippedNames.filter((name) => name === entry.name).length > 1;
		const name = twin
			? t('itemPane.layerWithSlot', { name: entry.name, slot: slotName(entry.slot) })
			: entry.name;
		return entry.back ? t('itemPane.layerBack', { name }) : name;
	};
	const equippedNames = $derived(
		m ? Object.values(doc.items).flatMap((id) => m.items.find((x) => x.id === id)?.name ?? []) : []
	);
	let forwardButton = $state<HTMLButtonElement>();
	let backwardButton = $state<HTMLButtonElement>();
	let wearButton = $state<HTMLButtonElement>();
	async function stepLayer(step: 1 | -1) {
		if (!it) return;
		const shown = moveLayer(it.id, step, onlyDir, animId, facing);
		if (shown != null) witness = shown;
		await tick();
		// Keep the keyboard on a usable layer control when a step reaches an end.
		const moved = step > 0 ? forwardButton : backwardButton;
		if (moved?.disabled) {
			const other = step > 0 ? backwardButton : forwardButton;
			(other && !other.disabled ? other : wearButton)?.focus({ preventScroll: true });
		}
	}
	async function resetOrder() {
		if (!it) return;
		resetLayer(it.id, ladder);
		witness = 0;
		await tick();
		(forwardButton && !forwardButton.disabled
			? forwardButton
			: backwardButton && !backwardButton.disabled
				? backwardButton
				: wearButton
		)?.focus({ preventScroll: true });
	}
	const otherHand = $derived(m && it ? otherHandOf(m, it.slot) : undefined);
	const oppositeSlots = $derived(m && it && otherHand ? oppositeHands(m, it.slot) : []);
	const others = $derived(
		m && it
			? m.slots
					.filter(
						(s) => s.id !== 'body' && s.id !== it.slot && m.items.some((x) => x.slot === s.id)
					)
					.map((slot) => slot.id)
			: []
	);
	// Two-handed equipment excludes the whole opposite hand, including custom categories assigned to it.
	const hideChoices = $derived([
		...others.filter((slot) => !oppositeSlots.includes(slot)),
		...(otherHand && others.some((slot) => oppositeSlots.includes(slot)) ? [otherHand] : [])
	]);
	// The project manifest is raw state: an edit to an item's or slot's fields is announced by `bump()` through doc.rev.
	const hides = $derived.by(() => {
		void doc.rev;
		return m && it ? hidesOf(m, it) : [];
	});
	const hideCount = $derived(
		hideChoices.filter((slot) =>
			slot === otherHand && m && it ? twoHanded(m, it) : hides.includes(slot)
		).length
	);
	const tucks = $derived.by(() => {
		void doc.rev;
		return it
			? (m?.slots.find((s) => s.id === it.slot)?.clips ?? []).filter(
					(s) => others.includes(s) && !hides.includes(s)
				)
			: [];
	});

	// ---------- header ----------
	const generating = $derived(pendingMoveIds.length > 0);
	// One status, most urgent first: fit, review, running work, missing artwork, then the settled states.
	const status = $derived.by((): { label: string; tone: Tone } | null => {
		if (health === 'unfitted')
			return { label: displayMessage(HEALTH_LABEL.unfitted), tone: 'warn' };
		if (health === 'look') return { label: displayMessage(HEALTH_LABEL.look), tone: 'warn' };
		if (generating) return { label: t('itemPane.statusGenerating'), tone: 'neutral' };
		if (health === 'stale') return { label: displayMessage(HEALTH_LABEL.stale), tone: 'warn' };
		if (incomplete) return { label: t('itemPane.statusIncomplete'), tone: 'warn' };
		if (health === 'demo') return null;
		return {
			label: displayMessage(HEALTH_LABEL[health]),
			tone: health === 'clean' ? 'ok' : 'neutral'
		};
	});

	// ---------- sections ----------
	let open = $state<Record<Section, boolean>>(
		resumed?.open ??
			untrack(() => ({
				moves: (!strip.length && missingMoves.length > 0) || restorable.length > 0 || copyOffer,
				quality: health === 'look',
				outfit: false,
				about: false
			}))
	);
	const sections = $state<Partial<Record<Section, HTMLDetailsElement>>>({});
	let body = $state<HTMLElement>();
	const scroller = () => body?.closest<HTMLElement>('.sheet-body');
	$effect(() => {
		if (resumed && body) scroller()?.scrollTo({ top: resumed.scroll });
	});
	/** Hand over to a sheet that comes back here, remembering where the window was. */
	function leaveFor(go: () => void) {
		resume = {
			id,
			anim: animId,
			dir: facing,
			open: $state.snapshot(open),
			scroll: scroller()?.scrollTop ?? 0
		};
		go();
	}
	async function reveal(section: Section) {
		open[section] = true;
		await tick();
		const element = sections[section];
		element?.scrollIntoView({ block: 'start', behavior: 'smooth' });
		element?.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
	}
	// One callout for a consequence the header and sections do not already say (failed checks open Quality instead), with a
	// link to where it is handled.
	const callout = $derived.by(
		(): {
			text: string;
			tone: 'warn' | 'info';
			action?: { label: string; run: () => void };
		} | null => {
			if (!m || !it) return null;
			if (it.unfitted) {
				// The New item sheet that opens prices the remake before anything is spent; without it, the text says what to do.
				const remake = !isDemo() && !!it.prompt;
				return {
					tone: 'warn',
					text:
						unfitText(m, it.copiedFrom?.name ?? t('studioModel.anotherCharacter'), it.unfitted, t) +
						(isDemo() || remake ? '' : ' ' + t('itemPane.remakeToFit', { name: m.name })),
					action: remake
						? {
								label: openerLabel(t('itemMenu.remake', { name: m.name })),
								run: () =>
									openNewItem(it.slot, { slot: it.slot, prompt: it.prompt, route: it.route })
							}
						: undefined
				};
			}
			if (moveGaps.length)
				return {
					tone: 'warn',
					text:
						t('itemPane.moveGaps', {
							move: moveName,
							directions: formatList(moveGaps.map(directionName))
						}) +
						(remakeOnly && !isDemo() && !freeFrames
							? ' ' + t('itemPane.remakeAllMoves', { name: m.name })
							: ''),
					action: isDemo()
						? undefined
						: { label: t('itemPane.reviewMissingMoves'), run: () => void reveal('moves') }
				};
			if (health === 'stale') return { tone: 'warn', text: t('itemPane.staleNote') };
			return null;
		}
	);

	// ---------- menu ----------
	// One id serves the menu and, as a prefix, the tool rows' label and description ids.
	const menuId = $props.id(),
		uid = menuId;
	let menu = $state<HTMLElement>();
	let confirmRemove = $state(false);
	// Only worn items (and the body) have a section in the Colors tab.
	const recolorable = $derived(!!m && !!it && on && m.materials.some((x) => x.owner === it.id));
	function act(fn: () => void) {
		menu?.hidePopover();
		fn();
	}
	function recolor() {
		if (!it) return;
		ui.colorsFocus = it.id;
		ui.tab = 'colors';
		setPanelOpen(true);
		ui.sheet = null;
	}
</script>

{#snippet sectionSummary(label: string, state?: { text: string; tone: Tone })}
	<summary>
		<ChevronRight size={16} aria-hidden="true" />
		<h3 class="section-name">{label}</h3>
		{#if state}<span class="section-state" data-tone={state.tone}
				>{#if state.tone === 'warn'}<TriangleAlert
						size={13}
						aria-hidden="true"
					/>{:else if state.tone === 'ok'}<Check
						size={13}
						aria-hidden="true"
					/>{/if}{state.text}</span
			>{/if}
	</summary>
{/snippet}

{#snippet toolRow(tool: {
	id: string;
	icon: typeof Wrench;
	label: string;
	detail: string;
	aside: string;
	paid?: boolean;
	disabled?: boolean;
	describedby?: string;
	opens?: boolean;
	onclick: () => void;
})}
	<button
		class="tool-row bu-action"
		data-variant="quiet"
		disabled={tool.disabled}
		aria-labelledby="{uid}-{tool.id}-label"
		aria-describedby={[tool.describedby, `${uid}-${tool.id}-detail`, `${uid}-${tool.id}-aside`]
			.filter(Boolean)
			.join(' ')}
		aria-haspopup={tool.opens ? 'dialog' : undefined}
		onclick={tool.onclick}
	>
		<tool.icon size={18} aria-hidden="true" />
		<span class="tool-text"
			><span class="tool-label" id="{uid}-{tool.id}-label">{tool.label}</span><span
				class="tool-detail"
				id="{uid}-{tool.id}-detail">{tool.detail}</span
			></span
		>
		<span class="tool-aside" id="{uid}-{tool.id}-aside" data-paid={tool.paid || undefined}
			>{tool.aside}</span
		>
		{#if tool.opens}<SurfaceChevron />{/if}
	</button>
{/snippet}

<Sheet
	title={it?.name ?? t('studio.titleItem')}
	className="item-detail"
	onclose={() => (ui.sheet = null)}
>
	{#snippet heading()}
		{#if it}
			<span class="item-slot">{slotName(it.slot)}</span>
			{#if status}<span class="item-status" data-tone={status.tone}
					>{#if status.tone === 'warn'}<TriangleAlert
							size={12}
							aria-hidden="true"
						/>{:else if status.tone === 'ok'}<CircleCheck
							size={12}
							aria-hidden="true"
						/>{:else if generating}<LoaderCircle
							size={12}
							aria-hidden="true"
						/>{/if}{status.label}</span
				>{/if}
		{/if}
	{/snippet}
	{#snippet tools()}
		{#if it}
			<button
				class="bu-action btn plain icon"
				data-variant="quiet"
				popovertarget={menuId}
				aria-haspopup="menu"
				aria-label={t('itemPane.itemActions')}
				title={t('itemPane.itemActions')}><EllipsisVertical size={20} aria-hidden="true" /></button
			>
		{/if}
	{/snippet}
	{#snippet footer()}
		{#if it}
			<button
				bind:this={wearButton}
				class="bu-action btn item-wear"
				data-variant={on ? 'outline' : 'primary'}
				data-item-wear-toggle
				onclick={() => wear(it!.id)}
			>
				{on ? t('common.takeOff') : t('common.wear')}
			</button>
		{/if}
	{/snippet}
	{#snippet developer()}
		<ApiPeek
			targets={[
				...(m && it && !copyOffer && missingOffer
					? [
							{
								scope: 'item-missing-move',
								label: t('itemPane.drawForMoves'),
								plan: missingOffer.specs.flatMap((spec) => movePlan({ manifest: m }, spec))
							}
						]
					: []),
				...(!isDemo() && repairSpec
					? [
							{
								scope: 'item-repair',
								label: t('itemPane.repairView'),
								plan:
									repairOffer?.specs[0] && m ? movePlan({ manifest: m }, repairOffer.specs[0]) : []
							},
							{
								scope: 'item-redraw',
								label: t('itemPane.redrawView'),
								plan:
									redrawOffer?.specs[0] && m ? movePlan({ manifest: m }, redrawOffer.specs[0]) : []
							}
						]
					: [])
			]}
			copyId={it?.id}
		/>
	{/snippet}

	{#if m && it && view.project}
		<div class="item-body" bind:this={body}>
			<!-- Preview: every facing of the chosen move; any view opens full size. -->
			<section
				class="item-preview"
				aria-label={t('itemPane.availableDirectionsFor', { name: it.name })}
			>
				<div class="preview-bar">
					<label class="preview-move">
						<span class="sr">{t('itemPane.previewMove')}</span>
						<select
							class="bu-input input"
							value={animId}
							onchange={(event) => (scopeAnim = event.currentTarget.value)}
						>
							{#each playbackClips(m.rig.animations) as clip (clip.key)}
								<option value={clip.key}>{displayMove(clip.key, moveRefs)}</option>
							{/each}
						</select>
					</label>
					{#if directions.length > 1}
						<!-- The facing the window reviews, fixes and orders layers in; the tiles below open any facing full size. -->
						<div class="facing" role="radiogroup" aria-label={t('itemPane.facing')}>
							{#each directions as direction (direction.id)}
								<button
									class="bu-action facing-choice"
									data-variant="quiet"
									role="radio"
									aria-checked={direction.id === facing}
									aria-label={displayDirection(direction.id)}
									title={displayDirection(direction.id)}
									tabindex={direction.id === facing ? 0 : -1}
									onclick={() => (scopeDir = direction.id)}
									onkeydown={facingKey}>{displayDirectionShort(direction.id)}</button
								>
							{/each}
						</div>
					{/if}
				</div>
				<div
					class="item-views"
					style:--cols={Math.min(4, directions.length || 1)}
					style:--tile="{tile}px"
				>
					{#each directions as direction (direction.id)}
						{@const has = drawnAt(direction, frameIndex)}
						{@const image = strip[m.rig.directions.indexOf(direction)]}
						{@const label = t('itemPane.labelNameFacingId', {
							name: it.name,
							id: displayDirection(direction.id)
						})}
						<button
							class="item-view bu-action"
							data-variant="quiet"
							data-missing={!has || undefined}
							data-current={direction.id === facing || undefined}
							aria-haspopup="dialog"
							aria-label={has
								? t('itemPane.openSprite', { title: label })
								: t('itemPane.openMissingView', { direction: displayDirection(direction.id) })}
							onclick={() => openViewer(direction.id)}
						>
							<span class="view-art" aria-hidden="true">
								{#if has && image}<Sprite img={image} {k} limit={tile} {label} />{:else}<span
										class="view-missing">{t('itemPane.missingView')}</span
									>{/if}
							</span>
							<span class="view-caption">{displayDirection(direction.id)}</span>
							<span class="view-enlarge" aria-hidden="true"><Maximize size={12} /></span>
						</button>
					{/each}
					{#if !directions.length}<p class="muted small preview-empty">
							{t('itemPane.previewUnavailable')}
						</p>{/if}
				</div>
			</section>

			{#if hiders.length}
				<div class="hidden-row">
					<EyeOff size={16} aria-hidden="true" />
					<span
						>{hiddenNow
							? t('itemPane.hiddenByItem', { name: formatList(hiders.map((hider) => hider.name)) })
							: t('itemPane.hiddenWhenWorn', {
									names: formatList(hiders.map((hider) => hider.name))
								})}</span
					>
					{#if hiddenNow}<button
							class="bu-action btn plain"
							data-variant="quiet"
							onclick={() => {
								showHiddenItem(it.slot);
								// The row goes away: keep the keyboard in the body, on where hiding is set.
								sections.outfit?.querySelector<HTMLElement>('summary')?.focus();
							}}
							>{t('itemPane.stopHiding', {
								names: formatList(hiders.map((hider) => hider.name))
							})}</button
						>{/if}
				</div>
			{/if}

			{#if callout}
				<p class="notice small item-callout" class:warn={callout.tone === 'warn'} role="status">
					<span>{callout.text}</span>
					{#if callout.action}
						{@const action = callout.action}
						<button
							class="bu-action btn plain callout-link"
							data-variant="quiet"
							onclick={() => action.run()}>{action.label}</button
						>
					{/if}
				</p>
			{/if}
			{#if !isDemo() && pendingBlocks}
				<p class="notice small" role="status">
					{t('itemPane.pendingWorkBusy')}
					<button
						class="bu-action btn plain callout-link"
						data-variant="quiet"
						onclick={() => void openPendingWork({ flows: true })}
						>{openerLabel(t('deleteSheet.viewPendingWork'))}<SurfaceChevron /></button
					>
				</p>
			{/if}

			<div class="item-sections">
				<!-- Moves & States: what artwork the item has, and adding what it lacks. -->
				{#if clips.length}
					<details class="item-section" bind:this={sections.moves} bind:open={open.moves}>
						{@render sectionSummary(
							t('itemPane.movesSection'),
							generating
								? { text: t('itemPane.statusGenerating'), tone: 'neutral' }
								: incomplete
									? {
											text: t('itemPane.clipsIncomplete', {
												count: incomplete,
												n: number(incomplete)
											}),
											tone: 'warn'
										}
									: { text: t('itemPane.complete'), tone: 'ok' }
						)}
						<div class="section-body">
							{#if restorable.length || copyOffer}
								<div class="tool-list">
									{#if restorable.length}{@render toolRow({
											id: 'restore',
											icon: RotateCcw,
											label: t('itemPane.restoreStanding', { count: restorable.length }),
											detail: t('itemPane.restoreStandingHint', {
												count: restorable.length,
												directions: formatList(restorable.map(directionName))
											}),
											aside: t('common.free'),
											disabled: !!shared.adding,
											onclick: () => restoreFromDesign(it.id)
										})}{/if}
									{#if copyOffer && it.copiedFrom}{@render toolRow({
											id: 'copy',
											icon: RotateCcw,
											label: t('itemPane.copyFrom', { name: it.copiedFrom.name }),
											detail: t('itemPane.copyFrames', {
												from: it.copiedFrom.name,
												name: m.name,
												count: freeFrames,
												n: number(freeFrames)
											}),
											aside: t('common.free'),
											disabled: !!shared.adding,
											onclick: () => copyFromSource(it.id)
										})}{/if}
								</div>
							{/if}
							{#each unposedMoves as { note }, i (i)}<p class="notice warn small">
									{displayNestedMessage(note)}
								</p>{/each}
							<fieldset class="clip-list">
								<legend class="sr">{t('itemPane.movesSection')}</legend>
								{#if eligible.length > 2 && !copyOffer}
									{@const all = eligible.every((id) => selected.includes(id))}
									<button
										type="button"
										class="bu-action btn plain select-all"
										data-variant="quiet"
										onclick={() => (chosen = all ? [] : [...eligible])}
										>{t(all ? 'itemPane.clearSelection' : 'itemPane.selectAllMoves')}</button
									>
								{/if}
								{#each clips as clip (clip.id)}
									{@const offer = moveOffers.get(clip.id)}
									{@const pickable = !copyOffer && eligible.includes(clip.id)}
									{@const pending = pendingMoveIds.includes(clip.id)}
									{@const detail = pending
										? t('activity.inProgress')
										: clip.drawn
											? ''
											: clip.none
												? t('itemPane.clipNoFrames')
												: t('itemPane.clipMissingViews', {
														directions: formatList(clip.missing.map(directionName))
													})}
									{#if pickable}
										<label class="clip-row bu-check" data-missing>
											<input
												type="checkbox"
												checked={selected.includes(clip.id)}
												onchange={(event) => toggleMove(clip.id, event.currentTarget.checked)}
											/>
											<span class="clip-text"
												><span>{clip.name}</span><small>{detail}</small>{#if offer?.error}<small
														>{displayMessage(offer.error)}</small
													>{/if}</span
											>
											{#if showMovePrices && offer?.gens != null}<span class="clip-aside"
													>{t('moves.estimate', { gens: number(Math.ceil(offer.gens)) })}</span
												>{/if}
										</label>
									{:else}
										<div class="clip-row" data-missing={!clip.drawn || undefined}>
											<span class="clip-mark" aria-hidden="true"
												>{#if pending}<LoaderCircle size={16} />{:else if clip.drawn}<Check
														size={16}
														strokeWidth={2.5}
													/>{:else}<TriangleAlert size={16} />{/if}</span
											>
											<span class="clip-text"
												><span>{clip.name}</span>{#if detail}<small>{detail}</small>{/if}</span
											>
										</div>
									{/if}
								{/each}
							</fieldset>
							{#if eligible.length && !copyOffer}
								{#if missingOffer?.error}<p class="notice warn small" role="status">
										{displayMessage(missingOffer.error)}
									</p>{/if}
								{#each missingOffer?.unposed ?? [] as note, i (i)}
									<p class="notice warn small">{displayNestedMessage(note)}</p>
								{/each}
								<PoseIssues issues={missingOffer?.poseIssues ?? []} />
								{#if missingTier}<TierNotice
										id="item-missing-tier"
										minimumTier={missingTier}
										feature={t('itemPane.makingMoreMoves')}
									/>{/if}
								<div class="paid-action">
									<p class="muted small" id="item-missing-help">
										{selected.length ? t('itemPane.drawMovesHelp') : t('itemPane.drawMovesSelect')}
									</p>
									<button
										class="bu-action btn"
										data-variant="primary"
										disabled={missingOffer?.gens == null || tierBlocked(missingTier)}
										aria-describedby={tierBlocked(missingTier)
											? 'item-missing-tier'
											: 'item-missing-help'}
										onclick={generateMoves}
									>
										{selected.length
											? t('itemPane.generateMoves', {
													count: selected.length,
													n: number(selected.length)
												})
											: t('itemPane.generateMovesNone')}
										{#if missingOffer?.gens != null}<span class="cost"
												>{t('moves.estimate', { gens: number(Math.ceil(missingOffer.gens)) })}</span
											>{/if}
									</button>
								</div>
							{/if}
						</div>
					</details>
				{/if}

				<!-- Quality: what the checks found, accepting it, and fixing one view. -->
				{#if hasQuality || hasFixTools || !isDemo()}
					<details class="item-section" bind:this={sections.quality} bind:open={open.quality}>
						{@render sectionSummary(
							t('itemPane.qualitySection'),
							health === 'look' || health === 'unfitted'
								? { text: displayMessage(HEALTH_LABEL[health]), tone: 'warn' }
								: health === 'accepted'
									? { text: displayMessage(HEALTH_LABEL.accepted), tone: 'neutral' }
									: it.qa?.status === 'pass'
										? { text: t('itemPane.passed'), tone: 'ok' }
										: undefined
						)}
						<div class="section-body">
							{#if designReasons.length && !it.refit}
								<div class="finding-group">
									<h4>{t('itemPane.acceptedAppearanceWarnings')}</h4>
									<ul class="findings">
										{#each designReasons as reason (reason)}<li>
												<TriangleAlert size={14} aria-hidden="true" />{reason}
											</li>{/each}
									</ul>
								</div>
							{/if}
							{#if findings}
								<ul class="findings">
									{#each reasons as reason (reason)}<li>
											<TriangleAlert size={14} aria-hidden="true" />{reason}
										</li>{/each}
								</ul>
							{/if}
							{#if notes.length}
								<div class="finding-group">
									<p class="small" id="refit-{it.id}">
										{t('itemPane.refitIntro', {
											from: it.copiedFrom?.name ?? t('studioModel.anotherCharacter')
										})}
									</p>
									<ul class="findings" aria-labelledby="refit-{it.id}">
										{#each notes as note (note.text)}<li>
												<button
													class="bu-action btn plain finding-link"
													data-variant="quiet"
													title={t('itemPane.titleShowThisFrame')}
													onclick={() => {
														// A fit is judged on the body: show the frame on the stage, which the sheet covers.
														showFrame(note.anim, note.dir, note.frame);
														ui.sheet = null;
													}}><TriangleAlert size={14} aria-hidden="true" />{note.text}</button
												>
											</li>{/each}
									</ul>
								</div>
							{/if}
							{#if !isDemo() && it.prompt && !it.unfitted && (it.refit || remakeOnly)}
								<!-- A re-fit's issues are its fit: a new item for this body fixes them, priced in the sheet that opens. -->
								<div class="tool-list">
									{@render toolRow({
										id: 'remake',
										icon: RefreshCw,
										label: openerLabel(t('itemMenu.remake', { name: m.name })),
										detail: t('itemPane.remakeAllMoves', { name: m.name }),
										aside: '',
										opens: true,
										onclick: () =>
											openNewItem(it.slot, { slot: it.slot, prompt: it.prompt, route: it.route })
									})}
								</div>
							{/if}
							{#if canAccept}
								<div class="accept">
									{#if gaps.length && keepRefusal}
										<!-- Says why it cannot be kept as it is: the missing frames are the way on. -->
										<p class="small">
											{displayMessage(errorMessage(keepRefusal))}
											<button
												class="bu-action btn plain callout-link"
												data-variant="quiet"
												onclick={() => void reveal('moves')}
												>{t('itemPane.reviewMissingMoves')}</button
											>
										</p>
									{:else}
										<p class="faint small">{t('itemPane.checksFoundIssuesNoPaidRetryWas')}</p>
										<div class="tool-list">
											{@render toolRow({
												id: 'accept',
												icon: Check,
												label: gaps.length
													? t('itemPane.keepWithoutNamed', {
															moves: formatList(
																keepWithout.map((move) => displayMove(move, moveRefs))
															)
														})
													: t('itemPane.acceptAsIs'),
												detail: gaps.length
													? t('itemPane.keepWithoutMovesDetail', {
															moves: formatList(
																keepWithout.map((move) => displayMove(move, moveRefs))
															)
														})
													: t('itemPane.acceptsTheCurrentArtworkWithoutSpendingCredits'),
												aside: t('common.free'),
												disabled: acceptingIssues || acceptWaits,
												onclick: () => void acceptIssues(!!gaps.length)
											})}
										</div>
									{/if}
									{#if acceptanceError}<p class="notice bad small" role="alert">
											{displayMessage(acceptanceError)}<ReportButton error={acceptanceError} />
										</p>{/if}
								</div>
							{:else if health === 'accepted'}
								<p class="muted small">{t('itemPane.youAcceptedThisArtworkWithItsRecorded')}</p>
							{:else if !hasQuality && it.qa?.status === 'pass'}
								<p class="muted small">{t('itemPane.checksPassed')}</p>
							{/if}

							<div class="fix-view">
								<h4>
									{t('itemPane.fixViewTitle', { move: moveName, direction: directionName(facing) })}
								</h4>
								<!-- The heading names the view; a mirrored facing also updates the facings drawn from it. -->
								{#if mirrored}<p class="faint small" id="item-fix-scope">
										{t('itemPane.updateNoteMirrors', {
											move: moveName,
											direction: directionName(sourceDir)
										})}
									</p>{/if}
								<!-- Free first: the item's own colors and hand edits, then the paid redraws of this view. -->
								<div class="tool-list">
									{#if !isDemo() && colorPlan}{@render toolRow({
											id: 'match',
											icon: Palette,
											label: colorBusy
												? t('itemPane.matchingColors')
												: t('itemPane.matchItemColors'),
											detail: t('itemPane.matchColorsDetail', {
												pixels: t('itemPane.pixels', {
													count: colorPlan.changedPixels,
													n: number(colorPlan.changedPixels)
												}),
												frames: t('itemPane.frames', {
													count: colorPlan.changedFrames.length,
													n: number(colorPlan.changedFrames.length)
												})
											}),
											aside: t('common.free'),
											disabled: colorBusy || repairBusy,
											onclick: () => void matchColors()
										})}{/if}
									{@render toolRow({
										id: 'frames',
										icon: Grid2x2,
										label: t('fixFrames.open'),
										detail: t('itemPane.fixFramesDetail'),
										aside: t('common.free'),
										opens: true,
										onclick: () => leaveFor(() => openFrames(it.id, animId, 'item'))
									})}
									{#if !isDemo() && repairSpec}
										{#each fixChoices as choice (choice.id)}
											{@render toolRow({
												id: choice.id,
												icon: choice.icon,
												label: choice.label,
												detail: choice.help,
												aside:
													choice.offer?.gens == null
														? t('common.unavailable')
														: t('moves.estimate', { gens: number(Math.ceil(choice.offer.gens)) }),
												paid: true,
												disabled:
													repairBusy || choice.offer?.gens == null || tierBlocked(choice.tier),
												describedby: tierBlocked(choice.tier)
													? `item-${choice.id}-tier`
													: mirrored
														? 'item-fix-scope'
														: undefined,
												onclick: () => repairFrames(choice.offer, choice.tier)
											})}
										{/each}
									{/if}
								</div>
								{#if !isDemo() && repairSpec}
									{#each fixChoices as choice (choice.id)}
										{#if choice.offer?.error}<p class="notice warn small" role="status">
												{displayMessage(choice.offer.error)}
											</p>{/if}
										{#if choice.tier}<TierNotice
												id={`item-${choice.id}-tier`}
												minimumTier={choice.tier}
												feature={choice.feature}
											/>{/if}
									{/each}
								{/if}
								{#if colorError}<p class="notice bad small">
										<TriangleAlert size={14} />{displayMessage(colorError)}<ReportButton
											error={colorError}
										/>
									</p>{/if}
								{#if colorDone}<p class="notice small" role="status">
										{t('itemPane.colorsMatched', {
											pixels: t('itemPane.pixels', {
												count: colorDone.pixels,
												n: number(colorDone.pixels)
											}),
											frames: t('itemPane.frames', {
												count: colorDone.frames,
												n: number(colorDone.frames)
											})
										})}
									</p>{/if}
								{#if !isDemo() && repairSpec}<p class="faint small">
										{t('itemPane.billingNote')}
									</p>{/if}
							</div>
						</div>
					</details>
				{/if}

				<!-- Outfit: how the item sits with the rest of the outfit. -->
				<details class="item-section" bind:this={sections.outfit} bind:open={open.outfit}>
					{@render sectionSummary(
						t('itemPane.outfitSection'),
						hiddenNow
							? { text: t('itemPane.hiddenState'), tone: 'warn' }
							: hideCount
								? {
										text: t('itemPane.hidesCount', { count: hideCount, n: number(hideCount) }),
										tone: 'neutral'
									}
								: undefined
					)}
					<!-- The outfit preview stays beside every control here, so each change shows where it is made. -->
					<div class="section-body outfit-body">
						<section class="layer-order" aria-labelledby="layer-order-{it.id}">
							<div class="layer-preview" aria-hidden={!outfitCell}>
								{#if outfitCell}<Sprite
										img={outfitCell}
										k={outfitK}
										limit={112}
										checker
										label={t('itemPane.outfitPreview', {
											name: it.name,
											direction: directionName(facing)
										})}
									/>{/if}
								{#if !on && !hiddenNow}<span class="layer-preview-note"
										>{t('itemPane.asIfWorn')}</span
									>{/if}
							</div>
							<div class="layer-controls">
								<h4 id="layer-order-{it.id}">{t('itemPane.layerOrder')}</h4>
								<div class="layer-actions">
									<button
										bind:this={backwardButton}
										class="bu-action btn"
										data-variant="outline"
										disabled={!neighbors?.behind || hiddenNow}
										onclick={() => void stepLayer(-1)}
										><ArrowDown size={16} aria-hidden="true" />{t('itemPane.sendBackward')}</button
									>
									<button
										bind:this={forwardButton}
										class="bu-action btn"
										data-variant="outline"
										disabled={!neighbors?.ahead || hiddenNow}
										onclick={() => void stepLayer(1)}
										><ArrowUp size={16} aria-hidden="true" />{t('itemPane.bringForward')}</button
									>
								</div>
								<p class="layer-position muted small" aria-live="polite">
									{#if hiddenNow}{t('itemPane.layerHiddenHint')}{:else}
										{#if neighbors?.behind}<span
												>{t('itemPane.inFrontOf', { name: layerName(neighbors.behind) })}</span
											>{/if}
										{#if neighbors?.behind && neighbors?.ahead}<span aria-hidden="true">
												·
											</span>{/if}
										{#if neighbors?.ahead}<span
												>{t('itemPane.behind', { name: layerName(neighbors.ahead) })}</span
											>{/if}
										{#if !neighbors?.behind && !neighbors?.ahead}{t(
												'itemPane.layerNothingToCross'
											)}{/if}
									{/if}
								</p>
							</div>
						</section>
						<label class="switch-row bu-check">
							<span>{t('itemPane.onlyFacing', { direction: directionName(facing) })}</span>
							<input class="bu-switch" type="checkbox" role="switch" bind:checked={onlyDir} />
						</label>
						<p class="faint small layer-scope">
							{t('itemPane.layerScope', { slot: slotName(it.slot) })}
							{#if customOrder}<button
									class="bu-action btn plain callout-link"
									data-variant="quiet"
									onclick={() => void resetOrder()}>{t('itemPane.resetOrder')}</button
								>{/if}
						</p>
						{#if hideChoices.length}
							<section class="hide-rules" aria-labelledby="hide-rules-{it.id}">
								<h4 id="hide-rules-{it.id}">{t('itemPane.whenWornHide')}</h4>
								<div class="switch-list" role="group" aria-labelledby="hide-rules-{it.id}">
									{#each hideChoices as slot (slot)}
										{@const isOtherHand = slot === otherHand}
										<label class="switch-row bu-check">
											<span>{slotName(slot)}</span>
											<input
												class="bu-switch"
												type="checkbox"
												role="switch"
												checked={isOtherHand ? twoHanded(m, it) : hides.includes(slot)}
												onchange={() =>
													isOtherHand ? toggleTwoHanded(it.id) : toggleHide(it.id, slot)}
											/>
										</label>
									{/each}
								</div>
								<p class="faint small">
									{#if !on}{t('itemPane.hideRulesLater', { name: it.name })}{/if}
									{#if tucks.length}{t('itemPane.tuckNote', {
											slots: formatList(tucks.map(slotName))
										})}{/if}
								</p>
							</section>
						{/if}
					</div>
				</details>

				<!-- About: how it was made, then the raw numbers one level deeper. -->
				<details class="item-section" bind:this={sections.about} bind:open={open.about}>
					{@render sectionSummary(t('itemPane.aboutSection'))}
					<div class="section-body">
						<GenerationDetails {m} {it} />
						<details class="item-section nested">
							{@render sectionSummary(t('itemPane.technicalDetails'))}
							<div class="section-body">
								<dl class="kv">
									<dt>{t('itemPane.iD')}</dt>
									<dd class="mono">{it.id}</dd>
									<dt>{t('itemPane.slot')}</dt>
									<dd>{it.slot} · {it.layers.map((l) => `${l.id} z${l.z}`).join(', ')}</dd>
									{#if it.route}<dt>{t('itemPane.route')}</dt>
										<dd>
											{it.route}{it.key
												? ` · ${t('itemPane.chromaKey', { color: displayKey(it.key) })}`
												: ''}
										</dd>{/if}
									{#if it.qa}
										<dt>{t('itemPane.qA')}</dt>
										<dd>{t(`itemPane.qaStatus.${it.qa.status}`)}</dd>
										{#if it.qa.rawKeyReviewFrames}<dt>{t('itemPane.rawBodyDifferences')}</dt>
											<dd>
												{t('itemPane.rawKeyReviewFramesFramesHaveNewBodyColoredPixels', {
													rawKeyReviewFrames: number(it.qa.rawKeyReviewFrames)
												})}
											</dd>{/if}
										{#if it.qa.inherited}<dt>{t('itemPane.partialChecks')}</dt>
											<dd>
												{it.qa.inherited.summary
													? t('itemPane.copiedChecksCoverWholeMovesTotalsMay')
													: t('itemPane.someMovesHaveNotBeenChecked')}
											</dd>{/if}
										{#if it.qa.unmeasured}
											<dt>{t('itemPane.measurements')}</dt>
											<dd>{t('itemPane.reusedCellsWereNotMeasuredByPixelLab')}</dd>
										{:else}
											<dt>{t('itemPane.keyKept')}</dt>
											<dd>
												{t('itemPane.minimum', {
													value: number(it.qa.minKeyKept),
													threshold: number(0.97)
												})}
											</dd>
											<dt>{t('itemPane.keyOutside')}</dt>
											<dd>
												{t('itemPane.maximum', {
													value: number(it.qa.maxKeyOutside),
													threshold: number(0.02)
												})}
											</dd>
											<dt>{t('itemPane.area')}</dt>
											<dd>
												{t('itemPane.areaStats', {
													ratio: number(it.qa.minAreaRatio),
													cv: number(it.qa.maxAreaCV)
												})}
											</dd>
											<dt>{t('itemPane.paletteDrift')}</dt>
											<dd>
												{t('itemPane.maximum', {
													value: number(it.qa.maxPaletteDist),
													threshold: number(15)
												})}
											</dd>
											<dt>{t('itemPane.edgePx')}</dt>
											<dd>{number(it.qa.clipPx)}</dd>
											{#if it.qa.handedness}<dt>{t('itemPane.hands')}</dt>
												<dd>{t(`itemPane.handedness.${it.qa.handedness}`)}</dd>{/if}
										{/if}
										<dt>{t('itemPane.reRolls')}</dt>
										<dd>{number(it.qa.rerolls)}</dd>
									{/if}
									{#if gaps.length}<dt>{t('itemPane.missingFrames')}</dt>
										<dd>{gaps.join(', ')}</dd>{/if}
								</dl>
							</div>
						</details>
					</div>
				</details>
			</div>
		</div>

		<!-- The item's other verbs, the same ones its Wardrobe tile menu offers. -->
		<div
			id={menuId}
			class="menu item-menu bu-popover-anchor"
			data-placement="bottom-end"
			popover
			bind:this={menu}
			ontoggle={(event) => popoverFocus(event, true)}
		>
			<PopoverArrow />
			<div class="menu-surface bu-popover-surface bu-floating">
				<div role="menu" aria-label={t('itemPane.itemActions')}>
					{#if recolorable}
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() => act(recolor)}
							><Palette size={16} aria-hidden="true" />{t('itemPane.recolor')}</button
						>
					{/if}
					{#if !isDemo() && !it.variantOf}
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() =>
								act(() => leaveFor(() => openRename(doc.id, { itemId: it.id, back: 'item' })))}
							><Pencil size={16} aria-hidden="true" />{openerLabel(
								t('toolbar.rename')
							)}<SurfaceChevron /></button
						>
						{#if canEditItemAppearance(m, it)}<button
								class="row bu-action"
								data-variant="quiet"
								role="menuitem"
								aria-haspopup="dialog"
								onclick={() => act(() => leaveFor(() => openAppearance(doc.id, it.id, 'item')))}
								><Sparkles size={16} aria-hidden="true" />{t('appearance.action')}<SurfaceChevron
								/></button
							>{/if}
					{/if}
					{#if !isDemo() && it.prompt}
						<!-- The New item sheet that opens next prices the attempt before anything is spent. -->
						<button
							class="row bu-action"
							data-variant="quiet"
							role="menuitem"
							onclick={() =>
								act(() =>
									openNewItem(it.slot, { slot: it.slot, prompt: it.prompt, route: it.route })
								)}
							><RefreshCw size={16} aria-hidden="true" />{openerLabel(
								remakeOnly ? t('itemMenu.remake', { name: m.name }) : t('itemMenu.createVariant')
							)}<SurfaceChevron /></button
						>
					{/if}
					<button
						class="row bu-action"
						data-variant="quiet"
						role="menuitem"
						onclick={() => act(() => void downloadItemZip(it.id))}
						><Download size={16} aria-hidden="true" />{t('common.downloadZip')}</button
					>
					{#if !isDemo()}
						<hr class="bu-separator" />
						<DeleteRow
							class="bu-action"
							label={t('common.moveToTrash')}
							onclick={() => act(() => (confirmRemove = true))}
						/>
					{/if}
				</div>
			</div>
		</div>
	{/if}
	{#if confirmRemove && it}
		{@const target = it}
		<ConfirmDialog
			title={t('common.deleteNamed', { name: target.name })}
			action={t('common.moveToTrash')}
			oncancel={() => (confirmRemove = false)}
			onconfirm={() => {
				const id = target.id;
				confirmRemove = false;
				void removeItem(id).catch((error) => toast(errorMessage(error), { tone: 'danger', error }));
			}}><p>{t('common.deleteRecoverable')}</p></ConfirmDialog
		>
	{/if}

	{#if viewer && it}
		<SpritePreview
			title={it.name}
			context={moveName}
			views={viewer.views}
			view={viewer.view}
			frame={viewer.frame}
			onclose={() => (viewer = null)}
		/>
	{/if}
</Sheet>

<style>
	.item-body {
		display: grid;
		gap: 12px;
	}
	/* Header: name, then category and one status on the same line. */
	.item-slot {
		color: var(--text-2);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.item-status {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 8px;
		border-radius: 999px;
		border: 1px solid var(--bu-line);
		font-size: var(--fs-xs, 12px);
		line-height: 18px;
		white-space: nowrap;
		color: var(--text-2);
	}
	.item-status[data-tone='warn'] {
		color: var(--warn);
		border-color: color-mix(in srgb, var(--warn) 45%, transparent);
	}
	.item-status[data-tone='ok'] {
		color: var(--ok);
		border-color: color-mix(in srgb, var(--ok) 45%, transparent);
	}
	:global(.item-detail .sheet-heading) {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: center;
		gap: 2px 10px;
		min-width: 0;
	}
	:global(.item-detail .sheet-heading .sheet-title) {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	/* Both header buttons keep their room, so the title stays centered without running under them. */
	:global(dialog.item-detail .sheet-head) {
		grid-template-columns: minmax(96px, 1fr) minmax(0, auto) minmax(96px, 1fr);
	}
	/* A phone starts the title at the edge and keeps the name on one line beside the menu and Close: it truncates, and
	   the heading keeps the full name. */
	:global(dialog.item-detail.bottom .sheet-head) {
		grid-template-columns: 0 minmax(0, 1fr) auto;
	}
	:global(dialog.item-detail.bottom .sheet-heading) {
		flex-wrap: nowrap;
		justify-content: flex-start;
		min-width: 0;
	}
	:global(dialog.item-detail.bottom .sheet-heading .sheet-title) {
		flex: 0 1 auto;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	:global(dialog.item-detail.bottom .sheet-heading .item-slot) {
		flex: none;
	}
	:global(dialog.sheet.bottom.item-detail) {
		box-sizing: border-box;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0;
		padding-top: env(safe-area-inset-top);
		border-radius: 0;
	}
	.item-wear {
		min-width: 140px;
		min-height: 44px;
	}

	/* Preview */
	.item-preview {
		display: grid;
		gap: 6px;
	}
	.preview-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.preview-move {
		min-width: 0;
	}
	.preview-move select {
		min-height: 40px;
		padding-block: 6px;
		font-size: var(--fs);
		width: auto;
		max-width: 100%;
	}
	@media (pointer: coarse) {
		.preview-move select {
			min-height: 44px;
			font-size: 16px;
		}
	}
	.item-views {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: 2px;
		padding: 4px;
		background: var(--stage);
		border-radius: var(--r-card);
	}
	.item-view {
		position: relative;
		display: grid;
		grid-template-rows: var(--tile, 64px) auto;
		justify-items: center;
		align-items: center;
		gap: 4px;
		min-width: 0;
		padding: 10px 4px 8px;
		border-radius: calc(var(--r-card) - 2px);
		font-size: var(--fs-sm);
		color: var(--text-2);
		cursor: zoom-in;
	}
	/* Each tile says it opens bigger, so the strip does not read as a second facing picker. */
	.view-enlarge {
		position: absolute;
		inset-block-start: 6px;
		inset-inline-end: 6px;
		display: grid;
		color: var(--text-3);
		opacity: 0.7;
		transition: opacity var(--dur);
	}
	.item-view:is(:hover, :focus-visible) .view-enlarge {
		opacity: 1;
		color: var(--text);
	}
	.view-art {
		display: grid;
		place-items: center;
		width: 100%;
		height: var(--tile, 64px);
	}
	.view-missing {
		display: grid;
		place-items: center;
		width: min(48px, 80%);
		height: 48px;
		border: 1px dashed var(--bu-line);
		border-radius: 8px;
		color: var(--text-3);
		font-size: var(--fs-xs, 11px);
	}
	.item-view[data-current] .view-caption {
		color: var(--accent-text, var(--accent));
		font-weight: 600;
	}
	.item-view[data-current] {
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.item-view[data-missing] .view-caption {
		color: var(--warn);
	}
	.view-caption {
		max-width: 100%;
		overflow-wrap: anywhere;
		text-align: center;
	}
	.preview-empty {
		grid-column: 1 / -1;
		margin: 0;
		padding: 16px 8px;
		text-align: center;
	}
	.hidden-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 8px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.hidden-row .btn {
		margin-inline-start: auto;
		min-height: 44px;
	}
	.item-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}
	.item-callout > span {
		flex: 1 1 16rem;
	}
	.callout-link {
		min-height: 36px;
		padding-inline: 8px;
		font-size: var(--fs-sm);
		color: var(--accent-text, var(--accent));
	}

	/* Sections: one row each, chevron, name, state on the right (as in the API calls popover). */
	.item-sections {
		display: grid;
		border-block-start: 1px solid var(--bu-line);
	}
	.item-section {
		min-width: 0;
		border-block-end: 1px solid var(--bu-line);
	}
	.item-section.nested {
		border-block: 1px solid var(--bu-line);
		border-block-end: 0;
		margin-block-start: 8px;
	}
	.item-section :global(> summary) {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 4px;
		cursor: pointer;
		list-style: none;
		border-radius: 6px;
	}
	.item-section :global(> summary::-webkit-details-marker) {
		display: none;
	}
	.item-section :global(> summary:hover) {
		background: var(--bg-hover);
	}
	.item-section :global(> summary > svg) {
		flex: none;
		color: var(--text-3);
		transition: transform var(--dur);
	}
	.item-section[open] :global(> summary > svg) {
		transform: rotate(90deg);
	}
	.item-section :global(.section-name) {
		margin: 0;
		min-width: 0;
		font: 600 var(--fs) / 1.3 var(--font-ui);
	}
	.item-section.nested :global(.section-name) {
		font-weight: 400;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.item-section :global(.section-state) {
		margin-inline-start: auto;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		font-size: var(--fs-sm);
		color: var(--text-3);
		text-align: end;
	}
	.item-section :global(.section-state[data-tone='warn']) {
		color: var(--warn);
	}
	.item-section :global(.section-state[data-tone='ok']) {
		color: var(--ok);
	}
	.section-body {
		display: grid;
		gap: 12px;
		padding: 4px 4px 16px 28px;
	}
	.item-section.nested .section-body {
		padding-inline-start: 24px;
	}
	h4 {
		margin: 0;
		font-size: var(--fs-sm);
		font-weight: 600;
	}

	/* Tool rows: what it does on the left, what it costs on the right. */
	.tool-list {
		display: grid;
		border: 1px solid var(--bu-line);
		border-radius: 10px;
		overflow: hidden;
	}
	.tool-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 12px;
		text-align: start;
		border-radius: 0;
	}
	.tool-row + .tool-row {
		border-block-start: 1px solid var(--bu-line);
	}
	.tool-row > :global(svg:first-child) {
		color: var(--text-2);
	}
	.tool-text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.tool-label {
		font-weight: 600;
	}
	.tool-detail {
		color: var(--text-2);
		font-size: var(--fs-sm);
		overflow-wrap: anywhere;
	}
	.tool-aside {
		font-size: var(--fs-sm);
		color: var(--ok);
		white-space: nowrap;
	}
	.tool-aside[data-paid] {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	/* Moves & States */
	.clip-list {
		display: grid;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.select-all {
		justify-self: end;
		min-height: 36px;
		font-size: var(--fs-sm);
	}
	.clip-row {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 4px 0;
		border-block-end: 1px solid var(--bu-line);
	}
	.clip-row:last-child {
		border-block-end: 0;
	}
	.clip-mark {
		display: grid;
		place-items: center;
		color: var(--ok);
	}
	.clip-row[data-missing] .clip-mark {
		color: var(--warn);
	}
	.clip-text {
		display: grid;
		min-width: 0;
	}
	.clip-text small {
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.clip-row[data-missing] .clip-text small {
		color: var(--warn);
	}
	.clip-aside {
		font-size: var(--fs-sm);
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}
	.paid-action {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
	}
	.paid-action p {
		flex: 1 1 12rem;
		margin: 0;
	}
	.paid-action .btn {
		margin-inline-start: auto;
		min-height: 44px;
	}

	/* Quality */
	.finding-group {
		display: grid;
		gap: 6px;
	}
	.findings {
		display: grid;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--fs-sm);
	}
	.findings li {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.findings li > :global(svg) {
		flex: none;
		margin-block-start: 2px;
		color: var(--warn);
	}
	.finding-link {
		justify-content: start;
		gap: 8px;
		min-height: 36px;
		text-align: start;
		font-size: var(--fs-sm);
	}
	.finding-link > :global(svg) {
		color: var(--warn);
	}
	.accept {
		display: grid;
		gap: 8px;
	}
	.fix-view {
		display: grid;
		gap: 8px;
	}
	.facing {
		display: flex;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--bu-line);
		border-radius: 10px;
	}
	.facing-choice {
		min-width: 36px;
		min-height: 36px;
		padding: 0 6px;
		border-radius: 8px;
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--text-2);
	}
	@media (pointer: coarse) {
		.facing-choice {
			min-width: 44px;
			min-height: 44px;
		}
	}
	.facing-choice[aria-checked='true'] {
		background: var(--bu-selected, var(--sel));
		color: var(--accent-text, var(--accent));
	}

	/* Outfit */
	.outfit-body {
		grid-template-columns: auto minmax(0, 1fr);
		column-gap: 16px;
		align-items: start;
	}
	.outfit-body > :global(*) {
		grid-column: 2;
	}
	/* Its preview and controls join the body's grid: the preview spans the rows and stays in view while they scroll. */
	.outfit-body > .layer-order {
		display: contents;
	}
	.layer-preview {
		grid-column: 1;
		grid-row: 1 / span 4;
		position: sticky;
		top: 8px;
		display: grid;
		place-items: center;
		width: 120px;
		height: 120px;
		background: var(--stage);
		border-radius: var(--r-card);
		overflow: hidden;
	}
	.layer-preview-note {
		position: absolute;
		inset-inline: 0;
		inset-block-end: 4px;
		text-align: center;
		font-size: var(--fs-xs, 11px);
		color: var(--text-3);
	}
	.layer-controls {
		grid-column: 2;
		display: grid;
		gap: 8px;
		min-width: 0;
	}
	.layer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.layer-actions .btn {
		min-height: 44px;
	}
	.layer-position {
		margin: 0;
		min-height: 1.4em;
	}
	.layer-scope {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		margin: -4px 0 0;
	}
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 44px;
		font-size: var(--fs-sm);
	}
	.hide-rules {
		display: grid;
		gap: 4px;
		padding-block-start: 12px;
		border-block-start: 1px solid var(--bu-line);
	}
	.hide-rules p:empty {
		display: none;
	}
	.switch-list {
		display: grid;
	}
	@media (max-width: 420px) {
		.outfit-body {
			grid-template-columns: minmax(0, 1fr);
		}
		.outfit-body > :global(*),
		.layer-preview {
			grid-column: 1;
		}
		.layer-preview {
			grid-row: auto;
			position: relative;
			top: auto;
			justify-self: center;
		}
		.section-body {
			padding-inline-start: 4px;
		}
	}
</style>
