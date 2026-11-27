<script lang="ts">
	// A character's View and edit window, laid out like an item's: its facings in the chosen move or state (the body alone,
	// any facing opens full size), then Frame & Directions, Cost and About, each tool beside what it changes. Works for the
	// open character and for any other one (loaded by id, the stage unchanged); Open character switches to it.
	import { untrack } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import ObjectWindow from './ObjectWindow.svelte';
	import WindowSection from './WindowSection.svelte';
	import FacingStrip from './FacingStrip.svelte';
	import ToolRow from './ToolRow.svelte';
	import CharacterMenu from './CharacterMenu.svelte';
	import SpritePreview, { type SpriteView } from './SpritePreview.svelte';
	import GenerationDetails from './GenerationDetails.svelte';
	import ApiPeek from './ApiPeek.svelte';
	import ReportButton from './ReportButton.svelte';
	import { ui, doc, store, openProject } from './state.svelte.ts';
	import { openSource } from '../lib/dress/project.ts';
	import { ownItems, ownProvenance, recordedCost } from '../lib/store/generation.ts';
	import { moveDirs } from '../lib/dress/dress.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { itemPreviewFrames, pixelSize } from './model.ts';
	import { displayCost } from './displayCost.ts';
	import { displayMove } from './displayMove.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	import type { Project } from '../lib/store/manifest.ts';
	import { Calculator, Compass, Frame, PersonStanding } from './icons.ts';

	const id = untrack(() => ui.details || doc.id);
	const name = $derived(store.projects.find((p) => p.id === id)?.name ?? t('common.character'));
	let project = $state.raw<Project | null>(null),
		error = $state<Message | string>('');
	// The open character is already loaded; another one loads by id without touching the stage.
	if (id === doc.id && store.project && !doc.loading) project = store.project;
	else
		openSource(id).then(
			(source) => (project = source.project),
			(failure: unknown) => (error = errorMessage(failure))
		);
	const m = $derived(project?.manifest);
	const base = $derived(m?.items.find((item) => item.id === m.rig.baseItem));
	const moveRefs = $derived(m?.rig.animations ?? []);
	const clips = $derived(m ? playbackClips(m.rig.animations) : []);
	let scopeAnim = $state(untrack(() => ui.anim));
	const animId = $derived(
		clips.some((clip) => clip.key === scopeAnim) ? scopeAnim : (clips[0]?.key ?? '')
	);
	const editable = id.startsWith('rig-');
	const open = $state({ frame: false, cost: false, about: false });

	// ---------- preview: the body alone, every facing of the chosen move or state ----------
	const previews = $derived(
		project && base && animId ? itemPreviewFrames(project, base, animId) : []
	);
	const strip = $derived(previews[0] ?? []);
	const made = $derived(m && animId ? moveDirs(m, animId) : []);
	const directions = $derived(m?.rig.directions.filter((d) => made.includes(d.id)) ?? []);
	const k = $derived(
		strip.length
			? Math.max(1, Math.floor(Math.min(60 / strip[0].w, 64 / strip[0].h, 6) * ui.dpr))
			: 1
	);
	const tile = $derived(ui.size === 'landscape' ? 40 : 64);
	let viewer = $state<{ anim: string; view: string } | null>(null);
	const viewerViews = $derived.by((): SpriteView[] => {
		if (!viewer || !project || !base || !m) return [];
		const rows = itemPreviewFrames(project, base, viewer.anim);
		const drawn = moveDirs(m, viewer.anim);
		return m.rig.directions
			.filter((direction) => drawn.includes(direction.id))
			.map((direction) => ({
				id: direction.id,
				label: displayDirection(direction.id),
				frames: rows.map((row) => row[m.rig.directions.indexOf(direction)] ?? null)
			}));
	});

	// ---------- cost: the character's own calls, then with the items made for it ----------
	const items = $derived(m ? ownItems(m) : []);
	const withItems = $derived(m ? displayCost(recordedCost(ownProvenance(m))) : '');
	const extra = $derived(
		items.length
			? [
					{
						label: t('detailsSheet.withItems'),
						value: t('detailsSheet.itemCost', {
							cost: withItems || t('common.notRecorded'),
							count: items.length,
							n: formatNumber(items.length)
						})
					}
				]
			: []
	);
	/** Opens one of the character's tools; its Back returns here. */
	function tool(sheet: 'adjustFrame' | 'directions' | 'cost') {
		if (sheet === 'adjustFrame') ui.frameProject = id;
		else if (sheet === 'directions') ui.directionProject = id;
		else ui.costProject = id;
		ui.returnTo = 'details';
		ui.sheet = sheet;
	}
</script>

