<script lang="ts">
	import { currentItemDrawing } from './settingsDefaults.svelte.ts';
	import Stage from './Stage.svelte';
	import Sheet from './Sheet.svelte';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	// B10 (T1 P1-1): a worn item missing frames for the shown view would silently vanish there. Say so, with one action to fix it.
	import { missingAt, moveDirs } from '../lib/dress/dress.ts';
	import { itemMoveOffer, missingItemMoves, moveMinimumTier } from './create.ts';
	import { extendable } from './movePricing.ts';
	import { seeded } from './itemGeneration.ts';
	import { displayMove } from './displayMove.ts';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import {
		ui,
		doc,
		store,
		isDemo,
		moving,
		queueMoves,
		withKey,
		openNewItem,
		shared,
		copyFromSource
	} from './state.svelte.ts';
	import { TriangleAlert } from './icons.ts';
	import { app } from '../lib/app.svelte.ts';
	import { tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { movePlan } from './apiPlans.ts';

	const m = $derived(store.project?.manifest);
	const moveRefs = $derived(m?.rig.animations ?? []);
	const anim = $derived(m?.rig.animations.find((a) => a.id === ui.anim));
	const views = $derived(m && anim ? (ui.all ? moveDirs(m, anim.id) : [ui.dir]) : []);
	const missing = $derived.by(() => {
		if (!m || !anim) return [];
		return [...new Set(views.flatMap((d) => missingAt(m, doc.items, anim.id, d)))];
	});
	const move = $derived(anim ? displayMove(anim.id, moveRefs) : '');
	const names = $derived(
		new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(
			missing.map((item) => item.name)
		)
	);
	// The note describes the preview, but making frames completes the eligible views of the move.
	const poseSpecs = $derived(
		m && anim
			? missing.flatMap((item) =>
					missingItemMoves(m, item.id, currentItemDrawing(), 0).filter(
						(spec) => spec.id === anim.id
					)
				)
			: []
	);
	const poseOffer = $derived(m && poseSpecs.length ? itemMoveOffer(m, poseSpecs) : null);
	const poseTier = $derived(
		m ? Math.max(0, ...(poseOffer?.specs ?? []).map((s) => moveMinimumTier(m, s))) : 0
	);
	const poseBlocked = $derived(
		tierDecision(app.balance, { required: poseTier }).kind === 'required'
	);
	const freeCopy = $derived(missing.find((i) => shared.free[i.id]));
	const remake = $derived(missing.find((i) => i.prompt));
	const copyOnly = $derived(!!m && !!remake?.copiedFrom && !extendable(m, remake.id));
	const busy = $derived(
		!!moving.spec &&
			moving.projectId === doc.id &&
			moving.spec.id === anim?.id &&
			!moving.done &&
			!moving.error
	);

	function makePose() {
		if (!poseOffer?.specs.length) return;
		const projectId = doc.id;
		const specs = seeded($state.snapshot(poseOffer.specs));
		withKey(() => {
			void queueMoves(projectId, specs);
			ui.sheet = 'move';
		}, poseTier);
	}
</script>

<Sheet
	title={t('studio.titleInspectCharacter')}
	onclose={() => (ui.sheet = null)}
	className="inspection-sheet"
	wide
>
	{#snippet developer()}
		<ApiPeek
			targets={missing.length &&
			!busy &&
			!isDemo() &&
			!freeCopy?.copiedFrom &&
			poseSpecs.length === missing.length
				? [
						{
							scope: 'equipment-missing-move',
							label: t('stageNote.labelMakeMissingEquipmentFrames'),
							plan: m
								? (poseOffer?.specs ?? []).flatMap((spec) => movePlan({ manifest: m }, spec))
								: []
						}
					]
				: []}
		/>
	{/snippet}
	<div class="inspection-stage">
		<Stage />
		{#if missing.length}
			<div class="stage-note" role="status">
				<TriangleAlert size={14} />
				<span
					>{t(ui.all ? 'stageNote.missingFrames' : 'stageNote.missingFrameViews', {
						names,
						count: missing.length,
						move,
						direction: displayDirectionInSentence(ui.dir)
					})}</span
				>
				{#if busy}
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => (ui.sheet = 'move')}
						><span class="bu-ring ring spin" aria-hidden="true"></span>{t(
							'stageNote.making'
						)}</button
					>
				{:else if isDemo()}
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => (ui.sheet = 'create')}>{t('stageNote.makeYourOwn')}</button
					>
				{:else if freeCopy?.copiedFrom}
					<!-- An exact copy whose source item gained these frames since: copied over for free, not made again. -->
					<button
						class="bu-action btn sm primary"
						data-variant="primary"
						disabled={!!shared.adding}
						onclick={() => copyFromSource(freeCopy.id)}
						>{t('itemPane.copyFrom', { name: freeCopy.copiedFrom.name })}
						<span class="cost">{t('common.free')}</span></button
					>
				{:else if poseSpecs.length === missing.length}
					<span class="api-action"
						><button
							class="bu-action btn sm primary"
							data-variant="primary"
							disabled={(!!moving.spec && !moving.done) || !poseOffer?.specs.length || poseBlocked}
							aria-describedby={poseBlocked ? 'stage-pose-tier' : undefined}
							onclick={makePose}
							>{t('stageNote.makeMissingViews')}
							<span class="cost"
								>{poseOffer?.gens == null
									? t('common.unavailable')
									: t('stageNote.estimate', {
											count: poseOffer.gens,
											n: formatNumber(poseOffer.gens)
										})}</span
							></button
						></span
					>
					{#if poseOffer?.error}<span role="status">{displayMessage(poseOffer.error)}</span>{/if}
					{#if poseTier}<TierNotice
							id="stage-pose-tier"
							minimumTier={poseTier}
							feature={t('stageNote.makingMissingFrames')}
						/>{/if}
				{:else if remake?.standing && !copyOnly}
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => (ui.sheet = 'setup')}>{t('setup.title')}</button
					>
				{:else if remake}
					<!-- A copy without its own standing design cannot be posed onto more moves: make one for this character. -->
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => openNewItem(remake.slot, { slot: remake.slot, prompt: remake.prompt })}
						>{copyOnly
							? t('itemMenu.makeOneForName', { name: m?.name })
							: t('stageNote.makeItAgain')}</button
					>
				{/if}
			</div>
		{/if}
	</div>
</Sheet>
