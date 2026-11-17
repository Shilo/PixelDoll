<script lang="ts">
	// Slots: what Wardrobe shows and in which order, plus custom categories. Organization only: nothing here generates,
	// unequips or changes exports except a custom category's own drawing order, and every change is one undo step except
	// deleting a category together with its items.
	import { tick, untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import RowActions from './RowActions.svelte';
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
		hideSlot,
		moveSlot,
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
	import {
		ArrowDown,
		ArrowUp,
		ChevronDown,
		ChevronLeft,
		CopyPlus,
		EyeOff,
		GripVertical,
		Pencil,
		Plus,
		Trash,
		TriangleAlert
	} from './icons.ts';

	const m = $derived(store.project?.manifest);
	const busy = $derived(m ? busySlots(m) : new Set<string>());
	const shown = $derived(m ? shownCategories(m, busy) : []);
	const notShown = $derived(
		m ? categories(m).filter((c) => !shown.some((s) => s.key === c.key)) : []
	);
	const behaviorLabel = (p: SlotProfile) => BEHAVIORS.find((b) => b.profile === p)?.label ?? '';
	/** Under each name: what it holds, and how a custom category behaves. */
	const detail = (key: string, custom: boolean, profile: SlotProfile) =>
		[useText(slotUseHere(key)), custom ? behaviorLabel(profile) : ''].filter(Boolean).join(' · ');

	// What the frozen body wears, for the Underwear note (the demo has no record: the general note).
	let looks = $state<string | undefined>();
	$effect(() => {
		if (!isDemo())
			void db
				.get<{ character?: { looks?: string } }>('projects', doc.id)
				.then((r) => (looks = r?.character?.looks));
	});

	let problem = $state('');
	let announce = $state('');
	/** Run an organization step; a refusal shows why instead of changing anything. */
	async function attempt(fn: () => unknown) {
		problem = '';
		try {
			const reason = await fn();
			if (typeof reason === 'string' && reason) problem = reason;
			return !reason;
		} catch (e) {
			problem = (e as Error).message;
			return false;
		}
	}

	// ---------- reordering: a dedicated handle (pointer), arrow keys on it, or Move up / Move down ----------
	let list = $state<HTMLOListElement>();
	async function focusGrip(key: string) {
		await tick();
		requestAnimationFrame(() =>
			list?.querySelector<HTMLElement>(`[data-grip="${CSS.escape(key)}"]`)?.focus()
		);
	}
	async function move(key: string, to: number) {
		const from = shown.findIndex((c) => c.key === key);
		to = Math.max(0, Math.min(shown.length - 1, to));
		if (from < 0 || from === to) return;
		const label = shown[from].label;
		if (!(await attempt(() => moveSlot(key, to)))) return;
		announce = `${label} moved to position ${to + 1} of ${shown.length}.`;
		void focusGrip(key);
	}
	function gripKey(e: KeyboardEvent, key: string, at: number) {
		const to =
			e.key === 'ArrowUp'
				? at - 1
				: e.key === 'ArrowDown'
					? at + 1
					: e.key === 'Home'
						? 0
						: e.key === 'End'
							? shown.length - 1
							: null;
		if (to === null) return;
		e.preventDefault();
		void move(key, to);
	}

	// Provisional thresholds (plan §6): a press only becomes a drag past them, so a tap on the handle does nothing.
	const THRESHOLD = { mouse: 6, pen: 6, touch: 8 } as Record<string, number>;
	const EDGE = 48,
		MAX_SPEED = 14;
	let drag = $state<{ key: string; dy: number; to: number } | null>(null);
	let press: {
		key: string;
		id: number;
		x: number;
		y: number;
		type: string;
		scroller: HTMLElement | null;
		top: number;
		pointerY: number;
		frame: number;
	} | null = null;
	function targetIndex(y: number, key: string) {
		const rows = [...(list?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].filter(
			(r) => r.dataset.row !== key
		);
		let to = 0;
		for (const r of rows) {
			const box = r.getBoundingClientRect();
			if (y > box.top + box.height / 2) to++;
		}
		return to;
	}
	function track() {
		if (!press || !drag) return;
		const p = press,
			box = p.scroller?.getBoundingClientRect();
		// Continuous edge scroll: runs every frame while the pointer rests near an edge, not only on pointer moves.
		if (p.scroller && box) {
			const speed =
				p.pointerY < box.top + EDGE
					? -MAX_SPEED * Math.min(1, (box.top + EDGE - p.pointerY) / EDGE)
					: p.pointerY > box.bottom - EDGE
						? MAX_SPEED * Math.min(1, (p.pointerY - (box.bottom - EDGE)) / EDGE)
						: 0;
			if (speed) p.scroller.scrollTop += speed;
		}
		drag = {
			key: p.key,
			dy: p.pointerY - p.y + ((p.scroller?.scrollTop ?? 0) - p.top),
			to: targetIndex(p.pointerY, p.key)
		};
		p.frame = requestAnimationFrame(track);
	}
	function pointerDown(e: PointerEvent, key: string) {
		if (e.button !== 0 || press) return;
		const scroller = (e.currentTarget as HTMLElement).closest<HTMLElement>('.sheet-body');
		press = {
			key,
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			type: e.pointerType,
			scroller,
			top: scroller?.scrollTop ?? 0,
			pointerY: e.clientY,
			frame: 0
		};
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function pointerMove(e: PointerEvent) {
		if (!press || e.pointerId !== press.id) return;
		press.pointerY = e.clientY;
		if (!drag) {
			if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < (THRESHOLD[press.type] ?? 6))
				return;
			drag = { key: press.key, dy: 0, to: shown.findIndex((c) => c.key === press!.key) };
			press.frame = requestAnimationFrame(track);
		}
	}
	function endDrag(commit: boolean) {
		const p = press,
			d = drag;
		if (p) cancelAnimationFrame(p.frame);
		press = null;
		drag = null;
		if (commit && p && d) void move(p.key, d.to);
	}
	const dropAt = $derived(
		drag && shown.findIndex((c) => c.key === drag!.key) !== drag.to ? drag.to : -1
	);

	// ---------- adding ----------
	let addName = $state('');
	let addLike = $state('');
	let addInput = $state<HTMLInputElement>();
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
			? [
					...shown.filter((c) => !c.custom),
					...notShown.filter((c) => !c.custom),
					...categories(m).filter((c) => c.custom)
				]
			: []
	);
	async function add() {
		if (ownerHidden) return show(ownerHidden.key);
		if (addProblem) return;
		const label = cleanLabel(addName) || placeholder;
		if (await attempt(() => void addSlot({ label, ...(addLike ? { like: addLike } : {}) }))) {
			announce = `${label} added to Wardrobe.`;
			addName = '';
			addLike = '';
		}
	}
	async function show(key: string) {
		const label = m ? (slotDef(m, key)?.label ?? key) : key;
		if (await attempt(() => showSlot(key))) {
			announce = `${label} is shown in Wardrobe.`;
			if (ownerHidden?.key === key) addName = '';
			void focusGrip(key);
		}
	}
	async function hide(key: string, label: string) {
		if (await attempt(() => hideSlot(key))) announce = `${label} is not shown in Wardrobe.`;
	}
	async function customize(key: string) {
		addLike = key;
		addName = '';
		await tick();
		addInput?.focus();
		addInput?.scrollIntoView({ block: 'nearest' });
	}

	// ---------- editing a custom category ----------
	let editing = $state('');
	let form = $state({ name: '', behavior: '' as SlotProfile, hand: 'right', above: '', hint: '' });
	/** Draws above as the editor opened: only a changed choice is saved, so a new behavior or hand keeps its own depth. */
	let startAbove = '';
	let formError = $state('');
	const edited = $derived(m && editing ? categories(m).find((c) => c.key === editing) : undefined);
	const editedDef = $derived(m && editing ? slotDef(m, editing) : undefined);
	const locked = $derived(
		edited ? busyReason(edited.label, slotUseHere(edited.key), 'change how it attaches') : ''
	);
	const order = $derived(m ? drawingOrder(m).filter((x) => x.key !== editing) : []);
	/** The behavior's own definition: the edited category for its current behavior, else the built-in it copies. */
	const behaviorDef = (p: SlotProfile) =>
		editedDef && p === (editedDef.profile ?? 'accessory')
			? editedDef
			: p === 'accessory'
				? undefined
				: slotDef(m, p);
	const handOfBehavior = (p: SlotProfile) =>
		behaviorDef(p)?.anchor === 'hand_l' ? 'left' : 'right';
	const heldChoice = $derived(behaviorDef(form.behavior)?.class === 'held');
	function edit(key: string) {
		const def = m && slotDef(m, key);
		if (!m || !def) return;
		problem = '';
		formError = '';
		form = {
			name: def.label ?? key,
			behavior: def.profile ?? 'accessory',
			hand: def.anchor === 'hand_l' ? 'left' : 'right',
			above: drawsAbove(m, key),
			hint: def.promptTemplate ?? ''
		};
		startAbove = form.above;
		editing = key;
	}
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
		const key = edited.key;
		try {
			const reason = await saveSlotSettings(key, {
				label: form.name,
				profile: form.behavior as Exclude<SlotProfile, 'body'>,
				...(heldChoice ? { hand: form.hand as 'left' | 'right' } : {}),
				...(form.above !== startAbove ? { above: form.above } : {}),
				hint: form.hint
			});
			if (reason) throw new Error(reason);
			announce = `${cleanLabel(form.name)} saved.`;
			editing = '';
			void focusGrip(key);
		} catch (e) {
			formError = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	// ---------- deleting a custom category ----------
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
				announce = `${deletingLabel} deleted.`;
				deleting = '';
				editing = '';
			}
		} catch (e) {
			deleteProblem = (e as Error).message;
		} finally {
			deleteBusy = false;
		}
	}
	// A category deleted or changed elsewhere (undo, another tab) closes its editor rather than edit a ghost.
	$effect(() => {
		if (editing && !edited) untrack(() => (editing = ''));
	});
