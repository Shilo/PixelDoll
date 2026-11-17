<script lang="ts">
	// Slots: Add slot (show a built-in Wardrobe doesn't show, or create a custom slot) and a custom slot's settings. Order,
	// hiding and showing happen in Wardrobe itself. Nothing here generates, unequips or changes exports except a custom
	// slot's own drawing order, and every change is one undo step except deleting a slot together with its items.
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import GroupIcon from './GroupIcon.svelte';
	import * as db from '../lib/store/db.ts';
	import type { SlotProfile } from '../lib/store/manifest.ts';
	import {
		ui,
		doc,
		store,
		isDemo,
		busySlots,
		slotUseHere,
		showSlot,
		addSlot,
		saveSlotSettings,
		deleteSlot
	} from './state.svelte.ts';
	import {
		ACCESSORY,
		applySettings,
		BEHAVIORS,
		MAX_HINT,
		MAX_LABEL,
		baseClothesNote,
		busyReason,
		categories,
		cleanLabel,
		drawingOrder,
		drawsAbove,
		hintProblem,
		labelOwner,
		labelProblem,
		nextLabel,
		shownCategories,
		slotDef,
		useText
	} from './slots.ts';
	import { ChevronDown, Plus, Trash, TriangleAlert } from './icons.ts';

	const m = $derived(store.project?.manifest);
	const busy = $derived(m ? busySlots(m) : new Set<string>());
	const shown = $derived(m ? shownCategories(m, busy) : []);
	const notShown = $derived(
		m ? categories(m).filter((c) => !shown.some((s) => s.key === c.key)) : []
	);
	/** Built-ins Wardrobe doesn't show (hidden custom slots are under Not shown in Wardrobe). */
	const builtins = $derived(notShown.filter((c) => !c.custom));
	/** The slot Wardrobe opened this sheet for, read once: a custom slot opens its settings, a built-in starts a custom
	 *  copy of it. */
	const target = untrack(() => ui.slotTarget);
	const copying = untrack(
		() => !!target && !!m && categories(m).some((c) => c.key === target && !c.custom)
	);
	function close() {
		ui.sheet = null;
		ui.slotTarget = null;
	}

	// What the frozen body wears, for the Underwear note (the demo has no record: the general note).
	let looks = $state<string | undefined>();
	$effect(() => {
		if (!isDemo())
			void db
				.get<{ character?: { looks?: string } }>('projects', doc.id)
				.then((r) => (looks = r?.character?.looks));
	});

	let problem = $state('');

	// ---------- adding ----------
	let addName = $state('');
	let addLike = $state(copying && target ? target : '');
	const placeholder = $derived(m ? nextLabel(m) : ACCESSORY);
	const owner = $derived(m && cleanLabel(addName) ? labelOwner(m, addName) : undefined);
	const ownerHidden = $derived(
		owner && owner.key !== 'body' ? notShown.find((c) => c.key === owner.key) : undefined
	);
	const addProblem = $derived(
		!m || ownerHidden || !cleanLabel(addName) ? '' : labelProblem(m, addName)
	);
	const likeOptions = $derived(
		m
			? [...shown.filter((c) => !c.custom), ...builtins, ...categories(m).filter((c) => c.custom)]
			: []
	);
	/** Run a step; a refusal shows why instead of changing anything. */
	function attempt(fn: () => unknown) {
		problem = '';
		try {
			fn();
			return true;
		} catch (e) {
			problem = (e as Error).message;
			return false;
		}
	}
	function add() {
		if (ownerHidden) return show(ownerHidden.key);
		if (addProblem) return;
		const label = cleanLabel(addName) || placeholder;
		// addSlot brings the new slot to the top of Wardrobe.
		if (attempt(() => addSlot({ label, ...(addLike ? { like: addLike } : {}) }))) close();
	}
	function show(key: string) {
		if (attempt(() => showSlot(key))) {
			ui.group = key;
			close();
		}
	}

	// ---------- a custom slot's settings ----------
	let form = $state({ name: '', behavior: '' as SlotProfile, hand: 'right', above: '', hint: '' });
	/** Draws above as the editor opened: only a changed choice is saved, so a new behavior or hand keeps its own depth. */
	let startAbove = '';
	let formError = $state('');
	const edited = $derived(
		m && target ? categories(m).find((c) => c.key === target && c.custom) : undefined
	);
	const editedDef = $derived(m && edited ? slotDef(m, edited.key) : undefined);
	const locked = $derived(
		edited ? busyReason(edited.label, slotUseHere(edited.key), 'change how it attaches') : ''
	);
	const order = $derived(m && edited ? drawingOrder(m).filter((x) => x.key !== edited.key) : []);
	/** The behavior's own definition: the edited slot for its current behavior, else the built-in it copies. */
	const behaviorDef = (p: SlotProfile) =>
		editedDef && p === (editedDef.profile ?? 'accessory')
			? editedDef
			: p === 'accessory'
				? undefined
				: slotDef(m, p);
	const handOfBehavior = (p: SlotProfile) =>
		behaviorDef(p)?.anchor === 'hand_l' ? 'left' : 'right';
	const heldChoice = $derived(behaviorDef(form.behavior)?.class === 'held');
	// The form starts from the slot's saved settings once.
	untrack(() => {
		const def = m && edited && slotDef(m, edited.key);
		if (!m || !edited || !def) return;
		form = {
			name: def.label ?? edited.key,
			behavior: def.profile ?? 'accessory',
			hand: def.anchor === 'hand_l' ? 'left' : 'right',
			above: drawsAbove(m, edited.key),
			hint: def.promptTemplate ?? ''
		};
		startAbove = form.above;
	});
	/** An untouched Draws above follows a new behavior or hand: it shows the depth that change brings, which Save keeps. */
	function followDepth() {
		if (!m || !edited || !editedDef || form.above !== startAbove) return;
		const trial = { slots: structuredClone(m.slots), rig: m.rig, items: m.items, presets: [] };
		try {
			applySettings(trial, edited.key, {
				label: edited.label,
				profile: form.behavior as Exclude<SlotProfile, 'body'>,
				...(heldChoice ? { hand: form.hand as 'left' | 'right' } : {}),
				hint: editedDef.promptTemplate ?? ''
			});
		} catch {
			return; // a preview only: Save reports why the settings can't be used
		}
		form.above = startAbove = drawsAbove(trial, edited.key);
	}
	const nameProblem = $derived(m && edited ? labelProblem(m, form.name, edited.key) : '');
	const hintError = $derived(hintProblem(form.hint));
	let saving = $state(false);
	async function save() {
		if (!m || !edited || !editedDef || nameProblem || hintError || saving) return;
		saving = true;
		formError = '';
		try {
			const reason = await saveSlotSettings(edited.key, {
				label: form.name,
				profile: form.behavior as Exclude<SlotProfile, 'body'>,
				...(heldChoice ? { hand: form.hand as 'left' | 'right' } : {}),
				...(form.above !== startAbove ? { above: form.above } : {}),
				hint: form.hint
			});
			if (reason) throw new Error(reason);
			close();
		} catch (e) {
			formError = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	// ---------- deleting a custom slot ----------
	let deleting = $state(''),
		deleteBusy = $state(false),
		deleteProblem = $state('');
	const deletingLabel = $derived(m && deleting ? (slotDef(m, deleting)?.label ?? deleting) : '');
	// Saved items may go with it (confirmed by count); attempts being made or stopped must be settled first.
	const deleteUse = $derived(
		deleting ? slotUseHere(deleting) : { items: 0, making: 0, stopped: 0 }
	);
	const deleteReason = $derived(
		deleting
			? busyReason(deletingLabel, { ...deleteUse, items: 0 }, 'be deleted') ||
					(deleteUse.items && isDemo() ? 'Items of the bundled demo can’t be deleted.' : '')
			: ''
	);
	async function remove() {
		deleteBusy = true;
		deleteProblem = '';
		try {
			const reason = await deleteSlot(deleting, deleteUse.items);
			if (reason) deleteProblem = reason;
			else {
				deleting = '';
				close();
			}
		} catch (e) {
			deleteProblem = (e as Error).message;
		} finally {
			deleteBusy = false;
		}
	}
	// A slot deleted or changed elsewhere (undo, another tab) closes its settings rather than edit a ghost.
	$effect(() => {
		if (target && !copying && !edited && !deleting) untrack(close);
	});
</script>

{#snippet editFoot()}
	<span class="foot-note">Free: never regenerates items already made.</span>
	<button
		class="bu-action btn primary"
		data-variant="primary"
		disabled={!!nameProblem || !!hintError || saving}
		onclick={() => void save()}>Save</button
	>
{/snippet}

{#if edited && editedDef}
	<Sheet title={edited.label} onclose={close} footer={editFoot} cancelDisabled={saving}>
		<form
			class="form"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<label class="field"
				><span class="label">Name</span><input
					class="bu-input input"
					type="text"
					bind:value={form.name}
					maxlength={MAX_LABEL}
					aria-invalid={!!nameProblem || undefined}
					aria-describedby="slot-name-note"
				/></label
			>
			<p class="faint small" id="slot-name-note">
				{nameProblem || `Renaming keeps its items, outfits and export name (${edited.key}).`}
			</p>
			<label class="field"
				><span class="label">Draws above</span>
				<span class="select-wrap boxed"
					><select class="bu-select select" bind:value={form.above}
						>{#each order as x (x.key)}<option value={x.key}>{x.label}</option>{/each}</select
					><ChevronDown size={12} /></span
				>
			</label>
			<p class="faint small">
				The front of its items, including ones already made, draws over {order.find(
					(x) => x.key === form.above
				)?.label ?? 'Base'} and under the next slot. Side-specific order, like a near hand, moves with
				it.{editedDef.bgZ != null ? ' Parts drawn behind the body stay behind it.' : ''} New items start
				here too. Undo puts it back.
			</p>
			<label class="field"
				><span class="label">Works like</span>
				<span class="select-wrap boxed"
					><select
						class="bu-select select"
						bind:value={form.behavior}
						onchange={() => {
							form.hand = handOfBehavior(form.behavior);
							followDepth();
						}}
						disabled={!!locked}
						aria-describedby="slot-behavior-note"
						>{#each BEHAVIORS as b (b.profile)}<option value={b.profile}>{b.label}</option
							>{/each}</select
					><ChevronDown size={12} /></span
				>
			</label>
			<p class="faint small" id="slot-behavior-note">
				{locked ||
					'How new items attach and where they start drawing. Copies settings, never items.'}
			</p>
			{#if heldChoice}
				<div class="field">
					<span class="label" id="slot-hand">Hand</span>
					<div class="seg" role="radiogroup" aria-labelledby="slot-hand">
						{#each [['right', 'Right'], ['left', 'Left']] as [value, text] (value)}
							<button
								type="button"
								role="radio"
								aria-checked={form.hand === value}
								aria-disabled={!!locked || undefined}
								onclick={() => {
									if (locked) return;
									form.hand = value;
									followDepth();
								}}>{text}</button
							>
						{/each}
					</div>
				</div>
			{/if}
			<label class="field"
				><span class="label">Creative hint <span class="faint">(optional)</span></span><textarea
					class="bu-input input"
					rows="2"
					bind:value={form.hint}
					maxlength={MAX_HINT}
					placeholder="e.g. small and shiny, pinned to the chest"
					aria-invalid={!!hintError || undefined}
					aria-describedby="slot-hint-note"></textarea></label
			>
			<p class="faint small" id="slot-hint-note">
				{hintError ||
					'Added to each new item’s description here. Items already made stay as they are.'}
			</p>
			{#if formError}<p class="notice bad small" role="alert">
					<TriangleAlert size={16} /><span>{formError}</span>
				</p>{/if}
			<button
				type="button"
				class="row danger delete-slot"
				onclick={() => {
					deleteProblem = '';
					deleting = edited.key;
				}}><Trash size={16} aria-hidden="true" />Delete slot…</button
			>
		</form>
	</Sheet>
{:else}
	<Sheet title="Add slot" onclose={close}>
		{#if problem}<p class="notice warn small" role="alert">
				<TriangleAlert size={16} /><span>{problem}</span>
			</p>{/if}
		{#if builtins.length && !copying}
			<h3 class="sec-title" id="slots-builtin">Built-in</h3>
			<ul class="slot-list" aria-labelledby="slots-builtin">
				{#each builtins as c (c.key)}
					{@const sub = [
						useText(slotUseHere(c.key)),
						c.profile === 'underwear' ? baseClothesNote(looks) : ''
					]
						.filter(Boolean)
						.join(' ')}
					<li class="slot-row">
						<span class="row slot-name"
							><GroupIcon group={c.key} size={18} /><span class="row-name"
								>{c.label}{#if sub}<small class="row-reason faint">{sub}</small>{/if}</span
							></span
						>
						<button
							class="bu-action btn sm"
							data-variant="outline"
							aria-label="Show {c.label}"
							onclick={() => show(c.key)}>Show</button
						>
					</li>
				{/each}
			</ul>
		{/if}
		<h3 class="sec-title" id="slots-custom">Custom</h3>
		<form
			class="form add-slot"
			aria-labelledby="slots-custom"
			onsubmit={(e) => {
				e.preventDefault();
				add();
			}}
		>
			<div class="inline-form">
				<input
					class="bu-input input"
					type="text"
					bind:value={addName}
					maxlength={MAX_LABEL}
					{placeholder}
					aria-label="Slot name"
					aria-invalid={!!addProblem || undefined}
					aria-describedby="slot-add-note"
				/>
				{#if ownerHidden}<button class="bu-action btn" data-variant="outline" type="submit"
						>Show {ownerHidden.label}</button
					>{:else}<button
						class="bu-action btn"
						data-variant="outline"
						type="submit"
						disabled={!!addProblem}><Plus size={16} aria-hidden="true" />Create slot</button
					>{/if}
			</div>
			<p class="faint small" id="slot-add-note" aria-live="polite">
				{ownerHidden
					? `${ownerHidden.label} already exists but isn’t shown.`
					: addProblem || `Leave the name blank for ${placeholder}.`}
			</p>
			<label class="field"
				><span class="label small">Works like</span>
				<span class="select-wrap boxed"
					><select class="bu-select select" bind:value={addLike}
						><option value="">Over basic clothing</option>{#each likeOptions as c (c.key)}<option
								value={c.key}>{c.label}</option
							>{/each}</select
					><ChevronDown size={12} /></span
				>
			</label>
		</form>
	</Sheet>
{/if}

{#if deleting}
	<ConfirmDialog
		title={deleteUse.items
			? `Delete ${deletingLabel} and its ${deleteUse.items === 1 ? 'item' : `${deleteUse.items} items`}?`
			: `Delete ${deletingLabel}?`}
		action="Delete"
		busyAction="Deleting…"
		busy={deleteBusy}
		problem={deleteProblem || deleteReason}
		blocked={!!deleteReason}
		oncancel={() => (deleting = '')}
		onconfirm={() => void remove()}
		><p>
			{#if deleteUse.items}The slot and its items are deleted from this device together, and outfits
				stop wearing them. That can’t be undone.{:else}Undo brings it back.{/if}
			Exports will no longer include its slot “{deleting}”, so game code that names it must change.
		</p></ConfirmDialog
	>
{/if}

<style>
	.slot-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 4px 0 8px;
		padding: 0;
		list-style: none;
	}
	.slot-row {
		display: flex;
		align-items: center;
		gap: 4px;
		border-radius: var(--r-ctl);
	}
	.slot-name {
		flex: 1;
		min-width: 0;
		min-height: 44px;
	}
	span.slot-name:hover {
		background: transparent;
	}
	.add-slot {
		margin-top: 4px;
	}
	.add-slot .inline-form {
		grid-template-columns: minmax(0, 1fr) auto;
		margin-top: 0;
	}
	.delete-slot {
		margin-top: 8px;
	}
</style>
