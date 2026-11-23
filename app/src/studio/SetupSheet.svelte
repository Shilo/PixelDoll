<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { customize } from './experience/state.svelte.ts';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { setupPeekPlan } from './apiPlans.ts';
	import Sprite from './Sprite.svelte';
	import { formDrafts } from './formDrafts.ts';
	import { setupPlan, rigReady, type SetupPlan } from '../lib/rig/setup.ts';
	import * as db from '../lib/store/db.ts';
	import type { StoredProject } from '../lib/store/project.ts';
	import { SETUP_STEPS, setupRegistrationStuck, setupResumeGens } from './setup.ts';
	import { freshSeed } from './characterConfig.ts';
	import {
		ui,
		doc,
		store,
		settingUp,
		moving,
		creates,
		startSetup,
		setupBusy,
		dismissSetup,
		withKey
	} from './state.svelte.ts';
	import { Check, TriangleAlert } from './icons.ts';
	import { displayMove } from './displayMove.ts';
	import { displayDirection } from './displayDirection.ts';
	import { moveName, setupWarningNote } from './model.ts';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import ProblemNotice from './ProblemNotice.svelte';
	import { cameraMessage } from '../lib/store/generation.ts';
	const m = $derived(store.project?.manifest);
	const camera = $derived(
		m?.rig.view && getLocale() !== 'en' ? cameraMessage(m.rig.view) : undefined
	);
	const moveRefs = $derived(m?.rig.animations ?? []);
	let rec = $state.raw<StoredProject | null>(null),
		plan = $state.raw<SetupPlan | null>(null);
	const draft = formDrafts.setup?.projectId === doc.id ? formDrafts.setup : undefined;
	let error = $state.raw<Message | string>(''),
		looks = $state(
			draft?.looks ?? store.project?.manifest.items.find((i) => i.slot === 'body')?.prompt ?? ''
		),
		restAnim = $state(draft?.restAnim ?? '');
	const mine = $derived(settingUp.spec?.projectId === doc.id);
	const active = $derived(mine && !settingUp.done && !settingUp.error);
	const busyElsewhere = $derived(
		(!!settingUp.spec && !settingUp.done && !mine) ||
			(!!moving.spec && !moving.done) ||
			creates.some((run) => !run.projectId)
	);
	const ready = $derived(rigReady(rec));
	// A registration that finished without a usable character replays as such: only a new seed (0.25 gen) can change it.
	let stuck = $state(false);
	// Resuming reuses every completed request; this is what it still buys, shown on the button before it is pressed.
	let resumeGens = $state<number | null>(null);
	$effect(() => {
		const spec = mine && settingUp.error ? $state.snapshot(settingUp.spec) : null;
		let current = true;
		stuck = false;
		resumeGens = null;
		if (spec) {
			void setupRegistrationStuck(spec)
				.then((value) => {
					if (current) stuck = value;
				})
				.catch((failure: unknown) => console.error('setup review', failure));
			void setupResumeGens(spec)
				.then((value) => {
					if (current) resumeGens = value;
				})
				.catch((failure: unknown) => console.error('setup price', failure));
		}
		return () => {
			current = false;
		};
	});
	const step = $derived(SETUP_STEPS.findIndex((s) => s.id === settingUp.progress?.step));
	const preview = $derived(plan?.rest.south ?? (plan && Object.values(plan.rest)[0]) ?? null);
	$effect(() => {
		const p = store.project,
			selected = restAnim,
			id = doc.id;
		let stale = false;
		if (p)
			void setupPlan(p, selected || undefined, (move) =>
				moveName(move, p.manifest.rig.animations)
			).then(
				(p) => {
					if (!stale) {
						plan = p;
						error = '';
					}
				},
				(e: unknown) => {
					if (!stale) {
						plan = null;
						error = errorMessage(e);
					}
				}
			);
		void db.get<StoredProject>('projects', id).then((r) => {
			if (!stale) rec = r ?? null;
		});
		return () => {
			stale = true;
		};
	});
	function go() {
		if (!m || !plan || !looks.trim()) return;
		const spec = {
			projectId: doc.id,
			baseHash: m.rig.baseHash,
			restAnim: plan.restAnim,
			looks: looks.trim(),
			seed: 1 + Math.floor(Math.random() * 2_000_000)
		};
		formDrafts.setup = { projectId: doc.id, looks, restAnim };
		withKey(() => {
			if (!setupBusy()) formDrafts.setup = undefined;
			void startSetup(spec);
			ui.sheet = 'setup';
		}); // refused (a resumed setup runs): keep the choices
	}
</script>

<Sheet
	title={t('setup.title')}
	exitNote={active ? 'sheet-exit-note' : undefined}
	onclose={() => (ui.sheet = null)}
