<script lang="ts">
	// Character ⋮ > Cost estimate: what a character costs when finished, what it has cost and what is left, in US dollars at
	// a plan's published price. Every input starts from the saved character and can be changed to plan another; nothing is
	// saved or sent. Prices come from costEstimate.ts, which uses the Studio's own quotes.
	import { untrack } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import NumberStepper from './NumberStepper.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import { ChevronRight } from './icons.ts';
	import { ui, doc, store } from './state.svelte.ts';
	import { app } from '../lib/app.svelte.ts';
	import { accountTier } from '../lib/pixellab/plans.ts';
	import { listProjects } from '../lib/store/project.ts';
	import { openSource } from '../lib/dress/project.ts';
	import { errorMessage } from '../lib/message.ts';
	import { displayMessage } from '../lib/i18n.ts';
	import { displayMove } from './displayMove.ts';
	import { currentCreationSettings } from './settingsDefaults.svelte.ts';
	import { characterDraftWithDefaults } from './creationSettings.ts';
	import { facingOf, toggleDirection, toggleMirror, type Mirrors } from './characterConfig.ts';
	import {
		DEFAULT_RETRIES,
		characterCost,
		characterOf,
		covers,
		newCharacter,
		pricedTier,
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

	let { id }: { id: string } = $props();
	const PAGE = 16;
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
		stateModel: currentCreationSettings('states').values.model
	});

	// ---------- characters ----------
	let selected = $state(untrack(() => id));
	let roster = $state.raw<CostCharacter[]>([]);
	let opened = $state.raw<CostCharacter | null>(null);
	let error = $state('');
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
			const first = untrack(() => id);
			opened =
				roster.find((c) => c.id === first) ??
				characterOf(first, await manifestOf(first), defaults());
		} catch (e) {
			error = displayMessage(errorMessage(e));
		}
	})();
	const fresh = () => {
		const settings = characterDraftWithDefaults(currentCreationSettings('characters').values);
		return newCharacter(
			{
				body: settings.body ?? 64,
				frame: settings.frame ?? 80,
				model: settings.model,
				directions: facingOf(settings)
			},
			defaults()
		);
	};
	const created = fresh();
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
	const rate = $derived(pricedTier(tier));
	let edits = $state<Record<string, CostInputs>>({});
	let allRetries = $state(DEFAULT_RETRIES);
	const inputs = $derived(character ? (edits[character.id] ?? seedInputs(character)) : null);
	function change(update: (next: CostInputs) => void) {
		if (!character || !inputs) return;
		const next = structuredClone($state.snapshot(inputs)) as CostInputs;
		update(next);
		edits[character.id] = next;
	}
	/** A typed count applies once it is a whole number; a half-typed one is left alone. */
	const whole = (value: number, apply: (count: number) => void) => {
		if (Number.isInteger(value) && value >= 0) apply(value);
	};

	// ---------- results ----------
	const locked = $derived(scope !== 'all' && character?.kind === 'demo');
	const result = $derived<CostResult | null>(
		character && inputs ? characterCost(character, inputs) : null
	);
	const allResults = $derived(
		scope === 'all'
			? roster.map((c) => ({ c, r: characterCost(c, { ...seedInputs(c), retries: allRetries }) }))
			: []
	);
	const total = $derived(
		scope === 'all' ? allResults.reduce((s, { r }) => s + r.total, 0) : (result?.total ?? 0)
	);
	const toGo = $derived(
		scope === 'all' ? allResults.reduce((s, { r }) => s + r.toGo, 0) : (result?.toGo ?? 0)
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
	const tips = $derived<Tip[]>(
		scope === 'all' || locked || !character || !inputs ? [] : savingTips(character, inputs, rate)
	);
	const edited = $derived(
		tier !== initialTier ||
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
	}

	// ---------- formatting ----------
	const usd = (value: number) => formatNumber(value, { style: 'currency', currency: 'USD' });
	const gens = (value: number) =>
		t('generationDetails.gens', { value: formatNumber(value, { maximumFractionDigits: 2 }) });
	const listUsd = (value: number) => usd(usdOf(value, rate));
	const range = $derived.by(() => {
		const low = usd(usdOf(total, rate, 'low')),
			high = listUsd(total),
			units = gens(Math.round(total));
		return low === high ? units : t('costSheet.range', { low, high, gens: units });
	});
	const basis = $derived.by(() => {
		const text =
			scope === 'all'
				? t('costSheet.basis.all', { count: roster.length, n: formatNumber(roster.length) })
				: scope === 'new'
					? t('costSheet.basis.new')
					: character?.kind === 'demo'
						? t('costSheet.basis.demo')
						: character?.kind === 'copy'
							? t('costSheet.basis.copy')
							: t('costSheet.basis.character');
		return tier === 0 ? t('costSheet.tierOneRates', { basis: text }) : text;
	});
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
		route === 'pixen' ? 'V3 (Pixen)' : t('create.form.models.pro.label');
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
	const counts = [
		{ key: 'moves', label: 'costSheet.moves' },
		{ key: 'items', label: 'costSheet.items' },
		{ key: 'states', label: 'costSheet.states' }
	] as const satisfies readonly { key: keyof CostInputs; label: WhisperKey }[];
</script>

<Sheet title={t('costSheet.title')} cancel="common.done" onclose={() => (ui.sheet = null)}>
	<div class="cost-sheet">
		<div class="bu-segmented scope" role="radiogroup" aria-label={t('costSheet.scopeLabel')}>
			{#each [{ value: 'character', label: nameOf(selected) }, { value: 'all', label: t('costSheet.scopeAll') }, { value: 'new', label: t('costSheet.scopeNew') }] as const as option (option.value)}
				<label class="bu-segment" title={option.label}>
					<input
						type="radio"
						name="cost-scope"
						value={option.value}
						checked={scope === option.value}
						onchange={() => choose(option.value)}
					/>
					<span class="bu-segment-face"><span class="scope-name">{option.label}</span></span>
				</label>
			{/each}
		</div>

		{#if error}<p class="notice bad small" role="alert">{error}</p>
		{:else if !character && scope !== 'all'}<p class="muted" role="status">
				{t('costSheet.loading')}
			</p>
		{:else}
			<p class="readout" role="status" aria-atomic="true">
				<strong class="amount num">{listUsd(total)}</strong>
				<span class="faint small num">{range}</span>
				<span class="faint small">{basis}</span>
				{#if scope !== 'new' && spent}<span class="spent small num"
						>{t('costSheet.spentToGo', {
							spent: usd(spentUsd(spent, rate)),
							toGo: listUsd(toGo)
						})}</span
					>{/if}
			</p>

			<div class="controls">
				<label class="control">
					<span>{t('costSheet.tier')}</span>
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
				{#if !locked}
					<div class="control">
						<span id="cost-retries"
							>{t(
								'costSheet.retries'
							)}{#if (scope === 'all' ? allRetries : inputs?.retries) === DEFAULT_RETRIES}<span
									class="faint small hint">{t('costSheet.retriesDefault')}</span
								>{/if}</span
						>
						<div class="count">
							<NumberStepper
								value={scope === 'all' ? allRetries : (inputs?.retries ?? DEFAULT_RETRIES)}
								labelledby="cost-retries"
								decreaseLabel={t('costSheet.decrease', { name: t('costSheet.retries') })}
								increaseLabel={t('costSheet.increase', { name: t('costSheet.retries') })}
								onchange={(value) =>
									whole(value, (count) => {
										if (scope === 'all') allRetries = count;
										else change((next) => (next.retries = count));
									})}
							/>
						</div>
					</div>
				{/if}
			</div>

			{#if scope !== 'all' && !locked && inputs && result}
				<div class="inputs">
					<div class="counts">
						{#each counts as { key, label } (key)}
							<div class="control">
								<span id="cost-{key}">{t(label)}</span>
								<div class="count">
									<NumberStepper
										value={inputs[key]}
										labelledby="cost-{key}"
										decreaseLabel={t('costSheet.decrease', { name: t(label) })}
										increaseLabel={t('costSheet.increase', { name: t(label) })}
										onchange={(value) =>
											whole(value, (count) => change((next) => (next[key] = count)))}
									/>
								</div>
							</div>
						{/each}
					</div>
					<section class="directions" aria-labelledby="cost-directions">
						<p class="compass-label">
							<span id="cost-directions">{t('common.directions')}</span>
							<span class="faint small"
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
				</div>
			{/if}

			{#if tips.length || edited}
				<div class="actions">
					{#each tips as tip (tipText(tip))}
						<button
							type="button"
							class="bu-action btn tip"
							data-variant="outline"
							onclick={() => character && (edits[character.id] = tip.inputs)}
							>{t('costSheet.tips.saving', { tip: tipText(tip), saving: usd(tip.saving) })}</button
						>
					{/each}
					{#if edited}<button type="button" class="bu-action btn plain reset" onclick={reset}
							>{t('costSheet.reset')}</button
						>{/if}
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
								onclick={() => {
									selected = c.id;
									choose('character');
								}}
								><span class="label">{nameOf(c.id)}</span><span class="cost num"
									>{listUsd(r.total)}<span class="faint small">{gens(r.total)}</span></span
								><ChevronRight size={14} /></button
							>
						{/each}
						{@render recorded()}
					{:else if result && inputs && character}
						{#if character.kind === 'demo'}<p class="muted small">{t('costSheet.demoLocked')}</p>
						{:else if character.kind === 'copy'}<p class="muted small">
								{t('costSheet.copyNote')}
							</p>{/if}
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
										<label class="editor control">
											<span>{t('costSheet.frames')}</span>
											<select
												class="bu-input frames"
												value={row.frames}
												onchange={(e) => {
													const frames = Number(e.currentTarget.value);
													change((next) => (next.frames[index] = frames));
												}}
											>
												{#each result.frameChoices(index) as frames (frames)}<option value={frames}
														>{formatNumber(frames)}</option
													>{/each}
											</select>
										</label>
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
													>{coverageText(row.covered, inputs.moves)}{#if row.held}
														· {t('costSheet.held')}{/if}{#if row.remake}
														· {row.inherited
															? t('costSheet.copiedRemade')
															: t('costSheet.remade')}{/if}</span
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
									>{t('costSheet.stateSetting', {
										count: inputs.states,
										n: formatNumber(inputs.states),
										route: stateRoute(result.states.route)
									})}{#if result.states.assumed}
										· {t('costSheet.flashAsPro')}{/if}</span
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
					>{t('costSheet.savedArtworkOnly')}{#if spent.unknown}
						· {t('costSheet.unpriced', {
							count: spent.unknown,
							n: formatNumber(spent.unknown)
						})}{/if}</span
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
	.scope-name {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
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
	.controls,
	.counts {
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
	.tier,
	.frames {
		width: auto;
		min-width: 130px;
	}
	.inputs {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px 24px;
	}
	.counts {
		flex: 1 1 260px;
	}
	.directions {
		flex: 0 1 auto;
	}
	.compass-label {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 6px;
		margin: 0 0 2px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.tip {
		min-height: 40px;
		color: var(--accent-text);
	}
	.reset {
		margin-inline-start: auto;
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
