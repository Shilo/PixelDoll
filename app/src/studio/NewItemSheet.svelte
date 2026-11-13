<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { itemPlan } from './apiPlans.ts';
	import { formDrafts } from './formDrafts.ts';
	import GroupIcon from './GroupIcon.svelte';
	import {
		GROUPS,
		groupLabel,
		slotLabel,
		itemNameFrom,
		mirroredHandsNote,
		namesOffHandItem
	} from './model.ts';
	import { itemRoute, standingCoverage } from './itemRoute.ts';
	import { ui, doc, store, isDemo, startItem, withKey, copyDemo } from './state.svelte.ts';
	import * as db from '../lib/store/db.ts';
	import { SWATCHES } from '../lib/dress/dress.ts';
	import { defaultMethod, type RigCtx } from '../lib/items/run.ts';
	import type { Method } from '../lib/items/items.ts';
	import { rigReady } from '../lib/rig/setup.ts';
	import { ChevronDown, ChevronRight, Info, Sparkles, TriangleAlert } from './icons.ts';

	const draft =
		formDrafts.item?.projectId === doc.id &&
		formDrafts.item.sourceGroup === ui.newItem.group &&
		!ui.newItem.prompt
			? formDrafts.item
			: undefined;
	let group = $state(draft?.group ?? ui.newItem.group);
	let slot = $state(draft?.slot ?? ui.newItem.slot);
	let prompt = $state(draft?.prompt ?? ui.newItem.prompt);
	let color = $state(draft?.color ?? '');
	let name = $state(draft?.name ?? ui.newItem.name);
	let method = $state<Method | ''>(draft?.method ?? ui.newItem.method ?? '');
	let busy = $state(false);
	const g = $derived(GROUPS.find((x) => x.id === group) ?? GROUPS[0]);
	$effect(() => {
		if (!g.slots.includes(slot)) slot = g.slots[0];
	});

	const m = $derived(store.project?.manifest);
	const fullPrompt = $derived(`${prompt.trim()}${color ? `, ${color} colored` : ''}`);
	const itemName = $derived(name.trim() || itemNameFrom(prompt) || 'New item');
	const input = $derived({
		name: itemName,
		slot,
		prompt: fullPrompt,
		...(method ? { method } : {})
	});
	// the project record (skeletons decide the route); pixels are not needed for the plan
	let rec = $state.raw<RigCtx['rec'] | null>(null);
	$effect(() => {
		if (!isDemo()) void db.get<RigCtx['rec']>('projects', doc.id).then((r) => (rec = r ?? null));
	});
	const planned = $derived.by(() => {
		try {
			return {
				plan:
					m && rec
						? itemRoute.plan(m.rig, { rec: { ...rec, manifest: m } } as RigCtx, input)
						: null,
				error: ''
			};
		} catch (e) {
			return { plan: null, error: (e as Error).message };
		}
	});
	const plan = $derived(planned.plan);
	// Advanced offers a method only when this character can use both; otherwise Automatic is the only one.
	const automatic = $derived.by(() => {
		if (!m || !rec) return null;
		try {
			const ctx = { rec: { ...rec, manifest: m } } as RigCtx;
			return defaultMethod(ctx, standingCoverage(ctx));
		} catch {
			return null;
		}
	});
	const METHODS: Record<Method, { label: string; help: string }> = {
		skel: {
			label: 'Skeleton posing',
			help: 'Dresses the standing views once, then poses that design onto each move with the character’s skeleton (Skeleton animation V3). Keeps one design everywhere; held items follow the hand.'
		},
		anchor: {
			label: 'Frame editing',
			help: 'Edits each move’s frames directly (Edit animation V2), anchored on the standing design. An alternative when posing bends an item badly, such as a stiff cape. Later moves use the same method.'
		}
	};
	const OFF_HAND_HINT = 'Shields and bows usually go in the off hand.';
	const offHandHint = $derived(group === 'Main hand' && namesOffHandItem(prompt));
	const handNote = $derived(m ? mirroredHandsNote(m.rig) : '');

	async function make(i: typeof input, consent?: Parameters<typeof startItem>[1]) {
		formDrafts.item = undefined;
		busy = true;
		try {
			ui.sheet = null;
			await startItem(i, consent);
			ui.tab = 'wardrobe';
		} finally {
			busy = false;
		}
	}
	async function useCopy() {
		busy = true;
		try {
			await copyDemo();
		} finally {
			busy = false;
		}
	}
	function go() {
		formDrafts.item = {
			projectId: doc.id,
			sourceGroup: ui.newItem.group,
			group,
			slot,
			prompt,
			color,
			name,
			...(method ? { method } : {})
		};
		const i = $state.snapshot(input);
		const consent = plan
			? { projectId: doc.id, gens: plan.gens, rig: JSON.stringify(m!.rig) }
			: undefined;
		withKey(() => void make(i, consent), !!plan?.minimumTier);
	}
</script>