>
	{#snippet developer()}
		<ApiPeek
			targets={mine && settingUp.spec
				? [
						{
							scope: 'character-setup-progress',
							label: t('setup.currentRigSetup'),
							plan: setupPeekPlan(plan, settingUp.spec.looks),
							activityScope: settingUp.spec.activityScope
						},
						...(settingUp.error && !settingUp.done
							? [
									{
										scope: 'character-setup-resume',
										label: t('setup.resumeRigSetup'),
										plan: setupPeekPlan(plan, settingUp.spec?.looks ?? looks),
										activityScope: settingUp.spec?.activityScope
									}
								]
							: [])
					]
				: active
					? []
					: [
							{
								scope: 'character-setup',
								label: t('setup.setUpRig'),
								plan: setupPeekPlan(plan, looks)
							}
						]}
		/>
	{/snippet}

	{#if mine && settingUp.spec}
		<div class="api-action">
			<span class="small muted">{t('setup.rigSetup')}</span>
		</div>
		{#if settingUp.done}<p class="notice ok">
				<Check size={16} />{t('setup.ready')}
			</p>
		{:else}
			<ol class="steps-list">
				{#each SETUP_STEPS as s, i (s.id)}<li class:done={i < step} class:now={i === step}>
						{#if i < step}<Check size={16} />{:else if i === step && !settingUp.error}<span
								class="bu-ring ring spin"
								aria-hidden="true"
							></span>{:else}<span class="dot" aria-hidden="true"></span>{/if}{displayMessage(
							s.label
						)}{#if i === step && settingUp.progress}<span class="small faint"
								>{settingUp.progress.done}/{settingUp.progress.total}</span
							>{/if}
					</li>{/each}
			</ol>
		{/if}
		{#if settingUp.error}<ProblemNotice
				error={settingUp.error}
				report={{ area: 'Rig setup' }}
			/>{/if}
		{#each settingUp.warnings as warning (warning)}<p class="notice warn small">
				<TriangleAlert size={14} /><span
					>{setupWarningNote(warning, t, displayDirection, (move) =>
						displayMove(move, moveRefs)
					)}</span
				>
			</p>{/each}
	{:else}
		{#if ready}<p class="notice ok small">
				<Check size={16} />{t('setup.alreadyRigged')}
			</p>{/if}
		<p class="muted">
			{t('setup.intro')}
		</p>
		<p class="faint small">
			{m?.rig.view
				? t('setup.cameraSaved', { view: camera ? displayMessage(camera) : m.rig.view })
				: t('setup.cameraDefault')}
		</p>
		{#if preview}<div class="setup-preview">
				<Sprite img={preview} k={3} limit={192} label={t('setup.previewLabel')} />
			</div>{/if}
		{#if m}<label class="field"
				><span class="label">{t('setup.standingReference')}</span><select
					class="bu-input input"
					bind:value={restAnim}
					disabled={plan?.fixedRest}
					><option value="">{t('setup.chooseAutomatically')}</option
					>{#each m.rig.animations as a (a.id)}<option value={a.id}
							>{displayMove(a.id, moveRefs)}</option
						>{/each}</select
				><span class="faint small"
					>{plan?.fixedRest ? t('setup.fixedRest') : t('setup.chooseRest')}</span
				></label
			>{/if}
		<label class="field"
			><span class="label">{t('setup.appearance')}</span><textarea
				class="bu-input input"
				rows="3"
				maxlength="2000"
				bind:value={looks}
				placeholder={t('setup.appearancePlaceholder')}></textarea><span class="faint small"
				>{t('setup.appearanceHelp')}</span
			></label
		>
		{#if plan}<p class="faint small">
				{t('setup.estimate', {
					frames: formatNumber(plan.frames.size),
					gens: formatNumber(plan.gens, { maximumFractionDigits: 2 }),
					connection: formatNumber(0.25)
				})}
			</p>{/if}
		{#each plan?.warnings ?? [] as warning (warning)}<p class="notice warn small">
				<TriangleAlert size={14} /><span
					>{setupWarningNote(warning, t, displayDirection, (move) =>
						displayMove(move, moveRefs)
					)}</span
				>
			</p>{/each}
		{#if error}<p class="notice warn small" role="alert">
				<TriangleAlert size={16} /><span>{displayNestedMessage(error)}</span>
			</p>{/if}
		{#if busyElsewhere}<p class="notice small">
				{t('setup.busyElsewhere')}
			</p>{/if}
	{/if}
	{#if active}<p class="muted small" id="sheet-exit-note">{t('setup.keepWorking')}</p>{/if}
	{#snippet footer()}
		{#if mine && settingUp.done}<button
				class="bu-action btn primary"
				data-variant="primary"
				onclick={async () => {
					if (!(await dismissSetup())) return;
					customize();
					ui.sheet = null;
				}}>{t('create.sheet.startDressing')}</button
			>
		{:else if mine && settingUp.error}
			<div class="recovery-actions">
				<button
					class="bu-action btn plain"
					data-variant="quiet"
					onclick={async () => {
						if ((await dismissSetup()) && ui.sheet === 'setup') ui.sheet = null;
					}}>{t('common.discard')}</button
				>
				<div class="recovery-options">
					<span class="api-action"
						><button
							class="bu-action btn primary"
							data-variant="primary"
							onclick={() =>
								settingUp.spec &&
								withKey(
									() =>
										void startSetup({
											...$state.snapshot(settingUp.spec!),
											...(stuck ? { seed: freshSeed() } : {})
										})
								)}
							>{#if stuck}{t('setup.newRegistration')}
								<span class="cost">{t('moves.estimate', { gens: formatNumber(0.25) })}</span
								>{:else}{t('setup.resume')}
								<span class="cost"
									>{t('moves.estimate', {
										gens: resumeGens === null ? '–' : formatNumber(resumeGens)
									})}</span
								>{/if}</button
						></span
					>
				</div>
			</div>
		{:else if !active}<span class="foot-note">{t('setup.pixelsUnchanged')}</span><span
				class="api-action"
				><button
					class="bu-action btn primary"
					data-variant="primary"
					disabled={!plan || !looks.trim() || busyElsewhere}
					onclick={go}
					>{t('setup.setUp')}
					<span class="cost"
						>{t('generationDetails.gens', {
							value: plan ? formatNumber(plan.gens, { maximumFractionDigits: 2 }) : '–'
						})}</span
					></button
				></span
			>{/if}
	{/snippet}
</Sheet>

<style>
	.setup-preview {
		display: grid;
		place-items: center;
		background: var(--bg-hover);
		border-radius: var(--r-ctl);
		padding: 8px;
	}
</style>
