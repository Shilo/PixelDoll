<script lang="ts">
	// Character ⋮ > Cost estimate: what a character costs when finished, what it has cost and what is left, in US dollars at
	// a plan's published price. Every input starts from the saved character and can be changed to plan another; nothing is
	// saved or sent. Prices come from costEstimate.ts, which uses the Studio's own quotes.
	import { tick } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import Sheet from './Sheet.svelte';
	import NumberStepper from './NumberStepper.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import { ChevronRight, RotateCcw } from './icons.ts';
	import { ui, doc, store } from './state.svelte.ts';
	import { app } from '../lib/app.svelte.ts';
	import { accountTier } from '../lib/pixellab/plans.ts';
	import { listProjects } from '../lib/store/project.ts';
	import { recordedCost } from '../lib/store/generation.ts';
	import { openSource } from '../lib/dress/project.ts';
	import { errorMessage } from '../lib/message.ts';
	import { displayMessage } from '../lib/i18n.ts';
	import { displayMove } from './displayMove.ts';
	import { currentCreationSettings, currentItemDrawing } from './settingsDefaults.svelte.ts';
	import { closeSettingsCost, settingsNavigation } from './settingsNavigation.svelte.ts';
	import { characterDraftWithDefaults } from './creationSettings.ts';
	import {
		autoFrame,
		BODY_STEP,
		facingOf,
		MODEL_IDS,
		MODELS,
		toggleDirection,
		toggleMirror,
		type CharacterModel,
		type Mirrors
	} from './characterConfig.ts';
	import {
		DEFAULT_RETRIES,
		characterCost,
		characterOf,
		covers,
		currentGens,
		newCharacter,
		planRate,
		projectedUsd,
		savingTips,
		seedInputs,
		spentUsd,
		usdOf,
		type CostCharacter,
		type CostInputs,
		type CostResult,
		type Tip
	} from './costEstimate.ts';
	import type { DirectionName, Manifest } from '../lib/store/manifest.ts';
	import type { WhisperKey } from 'svelte-whisper';

	const PAGE = 16;
	/** A practical ceiling for typed counts, so the steppers always step; far above any real project. */
	const MAX_COUNT = 9999;
	const WEST: DirectionName[] = ['north-west', 'west', 'south-west'];
	const MODEL_TEXT: Record<string, WhisperKey> = {
		'skeleton-v3': 'moveSheet.models.skeletonV3',
		v3: 'moveSheet.models.v3',
		pixminimax: 'moveSheet.models.pixminimax',
		import: 'costSheet.imported'
	};
	const nameOf = (projectId: string) =>
		store.projects.find((p) => p.id === projectId)?.name ?? t('common.character');
	const defaults = () => ({
		moveModel: currentCreationSettings('moves').values.model,
		itemDrawing: currentItemDrawing(),
		stateModel: currentCreationSettings('states').values.model
	});

	// ---------- characters ----------
	// Opened from a character menu, or from Settings for the open character.
	const id = ui.costProject || doc.id;
	let selected = $state(id);
	let roster = $state.raw<CostCharacter[]>([]);
	let opened = $state.raw<CostCharacter | null>(null);
	let error = $state<unknown>();
	async function manifestOf(projectId: string): Promise<Manifest> {
		if (projectId === doc.id && store.project && !doc.loading) return store.project.manifest;
		return (await openSource(projectId)).project.manifest;
	}
	void (async () => {
		try {
			const saved = (await listProjects()).filter((rec) => rec.origin === 'studio');
			roster = saved.map((rec) =>
				characterOf(
					rec.id,
					rec.id === doc.id && store.project ? store.project.manifest : rec.manifest,
					defaults()
				)
			);
			opened = roster.find((c) => c.id === id) ?? characterOf(id, await manifestOf(id), defaults());
		} catch (e) {
			error = e;
		}
	})();
	// ---------- the planner's character ----------
	// Starts from the New character defaults; its model and body size can change like the creator's (the frame then
	// follows the body, as the creator's Auto frame does).
	const creation = characterDraftWithDefaults(currentCreationSettings('characters').values);
	const seedPlan = {
		model: (creation.model ?? 'v3') as CharacterModel,
		body: creation.body ?? 64,
		frame: creation.frame ?? 80
	};
	let plan = $state({ model: seedPlan.model, body: seedPlan.body });
	const planFrame = $derived(plan.body === seedPlan.body ? seedPlan.frame : autoFrame(plan.body));
	const bodySizes = $derived.by(() => {
		const { min, max } = MODELS[plan.model].body;
		return Array.from({ length: (max - min) / BODY_STEP + 1 }, (_, i) => min + i * BODY_STEP);
	});
	function chooseModel(model: CharacterModel) {
		const sizes = MODELS[model].body;
		plan = { model, body: Math.min(sizes.max, Math.max(sizes.min, plan.body)) };
	}
	const created = $derived(
		newCharacter(
			{
				body: plan.body,
				frame: planFrame,
				model: plan.model,
				directions: facingOf(creation)
			},
			defaults()
		)
	);
	let scope = $state<'character' | 'all' | 'new'>('character');
	const character = $derived(
		scope === 'new'
			? created
			: selected === opened?.id
				? opened
				: (roster.find((c) => c.id === selected) ?? null)
	);

	// ---------- inputs, kept per character while the sheet is open ----------
	const initialTier = (() => {
		const tier = accountTier(app.balance);
		return tier !== null && tier >= 0 && tier <= 3 ? tier : 1;
	})();
	let tier = $state(initialTier);
	const rate = $derived(planRate(tier));
	let edits = $state<Record<string, CostInputs>>({});
	let allRetries = $state(DEFAULT_RETRIES);
	const inputs = $derived(character ? (edits[character.id] ?? seedInputs(character)) : null);
	function change(update: (next: CostInputs) => void) {
		if (!character || !inputs) return;
		const next = structuredClone($state.snapshot(inputs)) as CostInputs;
		update(next);
		edits[character.id] = next;
	}

	// ---------- results ----------
	// A pricing failure shows as an error with Reset, rather than leaving stale numbers on screen.
	const priced = $derived.by(() => {
		try {
			const result = character && inputs ? characterCost(character, inputs) : null;
			return {
				result,
				allResults:
					scope === 'all'
						? roster.map((c) => ({
								c,
								r: characterCost(c, { ...seedInputs(c), retries: allRetries })
							}))
						: [],
				tips: scope === 'all' || !character || !inputs ? [] : savingTips(character, inputs, rate),
				failure: '',
				error: undefined as unknown
			};
		} catch (e) {
			return {
				result: null,
				allResults: [],
				tips: [] as Tip[],
				failure: displayMessage(errorMessage(e)),
				error: e
			};
		}
	});
	const result = $derived<CostResult | null>(priced.result);
	const allResults = $derived(priced.allResults);
	// The planner budgets several identical characters: one is priced, then multiplied.
	const planned = $derived(scope === 'new' ? (inputs?.characters ?? 1) : 1);
	const toGo = $derived(
		scope === 'all' ? allResults.reduce((s, { r }) => s + r.toGo, 0) : (result?.toGo ?? 0) * planned
	);
	const spent = $derived(
		scope === 'all'
			? roster.reduce(
					(s, c) => ({
						generations: s.generations + c.spent.generations,
						usd: s.usd + c.spent.usd,
						unknown: s.unknown + c.spent.unknown,
						calls: s.calls + c.spent.calls,
						replaced: s.replaced + c.spent.replaced
					}),
					{ generations: 0, usd: 0, unknown: 0, calls: 0, replaced: 0 }
				)
			: character?.spent
	);
	const tips = $derived<Tip[]>(priced.tips);
	const edited = $derived(
		tier !== initialTier ||
			(scope === 'new' && (plan.model !== seedPlan.model || plan.body !== seedPlan.body)) ||
			(scope === 'all'
				? allRetries !== DEFAULT_RETRIES
				: !!character &&
					!!edits[character.id] &&
					JSON.stringify(edits[character.id]) !== JSON.stringify(seedInputs(character)))
	);
	function reset() {
		tier = initialTier;
		if (scope === 'all') allRetries = DEFAULT_RETRIES;
		else if (character) delete edits[character.id];
		if (scope === 'new') plan = { model: seedPlan.model, body: seedPlan.body };
	}

	// ---------- formatting ----------
	const usd = (value: number) => formatNumber(value, { style: 'currency', currency: 'USD' });
	const gens = (value: number) =>
		t('generationDetails.gens', { value: formatNumber(value, { maximumFractionDigits: 2 }) });
	const listUsd = (value: number) => usd(usdOf(value, rate));
	// The headline is the end cost: money really spent plus the estimated work still to go.
	const paid = $derived(spent ?? recordedCost([]));
	const projected = $derived(projectedUsd(paid, toGo, rate));
	const current = $derived(
		scope === 'all'
			? allResults.reduce((s, { r }) => s + currentGens(r), 0)
			: result
				? currentGens(result)
				: 0
	);
	const range = $derived.by(() => {
		const low = usd(projectedUsd(paid, toGo, rate, 'low')),
			high = usd(projected),
			units = gens(Math.round(paid.generations + toGo));
		return low === high ? units : t('costSheet.range', { low, high, gens: units });
	});
	const basis = $derived.by(() => {
		const text =
			scope === 'all'
				? t('costSheet.basis.all', { count: roster.length, n: formatNumber(roster.length) })
				: scope === 'new'
					? t('costSheet.basis.plan', { count: planned, n: formatNumber(planned) })
					: character?.kind === 'demo' || character?.kind === 'copy'
						? t('costSheet.basis.demo')
						: t('costSheet.basis.character');
		return tier === 0 ? t('costSheet.tierOneRates', { basis: text }) : text;
	});
	/** Short facts shown together under a row name. */
	const notes = (...parts: (string | false)[]) => parts.filter(Boolean).join(' · ');
	const moveName = (index: number) => {
		const id = result!.move(index).id;
		return id.startsWith('cost-move')
			? t('costSheet.moveNumber', { n: formatNumber(index + 1) })
			: displayMove(id, character?.manifest.rig.animations ?? []);
	};
	const itemName = (index: number) =>
		result!.item(index).name ?? t('costSheet.itemNumber', { n: formatNumber(index + 1) });
	const coverageText = (covered: number, moves: number) =>
		!covered
			? t('costSheet.standingOnly')
			: covered === moves
				? t('costSheet.allMoves', { count: moves, n: formatNumber(moves) })
				: t('costSheet.someMoves', {
						count: moves,
						covered: formatNumber(covered),
						n: formatNumber(moves)
					});
	const stateRoute = (route: string) =>
		route === 'pixen'
			? 'V3 (Pixen)'
			: route === 'pro-flash'
				? t('create.form.models.proFlash.label')
				: t('create.form.models.pro.label');
	const tipText = (tip: Tip) =>
		tip.kind === 'mirror'
			? t('costSheet.tips.mirror')
			: tip.kind === 'held'
				? t('costSheet.tips.held', {
						item: itemName(tip.item),
						moves: tip.moves.map(moveName).join(', ')
					})
				: t('costSheet.tips.trim', {
						move: moveName(tip.move),
						frames: formatNumber(tip.frames)
					});

	// ---------- directions ----------
	const draft = $derived.by(() => {
		const dirs = inputs?.directions ?? [];
		return {
			selected: dirs.map((d) => d.id),
			mirrors: Object.fromEntries(
				dirs.flatMap((d) => (d.mirrorOf ? [[d.id, d.mirrorOf]] : []))
			) as Mirrors
		};
	});
	function editDirections(apply: (d: { selected: DirectionName[]; mirrors: Mirrors }) => void) {
		const next = structuredClone($state.snapshot(draft));
		apply(next);
		change((inputs) => (inputs.directions = facingOf(next)));
	}

	// ---------- details paging ----------
	let moveLimit = $state(PAGE);
	let itemLimit = $state(PAGE);
	let coverageLimit = $state<Record<number, number>>({});
	function choose(next: typeof scope) {
		scope = next;
		moveLimit = itemLimit = PAGE;
		coverageLimit = {};
	}
	function toggleCoverage(item: number, move: number, on: boolean) {
		change((next) => {
			const current = next.coverage[item] ?? { all: true, except: [] };
			const except = new Set(current.except);
			if (on === current.all) except.delete(move);
			else except.add(move);
			next.coverage[item] = { all: current.all, except: [...except].sort((a, b) => a - b) };
			if (next.coverage[item].all && !next.coverage[item].except.length) delete next.coverage[item];
		});
	}
	const PER_CHARACTER = [
		{ key: 'moves', label: 'costSheet.moves', min: 0 },
		{ key: 'items', label: 'costSheet.items', min: 0 },
		{ key: 'states', label: 'costSheet.states', min: 0 }
	] as const satisfies readonly { key: keyof CostInputs; label: WhisperKey; min: number }[];
	const counts = $derived(
		scope === 'new'
			? [{ key: 'characters', label: 'costSheet.characters', min: 1 } as const, ...PER_CHARACTER]
			: PER_CHARACTER
	);
