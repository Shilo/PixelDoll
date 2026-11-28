<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import Sheet from './Sheet.svelte';
	import PromptField from './PromptField.svelte';
	import PromptSuggestions from './PromptSuggestions.svelte';
	import { promptSuggestions } from './promptSuggestions.svelte.ts';
	import SlotPicker from './SlotPicker.svelte';
	import type { EnhanceSpec } from './promptEnhance.ts';
	import ReferenceField from './ReferenceField.svelte';
	import TierNotice from './TierNotice.svelte';
	import PoseIssues from './PoseIssues.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { message } from '../lib/message.ts';
	import { tierDecision } from '../lib/pixellab/plans.ts';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { itemPlan } from './apiPlans.ts';
	import { formDrafts } from './formDrafts.ts';
	import { openingCreationSettings } from './creationSettings.ts';
	import { itemNameFrom, mirroredHandsNote, namesOffHandItem } from './model.ts';
	import {
		baseClothesNote,
		categories,
		profileOf,
		shownCategories,
		slotDef,
		slotLabelMessage
	} from './slots.ts';
	import type { Manifest } from '../lib/store/manifest.ts';
	import { untrack } from 'svelte';
	import { handSide } from '../lib/compose/compose.ts';
	import { referenceKey } from '../lib/image/chroma.ts';
	import { itemMethod, itemRoute, newItemSpec } from './itemRoute.ts';
	import {
		ui,
		doc,
		store,
		isDemo,
		startItem,
		withKey,
		copyDemo,
		busySlots,
		takeImport,
		toast
	} from './state.svelte.ts';
	import { encodePng } from '../lib/image/png.ts';
	import { readReference } from '../lib/image/reference.ts';
	import * as db from '../lib/store/db.ts';
	import { SWATCHES } from '../lib/dress/dress.ts';
	import type { RigCtx } from '../lib/items/run.ts';
	import { padOf, type Method } from '../lib/items/items.ts';
	import { rigReady } from '../lib/rig/setup.ts';
	import { ChevronDown, ChevronRight, Import, Info, Sparkles, TriangleAlert } from './icons.ts';
	import ImportItemsPane from './ImportItemsPane.svelte';
	import ImportFoot from './ImportFoot.svelte';
	import { ItemImporter } from './itemImporter.svelte.ts';
	import { leaveSheetForm, showSheetPage } from './sheetPage.ts';
	import type { SharedItem } from '../lib/equipment/shared.ts';
	import { freeItemName } from '../lib/equipment/copy.ts';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import { displaySwatch } from './displaySwatch.ts';
	import { displayError, displayMessage, errorMessage } from '../lib/i18n.ts';
	import { formatNumber, getLocale, t, type WhisperKey } from 'svelte-whisper';

	const draft =
		formDrafts.item?.projectId === doc.id &&
		formDrafts.item.sourceGroup === ui.newItem.group &&
		!ui.newItem.prompt
			? formDrafts.item
			: undefined;
	if (draft) formDrafts.item = undefined;
	const m = $derived(store.project?.manifest);
	// Every category of this character is offered; Not shown ones come last and are shown once an item starts there.
	const all = $derived(m ? categories(m) : []);
	const shown = $derived(m ? shownCategories(m, busySlots(m)) : []);
	const requested = draft?.group ?? ui.newItem.group;
	let group = $state(
		untrack(() => (all.some((c) => c.key === requested) ? requested : (shown[0]?.key ?? 'head')))
	);
	// One category is one slot.
	const slot = $derived(group);
	let prompt = $state(draft?.prompt ?? ui.newItem.prompt);
	let color = $state(draft?.color ?? '');
	let name = $state(draft?.name ?? ui.newItem.name);
	const savedMethod =
		!draft && !ui.newItem.reuseMethod ? openingCreationSettings('items').method : 'auto';
	const initialMethod =
		draft?.method ?? ui.newItem.method ?? (savedMethod === 'auto' ? '' : savedMethod);
	let method = $state<Method | ''>(initialMethod);
	let changedMethod = $state(false);
	let advancedOpen = $state(!!initialMethod);
	let busy = $state(false);
	let reference = $state(draft?.reference);
	/** The reference the sheet opened with (a draft's, or Make copy for self's), which closing does not lose. */
	let openedReference = $state(draft?.reference);
	// Typed text or a picked reference that closing would lose.
	const typedAtStart = untrack(
		() => `${prompt}
${name}`
	);
	const dirty = $derived(
		`${prompt}
${name}` !== typedAtStart || reference !== openedReference
	);
	let referenceLoading = $state(false);
	// Make copy for self opens with the item's first frame attached, read like a picked file so it is sized for this
	// item's canvas.
	const referenceFrom = untrack(() => (draft ? undefined : ui.newItem.referenceFrom));
	/** Redraw: the item this one replaces once kept, while it stays in the same category. */
	const supersedes = untrack(() => (draft ? undefined : ui.newItem.supersedes));
	const supersedeSlot = untrack(() => ui.newItem.slot);
	if (referenceFrom) {
		referenceLoading = true;
		void (async () => {
			try {
				const png = await encodePng(referenceFrom);
				const file = new File([png], `${untrack(() => name) || 'reference'}.png`, {
					type: 'image/png'
				});
				reference = openedReference = await readReference(
					file,
					untrack(() => referenceMax),
					true
				);
			} catch (error) {
				toast(errorMessage(error), { tone: 'danger', error });
			} finally {
				referenceLoading = false;
			}
		})();
	}
	const profile = $derived(profileOf(m, group));
	const suggestions = $derived(
		promptSuggestions(`item.${profile === 'body' ? 'accessory' : profile}`)
	);
	const fullPrompt = $derived(`${prompt.trim()}${color ? `, ${color} colored` : ''}`);
	const suggestedName = $derived(name.trim() || itemNameFrom(prompt));
	const itemName = $derived(suggestedName || 'New item');
	const replacing = $derived(supersedes && slot === supersedeSlot ? supersedes : undefined);
	const input = $derived({
		name: itemName,
		slot,
		prompt: fullPrompt,
		...(replacing ? { supersedes: replacing.id } : {}),
		...(reference
			? {
					reference: { base64: reference.base64, width: reference.width, height: reference.height }
				}
			: {}),
		...(reference?.keyCollisions ? { key: referenceKey(fullPrompt, reference.keyCollisions) } : {})
	});
	// the project record (skeletons decide the route); pixels are not needed for the plan
	let rec = $state.raw<RigCtx['rec'] | null>(null);
	$effect(() => {
		if (!isDemo()) void db.get<RigCtx['rec']>('projects', doc.id).then((r) => (rec = r ?? null));
	});
	const context = $derived(m && rec ? ({ rec: { ...rec, manifest: m } } as RigCtx) : null);
	const automatic = $derived.by(() => {
		if (!context) return null;
		try {
			return itemMethod(context, newItemSpec(context, input));
		} catch {
			return null;
		}
	});
	const planned = $derived.by(() => {
		try {
			if (!context) return { plan: null, error: '', method, fallback: false };
			const planFor = (choice: Method | '') =>
				itemRoute.plan(context.rec.manifest.rig, context, {
					...input,
					...(choice ? { method: choice } : {})
				});
			if (!changedMethod && savedMethod === 'skel' && automatic === 'anchor')
				return { plan: planFor('anchor'), error: '', method: 'anchor' as const, fallback: true };
			return { plan: planFor(method), error: '', method, fallback: false };
		} catch (e) {
			return { plan: null, error: displayError(e), method, fallback: false };
		}
	});
	const plannedInput = $derived({
		...input,
		...(planned.method ? { method: planned.method } : {})
	});
	const plan = $derived(planned.plan);
	const tierBlocked = $derived(
		tierDecision(app.balance, { required: plan?.minimumTier ?? 0 }).kind === 'required'
	);
	const canMake = $derived(
		!!prompt.trim() && !busy && !referenceLoading && !!plan?.calls && !tierBlocked
	);
	const METHODS: Record<Method, { label: WhisperKey; help: WhisperKey }> = {
		skel: { label: 'generationDetails.method.skeletonPose', help: 'newItem.methods.skel.help' },
		anchor: { label: 'generationDetails.method.frameEditing', help: 'newItem.methods.anchor.help' }
	};
	const referenceMax = $derived.by(() => {
		if (!m) return { width: 256, height: 256 };
		const pad = padOf(
			slotDef(m, slot) ?? slot,
			planned.method || automatic || undefined,
			m.rig.cell
		);
		return {
			width: Math.min(256, m.rig.cell.w + 2 * pad),
			height: Math.min(256, m.rig.cell.h + 2 * pad)
		};
	});
	// Items are drawn on their own transparent canvas, so Enhance describes them at that canvas size.
	const ITEM_PROMPT_MAX = 600;
	const enhanceSpec = $derived<EnhanceSpec>({
		kind: 'item',
		width: referenceMax.width,
		height: referenceMax.height,
		view: m?.rig.view
	});
	const enhanceScope = `item-enhance:${doc.id}:${crypto.randomUUID()}`;
	// The hand a held category uses, from its own definition (a built-in that holds nothing yet uses its catalog default).
	const side = $derived.by(() => {
		const def = slotDef(m, group);
		return def ? handSide({ slots: [def] } as Manifest, group) : undefined;
	});
	const offHandHint = $derived(group === 'main_hand' && namesOffHandItem(prompt));
	const clothesNote = $derived(
		m && profile === 'underwear'
			? baseClothesNote((rec as { character?: { looks?: string } } | null)?.character?.looks)
			: ''
	);
	const handNote = $derived(
		m
			? mirroredHandsNote(m.rig, t, displayDirectionInSentence, (parts) =>
					new Intl.ListFormat(getLocale()).format(parts)
				)
			: ''
	);

	// Import: a page of this sheet (a ZIP dropped on the Wardrobe opens on it); Back keeps the form as it was.
	const opening = takeImport('items');
	let importing = $state(!!opening);
	const importer = new ItemImporter();
	if (opening?.files) void importer.read(opening.files);
	$effect(() => () => {
		importer.gone = true;
	});
	function page(inner: boolean) {
		if (inner) leaveSheetForm();
		importing = inner;
		void showSheetPage(inner);
	}
	/** An item of another body, made new here: the form, filled in from it (a name in use as "Name 2"), ready to read. */
	async function makeFrom(entry: SharedItem) {
		if (all.some((c) => c.key === entry.item.slot)) group = entry.item.slot;
		prompt = entry.item.prompt;
		name = freeItemName(
			entry.item.name,
			(m?.items ?? []).filter((it) => it.slot !== 'body' && !it.variantOf)
		);
		color = '';
		reference = undefined;
		importing = false;
		await showSheetPage(false);
		document.querySelector<HTMLElement>('dialog.sheet[open] .sheet-body textarea')?.focus();
	}

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
		if (!canMake || !plan || !m) return;
		busy = true;
		formDrafts.item = {
			projectId: doc.id,
			sourceGroup: ui.newItem.group,
			group,
			slot,
			prompt,
			color,
			name,
			...(reference ? { reference } : {}),
			...(planned.method ? { method: planned.method } : {})
		};
		const i = $state.snapshot(plannedInput);
		const consent = { projectId: doc.id, gens: plan.gens, rig: JSON.stringify(m.rig) };
		withKey(() => void make(i, consent), plan.minimumTier, {
			name: i.name,
			estimate: message('generationDetails.gens', { value: formatNumber(plan.gens) })
		});
	}
	function promptKeydown(event: KeyboardEvent) {
		if (
			event.key !== 'Enter' ||
			!(event.ctrlKey || event.metaKey) ||
			event.altKey ||
			event.shiftKey ||
			event.isComposing ||
			event.repeat ||
			event.defaultPrevented
		)
			return;
		event.preventDefault();
		go();
	}
