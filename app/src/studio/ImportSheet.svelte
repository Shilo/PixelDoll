<script lang="ts">
	import { onDestroy } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import ApiPreview from './ApiPreview.svelte';
	import { libraryPlan, characterZipPlan } from './apiPlans.ts';
	import Sprite from './Sprite.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { composeCell } from '../lib/compose/compose.ts';
	import {
		characterId,
		downloadCharacter,
		listCharacters,
		type LibraryCharacter
	} from '../lib/pixellab/library.ts';
	import {
		CharacterImportError,
		readCharacterZip,
		saveImportedCharacter,
		type CharacterImportState,
		type ImportedCharacter
	} from '../lib/store/import.ts';
	import { MAX_ZIP_BYTES } from '../lib/store/zip.ts';
	import { rigReady } from '../lib/rig/setup.ts';
	import {
		ui,
		dismissWelcome,
		refreshProjects,
		openProject,
		toast,
		withKey
	} from './state.svelte.ts';
	import { customize } from './experience/state.svelte.ts';
	import {
		ChevronLeft,
		ChevronRight,
		Download,
		FileArchive,
		KeyRound,
		TriangleAlert
	} from './icons.ts';

	let { source }: { source: 'device' | 'pixellab' } = $props();
	let prepared = $state.raw<ImportedCharacter | null>(null);
	let previewValid = $state(false),
		nameInitialized = false;
	let setupNext = $state(true);
	const needsSetup = $derived(
		!!prepared && !rigReady({ manifest: prepared.project.manifest, ...prepared.extra })
	);
	let states = $state.raw<CharacterImportState[]>([]),
		stateId = $state(''),
		moveStates = $state.raw<string[]>([]);
	let bytes: Uint8Array | null = null;
	let name = $state(''),
		id = $state(''),
		error = $state(''),
		busy = $state(false),
		saving = $state(false),
		loading = $state(false);
	let characters = $state.raw<LibraryCharacter[]>([]),
		total = $state(0),
		offset = $state(0),
		listed = $state(false),
		previewRevision = $state(0),
		libraryError = $state('');
	let alive = true;
	let fileInput = $state<HTMLInputElement>();
	let dragging = $state(false),
		dragDepth = 0;
	const reads = new AbortController();
	const peekScope = crypto.randomUUID();
	const listScope = (page: number) => `${peekScope}:library:${page}`;
	function zipScope(value: string) {
		try {
			return `${peekScope}:zip:${characterId(value)}`;
		} catch {
			return `${peekScope}:zip:invalid`;
		}
	}
	onDestroy(() => {
		alive = false;
		reads.abort();
	});
	const preview = $derived.by(() => {
		const p = prepared?.project;
		if (!p) return null;
		const m = p.manifest,
			dir = m.rig.directions.find((d) => d.id === 'south')?.id ?? m.rig.directions[0].id;
		return composeCell(
			p,
			m.presets[0]?.items ?? { body: m.rig.baseItem },
			m.rig.animations[0].id,
			dir,
			0
		);
	});
	$effect(() => {
		if (source === 'pixellab' && app.key && !listed) {
			listed = true;
			void load(0);
		}
	});
	function reset() {
		prepared = null;
		previewValid = false;
		nameInitialized = false;
		bytes = null;
		error = '';
		name = '';
		states = [];
		stateId = '';
		moveStates = [];
		dragging = false;
		dragDepth = 0;
	}
	function close() {
		if (!saving) {
			reads.abort();
			ui.sheet = null;
		}
	}
	async function load(next: number) {
		loading = true;
		libraryError = '';
		try {
			const page = await listCharacters(app.key, next, reads.signal, {
				activityScope: listScope(next)
			});
			if (!alive) return;
			characters = page.characters;
			total = page.total;
			offset = next;
			previewRevision++;
		} catch (e) {
			if (alive) libraryError = (e as Error).message;
		} finally {
			if (alive) loading = false;
		}
	}
	function choices(
		available: CharacterImportState[],
		selected: string | undefined,
		selection: readonly string[] | 'all' | undefined
	) {
		states = available;
		stateId = selected ?? available[0]?.id ?? '';
		moveStates = [
			...new Set(
				selection === 'all'
					? available.filter((s) => s.animations !== 0).map((s) => s.id)
					: (selection ?? (stateId ? [stateId] : []))
			)
		];
	}
	function stateLabel(state: CharacterImportState) {
		const label = state.name || 'Untitled state';
		return states.filter((s) => (s.name || 'Untitled state') === label).length > 1
			? `${label} (${states.indexOf(state) + 1})`
			: label;
	}
	async function prepare(
		data: Uint8Array,
		selected?: string,
		selection?: readonly string[] | 'all'
	) {
		bytes = data;
		previewValid = false;
		try {
			const result = await readCharacterZip(data, selected, selection);
			if (!alive) return;
			choices(result.states ?? [], result.stateId, selection);
			prepared = result;
			previewValid = true;
			if (!nameInitialized) {
				name = result.project.manifest.name.slice(0, 60);
				nameInitialized = true;
			}
		} catch (e) {
			if (alive && e instanceof CharacterImportError)
				choices(e.states, e.stateId ?? selected, selection);
			throw e;
		}
	}
	async function importFiles(files: readonly File[]) {
		if (busy || !files.length) return;
		reset();
		busy = true;
		try {
			if (files.length !== 1) throw new Error('Choose one character ZIP at a time.');
			const file = files[0];
			if (!/\.zip$/i.test(file.name))
				throw new Error('Choose a ZIP file exported from PixelLab or PixelDoll.');
			if (file.size > MAX_ZIP_BYTES) throw new Error('Choose a ZIP smaller than 64 MB.');
			const data = new Uint8Array(await file.arrayBuffer());
			if (alive) await prepare(data, undefined, 'all');
		} catch (e) {
			if (alive) error = (e as Error).message;
		} finally {
			if (alive) busy = false;
		}
	}
	function fileChanged(e: Event) {
		const input = e.currentTarget as HTMLInputElement,
			files = Array.from(input.files ?? []);
		input.value = ''; // Choosing the same file after an error or reset must fire change again.
		void importFiles(files);
	}
	function hasFiles(e: DragEvent) {
		return e.dataTransfer?.types.includes('Files') ?? false;
	}
	function preventFileNavigation(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
	}
	function dragEntered(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		e.stopPropagation();
		dragDepth++;
		dragging = !busy;
	}
	function dragLeft(e: DragEvent) {
		if (!hasFiles(e)) return;
		dragDepth = Math.max(0, dragDepth - 1);
		dragging = dragDepth > 0 && !busy;
	}
	function dragOver(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = busy ? 'none' : 'copy';
	}
	function dropped(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		e.stopPropagation();
		dragging = false;
		dragDepth = 0;
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (!busy && !files.length) error = 'Choose a ZIP file, not a folder.';
		else void importFiles(files);
	}
	async function fromPixelLab(value: string) {
		if (busy) return;
		reset();
		busy = true;
		try {
			const selected = characterId(value);
			await prepare(
				await downloadCharacter(selected, reads.signal, { activityScope: zipScope(selected) }),
				selected
			);
		} catch (e) {
			if (alive) error = (e as Error).message;
		} finally {
			if (alive) busy = false;
		}
	}
	async function changeState(value: string) {
		if (!bytes || busy) return;
		const data = bytes;
		const selected = moveStates.filter((id) =>
			states.some((s) => s.id === id && s.animations !== 0)
		);
		stateId = value;
		error = '';
		busy = true;
		try {
			await prepare(data, value, selected);
		} catch (e) {
			if (alive) error = (e as Error).message;
		} finally {
			if (alive) busy = false;
		}
	}
	async function changeMoves(id: string, include: boolean) {
		if (!bytes || busy) return;
		const data = bytes;
		moveStates = include ? [...moveStates, id] : moveStates.filter((value) => value !== id);
		error = '';
		busy = true;
		try {
			await prepare(data, stateId, moveStates);
		} catch (e) {
			if (alive) error = (e as Error).message;
		} finally {
			if (alive) busy = false;
		}
	}
	async function save() {
		if (!prepared || !previewValid || busy) return;
		busy = true;
		saving = true;
		error = '';
		try {
			const projectId = await saveImportedCharacter(prepared, name);
			await refreshProjects();
			if (!alive) return;
			await openProject(projectId);
			if (!alive) return;
			dismissWelcome();
			customize();
			ui.sheet = setupNext && needsSetup ? 'setup' : null;
			toast(`Imported ${name.trim()}`);
		} catch (e) {
			if (alive) error = (e as Error).message;
		} finally {
			if (alive) {
				busy = false;
				saving = false;
			}
		}
	}
