<script lang="ts">
	import { currentItemDrawing } from './settingsDefaults.svelte.ts';
	import Stage from './Stage.svelte';
	import Sheet from './Sheet.svelte';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import { displayMessage, displayNestedMessage } from '../lib/i18n.ts';
	import { sameMessage } from '../lib/message.ts';
	import type { Item } from '../lib/store/manifest.ts';
	// B10 (T1 P1-1): a worn item missing frames for the shown view would silently vanish there. Say so, with one action to fix it.
	import { missingAt, moveDirs } from '../lib/dress/dress.ts';
	import { itemMoveOffer, missingItemMoves, moveMinimumTier, unposedItemMoves } from './create.ts';
	import { setupRedoMoves } from '../lib/rig/setup.ts';
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
	import PoseIssues from './PoseIssues.svelte';
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
					missingItemMoves(m, item.id, currentItemDrawing(), 0, store.project?.images).filter(
						(spec) => spec.id === anim.id
					)
				)
			: []
	);
	const poseItems = $derived(new Set(poseSpecs.flatMap((spec) => spec.items)));
	// An offer covers only the views it can make. A shown view that it leaves out (no rest joints, no design) still
	// needs a way on of its own, as it did before the note priced the whole move.
	const shownDirs = (item: Item) => {
		if (!m || !anim) return [];
		const worn = { [item.slot]: item.id };
		return [
			...new Set(
				views
					.filter((dir) => missingAt(m, worn, anim.id, dir).some((i) => i.id === item.id))
					.map((dir) => m.rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir)
			)
		];
	};
	const partialItems = $derived(
		m && anim
			? missing.filter((item) => {
					const specs = poseSpecs.filter((spec) => spec.items.includes(item.id));
					if (!specs.length) return false;
					const dirs = new Set(specs.flatMap((spec) => spec.dirs ?? []));
					return shownDirs(item).some((dir) => !dirs.has(dir));
				})
			: []
	);
	const poseOffer = $derived(
		m && poseSpecs.length ? itemMoveOffer(m, poseSpecs, setupRedoMoves(store.exportRecord)) : null
	);
	// The move on stage was kept without poses where these items are missing: no offer for those items, only the way on.
	// An offered item's own offer names the same views, so each sentence is shown once.
	const unposedByItem = $derived(
		m && anim
			? missing.flatMap((item) =>
					unposedItemMoves(m, item.id, currentItemDrawing(), setupRedoMoves(store.exportRecord))
						.filter((entry) => entry.move === anim.id)
						.map((entry) => ({ id: item.id, note: entry.note }))
				)
			: []
	);
	const unposedIds = $derived(new Set(unposedByItem.map((entry) => entry.id)));
	const unposedNotes = $derived(
		unposedByItem
			.map((entry) => entry.note)
			.filter((note, i, all) => all.findIndex((other) => sameMessage(note, other)) === i)
			.filter((note) => !(poseOffer?.unposed ?? []).some((other) => sameMessage(note, other)))
	);
	// Items the note neither offers nor explains, and items whose offer leaves out a shown view, get their own way on.
	const otherMissing = $derived([
		...missing.filter((item) => !poseItems.has(item.id) && !unposedIds.has(item.id)),
		...partialItems
	]);
	const freeCopy = $derived(missing.find((i) => shared.free[i.id]));
	const remake = $derived(otherMissing.find((i) => i.prompt));
	const copyOnly = $derived(!!m && !!remake?.copiedFrom && !extendable(m, remake.id));
	const poseTier = $derived(
		m ? Math.max(0, ...(poseOffer?.specs ?? []).map((s) => moveMinimumTier(m, s))) : 0
	);
	const poseBlocked = $derived(
		tierDecision(app.balance, { required: poseTier }).kind === 'required'
	);
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
			targets={missing.length && !busy && !isDemo() && !freeCopy?.copiedFrom && poseSpecs.length > 0
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
				{:else if poseSpecs.length || unposedNotes.length || remake}
					{#if poseSpecs.length}
						<span class="api-action"
							><button
								class="bu-action btn sm primary"
								data-variant="primary"
								disabled={(!!moving.spec && !moving.done) ||
									!poseOffer?.specs.length ||
									poseBlocked}
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
						{#each poseOffer?.unposed ?? [] as note, i (i)}<span>{displayNestedMessage(note)}</span
							>{/each}
						<PoseIssues issues={poseOffer?.poseIssues ?? []} />
						{#if poseTier}<TierNotice
								id="stage-pose-tier"
								minimumTier={poseTier}
								feature={t('stageNote.makingMissingFrames')}
							/>{/if}
					{/if}
					{#each unposedNotes as note, i (i)}<span>{displayNestedMessage(note)}</span>{/each}
					{#if remake?.standing && !copyOnly}
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
				{/if}
			</div>
		{/if}
	</div>
</Sheet>
