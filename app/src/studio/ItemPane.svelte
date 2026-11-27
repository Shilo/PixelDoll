<script lang="ts" module>
	import type { DirectionName } from '../lib/store/manifest.ts';
	type Section = 'moves' | 'quality' | 'outfit' | 'about';
	/** Where the window was when it handed over to a sheet with a way back (Fix frames, Edit appearance), so coming back
	 *  shows the same move, facing, sections and scroll position instead of starting over. */
	let resume: {
		id: string;
		anim: string;
		dir: DirectionName;
		outfitDir: DirectionName;
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
	import ObjectWindow from './ObjectWindow.svelte';
	import { itemSuccessor } from './experience/focus.ts';
	import WindowSection from './WindowSection.svelte';
	import FacingStrip from './FacingStrip.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import ItemActions from './ItemActions.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { displayMessage, displayNestedMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	import { displayDirection, displayDirectionInSentence } from './displayDirection.ts';
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
	import TierNotice from './TierNotice.svelte';
	import PoseIssues from './PoseIssues.svelte';
	import GenerationDetails from './GenerationDetails.svelte';
	import { movePlan } from './apiPlans.ts';
	import ApiPeek from './ApiPeek.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Sprite from './Sprite.svelte';
	import SpritePreview, { type SpriteView } from './SpritePreview.svelte';
	import ToolRow from './ToolRow.svelte';
	import GroupIcon from './GroupIcon.svelte';
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
		itemLayerPosition,
		placedOutfitFrames,
		resetLayer,
		removeItem,
		isDemo,
		openNewItem,
		openCopyForSelf,
		copyDemo,
		moveItemToSlot,
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
		ChevronLeft,
		ChevronRight,
		CopyPlus,
		EyeOff,
		Grid2x2,
		LoaderCircle,
		Maximize,
		Palette,
		RefreshCw,
		RotateCcw,
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
	// Outfit turns its own preview: turning it never moves the view a paid fix in Quality would change.
	let outfitDir = $state<DirectionName>(resumed?.outfitDir ?? untrack(() => ui.dir));
	const outfitFacing = $derived<DirectionName>(
		m?.rig.directions.some((direction) => direction.id === outfitDir)
			? outfitDir
			: (m?.rig.directions[0]?.id ?? ui.dir)
	);
	function turnOutfit(step: 1 | -1) {
		const all = m?.rig.directions ?? [];
		const at = all.findIndex((direction) => direction.id === outfitFacing);
		if (all.length) outfitDir = all[(at + step + all.length) % all.length].id;
	}
	const moveName = $derived(displayMove(animId, moveRefs));
	const made = $derived(m ? moveDirs(m, animId) : []);

	// ---------- preview ----------
	// One shared crop across every frame and direction, rather than resizing the strip on each playback tick.
	const previews = $derived(view.project && it ? itemPreviewFrames(view.project, it, animId) : []);
	const frameIndex = $derived(previews.length ? ui.frame % previews.length : 0);
	const strip = $derived(previews[frameIndex] ?? []);
	/** Whether the item has its own (or mirrored) artwork in a direction and playback frame of the shown move. */
	const drawnAt = (
		direction: { id: DirectionName; mirrorOf?: DirectionName },
		frame: number,
		clip = animId
	) => {
		const cell = m?.rig.animations.find((a) => a.id === clip)?.frames[frame]?.cell;
		return (
			cell != null &&
			!!it?.layers.some((layer) => {
				const cells = layer.cells?.[clip];
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
	/** The full-size viewer: the item's own frames or the outfit with it on, in a move of its own (it starts on the window's
	 *  and its picker changes only the viewer). */
	let viewer = $state<{
		kind: 'item' | 'outfit';
		anim: string;
		view: string;
		frame: number;
	} | null>(null);
	function openViewer(directionId: string, frame = frameIndex) {
		viewer = { kind: 'item', anim: animId, view: directionId, frame };
	}
	const viewerViews = $derived.by((): SpriteView[] => {
		if (!viewer || !m || !it || !view.project) return [];
		const clip = viewer.anim;
		if (viewer.kind === 'outfit') {
			void doc.rev;
			const rows = placedOutfitFrames(it.id, clip);
			return m.rig.directions.map((direction, index) => ({
				id: direction.id,
				label: displayDirection(direction.id),
				frames: rows.map((row) => row[index] ?? null)
			}));
		}
		const rows = itemPreviewFrames(view.project, it, clip);
		const drawn = moveDirs(m, clip);
		return m.rig.directions
			.filter((direction) => drawn.includes(direction.id))
			.map((direction) => ({
				id: direction.id,
				label: displayDirection(direction.id),
				frames: rows.map((row, index) =>
					drawnAt(direction, index, clip)
						? (row[m.rig.directions.indexOf(direction)] ?? null)
						: null
				)
			}));
	});

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
			? playbackClips(m.rig.animations).flatMap(({ key, kind }) => {
					const drawn = itemClipDrawn(m, it!.id, key);
					if (drawn == null) return [];
					const missing = gaps.filter((g) => g.startsWith(`${key}/`)).map((g) => g.split('/')[1]);
					return [
						{
							id: key,
							kind,
							name: displayMove(key, moveRefs),
							drawn,
							missing,
							none: !drawn && missing.length >= moveDirs(m, key).length
						}
					];
				})
			: []
	);
	/** Moves the item has no frames in: the viewer's picker says so instead of opening an empty view. */
	const noFrames = $derived(
		new Map(clips.filter((clip) => clip.none).map((clip) => [clip.id, t('itemPane.clipNoFrames')]))
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
	/** Every facing a fix of the chosen view changes: the drawn view and the facings mirrored from it. */
	const mirrorFacings = $derived([
		sourceDir,
		...(m?.rig.directions.filter((d) => d.mirrorOf === sourceDir).map((d) => d.id) ?? [])
	]);
	const fixChoices = $derived(
		[
			{
				id: 'repair',
				icon: Wrench,
				label: t('itemPane.repairView', { direction: directionName(facing) }),
				feature: t('itemPane.repairFeature'),
				offer: repairOffer,
				help: t('itemPane.repairHelp')
			},
			{
				id: 'redraw',
				icon: WandSparkles,
				label: t('itemPane.redrawView', { direction: directionName(facing) }),
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
	// Any one-view tool (colors, repair, redraw) also changes the facings mirrored from the chosen view.
	const mirrored = $derived(
		hasFixTools && !!m?.rig.directions.some((d) => d.mirrorOf === sourceDir)
	);
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
	const neighbors = $derived(it ? itemLayerNeighbors(it.id, animId, outfitFacing, onlyDir) : null);
	const layerPosition = $derived(
		it ? itemLayerPosition(it.id, animId, outfitFacing, onlyDir) : null
	);
	// The outfit preview shows the frame where the last step made a difference, else the first one.
	let witness = $state(0);
	$effect(() => {
		void animId;
		void outfitFacing;
		witness = 0;
	});
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
		const shown = moveLayer(it.id, step, onlyDir, animId, outfitFacing, ladder);
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
	// The opposite hand, custom categories assigned to it included, is the Two-handed switch's, not a hiding choice.
	const hideChoices = $derived(others.filter((slot) => !oppositeSlots.includes(slot)));
	// The project manifest is raw state: an edit to an item's or slot's fields is announced by `bump()` through doc.rev.
	const hides = $derived.by(() => {
		void doc.rev;
		return m && it ? hidesOf(m, it) : [];
	});
	const hideCount = $derived(
		hideChoices.filter((slot) => hides.includes(slot)).length +
			(m && it && twoHanded(m, it) ? 1 : 0)
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
			untrack(() => {
				// At most one section opens on entry, the one that explains what the Details dot flagged: none for an unfitted
				// item (its notice holds the one action), then a move with nothing to show (or frames to add for free), then
				// failed checks, then moves missing frames.
				const first: Section | '' =
					health === 'unfitted'
						? ''
						: (!strip.length && missingMoves.length > 0) || restorable.length > 0 || copyOffer
							? 'moves'
							: health === 'look'
								? 'quality'
								: incomplete > 0
									? 'moves'
									: '';
				return {
					moves: first === 'moves',
					quality: first === 'quality',
					outfit: false,
					about: false
				};
			})
	);
	const outfitFrames = $derived.by(() => {
		void doc.rev;
		return it && open.outfit ? placedOutfitFrames(it.id, animId) : [];
	});
	const outfitCell = $derived(
		outfitFrames.length && m
			? (outfitFrames[witness % outfitFrames.length]?.[
					m.rig.directions.findIndex((direction) => direction.id === outfitFacing)
				] ?? null)
			: null
	);
	const outfitK = $derived(
		outfitCell ? Math.max(1, Math.ceil((112 / Math.max(outfitCell.w, outfitCell.h)) * ui.dpr)) : 1
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
			outfitDir: outfitFacing,
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
								label: openerLabel(t('itemMenu.remake')),
								run: () => openCopyForSelf(it)
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
							? ' ' + t('itemPane.remakeFits', { name: m.name })
							: ''),
					// No link when Moves & States is already open below.
					action:
						isDemo() || open.moves
							? undefined
							: { label: t('itemPane.reviewMissingMoves'), run: () => void reveal('moves') }
				};
			if (health === 'stale') return { tone: 'warn', text: t('itemPane.staleNote') };
			return null;
		}
	);

	// ---------- menu ----------
	let confirmRemove = $state(false);
	let pickingSlot = $state(false);
</script>

<ObjectWindow
	title={it?.name ?? t('studio.titleItem')}
	className="item-detail"
	kind={it ? slotName(it.slot) : t('studio.titleItem')}
	status={status ? { ...status, busy: generating } : undefined}
	menuLabel={t('itemPane.itemActions')}
	onmenutoggle={(open) => {
		if (!open) pickingSlot = false;
	}}
	onclose={() => (ui.sheet = null)}
>
	{#snippet icon()}
		<!-- The category's icon, as on its Wardrobe rail. -->
		{#if it}<GroupIcon group={it.slot} surface="inline" />{/if}
	{/snippet}
	{#snippet scope()}
		<!-- The move scopes the whole window (views, fixes, outfit), so it stays in the fixed header while the body scrolls. -->
		{#if m && playbackClips(m.rig.animations).length > 1}<label class="item-move">
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
			</label>{/if}
	{/snippet}
	{#snippet menu(close)}
		<!-- The tile menu's actions, without View and edit: one menu for the item wherever its ⋮ opens. -->
		{#if m && it}<ItemActions
				{m}
				{it}
				worn={on}
				inDetails
				label={t('itemPane.itemActions')}
				bind:picking={pickingSlot}
				act={(fn) => {
					close();
					fn();
				}}
				leave={leaveFor}
				onmove={(target) => void moveItemToSlot(it.id, target, { showDestination: true })}
				ondelete={() => (confirmRemove = true)}
			/>{/if}
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
								label: t('itemPane.repairView', { direction: directionName(facing) }),
								plan:
									repairOffer?.specs[0] && m ? movePlan({ manifest: m }, repairOffer.specs[0]) : []
							},
							{
								scope: 'item-redraw',
								label: t('itemPane.redrawView', { direction: directionName(facing) }),
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
			<FacingStrip
				label={t('itemPane.availableDirectionsFor', { name: it.name })}
				{directions}
				image={(direction) => strip[m.rig.directions.indexOf(direction)]}
				drawn={(direction) => drawnAt(direction, frameIndex)}
				name={it.name}
				{tile}
				{k}
				empty={t('itemPane.previewUnavailable')}
				onopen={openViewer}
			/>

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
					<WindowSection
						label={t('itemPane.movesSection')}
						state={generating
							? { text: t('itemPane.statusGenerating'), tone: 'neutral' }
							: incomplete
								? {
										text: t('itemPane.clipsIncomplete', {
											count: incomplete,
											n: number(incomplete)
										}),
										tone: 'warn'
									}
								: { text: t('itemPane.complete'), tone: 'ok' }}
						bind:element={sections.moves}
						bind:open={open.moves}
					>
						<div class="window-body">
							{#if restorable.length || copyOffer}
								<div class="tool-list">
									{#if restorable.length}<ToolRow
											{...{
												icon: RotateCcw,
												label: t('itemPane.restoreStanding', { count: restorable.length }),
												detail: t('itemPane.restoreStandingHint', {
													count: restorable.length,
													directions: formatList(restorable.map(directionName))
												}),
												aside: t('common.free'),
												disabled: !!shared.adding,
												onclick: () => restoreFromDesign(it.id)
											}}
										/>{/if}
									{#if copyOffer && it.copiedFrom}<ToolRow
											{...{
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
											}}
										/>{/if}
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
								<!-- Moves, then states, each saying how many already have this item's artwork. -->
								{#each [{ kind: 'move', title: t('experience.tabMoves') }, { kind: 'state', title: t('experience.tabStates') }] as group (group.kind)}
									{@const rows = clips.filter((clip) => clip.kind === group.kind)}
									{#if rows.length}
										<div
											class="clip-group"
											role="group"
											aria-labelledby="clips-{group.kind}-{it.id}"
										>
											<h4 class="clip-group-head" id="clips-{group.kind}-{it.id}">
												{group.title}<small
													>{t('itemPane.groupReady', {
														ready: number(rows.filter((clip) => clip.drawn).length),
														count: number(rows.length)
													})}</small
												>
											</h4>
											{#each rows as clip (clip.id)}{@render clipRow(clip)}{/each}
										</div>
									{/if}
								{/each}
								{#snippet clipRow(clip: (typeof clips)[number])}
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
								{/snippet}
							</fieldset>
							{#if isDemo() && incomplete}
								<!-- Why nothing here can be picked: the demo never spends; its copy can. -->
								<p class="notice small demo-missing">
									<span>{t('itemPane.demoMissing')}</span>
									<button
										class="bu-action btn plain callout-link"
										data-variant="quiet"
										onclick={() => {
											const itemId = id;
											void copyDemo().then(
												() => {
													// The copy is now open: carry on in its copy of this item, where its frames can be drawn.
													ui.selected = itemId;
													ui.sheet = 'item';
												},
												(error) => toast(errorMessage(error), { tone: 'danger', error })
											);
										}}>{t('demoCopyRow.editACopy')}</button
									>
								</p>
							{/if}
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
					</WindowSection>
				{/if}

				<!-- Quality: what the checks found, accepting it, and fixing one view. -->
				{#if hasQuality || hasFixTools || !isDemo()}
					<WindowSection
						label={t('itemPane.qualitySection')}
						state={health === 'look' || health === 'unfitted'
							? { text: displayMessage(HEALTH_LABEL[health]), tone: 'warn' }
							: health === 'accepted'
								? { text: displayMessage(HEALTH_LABEL.accepted), tone: 'neutral' }
								: it.qa?.status === 'pass'
									? { text: t('itemPane.passed'), tone: 'ok' }
									: undefined}
						bind:element={sections.quality}
						bind:open={open.quality}
					>
						<div class="window-body">
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
									<ToolRow
										{...{
											icon: RefreshCw,
											label: openerLabel(t('itemMenu.remake')),
											detail: t('itemPane.remakeFits', { name: m.name }),
											aside: '',
											opens: true,
											onclick: () => openCopyForSelf(it)
										}}
									/>
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
											<ToolRow
												{...{
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
												}}
											/>
										</div>
									{/if}
									{#if acceptanceError}<p class="notice bad small" role="alert">
											{displayMessage(acceptanceError)}<ReportButton error={acceptanceError} />
										</p>{/if}
								</div>
							{:else if health === 'accepted'}
								<p class="muted small">{t('itemPane.youAcceptedThisArtworkWithItsRecorded')}</p>
							{/if}

							<div class="tool-list">
								<ToolRow
									{...{
										icon: Grid2x2,
										label: t('fixFrames.open'),
										detail: t('itemPane.fixFramesDetail', { move: moveName }),
										aside: t('common.free'),
										opens: true,
										onclick: () => leaveFor(() => openFrames(it.id, animId, 'item'))
									}}
								/>
							</div>
							{#if hasFixTools}<div class="fix-view">
									<div class="fix-head">
										<h4>{t('itemPane.fixOneView')}</h4>
										{#if !isDemo() && m.rig.directions.length > 1}
											<label class="fix-facing">
												<span>{t('itemPane.facing')}</span>
												<select
													class="bu-input input"
													value={facing}
													onchange={(event) =>
														(scopeDir = event.currentTarget.value as DirectionName)}
												>
													{#each m.rig.directions as direction (direction.id)}
														<option value={direction.id}>{displayDirection(direction.id)}</option>
													{/each}
												</select>
											</label>
										{/if}
									</div>
									<!-- The heading names the view; a mirrored facing also updates the facings drawn from it. -->
									{#if mirrored}<p class="faint small" id="item-fix-scope">
											{t('itemPane.updateNoteMirrors', {
												move: moveName,
												directions: formatList(mirrorFacings.map((id) => directionName(id)))
											})}
										</p>{/if}
									<!-- Free first: the item's own colors and hand edits, then the paid redraws of this view. -->
									<div class="tool-list">
										{#if !isDemo() && colorPlan}<ToolRow
												{...{
													icon: Palette,
													label: colorBusy
														? t('itemPane.matchingColors')
														: t('itemPane.matchViewColors', { direction: directionName(facing) }),
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
													describedby: mirrored ? 'item-fix-scope' : undefined,
													onclick: () => void matchColors()
												}}
											/>{/if}
										{#if !isDemo() && repairSpec}
											{#each fixChoices as choice (choice.id)}
												<ToolRow
													{...{
														icon: choice.icon,
														label: choice.label,
														detail: choice.help,
														aside:
															choice.offer?.gens == null
																? t('common.unavailable')
																: t('moves.estimate', {
																		gens: number(Math.ceil(choice.offer.gens))
																	}),
														paid: true,
														disabled:
															repairBusy || choice.offer?.gens == null || tierBlocked(choice.tier),
														describedby: tierBlocked(choice.tier)
															? `item-${choice.id}-tier`
															: mirrored
																? 'item-fix-scope'
																: undefined,
														onclick: () => repairFrames(choice.offer, choice.tier)
													}}
												/>
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
								</div>{/if}
						</div>
					</WindowSection>
				{/if}

				<!-- Outfit: how the item sits with the rest of the outfit. -->
				<WindowSection
					label={t('itemPane.outfitSection')}
					state={hiddenNow
						? { text: t('itemPane.hiddenState'), tone: 'warn' }
						: hideCount
							? {
									text: t('itemPane.hidesCount', { count: hideCount, n: number(hideCount) }),
									tone: 'neutral'
								}
							: undefined}
					bind:element={sections.outfit}
					bind:open={open.outfit}
				>
					<!-- The outfit preview stays beside every control here, so each change shows where it is made. -->
					<div class="window-body outfit-body">
						{#if otherHand}
							<!-- First: how the item is held (functional), before how the outfit is layered and drawn. Free and instant: a two-handed item takes both hands (wearing it takes the other hand's item off). -->
							<section class="hide-rules hand-rules">
								{#if !isDemo() && it.prompt}
									<!-- The same description drawn for the other hand, two-handed or not (a hand switch); the New item sheet prices it first. -->
									<div class="tool-list">
										<ToolRow
											{...{
												icon: CopyPlus,
												label: openerLabel(
													t('itemMenu.makeForSlot', { slot: slotName(otherHand) })
												),
												detail: t('itemPane.makeForSlotDetail', { slot: slotName(otherHand) }),
												aside: '',
												opens: true,
												onclick: () =>
													openNewItem(otherHand, { slot: otherHand, prompt: it.prompt })
											}}
										/>
									</div>
								{/if}
								<label class="switch-row bu-check">
									<span>{t('itemMenu.twoHanded')}</span>
									<input
										class="bu-switch"
										type="checkbox"
										role="switch"
										checked={twoHanded(m, it)}
										onchange={() => toggleTwoHanded(it.id)}
									/>
								</label>
								<p class="faint small">
									{t('itemPane.twoHandedNote', { slot: slotName(otherHand) })}
								</p>
							</section>
						{/if}
						<section class="layer-order" aria-labelledby="layer-order-{it.id}">
							<div class="layer-preview">
								<button
									class="layer-art bu-action"
									data-variant="quiet"
									aria-haspopup="dialog"
									aria-label={t('itemPane.openOutfit', { name: it.name })}
									disabled={!outfitCell}
									onclick={() =>
										(viewer = {
											kind: 'outfit',
											anim: animId,
											view: outfitFacing,
											frame: witness
										})}
								>
									<span class="layer-checker" aria-hidden="true"></span>
									{#if outfitCell}<Sprite
											img={outfitCell}
											k={outfitK}
											fitToBox
											label={on || hiddenNow
												? t('itemPane.outfitPreview', {
														name: it.name,
														direction: directionName(outfitFacing)
													})
												: t('itemPane.outfitPreviewUnworn', {
														name: it.name,
														direction: directionName(outfitFacing)
													})}
										/>{/if}
									<span class="view-enlarge" aria-hidden="true"><Maximize size={14} /></span>
								</button>
								{#if m.rig.directions.length > 1}
									<div class="layer-turn">
										<button
											class="bu-action btn plain icon"
											data-variant="quiet"
											aria-label={t('itemPane.turnLeft')}
											title={t('itemPane.turnLeft')}
											onclick={() => turnOutfit(-1)}
											><ChevronLeft size={18} aria-hidden="true" /></button
										>
										<!-- Every facing's label stacked in one cell, hidden but the shown one, so the arrows never move. -->
										<span class="layer-facing"
											>{#each m.rig.directions as direction (direction.id)}<span
													class="layer-facing-sizer"
													aria-hidden="true"
													>{t('itemPane.facingLabel', {
														direction: directionName(direction.id)
													})}</span
												>{/each}<span aria-live="polite"
												>{t('itemPane.facingLabel', {
													direction: directionName(outfitFacing)
												})}</span
											></span
										>
										<button
											class="bu-action btn plain icon"
											data-variant="quiet"
											aria-label={t('itemPane.turnRight')}
											title={t('itemPane.turnRight')}
											onclick={() => turnOutfit(1)}
											><ChevronRight size={18} aria-hidden="true" /></button
										>
									</div>
								{/if}
							</div>
							<div class="layer-controls">
								<div class="layer-head">
									<h4 id="layer-order-{it.id}">
										{t('itemPane.slotLayerOrder', { slot: slotName(it.slot) })}
									</h4>
									{#if layerPosition}<span
											class="layer-rank"
											title={t('itemPane.layerPositionHint', {
												position: number(layerPosition.position),
												count: number(layerPosition.count)
											})}
											><span aria-hidden="true"
												>{t('itemPane.layerPosition', {
													position: number(layerPosition.position),
													count: number(layerPosition.count)
												})}</span
											><span class="sr"
												>{t('itemPane.layerPositionHint', {
													position: number(layerPosition.position),
													count: number(layerPosition.count)
												})}</span
											></span
										>{/if}
								</div>
								<!-- Reset (only when there is an order to undo), then down and up as icons: the words would not fit a phone
									 beside each other, and the arrows read in this row. -->
								<div class="layer-actions">
									{#if customOrder}<button
											class="bu-action btn icon"
											data-variant="outline"
											aria-label={t('itemPane.resetOrder')}
											title={t('itemPane.resetOrder')}
											onclick={() => void resetOrder()}
											><RotateCcw size={18} aria-hidden="true" /></button
										>{/if}
									<button
										bind:this={backwardButton}
										class="bu-action btn icon"
										data-variant="outline"
										aria-label={t('itemPane.sendBackward')}
										title={t('itemPane.sendBackward')}
										disabled={!neighbors?.behind || hiddenNow}
										onclick={() => void stepLayer(-1)}
										><ArrowDown size={18} aria-hidden="true" /></button
									>
									<button
										bind:this={forwardButton}
										class="bu-action btn icon"
										data-variant="outline"
										aria-label={t('itemPane.bringForward')}
										title={t('itemPane.bringForward')}
										disabled={!neighbors?.ahead || hiddenNow}
										onclick={() => void stepLayer(1)}
										><ArrowUp size={18} aria-hidden="true" /></button
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
								<!-- Part of the order: which facings a step changes, and what that covers, indented under it. -->
								<div class="layer-option">
									<label class="switch-row bu-check">
										<span
											>{t('itemPane.onlyFacing', { direction: directionName(outfitFacing) })}</span
										>
										<input class="bu-switch" type="checkbox" role="switch" bind:checked={onlyDir} />
									</label>
									<p class="faint small layer-scope">
										{onlyDir
											? t('itemPane.layerScopeFacing', {
													slot: slotName(it.slot),
													direction: directionName(outfitFacing)
												})
											: t('itemPane.layerScope', { slot: slotName(it.slot) })}
									</p>
								</div>
							</div>
						</section>
						{#if hideChoices.length}
							<section class="hide-rules" aria-labelledby="hide-rules-{it.id}">
								<h4 id="hide-rules-{it.id}">{t('itemPane.whenWornHide')}</h4>
								<div class="switch-list" role="group" aria-labelledby="hide-rules-{it.id}">
									{#each hideChoices as slot (slot)}
										<label class="switch-row bu-check">
											<span>{slotName(slot)}</span>
											<input
												class="bu-switch"
												type="checkbox"
												role="switch"
												checked={hides.includes(slot)}
												onchange={() => toggleHide(it.id, slot)}
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
				</WindowSection>

				<!-- About: how it was made, then the raw numbers one level deeper. -->
				<WindowSection
					label={t('itemPane.aboutSection')}
					bind:element={sections.about}
					bind:open={open.about}
				>
					<div class="window-body">
						<GenerationDetails {m} {it} />
						<WindowSection nested label={t('itemPane.technicalDetails')}>
							<div class="window-body">
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
						</WindowSection>
					</div>
				</WindowSection>
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
				const id = target.id,
					land = itemSuccessor(id);
				confirmRemove = false;
				void removeItem(id).then(land, (error) =>
					toast(errorMessage(error), { tone: 'danger', error })
				);
			}}><p>{t('common.deleteRecoverable')}</p></ConfirmDialog
		>
	{/if}

	{#if viewer && it && m}
		<SpritePreview
			title={viewer.kind === 'outfit' ? t('itemPane.outfitTitle', { name: it.name }) : it.name}
			views={viewerViews}
			view={viewer.view}
			frame={viewer.frame}
			durations={m.rig.animations.find((clip) => clip.id === viewer?.anim)?.frames.map((f) => f.ms)}
			moves={{
				clips: playbackClips(m.rig.animations),
				moveRefs,
				selected: viewer.anim,
				unavailable: viewer.kind === 'item' ? noFrames : undefined,
				onselect: (key) => {
					if (viewer) viewer = { ...viewer, anim: key };
				}
			}}
			onclose={() => (viewer = null)}
		/>
	{/if}
</ObjectWindow>

<style>
	/* Every grid here keeps its column to the sheet's width, so long rows wrap instead of widening the sheet. */
	.item-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
	}
	.item-wear {
		min-width: 140px;
		min-height: 44px;
	}

	/* One glyph for the strip, docked in its corner: any facing opens full size. Not a control; it lights up while a
	   facing is hovered or focused. */
	.view-enlarge {
		position: absolute;
		inset-block-start: 8px;
		inset-inline-end: 8px;
		display: grid;
		color: var(--text-3);
		pointer-events: none;
		transition: color var(--dur);
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
		max-width: 100%;
		height: auto;
		white-space: normal;
		text-align: start;
		margin-inline-start: auto;
		min-height: 44px;
	}
	.item-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}
	.demo-missing {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}
	.demo-missing > span {
		flex: 1 1 16rem;
	}
	.item-callout > span {
		flex: 1 1 16rem;
	}
	/* A character's name can be long: the link wraps instead of widening the sheet. */
	.callout-link {
		max-width: 100%;
		height: auto;
		white-space: normal;
		overflow-wrap: anywhere;
		text-align: start;
		min-height: 36px;
		padding-inline: 8px;
		font-size: var(--fs-sm);
		color: var(--accent-text, var(--accent));
	}

	/* Sections: one row each, chevron, name, state on the right (as in the API calls popover). */
	.item-sections {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		border-block-start: 1px solid var(--bu-line);
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
	/* Moves & States */
	.clip-list {
		display: grid;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.clip-group {
		display: grid;
		min-width: 0;
	}
	.clip-group + .clip-group {
		margin-block-start: 16px;
	}
	/* The group's name, with how many of its moves or states already have the item's artwork at the far end. */
	.clip-group-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		margin: 0;
		padding-block-end: 6px;
		border-block-end: 1px solid var(--bu-line);
		font-size: var(--fs-sm, 13px);
		font-weight: 600;
	}
	.clip-group-head small {
		font-weight: 400;
		color: var(--text-2);
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
	/* A note can be long: it wraps instead of widening the section. */
	.finding-link {
		width: 100%;
		max-width: 100%;
		min-width: 0;
		height: auto;
		white-space: normal;
		overflow-wrap: anywhere;
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
	.fix-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.fix-facing {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.fix-facing select {
		inline-size: var(--bu-select-fit, auto);
		min-height: 36px;
		padding-block: 4px;
		font-size: var(--fs-sm);
	}
	@media (pointer: coarse) {
		.fix-facing select {
			min-height: 44px;
			font-size: 16px;
		}
	}
	.fix-view {
		display: grid;
		gap: 8px;
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
		justify-items: center;
		gap: 4px;
	}
	/* The outfit fills one fixed box, framed once for every frame and facing, so turning never resizes it. The whole box
	   opens it full size, as a facing tile does. */
	.layer-art {
		position: relative;
		display: grid;
		place-items: center;
		width: 120px;
		height: 120px;
		padding: 12px;
		border-radius: var(--r-card);
		overflow: hidden;
		cursor: zoom-in;
	}
	/* The transparency checker fills the whole box; only the art keeps a margin. It sits under the art, so the press is
	   shown by the art itself. */
	.layer-checker {
		position: absolute;
		inset: 0;
		background: repeating-conic-gradient(var(--check-a) 0 25%, var(--check-b) 0 50%) 0 0 / 12px 12px;
	}
	.layer-art:active:not(:disabled) :global(.sprite-box) {
		transform: scale(0.96);
	}
	/* Hover and press tint the whole box with the theme's action tints, as on the facing tiles (the checker covers the
	   button's own background, so the tint sits on top). */
	.layer-art::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		transition: background-color var(--dur);
	}
	.layer-art:hover:not(:disabled)::after {
		background-color: var(--bu-action-hover);
	}
	.layer-art:active:not(:disabled)::after {
		background-color: var(--bu-action-press);
	}
	.layer-art :global(.sprite-box) {
		position: relative;
		transition: transform var(--dur);
	}
	.layer-art:disabled {
		cursor: default;
	}
	.layer-art :global(.sprite-box) {
		width: 100%;
		height: 100%;
	}
	/* The item's place in the outfit's stack, counted from the back, beside the heading. */
	.layer-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.layer-rank {
		color: var(--text-2);
		font-size: var(--fs-sm);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.layer-art:is(:hover, :focus-visible) .view-enlarge {
		color: var(--text);
	}
	/* Turning the outfit preview, as on a turntable; the facing it shows is named between the arrows. */
	.layer-turn {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.layer-facing {
		display: grid;
		font-size: var(--fs-xs, 12px);
		color: var(--text-2);
		text-align: center;
		white-space: nowrap;
	}
	.layer-facing > * {
		grid-area: 1 / 1;
	}
	.layer-facing-sizer {
		visibility: hidden;
	}
	.layer-controls {
		grid-column: 2;
		display: grid;
		gap: 8px;
		min-width: 0;
	}
	/* The order buttons and what the item sits between end at the trailing edge, under the item's place in the stack. */
	.layer-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}
	.layer-actions .btn {
		min-height: 44px;
	}
	.layer-actions .btn.icon {
		width: 44px;
		padding: 0;
	}
	.layer-position {
		margin: 0;
		min-height: 1.4em;
		text-align: end;
	}
	/* The facing switch and its note belong to the layer order above: a hairline at the left marks them as its option. */
	.layer-option {
		display: grid;
		gap: 8px;
		padding-inline-start: 12px;
		border-inline-start: 2px solid var(--bu-line);
	}
	.layer-scope {
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
	/* The hand settings open the column: a line below them instead of above. */
	.hand-rules {
		padding-block: 0 12px;
		border-block-start: 0;
		border-block-end: 1px solid var(--bu-line);
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
		.layer-preview,
		.layer-controls {
			grid-column: 1;
		}
		/* One column: the outfit preview still comes first. */
		.layer-preview {
			order: -1;
			grid-row: auto;
			position: relative;
			top: auto;
			justify-self: center;
		}
	}
</style>