</script>

<svelte:window ondragover={preventFileNavigation} ondrop={preventFileNavigation} />

<Sheet
	title={source === 'device' ? 'Import from device' : 'Import from PixelLab'}
	onclose={close}
	cancelDisabled={saving}
	className={prepared
		? 'import-sheet import-review'
		: source === 'pixellab' && app.key && !app.keyRejected
			? 'import-sheet import-browse'
			: 'import-sheet'}
>
	{#if source === 'pixellab'}<div class="api-action">
			<ApiPeek
				scope="library-open"
				label="Browse PixelLab characters"
				plan={libraryPlan()}
				activityScope={listScope(0)}
			/>
		</div>{/if}
	{#if states.length > 1}
		<div class="field">
			<label class="label" for="import-standing-state">Standing pose state</label>
			<select
				class="bu-input input"
				id="import-standing-state"
				aria-describedby="import-standing-help"
				value={stateId}
				disabled={busy}
				onchange={(e) => changeState(e.currentTarget.value)}
				>{#each states as state (state.id)}<option value={state.id}>{stateLabel(state)}</option
					>{/each}</select
			>
			<p class="faint small" id="import-standing-help">
				Uses this state’s static directional views.
			</p>
		</div>
	{/if}
	{#if states.some((state) => state.animations !== 0)}
		<section class="state-moves" role="group" aria-labelledby="import-moves-title">
			<h3 class="label" id="import-moves-title">Moves to import</h3>
			<p class="faint small">
				Moves keep the appearance of their source state. Uncheck any versions you do not want.
			</p>
			{#each states.filter((state) => state.animations !== 0) as state (state.id)}
				<label class="check"
					><input
						type="checkbox"
						checked={moveStates.includes(state.id)}
						disabled={busy}
						onchange={(e) => changeMoves(state.id, e.currentTarget.checked)}
					/><span
						>{stateLabel(state)} · {state.animations === null
							? 'unreadable moves'
							: `${state.animations} ${state.animations === 1 ? 'move' : 'moves'}`}</span
					></label
				>
			{/each}
		</section>
	{/if}
	{#if !prepared}
		{#if source === 'device'}
			<section
				class="bu-dialog-surface import-drop"
				aria-label="Character ZIP drop area"
				aria-busy={busy}
				ondragenter={dragEntered}
				ondragleave={dragLeft}
				ondragover={dragOver}
				ondrop={dropped}
			>
				<FileArchive size={32} />
				<strong aria-live="polite"
					>{busy
						? 'Reading your ZIP…'
						: dragging
							? 'Release ZIP to preview'
							: 'Drop a character ZIP here'}</strong
				>
				<span class="muted small">PixelLab character or PixelDoll export · up to 64 MB</span>
				<button
					class="bu-action btn"
					data-variant="outline"
					disabled={busy}
					onclick={() => fileInput?.click()}>Choose ZIP</button
				>
				<input
					hidden
					type="file"
					accept=".zip,application/zip"
					aria-label="Character ZIP"
					bind:this={fileInput}
					disabled={busy}
					onchange={fileChanged}
				/>
			</section>
			<p class="muted small">
				Your files stay on this device. Preview your character before importing.
			</p>
			<p class="faint small">
				In PixelLab’s character creator, export a ZIP with individual frames. Enclosing folders are
				supported. Other spritesheet layouts and PNG-only ZIPs are not supported.
			</p>
		{:else}
			{#if !app.key || app.keyRejected}
				{#if libraryError}<p class="notice bad small" role="alert">
						<TriangleAlert size={16} /><span>{libraryError}</span>
					</p>{/if}
				<button
					class="bu-action btn"
					data-variant="outline"
					disabled={busy}
					onclick={() =>
						withKey(() => {
							ui.sheet = 'importPixelLab';
						}, false)}><KeyRound size={16} />Connect PixelLab to browse your characters</button
				>
			{:else}
				<div class="library-head">
					<span class="label">Your PixelLab characters</span><span class="api-action"
						><ApiPeek
							scope="library-refresh"
							label="Refresh character library"
							plan={libraryPlan(offset)}
							activityScope={listScope(offset)}
						/><button
							class="bu-action btn plain small"
							data-variant="quiet"
							disabled={busy || loading}
							onclick={() => load(offset)}>Refresh</button
						></span
					>
				</div>
				<div class="character-library" aria-label="PixelLab characters" aria-busy={loading}>
					{#if libraryError}<p class="notice bad small" role="alert">
							<TriangleAlert size={16} /><span>{libraryError}</span>
						</p>{/if}
					{#if loading}<p class="muted" role="status">Loading characters…</p>
					{:else if !characters.length && !libraryError}<p class="faint">
							No characters found on this PixelLab account.
						</p>{/if}
					{#each characters as ch (ch.id)}
						<div class="api-action library-entry">
							<ApiPeek
								scope={`library-character-${ch.id}`}
								label={`Preview ${ch.name || 'character'}`}
								plan={characterZipPlan(ch.id)}
								activityScope={zipScope(ch.id)}
							/><button
								class="library-character"
								disabled={busy || loading}
								onclick={() => fromPixelLab(ch.id)}
							>
								{#if ch.preview_url}{#key `${previewRevision}:${ch.preview_url}`}<ApiPreview
											src={ch.preview_url}
											activityScope={listScope(offset)}
										/>{/key}{/if}
								<span
									><b>{ch.name || 'Untitled character'}</b><span class="faint small"
										>{ch.directions}
										{ch.directions === 1 ? 'direction' : 'directions'} · {ch.animation_count}
										{ch.animation_count === 1 ? 'move' : 'moves'}</span
									></span
								>
							</button>
						</div>
					{/each}
				</div>
				<div class="library-head">
					<span class="api-action"
						><ApiPeek
							scope="library-previous"
							label="Previous character page"
							plan={libraryPlan(Math.max(0, offset - 20))}
							activityScope={listScope(Math.max(0, offset - 20))}
						/><button
							class="bu-action btn icon page-button"
							data-variant="outline"
							aria-label="Previous page"
							disabled={busy || loading || offset === 0}
							onclick={() => load(Math.max(0, offset - 20))}><ChevronLeft size={18} /></button
						></span
					><span class="faint small"
						>{characters.length
							? `${offset + 1}–${Math.min(offset + characters.length, total)} of ${total}`
							: loading
								? 'Loading…'
								: libraryError
									? 'Unavailable'
									: '0 of 0'}</span
					><span class="api-action"
						><ApiPeek
							scope="library-next"
							label="Next character page"
							plan={libraryPlan(offset + 20)}
							activityScope={listScope(offset + 20)}
						/><button
							class="bu-action btn icon page-button"
							data-variant="outline"
							aria-label="Next page"
							disabled={busy || loading || offset + characters.length >= total}
							onclick={() => load(offset + 20)}><ChevronRight size={18} /></button
						></span
					>
				</div>
			{/if}
			<form
				class="form direct-import"
				onsubmit={(e) => {
					e.preventDefault();
					void fromPixelLab(id);
				}}
			>
				<label class="label" for="import-character-id">Direct import (connection optional)</label>
				<div class="direct-import-row">
					<input
						class="bu-input input"
						id="import-character-id"
						type="text"
						bind:value={id}
						placeholder="Paste a character ID or creator link"
						disabled={busy}
					/>
					<span class="api-action"
						><ApiPeek
							scope="library-preview"
							label="Preview character ZIP"
							plan={characterZipPlan(id)}
							activityScope={zipScope(id)}
						/><button
							class="bu-action btn"
							data-variant="outline"
							type="submit"
							aria-label="Preview character"
							disabled={busy || !id.trim()}>Preview</button
						></span
					>
				</div>
			</form>
		{/if}
	{:else}
		<div class="import-preview" aria-busy={busy && !saving}>
			{#if preview}<Sprite
					img={preview}
					k={Math.max(1, Math.min(3, Math.floor((256 * ui.dpr) / Math.max(preview.w, preview.h))))}
					label="Character import preview"
				/>{/if}
			{#if !previewValid && !busy}<p class="muted small">
					Showing the last preview. Update your selections to continue.
				</p>
			{:else}<p class="muted">
					{prepared.project.manifest.rig.directions.length} directions · {prepared.project.manifest
						.rig.animations.length}
					{prepared.project.manifest.rig.animations.length === 1 ? 'move' : 'moves'} · {prepared.project.manifest.items.filter(
						(i) => i.slot !== 'body'
					).length} separate {prepared.project.manifest.items.filter((i) => i.slot !== 'body')
						.length === 1
						? 'item'
						: 'items'}
				</p>{/if}
		</div>
		{#if busy && !saving}<p class="muted" role="status">Updating preview…</p>{/if}
		<label class="field"
			><span class="label">Character name</span><input
				class="bu-input input"
				type="text"
				bind:value={name}
				maxlength="60"
				disabled={busy}
			/></label
		>
		{#each prepared.warnings as warning (warning)}<p class="notice warn small">
				<TriangleAlert size={16} /><span>{warning}</span>
			</p>{/each}
		{#if needsSetup}<label class="check"
				><input type="checkbox" bind:checked={setupNext} disabled={busy} />Set up the pose rig next
				(recommended)</label
			>
			<p class="faint small">
				Import is free. Rig setup shows its PixelLab generation cost before you start.
			</p>{/if}
		<button class="bu-action btn plain" data-variant="quiet" disabled={busy} onclick={reset}
			>Choose another character</button
		>
	{/if}
	{#if busy && (!prepared || saving)}<p class="muted" role="status">
			{saving ? 'Saving your local copy…' : 'Preparing your character…'}
		</p>{/if}
	{#if error}<p class="notice bad small" role="alert">
			<TriangleAlert size={16} /><span>{error}</span>
		</p>{/if}
	{#snippet footer()}
		<span class="foot-note import-note">Free · saves a new local copy</span>
		<button
			class="bu-action btn primary"
			data-variant="primary"
			disabled={!prepared || !previewValid || busy || !name.trim()}
			onclick={save}><Download size={16} />{busy ? 'Working…' : 'Import character'}</button
		>
	{/snippet}
</Sheet>

<style>
	:global(dialog.sheet:is(.import-browse, .import-review).center) {
		height: calc(100dvh - 48px);
	}
	:global(dialog.sheet:is(.import-browse, .import-review).bottom) {
		height: calc(100dvh - 32px);
	}
	:global(.import-browse > .sheet-body) {
		min-height: 0;
	}
	:global(.import-browse > .sheet-body > *) {
		flex-shrink: 0;
	}
	:global(.import-sheet > .sheet-foot) {
		justify-content: space-between;
	}
	:global(.import-sheet.side > .sheet-foot) {
		justify-content: flex-end;
	}
	:global(.import-sheet.bottom .import-note),
	:global(.import-sheet.side .import-note) {
		display: none;
	}
	.library-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.library-entry {
		display: flex;
	}
	.library-entry > .library-character {
		flex: 1;
	}
	.character-library {
		display: grid;
		align-content: start;
		gap: 6px;
		flex: 1 1 160px;
		min-height: 160px;
		overflow-y: auto;
	}
	.page-button {
		min-width: 44px;
		min-height: 44px;
	}
	.direct-import {
		gap: 8px;
	}
	.direct-import-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.direct-import-row > input {
		flex: 1;
		width: 0;
		min-width: 0;
		min-height: 44px;
	}
	.direct-import-row > .api-action {
		flex: none;
	}
	.direct-import-row .btn {
		min-height: 44px;
	}
	.library-character {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: var(--r-ctl);
		background: var(--bg-hover);
		color: var(--text);
		text-align: left;
		cursor: pointer;
		min-width: 0;
	}
	.library-character:hover {
		border-color: var(--accent);
	}
	.library-character :global(img) {
		width: 48px;
		height: 48px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.library-character > span {
		display: grid;
		gap: 3px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.import-preview {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 12px;
		border-radius: var(--r-ctl);
		background: var(--bg-hover);
	}
	.import-drop {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 28px 16px;
		text-align: center;
	}
	.state-moves {
		display: grid;
		gap: 10px;
		min-width: 0;
	}
	.state-moves h3 {
		margin: 0;
	}
	.state-moves .check {
		align-items: flex-start;
	}
	.state-moves .check span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