</script>

<svelte:window
	onkeydowncapture={(e) => {
		if (drag && e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			endDrag(false);
		}
	}}
/>

{#snippet back()}<button
		class="bu-action btn plain link"
		data-variant="quiet"
		disabled={saving}
		onclick={() => (editing = '')}><ChevronLeft size={16} aria-hidden="true" />Slots</button
	>{/snippet}

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
	<Sheet
		title={edited.label}
		onclose={() => (ui.sheet = null)}
		leading={back}
		footer={editFoot}
		cancelDisabled={saving}
	>
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
				)?.label ?? 'Base'} and under the next category. Side-specific order, like a near hand, moves
				with it.{editedDef.bgZ != null ? ' Parts drawn behind the body stay behind it.' : ''} New items
				start here too. Undo puts it back.
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
				}}><Trash size={16} aria-hidden="true" />Delete category…</button
			>
		</form>
	</Sheet>
{:else}
	<Sheet title="Slots" cancel="Done" onclose={() => (ui.sheet = null)}>
		<p class="muted small">
			Choose what Wardrobe shows and its order. Drawing order and exports stay the same.
		</p>
		{#if problem}<p class="notice warn small" role="alert">
				<TriangleAlert size={16} /><span>{problem}</span>
			</p>{/if}
		<h3 class="sec-title" id="slots-shown">In Wardrobe</h3>
		{#if !shown.length}<p class="faint small">
				Nothing is shown. Show a category below to dress this character.
			</p>{/if}
		<ol
			class="slot-list"
			aria-labelledby="slots-shown"
			aria-describedby="slots-reorder"
			bind:this={list}
			data-dragging={drag ? '' : undefined}
		>
			{#each shown as c, i (c.key)}
				{@const dragged = drag?.key === c.key}
				<li
					class="slot-row"
					data-row={c.key}
					data-drop-before={dropAt === i && i <= shown.findIndex((x) => x.key === drag?.key)
						? ''
						: undefined}
					data-drop-after={dropAt >= 0 &&
					dropAt === i &&
					i > shown.findIndex((x) => x.key === drag?.key)
						? ''
						: undefined}
					data-dragged={dragged || undefined}
					style:translate={dragged ? `0 ${drag!.dy}px` : undefined}
				>
					<button
						class="bu-action grip"
						data-variant="quiet"
						data-grip={c.key}
						aria-label="Reorder {c.label}, position {i + 1} of {shown.length}"
						aria-describedby="slots-reorder"
						onkeydown={(e) => gripKey(e, c.key, i)}
						onpointerdown={(e) => pointerDown(e, c.key)}
						onpointermove={pointerMove}
						onpointerup={(e) => {
							if (press?.id === e.pointerId) endDrag(true);
						}}
						onpointercancel={() => endDrag(false)}
						onlostpointercapture={() => {
							if (press) endDrag(!!drag);
						}}><GripVertical size={18} aria-hidden="true" /></button
					>
					<RowActions name={c.label}>
						{@const sub = detail(c.key, c.custom, c.profile)}
						{#if c.custom}<button class="row slot-name" onclick={() => edit(c.key)}
								><GroupIcon group={c.key} size={18} /><span class="row-name"
									>{c.label}{#if sub}<small class="row-reason faint">{sub}</small>{/if}</span
								><Pencil size={14} aria-hidden="true" /></button
							>{:else}<span class="row slot-name"
								><GroupIcon group={c.key} size={18} /><span class="row-name"
									>{c.label}{#if sub}<small class="row-reason faint">{sub}</small>{/if}</span
								></span
							>{/if}
						{#snippet actions(close: () => void)}
							<button
								class="row"
								data-variant="quiet"
								role="menuitem"
								aria-disabled={i === 0 || undefined}
								onclick={() => {
									close();
									if (i > 0) void move(c.key, i - 1);
								}}><ArrowUp size={16} aria-hidden="true" />Move up</button
							>
							<button
								class="row"
								data-variant="quiet"
								role="menuitem"
								aria-disabled={i === shown.length - 1 || undefined}
								onclick={() => {
									close();
									if (i < shown.length - 1) void move(c.key, i + 1);
								}}><ArrowDown size={16} aria-hidden="true" />Move down</button
							>
							<button
								class="row"
								data-variant="quiet"
								role="menuitem"
								onclick={() => {
									close();
									void hide(c.key, c.label);
								}}><EyeOff size={16} aria-hidden="true" />Don’t show in Wardrobe</button
							>
							<hr />
							{#if c.custom}
								<button
									class="row"
									data-variant="quiet"
									role="menuitem"
									onclick={() => {
										close();
										edit(c.key);
									}}><Pencil size={16} aria-hidden="true" />Edit…</button
								>
							{:else}
								<button
									class="row"
									data-variant="quiet"
									role="menuitem"
									onclick={() => {
										close();
										void customize(c.key);
									}}><CopyPlus size={16} aria-hidden="true" />Make a custom copy…</button
								>
							{/if}
						{/snippet}
					</RowActions>
				</li>
			{/each}
		</ol>
		<p class="faint small" id="slots-reorder">
			Drag a handle, or focus it and use the arrow keys, to reorder.
		</p>

		<h3 class="sec-title" id="slots-add">Add a category</h3>
		{#if notShown.length}
			<ul class="slot-list" aria-labelledby="slots-add">
				{#each notShown as c (c.key)}
					{@const sub = [
						detail(c.key, c.custom, c.profile),
						c.profile === 'underwear' ? baseClothesNote(looks) : ''
					]
						.filter(Boolean)
						.join(' ')}
					<li class="slot-row">
						{#if c.custom}<button class="row slot-name" onclick={() => edit(c.key)}
								><GroupIcon group={c.key} size={18} /><span class="row-name"
									>{c.label}{#if sub}<small class="row-reason faint">{sub}</small>{/if}</span
								><Pencil size={14} aria-hidden="true" /></button
							>{:else}<span class="row slot-name"
								><GroupIcon group={c.key} size={18} /><span class="row-name"
									>{c.label}{#if sub}<small class="row-reason faint">{sub}</small>{/if}</span
								></span
							>{/if}
						<button
							class="bu-action btn sm"
							data-variant="outline"
							aria-label="Show {c.label}"
							onclick={() => void show(c.key)}>Show</button
						>
					</li>
				{/each}
			</ul>
		{/if}
		<form
			class="form add-slot"
			onsubmit={(e) => {
				e.preventDefault();
				void add();
			}}
		>
			<div class="inline-form">
				<input
					class="bu-input input"
					type="text"
					bind:this={addInput}
					bind:value={addName}
					maxlength={MAX_LABEL}
					{placeholder}
					aria-label="New category name"
					aria-invalid={!!addProblem || undefined}
					aria-describedby="slot-add-note"
				/>
				{#if ownerHidden}<button class="bu-action btn" data-variant="outline" type="submit"
						>Show {ownerHidden.label}</button
					>{:else}<button
						class="bu-action btn"
						data-variant="outline"
						type="submit"
						disabled={!!addProblem}><Plus size={16} aria-hidden="true" />Add</button
					>{/if}
			</div>
			<p class="faint small" id="slot-add-note" aria-live="polite">
				{ownerHidden
					? `${ownerHidden.label} already exists but isn’t shown.`
					: addProblem || 'Leave the name blank for an accessory over basic clothing.'}
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
		<p class="sr" aria-live="polite">{announce}</p>
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
			{#if deleteUse.items}The category and its items are deleted from this device together, and
				outfits stop wearing them. That can’t be undone.{:else}Undo brings it back.{/if}
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
		position: relative;
		display: flex;
		align-items: center;
		gap: 4px;
		border-radius: var(--r-ctl);
	}
	.slot-row :global(.character-entry) {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
	}
	.slot-name {
		flex: 1;
		min-width: 0;
		min-height: 44px;
	}
	span.slot-name:hover {
		background: transparent;
	}
	.grip {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 44px;
		color: var(--text-3);
		cursor: grab;
		/* Only the handle claims touch drags; the rest of each row still scrolls the sheet. */
		touch-action: none;
	}
	.slot-list[data-dragging] .grip {
		cursor: grabbing;
	}
	.slot-row[data-dragged] {
		z-index: 1;
		background: var(--bg-raised);
		box-shadow: var(--shadow-pop);
	}
	.slot-row[data-drop-before]::before,
	.slot-row[data-drop-after]::after {
		content: '';
		position: absolute;
		left: 36px;
		right: 0;
		height: 2px;
		border-radius: 1px;
		background: var(--accent);
	}
	.slot-row[data-drop-before]::before {
		top: -2px;
	}
	.slot-row[data-drop-after]::after {
		bottom: -2px;
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
	@media (prefers-reduced-motion: no-preference) {
		.slot-row:not([data-dragged]) {
			transition: background-color 0.15s ease-out;
		}
	}
</style>