</script>

{#snippet foot()}
	<span class="foot-note"
		>{plan ? t('newItem.footNote', { minutes: formatNumber(plan.minutes) }) : ''}</span
	>
	<span class="api-action"
		><button
			class="bu-action btn primary lg"
			data-variant="primary"
			disabled={!canMake}
			aria-describedby={tierBlocked ? 'new-item-tier' : undefined}
			data-trail="newItem.make"
			onclick={go}
			>{t('newItem.make')}
			<span class="cost">{t('moves.estimate', { gens: plan ? formatNumber(plan.gens) : '–' })}</span
			></button
		></span
	>
{/snippet}
{#snippet importFoot()}
	<ImportFoot
		busy={importer.busy}
		disabled={!importer.chosen.length}
		onimport={() => void importer.save()}
	/>
{/snippet}

<Sheet
	title={importing ? t('itemImport.title') : t('newItem.title')}
	className={importing ? 'importing' : ''}
	{dirty}
	onclose={() => (ui.sheet = null)}
	back={importing ? () => page(false) : undefined}
	backTo={t('newItem.title')}
	opener={isDemo() || importing
		? undefined
		: { label: t('itemImport.title'), icon: Import, iconOnly: true, onclick: () => page(true) }}
	locked={importing && importer.busy && !!importer.review}
	footer={isDemo() ? undefined : importing ? (importer.ready ? importFoot : undefined) : foot}
>
	{#snippet developer()}
		{#if !importing}<ApiPeek
				targets={[
					{
						scope: 'item-make',
						label: t('newItem.makeLabel'),
						plan: itemPlan(context, plannedInput)
					}
				]}
			/>{/if}
	{/snippet}

	{#if importing}<ImportItemsPane {importer} onmake={makeFrom} />{/if}
	{#if isDemo()}
		<div class="bu-notice" data-size="compact" data-tone="neutral">
			<Sparkles size={16} />
			<span>{t('newItem.demo')}</span>
		</div>
		<div class="actions">
			<button
				class="bu-action btn primary"
				data-variant="primary"
				data-trail="newItem.createCharacter"
				onclick={() => (ui.sheet = 'create')}
				>{openerLabel(t('welcome.createYourCharacter'))}<SurfaceChevron /></button
			>
			<button
				class="bu-action btn copy-demo"
				data-variant="outline"
				data-trail="newItem.copyDemo"
				onclick={useCopy}
				disabled={busy}
			>
				<span class:copy-hidden={busy}>{t('newItem.copyDemo')}</span>
				<span class:copy-hidden={!busy}>{t('common.copying')}</span>
			</button>
		</div>
	{:else}
		<TierNotice
			id="new-item-tier"
			minimumTier={plan?.minimumTier ?? 0}
			feature={t('newItem.feature')}
		/>
		<PoseIssues issues={plan?.poseIssues ?? []} />
		{#if replacing}<p class="small bu-muted">
				{t('newItem.replaces', { name: replacing.name })}
			</p>{/if}
		{#if rec && !rigReady(rec)}<p class="bu-notice" data-size="compact" data-tone="neutral">
				<TriangleAlert size={16} /><span>{t('newItem.needsSetup')}</span><button
					class="bu-action btn small"
					data-variant="outline"
					data-trail="newItem.setup"
					onclick={() => (ui.sheet = 'setup')}
					>{openerLabel(t('setup.title'))}<SurfaceChevron /></button
				>
			</p>{/if}
		{#if planned.fallback}
			<p class="bu-notice" data-size="compact" data-tone="warning" role="status">
				{t('creationSettings.fallback', {
					setting: t('newItem.method'),
					value: planned.method ? t(METHODS[planned.method].label) : t('creationSettings.automatic')
				})}
			</p>
		{/if}
		{#if planned.error}<p class="bu-notice" data-size="compact" data-tone="warning" role="alert">
				<TriangleAlert size={16} /><span>{planned.error}</span>
			</p>{/if}
		<div class="form">
			<p class="muted small">
				{t('newItem.standingFirst')}
			</p>
			<div class="field">
				<SlotPicker
					manifest={m}
					categories={all}
					{shown}
					value={group}
					label={t('newItem.where')}
					disabled={busy}
					onselect={(key) => (group = key)}
				/>
				{#if !shown.some((c) => c.key === group)}<p class="faint small">
						{t('newItem.notShown')}
					</p>{/if}
				{#if clothesNote}<p class="faint small">{displayMessage(clothesNote)}</p>{/if}
				{#if side}<p class="faint small">
						{side === 'right' ? t('newItem.rightHand') : t('newItem.leftHand')}
					</p>
					{#if handNote}<p class="faint small">
							{handNote}
						</p>{/if}{/if}
				<!-- Always present and only filled while the hint shows: announced once, not on every keystroke. -->
				<span class="sr" aria-live="polite">{offHandHint ? t('newItem.offHandHint') : ''}</span>
			</div>
			<div class="field">
				<label class="label" for="item-prompt">{t('newItem.what')}</label>
				<PromptField
					id="item-prompt"
					value={prompt}
					onvalue={(text) => (prompt = text)}
					spec={enhanceSpec}
					activity={{ scope: enhanceScope, label: 'Enhance item prompt' }}
					maxOutput={ITEM_PROMPT_MAX}
					enhanceDisabled={busy}
					rows={2}
					onkeydown={promptKeydown}
					keyshortcuts="Control+Enter Meta+Enter"
					describedby="item-submit-hint"
					placeholder={t('newItem.placeholder', {
						idea: suggestions[0]?.title ?? t('newItem.defaultIdea')
					})}
					maxlength={ITEM_PROMPT_MAX}
				/>
				<PromptSuggestions
					label={t('newItem.ideas')}
					value={prompt}
					{suggestions}
					onpick={(idea) => (prompt = idea.prompt)}
				/>
			</div>
			<p class="faint small" id="item-submit-hint">{t('newItem.shortcut')}</p>
			<ReferenceField
				bind:value={reference}
				bind:loading={referenceLoading}
				max={referenceMax}
				sideBySide
				inspectColors
				hint={t('newItem.referenceHint')}
				disabled={busy}
			/>
			{#if offHandHint}<p class="bu-notice" data-size="compact" data-tone="neutral">
					<Info size={16} /><span>{t('newItem.offHandHint')}</span><button
						class="bu-action btn sm"
						data-variant="outline"
						data-trail="newItem.useOffHand"
						onclick={() => (group = 'off_hand')}>{t('newItem.useOffHand')}</button
					>
				</p>{/if}
			<div class="field">
				<span class="label"
					>{t('newItem.colorHint')} <span class="faint">{t('common.optional')}</span></span
				>
				<div class="dots" role="radiogroup" aria-label={t('newItem.colorHint')}>
					<button
						class="dot-swatch none"
						role="radio"
						aria-checked={!color}
						tabindex={!color ? 0 : -1}
						data-trail="newItem.anyColor"
						onclick={() => (color = '')}>{t('newItem.anyColor')}</button
					>
					{#each Object.entries(SWATCHES) as [n, hex] (n)}
						<button
							class="dot-swatch"
							role="radio"
							aria-checked={color === n}
							tabindex={color === n ? 0 : -1}
							aria-label={displaySwatch(n)}
							title={displaySwatch(n)}
							style:background={hex}
							data-trail="newItem.color"
							onclick={() => (color = n)}
						></button>
					{/each}
				</div>
			</div>
			<p class="faint small">
				{t('newItem.checksNote')}
			</p>
			<details class="disclosure" bind:open={advancedOpen}>
				<summary><ChevronRight size={14} />{t('common.advanced')}</summary>
				<div>
					<label class="field"
						><span class="label small">{t('common.name')}</span><input
							class="bu-input input"
							bind:value={name}
							placeholder={suggestedName || t('newItem.title')}
						/></label
					>
					{#if automatic && (automatic === 'skel' || method === 'skel')}
						<label class="field"
							><span class="label small">{t('newItem.method')}</span>
							<span class="select-wrap boxed"
								><select
									class="bu-select select"
									value={planned.method}
									onchange={(event) => {
										changedMethod = true;
										method = event.currentTarget.value as Method | '';
									}}
									><option value=""
										>{t('newItem.automatic', { method: t(METHODS[automatic].label) })}</option
									>{#each Object.entries(METHODS) as [id, x] (id)}<option
											value={id}
											disabled={id === 'skel' && automatic !== 'skel'}>{t(x.label)}</option
										>{/each}</select
								><ChevronDown size={12} /></span
							>
						</label>
						<p class="faint small">{t(METHODS[planned.method || automatic].help)}</p>
					{/if}
					{#if plan}<p class="faint small">
							{plan.cell
								? t('newItem.planCanvas', {
										calls: formatNumber(plan.calls, { useGrouping: false }),
										cells: formatNumber(plan.cells, { useGrouping: false }),
										route: t('newItem.routeLabel'),
										cell: formatNumber(plan.cell, { useGrouping: false })
									})
								: t('newItem.plan', {
										calls: formatNumber(plan.calls, { useGrouping: false }),
										cells: formatNumber(plan.cells, { useGrouping: false }),
										route: t('newItem.routeLabel')
									})}
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
