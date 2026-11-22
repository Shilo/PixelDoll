<script lang="ts">
	// Settings › Cloud Save: connect a provider, see whether saves reached the cloud, settle conflicts, restore an earlier
	// version, recover from a downloaded copy, and leave. Loaded on demand, so the sync client stays out of startup.
	import { onMount, tick } from 'svelte';
	import { getLocale, t, type WhisperKey } from 'svelte-whisper';
	import {
		characterBody,
		cloudSave,
		conflicts as openConflicts,
		connect,
		deleteCloudCopy,
		disconnect,
		disconnectEverywhere,
		importFolder,
		rebuild,
		resolve,
		restoreVersion,
		start,
		syncNow,
		versions,
		type CloudState
	} from '../lib/sync/client.ts';
	import { CANCELED, NO_DRIVE_ACCESS, NOT_CONFIGURED } from '../lib/sync/auth/auth.ts';
	import type { SignInProvider } from '../lib/sync/auth/auth.ts';
	import type { ConflictNote } from '../lib/sync/core/engine.ts';
	import { SyncError } from '../lib/sync/providers/types.ts';
	import { copyShell } from '../lib/equipment/copy.ts';
	import { putItem, slotLadder } from '../lib/items/items.ts';
	import { newItemExportId } from '../lib/store/identity.ts';
	import type { Item, Manifest } from '../lib/store/manifest.ts';
	import { displayDate, displayError } from '../lib/i18n.ts';
	import { store } from './state.svelte.ts';
	import {
		Cloud,
		ExternalLink,
		LogOut,
		RefreshCw,
		TriangleAlert,
		Unplug,
		Upload
	} from './icons.ts';
	import SettingsItemButton from './SettingsItemButton.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import DestructiveConfirmButton from './DestructiveConfirmButton.svelte';
	import { openerLabel } from './openerLabel.ts';

	type Version = Awaited<ReturnType<typeof versions>>[number];

	const providerNames: Record<SignInProvider, string> = {
		google: 'Google Drive',
		dropbox: 'Dropbox'
	};
	const statusLabels = {
		local: 'cloudSave.status.local',
		idle: 'cloudSave.status.local',
		syncing: 'cloudSave.status.syncing',
		synced: 'cloudSave.status.synced',
		conflict: 'cloudSave.status.conflict',
		offline: 'cloudSave.status.offline',
		reconnect: 'cloudSave.status.reconnect',
		'cloud-full': 'cloudSave.status.cloudFull',
		update: 'cloudSave.status.update',
		missing: 'cloudSave.status.missing',
		failed: 'cloudSave.status.failed'
	} satisfies Record<CloudState['status'], WhisperKey>;
	const signInErrors: Record<string, WhisperKey> = {
		[NOT_CONFIGURED]: 'cloudSave.notConfigured',
		[CANCELED]: 'cloudSave.canceled',
		[NO_DRIVE_ACCESS]: 'cloudSave.noDriveAccess'
	};
	const IMPORT_NOT_A_FOLDER = 'This is not a downloaded Cloud Save folder.';

	const provider = $derived($cloudSave.provider);
	let busy = $state(false);
	let problem = $state('');
	let done = $state('');
	let now = $state(Date.now());
	let pending = $state.raw<[string, ConflictNote[]][]>([]);
	let character = $state('');
	let history = $state.raw<Version[]>([]);
	let restoring = $state<Version>();
	let confirming = $state<'everywhere' | 'delete'>();
	let picker = $state<HTMLInputElement>();
	let openPicker = $state<HTMLButtonElement>();
	const characters = $derived(store.projects.filter((entry) => !entry.demo && !entry.dev));
	const statusId = $props.id();

	onMount(() => {
		void start().catch((error: unknown) => (problem = displayError(error)));
		const clock = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(clock);
	});

	// Open conflicts follow the count the client publishes.
	$effect(() => {
		const count = $cloudSave.conflicts;
		let live = true;
		if (!provider || !count) pending = [];
		else
			openConflicts().then(
				(notes) => {
					if (live) pending = [...notes];
				},
				(error: unknown) => {
					if (live) problem = displayError(error);
				}
			);
		return () => {
			live = false;
		};
	});

	$effect(() => {
		const id = character;
		let live = true;
		history = [];
		if (provider && id)
			versions(id).then(
				// The newest is the version in use now; a deleted one cannot be restored.
				(list) => {
					if (live) history = list.filter((entry) => !entry.current && !entry.deleted);
				},
				(error: unknown) => {
					if (live) problem = displayError(error);
				}
			);
		return () => {
			live = false;
		};
	});

	function signInError(error: string | undefined) {
		if (!error) return '';
		const key = signInErrors[error];
		return key ? t(key) : error;
	}

	function savedAgo(at: number) {
		const seconds = Math.round((at - now) / 1000);
		if (seconds > -60) return t('cloudSave.status.syncedJustNow');
		const format = new Intl.RelativeTimeFormat(getLocale() || 'en', { numeric: 'auto' });
		const minutes = Math.round(seconds / 60);
		const hours = Math.round(minutes / 60);
		const time =
			minutes > -60
				? format.format(minutes, 'minute')
				: hours > -24
					? format.format(hours, 'hour')
					: format.format(Math.round(hours / 24), 'day');
		return t('cloudSave.status.syncedAgo', { time });
	}

	const statusText = $derived(
		$cloudSave.status === 'synced' && $cloudSave.syncedAt
			? savedAgo($cloudSave.syncedAt)
			: t(statusLabels[$cloudSave.status])
	);

	async function run(action: () => Promise<unknown>, success?: () => string) {
		if (busy) return;
		busy = true;
		problem = '';
		done = '';
		try {
			await action();
			if (success) done = success();
		} catch (error) {
			problem = error instanceof SyncError ? signInError(error.message) : displayError(error);
		} finally {
			busy = false;
		}
	}

	const connectTo = (kind: SignInProvider) => run(() => connect(kind));

	function describe(note: ConflictNote) {
		const [root, list] = note.path;
		if (!note.path.length) return t('cloudSave.conflicts.whole');
		if (note.path.length === 3 && root === 'manifest' && list === 'items')
			return ((note.a ?? note.b) as Item | undefined)?.name ?? String(note.path[2]);
		return String(note.path.at(-1));
	}

	const isItem = (note: ConflictNote) =>
		note.path.length === 3 && note.path[0] === 'manifest' && note.path[1] === 'items';

	function characterLabel(id: string) {
		return (
			store.projects.find((entry) => entry.id === id)?.name ?? t('cloudSave.conflicts.unnamed')
		);
	}

	/** Keep this device's item and add the other device's as a copy with its own ids and materials. */
	async function keepBoth(record: string, note: ConflictNote) {
		const body = structuredClone(await characterBody(record)) as { manifest: Manifest } | undefined;
		if (!body) throw new Error(t('cloudSave.conflicts.failed'));
		const other = note.b as Item;
		const { manifest } = body;
		const { item, materials } = copyShell(manifest, other, {}, manifest, other.coverage ?? []);
		// The same character: the other device's coverage and checks still describe the copy as drawn.
		if (other.coverage) item.coverage = other.coverage;
		else delete item.coverage;
		if (other.qa) item.qa = structuredClone(other.qa);
		else delete item.qa;
		item.exportId = newItemExportId(manifest.items, item.id);
		putItem(manifest, item, slotLadder(manifest.rig));
		manifest.materials.push(...materials);
		return resolve(record, note, 'live', body);
	}

	function choose(record: string, note: ConflictNote, keep: 'live' | 'other' | 'both') {
		return run(async () => {
			const settled =
				keep === 'both' ? await keepBoth(record, note) : await resolve(record, note, keep);
			if (!settled) throw new Error(t('cloudSave.conflicts.failed'));
			pending = [...(await openConflicts())];
		});
	}

	function restore(version: Version) {
		return run(
			async () => {
				if (!(await restoreVersion(character, version.id)))
					throw new Error(t('cloudSave.restore.failed'));
				restoring = undefined;
				const id = character;
				history = (await versions(id)).filter((entry) => !entry.current && !entry.deleted);
			},
			() => t('cloudSave.restore.done')
		);
	}

	async function importFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (!files.length) return;
		let added = 0;
		await run(
			async () => {
				try {
					added = await importFolder(
						await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())))
					);
				} catch (error) {
					if (error instanceof SyncError && error.code === 'update')
						throw new Error(t('cloudSave.status.update'));
					if (error instanceof SyncError && error.message === IMPORT_NOT_A_FOLDER)
						throw new Error(t('cloudSave.import.invalid'));
					throw error;
				}
			},
			() => (added ? t('cloudSave.import.added', { count: added }) : t('cloudSave.import.none'))
		);
		await tick();
		openPicker?.focus();
	}

	function confirmEverywhere() {
		return run(async () => {
			await disconnectEverywhere();
			confirming = undefined;
		});
	}

	function confirmDelete() {
		return run(async () => {
			await deleteCloudCopy();
			confirming = undefined;
		});
	}

	function dateOf(version: Version) {
		return version.at
			? displayDate(version.at, { dateStyle: 'medium', timeStyle: 'short' })
			: t('cloudSave.restore.unknownTime');
	}
