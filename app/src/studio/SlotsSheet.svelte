<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { message } from '../lib/message.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { displayError, displayMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	// Slots: Add slot (show a built-in Wardrobe doesn't show, or create a custom slot) and a custom slot's settings. Order,
	// hiding and showing happen in Wardrobe itself. Nothing here generates, unequips or changes exports except a custom
	// slot's own drawing order, and every change is one undo step except deleting a slot together with its items.
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import GroupIcon from './GroupIcon.svelte';
	import * as db from '../lib/store/db.ts';
	import type { SlotIcon, SlotProfile } from '../lib/store/manifest.ts';
	import {
		ui,
		doc,
		store,
		isDemo,
		busySlots,
		slotUseHere,
		showSlot,
		toast,
		addSlot,
		saveSlotSettings,
		deleteSlot
	} from './state.svelte.ts';
	import {
		ACCESSORY,
		applySettings,
		BEHAVIORS,
		ICON_CHOICES,
		MAX_HINT,
		MAX_LABEL,
		baseClothesNote,
		behaviorLabelMessage,
		iconLabelMessage,
		slotBusyMessage,
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
		slotLabelMessage,
		slotUseMessages,
		type SlotUse
	} from './slots.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { ChevronDown, Eye, Plus, Trash, TriangleAlert } from './icons.ts';

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

	let problem = $state<Message | string>('');
	const labelOf = (key: string) => displayMessage(slotLabelMessage(m, key));
	const useLabel = (use: SlotUse) =>
		new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(
			slotUseMessages(use).map(displayMessage)
		);
	const busyLabel = (label: string, use: SlotUse, action: 'delete' | 'reattach') =>
		displayMessage(
			slotBusyMessage(
				label,
				use,
				action,
				useLabel(use),
				use.stopped ? t('studioSlots.busy.dismissStopped') : ''
			)
		);

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
			problem = errorMessage(e);
			return false;
		}
	}
	function add() {
		if (ownerHidden) return show(ownerHidden.key);
		if (addProblem) return;
		const label = cleanLabel(addName) || placeholder;
		if (attempt(() => addSlot({ label, ...(addLike ? { like: addLike } : {}) }))) {
			close();
			toast(message('slotsSheet.labelAddedAtTheEndOfWardrobe', { label }));
		}
	}
	function show(key: string) {
		if (attempt(() => showSlot(key))) {
			close();
			toast(message('slotsSheet.valueShownAtTheEndOfWardrobe', { value: labelOf(key) }));
		}
	}

	// ---------- a custom slot's settings ----------
	let form = $state({
		name: '',
		behavior: '' as SlotProfile,
		icon: 'accessory' as SlotIcon,
		hand: 'right',
		above: '',
		hint: ''
	});
	/** Draws above as the editor opened: only a changed choice is saved, so a new behavior or hand keeps its own depth. */
	let startAbove = '';
	let formError = $state<Message | string>('');
	const edited = $derived(
		m && target ? categories(m).find((c) => c.key === target && c.custom) : undefined
	);
	const editedDef = $derived(m && edited ? slotDef(m, edited.key) : undefined);
	const locked = $derived(
		edited ? busyLabel(labelOf(edited.key), slotUseHere(edited.key), 'reattach') : ''
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
	let startForm = '';
	// The form starts from the slot's saved settings once.
	untrack(() => {
		const def = m && edited && slotDef(m, edited.key);
		if (!m || !edited || !def) return;
		form = {
			name: def.label ?? edited.key,
			behavior: def.profile ?? 'accessory',
			icon: def.icon ?? def.profile ?? 'accessory',
			hand: def.anchor === 'hand_l' ? 'left' : 'right',
			above: drawsAbove(m, edited.key),
			hint: def.promptTemplate ?? ''
		};
		startAbove = form.above;
		startForm = JSON.stringify({ ...form, above: '' });
	});
	// Unsaved edits ask before the sheet closes; Draws above counts only when it differs from what Save would keep.
	const dirty = $derived(
		!!edited && (JSON.stringify({ ...form, above: '' }) !== startForm || form.above !== startAbove)
	);
	/** An untouched Draws above follows a new behavior or hand: it shows the depth that change brings, which Save keeps. */
	function followDepth() {
		if (!m || !edited || !editedDef || form.above !== startAbove) return;
		const trial = { slots: structuredClone(m.slots), rig: m.rig, items: m.items, presets: [] };
		try {
			applySettings(trial, edited.key, {
				label: edited.label,
				profile: form.behavior as Exclude<SlotProfile, 'body'>,
				icon: form.icon,
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
				icon: form.icon,
				...(heldChoice ? { hand: form.hand as 'left' | 'right' } : {}),
				...(form.above !== startAbove ? { above: form.above } : {}),
				hint: form.hint
			});
			if (reason) {
				formError = reason;
				return;
			}
			close();
		} catch (e) {
			formError = errorMessage(e);
		} finally {
			saving = false;
		}
	}

	// ---------- deleting a custom slot ----------
	let deleting = $state(''),
		deleteBusy = $state(false),
		deleteProblem = $state<Message | string>('');
	const deletingLabel = $derived(m && deleting ? labelOf(deleting) : '');
	// Saved items may go with it (confirmed by count); attempts being made or stopped must be settled first.
	const deleteUse = $derived(
		deleting ? slotUseHere(deleting) : { items: 0, making: 0, stopped: 0 }
	);
	const deleteReason = $derived(
		deleting
			? busyLabel(deletingLabel, { ...deleteUse, items: 0 }, 'delete') ||
					(deleteUse.items && isDemo() ? t('slotsSheet.demoDeleteLocked') : '')
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
			deleteProblem = errorMessage(e);
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
	<span class="foot-note">{t('slotsSheet.freeNeverRegeneratesItemsAlreadyMade')}</span>
	<button
		class="bu-action btn primary"
		data-variant="primary"
		disabled={!!nameProblem || !!hintError || saving}
		data-trail="slots.save"
		onclick={() => void save()}>{t('common.save')}</button
	>
{/snippet}

{#if edited && editedDef}
	<Sheet title={labelOf(edited.key)} onclose={close} footer={editFoot} locked={saving} {dirty}>
		<form
			class="form"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<label class="field"
				><span class="label">{t('common.name')}</span><input
					class="bu-input input"
					type="text"
					bind:value={form.name}
					maxlength={MAX_LABEL}
					aria-invalid={!!nameProblem || undefined}
					aria-describedby="slot-name-note"
				/></label
			>
			<p class="faint small" id="slot-name-note">
				{nameProblem ? displayError(nameProblem) : t('slotsSheet.renameNote', { slot: edited.key })}
			</p>
			<label class="field"
				><span class="label">{t('slotsSheet.drawsAbove')}</span>
				<span class="select-wrap boxed"
					><select class="bu-select select" bind:value={form.above}
						>{#each order as x (x.key)}<option value={x.key}>{labelOf(x.key)}</option
							>{/each}</select
					><ChevronDown size={12} /></span
				>
			</label>
			<p class="faint small">
				{t('slotsSheet.drawOrder', { slot: labelOf(form.above || 'body') })}
				{#if editedDef.bgZ != null}{t('slotsSheet.behindBody')}{/if}
				{t('slotsSheet.drawOrderUndo')}
			</p>
			<label class="field"
				><span class="label">{t('slotsSheet.worksLike')}</span>
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
						>{#each BEHAVIORS as b (b.profile)}<option value={b.profile}
								>{displayMessage(behaviorLabelMessage(b.profile, labelOf(b.profile)))}</option
							>{/each}</select
					><ChevronDown size={12} /></span
				>
			</label>
			<p class="faint small" id="slot-behavior-note">
				{locked || t('slotsSheet.behaviorNote')}
			</p>
			{#if heldChoice}
				<div class="field">
					<span class="label" id="slot-hand">{t('slotsSheet.hand')}</span>
					<div class="seg" role="radiogroup" aria-labelledby="slot-hand">
						{#each ['right', 'left'] as value (value)}
							<button
								type="button"
								role="radio"
								aria-checked={form.hand === value}
								aria-disabled={!!locked || undefined}
								onclick={() => {
									if (locked) return;
									form.hand = value;
									followDepth();
								}}>{value === 'right' ? t('slotsSheet.right') : t('slotsSheet.left')}</button
							>
							>
						{/each}
					</div>
				</div>
			{/if}
			<div class="field">
				<span class="label" id="slot-icon-label">{t('slotsSheet.icon')}</span>
				<div class="icon-grid" role="radiogroup" aria-labelledby="slot-icon-label">
					{#each ICON_CHOICES as icon (icon)}
						{@const name = displayMessage(iconLabelMessage(icon))}
						<button
							type="button"
							class="icon-choice"
							role="radio"
							aria-checked={form.icon === icon}
							aria-label={name}
							title={name}
							onclick={() => (form.icon = icon)}
						>
							<GroupIcon {icon} surface="choice" />
						</button>
					{/each}
				</div>
				<p class="faint small">{t('slotsSheet.iconNote')}</p>
			</div>
			<label class="field"
				><span class="label"
					>{t('slotsSheet.creativeHint')}
					<span class="faint">{t('common.optional')}</span></span
				><textarea
					class="bu-input input"
					rows="2"
					bind:value={form.hint}
					maxlength={MAX_HINT}
					placeholder={t('slotsSheet.placeholderEGSmallAndShinyPinned')}
					aria-invalid={!!hintError || undefined}
					aria-describedby="slot-hint-note"></textarea></label
			>
			<p class="faint small" id="slot-hint-note">
				{hintError ? displayError(hintError) : t('slotsSheet.hintNote')}
			</p>
			{#if formError}<p class="notice bad small" role="alert">
					<TriangleAlert size={16} /><span>{displayMessage(formError)}</span><ReportButton
						error={formError}
					/>
				</p>{/if}
			<button
				type="button"
				class="row danger delete-slot"
				data-trail="slots.delete"
				onclick={() => {
					deleteProblem = '';
					deleting = edited.key;
				}}
				><Trash size={16} aria-hidden="true" />{openerLabel(
					t('slotsSheet.deleteSlot')
				)}<SurfaceChevron /></button
			>
		</form>
	</Sheet>
{:else}
	<Sheet title={t('slotsSheet.titleAddSlot')} onclose={close}>
		{#if problem}<p class="notice warn small" role="alert">
				<TriangleAlert size={16} /><span>{displayMessage(problem)}</span>
			</p>{/if}
		<form
			class="form add-slot"
			aria-label={t('slotsSheet.createCustomSlot')}
			onsubmit={(e) => {
				e.preventDefault();
				add();
			}}
		>
			<label class="field"
				><span class="label">{t('slotsSheet.slotName')}</span>
				<input
					class="bu-input input"
					type="text"
					bind:value={addName}
					maxlength={MAX_LABEL}
					{placeholder}
					aria-label={t('slotsSheet.slotName')}
					aria-invalid={!!addProblem || undefined}
					aria-describedby={ownerHidden || addProblem ? 'slot-add-note' : undefined}
				/>
			</label>
			{#if ownerHidden || addProblem}<p class="faint small" id="slot-add-note" aria-live="polite">
					{ownerHidden
						? t('slotsSheet.alreadyHidden', { label: labelOf(ownerHidden.key) })
						: displayError(addProblem)}
				</p>{/if}
			<label class="field"
				><span class="label small">{t('slotsSheet.worksLike')}</span>
				<span class="select-wrap boxed"
					><select class="bu-select select" bind:value={addLike}
						><option value="">{t('slotsSheet.overBasicClothing')}</option
						>{#each likeOptions as c (c.key)}<option value={c.key}>{labelOf(c.key)}</option
							>{/each}</select
					><ChevronDown size={12} /></span
				>
			</label>
			{#if ownerHidden}<button
					class="bu-action btn primary"
					data-trail="slots.showHidden"
					type="submit">{t('slotsSheet.showLabel', { label: labelOf(ownerHidden.key) })}</button
				>
			{:else}<button
					class="bu-action btn primary"
					data-trail="slots.create"
					type="submit"
					disabled={!!addProblem}
					><Plus size={16} aria-hidden="true" />{t('slotsSheet.createSlot')}</button
				>{/if}
		</form>
		{#if builtins.length && !copying}
			<hr class="bu-separator slot-divider" />
			<h3 class="sec-title" id="slots-builtin">{t('slotsSheet.builtInSlots')}</h3>
			<ul class="slot-list" aria-labelledby="slots-builtin">
				{#each builtins as c (c.key)}
					{@const sub = [
						useLabel(slotUseHere(c.key)),
						c.profile === 'underwear' ? displayMessage(baseClothesNote(looks)) : ''
					]
						.filter(Boolean)
						.join(' ')}
					<li class="slot-row">
						<button
							class="bu-action slot-choice"
							aria-label={t('slotsSheet.showLabel', { label: labelOf(c.key) })}
							data-trail="slots.showBuiltIn"
							onclick={() => show(c.key)}
						>
							<GroupIcon group={c.key} surface="inline" /><span class="row-name"
								>{labelOf(c.key)}{#if sub}<small class="row-reason faint">{sub}</small>{/if}</span
							><Eye size={18} aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</Sheet>
{/if}

{#if deleting}
	<ConfirmDialog
		title={t('slotsSheet.deleteTitle', { label: deletingLabel })}
		action={t('common.moveToTrash')}
		busyAction={t('common.movingToTrash')}
		busy={deleteBusy}
		problem={displayNestedMessage(deleteProblem || deleteReason)}
		blocked={!!deleteReason}
		oncancel={() => (deleting = '')}
		onconfirm={() => void remove()}
		><p>
			{#if deleteUse.items}{t('slotsSheet.theSlotAndItsItemsAreDeleted')}{:else}{t(
					'slotsSheet.theSlotIsDeleted'
				)}{/if}
			{t('slotsSheet.deleteExportNote', { slot: deleting })}
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
	.slot-choice {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		flex: 1;
		min-width: 0;
		min-height: 44px;
		text-align: left;
	}
	.add-slot {
		margin: 0;
	}
	.slot-divider {
		width: 100%;
		margin: 0;
	}
	.add-slot > button {
		align-self: flex-start;
	}
	.delete-slot {
		margin-top: 8px;
	}
	.icon-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
		gap: 4px;
	}
	.icon-choice {
		display: grid;
		place-items: center;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: var(--r-ctl);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.icon-choice:hover {
		background: var(--bg-hover);
	}
	.icon-choice[aria-checked='true'] {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent-text);
	}
</style>