<ObjectWindow
	title={name}
	className="character-window"
	kind={t('common.character')}
	menuLabel={t('characterWindow.actions')}
	onclose={() => (ui.sheet = null)}
>
	{#snippet icon()}<PersonStanding size={18} />{/snippet}
	{#snippet scope()}
		{#if clips.length > 1}<label>
				<span class="sr">{t('itemPane.previewMove')}</span>
				<select
					class="bu-input input"
					value={animId}
					onchange={(event) => (scopeAnim = event.currentTarget.value)}
				>
					{#each clips as clip (clip.key)}
						<option value={clip.key}>{displayMove(clip.key, moveRefs)}</option>
					{/each}
				</select>
			</label>{/if}
	{/snippet}
	{#snippet menu(close)}
		<div role="menu" aria-label={t('characterWindow.actions')}>
			<CharacterMenu {id} {close} inWindow />
		</div>
	{/snippet}
	{#snippet footer()}
		{#if id !== doc.id}<button
				class="bu-action btn open-character"
				data-variant="primary"
				onclick={() => {
					ui.sheet = null;
					void openProject(id);
				}}>{t('characterWindow.open')}</button
			>{/if}
	{/snippet}
	{#snippet developer()}
		<ApiPeek copyId={m && !id.startsWith('fixture:') ? id : undefined} />
	{/snippet}

	{#if error}<p class="notice bad small" role="alert">
			{displayMessage(error)}<ReportButton {error} />
		</p>
	{:else if m}
		<div class="character-body">
			<FacingStrip
				label={t('itemPane.availableDirectionsFor', { name })}
				{directions}
				image={(direction) => strip[m.rig.directions.indexOf(direction)]}
				drawn={(direction) => !!strip[m.rig.directions.indexOf(direction)]}
				{name}
				{tile}
				{k}
				empty={t('itemPane.previewUnavailable')}
				onopen={(view) => (viewer = { anim: animId, view })}
			/>
			<div class="window-sections">
				<WindowSection
					label={t('characterWindow.frameSection')}
					state={{
						text: `${pixelSize(m.rig.cell)} · ${t('export.count.directions', { count: m.rig.directions.length })}`,
						tone: 'neutral'
					}}
					bind:open={open.frame}
				>
					<div class="window-body">
						{#if editable}<div class="tool-list">
								<ToolRow
									{...{
										icon: Frame,
										label: t('characterActions.adjustFrame'),
										detail: t('characterWindow.adjustFrameDetail'),
										aside: '',
										opens: true,
										onclick: () => tool('adjustFrame')
									}}
								/>
								<ToolRow
									{...{
										icon: Compass,
										label: t('characterActions.directions'),
										detail: t('characterWindow.directionsDetail'),
										aside: '',
										opens: true,
										onclick: () => tool('directions')
									}}
								/>
							</div>{:else}<p class="muted small">{t('characterWindow.frameLocked')}</p>{/if}
					</div>
				</WindowSection>
				<WindowSection
					label={t('characterWindow.costSection')}
					state={withItems ? { text: withItems, tone: 'neutral' } : undefined}
					bind:open={open.cost}
				>
					<div class="window-body">
						{#if base}<GenerationDetails {m} it={base} {extra} part="cost" />{/if}
						<div class="tool-list">
							<ToolRow
								{...{
									icon: Calculator,
									label: t('characterActions.costEstimate'),
									detail: t('characterWindow.costEstimateDetail'),
									aside: '',
									opens: true,
									onclick: () => tool('cost')
								}}
							/>
						</div>
					</div>
				</WindowSection>
				<WindowSection label={t('itemPane.aboutSection')} bind:open={open.about}>
					<div class="window-body">
						{#if base}<GenerationDetails {m} it={base} part="about" />{:else}<p class="faint small">
								{t('detailsSheet.noGenerationDetailsWereSavedForThis')}
							</p>{/if}
					</div>
				</WindowSection>
			</div>
		</div>
	{:else}<p class="faint small" role="status">{t('common.loading')}</p>{/if}

	{#if viewer && m}
		<SpritePreview
			title={name}
			views={viewerViews}
			view={viewer.view}
			durations={m.rig.animations.find((clip) => clip.id === viewer?.anim)?.frames.map((f) => f.ms)}
			moves={{
				clips,
				moveRefs,
				selected: viewer.anim,
				onselect: (key) => {
					if (viewer) viewer = { ...viewer, anim: key };
				}
			}}
			onclose={() => (viewer = null)}
		/>
	{/if}
</ObjectWindow>

<style>
	.character-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
	}
	.window-sections {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		border-block-start: 1px solid var(--bu-line);
	}
	.tool-list {
		display: grid;
		gap: 8px;
	}
	.open-character {
		min-width: 140px;
		min-height: 44px;
	}
</style>
