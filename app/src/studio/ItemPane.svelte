<script lang="ts">
	import { untrack } from 'svelte';
	import { currentItemDrawing } from './settingsDefaults.svelte.ts';
	import { setPanelOpen } from './experience/state.svelte.ts';
	import Sheet from './Sheet.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { canEditItemAppearance } from './appearanceSource.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { displayMessage, displayNestedMessage, errorMessage } from '../lib/i18n.ts';
	import { toast } from './state.svelte.ts';
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
	import type { Img } from '../lib/image/png.ts';
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
	import SpritePreview from './SpritePreview.svelte';
	import {
		HEALTH_LABEL,
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
		toggleHide,
		toggleTwoHanded,
		otherHandOf,
		itemHiders,
		showHiddenItem,
		moveLayer,
		itemLayerNeighbors,
		resetLayer,
		removeItem,
		isDemo,
		openNewItem,
		openAppearance,
		withKey,
		startMove,
		queueMoves,
		pendingMoves,
		moving,
		settingUp,
		matchItemPalette,
		acceptItemIssues,
		showFrame,
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
		EyeOff,
		Grid2x2,
		Layers2,
		Maximize,
		Palette,
		RefreshCw,
		Trash,
		TriangleAlert,
		Puzzle
	} from './icons.ts';

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
	const ladder = $derived(m && it ? defaultFrontOrder(m, it) : []);
	const customOrder = $derived(
		JSON.stringify(
			m?.slots
				.find((slot) => slot.id === it?.slot)
				?.zOverrides?.filter((rule) => rule.layer === 'fg') ?? []
		) !== JSON.stringify(ladder)
	);
	const on = $derived(!!it && doc.items[it.slot] === it.id && !doc.drafts[it.slot]);
	let wearButton = $state<HTMLButtonElement>();
	const hiders = $derived(it ? itemHiders(it.slot) : []);
	const hiddenNow = $derived(hiders.length > 0);
	const neighbors = $derived(it ? itemLayerNeighbors(it.id) : null);
	const health = $derived(m && it ? healthOf(m, it) : 'demo');
	const anim = $derived(m?.rig.animations.find((a) => a.id === ui.anim));
	const made = $derived(m ? moveDirs(m, ui.anim) : []);
	// Cache a shared crop across every frame and direction, rather than resizing the strip on each playback tick.
	const previews = $derived(view.project && it ? itemPreviewFrames(view.project, it, ui.anim) : []);
	const strip = $derived(previews[ui.frame % previews.length] ?? []);
	const previewDirections = $derived(
		m?.rig.directions.flatMap((direction, index) =>
			it &&
			made.includes(direction.id) &&
			it.layers.some((layer) => {
				const cells = layer.cells?.[ui.anim];
				return (cells?.[direction.id] ?? cells?.[direction.mirrorOf ?? direction.id])?.some(
					Boolean
				);
			})
				? [{ direction, index }]
				: []
		) ?? []
	);
	let expanded = $state.raw<{ image: Img; title: string } | null>(null);
	const k = $derived(
		strip.length
			? Math.max(1, Math.floor(Math.min(60 / strip[0].w, 72 / strip[0].h, 6) * ui.dpr))
			: 1
	);
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
	// The project manifest is raw state: an edit to an item's or slot's fields is announced by `bump()` through doc.rev,
	// so these derived values read it to refresh the chips and Reset after toggleHide or moveLayer.
	const hides = $derived.by(() => {
		void doc.rev;
		return m && it ? hidesOf(m, it) : [];
	});
	const tucks = $derived.by(() => {
		void doc.rev;
		return it
			? (m?.slots.find((s) => s.id === it.slot)?.clips ?? []).filter(
					(s) => others.includes(s) && !hides.includes(s)
				)
			: [];
	});
	const gaps = $derived(m && it ? coverageGaps(m, it) : []);
	// B10: views of the shown move this item has no frames for (it would vanish there)
	const moveGaps = $derived(
		gaps.filter((g) => g.startsWith(`${ui.anim}/`)).map((g) => g.split('/')[1])
	);
	const moveName = $derived(displayMove(ui.anim, moveRefs));
	const sourceDir = $derived(m?.rig.directions.find((d) => d.id === ui.dir)?.mirrorOf ?? ui.dir);
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
	// Views kept without poses are named with their way on (make the move again there).
	const redo = $derived(setupRedoMoves(store.exportRecord));
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
	// Required plan tiers come from the mandatory steps of each offered spec, not from the API preview.
	const offerTier = (offer: { specs: MoveSpec[] } | null) =>
		m ? Math.max(0, ...(offer?.specs ?? []).map((s) => moveMinimumTier(m, s))) : 0;
	const tierBlocked = (required: number) =>
		tierDecision(app.balance, { required }).kind === 'required';
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
	// The character's actual missing moves, regardless of their names or when they were imported.
	const missingMoves = $derived.by(() => {
		if (!m || !it || isDemo()) return [];
		const pending = pendingMoves(doc.id, it.id).map((s) => s.id);
		return missingItemMoves(m, it.id, currentItemDrawing(), 0, store.project?.images).filter(
			(s) => !pending.includes(s.id)
		);
	});
	// Moves whose views were all kept without poses get no offer; they are named so the user knows to make them again.
	const unposedMoves = $derived(
		m && it && !isDemo() ? unposedItemMoves(m, it.id, currentItemDrawing(), redo) : []
	);
	const moveOptions = $derived(
		m ? missingMoves.map((spec) => ({ spec, offer: itemMoveOffer(m, [spec], redo) })) : []
	);
	const availableMoves = $derived(
		moveOptions.filter(({ offer }) => offer.gens != null).map(({ spec }) => spec.id)
	);
	let chosenMoves = $state<string[] | null>(null);
	const selectedMoves = $derived(
		chosenMoves ??
			availableMoves.filter((id, index) =>
				availableMoves.includes(ui.anim) ? id === ui.anim : index === 0
			)
	);
	const selectedSpecs = $derived(
		missingMoves.filter(
			(spec) => selectedMoves.includes(spec.id) && availableMoves.includes(spec.id)
		)
	);
	const missingOffer = $derived(
		m && selectedSpecs.length ? itemMoveOffer(m, selectedSpecs, redo) : null
	);
	const missingTier = $derived(offerTier(missingOffer));
	function selectMove(id: string, checked: boolean) {
		chosenMoves = checked ? [...selectedMoves, id] : selectedMoves.filter((move) => move !== id);
	}
	// Every move and State the body has views for, marked drawn or missing for this item (same rules as clipMissingItems).
	const coverage = $derived(
		m && it
			? playbackClips(m.rig.animations).flatMap(({ key }) => {
					const drawn = itemClipDrawn(m, it!.id, key);
					return drawn == null ? [] : [{ id: key, name: displayMove(key, moveRefs), drawn }];
				})
			: []
	);
	const coverageMissing = $derived(coverage.filter((clip) => !clip.drawn).length);
	function makeMissing() {
		if (!missingOffer?.specs.length || missingOffer.gens == null || tierBlocked(missingTier))
			return;
		const projectId = doc.id,
			specs = seeded($state.snapshot(missingOffer.specs));
		withKey(() => {
			void queueMoves(projectId, specs);
			ui.sheet = 'move';
		}, missingTier);
	}
	let colorPlan = $state<ItemPaletteRepairPlan | null>(null);
	// The pending-work notice explains a disabled action, so it shows only while one it covers is actually waiting.
	const pendingBlocks = $derived(
		(repairBusy && (!!repairSpec || !!colorPlan)) ||
			(acceptWaits && (it?.qa?.status === 'warn' || it?.qa?.status === 'fail'))
	);
	let colorBusy = $state(false);
	let colorError = $state<Message | string>('');
	let colorDone = $state<{ pixels: number; frames: number }>();
	const colorScope = $derived(`${doc.id}|${it?.id ?? ''}|${anim?.id ?? ''}|${sourceDir}`);
	$effect(() => {
		void colorScope;
		colorError = '';
		colorDone = undefined;
	});
	$effect(() => {
		const projectId = doc.id,
			itemId = it?.id,
			animId = anim?.id,
			dir = sourceDir;
		void doc.rev;
		let current = true;
		colorPlan = null;
		if (!isDemo() && itemId && animId)
			void itemPaletteRepairPlan(projectId, itemId, animId, dir)
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
			animId = anim.id,
			dir = sourceDir,
			reviewed = $state.snapshot(colorPlan);
		const sameView = () =>
			doc.id === projectId && it?.id === itemId && anim?.id === animId && sourceDir === dir;
		colorBusy = true;
		colorError = '';
		colorDone = undefined;
		try {
			await matchItemPalette(projectId, itemId, animId, dir, reviewed);
			if (sameView())
				colorDone = { pixels: reviewed.changedPixels, frames: reviewed.changedFrames.length };
		} catch (e) {
			if (sameView()) colorError = errorMessage(e);
		} finally {
			colorBusy = false;
		}
	}
	const designReasons = $derived(
		uniqueBy(
			(it?.designWarnings ?? []).flatMap((reason) => reason.split('; ')).map(plainReasonMessage),
			displayMessage
		).map(displayMessage)
	);
	const notes = $derived(
		m && it ? refitNotes(m, it, t, { direction: directionName, list: formatList }) : []
	);
	// A copy without its own standing design (a re-fit, or a copy whose standing views differ) cannot be extended to more
	// moves: only an item made for this character can.
	const remakeOnly = $derived(!!m && !!it?.copiedFrom && !extendable(m, it.id));
	const freeFrames = $derived(it ? (shared.free[it.id] ?? 0) : 0);
	// Standing views this item lacks that its own saved designs can fill for free, whatever move is shown.
	const restorable = $derived(
		m && it && !isDemo() ? restorableViews(m, it).map((key) => key.split('/')[1]) : []
	);
	let artworkOpen = $state(untrack(() => restorable.length > 0));
	let movesOpen = $state(untrack(() => !previewDirections.length && missingMoves.length > 0));
	// A re-fit's checks were measured on the source body; its fit notes replace them. An unfitted copy keeps its source's pixels,
	// so the source's findings (a grip in the wrong hand) still describe them.
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
	// Only worn items (and the body) have a section in the Colors tab.
	const recolorable = $derived(!!m && !!it && on && m.materials.some((x) => x.owner === it.id));
	function recolor() {
		if (!it) return;
		ui.colorsFocus = it.id;
		ui.tab = 'colors';
		setPanelOpen(true);
		ui.sheet = null;
	}
	let confirmRemove = $state(false);
	let onlyDir = $state(false);
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
</script>

{#snippet sectionTitle(label: string, note?: string)}
	<summary>
		<ChevronRight size={16} aria-hidden="true" />
		<span>{label}</span>
		{#if note}<span class="section-note muted">{note}</span>{/if}
	</summary>
{/snippet}

<Sheet
	title={it?.name ?? t('studio.titleItem')}
	className="item-detail"
	onclose={() => (ui.sheet = null)}
>
	{#snippet heading()}
		{#if it}
			<div class="item-meta">
				<span>{slotName(it.slot)}</span>
				{#if health !== 'demo' || isDemo()}
					<span class="badge {health}">{displayMessage(HEALTH_LABEL[health])}</span>
				{/if}
			</div>
		{/if}
	{/snippet}
	{#snippet developer()}
		<ApiPeek
			targets={[
				...(m && it && !(freeFrames && it.copiedFrom && !isDemo()) && missingOffer
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
								label: t('itemPane.repairItem'),
								plan:
									repairOffer?.specs[0] && m ? movePlan({ manifest: m }, repairOffer.specs[0]) : []
							},
							{
								scope: 'item-redraw',
								label: t('itemPane.redrawItem'),
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
		<div class="item-workbench">
			<div class="preview-toolbar">
				<span class="preview-move">{moveName}</span>
				<button
					bind:this={wearButton}
					class="bu-action btn"
					data-variant={on ? 'outline' : 'primary'}
					data-item-wear-toggle
					onclick={() => wear(it.id)}
				>
					{on ? t('common.takeOff') : t('common.wear')}
				</button>
			</div>
			{#if strip.length && previewDirections.length}
				<div
					class="item-views"
					style:--cols={previewDirections.length}
					style:--compact-cols={Math.min(4, previewDirections.length)}
					role="group"
					aria-label={t('itemPane.nameInEveryDirection', { name: it.name })}
				>
					{#each previewDirections as { direction: d, index } (d.id)}
						{@const frame = strip[index]}
						{@const title = t('itemPane.labelNameFacingId', {
							name: it.name,
							id: displayDirection(d.id)
						})}
						{#if frame}
							<button
								class="bu-action item-view"
								data-variant="quiet"
								aria-haspopup="dialog"
								aria-label={t('itemPane.openSprite', { title })}
								onclick={() => (expanded = { image: frame, title })}
							>
								<span aria-hidden="true"><Sprite img={frame} {k} limit={52} label={title} /></span>
								<span class="view-caption">
									{displayDirectionShort(d.id)}<Maximize size={12} aria-hidden="true" />
								</span>
							</button>
						{/if}
					{/each}
				</div>
			{:else}
				<p class="muted small">{t('itemPane.previewUnavailable')}</p>
			{/if}
			{#if hiddenNow}
				<div class="hidden-row">
					<EyeOff size={16} aria-hidden="true" />
					<span
						>{t('itemPane.hiddenByItem', {
							name: formatList(hiders.map((hider) => hider.name))
						})}</span
					>
					<button
						class="bu-action btn plain"
						data-variant="quiet"
						onclick={() => {
							showHiddenItem(it.slot);
							wearButton?.focus({ preventScroll: true });
						}}>{t('itemPane.showName', { name: it.name })}</button
					>
				</div>
			{/if}
			{#if it.unfitted}<p class="notice warn small">
					<Puzzle size={14} />{unfitText(
						m,
						it.copiedFrom?.name ?? t('studioModel.anotherCharacter'),
						it.unfitted,
						t
					)}{#if !isDemo()}{' '}{t('itemPane.remakeToFit', { name: m.name })}{/if}
				</p>{/if}
			{#if health === 'stale'}<p class="notice warn small">
					<TriangleAlert size={14} />{t('itemPane.madeForAnotherBodyItMayNot')}
				</p>{/if}

			{#if moveGaps.length}<p class="notice warn small">
					<TriangleAlert size={14} />{t('itemPane.moveGaps', {
						move: moveName,
						directions:
							getLocale() === 'en' ? moveGaps.join(', ') : formatList(moveGaps.map(directionName))
					})}{#if remakeOnly && !isDemo() && !freeFrames}
						{t('itemPane.remakeAllMoves', { name: m.name })}{/if}
				</p>{/if}

			{#if !isDemo() && pendingBlocks}
				<p class="notice small" role="status">
					{t('itemPane.pendingWorkBusy')}
					<button
						class="bu-action btn sm plain"
						data-variant="quiet"
						onclick={() => void openPendingWork({ flows: true })}
						>{openerLabel(t('deleteSheet.viewPendingWork'))}<SurfaceChevron /></button
					>
				</p>
			{/if}
			<div class="item-sections">
				<details class="bu-details item-disclosure" bind:open={artworkOpen}>
					{@render sectionTitle(t('itemPane.artworkSection'))}
					<div class="stack">
						<div class="editor-actions">
							{#if recolorable}
								<!-- Colors live in the Colors tab; this opens it on the item's own section. -->
								<button
									class="bu-action btn plain recolor-link"
									data-variant="quiet"
									onclick={recolor}><Palette size={14} />{t('itemPane.recolor')}</button
								>
							{/if}
							<button
								class="bu-action btn plain"
								data-variant="quiet"
								onclick={() => openFrames(it.id)}
								><Grid2x2 size={14} />{openerLabel(t('fixFrames.open'))}<SurfaceChevron /></button
							>
						</div>
						{#if !isDemo() && (it.prompt || canEditItemAppearance(m, it))}
							<div class="item-creation">
								<h3>{t('itemPane.makeAnother')}</h3>
								<div class="editor-actions">
									{#if !isDemo() && canEditItemAppearance(m, it)}
										<button
											class="bu-action btn plain"
											data-variant="quiet"
											aria-haspopup="dialog"
											onclick={() => openAppearance(doc.id, it.id, 'item')}
											>{t('appearance.action')}<SurfaceChevron /></button
										>
									{/if}
									{#if !isDemo() && it.prompt}
										<!-- A fitted copy is remade for this body like any shared item that does not fit it, named from its description. -->
										<button
											class="bu-action btn plain"
											data-variant="quiet"
											onclick={() =>
												openNewItem(it.slot, {
													slot: it.slot,
													prompt: it.prompt,
													route: it.route
												})}
											><RefreshCw size={14} />{openerLabel(
												remakeOnly
													? t('itemMenu.makeOneForName', { name: m.name })
													: t('itemMenu.createVariant')
											)}<SurfaceChevron /></button
										>
									{/if}
								</div>
							</div>
						{/if}
						{#if restorable.length}
							<div class="field">
								<button
									class="bu-action btn"
									data-variant="primary"
									disabled={!!shared.adding}
									onclick={() => restoreFromDesign(it.id)}
									>{t('itemPane.restoreStanding', { count: restorable.length })}
									<span class="cost">{t('common.free')}</span></button
								>
								<p class="faint small">
									{t('itemPane.restoreStandingHint', {
										count: restorable.length,
										directions: formatList(restorable.map(directionName))
									})}
								</p>
							</div>
						{/if}
						{#if !isDemo() && colorPlan}
							<div class="field">
								<button
									class="bu-action btn"
									data-variant="outline"
									disabled={colorBusy || repairBusy}
									onclick={matchColors}
									>{colorBusy ? t('itemPane.matchingColors') : t('itemPane.matchItemColors')}
									<span class="cost">{t('common.free')}</span></button
								>
								<p class="faint small">
									{t('itemPane.colorMatchNote', {
										pixels: t('itemPane.pixels', {
											count: colorPlan.changedPixels,
											n: number(colorPlan.changedPixels)
										}),
										move: moveName,
										count: colorPlan.changedFrames.length,
										n: number(colorPlan.changedFrames.length),
										direction:
											getLocale() === 'en'
												? sourceDir.replaceAll('-', ' ')
												: directionName(sourceDir)
									})}
									{#if sourceDir !== ui.dir}{t('itemPane.itsMirroredViewsUpdateToo')}{/if}
									{t('itemPane.colorMatchFixed')}
									{#if colorPlan.missingFrames.length}{t('itemPane.colorMatchMissing', {
											frames: formatList(colorPlan.missingFrames.map((frame) => frame + 1))
										})}{/if}
									{#if colorPlan.unmatchedPixels}{t('itemPane.colorMatchUnmatched', {
											count: colorPlan.unmatchedPixels,
											n: number(colorPlan.unmatchedPixels)
										})}{/if}
									{t('itemPane.colorMatchFree')}
								</p>
							</div>
						{/if}
						{#if colorError}<p class="notice bad small">
								<TriangleAlert size={14} />{displayMessage(colorError)}<ReportButton
									error={colorError}
								/>
							</p>{/if}
						{#if colorDone}<p class="notice small">
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
						{#if !isDemo() && repairSpec}
							<details class="bu-details item-disclosure replace-frames">
								{@render sectionTitle(t('itemPane.replaceFrames'))}
								<div class="stack">
									<p class="faint small">
										{t(
											m?.rig.directions.some((direction) => direction.mirrorOf === sourceDir)
												? 'itemPane.updateNoteMirrors'
												: 'itemPane.updateNote',
											{
												move: moveName,
												direction:
													getLocale() === 'en'
														? sourceDir.replaceAll('-', ' ')
														: directionName(sourceDir)
											}
										)}
									</p>
									{#each [{ id: 'repair', label: t('itemPane.repairView'), feature: t('itemPane.repairFeature'), offer: repairOffer, help: t('itemPane.repairHelp') }, { id: 'redraw', label: t('itemPane.redrawView'), feature: t('itemPane.redrawFeature'), offer: redrawOffer, help: t('itemPane.redrawHelp') }] as choice (choice.id)}
										{@const tier = offerTier(choice.offer)}
										{@const spec = choice.offer?.specs[0]}
										{@const plan = m && spec ? movePlan({ manifest: m }, spec) : []}
										{@const requests = plan.filter((call) => call.method === 'POST').length}
										<span class="api-action">
											<button
												class="bu-action btn"
												data-variant="outline"
												disabled={repairBusy || choice.offer?.gens == null || tierBlocked(tier)}
												aria-describedby={tierBlocked(tier)
													? `item-${choice.id}-tier`
													: `item-${choice.id}-help item-repair-billing`}
												onclick={() => repairFrames(choice.offer, tier)}
												>{choice.label}
												<span class="cost"
													>{choice.offer?.gens == null
														? t('common.unavailable')
														: t('moves.estimate', {
																gens: number(Math.ceil(choice.offer.gens))
															})}</span
												></button
											>
										</span>
										<p class="faint small" id={`item-${choice.id}-help`}>
											{choice.help}{#if requests > 1}
												{t(
													choice.id === 'repair'
														? 'itemPane.repairRequests'
														: 'itemPane.redrawRequests',
													{
														count: requests,
														n: number(requests)
													}
												)}{/if}
											{#if choice.id === 'redraw' && redrawOffer?.gens != null && repairOffer?.gens != null && redrawOffer.gens < repairOffer.gens}
												{@const saved = Math.ceil(repairOffer.gens) - Math.ceil(redrawOffer.gens)}
												{t('itemPane.redrawSaves', { count: saved, n: number(saved) })}
											{:else if choice.id === 'redraw' && redrawOffer?.gens != null && repairOffer?.gens != null && redrawOffer.gens > repairOffer.gens}
												{@const extra = Math.ceil(redrawOffer.gens) - Math.ceil(repairOffer.gens)}
												{t('itemPane.redrawCostsMore', { count: extra, n: number(extra) })}
											{/if}
										</p>
										{#if choice.offer?.error}<p class="notice warn small" role="status">
												{displayMessage(choice.offer.error)}
											</p>{/if}
										{#if tier}<TierNotice
												id={`item-${choice.id}-tier`}
												minimumTier={tier}
												feature={choice.feature}
											/>{/if}
									{/each}
									<p class="faint small" id="item-repair-billing">{t('itemPane.billingNote')}</p>
								</div>
							</details>
						{/if}
					</div>
				</details>

				{#if coverage.length || missingMoves.length || unposedMoves.length || (freeFrames && it.copiedFrom && !isDemo())}
					<details class="bu-details item-disclosure" bind:open={movesOpen}>
						{@render sectionTitle(
							t('itemPane.movesSection'),
							coverageMissing
								? t('itemPane.coverageMissing', {
										count: coverageMissing,
										n: number(coverageMissing)
									})
								: undefined
						)}
						<div class="stack">
							{#if freeFrames && it.copiedFrom && !isDemo()}
								<!-- An exact copy whose source item gained frames for this body since: copied over for free, not made again. -->
								<div class="field">
									<button
										class="bu-action btn"
										data-variant="outline"
										disabled={!!shared.adding}
										onclick={() => copyFromSource(it.id)}
										>{t('itemPane.copyFrom', { name: it.copiedFrom.name })}
										<span class="cost">{t('common.free')}</span></button
									>
									<p class="faint small">
										{t('itemPane.copyFrames', {
											from: it.copiedFrom.name,
											name: m.name,
											count: freeFrames,
											n: number(freeFrames)
										})}
									</p>
								</div>
							{/if}

							{#if missingMoves.length && !(freeFrames && it.copiedFrom && !isDemo())}
								<fieldset class="move-picker">
									<legend>{t('itemPane.drawForMoves')}</legend>
									{#if availableMoves.length > 1}
										{@const allSelected = availableMoves.every((id) => selectedMoves.includes(id))}
										<button
											type="button"
											class="bu-action btn sm plain selection-action"
											data-variant="quiet"
											onclick={() => (chosenMoves = allSelected ? [] : [...availableMoves])}
										>
											{t(allSelected ? 'itemPane.clearSelection' : 'itemPane.selectAllMoves')}
										</button>
									{/if}
									{#each moveOptions as { spec, offer } (spec.id)}
										<label class="move-choice bu-check">
											<input
												type="checkbox"
												checked={selectedSpecs.some((move) => move.id === spec.id)}
												disabled={offer.gens == null}
												onchange={(event) => selectMove(spec.id, event.currentTarget.checked)}
											/>
											<span
												>{displayMove(spec.id, moveRefs)}
												{#if offer.error}<small class="muted">{displayMessage(offer.error)}</small
													>{/if}
											</span>
											<span class="muted"
												>{offer.gens == null
													? t('common.unavailable')
													: t('moves.estimate', { gens: number(Math.ceil(offer.gens)) })}</span
											>
										</label>
									{/each}
								</fieldset>
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
									<p class="muted small" id="item-missing-help">{t('itemPane.drawMovesHelp')}</p>
									<button
										class="bu-action btn"
										data-variant="primary"
										disabled={missingOffer?.gens == null || tierBlocked(missingTier)}
										aria-describedby={tierBlocked(missingTier)
											? 'item-missing-tier'
											: 'item-missing-help'}
										onclick={makeMissing}
									>
										{t('itemPane.drawSelected')}
										{#if missingOffer?.gens != null}<span class="cost"
												>{t('moves.estimate', { gens: number(Math.ceil(missingOffer.gens)) })}</span
											>{/if}
									</button>
								</div>
							{/if}
							{#each unposedMoves as { note }, i (i)}<p class="notice warn small">
									{displayNestedMessage(note)}
								</p>{/each}
							{#if coverage.length}
								<div class="field">
									<span class="sec-title">{t('itemPane.coverageTitle')}</span>
									<ul class="coverage-list" aria-label={t('itemPane.coverageTitle')}>
										{#each coverage as clip (clip.id)}
											<li
												class={['coverage-clip', { missing: !clip.drawn }]}
												aria-label={t(
													clip.drawn
														? 'itemPane.coverageClipDrawn'
														: 'itemPane.coverageClipMissing',
													{ move: clip.name }
												)}
											>
												{#if clip.drawn}<Check size={12} strokeWidth={2.5} />{:else}<TriangleAlert
														size={12}
													/>{/if}<span>{clip.name}</span>
											</li>
										{/each}
									</ul>
									{#if !coverageMissing}<p class="faint small">
											{t('itemPane.coverageAllDrawn')}
										</p>{/if}
								</div>
							{/if}
						</div>
					</details>
				{/if}

				<details class="bu-details item-disclosure">
					{@render sectionTitle(t('itemPane.outfitSection'))}
					<div class="stack outfit-settings">
						<section class="stack" aria-label={t('itemPane.layerOrder')}>
							<div class="layer-heading">
								<h3><Layers2 size={16} aria-hidden="true" />{t('itemPane.layerOrder')}</h3>
								{#if customOrder}
									<button
										class="bu-action btn sm plain"
										data-variant="quiet"
										onclick={() => resetLayer(it.id, ladder)}>{t('itemPane.reset')}</button
									>
								{/if}
							</div>
							<div class="layer-actions">
								<button
									class="bu-action btn"
									data-variant="outline"
									disabled={!neighbors?.behind}
									onclick={() => moveLayer(it.id, -1, onlyDir)}
									><ArrowDown size={16} />{t('itemPane.sendBackward')}</button
								>
								<button
									class="bu-action btn"
									data-variant="outline"
									disabled={!neighbors?.ahead}
									onclick={() => moveLayer(it.id, 1, onlyDir)}
									><ArrowUp size={16} />{t('itemPane.bringForward')}</button
								>
							</div>
							{#if hiddenNow}
								<p class="muted small">{t('itemPane.layerHiddenHint')}</p>
							{:else}
								<p class="muted small">
									{t('itemPane.layerCategory', { slot: slotName(it.slot) })}
								</p>
								{#if neighbors?.behind || neighbors?.ahead}
									<div class="layer-position muted small" aria-live="polite">
										{#if neighbors.behind}<span
												>{t('itemPane.inFrontOf', { name: neighbors.behind })}</span
											>{/if}
										{#if neighbors.ahead}<span
												>{t('itemPane.behind', { name: neighbors.ahead })}</span
											>{/if}
									</div>
								{/if}
							{/if}
							<label class="switch-row bu-check">
								<span>{t('itemPane.onlyFacing', { direction: displayDirection(ui.dir) })}</span>
								<input class="bu-switch" type="checkbox" role="switch" bind:checked={onlyDir} />
							</label>
						</section>
						{#if hideChoices.length}
							<section class="stack visibility-settings" aria-label={t('itemPane.whenWornHide')}>
								<h3><EyeOff size={16} aria-hidden="true" />{t('itemPane.whenWornHide')}</h3>
								<div class="visibility-list" role="group" aria-label={t('itemPane.whenWornHide')}>
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
								{#if tucks.length}<p class="muted small">
										{t('itemPane.tuckNote', { slots: formatList(tucks.map(slotName)) })}
									</p>{/if}
							</section>
						{/if}
					</div>
				</details>
				{#if designReasons.length || reasons.length || notes.length || health === 'look' || health === 'accepted'}
					<details class="bu-details item-disclosure">
						{@render sectionTitle(t('itemPane.qualityChecks'))}
						<div class="stack">
							<!-- A re-fit names its source's design findings among its fit notes, on this body's frames. -->
							<!-- An unfitted copy keeps its source's pixels, so the source's accepted design findings still describe them. -->
							{#if designReasons.length && !it.refit}
								<div class="field">
									<span class="sec-title">{t('itemPane.acceptedAppearanceWarnings')}</span>
									<ul class="reasons small">
										{#each designReasons as reason (reason)}<li>
												<TriangleAlert size={12} />{reason}
											</li>{/each}
									</ul>
								</div>
							{/if}
							{#if (health === 'look' || health === 'unfitted' || health === 'accepted') && reasons.length}
								<ul class="reasons small">
									{#each reasons as r (r)}<li><TriangleAlert size={12} />{r}</li>{/each}
								</ul>
							{/if}
							{#if notes.length}
								<div class="field">
									<p class="small" id="refit-{it.id}">
										{t('itemPane.refitIntro', {
											from: it.copiedFrom?.name ?? t('studioModel.anotherCharacter')
										})}
									</p>
									<ul class="refit-notes" aria-labelledby="refit-{it.id}">
										{#each notes as note (note.text)}<li>
												<button
													class="bu-action btn sm plain"
													data-variant="quiet"
													title={t('itemPane.titleShowThisFrame')}
													onclick={() => {
														showFrame(note.anim, note.dir, note.frame);
														// The details sheet covers the stage: close it to show the frame.
														if (ui.sheet === 'item') ui.sheet = null;
													}}><TriangleAlert size={12} />{note.text}</button
												>
											</li>{/each}
									</ul>
								</div>
							{/if}
							<!-- A re-fit's issues are its fit, which only a new item for this body fixes: nothing to accept. -->
							{#if !isDemo() && !it.refit && !it.unfitted && health === 'look' && it.qa && (it.qa.status === 'warn' || it.qa.status === 'fail')}
								<div class="field">
									<!-- "Accept it as it is" is not on offer when keeping is refused, so only the refusal speaks. -->
									{#if !(gaps.length && keepRefusal)}<p class="notice warn small">
											{t('itemPane.checksFoundIssuesNoPaidRetryWas')}
										</p>{/if}
									{#if gaps.length && keepRefusal}
										<!-- Says why it cannot be kept as it is: the missing frames are the way on, offered below. -->
										<p class="small">{displayMessage(errorMessage(keepRefusal))}</p>
									{:else if gaps.length}<button
											class="bu-action btn"
											data-variant="outline"
											disabled={acceptingIssues || acceptWaits}
											onclick={() => acceptIssues(true)}>{t('itemPane.keepWithoutMoves')}</button
										>
										<p class="faint small">
											{t('itemPane.keepWithoutMovesDetail', {
												moves: formatList(keepWithout.map((move) => displayMove(move, moveRefs)))
											})}
										</p>
									{:else}<button
											class="bu-action btn"
											data-variant="outline"
											disabled={acceptingIssues || acceptWaits}
											onclick={() => acceptIssues()}>{t('itemPane.acceptAsIs')}</button
										>
										<p class="faint small">
											{t('itemPane.acceptsTheCurrentArtworkWithoutSpendingCredits')}
										</p>{/if}
									{#if acceptanceError}<p class="notice bad small" role="alert">
											{displayMessage(acceptanceError)}<ReportButton error={acceptanceError} />
										</p>{/if}
								</div>
							{:else if health === 'accepted'}
								<p class="muted small">{t('itemPane.youAcceptedThisArtworkWithItsRecorded')}</p>
							{/if}
						</div>
					</details>
				{/if}
				<details class="bu-details item-disclosure">
					{@render sectionTitle(t('itemPane.howItWasMade'))}
					<div><GenerationDetails {m} {it} /></div>
				</details>

				<details class="bu-details item-disclosure">
					{@render sectionTitle(t('itemPane.technicalDetails'))}
					<div>
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
									<dd>
										{t('itemPane.reusedCellsWereNotMeasuredByPixelLab')}
									</dd>
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
				{#if !isDemo()}
					<div class="item-management">
						<button
							class="bu-action btn plain danger"
							data-variant="quiet"
							aria-haspopup="dialog"
							onclick={() => (confirmRemove = true)}
						>
							<Trash size={16} />{openerLabel(t('itemMenu.labelDeleteItem'))}<SurfaceChevron />
						</button>
					</div>
				{/if}
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

	{#if expanded}
		<SpritePreview {...expanded} onclose={() => (expanded = null)} />
	{/if}
</Sheet>

<style>
	.item-workbench,
	.stack {
		display: grid;
		gap: 12px;
	}
	.item-workbench {
		container-type: inline-size;
	}
	.item-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 4px 8px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	:global(.item-detail .sheet-heading) {
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px 10px;
	}
	.preview-toolbar,
	.hidden-row,
	.layer-heading,
	.paid-action,
	.switch-row {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: space-between;
	}
	.preview-toolbar .btn,
	.layer-actions .btn,
	.paid-action .btn {
		min-height: 44px;
	}
	.preview-move {
		min-width: 0;
		overflow-wrap: anywhere;
		font-weight: 600;
	}
	.preview-toolbar .btn {
		flex: none;
	}
	.item-views {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		background: var(--stage);
		border-radius: var(--r-card);
	}
	@container (max-width: 460px) {
		.item-views {
			grid-template-columns: repeat(var(--compact-cols), minmax(0, 1fr));
		}
	}
	.item-view {
		display: grid;
		grid-template-rows: 60px auto;
		justify-content: stretch;
		justify-items: center;
		align-items: center;
		gap: 2px;
		min-width: 0;
		padding: 8px 0 4px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.view-caption {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.hidden-row {
		justify-content: start;
		flex-wrap: wrap;
		font-size: var(--fs-sm);
	}
	.hidden-row .btn {
		margin-inline-start: auto;
		min-height: 44px;
	}
	.item-disclosure {
		min-width: 0;
	}
	.item-disclosure :global(summary) {
		display: flex;
		align-items: center;
		gap: 8px;
		list-style: none;
	}
	.item-disclosure :global(summary::-webkit-details-marker) {
		display: none;
	}
	.item-disclosure :global(summary:hover) {
		background: var(--bu-action-hover);
	}
	.item-disclosure :global(summary > svg) {
		flex: none;
		color: var(--text-3);
		transition: transform var(--dur);
	}
	.item-disclosure[open] :global(> summary > svg) {
		transform: rotate(90deg);
	}
	.item-disclosure :global(> div) {
		padding: 4px 0 12px;
	}
	.item-disclosure .section-note {
		margin-inline-start: auto;
		font-size: var(--fs-sm);
		font-weight: 400;
	}
	.editor-actions,
	.visibility-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(184px, 100%), 1fr));
		gap: 4px 12px;
	}
	.editor-actions .btn {
		justify-content: start;
		min-height: 44px;
	}
	.move-picker {
		min-width: 0;
		display: grid;
		gap: 4px;
		border: 0;
		padding: 0;
		margin: 0;
	}
	.move-picker legend,
	.item-creation h3,
	.outfit-settings h3 {
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.selection-action {
		justify-self: end;
	}
	.move-choice {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 6px 2px;
		border-block-end: 1px solid var(--bu-line);
	}
	.move-choice small {
		display: block;
	}
	.move-choice span {
		overflow-wrap: anywhere;
	}
	.paid-action {
		flex-wrap: wrap;
	}
	.paid-action p {
		flex: 1 1 14rem;
	}
	.paid-action .btn {
		margin-inline-start: auto;
	}
	.item-creation h3 {
		margin: 0 0 4px;
	}
	.outfit-settings h3 {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0;
	}
	.layer-actions,
	.layer-position {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.switch-row {
		min-height: 44px;
		font-size: var(--fs-sm);
	}
	.visibility-settings {
		border-block-start: 1px solid var(--bu-line);
		padding-block-start: 12px;
	}
	.coverage-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.coverage-clip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--fs-sm);
		color: var(--ok);
	}
	.coverage-clip span {
		color: var(--text-2);
	}
	.coverage-clip.missing {
		color: var(--warn);
	}
	.item-management {
		border-block-start: 1px solid var(--bu-line);
		display: flex;
		justify-content: end;
	}
	.item-management .btn {
		min-height: 44px;
	}
</style>
