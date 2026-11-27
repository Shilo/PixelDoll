<script lang="ts" module>
	type Tool = 'adjustFrame' | 'directions' | 'cost';
	/** Where the window was when one of its tools (or a menu action such as Rename) opened, so coming back returns to the
	 *  same place: the move, every open section and disclosure, and the control that opened it. */
	let resume: {
		id: string;
		anim: string;
		open: Record<'frame' | 'cost' | 'about', boolean>;
		disclosures: boolean[];
		from: Tool | 'menu';
	} | null = null;
</script>

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
	import { fixtureManifest, openSource } from '../lib/dress/project.ts';
	import { ownItems, ownProvenance, recordedCost } from '../lib/store/generation.ts';
	import { moveDirs } from '../lib/dress/dress.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { itemPreviewFrames, pixelSize } from './model.ts';
	import { displayCost } from './displayCost.ts';
	import { displayMove } from './displayMove.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import { LocalizedError, type Message } from '../lib/message.ts';
	import type { Manifest, Project } from '../lib/store/manifest.ts';
	import type { StoredProject } from '../lib/store/project.ts';
	import * as db from '../lib/store/db.ts';
	import { Calculator, Compass, Frame, PersonStanding } from './icons.ts';
	import type { Img } from '../lib/image/png.ts';

	const id = untrack(() => ui.details || doc.id);
	const name = $derived(store.projects.find((p) => p.id === id)?.name ?? t('common.character'));
	// The open character is the live one (it updates as work lands); another loads by id without touching the stage: its
	// saved manifest first, so the sections never wait on (or fail with) its artwork, then the artwork for the preview.
	const live = $derived(id === doc.id && !doc.loading ? store.project : null);
	let saved = $state.raw<Manifest | null>(null),
		loaded = $state.raw<Project | null>(null),
		error = $state<Message | string>(''),
		previewError = $state<Message | string>('');
	$effect(() => {
		if (id === doc.id) return;
		const controller = new AbortController();
		manifestOf(id).then(
			(manifest) => (saved = manifest),
			(failure: unknown) => (error = errorMessage(failure))
		);
		openSource(id, controller.signal).then(
			(source) => (loaded = source.project),
			(failure: unknown) => {
				if (!controller.signal.aborted) previewError = errorMessage(failure);
			}
		);
		return () => controller.abort();
	});
	async function manifestOf(target: string): Promise<Manifest> {
		if (target.startsWith('fixture:')) return fixtureManifest(target);
		const rec = await db.get<StoredProject>('projects', target);
		if (!rec)
			throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
		return rec.manifest;
	}
	const project = $derived(live ?? loaded);
	const m = $derived(live?.manifest ?? saved ?? loaded?.manifest);
	const base = $derived(m?.items.find((item) => item.id === m.rig.baseItem));
	const moveRefs = $derived(m?.rig.animations ?? []);
	const clips = $derived(m ? playbackClips(m.rig.animations) : []);
	const resumed = untrack(() => (ui.returnTo === 'details' && resume?.id === id ? resume : null));
	resume = null;
	let scopeAnim = $state(resumed?.anim ?? untrack(() => ui.anim));
	const animId = $derived(
		clips.some((clip) => clip.key === scopeAnim) ? scopeAnim : (clips[0]?.key ?? '')
	);
	const editable = id.startsWith('rig-');
	const open = $state(resumed?.open ?? { frame: false, cost: false, about: false });
	let body = $state<HTMLElement>();
	// Coming back reopens the disclosures inside the sections and puts the keyboard on the control that left.
	$effect(() => {
		if (!resumed || !body) return;
		body.querySelectorAll('details').forEach((element, index) => {
			if (resumed.disclosures[index]) element.open = true;
		});
		(resumed.from === 'menu'
			? body.closest('dialog')?.querySelector<HTMLElement>('.sheet-head [aria-haspopup="menu"]')
			: body.querySelector<HTMLElement>(`[data-tool="${resumed.from}"] button`)
		)?.focus();
	});
	/** Remembers this window's place before something opens over it whose Back or Cancel returns here. */
	function remember(from: Tool | 'menu') {
		resume = {
			id,
			anim: animId,
			open: { ...open },
			disclosures: [...(body?.querySelectorAll('details') ?? [])].map((element) => element.open),
			from
		};
		ui.returnTo = 'details';
	}

	// ---------- preview: the body alone, every facing of the chosen move or state ----------
	const previews = $derived(
		project && base && animId ? itemPreviewFrames(project, base, animId) : []
	);
	const strip = $derived(previews[0] ?? []);
	/** A facing counts as drawn only when its first frame has a visible pixel: a blank cell says it is missing. */
	const visible = (img: Img | undefined) =>
		!!img?.data.some((value, index) => index % 4 === 3 && value > 0);
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
	function tool(sheet: Tool) {
		remember(sheet);
		if (sheet === 'adjustFrame') ui.frameProject = id;
		else if (sheet === 'directions') ui.directionProject = id;
		else ui.costProject = id;
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
			<CharacterMenu {id} {close} inWindow leave={() => remember('menu')} />
		</div>
	{/snippet}
	{#snippet footer()}
		{#if id !== doc.id}<button
				class="bu-action btn open-character"
				data-trail="characterWindow.open"
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
		<div class="character-body" bind:this={body}>
			{#if previewError}<p class="notice bad small" role="alert">
					{displayMessage(previewError)}<ReportButton error={previewError} />
				</p>{/if}
			{#if project}<FacingStrip
					label={t('itemPane.availableDirectionsFor', { name })}
					{directions}
					image={(direction) => strip[m.rig.directions.indexOf(direction)]}
					drawn={(direction) => visible(strip[m.rig.directions.indexOf(direction)])}
					{name}
					{tile}
					{k}
					empty={t('itemPane.previewUnavailable')}
					onopen={(view) => (viewer = { anim: animId, view })}
				/>{:else if !previewError}<p class="faint small" role="status">
					{t('common.loading')}
				</p>{/if}
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
								<div class="tool-slot" data-tool="adjustFrame">
									<ToolRow
										{...{
											icon: Frame,
											label: t('characterActions.adjustFrame'),
											detail: t('characterWindow.adjustFrameDetail'),
											aside: '',
											opens: true,
											trail: 'characterWindow.adjustFrame',
											onclick: () => tool('adjustFrame')
										}}
									/>
								</div>
								<div class="tool-slot" data-tool="directions">
									<ToolRow
										{...{
											icon: Compass,
											label: t('characterActions.directions'),
											detail: t('characterWindow.directionsDetail'),
											aside: '',
											opens: true,
											trail: 'characterWindow.directions',
											onclick: () => tool('directions')
										}}
									/>
								</div>
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
							<div class="tool-slot" data-tool="cost">
								<ToolRow
									{...{
										icon: Calculator,
										label: t('characterActions.costEstimate'),
										detail: t('characterWindow.costEstimateDetail'),
										aside: '',
										opens: true,
										trail: 'characterWindow.costEstimate',
										onclick: () => tool('cost')
									}}
								/>
							</div>
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
	/* Marks a tool's row for focus on return, without a box of its own. */
	.tool-slot {
		display: contents;
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