</script>

<Sheet
	title={t('costSheet.title')}
	back={settingsNavigation.costOpen ? closeSettingsCost : undefined}
	backTo={t('export.sheet.settings')}
	onclose={() => (ui.sheet = null)}
>
	<div class="cost-sheet">
		<div class="bu-segmented scope" role="radiogroup" aria-label={t('costSheet.scopeLabel')}>
			{#each [{ value: 'character', label: nameOf(selected) }, { value: 'all', label: t('costSheet.scopeAll') }, { value: 'new', label: t('costSheet.scopePlan') }] as const as option (option.value)}
				<label class="bu-segment" title={option.label}>
					<input
						type="radio"
						name="cost-scope"
						value={option.value}
						checked={scope === option.value}
						onchange={() => choose(option.value)}
					/>
					<span class="bu-segment-face"
						><span class={['scope-name', { wraps: option.value !== 'character' }]}
							>{option.label}</span
						></span
					>
				</label>
			{/each}
		</div>

		{#if error}<p class="notice bad small" role="alert">
				{displayMessage(errorMessage(error))}<ReportButton {error} />
			</p>
		{:else if !character && scope !== 'all'}<p class="muted" role="status">
				{t('costSheet.loading')}
			</p>
		{:else}
			<!-- Reset keeps one place and stays mounted through a pricing error and its recovery. -->
			<div class="headline">
				{#if priced.failure}<p class="notice bad small" role="alert">
						{priced.failure}<ReportButton error={priced.error} />
					</p>
				{:else}<p class="readout" role="status" aria-atomic="true">
						<strong class="amount num">{usd(projected)}</strong>
						<span class="faint small num">{range}</span>
						<span class="faint small">{basis}</span>
						{#if scope !== 'new'}<span class="spent small num"
								>{t('costSheet.spentToGo', {
									current: listUsd(current),
									spent: usd(spentUsd(paid, rate)),
									toGo: listUsd(toGo)
								})}</span
							>{/if}
					</p>{/if}
				<!-- Always in place, so changing an input never moves the page; disabled until something differs. -->
				<button
					type="button"
					class="bu-action btn plain icon reset"
					data-variant="quiet"
					aria-label={t('costSheet.resetEstimate')}
					title={t('costSheet.resetEstimate')}
					aria-disabled={!edited}
					onclick={() => edited && reset()}><RotateCcw size={18} aria-hidden="true" /></button
				>
			</div>

			<div class="controls">
				<label class="control">
					<span
						>{t('costSheet.tier')}<span class="faint small hint"
							>{t('costSheet.allowance', {
								count: rate.generations,
								n: formatNumber(rate.generations)
							})}</span
						></span
					>
					<select
						class="bu-input tier"
						value={tier}
						onchange={(e) => (tier = Number(e.currentTarget.value))}
					>
						<option value={0}>{t('costSheet.tierFree')}</option>
						{#each [1, 2, 3] as n (n)}<option value={n}
								>{t('costSheet.tierN', { n: formatNumber(n) })}</option
							>{/each}
					</select>
				</label>
				<div class="control">
					<span id="cost-retries">{t('costSheet.retries')}</span>
					<div class="count">
						<NumberStepper
							value={scope === 'all' ? allRetries : (inputs?.retries ?? DEFAULT_RETRIES)}
							max={MAX_COUNT}
							labelledby="cost-retries"
							decreaseLabel={t('costSheet.decrease', { name: t('costSheet.retries') })}
							increaseLabel={t('costSheet.increase', { name: t('costSheet.retries') })}
							onchange={(count) => {
								if (scope === 'all') allRetries = count;
								else change((next) => (next.retries = count));
							}}
						/>
					</div>
				</div>
				{#if scope !== 'all' && inputs && result}
					{#each counts as { key, label, min } (key)}
						<div class="control">
							<span id="cost-{key}">{t(label)}</span>
							<div class="count">
								<NumberStepper
									value={inputs[key]}
									{min}
									max={MAX_COUNT}
									labelledby="cost-{key}"
									decreaseLabel={t('costSheet.decrease', { name: t(label) })}
									increaseLabel={t('costSheet.increase', { name: t(label) })}
									onchange={(count) => change((next) => (next[key] = count))}
								/>
							</div>
						</div>
						{#if scope === 'new' && key === 'states'}
							<div class="control">
								<span id="cost-size"
									>{t('create.form.bodySize')}<span class="faint small hint"
										>{t('costSheet.frameHint', { n: formatNumber(planFrame) })}</span
									></span
								>
								<div class="count">
									<NumberStepper
										value={plan.body}
										values={bodySizes}
										suffix="px"
										labelledby="cost-size"
										decreaseLabel={t('costSheet.decrease', { name: t('create.form.bodySize') })}
										increaseLabel={t('costSheet.increase', { name: t('create.form.bodySize') })}
										onchange={(body) => (plan.body = body)}
									/>
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>

			{#if scope !== 'all' && inputs && result}
				<section class="directions" aria-labelledby="cost-directions">
					<p class="compass-label">
						<span id="cost-directions">{t('common.directions')}</span>
						<span class="faint small hint"
							>{t('costSheet.directionCount', {
								count: inputs.directions.length,
								n: formatNumber(inputs.directions.length),
								drawn: formatNumber(result.drawn.length)
							})}</span
						>
					</p>
					<DirectionCompass
						label={t('common.directions')}
						selected={draft.selected}
						mirrors={draft.mirrors}
						mirrorTargets={WEST}
						shortLabels
						compact
						ontoggle={(dir) => editDirections((d) => void toggleDirection(d, dir))}
						onmirror={(dir) => editDirections((d) => toggleMirror(d, dir))}
					/>
				</section>
			{/if}

			{#if tips.length}
				<div class="actions">
					{#each tips as tip (tipText(tip))}
						{@const text = t('costSheet.tips.saving', {
							tip: tipText(tip),
							saving: usd(tip.saving)
						})}
						<button
							type="button"
							class="bu-action btn tip"
							data-variant="outline"
							title={text}
							onclick={() => character && (edits[character.id] = tip.inputs)}
							><span class="tip-text">{text}</span></button
						>
					{/each}
				</div>
			{/if}

			<details class="disclosure details">
				<summary><ChevronRight size={14} />{t('costSheet.details')}</summary>
				<div class="receipt">
					{#if scope === 'all'}
						{#each allResults as { c, r } (c.id)}
							<button
								type="button"
								class="bu-action line link-row"
								onclick={async () => {
									selected = c.id;
									choose('character');
									// The row goes away with All: keep keyboard focus on the character's tab.
									await tick();
									document
										.querySelector<HTMLInputElement>('input[name="cost-scope"][value="character"]')
										?.focus();
								}}
								><span class="label">{nameOf(c.id)}</span><span class="cost num"
									>{usd(projectedUsd(c.spent, r.toGo, rate))}<span class="faint small"
										>{gens(c.spent.generations + r.toGo)}</span
									></span
								><ChevronRight size={14} /></button
							>
						{/each}
						{@render recorded()}
					{:else if result && inputs && character}
						{#if scope === 'new' && planned > 1}<div class="line">
								<span class="label"
									>{t('costSheet.perCharacter', { n: formatNumber(planned) })}<span
										class="faint small">{t('costSheet.ownItems')}</span
									></span
								><span class="cost num"
									>{listUsd(result.toGo)}<span class="faint small">{gens(result.toGo)}</span></span
								>
							</div>{/if}
						<!-- Model is an advanced choice in New character too, so the planner keeps it in Details. -->
						{#if scope === 'new'}<label class="control">
								<span>{t('create.form.model')}</span>
								<select
									class="bu-input tier"
									value={plan.model}
									onchange={(e) => chooseModel(e.currentTarget.value as CharacterModel)}
								>
									{#each MODEL_IDS as model (model)}<option value={model}
											>{MODELS[model].label}</option
										>{/each}
								</select>
							</label>{/if}
						<div class="line">
							<span class="label"
								>{t('costSheet.setup')}<span class="faint small"
									>{t('costSheet.setupNote', {
										frame: formatNumber(character.manifest.rig.cell.w),
										drawn: formatNumber(result.drawn.length)
									})}</span
								></span
							>{@render cost(result.setup.gens)}
						</div>
						<details class="row-group">
							<summary class="line"
								><span class="label"
									>{t('costSheet.moves')}<span class="faint small"
										>{t('costSheet.moveCount', {
											count: inputs.moves,
											n: formatNumber(inputs.moves)
										})}</span
									></span
								>{@render cost(result.moves.gens)}</summary
							>
							<div class="rows">
								{#each Array.from({ length: Math.min(inputs.moves, moveLimit) }, (_, i) => i) as index (index)}
									{@const row = result.move(index)}
									<details class="row-group">
										<summary class="line"
											><span class="label"
												>{moveName(index)}<span class="faint small"
													>{t('costSheet.moveSetting', {
														frames: formatNumber(row.frames),
														model: t(MODEL_TEXT[row.model])
													})}</span
												></span
											>{@render cost(row.gens)}</summary
										>
										<div class="editor control">
											<span id="cost-frames-{index}">{t('costSheet.frames')}</span>
											<div class="count">
												<NumberStepper
													value={row.frames}
													values={result.frameChoices(index)}
													labelledby="cost-frames-{index}"
													decreaseLabel={t('costSheet.decrease', { name: t('costSheet.frames') })}
													increaseLabel={t('costSheet.increase', { name: t('costSheet.frames') })}
													onchange={(frames) => change((next) => (next.frames[index] = frames))}
												/>
											</div>
										</div>
									</details>
								{:else}<p class="faint small">{t('costSheet.noMoves')}</p>{/each}
								{#if inputs.moves > moveLimit}<button
										type="button"
										class="bu-action btn plain more"
										onclick={() => (moveLimit += PAGE)}>{t('costSheet.showMore')}</button
									>{/if}
							</div>
						</details>
						<details class="row-group">
							<summary class="line"
								><span class="label"
									>{t('costSheet.items')}<span class="faint small"
										>{t('costSheet.itemCount', {
											count: inputs.items,
											n: formatNumber(inputs.items)
										})}</span
									></span
								>{@render cost(result.items.gens)}</summary
							>
							<div class="rows">
								{#each Array.from({ length: Math.min(inputs.items, itemLimit) }, (_, i) => i) as index (index)}
									{@const row = result.item(index)}
									{@const limit = Math.min(inputs.moves, coverageLimit[index] ?? PAGE)}
									<details class="row-group">
										<summary class="line"
											><span class="label"
												>{itemName(index)}<span class="faint small"
													>{notes(
														coverageText(row.covered, inputs.moves),
														row.held && t('costSheet.held'),
														row.remake &&
															t(row.inherited ? 'costSheet.copiedRemade' : 'costSheet.remade')
													)}</span
												></span
											>{@render cost(row.gens)}</summary
										>
										<fieldset class="editor choices">
											<legend class="small">{t('costSheet.fitToMoves')}</legend>
											{#each Array.from({ length: limit }, (_, i) => i) as move (move)}
												<label class="check"
													><input
														type="checkbox"
														checked={covers(inputs.coverage[index], move)}
														onchange={(e) => toggleCoverage(index, move, e.currentTarget.checked)}
													/>{moveName(move)}</label
												>
											{:else}<span class="faint small">{t('costSheet.standingOnly')}</span>{/each}
											{#if inputs.moves > limit}<button
													type="button"
													class="bu-action btn plain more"
													onclick={() => (coverageLimit[index] = limit + PAGE)}
													>{t('costSheet.showMore')}</button
												>{/if}
										</fieldset>
									</details>
								{:else}<p class="faint small">{t('costSheet.noItems')}</p>{/each}
								{#if inputs.items > itemLimit}<button
										type="button"
										class="bu-action btn plain more"
										onclick={() => (itemLimit += PAGE)}>{t('costSheet.showMore')}</button
									>{/if}
							</div>
						</details>
						<div class="line">
							<span class="label"
								>{t('costSheet.states')}<span class="faint small"
									>{notes(
										t('costSheet.stateSetting', {
											count: inputs.states,
											n: formatNumber(inputs.states),
											route: stateRoute(result.states.route)
										}),
										result.states.route === 'pro-flash' && t('costSheet.flashAsPro'),
										result.states.assumed && t('costSheet.stateAssumed')
									)}</span
								></span
							>{@render cost(result.states.gens)}
						</div>
						{#if scope !== 'new'}{@render recorded()}{/if}
					{/if}
				</div>
			</details>
		{/if}
	</div>
</Sheet>

{#snippet cost(value: number)}
	<span class="cost num">{listUsd(value)}<span class="faint small">{gens(value)}</span></span>
{/snippet}

{#snippet recorded()}
	{#if spent}
		<div class="line">
			<span class="label"
				>{t('costSheet.recordedUsage')}<span class="faint small"
					>{notes(
						t('costSheet.savedArtworkOnly'),
						!!spent.unknown &&
							t('costSheet.unpriced', { count: spent.unknown, n: formatNumber(spent.unknown) })
					)}</span
				></span
			>
			<span class="cost num"
				>{usd(spentUsd(spent, rate))}<span class="faint small">{gens(spent.generations)}</span
				></span
			>
		</div>
	{/if}
{/snippet}

<style>
	.cost-sheet {
		display: grid;
		gap: 14px;
		min-width: 0;
	}
	.scope {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.scope .bu-segment {
		min-width: 0;
	}
	.scope .bu-segment-face {
		min-height: 40px;
		min-width: 0;
	}
	/* A character's name stays on one line and ends in an ellipsis; the fixed tab names may wrap to two tight lines in
	   longer languages rather than being cut off. */
	.scope-name {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.scope-name.wraps {
		overflow: visible;
		white-space: normal;
		line-height: 1.1;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.readout {
		display: grid;
		gap: 2px;
		margin: 0;
	}
	.amount {
		font-size: 2.75rem;
		line-height: 1.08;
		font-weight: 600;
		letter-spacing: -0.03em;
		overflow-wrap: anywhere;
	}
	.spent {
		margin-top: 4px;
		color: var(--text-2);
	}
	.controls {
		display: grid;
		gap: 4px;
	}
	.control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 48px;
	}
	.control > span {
		display: grid;
	}
	.hint {
		font-weight: 400;
	}
	.count {
		flex: 0 0 152px;
	}
	/* Selects share the steppers' width so every control lines up. */
	.tier {
		flex: 0 0 152px;
		width: 152px;
	}
	/* Like the rows above: the title and its count on the left, the compass right-aligned with the steppers. */
	.directions {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px 12px;
	}
	.compass-label {
		display: grid;
		margin: 0;
		padding-top: 6px;
	}
	/* Stays at the right edge even when a narrow sheet wraps it below the title. */
	.directions > :global(:last-child) {
		margin-inline-start: auto;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.tip {
		min-height: 40px;
		max-width: 100%;
		min-width: 0;
		color: var(--accent-text);
	}
	.tip-text {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.headline {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 8px;
	}
	.reset {
		width: 44px;
		height: 44px;
		margin-inline-end: -10px;
	}
	.details > summary {
		min-height: var(--ctl-h);
	}
	.receipt {
		display: grid;
		padding: 0;
	}
	.receipt > :global(*) + :global(*) {
		border-top: 1px solid var(--line);
	}
	.line {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding-block: 6px;
		width: 100%;
		text-align: start;
		list-style: none;
		cursor: default;
	}
	summary.line {
		cursor: pointer;
	}
	summary.line::-webkit-details-marker {
		display: none;
	}
	.link-row {
		border-radius: 0;
	}
	.label {
		display: grid;
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.cost {
		display: grid;
		justify-items: end;
		white-space: nowrap;
		font-weight: 600;
	}
	.cost .small {
		font-weight: 400;
	}
	.rows {
		display: grid;
		padding-inline-start: 12px;
	}
	.rows > :global(* + *) {
		border-top: 1px solid var(--line);
	}
	.editor {
		padding: 0 0 10px 12px;
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin: 0;
		border: 0;
		min-width: 0;
	}
	.choices legend {
		padding: 0;
		margin-bottom: 4px;
		color: var(--text-2);
	}
	.choices .check {
		min-height: 44px;
	}
	.more {
		justify-self: start;
		min-height: 44px;
		color: var(--accent-text);
	}
</style>
