<script lang="ts">
	import { assetUrl } from '../lib/assets.ts';
	// Export (M5): one engine at a time; the zip is built when the sheet opens so the button can name its size.
	import Sheet from './Sheet.svelte';
	import { tick, untrack } from 'svelte';
	import { buildExport } from '../lib/export/build.ts';
	import { editableData, fileSlug, saveZip } from './download.svelte.ts';
	import { ROWS as RPG_ROWS, walkMove } from '../lib/export/rpgmaker.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import { stableStringify } from '../lib/image/hash.ts';
	import { coverageGaps, missingFrames, moveDirs } from '../lib/dress/dress.ts';
	import * as db from '../lib/store/db.ts';
	import { listProjects, type StoredProject } from '../lib/store/project.ts';
	import {
		exportAnimationCatalog,
		InvalidExportSettings,
		readExportSettings,
		resetInvalidExportSettings,
		saveExportSetting,
		subscribeExportSettings,
		type ExportSettingChange,
		type ExportSettings
	} from '../lib/store/export-settings.ts';
	import type { DirectionName, Engine } from '../lib/store/manifest.ts';
	import { ui, doc, store, toast, isDemo } from './state.svelte.ts';
	import { moveLabel } from './model.ts';
	import {
		Check,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Download,
		Settings2,
		TriangleAlert,
		X
	} from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import { popoverFocus } from './experience/focus.ts';

	type Target = { id: Engine; name: string; sub: string; detail: string };
	// One RPG Maker card split in two: its body only selects (Standard, or the version already chosen), and its version button
	// selects and opens the version menu. The version is the stored engine id (rpgmaker or rpgmakerxp), so it persists like any
	// format. Selecting never opens the menu by itself, so arrow keys across the cards stay plain radio behavior.
	const RPG_XP = {
		id: 'rpgmakerxp',
		name: 'RPG Maker',
		sub: 'Walking sheets',
		detail:
			'A 4-frame walking sheet per outfit at your character’s own size, for RPG Maker XP and Pokémon Essentials. Copy the PNG files into Graphics/Characters. Needs front, side and back views.'
	} satisfies Target;
	const RPG_VERSIONS = [
		{
			id: 'rpgmaker',
			value: 'Standard',
			title: 'Standard: MZ, MV, VX Ace, VX',
			sub: '3 × 4 layout · $Name.png'
		},
		{
			id: 'rpgmakerxp',
			value: 'XP',
			title: 'XP and Pokémon Essentials',
			sub: '4 × 4 layout · Name.png'
		}
	] as const satisfies readonly { id: Engine; value: string; title: string; sub: string }[];
	const cardOf = (id: Engine): Engine => (id === 'rpgmakerxp' ? 'rpgmaker' : id);
	const rpgVersion = $derived(RPG_VERSIONS.find((v) => v.id === engine) ?? RPG_VERSIONS[0]);
	let versionMenu = $state<HTMLElement>();
	// Product order for this layered 2D workflow; asset formats are useful across engines.
	const GROUPS: { id: string; name: string; targets: Target[] }[] = [
		{
			id: 'engines',
			name: 'Engines and frameworks',
			targets: [
				{
					id: 'godot',
					name: 'Godot',
					sub: 'Scene + runtime',
					detail:
						'Godot 4 scene and animation resources with synchronized equipment and outfit controls.'
				},
				{
					id: 'unity',
					name: 'Unity',
					sub: 'Prefab importer',
					detail:
						'Unity Editor importer creates a layered prefab and animation assets. Requires the 2D Sprite package.'
				},
				{
					id: 'phaser',
					name: 'Phaser',
					sub: 'Atlas + runtime',
					detail:
						'Phaser 3 / 4 atlases and a Container runtime for equipment, colors and synchronized playback.'
				},
				{
					id: 'gdevelop',
					name: 'GDevelop',
					sub: 'Editable project',
					detail:
						'Editable GDevelop project with Sprite layers, synchronized playback and equipment controls. Preview it or copy the objects and event into your game.'
				},
				{
					id: 'rpgmaker',
					name: 'RPG Maker',
					sub: 'Walking sheets',
					detail:
						'A walking sheet per outfit at your character’s own size. Copy the PNG files into img/characters (MZ, MV) or Graphics/Characters (VX Ace, VX). Needs front, side and back views.'
				}
			]
		},
		{
			id: 'assets',
			name: 'Assets',
			targets: [
				{
					id: 'aseprite',
					name: 'Aseprite',
					sub: 'Editable layers',
					detail:
						'One layered .aseprite animation with tags, timing, pivot and your current look. Open in Aseprite 1.3 or later.'
				},
				{
					id: 'generic',
					name: 'PNG + JSON',
					sub: 'Custom integration',
					detail:
						'Layer sheets and strips with timing, pivots, equipment and palette data. Your engine needs code to read these rules.'
				}
			]
		}
	];
	const ENGINES = GROUPS.flatMap((group) => group.targets);
	let preferences = $state.raw<ExportSettings | null>(null);
	let savedProjects = $state.raw<StoredProject[]>([]);
	let formatChoice = $state<Engine | null>(null);
	const engine = $derived(formatChoice ?? preferences?.engine ?? 'godot');
	const selected = $derived(
		engine === 'rpgmakerxp' ? RPG_XP : ENGINES.find((target) => target.id === engine)
	);
	let settings = $state(false);
	let pendingWrites = $state(0);
	const saving = $derived(pendingWrites > 0);
	let writeSequence = 0,
		publishedSequence = 0;
	let refreshAgain = false,
		refreshPreferences = async () => {};
	let refreshing = $state(true);
	let ready = $state(false);
	let saveError = $state('');
	let loadError = $state('');
	let invalidPreferences = $state(false);
	let content = $state<HTMLDivElement>();
	let navigation: HTMLButtonElement;
	let result = $state.raw<{
		zip: Uint8Array | null;
		files: string[];
		warnings: string[];
		errors: string[];
		rigIssues: string[];
	} | null>(null);
	let busy = $state(false);
	const m = $derived(store.project?.manifest);
	const moveIds = $derived(m?.rig.animations.map((a) => a.id) ?? []);
	const nice = (id: string) => moveLabel(id, moveIds);
	const baked = $derived(preferences?.dressedCharacterSheets ?? true);
	const catalog = $derived(
		preferences && ready
			? exportAnimationCatalog(
					m,
					savedProjects.filter((p) => p.id !== doc.id).map((p) => p.manifest),
					preferences
				)
			: { names: [], warnings: [] }
	);
	const names = $derived(catalog.names);
	const once = $derived(preferences?.playOnce ?? []);
	const playbackSummary = $derived(
		!once.length
			? 'None'
			: once.length === names.length
				? 'All'
				: once.map(animationLabel).join(', ')
	);
	const outfits = $derived(m?.presets.filter((p) => p.id !== 'current') ?? []);
	// RPG Maker sheets are always dressed composites, whatever the setting says
	const rpg = $derived(engine === 'rpgmaker' || engine === 'rpgmakerxp');
	const outfitSummary = $derived(
		!baked && !rpg ? 'None' : outfits.length ? 'Current look + saved outfits' : 'Current look'
	);
	const items = $derived(m ? m.items.filter((i) => i.slot !== 'body') : []);
	const reviewItems = $derived(
		m
			? m.items
					.filter((i) => i.designWarnings?.length || (i.qa && i.qa.status !== 'pass'))
					.map((i) => i.name)
			: []
	);
	const PLAY_ONCE = 'Play animation once';
	const DRESSED_SHEETS = 'Include dressed character sheets';
	function animationLabel(id: string): string {
		return moveLabel(id, names);
	}
	$effect(() => {
		const openedId = doc.id;
		let active = true,
			request = 0;
		ready = false;
		async function refresh() {
			if (openedId !== doc.id || document.visibilityState === 'hidden') return;
			if (saving) {
				refreshAgain = true;
				return;
			}
			const current = ++request,
				sequence = writeSequence;
			refreshing = true;
			try {
				const [saved, projects] = await Promise.all([readExportSettings(), listProjects()]);
				if (!active || current !== request) return;
				if (saving) {
					refreshAgain = true;
					return;
				}
				if (sequence !== writeSequence) {
					void refresh();
					return;
				}
				// Current-character errors block its export; unrelated damaged catalogs produce warnings only.
				exportAnimationCatalog(
					store.project?.manifest,
					projects.filter((p) => p.id !== openedId).map((p) => p.manifest),
					saved
				);
				if (stableStringify(preferences) !== stableStringify(saved)) preferences = saved;
				savedProjects = projects;
				ready = true;
				loadError = '';
				invalidPreferences = false;
			} catch (error) {
				if (!active || current !== request) return;
				if (saving) {
					refreshAgain = true;
					return;
				}
				if (sequence !== writeSequence) {
					void refresh();
					return;
				}
				ready = false;
				invalidPreferences = error instanceof InvalidExportSettings;
				loadError = `Could not load export settings: ${error instanceof Error ? error.message : String(error)}`;
			} finally {
				if (active && current === request) refreshing = false;
			}
		}
		refreshPreferences = refresh;
		untrack(() => void refresh());
		window.addEventListener('focus', refresh);
		document.addEventListener('visibilitychange', refresh);
		const unsubscribe = subscribeExportSettings(() => void refresh());
		return () => {
			active = false;
			unsubscribe();
			window.removeEventListener('focus', refresh);
			document.removeEventListener('visibilitychange', refresh);
		};
	});
	async function navigate() {
		settings = !settings;
		await tick();
		content?.closest('.sheet-body')?.scrollTo(0, 0);
		navigation.focus();
	}
	async function changeSetting(input: HTMLInputElement, change: ExportSettingChange) {
		return persistSettings(
			() => saveExportSetting(change),
			input,
			'engine' in change ? change.engine : undefined
		);
	}
	function chooseEngine(id: Engine) {
		if (id !== engine) void persistSettings(() => saveExportSetting({ engine: id }), undefined, id);
	}
	async function resetSettings(event: MouseEvent) {
		const trigger = event.currentTarget,
			hadFocus = document.activeElement === trigger;
		refreshAgain = true;
		await persistSettings(resetInvalidExportSettings);
		await tick();
		if (
			hadFocus &&
			(document.activeElement === document.body ||
				document.activeElement === content?.closest('dialog'))
		)
			navigation.focus({ preventScroll: true });
	}
	async function persistSettings(
		commit: () => Promise<ExportSettings>,
		input?: HTMLInputElement,
		optimisticEngine?: Engine
	) {
		const checked = input?.checked,
			hadFocus = !!input && document.activeElement === input,
			sequence = ++writeSequence;
		pendingWrites++;
		if (optimisticEngine) formatChoice = optimisticEngine;
		saveError = '';
		try {
			const saved = await commit();
			if (sequence > publishedSequence) {
				preferences = saved;
				publishedSequence = sequence;
			}
			if (sequence === writeSequence) saveError = '';
		} catch (e) {
			if (input && input.type !== 'radio') input.checked = !checked;
			if (sequence === writeSequence)
				saveError = `Could not save export settings: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			pendingWrites--;
			if (!saving) {
				formatChoice = null;
				if (refreshAgain) {
					refreshAgain = false;
					void refreshPreferences();
				}
			}
			await tick();
			// Disabling a focused checkbox blurs it. Keep keyboard navigation at that setting without stealing a moved focus.
			if (
				hadFocus &&
				input?.isConnected &&
				(document.activeElement === document.body ||
					document.activeElement === input.closest('dialog'))
			)
				input.focus({ preventScroll: true });
		}
	}
	// B10 (T1 P1-1): views a move or an item doesn't have are empty in the sheets; say so before the download
	// RPG Maker sheets use only the standing view and the walk, and their export warns about walk views itself
	const gaps = $derived.by(() => {
		if (!m) return [];
		const out: string[] = [],
			walk = rpg ? walkMove(m.rig)?.id : undefined;
		const used = (key: string) => {
			const [move, dir] = key.split('/');
			return (
				!rpg || ((move === DEFAULT_MOVE || move === walk) && (RPG_ROWS as string[]).includes(dir))
			);
		};
		if (!rpg)
			for (const a of m.rig.animations) {
				const d = moveDirs(m, a.id);
				if (d.length < m.rig.directions.length)
					out.push(`${nice(a.id)} has ${d.join(' and ')} only`);
			}
		// RPG Maker draws only the outfits it exports (current look and saved outfits), so an item none of them wears is not in a sheet
		const worn = new Set(
			[doc.items, ...outfits.map((x) => x.items)].flatMap((o) => Object.values(o))
		);
		for (const it of rpg ? items.filter((i) => worn.has(i.id)) : items) {
			const view = (x: string) => x.replace('-', ' ').replace('/', ' '),
				whole: string[] = [];
			for (const g of coverageGaps(m, it).filter(used)) {
				const [move, dir] = g.split('/') as [string, DirectionName],
					count = m.rig.animations.find((a) => a.id === move)!.cells,
					missed = missingFrames(m, it, move, dir).length;
				if (missed === count) whole.push(g);
				else out.push(`${it.name} is missing ${missed} of ${count} ${view(g)} frames`);
			}
			if (whole.length) out.push(`${it.name} has no ${whole.map(view).join(', ')} frames`);
		}
		return out;
	});

	$effect(() => {
		const e = engine,
			b = baked,
			p = store.project;
		const projectId = doc.id,
			demo = isDemo(),
			settings = preferences;
		if (!p || !ready || saving) return;
		busy = true;
		result = null;
		const look = { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) };
		let stale = false;
		void (async () => {
			const rec = demo ? undefined : await db.get<StoredProject>('projects', projectId);
			const qa = rec?.rigQa as { clips?: Record<string, { fails?: unknown }> } | undefined;
			const rigIssues = Object.entries(qa?.clips ?? {})
				.filter(([clip, checks]) => {
					const [anim, dir] = clip.split('/');
					return (
						p.manifest.rig.animations.some((a) => a.id === anim) &&
						moveDirs(p.manifest, anim).some((d) => d === dir) &&
						Array.isArray(checks?.fails) &&
						checks.fails.length > 0
					);
				})
				.map(([clip]) => {
					const [anim, dir] = clip.split('/');
					return `${nice(anim)} facing ${dir.replaceAll('-', ' ')}`;
				});
			return {
				...(await buildExport(p, {
					engine: e,
					baked: b,
					look,
					settings: settings!,
					projectData: editableData(rec)
				})),
				rigIssues
			};
		})()
			.then((r) => {
				if (stale) return;
				result = {
					zip: r.zip,
					files: r.entries.map((x) => x.name),
					warnings: r.warnings,
					errors: r.errors,
					rigIssues: r.rigIssues
				};
				busy = false;
			})
			.catch((e: unknown) => {
				console.error('export', e);
				if (stale) return;
				result = {
					zip: null,
					files: [],
					warnings: [],
					errors: [`Could not prepare this export: ${e instanceof Error ? e.message : String(e)}`],
					rigIssues: []
				};
				busy = false;
			});
		return () => {
			stale = true;
		};
	});
	const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
	const kb = $derived(result?.zip ? Math.max(1, Math.round(result.zip.length / 1024)) : 0);
	function download() {
		if (!result?.zip || !m || busy || saving || refreshing || !ready) return;
		const filename = `${fileSlug(store.projects.find((p) => p.id === doc.id)?.name ?? m.name)}-${engine}.pixeldoll.zip`;
		saveZip(result.zip, filename);
		toast(`Downloaded ${filename}`); // T1 P3: confirm, and get out of the way
		ui.sheet = null;
	}
</script>

{#snippet exportFooter()}
	<span class="foot-note">Free · includes an editable copy</span>
	<button
		class="bu-action btn primary lg"
		data-variant="primary"
		onclick={download}
		disabled={busy || saving || refreshing || !ready || !result?.zip}
		><Download size={16} />{busy || refreshing ? 'Preparing…' : `Download ZIP · ${kb} KB`}</button
	>
{/snippet}

<Sheet
	title={settings ? 'Export settings' : 'Export'}
	className="export-sheet"
	onclose={() => (ui.sheet = null)}
	cancelDisabled={saving}
	footer={settings ? undefined : exportFooter}
>
	{#snippet leading()}
		<button
			class="bu-action btn plain link"
			data-variant="quiet"
			bind:this={navigation}
			disabled={saving}
			onclick={navigate}
		>
			{#if settings}<ChevronLeft size={16} aria-hidden="true" />Back{:else}<Settings2
					size={16}
					aria-hidden="true"
				/>Settings{/if}
		</button>
	{/snippet}
	{#snippet trailing()}
		<button
			class="bu-action btn plain link done"
			data-variant="quiet"
			aria-label="Close export"
			disabled={saving}
			onclick={() => (ui.sheet = null)}><X size={18} aria-hidden="true" /></button
		>
	{/snippet}
	{#key settings}
		<div class="export-page" class:settings-page={settings} bind:this={content}>
			{#if loadError || saveError}<p class="notice bad small" role="alert">
					<TriangleAlert size={14} />{saveError || loadError}
				</p>{/if}
			{#if invalidPreferences}
				<p class="muted small">
					Reset only Export preferences to their defaults. Your characters and outfits are kept.
				</p>
				<button class="bu-action btn" onclick={resetSettings} disabled={saving || refreshing}
					>Reset export settings</button
				>
			{/if}
			{#if !ready && refreshing}<p class="muted small" role="status">
					Loading export settings…
				</p>{/if}
			{#each catalog.warnings as warning}<p class="notice warn small">
					<TriangleAlert size={14} />{warning}
				</p>{/each}
			{#if settings}
				<fieldset class="export-playback" aria-describedby="export-playback-description">
					<legend class="label">{PLAY_ONCE}</legend>
					<p class="muted small" id="export-playback-description">
						Selected animation names play once across all character exports.
					</p>
					<div class="export-moves">
						{#each names as name (name)}
							<label
								class="bu-action bu-check export-move"
								data-variant="field"
								aria-disabled={saving}
							>
								<span>{animationLabel(name)}</span><input
									type="checkbox"
									checked={once.includes(name)}
									disabled={saving || !ready}
									onchange={(e) =>
										changeSetting(e.currentTarget, {
											animation: name,
											playOnce: e.currentTarget.checked
										})}
								/>
							</label>
						{/each}
					</div>
				</fieldset>
				<hr class="bu-separator export-divider" />
				<label class="check export-dressed">
					<input
						type="checkbox"
						checked={baked}
						disabled={saving || !ready}
						aria-label={DRESSED_SHEETS}
						aria-describedby="export-dressed-description"
						onchange={(e) =>
							changeSetting(e.currentTarget, { dressedCharacterSheets: e.currentTarget.checked })}
					/>
					<span
						><span>{DRESSED_SHEETS}</span><span class="muted small" id="export-dressed-description"
							>Adds PNG sprite sheets of your current look and each saved outfit, with the body and
							equipped items combined. Separate layers are always included, except in RPG Maker
							sheets, which are always combined.</span
						></span
					>
				</label>
			{:else}
				<fieldset class="export-picker" aria-label="Export format">
					{#each GROUPS as group (group.id)}
						<section aria-labelledby={`export-${group.id}`}>
							<h3 class="label" id={`export-${group.id}`}>{group.name}</h3>
							<div class="export-targets">
								{#each group.targets as e (e.id)}
									{#snippet target()}
										<label class="export-target">
											<span
												class="target-icon"
												aria-hidden="true"
												style:mask-image={`url("${assetUrl(`icons/exports/${e.id}.svg`)}")`}
											></span>
											<span class="target-label"
												><span class="engine-name">{e.name}</span><span class="engine-sub"
													>{e.sub}</span
												></span
											>
											<input
												type="radio"
												name="export-format"
												value={e.id}
												checked={cardOf(engine) === e.id}
												disabled={!ready}
												onchange={(event) => changeSetting(event.currentTarget, { engine: e.id })}
												aria-label={e.name}
												aria-describedby={cardOf(engine) === e.id
													? 'export-description'
													: undefined}
											/>
										</label>
									{/snippet}
									{#if e.id === 'rpgmaker'}
										<div class="export-split">
											<div class="split-card" class:on={rpg}>
												{@render target()}
												<button
													type="button"
													class="version-btn"
													popovertarget="rpg-version-menu"
													aria-haspopup="menu"
													disabled={!ready}
													aria-label={`RPG Maker version: ${rpgVersion.title}`}
													onclick={() => {
														if (!rpg) chooseEngine(rpgVersion.id);
													}}
												>
													<span class="version-value"
														>{#each RPG_VERSIONS as v (v.id)}<span
																aria-hidden="true"
																class:hidden={v.id !== rpgVersion.id}>{v.value}</span
															>{/each}</span
													>
													<ChevronDown size={16} aria-hidden="true" />
												</button>
											</div>
										</div>
									{:else}
										{@render target()}
									{/if}
								{/each}
							</div>
						</section>
					{/each}
				</fieldset>
				<div
					id="rpg-version-menu"
					class="menu version-menu bu-popover-anchor"
					data-placement="bottom-end"
					popover
					role="menu"
					aria-label="RPG Maker version"
					bind:this={versionMenu}
					ontoggle={popoverFocus}
				>
					<PopoverArrow />
					<div class="menu-surface bu-popover-surface bu-floating">
						<p class="menu-sec">Version</p>
						{#each RPG_VERSIONS as v (v.id)}
							<button
								type="button"
								class="row version-row"
								role="menuitemradio"
								aria-checked={engine === v.id}
								onclick={() => {
									chooseEngine(v.id);
									versionMenu?.hidePopover();
								}}
							>
								<span class="version-check" aria-hidden="true"
									>{#if engine === v.id}<Check size={16} />{/if}</span
								>
								<span class="version-text"
									><span class="version-title">{v.title}</span><span class="version-sub"
										>{v.sub}</span
									></span
								>
							</button>
						{/each}
					</div>
				</div>
				{#if selected}<p
						class="export-description muted small"
						id="export-description"
						aria-live="polite"
					>
						<strong>{selected.name}:</strong>
						{selected.detail}
					</p>{/if}
				{#if m}
					{#if rpg}<p class="muted">
							Includes a walking sheet for {m.presets.filter((x) => x.id !== 'current').length
								? `your current look and ${n(m.presets.filter((x) => x.id !== 'current').length, 'saved outfit')}`
								: 'your current look'}.
						</p>{:else}
						<p class="muted">
							Includes {n(m.rig.directions.length, 'direction')} · {n(
								m.rig.animations.length,
								'move'
							)} · {n(items.length, 'item')} · {m.presets.filter((x) => x.id !== 'current').length
								? `${n(m.presets.filter((x) => x.id !== 'current').length, 'outfit')} + your current look`
								: 'your current look'}, each item on its own layer sheet.
						</p>{/if}
					{#if reviewItems.length}<p class="notice warn small">
							<TriangleAlert size={14} /><span
								>Saved quality or appearance flags: {reviewItems.join(', ')}. Review the flagged
								moves and directions before using these sprites. Export remains available, including
								explicitly accepted artwork.</span
							>
						</p>{/if}
					{#if result?.rigIssues.length}<p class="notice warn small">
							<TriangleAlert size={14} /><span
								>Body frames failed saved checks: {result.rigIssues.join(', ')}. Inspect these moves
								before using the exported sprites.</span
							>
						</p>{/if}
					{#if gaps.length}<p class="notice small">
							<TriangleAlert size={14} /><span
								>{gaps.join(' · ')}. Those frames stay empty in the sheets{rpg
									? ''
									: '; manifest.json lists the directions of each move'}.</span
							>
						</p>{/if}
				{/if}
				{#if result?.errors.length}
					{#each result.errors as e (e)}<p class="notice bad small">
							<TriangleAlert size={14} />{e}
						</p>{/each}
				{/if}
				{#each result?.warnings ?? [] as w (w)}<p class="notice warn small">
						<TriangleAlert size={14} />{w}
					</p>{/each}
				<hr class="bu-separator export-divider" />
				<section aria-labelledby="export-settings-summary">
					<h3 class="label" id="export-settings-summary">Current settings</h3>
					<dl class="export-summary small">
						{#if !rpg}<dt>{PLAY_ONCE}</dt>
							<dd>{ready ? playbackSummary : refreshing ? 'Loading…' : 'Unavailable'}</dd>{/if}
						<dt>{DRESSED_SHEETS}</dt>
						<dd>{ready ? outfitSummary : refreshing ? 'Loading…' : 'Unavailable'}</dd>
					</dl>
				</section>
				<details class="disclosure">
					<summary><ChevronRight size={14} />Files included</summary>
					<div>
						{#if result}<p class="faint small">{result.files.length} files:</p>
							<pre
								class="mono faint"
								style="max-height:160px;overflow:auto;margin:0">{result.files.join('\n')}</pre>{/if}
					</div>
				</details>
			{/if}
		</div>
	{/key}
</Sheet>

<style>
	:global(dialog.export-sheet) {
		height: min(680px, calc(100dvh - 32px));
	}
	.export-page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
		animation: export-back 150ms ease-out;
	}
	.settings-page {
		animation-name: export-forward;
	}
	@keyframes export-forward {
		from {
			transform: translateX(12px);
		}
		to {
			transform: translateX(0);
		}
	}
	@keyframes export-back {
		from {
			transform: translateX(-12px);
		}
		to {
			transform: translateX(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.export-page {
			animation: none;
		}
	}
	.export-playback {
		min-width: 0;
		border: 0;
		padding: 0;
		margin: 0;
	}
	.export-playback legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.export-playback p {
		margin: 0 0 12px;
	}
	.export-moves {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.export-move {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
		min-height: 44px;
		padding: 10px 12px;
	}
	.export-move span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.export-move input {
		flex: none;
	}
	.export-dressed {
		align-items: flex-start;
		gap: 10px;
	}
	.export-dressed input {
		flex: none;
		margin-top: 3px;
	}
	.export-dressed > span {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.export-divider {
		width: 100%;
		margin: 0;
	}
	.export-summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 8px 16px;
		margin: 8px 0 0;
	}
	.export-summary dt {
		color: var(--text-2);
	}
	.export-summary dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.export-picker {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.export-picker h3 {
		margin: 0 0 8px;
	}
	/* RPG Maker: the card body selects; the version button beside it (below it on narrow cards) selects and opens the menu. */
	.export-split {
		container-type: inline-size;
		min-width: 0;
	}
	.split-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		height: 100%;
		box-sizing: border-box;
		border: 1px solid var(--line-strong);
		border-radius: var(--r-card);
		background: var(--bg);
	}
	.split-card.on {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		background: var(--accent-soft);
	}
	.split-card .export-target,
	.split-card .export-target:has(input:checked) {
		position: relative;
		grid-template-columns: 28px minmax(0, 1fr);
		border: 0;
		box-shadow: none;
		background: transparent;
	}
	/* the radio stays the real control: invisible, covering the card body, so any tap on the body checks it */
	.split-card .export-target input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.version-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		min-width: 44px;
		padding: 0 10px 0 12px;
		border: 0;
		border-left: 1px solid var(--line-strong);
		border-radius: 0 var(--r-card) var(--r-card) 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		font-weight: 600;
		cursor: pointer;
	}
	.split-card.on .version-btn {
		border-color: color-mix(in srgb, var(--accent), transparent 45%);
	}
	.version-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--text), transparent 94%);
	}
	/* one focus ring around the whole card, as on the other cards, whichever half has focus; keyboard focus on the version
     half also tints it, so Tab shows whether Space selects the card or opens the menu */
	.split-card:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.split-card .export-target:focus-within {
		outline: none;
	}
	.version-btn:focus-visible {
		outline: none;
		background: color-mix(in srgb, var(--accent), transparent 80%);
	}
	.version-btn:disabled {
		cursor: default;
		opacity: 0.6;
	}
	/* every value shares one cell, so the button keeps the longest value's width and never shifts */
	.version-value {
		display: grid;
	}
	.version-value > span {
		grid-area: 1 / 1;
	}
	.version-value > .hidden {
		visibility: hidden;
	}
	@container (max-width: 220px) {
		.split-card {
			grid-template-columns: minmax(0, 1fr);
		}
		.version-btn {
			min-height: 44px;
			border-left: 0;
			border-top: 1px solid var(--line-strong);
			border-radius: 0 0 var(--r-card) var(--r-card);
		}
	}
	.version-menu {
		width: min(300px, calc(100vw - 16px));
	}
	.version-row {
		display: grid;
		grid-template-columns: 16px minmax(0, 1fr);
		align-items: center;
		width: 100%;
		text-align: left;
	}
	.version-check {
		display: inline-flex;
		color: var(--accent);
	}
	.version-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.version-title {
		font-weight: 600;
	}
	.version-sub {
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.export-targets {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.export-target {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) 16px;
		align-items: center;
		gap: 10px;
		padding: 12px;
		min-height: 68px;
		border: 1px solid var(--line-strong);
		border-radius: var(--r-card);
		background: var(--bg);
		cursor: pointer;
	}
	.export-target:has(input:checked) {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		background: var(--accent-soft);
	}
	.export-target:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.export-target input {
		margin: 0;
		width: 16px;
		height: 16px;
		accent-color: var(--accent);
	}
	.target-icon {
		display: block;
		width: 28px;
		height: 28px;
		background: currentColor;
		mask-size: contain;
		mask-position: center;
		mask-repeat: no-repeat;
		color: var(--text-2);
	}
	.target-label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.engine-name {
		font-weight: 600;
	}
	.engine-sub {
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.engine-name,
	.engine-sub {
		overflow-wrap: anywhere;
	}
	.export-description {
		margin: 0;
		min-height: 3em;
	}
	@media (max-width: 420px) {
		.export-target {
			grid-template-columns: 24px minmax(0, 1fr) 16px;
			gap: 8px;
			padding: 10px;
		}
		.target-icon {
			width: 24px;
			height: 24px;
		}
	}
	@media (max-width: 359px) {
		.export-targets,
		.export-moves {
			grid-template-columns: 1fr;
		}
	}
</style>