</script>

<div class="cloud-save" aria-busy={busy}>
	{#if !provider}
		<section class="cloud-task">
			<p class="bu-muted settings-description">{t('cloudSave.intro')}</p>
			<SettingsItemButton disabled={busy} onclick={() => connectTo('google')}>
				<Cloud size={18} aria-hidden="true" />
				{t('cloudSave.connectGoogle')}
			</SettingsItemButton>
			<SettingsItemButton disabled={busy} onclick={() => connectTo('dropbox')}>
				<Cloud size={18} aria-hidden="true" />
				{t('cloudSave.connectDropbox')}
			</SettingsItemButton>
			<p class="bu-muted settings-description" aria-live="polite">
				{t('cloudSave.status.local')}
			</p>
			{#if $cloudSave.error}<p class="notice warn small" role="alert">
					<TriangleAlert size={14} aria-hidden="true" />{signInError($cloudSave.error)}
				</p>{/if}
		</section>
	{:else}
		<section class="cloud-task" aria-labelledby={statusId}>
			<div class="account">
				<h4 class="settings-label" id={statusId}>{providerNames[provider]}</h4>
				{#if $cloudSave.email}<p class="bu-muted settings-description email">
						{$cloudSave.email}
					</p>{/if}
			</div>
			<p
				class={['settings-description', { attention: $cloudSave.status !== 'synced' }]}
				aria-live="polite"
			>
				{statusText}
			</p>
			{#if $cloudSave.status === 'failed'}
				{#if $cloudSave.error}<p class="bu-muted settings-description">
						{signInError($cloudSave.error)}
					</p>{/if}
				<SettingsItemButton disabled={busy} onclick={() => run(syncNow)}>
					<RefreshCw size={18} aria-hidden="true" />{t('cloudSave.retry')}
				</SettingsItemButton>
			{:else if $cloudSave.status === 'reconnect'}
				<SettingsItemButton disabled={busy} onclick={() => connectTo(provider)}>
					<RefreshCw size={18} aria-hidden="true" />{t('cloudSave.reconnect')}
				</SettingsItemButton>
			{:else if $cloudSave.status === 'cloud-full'}
				<p class="bu-muted settings-description">{t('cloudSave.cloudFullHint')}</p>
				<SettingsItemButton disabled={busy} onclick={() => run(syncNow)}>
					<RefreshCw size={18} aria-hidden="true" />{t('cloudSave.retry')}
				</SettingsItemButton>
			{:else if $cloudSave.status === 'update'}
				<p class="bu-muted settings-description">{t('cloudSave.updateHint')}</p>
			{:else if $cloudSave.status === 'missing'}
				<p class="bu-muted settings-description">{t('cloudSave.missingHint')}</p>
				<SettingsItemButton disabled={busy} onclick={() => run(rebuild)}>
					<RefreshCw size={18} aria-hidden="true" />{t('cloudSave.rebuild')}
				</SettingsItemButton>
			{/if}
		</section>

		{#if pending.length}
			<hr class="bu-separator" />
			<section class="cloud-task" aria-labelledby="{statusId}-conflicts">
				<h4 class="settings-label" id="{statusId}-conflicts">{t('cloudSave.conflicts.title')}</h4>
				<p class="bu-muted settings-description">{t('cloudSave.conflicts.hint')}</p>
				{#each pending as [record, notes] (record)}
					<div class="conflict-character">
						<h5 class="settings-label"><bdi>{characterLabel(record)}</bdi></h5>
						{#each notes as note (`${note.path.join('/')}:${note.aRev}:${note.bRev}`)}
							<div class="conflict">
								<p class="settings-description"><bdi>{describe(note)}</bdi></p>
								<div class="choices">
									<button
										type="button"
										class="bu-btn"
										data-variant="outline"
										disabled={busy}
										onclick={() => choose(record, note, 'live')}
										>{t('cloudSave.conflicts.keepThis')}</button
									>
									<button
										type="button"
										class="bu-btn"
										data-variant="outline"
										disabled={busy}
										onclick={() => choose(record, note, 'other')}
										>{t('cloudSave.conflicts.keepOther')}</button
									>
									{#if isItem(note) && note.a !== undefined && note.b !== undefined}
										<button
											type="button"
											class="bu-btn"
											data-variant="outline"
											disabled={busy}
											onclick={() => choose(record, note, 'both')}
											>{t('cloudSave.conflicts.keepBoth')}</button
										>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</section>
		{/if}

		<hr class="bu-separator" />
		<section class="cloud-task" aria-labelledby="{statusId}-restore">
			<h4 class="settings-label" id="{statusId}-restore">{t('cloudSave.restore.title')}</h4>
			<select
				class="bu-input input"
				aria-label={t('cloudSave.restore.character')}
				disabled={busy || !characters.length}
				bind:value={character}
			>
				<option value="">{t('cloudSave.restore.choose')}</option>
				{#each characters as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}
			</select>
			{#if character}
				{#each history as version (version.id)}
					<div class="version">
						<span class="settings-description">{dateOf(version)}</span>
						<button
							type="button"
							class="bu-btn"
							data-variant="outline"
							disabled={busy}
							onclick={() => (restoring = version)}
							>{openerLabel(t('cloudSave.restore.action'))}</button
						>
					</div>
				{:else}
					<p class="bu-muted settings-description">{t('cloudSave.restore.none')}</p>
				{/each}
			{/if}
		</section>
	{/if}

	<hr class="bu-separator" />
	<section class="cloud-task">
		<input
			type="file"
			accept=".zip,application/zip"
			multiple
			hidden
			bind:this={picker}
			onchange={importFiles}
			oncancel={(event) => {
				event.stopPropagation();
				openPicker?.focus();
			}}
		/>
		<SettingsItemButton
			disabled={busy}
			aria-describedby="{statusId}-import"
			bind:element={openPicker}
			onclick={() => picker?.click()}
		>
			<Upload size={18} aria-hidden="true" />
			{t('cloudSave.import.title')}
			<SurfaceChevron />
		</SettingsItemButton>
		<p id="{statusId}-import" class="bu-muted settings-description">{t('cloudSave.import.hint')}</p>
	</section>

	{#if provider}
		<hr class="bu-separator" />
		<section class="cloud-task">
			<SettingsItemButton disabled={busy} onclick={() => run(disconnect)}>
				<LogOut size={18} aria-hidden="true" />{t('cloudSave.disconnect')}
			</SettingsItemButton>
			<p class="bu-muted settings-description">{t('cloudSave.disconnectHint')}</p>
			{#if provider === 'google'}
				<SettingsItemButton
					disabled={busy}
					aria-haspopup="dialog"
					onclick={() => (confirming = 'everywhere')}
				>
					<Unplug size={18} aria-hidden="true" />
					{openerLabel(t('cloudSave.everywhere.action'))}
					<SurfaceChevron />
				</SettingsItemButton>
			{:else}
				<a
					class="bu-action settings-link"
					data-variant="outline"
					href="https://www.dropbox.com/account/connected_apps"
					target="_blank"
					rel="noreferrer"
				>
					<Unplug size={18} aria-hidden="true" />
					<span>{t('cloudSave.manageApps')}</span>
					<ExternalLink size={16} aria-hidden="true" />
				</a>
			{/if}
		</section>
		<hr class="bu-separator" />
		<section class="cloud-task">
			<p class="bu-muted settings-description">{t('cloudSave.delete.description')}</p>
			<button
				type="button"
				class="bu-btn delete-cloud"
				data-variant="danger"
				disabled={busy}
				onclick={() => (confirming = 'delete')}
			>
				<span class="row-name">{openerLabel(t('cloudSave.delete.action'))}</span>
				<SurfaceChevron />
			</button>
		</section>
	{/if}

	{#if problem}<p class="notice bad small" role="alert">
			<TriangleAlert size={14} aria-hidden="true" />{problem}
		</p>{/if}
	{#if done}<p class="settings-description" role="status">{done}</p>{/if}
</div>

{#if restoring}
	{@const version = restoring}
	<ConfirmDialog
		title={t('cloudSave.restore.confirmTitle', { date: dateOf(version) })}
		action={t('cloudSave.restore.action')}
		busyAction={t('common.preparing')}
		{busy}
		{problem}
		oncancel={() => (restoring = undefined)}
		onconfirm={() => void restore(version)}
	>
		<p>{t('cloudSave.restore.confirmBody')}</p>
	</ConfirmDialog>
{/if}

{#if confirming === 'everywhere'}
	<ConfirmDialog
		title={t('cloudSave.everywhere.title')}
		action={t('cloudSave.everywhere.action')}
		busyAction={t('common.preparing')}
		{busy}
		{problem}
		oncancel={() => (confirming = undefined)}
		onconfirm={() => void confirmEverywhere()}
	>
		<p>{t('cloudSave.everywhere.body')}</p>
	</ConfirmDialog>
{:else if confirming === 'delete'}
	<ConfirmDialog
		title={t('cloudSave.delete.title')}
		action={t('cloudSave.delete.action')}
		busyAction={t('common.deleting')}
		{busy}
		{problem}
		oncancel={() => (confirming = undefined)}
		onconfirm={() => void confirmDelete()}
	>
		<p>{t('cloudSave.delete.body')}</p>
		<p class="bu-muted">{t('cloudSave.delete.kept')}</p>
		{#snippet actionButton(label, disabled, onconfirm)}
			{#key disabled}
				<DestructiveConfirmButton
					{label}
					confirmLabel={t('cloudSave.delete.confirm')}
					{disabled}
					{onconfirm}
				/>
			{/key}
		{/snippet}
	</ConfirmDialog>
{/if}

<style>
	.cloud-save {
		display: grid;
		gap: 16px;
	}
	.cloud-task,
	.conflict-character {
		display: grid;
		gap: 8px;
	}
	.cloud-save hr {
		margin-block: 0;
	}
	.cloud-save .notice {
		margin: 0;
	}
	.account {
		display: grid;
		gap: 2px;
	}
	.email {
		overflow-wrap: anywhere;
	}
	.attention {
		font-weight: 600;
	}
	.conflict {
		display: grid;
		gap: 6px;
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.choices .bu-btn,
	.version .bu-btn {
		height: auto;
		min-height: 44px;
		white-space: normal;
	}
	.version {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.settings-link {
		display: flex;
		align-items: center;
		gap: 10px;
		inline-size: 100%;
		min-height: 44px;
		padding: 8px 12px;
		text-align: start;
		text-decoration: none;
	}
	.settings-link span {
		flex: 1;
	}
	.settings-link :global(svg) {
		flex: none;
	}
	.delete-cloud {
		display: flex;
		align-items: center;
		gap: 8px;
		inline-size: 100%;
		min-height: 44px;
		text-align: start;
		white-space: normal;
	}
</style>
