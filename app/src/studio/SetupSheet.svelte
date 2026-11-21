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
	import { SETUP_STEPS } from './setup.ts';
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
	import { setupWarningNote } from './model.ts';
	import { displayError, displayMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import { cameraMessage } from '../lib/store/generation.ts';
	const m = $derived(store.project?.manifest);
	const camera = $derived(
		m?.rig.view && getLocale() !== 'en' ? cameraMessage(m.rig.view) : undefined
	);
	const moveIds = $derived(m?.rig.animations.map((a) => a.id) ?? []);
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
	const step = $derived(SETUP_STEPS.findIndex((s) => s.id === settingUp.progress?.step));
	const preview = $derived(plan?.rest.south ?? (plan && Object.values(plan.rest)[0]) ?? null);
	$effect(() => {
		const p = store.project,
			selected = restAnim,
			id = doc.id;
		let stale = false;
		if (p)
			void setupPlan(p, selected || undefined).then(
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
	cancel={active || (mine && settingUp.error) ? 'common.hide' : 'sheet.later'}
	onclose={() => (ui.sheet = null)}
>
	{#if mine && settingUp.spec}
		<div class="api-action">
			<span class="small muted">{t('setup.rigSetup')}</span><ApiPeek
				scope="character-setup-progress"
				label={t('setup.currentRigSetup')}
				plan={setupPeekPlan(plan, settingUp.spec.looks)}
				activityScope={settingUp.spec.activityScope}
			/>
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
		{#if settingUp.error}<p class="notice bad" role="alert">
				<TriangleAlert size={16} /><span>{displayError(settingUp.error)}</span>
			</p>{/if}
		{#each settingUp.warnings as warning (warning)}<p class="notice warn small">
				<TriangleAlert size={14} /><span>{setupWarningNote(warning, t, displayDirection)}</span>
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
							>{displayMove(a.id, moveIds)}</option
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
				<TriangleAlert size={14} /><span>{setupWarningNote(warning, t, displayDirection)}</span>
			</p>{/each}
		{#if error}<p class="notice warn small" role="alert">
				<TriangleAlert size={16} /><span>{displayNestedMessage(error)}</span>
			</p>{/if}
		{#if busyElsewhere}<p class="notice small">
				{t('setup.busyElsewhere')}
			</p>{/if}
	{/if}
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
					}}>{t('common.cancel')}</button
				>
				<div class="recovery-options">
					<span class="api-action"
						><ApiPeek
							scope="character-setup-resume"
							label={t('setup.resumeRigSetup')}
							plan={setupPeekPlan(plan, settingUp.spec?.looks ?? looks)}
							activityScope={settingUp.spec?.activityScope}
						/><button
							class="bu-action btn primary"
							data-variant="primary"
							onclick={() =>
								settingUp.spec && withKey(() => void startSetup($state.snapshot(settingUp.spec!)))}
							>{t('setup.resume')}</button
						></span
					>
				</div>
			</div>
		{:else if active}<span class="foot-note">{t('setup.keepWorking')}</span><button
				class="bu-action btn"
				data-variant="outline"
				onclick={() => (ui.sheet = null)}>{t('common.hide')}</button
			>
		{:else}<span class="foot-note">{t('setup.pixelsUnchanged')}</span><span class="api-action"
				><ApiPeek
					scope="character-setup"
					label={t('setup.setUpRig')}
					plan={setupPeekPlan(plan, looks)}
				/><button
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
