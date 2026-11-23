<script lang="ts">
	import Stage from './Stage.svelte';
	import Sheet from './Sheet.svelte';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	// B10 (T1 P1-1): a worn item missing frames for the shown view would silently vanish there. Say so, with one action to fix it.
	import { missingAt, moveDirs } from '../lib/dress/dress.ts';
	import type { DirectionName, Item } from '../lib/store/manifest.ts';
	import { itemMoveOffer, missingItemMoves, moveMinimumTier, unposedItemMoves } from './create.ts';
	import { setupRedoMoves } from '../lib/rig/setup.ts';
	import { extendable } from './movePricing.ts';
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
	// A partial replacement may leave other directions intact; only missing views need paid posing.
	function missingDirs(item: Item): DirectionName[] {
		if (!m || !anim) return [];
		return [
			...new Set(
				views
					.filter((dir) =>
						missingAt(m!, { [item.slot]: item.id }, anim!.id, dir).some((i) => i.id === item.id)
					)
					.map((dir) => m!.rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir)
			)
		];
	}
	const poseSpecs = $derived(
		m && anim
			? missing.flatMap((item) => {
					const spec = missingItemMoves(m, item.id, 0).find((s) => s.id === anim.id);
					const dirs = spec?.dirs?.filter((dir) => missingDirs(item).includes(dir));
					return spec && dirs?.length ? [{ ...spec, dirs }] : [];
				})
			: []
	);
	// The move on stage was kept without poses where these items are missing: no offer, only the way on.
	const unposedNotes = $derived(
		m && anim && !poseSpecs.length
			? missing
					.flatMap((item) =>
						unposedItemMoves(m, item.id, setupRedoMoves(store.exportRecord)).filter(
							(entry) => entry.move === anim.id
						)
					)
					.slice(0, 1)
					.map((entry) => entry.note)
			: []
	);
	const poseOffer = $derived(
		m && poseSpecs.length ? itemMoveOffer(m, poseSpecs, setupRedoMoves(store.exportRecord)) : null
	);
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
		const specs = poseOffer.specs.map((spec) => ({
			...$state.snapshot(spec),
			seed: 1 + Math.floor(Math.random() * 1_000_000)
		}));
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
							>{t('stageNote.makeIt')}
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
					{#each poseOffer?.unposed ?? [] as note, i (i)}<span>{displayMessage(note)}</span>{/each}
					<PoseIssues issues={poseOffer?.poseIssues ?? []} />
					{#if poseTier}<TierNotice
							id="stage-pose-tier"
							minimumTier={poseTier}
							feature={t('stageNote.makingMissingFrames')}
						/>{/if}
				{:else if unposedNotes.length}
					{#each unposedNotes as note, i (i)}<span>{displayMessage(note)}</span>{/each}
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
