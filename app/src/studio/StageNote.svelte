<script lang="ts">
	// B10 (T1 P1-1): a worn item missing frames for the shown view would silently vanish there. Say so, with one action to fix it.
	import { missingAt, moveDirs } from '../lib/dress/dress.ts';
	import type { DirectionName, Item } from '../lib/store/manifest.ts';
	import { extendable, itemMoveOffer, missingItemMoves } from './create.ts';
	import { groupOf, moveLabel } from './model.ts';
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
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { movePlan } from './apiPlans.ts';

	const m = $derived(store.project?.manifest);
	const moveIds = $derived(m?.rig.animations.map((a) => a.id) ?? []);
	const anim = $derived(m?.rig.animations.find((a) => a.id === ui.anim));
	const views = $derived(m && anim ? (ui.all ? moveDirs(m, anim.id) : [ui.dir]) : []);
	const missing = $derived.by(() => {
		if (!m || !anim) return [];
		return [...new Set(views.flatMap((d) => missingAt(m, doc.items, anim.id, d)))];
	});
	const move = $derived(anim ? moveLabel(anim.id, moveIds) : '');
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
	const poseOffer = $derived(m && poseSpecs.length ? itemMoveOffer(m, poseSpecs) : null);
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
		withKey(
			() => {
				void queueMoves(projectId, specs);
				ui.sheet = 'move';
			},
			specs.some((s) => s.itemMethod !== 'anchor')
		);
	}
</script>

{#if missing.length}
	<div class="stage-note" role="status">
		<TriangleAlert size={14} />
		<span
			>{missing.map((i) => i.name).join(', ')}
			{missing.length > 1 ? 'are' : 'is'} missing frames for {move}{ui.all
				? ''
				: ` facing ${ui.dir}`}</span
		>
		{#if busy}
			<button class="bu-action btn sm" data-variant="outline" onclick={() => (ui.sheet = 'move')}
				><span class="bu-ring ring spin" aria-hidden="true"></span>Making…</button
			>
		{:else if isDemo()}
			<button class="bu-action btn sm" data-variant="outline" onclick={() => (ui.sheet = 'create')}
				>Make your own</button
			>
		{:else if freeCopy?.copiedFrom}
			<!-- An exact copy whose source item gained these frames since: copied over for free, not made again. -->
			<button
				class="bu-action btn sm primary"
				data-variant="primary"
				disabled={!!shared.adding}
				onclick={() => copyFromSource(freeCopy.id)}
				>Copy from {freeCopy.copiedFrom.name} <span class="cost">Free</span></button
			>
		{:else if poseSpecs.length === missing.length}
			<span class="api-action"
				><ApiPeek
					scope="equipment-missing-move"
					label="Make missing equipment frames"
					plan={m
						? (poseOffer?.specs ?? []).flatMap((spec) => movePlan({ manifest: m }, spec))
						: []}
				/><button
					class="bu-action btn sm primary"
					data-variant="primary"
					disabled={(!!moving.spec && !moving.done) || !poseOffer?.specs.length}
					onclick={makePose}
					>Make it <span class="cost"
						>{poseOffer?.gens == null ? 'Unavailable' : `Est. ${poseOffer.gens} gens`}</span
					></button
				></span
			>
			{#if poseOffer?.error}<span role="status">{poseOffer.error}</span>{/if}
		{:else if remake?.standing && !copyOnly}
			<button class="bu-action btn sm" data-variant="outline" onclick={() => (ui.sheet = 'setup')}
				>Set up character</button
			>
		{:else if remake}
			<!-- A copy without its own standing design cannot be posed onto more moves: make one for this character. -->
			<button
				class="bu-action btn sm"
				data-variant="outline"
				onclick={() =>
					openNewItem(groupOf(remake.slot).id, { slot: remake.slot, prompt: remake.prompt })}
				>{copyOnly ? `Make one for ${m?.name}` : 'Make it again…'}</button
			>
		{/if}
	</div>
{/if}