{#snippet foot()}
	<span class="foot-note">{plan ? `About ${plan.minutes} min. You can keep working.` : ''}</span>
	<span class="api-action"
		><ApiPeek
			scope="item-make"
			label="Make item"
			plan={itemPlan(m && rec ? ({ rec: { ...rec, manifest: m } } as RigCtx) : null, input)}
		/><button
			class="bu-action btn primary lg"
			data-variant="primary"
			disabled={!prompt.trim() || busy || !plan?.calls}
			onclick={go}>Make <span class="cost">Est. {plan?.gens ?? '–'} gens</span></button
		></span
	>
{/snippet}

<Sheet title="New item" onclose={() => (ui.sheet = null)} footer={isDemo() ? undefined : foot}>
	{#if isDemo()}
		<div class="notice small">
			<Sparkles size={16} />
			<span
				>Items are drawn for your own character. Create one, or make an editable copy of the demo
				body to add items to it.</span
			>
		</div>
		<div class="actions">
			<button
				class="bu-action btn primary"
				data-variant="primary"
				onclick={() => (ui.sheet = 'create')}>Create your character</button
			>
			<button
				class="bu-action btn copy-demo"
				data-variant="outline"
				onclick={useCopy}
				disabled={busy}
			>
				<span class:copy-hidden={busy}>Copy the demo body</span>
				<span class:copy-hidden={!busy}>Copying…</span>
			</button>
		</div>
	{:else}
		{#if rec && !rigReady(rec)}<p class="notice small">
				<TriangleAlert size={16} /><span
					>Set up this character to use skeleton-posed equipment, oversize weapons and new moves.</span
				><button
					class="bu-action btn small"
					data-variant="outline"
					onclick={() => (ui.sheet = 'setup')}>Set up character</button
				>
			</p>{/if}
		{#if planned.error}<p class="notice warn small" role="alert">
				<TriangleAlert size={16} /><span
					>This character’s frames cannot use the item generator: {planned.error}</span
				>
			</p>{/if}
		<div class="form">
			<p class="muted small">
				Make the standing design first. Generate this item for individual moves from its details
				after you like the result.
			</p>
			<div class="field">
				<span class="label" id="where">Where does it go?</span>
				<div class="chips" role="radiogroup" aria-labelledby="where">
					{#each GROUPS as x (x.id)}
						<button
							class="chip"
							role="radio"
							aria-checked={group === x.id}
							tabindex={group === x.id ? 0 : -1}
							onclick={() => (group = x.id)}
							><GroupIcon group={x.id} size={14} />{groupLabel(x.id)}</button
						>
					{/each}
				</div>
				{#if group === 'Main hand' || group === 'Off hand'}<p class="faint small">
						Main hand is the character’s right hand; Off hand is the left.
					</p>
					{#if handNote}<p class="faint small">
							{handNote}
						</p>{/if}{/if}
				<!-- Always present and only filled while the hint shows: announced once, not on every keystroke. -->
				<span class="sr" aria-live="polite">{offHandHint ? OFF_HAND_HINT : ''}</span>
			</div>
			<label class="field">
				<span class="label">What is it?</span>
				<textarea
					class="bu-input input"
					rows="2"
					bind:value={prompt}
					placeholder="e.g. {g.ideas[0]?.label ?? 'a leather hat'}"
					maxlength="300"></textarea>
			</label>
			{#if offHandHint}<p class="notice small">
					<Info size={16} /><span>{OFF_HAND_HINT}</span><button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => (group = 'Off hand')}>Use Off hand</button
					>
				</p>{/if}
			<div class="chips" aria-label="Ideas">
				{#each g.ideas as idea (idea.label)}
					<button
						class="chip"
						onclick={() => {
							prompt = idea.label;
							if (idea.slot) slot = idea.slot;
						}}>{idea.label}</button
					>
				{/each}
			</div>
			<div class="field">
				<span class="label">Color hint <span class="faint">(optional)</span></span>
				<div class="dots" role="radiogroup" aria-label="Color hint">
					<button
						class="dot-swatch none"
						role="radio"
						aria-checked={!color}
						tabindex={!color ? 0 : -1}
						onclick={() => (color = '')}>Any</button
					>
					{#each Object.entries(SWATCHES) as [n, hex] (n)}
						<button
							class="dot-swatch"
							role="radio"
							aria-checked={color === n}
							tabindex={color === n ? 0 : -1}
							aria-label={n}
							title={n}
							style:background={hex}
							onclick={() => (color = n)}
						></button>
					{/each}
				</div>
			</div>
			<p class="faint small">
				Consistency checks run automatically. If issues are detected, you choose whether to keep the
				item or request a paid retry. No quality retries or repairs run without your request.
				PixelLab may bill dollars and queue time varies.
			</p>
			<details class="disclosure" open={!!method}>
				<summary><ChevronRight size={14} />Advanced</summary>
				<div>
					<label class="field"
						><span class="label small">Name</span><input
							class="bu-input input"
							bind:value={name}
							placeholder={itemName}
						/></label
					>
					{#if g.slots.length > 1}
						<label class="field"
							><span class="label small">Exact slot</span>
							<span class="select-wrap boxed"
								><select class="bu-select select" bind:value={slot}
									>{#each g.slots as s (s)}<option value={s}>{slotLabel(s)}</option>{/each}</select
								><ChevronDown size={12} /></span
							>
						</label>
					{/if}
					{#if automatic === 'skel'}
						<label class="field"
							><span class="label small">Animation method</span>
							<span class="select-wrap boxed"
								><select class="bu-select select" bind:value={method}
									><option value="">Automatic ({METHODS[automatic].label})</option
									>{#each Object.entries(METHODS) as [id, x] (id)}<option value={id}
											>{x.label}</option
										>{/each}</select
								><ChevronDown size={12} /></span
							>
						</label>
						<p class="faint small">{METHODS[method || automatic].help}</p>
					{/if}
					{#if plan}<p class="faint small">
							{plan.calls} PixelLab calls · {plan.cells} frames · {itemRoute.label}{plan.cell
								? ` · ${plan.cell} px canvas so long weapons are never cut off`
								: ''}. Each planned batch runs once. Failed checks wait for your review.
						</p>{/if}
				</div>
			</details>
		</div>
	{/if}
</Sheet>

<style>
	.copy-demo {
		display: inline-grid;
	}
	.copy-demo > span {
		grid-area: 1 / 1;
	}
	.copy-hidden {
		visibility: hidden;
	}
</style>
