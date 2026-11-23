<script lang="ts">
	import Sheet from './Sheet.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import { toast } from './state.svelte.ts';
	import type { Message } from '../lib/message.ts';
	import { displayDirectionInSentence, displayDirectionShort } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { displayKey } from './displayKey.ts';
	import { coverageGaps, moveDirs } from '../lib/dress/dress.ts';
	import { hiddenSlots, equipped } from '../lib/compose/compose.ts';
	import { SLOTS, slotLadder } from '../lib/items/items.ts';
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
	import { app } from '../lib/app.svelte.ts';
	import { accountTier, tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';
	import PoseIssues from './PoseIssues.svelte';
	import GenerationDetails from './GenerationDetails.svelte';
	import { movePlan } from './apiPlans.ts';
	import ApiPeek from './ApiPeek.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Sprite from './Sprite.svelte';
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
	import { isBuiltin, slotLabelMessage } from './slots.ts';
	import {
		ui,
		doc,
		store,
		view,
		wear,
		toggleHide,
		moveLayer,
		resetLayer,
		removeItem,
		isDemo,
		openNewItem,
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
		CircleCheck,
		Grid2x2,
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
	// The order Reset restores: a built-in's ladder, or a custom category's chosen drawing position (slots.ts setDrawsAbove).
	const ladder = $derived.by(() => {
		const def = m && it ? m.slots.find((s) => s.id === it.slot) : undefined;
		if (!m || !it) return [];
		if (isBuiltin(it.slot))
			return slotLadder(m.rig).find((s) => s.id === it.slot)?.zOverrides ?? [];
		return (def?.zOverrides ?? []).filter(
			(o) => o.layer === 'fg' && !o.dir && !o.anim && o.cell == null && o.z === def?.z
		);
	});
	const on = $derived(!!it && doc.items[it.slot] === it.id && !doc.drafts[it.slot]);
	const hiddenNow = $derived(m && it ? hiddenSlots(m, equipped(m, doc.items)).has(it.slot) : false);
	const health = $derived(m && it ? healthOf(m, it) : 'demo');
	const anim = $derived(m?.rig.animations.find((a) => a.id === ui.anim));
	const made = $derived(m ? moveDirs(m, ui.anim) : []);
	// Cache a shared crop across every frame and direction, rather than resizing the strip on each playback tick.
	const previews = $derived(view.project && it ? itemPreviewFrames(view.project, it, ui.anim) : []);
	const strip = $derived(previews[ui.frame % previews.length] ?? []);
	const k = $derived(
		strip.length
			? Math.max(1, Math.floor(Math.min(60 / strip[0].w, 72 / strip[0].h, 6) * ui.dpr))
			: 1
	);
	const others = $derived(
		m && it
			? m.slots.filter(
					(s) => s.id !== 'body' && s.id !== it.slot && m.items.some((x) => x.slot === s.id)
				)
			: []
	);
	const hides = $derived(
		it ? (it.hides ?? m?.slots.find((s) => s.id === it.slot)?.hides ?? []) : []
	);
	const tucks = $derived(
		it
			? (m?.slots.find((s) => s.id === it.slot)?.clips ?? []).filter(
					(s) => others.some((o) => o.id === s) && !hides.includes(s)
				)
			: []
	);
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
		return missingItemMoves(m, it.id, 0).filter((s) => !pending.includes(s.id));
	});
	// Moves whose views were all kept without poses get no offer; they are named so the user knows to make them again.
	const unposedMoves = $derived(m && it && !isDemo() ? unposedItemMoves(m, it.id, redo) : []);
	let chosenMove = $state('');
	const missingMove = $derived(
		missingMoves.find((s) => s.id === chosenMove) ??
			missingMoves.find((s) => s.id === ui.anim) ??
			missingMoves[0]
	);
	const missingOffer = $derived(m && missingMove ? itemMoveOffer(m, [missingMove], redo) : null);
	const missingTier = $derived(offerTier(missingOffer));
	const missingName = $derived(missingMove ? displayMove(missingMove.id, moveRefs) : '');
	function makeMissing() {
		if (!missingOffer?.specs.length) return;
		const projectId = doc.id,
			seed = 1 + Math.floor(Math.random() * 1_000_000),
			specs = missingOffer.specs.map((s) => ({ ...$state.snapshot(s), seed }));
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
	// The paid repair leads only when the item has something to repair in the shown view and nothing free can fix it.
	const repairLeads = $derived(
		!restorable.length && (health === 'look' || moveGaps.includes(sourceDir))
	);
	// A re-fit's checks were measured on the source body; its fit notes replace them. An unfitted copy keeps its source's pixels,
	// so the source's findings (a grip in the wrong hand) still describe them.
	const reasons = $derived(
		it?.qa && !it.refit
			? qaReasonMessages(
					it.qa,
					SLOTS.find((s) => s.id === it.slot)?.class === 'held',
					it.route === 'skeleton-pose',
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

<Sheet title={t('studio.titleItem')} onclose={() => (ui.sheet = null)}>
	{#snippet developer()}
		<ApiPeek
			targets={[
				...(it && !(freeFrames && it.copiedFrom && !isDemo()) && missingMoves.length
					? [
							{
								scope: 'item-missing-move',
								label: t('itemPane.labelMakeNameForMissingName', { name: it.name, missingName }),
								plan:
									m && missingOffer?.specs[0]
										? movePlan({ manifest: m }, missingOffer.specs[0])
										: []
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
		<div class="insp-body">
			<header class="insp-head">
				<h2 class="insp-title">{it.name}</h2>
				<p class="insp-sub">
					<span>{slotName(it.slot)}</span>
					{#if health !== 'demo' || isDemo()}<span class="badge {health}"
							>{#if health === 'clean'}<CircleCheck
									size={12}
								/>{:else if health === 'unfitted'}<Puzzle
									size={12}
								/>{:else if health !== 'demo'}<TriangleAlert size={12} />{/if}{displayMessage(
								HEALTH_LABEL[health]
							)}</span
						>{/if}
					{#if hiddenNow}<span class="badge">{t('itemPane.hiddenByAnotherItem')}</span>{/if}
				</p>
			</header>

			{#if anim}
				<div
					class="dir-strip"
					style:--preview-width="{Math.max(60, ((strip[0]?.w ?? 0) * k) / ui.dpr)}px"
					aria-label={t('itemPane.nameInEveryDirection', { name: it.name })}
				>
					{#each m.rig.directions as d, i (d.id)}
						{#if strip[i] && made.includes(d.id)}<figure>
								<Sprite
									img={strip[i]}
									{k}
									w={strip[i].w}
									h={strip[i].h}
									limit={72}
									label={t('itemPane.labelNameFacingId', {
										name: it.name,
										id: directionName(d.id)
									})}
								/>{displayDirectionShort(d.id)}
							</figure>{/if}
					{/each}
				</div>
			{/if}

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
			{#if it.unfitted}<p class="notice warn small">
					<Puzzle size={14} />{unfitText(
						m,
						it.copiedFrom?.name ?? t('studioModel.anotherCharacter'),
						it.unfitted,
						t
					)}{#if !isDemo()}{' '}{t('itemPane.remakeToFit', { name: m.name })}{/if}
				</p>{/if}
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
			{#if moveGaps.length}<p class="notice warn small">
					<TriangleAlert size={14} />{t('itemPane.moveGaps', {
						move: moveName,
						directions:
							getLocale() === 'en' ? moveGaps.join(', ') : formatList(moveGaps.map(directionName))
					})}{#if remakeOnly && !isDemo() && !freeFrames}
						{t('itemPane.remakeAllMoves', { name: m.name })}{/if}
				</p>{/if}
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
			{:else if missingMoves.length}
				<div class="field">
					{#if missingMoves.length > 1}<label class="field"
							><span class="label small">{t('itemPane.generateItemForMove')}</span><select
								class="bu-input input"
								value={missingMove?.id}
								onchange={(e) => (chosenMove = e.currentTarget.value)}
								>{#each missingMoves as move (move.id)}<option value={move.id}
										>{displayMove(move.id, moveRefs)}</option
									>{/each}</select
							></label
						>{/if}
					<span class="api-action"
						><button
							class="bu-action btn"
							data-variant="outline"
							disabled={missingOffer?.gens == null || tierBlocked(missingTier)}
							aria-describedby={tierBlocked(missingTier) ? 'item-missing-tier' : undefined}
							onclick={makeMissing}
							>{t('itemPane.makeFor', { move: missingName })}
							<span class="cost"
								>{missingOffer?.gens == null
									? t('common.unavailable')
									: t('moves.estimate', { gens: number(Math.ceil(missingOffer.gens)) })}</span
							></button
						></span
					>
					{#if missingOffer?.error}<p class="notice warn small" role="status">
							{displayMessage(missingOffer.error)}
						</p>{/if}
					{#each missingOffer?.unposed ?? [] as note, i (i)}<p class="notice warn small">
							{displayMessage(note)}
						</p>{/each}
					<PoseIssues issues={missingOffer?.poseIssues ?? []} />
					{#if missingTier}<TierNotice
							id="item-missing-tier"
							minimumTier={missingTier}
							feature={t('itemPane.makingMoreMoves')}
						/>{/if}
					<p class="faint small">
						{t('itemPane.generatesOnlyThisItemSMissingViews')}
					</p>
				</div>
			{/if}
			{#each unposedMoves as { note }, i (i)}<p class="notice warn small">
					{displayMessage(note)}
				</p>{/each}
			{#if health === 'stale'}<p class="notice warn small">
					<TriangleAlert size={14} />{t('itemPane.madeForAnotherBodyItMayNot')}
				</p>{/if}

			{#if !isDemo() && repairSpec}
				<div class="field">
					<p class="faint small">
						{t(
							m?.rig.directions.some((direction) => direction.mirrorOf === sourceDir)
								? 'itemPane.updateNoteMirrors'
								: 'itemPane.updateNote',
							{
								move: moveName,
								direction:
									getLocale() === 'en' ? sourceDir.replaceAll('-', ' ') : directionName(sourceDir)
							}
						)}
					</p>
					{#each [{ id: 'repair', label: t('itemPane.repairItem'), feature: t('itemPane.repairFeature'), offer: repairOffer, help: t('itemPane.repairHelp') }, { id: 'redraw', label: t('itemPane.redrawItem'), feature: t('itemPane.redrawFeature'), offer: redrawOffer, help: t('itemPane.redrawHelp') }] as choice (choice.id)}
						{@const tier = offerTier(choice.offer)}
						{@const spec = choice.offer?.specs[0]}
						{@const plan = m && spec ? movePlan({ manifest: m }, spec) : []}
						{@const requests = plan.filter((call) => call.method === 'POST').length}
						<span class="api-action">
							<button
								class="bu-action btn"
								data-variant={choice.id === 'repair' && repairLeads ? 'primary' : 'outline'}
								disabled={repairBusy || choice.offer?.gens == null || tierBlocked(tier)}
								aria-describedby={tierBlocked(tier)
									? `item-${choice.id}-tier`
									: `item-${choice.id}-help item-repair-billing`}
								onclick={() => repairFrames(choice.offer, tier)}
								>{choice.label}
								<span class="cost"
									>{choice.offer?.gens == null
										? t('common.unavailable')
										: t('moves.estimate', { gens: number(Math.ceil(choice.offer.gens)) })}</span
								></button
							>
						</span>
						<p class="faint small" id={`item-${choice.id}-help`}>
							{choice.help}{#if requests > 1}
								{t(choice.id === 'repair' ? 'itemPane.repairRequests' : 'itemPane.redrawRequests', {
									count: requests,
									n: number(requests)
								})}{/if}
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
								getLocale() === 'en' ? sourceDir.replaceAll('-', ' ') : directionName(sourceDir)
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
					<TriangleAlert size={14} />{displayMessage(colorError)}<ReportButton error={colorError} />
				</p>{/if}
			{#if colorDone}<p class="notice small">
					{t('itemPane.colorsMatched', {
						pixels: t('itemPane.pixels', { count: colorDone.pixels, n: number(colorDone.pixels) }),
						frames: t('itemPane.frames', { count: colorDone.frames, n: number(colorDone.frames) })
					})}
				</p>{/if}

			<div class="actions">
				<button
					class="bu-action btn {on ? '' : 'primary'}"
					data-variant="outline"
					onclick={() => wear(it.id)}>{on ? t('common.takeOff') : t('common.wear')}</button
				>
				{#if !isDemo() && it.prompt}
					<!-- A fitted copy is remade for this body like any shared item that does not fit it, named from its description. -->
					<button
						class="bu-action btn"
						data-variant="outline"
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
				{#if !isDemo()}
					<button
						class="bu-action btn plain danger"
						data-variant="quiet"
						onclick={() => (confirmRemove = true)}
						><Trash size={14} />{openerLabel(t('itemMenu.labelDeleteItem'))}<SurfaceChevron
						/></button
					>
				{/if}
			</div>

			<div class="item-links">
				{#if recolorable}
					<!-- Colors live in the Colors tab; this opens it on the item's own section. -->
					<button class="bu-action btn plain recolor-link" data-variant="quiet" onclick={recolor}
						><Palette size={14} />{t('itemPane.recolor')}</button
					>
				{/if}
				<button class="bu-action btn plain" data-variant="quiet" onclick={() => openFrames(it.id)}
					><Grid2x2 size={14} />{openerLabel(t('fixFrames.open'))}<SurfaceChevron /></button
				>
			</div>

			<div class="field">
				<span class="sec-title">{t('itemPane.layerOrder')}</span>
				<div class="actions">
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => moveLayer(it.id, 1, onlyDir)}
						title={t('itemPane.titleDrawInFrontOfTheNext')}
						><ArrowUp size={14} />{t('itemPane.forward')}</button
					>
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => moveLayer(it.id, -1, onlyDir)}
						title={t('itemPane.titleDrawBehindThePreviousLayer')}
						><ArrowDown size={14} />{t('itemPane.backward')}</button
					>
					{#if JSON.stringify(m.slots.find((s) => s.id === it.slot)?.zOverrides ?? []) !== JSON.stringify(ladder)}<button
							class="bu-action btn sm plain"
							data-variant="quiet"
							onclick={() => resetLayer(it.id, ladder)}>{t('itemPane.reset')}</button
						>{/if}
				</div>
				<label class="check small"
					><input type="checkbox" bind:checked={onlyDir} />{t('itemPane.onlyFacing', {
						direction: getLocale() === 'en' ? ui.dir.replaceAll('-', ' ') : directionName(ui.dir)
					})}</label
				>
			</div>

			{#if others.length}
				<div class="field">
					<span class="sec-title" id="hide-{it.id}">{t('itemPane.whenWornHide')}</span>
					<div class="chips" role="group" aria-labelledby="hide-{it.id}">
						{#each others as s (s.id)}
							{@const on = hides.includes(s.id)}
							<button class="chip" aria-pressed={on} onclick={() => toggleHide(it.id, s.id)}
								>{#if on}<Check size={12} strokeWidth={2.5} />{/if}{slotName(s.id)}</button
							>
						{/each}
					</div>
					<p class="faint small">
						{t('itemPane.hideWhenWorn', { name: it.name })}
						{#if tucks.length}{' '}{t('itemPane.tuckNote', {
								slots: formatList(tucks.map(slotName))
							})}{/if}
					</p>
				</div>
			{/if}

			<details class="disclosure">
				<summary><ChevronRight size={14} />{t('itemPane.howItWasMade')}</summary>
				<div><GenerationDetails {m} {it} /></div>
			</details>

			<details class="disclosure">
				<summary><ChevronRight size={14} />{t('common.details')}</summary>
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
</Sheet>

<style>
	.item-links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px 12px;
	}
</style>
