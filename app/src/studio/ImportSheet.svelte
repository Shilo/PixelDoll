<script lang="ts">
	import { onDestroy } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { fileDrop, preventFileNavigation } from './fileDrop.ts';
	import DirectionCompass from './DirectionCompass.svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import ApiPreview from './ApiPreview.svelte';
	import { libraryPlan, characterZipPlan } from './apiPlans.ts';
	import Sprite from './Sprite.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { composeCell } from '../lib/compose/compose.ts';
	import { configureImportedDirections, directionProblemError } from '../lib/rig/directions.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayDirectionProblem } from './displayDirectionProblem.ts';
	import { flipH, mirrorPartner } from '../lib/rig/mirror.ts';
	import { DIRECTIONS, type DirectionName, type RigDirection } from '../lib/rig/rig.ts';
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
	import { t } from 'svelte-whisper';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import { LocalizedError, message, type Message } from '../lib/message.ts';

	let { source }: { source: 'device' | 'pixellab' } = $props();
	let prepared = $state.raw<ImportedCharacter | null>(null);
	let previewValid = $state(false),
		nameInitialized = false;
	let setupNext = $state(true);
	let directionChoices = $state.raw<RigDirection[] | null>(null);
	let facing = $state<DirectionName>('south');
	const originalDirections = $derived(prepared?.project.manifest.rig.directions ?? []);
	const originalIds = $derived(originalDirections.map(({ id }) => id));
	const availableDirections = $derived(
		DIRECTIONS.filter((dir) => {
			const partner = mirrorPartner(dir);
			return originalIds.includes(dir) || (partner && originalIds.includes(partner));
		})
	);
	const directions = $derived(directionChoices ?? originalDirections);
	const directionError = $derived(
		prepared && directionChoices
			? directionProblemError(prepared.project, directions, 'import')
			: undefined
	);
	const previewFacing = $derived(directions.find(({ id }) => id === facing) ?? directions[0]);
	const needsSetup = $derived(
		!!prepared && !rigReady({ manifest: prepared.project.manifest, ...prepared.extra })
	);
	let states = $state.raw<CharacterImportState[]>([]),
		stateId = $state(''),
		moveStates = $state.raw<string[]>([]);
	let bytes: Uint8Array | null = null;
	let name = $state(''),
		id = $state(''),
		error = $state<Message | string>(''),
		busy = $state(false),
		saving = $state(false),
		loading = $state(false);
	let characters = $state.raw<LibraryCharacter[]>([]),
		total = $state(0),
		offset = $state(0),
		listed = $state(false),
		previewRevision = $state(0),
		libraryError = $state<Message | string>('');
	let alive = true;
	let fileInput = $state<HTMLInputElement>();
	let dragging = $state(false);
	const drop = fileDrop(
		() => busy,
		(active) => (dragging = active),
		(files) => {
			if (!files.length) error = message('import.error.chooseZipFile');
			else void importFiles(files);
		}
	);
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
		if (!p || !previewFacing) return null;
		const m = p.manifest;
		const img = composeCell(
			p,
			m.presets[0]?.items ?? { body: m.rig.baseItem },
			m.rig.animations[0].id,
			directionChoices ? (previewFacing.mirrorOf ?? previewFacing.id) : previewFacing.id,
			0
		);
		return directionChoices && previewFacing.mirrorOf ? flipH(img) : img;
	});
	function changeDirection(id: DirectionName, value: 'original' | 'mirror' | 'off') {
		const previous = directions.filter((dir) => dir.id !== id);
		const mirrorOf = mirrorPartner(id);
		if (value === 'original') previous.push({ id });
		if (value === 'mirror' && mirrorOf) previous.push({ id, mirrorOf });
		previous.sort((first, second) => DIRECTIONS.indexOf(first.id) - DIRECTIONS.indexOf(second.id));
		directionChoices =
			originalDirections.length === previous.length &&
			previous.every((dir, index) => dir.id === originalDirections[index].id && !dir.mirrorOf)
				? null
				: previous;
		if (value !== 'off') facing = id;
	}
	function toggleDirection(id: DirectionName) {
		changeDirection(
			id,
			directions.some((dir) => dir.id === id)
				? 'off'
				: originalIds.includes(id)
					? 'original'
					: 'mirror'
		);
	}
	function toggleMirror(id: DirectionName) {
		changeDirection(
			id,
			directions.find((dir) => dir.id === id)?.mirrorOf
				? originalIds.includes(id)
					? 'original'
					: 'off'
				: 'mirror'
		);
	}
	$effect(() => {
		if (source === 'pixellab' && app.key && !listed) {
			listed = true;
			void load(0);
		}
	});
	function reset() {
		prepared = null;
		directionChoices = null;
		facing = 'south';
		previewValid = false;
		nameInitialized = false;
		bytes = null;
		error = '';
		name = '';
		states = [];
		stateId = '';
		moveStates = [];
		drop.reset();
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
			if (alive) libraryError = errorMessage(e);
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
		const label = state.name || t('import.untitledState');
		return states.filter((s) => (s.name || t('import.untitledState')) === label).length > 1
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
			if (prepared?.stateId !== result.stateId) {
				directionChoices = null;
				facing = 'south';
			}
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
			if (files.length !== 1)
				throw new LocalizedError('Choose one character ZIP at a time.', 'import.error.oneAtATime');
			const file = files[0];
			if (!/\.zip$/i.test(file.name))
				throw new LocalizedError(
					'Choose a ZIP file exported from PixelLab or PixelDoll.',
					'import.error.chooseZip'
				);
			if (file.size > MAX_ZIP_BYTES)
				throw new LocalizedError('Choose a ZIP smaller than 64 MB.', 'zip.tooLarge');
			const data = new Uint8Array(await file.arrayBuffer());
			if (alive) await prepare(data, undefined, 'all');
		} catch (e) {
			if (alive) error = errorMessage(e);
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
			if (alive) error = errorMessage(e);
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
			if (alive) error = errorMessage(e);
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
			if (alive) error = errorMessage(e);
		} finally {
			if (alive) busy = false;
		}
	}
	async function save() {
		if (!prepared || !previewValid || busy || directionError) return;
		busy = true;
		saving = true;
		error = '';
		try {
			const imported = directionChoices
				? {
						...prepared,
						project: await configureImportedDirections(prepared.project, directionChoices)
					}
				: prepared;
			const projectId = await saveImportedCharacter(imported, name);
			await refreshProjects();
			if (!alive) return;
			await openProject(projectId);
			if (!alive) return;
			dismissWelcome();
			customize();
			ui.sheet = setupNext && needsSetup ? 'setup' : null;
			toast(message('import.imported', { name: name.trim() }));
		} catch (e) {
			if (alive) error = errorMessage(e);
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
	title={source === 'device' ? t('import.titleDevice') : t('import.titlePixelLab')}
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
				label={t('import.browseLibrary')}
				plan={libraryPlan()}
				activityScope={listScope(0)}
			/>
		</div>{/if}
	{#if states.length > 1}
		<div class="field">
			<label class="label" for="import-standing-state">{t('import.standingState')}</label>
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
				{t('import.standingStateHint')}
			</p>
		</div>
	{/if}
	{#if states.some((state) => state.animations !== 0)}
		<section class="state-moves" role="group" aria-labelledby="import-moves-title">
			<h3 class="label" id="import-moves-title">{t('import.movesTitle')}</h3>
			<p class="faint small">
				{t('import.movesHint')}
			</p>
			{#each states.filter((state) => state.animations !== 0) as state (state.id)}
				<label class="check"
					><input
						type="checkbox"
						checked={moveStates.includes(state.id)}
						disabled={busy}
						onchange={(e) => changeMoves(state.id, e.currentTarget.checked)}
					/><span
						>{state.animations === null
							? t('import.stateMovesUnreadable', { name: stateLabel(state) })
							: t('import.stateMoves', {
									name: stateLabel(state),
									count: state.animations
								})}</span
					></label
				>
			{/each}
		</section>
	{/if}
	{#if !prepared}
		{#if source === 'device'}
			<section
				class="bu-dialog-surface import-drop"
				aria-label={t('import.dropArea')}
				aria-busy={busy}
				ondragenter={drop.enter}
				ondragleave={drop.leave}
				ondragover={drop.over}
				ondrop={drop.drop}
			>
				<FileArchive size={32} />
				<strong aria-live="polite"
					>{busy ? t('import.reading') : dragging ? t('import.release') : t('import.drop')}</strong
				>
				<span class="muted small">{t('import.dropNote')}</span>
				<button
					class="bu-action btn"
					data-variant="outline"
					disabled={busy}
					onclick={() => fileInput?.click()}>{t('import.chooseZip')}</button
				>
				<input
					hidden
					type="file"
					accept=".zip,application/zip"
					aria-label={t('import.characterZip')}
					bind:this={fileInput}
					disabled={busy}
					onchange={fileChanged}
				/>
			</section>
			<p class="muted small">
				{t('import.devicePrivacy')}
			</p>
			<p class="faint small">
				{t('import.pixelLabHint')}
			</p>
		{:else}
			{#if !app.key || app.keyRejected}
				{#if libraryError}<p class="notice bad small" role="alert">
						<TriangleAlert size={16} /><span>{displayMessage(libraryError)}</span>
					</p>{/if}
				<button
					class="bu-action btn"
					data-variant="outline"
					disabled={busy}
					onclick={() =>
						withKey(() => {
							ui.sheet = 'importPixelLab';
						})}><KeyRound size={16} />{t('import.connect')}</button
				>
			{:else}
				<div class="library-head">
					<span class="label">{t('import.libraryTitle')}</span><span class="api-action"
						><ApiPeek
							scope="library-refresh"
							label={t('import.refreshLibrary')}
							plan={libraryPlan(offset)}
							activityScope={listScope(offset)}
						/><button
							class="bu-action btn plain small"
							data-variant="quiet"
							disabled={busy || loading}
							onclick={() => load(offset)}>{t('import.refresh')}</button
						></span
					>
				</div>
				<div class="character-library" aria-label={t('import.libraryLabel')} aria-busy={loading}>
					{#if libraryError}<p class="notice bad small" role="alert">
							<TriangleAlert size={16} /><span>{displayMessage(libraryError)}</span>
						</p>{/if}
					{#if loading}<p class="muted" role="status">{t('import.loadingCharacters')}</p>
					{:else if !characters.length && !libraryError}<p class="faint">
							{t('import.noCharacters')}
						</p>{/if}
					{#each characters as ch (ch.id)}
						<div class="api-action library-entry">
							<ApiPeek
								scope={`library-character-${ch.id}`}
								label={t('import.previewNamed', { name: ch.name || t('import.character') })}
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
									><b>{ch.name || t('import.untitledCharacter')}</b><span class="faint small"
										>{t('import.libraryCounts', {
											directions: t('export.count.directions', {
												count: ch.directions
											}),
											moves: t('export.count.moves', { count: ch.animation_count })
										})}</span
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
							label={t('import.previousCharacterPage')}
							plan={libraryPlan(Math.max(0, offset - 20))}
							activityScope={listScope(Math.max(0, offset - 20))}
						/><button
							class="bu-action btn icon page-button"
							data-variant="outline"
							aria-label={t('import.previousPage')}
							disabled={busy || loading || offset === 0}
							onclick={() => load(Math.max(0, offset - 20))}><ChevronLeft size={18} /></button
						></span
					><span class="faint small"
						>{characters.length
							? t('import.libraryRange', {
									start: offset + 1,
									end: Math.min(offset + characters.length, total),
									total
								})
							: loading
								? t('common.loading')
								: libraryError
									? t('common.unavailable')
									: t('import.libraryEmptyRange')}</span
					><span class="api-action"
						><ApiPeek
							scope="library-next"
							label={t('import.nextCharacterPage')}
							plan={libraryPlan(offset + 20)}
							activityScope={listScope(offset + 20)}
						/><button
							class="bu-action btn icon page-button"
							data-variant="outline"
							aria-label={t('import.nextPage')}
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
				<label class="label" for="import-character-id">{t('import.directImport')}</label>
				<div class="direct-import-row">
					<input
						class="bu-input input"
						id="import-character-id"
						type="text"
						bind:value={id}
						placeholder={t('import.directImportPlaceholder')}
						disabled={busy}
					/>
					<span class="api-action"
						><ApiPeek
							scope="library-preview"
							label={t('import.previewZip')}
							plan={characterZipPlan(id)}
							activityScope={zipScope(id)}
						/><button
							class="bu-action btn"
							data-variant="outline"
							type="submit"
							aria-label={t('import.previewCharacter')}
							disabled={busy || !id.trim()}>{t('import.preview')}</button
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
					label={t('import.previewArtwork')}
				/>{/if}
			{#if !previewValid && !busy}<p class="muted small">
					{t('import.stalePreview')}
				</p>
			{:else}<p class="muted">
					{t('import.previewSummary', {
						directions: t('export.count.directions', { count: directions.length }),
						moves: t('export.count.moves', {
							count: prepared.project.manifest.rig.animations.length
						}),
						items: t('import.count.separateItems', {
							count: prepared.project.manifest.items.filter((i) => i.slot !== 'body').length
						})
					})}
				</p>{/if}
		</div>
		{#if busy && !saving}<p class="muted" role="status">{t('import.updatingPreview')}</p>{/if}
		<label class="field"
			><span class="label">{t('import.characterName')}</span><input
				class="bu-input input"
				type="text"
				bind:value={name}
				maxlength="60"
				disabled={busy}
			/></label
		>
		{#if prepared.format === 'pixellab'}
			<details>
				<summary>{t('common.directions')}</summary>
				<p class="muted small">
					{t('import.directionsHint')}
				</p>
				<DirectionCompass
					label={t('import.directionsToImport')}
					selected={directions.map(({ id }) => id)}
					available={availableDirections}
					mirrorSources={originalIds}
					mirrors={Object.fromEntries(directions.map(({ id, mirrorOf }) => [id, mirrorOf]))}
					disabled={busy}
					ontoggle={toggleDirection}
					onmirror={toggleMirror}
				/>
				<p class="sr" role="status">
					{previewFacing
						? t('import.previewDirection', {
								direction: displayDirection(previewFacing.id)
							})
						: t('import.noDirections')}
				</p>
				{#if previewFacing && directions.length > 1}<label class="field">
						<span class="label">{t('import.previewDirectionLabel')}</span>
						<select
							class="bu-input input"
							value={previewFacing.id}
							disabled={busy}
							onchange={(event) => (facing = event.currentTarget.value as DirectionName)}
						>
							{#each directions as direction (direction.id)}<option value={direction.id}
									>{displayDirection(direction.id)}</option
								>{/each}
						</select>
					</label>{/if}
			</details>
		{/if}
		{#if directionError}<p class="notice warn small" role="status">
				<TriangleAlert size={16} /><span>{displayDirectionProblem(directionError.translation)}</span
				>
			</p>{/if}
		{#each prepared.warnings as warning, index (warning)}<p class="notice warn small">
				<TriangleAlert size={16} /><span
					>{displayMessage(prepared.warningKeys?.[index] ?? warning)}</span
				>
			</p>{/each}
		{#if needsSetup}<label class="check"
				><input type="checkbox" bind:checked={setupNext} disabled={busy} />{t(
					'import.setupNext'
				)}</label
			>
			<p class="faint small">
				{t('import.setupNextHint')}
			</p>{/if}
		<button class="bu-action btn plain" data-variant="quiet" disabled={busy} onclick={reset}
			>{t('import.chooseAnother')}</button
		>
	{/if}
	{#if busy && (!prepared || saving)}<p class="muted" role="status">
			{saving ? t('import.saving') : t('import.preparing')}
		</p>{/if}
	{#if error}<p class="notice bad small" role="alert">
			<TriangleAlert size={16} /><span>{displayDirectionProblem(error)}</span>
		</p>{/if}
	{#snippet footer()}
		<span class="foot-note import-note">{t('import.note')}</span>
		<button
			class="bu-action btn primary"
			data-variant="primary"
			disabled={!prepared || !previewValid || busy || !name.trim() || !!directionError}
			onclick={save}
			><Download size={16} />{busy ? t('import.working') : t('import.importCharacter')}</button
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
