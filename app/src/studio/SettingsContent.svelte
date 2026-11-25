<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { getLocale, t, type WhisperKey } from 'svelte-whisper';
	import { exportFormatNames } from './exportFormatNames.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { pwa } from '../lib/pwa.ts';
	import { getKeyRevision } from '../lib/app.svelte.ts';
	import { isResettableSection, resetSettings, type ResetScope } from './resetSettings.ts';
	import { settingsAtDefaults, watchCreationSettings } from './settingsDefaults.svelte.ts';
	import { isCreationSection } from './creationSettings.ts';
	import CreationSettings from './CreationSettings.svelte';
	import TrashSettings from './TrashSettings.svelte';
	import {
		Archive,
		Clapperboard,
		CodeXml,
		Download,
		Gamepad2,
		Info,
		KeyRound,
		Layers2,
		Moon,
		PawPrint,
		PersonStanding,
		Settings2,
		Shirt,
		Sun,
		SunMoon,
		Trash,
		UserRound
	} from './icons.ts';
	import DeveloperSettings from './DeveloperSettings.svelte';
	import SettingsItemSegmented from './SettingsItemSegmented.svelte';
	import SettingsItemButton from './SettingsItemButton.svelte';
	import SettingsResetButton from './SettingsResetButton.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import LanguagePicker from './LanguagePicker.svelte';
	import WardrobeVisibility from './WardrobeVisibility.svelte';
	import MountSettings from './MountSettings.svelte';
	import LiveViewSettings from './LiveViewSettings.svelte';
	import AboutSettings from './AboutSettings.svelte';
	import PixelLabSettings from './PixelLabSettings.svelte';
	import LibrarySettings from './LibrarySettings.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import {
		settingsLabels,
		settingsNavigation,
		takeSettingsReturnFocus,
		type SettingsSection
	} from './settingsNavigation.svelte.ts';
	import { message } from '../lib/message.ts';
	import { characterName, setTheme, store, toast, ui } from './state.svelte.ts';
	import { openerLabel } from './openerLabel.ts';

	let {
		exportSettings,
		openExport,
		busy,
		libraryBusy = $bindable(false),
		reviewingBackup = $bindable(false),
		resetScope = $bindable(null)
	}: {
		exportSettings: Snippet<[string | undefined]>;
		openExport: () => void;
		busy: boolean;
		libraryBusy?: boolean;
		reviewingBackup?: boolean;
		resetScope?: ResetScope | null;
	} = $props();
	let forgetRevision = $state(-1);
	let query = $state('');
	const themeLabel = $derived(t('settings.theme'));
	const appearanceOptions = $derived([
		{ value: 'dark', label: t('settings.dark') },
		{ value: 'light', label: t('settings.light') }
	] as const);
	const sections = [
		{
			id: 'pixellab',
			label: settingsLabels.pixellab,
			icon: KeyRound,
			entries: [
				{
					id: 'connection',
					label: 'toolbar.pixelLabAccount',
					terms: [
						'usage.title',
						'usage.generations',
						'usage.creditBalance',
						'connectSheet.secretApiKey',
						'connectSheet.replaceKey',
						'connectSheet.forgetKey'
					]
				},
				{ id: 'cost-estimate', label: 'costSheet.title' },
				{ id: 'recent-activity', label: 'activity.title' },
				{ id: 'pixellab-website', label: 'settings.pixelLabWebsite' }
			]
		},
		{
			id: 'general',
			label: settingsLabels.general,
			icon: Settings2,
			entries: [
				{
					id: 'theme',
					label: 'settings.theme',
					terms: ['toolbar.lightMode', 'toolbar.darkMode']
				},
				{ id: 'language', label: 'language.label' },
				{ id: 'reset', label: 'settings.reset.allAction', terms: ['settings.reset.action'] }
			]
		},
		{
			id: 'wardrobe',
			label: settingsLabels.wardrobe,
			icon: Shirt,
			entries: [
				{
					id: 'visibility',
					label: 'sharedVisibility.heading',
					terms: [
						'toolbar.wardrobeSettings',
						'sharedVisibility.hideAll',
						'sharedVisibility.hideDemo'
					]
				}
			]
		},
		{
			id: 'mount',
			label: settingsLabels.mount,
			icon: PawPrint,
			entries: [
				{ id: 'show-mount', label: 'toolbar.showMount' },
				{ id: 'riding-pose', label: 'toolbar.riderPose', terms: ['toolbar.riderPoseRide'] },
				{
					id: 'hide-legs',
					label: 'toolbar.hideLegs',
					terms: ['toolbar.farLeg', 'toolbar.bothLegs']
				}
			]
		},
		{
			id: 'live',
			label: settingsLabels.live,
			icon: Gamepad2,
			entries: [
				{
					id: 'live-idle',
					label: 'liveViews.idle',
					terms: ['toolbar.viewTopDown', 'toolbar.viewSide']
				},
				{ id: 'live-walk', label: 'liveViews.walk' },
				{ id: 'live-run', label: 'liveViews.run', terms: ['liveViews.sprint'] },
				{ id: 'live-jump', label: 'liveViews.jump' },
				{ id: 'live-attack', label: 'liveViews.attack' },
				{ id: 'live-attackUp', label: 'liveViews.attackUp' },
				{ id: 'live-attackDown', label: 'liveViews.attackDown' }
			]
		},
		{
			id: 'characters',
			label: settingsLabels.characters,
			icon: UserRound,
			entries: [
				{
					id: 'character-model',
					label: 'create.form.model',
					names: ['V3', 'Pro', 'Pro Flash', 'Standard']
				},
				{ id: 'body-size', label: 'create.form.bodySize' },
				{ id: 'frame-size', label: 'create.form.frameSize' },
				{
					id: 'direction-presets',
					label: 'common.direction',
					terms: ['create.form.directionPresets']
				},
				{
					id: 'base-clothing',
					label: 'create.form.baseClothing',
					terms: ['create.form.underwear', 'create.form.nothingWorn']
				}
			]
		},
		{
			id: 'moves',
			label: settingsLabels.moves,
			icon: Clapperboard,
			entries: [
				{
					id: 'move-model',
					label: 'moveSheet.motionModel',
					names: ['V3', 'PixMiniMax', 'Skeleton V3']
				},
				{ id: 'move-frames', label: 'moveSheet.frames', terms: ['creationSettings.automatic'] }
			]
		},
		{
			id: 'states',
			label: settingsLabels.states,
			icon: PersonStanding,
			entries: [
				{
					id: 'state-model',
					label: 'create.form.model',
					names: ['Pro', 'Pro Flash', 'V3', 'Pixen', 'V3 (Pixen)']
				}
			]
		},
		{
			id: 'items',
			label: settingsLabels.items,
			icon: Layers2,
			entries: [
				{
					id: 'item-method',
					label: 'newItem.method',
					terms: [
						'creationSettings.automatic',
						'generationDetails.method.skeletonPose',
						'generationDetails.method.frameEditing'
					]
				}
			]
		},
		{
			id: 'export',
			label: settingsLabels.export,
			icon: Download,
			entries: [
				{
					id: 'playback',
					label: 'export.settings.playOnce',
					terms: ['export.settings.playOnceHint']
				},
				{ id: 'sheets', label: 'export.settings.dressed', terms: ['export.settings.dressedHint'] },
				{
					id: 'action-layers',
					label: 'export.settings.actionLayers',
					terms: ['export.settings.actionLayersHint']
				},
				{
					id: 'format',
					label: 'export.settings.defaultTarget',
					terms: ['export.settings.format', 'export.group.engines', 'export.settings.versionMenu'],
					names: Object.values(exportFormatNames)
				}
			]
		},
		{
			id: 'library',
			label: settingsLabels.library,
			icon: Archive,
			entries: [
				{ id: 'backup', label: 'librarySettings.backup' },
				{ id: 'originals', label: 'librarySettings.originals' },
				{ id: 'restore', label: 'librarySettings.restoreFromBackup' }
			]
		},
		{
			id: 'trash',
			label: settingsLabels.trash,
			icon: Trash,
			entries: [{ id: 'trash', label: 'settings.trash', terms: ['recentlyDeleted.empty'] }]
		},
		{
			id: 'developer',
			label: settingsLabels.developer,
			icon: CodeXml,
			entries: [{ id: 'developer-mode', label: 'developer.mode', terms: ['developer.description'] }]
		},
		{
			id: 'about',
			label: settingsLabels.about,
			icon: Info,
			entries: [
				{
					id: 'about',
					label: 'settings.about',
					terms: ['versionRow.openSource', 'versionRow.viewCommit'],
					names: ['PixelDoll', __APP_VERSION__, __APP_COMMIT__]
				}
			]
		}
	] satisfies {
		id: SettingsSection;
		label: WhisperKey;
		icon: typeof Settings2;
		entries: { id: string; label: WhisperKey; terms?: WhisperKey[]; names?: readonly string[] }[];
	}[];
	const available = sections.filter(
		(section) =>
			!workspaceCopy ||
			(!isCreationSection(section.id) &&
				!['pixellab', 'library', 'trash', 'developer'].includes(section.id))
	);
	const groups: SettingsSection[][] = [
		['pixellab'],
		['general', 'wardrobe', 'mount', 'live'],
		['characters', 'moves', 'states', 'items'],
		['export', 'library', 'trash'],
		['developer', 'about']
	];
	const navigation = groups
		.map((group) => available.filter(({ id }) => group.includes(id)))
		.filter((group) => group.length);
	const canReset = $derived(!workspaceCopy && !settingsNavigation.fromExport);
	const wide = new MediaQuery('(min-width: 660px) and (min-height: 520px)');
	const active = $derived(
		available.find(
			(section) =>
				section.id === (settingsNavigation.section ?? (wide.current ? available[0]?.id : null))
		)
	);
	let resetting = $state(false);
	let resetFailures = $state<WhisperKey[]>([]);
	let targetEntry = $state<string>();
	let panel: HTMLElement;
	let indexElement: HTMLElement;
	let search: HTMLInputElement;
	function homeFocusTarget() {
		// A touchscreen laptop can still report a fine primary pointer.
		return navigator.maxTouchPoints === 0 && matchMedia('(pointer: fine)').matches
			? search
			: indexElement;
	}
	onMount(() => {
		const stopWatching = watchCreationSettings();
		const entry = takeSettingsReturnFocus();
		void tick().then(() => {
			if (!search.isConnected) return;
			if (entry) panel.querySelector<HTMLElement>(`[data-setting="${entry}"] button`)?.focus();
			else homeFocusTarget().focus({ preventScroll: true });
		});
		return stopWatching;
	});
	// Wide Settings scrolls the page itself; compact Settings scrolls the sheet body.
	function scrollToTop() {
		panel.scrollTo(0, 0);
		panel.closest('.sheet-body')?.scrollTo(0, 0);
	}
	let previousSection: SettingsSection | null = null;
	$effect(() => {
		const section = settingsNavigation.section;
		if (previousSection && !section) {
			query = '';
			void tick().then(() => {
				scrollToTop();
				homeFocusTarget().focus({ preventScroll: true });
			});
		}
		previousSection = section;
	});
	function normalize(value: string, locale: string) {
		return value.toLocaleLowerCase(locale).normalize('NFD').replace(/\p{M}/gu, '');
	}
	const matches = $derived.by(() => {
		const locale = getLocale() || 'en';
		const words = normalize(query.trim(), locale).split(/\s+/);
		return available.flatMap((section) =>
			section.entries.flatMap((entry) => {
				if (entry.id === 'reset' && !canReset) return [];
				const text = normalize(
					[
						...[entry.label, ...('terms' in entry ? (entry.terms ?? []) : [])].map((key) => t(key)),
						...(entry.id === 'reset' ? [] : [t(section.label)]),
						...(entry.id === 'about' && $pwa.enabled ? [t('versionRow.checkForUpdates')] : []),
						...('names' in entry ? (entry.names ?? []) : [])
					].join(' '),
					locale
				);
				return words.every((word) => text.includes(word)) ? [{ section, entry }] : [];
			})
		);
	});

	async function show(section: SettingsSection | null, entry?: string) {
		if (entry === 'reset') {
			resetScope = 'all';
			return;
		}
		query = '';
		targetEntry = entry;
		settingsNavigation.section = section;
		await tick();
		scrollToTop();
		if (!section) {
			homeFocusTarget().focus({ preventScroll: true });
			return;
		}
		const row = entry && panel.querySelector<HTMLElement>(`[data-setting="${entry}"]`);
		const target =
			(row &&
				(row.querySelector<HTMLElement>('input:checked:not(:disabled)') ||
					row.querySelector<HTMLElement>(
						'button:not(:disabled), select:not(:disabled), input:not(:disabled)'
					) ||
					row)) ||
			panel.querySelector<HTMLElement>('h3');
		target?.focus();
	}

	async function confirmReset() {
		if (resetting || !resetScope) return;
		const scope = resetScope;
		resetting = true;
		try {
			resetFailures = await resetSettings(scope);
			if (!resetFailures.length) {
				closeReset();
				toast(message('settings.reset.done'));
				// The Reset that opened the dialog is now disabled at defaults, so focus cannot return to it.
				await tick();
				if (!document.activeElement?.closest('.settings-content'))
					(panel.querySelector<HTMLElement>('.settings-heading') ?? homeFocusTarget()).focus();
			}
		} finally {
			resetting = false;
		}
	}

	function closeReset() {
		resetScope = null;
		resetFailures = [];
	}
</script>

<div
	class={[
		'settings-content',
		{
			detail: Boolean(active),
			searching: Boolean(query.trim()),
			'fills-activity': active?.id === 'pixellab' && !query.trim()
		}
	]}
>
	<div class="settings-index" tabindex="-1" bind:this={indexElement}>
		<input
			class="bu-input input"
			type="search"
			readonly={busy || reviewingBackup}
			aria-label={t('settings.search')}
			placeholder={t('experience.placeholderSearch')}
			bind:this={search}
			bind:value={query}
		/>
		<div class="settings-links">
			<nav aria-label={t('export.sheet.settings')}>
				{#each navigation as group, index (group)}
					{#if index}<hr class="bu-separator" />{/if}
					{#each group as section (section.id)}
						<button
							class="row bu-action"
							data-variant="quiet"
							data-active={active?.id === section.id}
							aria-current={active?.id === section.id ? 'page' : undefined}
							disabled={busy}
							onclick={() => show(section.id)}
						>
							<section.icon size={18} aria-hidden="true" />
							<span class="row-name">{t(section.label)}</span>
							<SurfaceChevron />
						</button>
					{/each}
				{/each}
			</nav>
			{#if canReset}
				<div class="index-reset">
					<hr class="bu-separator" />
					<SettingsResetButton
						scope="all"
						labeled
						disabled={busy}
						onclick={() => (resetScope = 'all')}
					/>
				</div>
			{/if}
		</div>
	</div>
	<section
		class="settings-panel"
		aria-label={query.trim()
			? t('settings.search')
			: active
				? t(active.label)
				: t('export.sheet.settings')}
		bind:this={panel}
	>
		{#if query.trim()}
			{#each matches as { section, entry } (entry.id)}
				<button
					class="row bu-action search-result"
					data-variant="quiet"
					disabled={busy || (entry.id === 'reset' && settingsAtDefaults('all'))}
					onclick={() => show(section.id, entry.id)}
				>
					<span class="row-name"
						>{#if entry.id === 'reset'}{openerLabel(t(entry.label))}{:else}{t(entry.label)}<small
								class="bu-muted">{t(section.label)}</small
							>{/if}</span
					>
					<SurfaceChevron />
				</button>
			{:else}
				<p role="status" class="bu-muted">{t('settings.noResults')}</p>
			{/each}
		{:else if active}
			<div class="settings-panel-heading">
				<h3 class="settings-heading" tabindex="-1">{t(active.label)}</h3>
				{#if active.id === 'pixellab'}
					<div class="wide-reset">
						<SettingsResetButton
							scope="pixellab"
							disabled={busy}
							onclick={() => (forgetRevision = getKeyRevision())}
						/>
					</div>
				{:else if canReset && isResettableSection(active.id)}
					{@const scope = active.id}
					<div class="wide-reset">
						<SettingsResetButton {scope} disabled={busy} onclick={() => (resetScope = scope)} />
					</div>
				{/if}
			</div>
			{#if settingsNavigation.fromExport && settingsNavigation.section}
				<button
					class="row bu-action settings-index-link"
					data-variant="quiet"
					disabled={busy}
					onclick={() => show(null)}>{t('settings.all')}<SurfaceChevron /></button
				>
			{/if}
			{#if active.id === 'general'}
				<SettingsItemSegmented
					label={themeLabel}
					setting="theme"
					options={appearanceOptions}
					value={ui.theme}
					onselect={setTheme}
				>
					{#snippet icon()}<SunMoon size={18} aria-hidden="true" />{/snippet}
					{#snippet optionIcon(value)}
						{#if value === 'dark'}<Moon size={16} aria-hidden="true" />{:else}<Sun
								size={16}
								aria-hidden="true"
							/>{/if}
					{/snippet}
				</SettingsItemSegmented>
				<div data-setting="language" tabindex="-1"><LanguagePicker settings /></div>
			{:else if active.id === 'wardrobe'}
				<div data-setting="visibility" tabindex="-1">
					<WardrobeVisibility settings />
				</div>
			{:else if active.id === 'mount'}
				<MountSettings />
			{:else if active.id === 'live'}
				<LiveViewSettings />
			{:else if isCreationSection(active.id)}
				{#key active.id}<CreationSettings section={active.id} />{/key}
			{:else if active.id === 'export'}
				{#if store.project?.manifest}
					{@const name = characterName()}
					{@const namePlaceholder = '\uFFFC'}
					{@const [beforeName, afterName] = openerLabel(
						t('export.settings.openCharacter', { name: namePlaceholder })
					).split(namePlaceholder)}
					<SettingsItemButton
						disabled={busy}
						aria-haspopup="dialog"
						aria-label={openerLabel(t('export.settings.openCharacter', { name }))}
						onclick={openExport}
					>
						<Download size={18} aria-hidden="true" />
						<span class="export-character-label" aria-hidden="true"
							>{beforeName}<bdi>{name}</bdi>{afterName}</span
						>
						<SurfaceChevron />
					</SettingsItemButton>
				{/if}
				{@render exportSettings(targetEntry)}
			{:else if active.id === 'library'}
				<LibrarySettings bind:busy={libraryBusy} bind:reviewing={reviewingBackup} />
			{:else if active.id === 'trash'}
				<TrashSettings />
			{:else if active.id === 'developer'}
				<DeveloperSettings />
			{:else if active.id === 'about'}
				<AboutSettings />
			{:else}
				<PixelLabSettings bind:forgetRevision />
			{/if}
			{#if canReset && isResettableSection(active.id)}
				{@render compactReset(active.id)}
			{/if}
		{/if}
	</section>
</div>

{#snippet compactReset(scope: ResetScope)}
	<div class="compact-reset">
		<hr class="bu-separator" />
		<SettingsResetButton {scope} labeled disabled={busy} onclick={() => (resetScope = scope)} />
	</div>
{/snippet}

{#if resetScope}
	<ConfirmDialog
		title={resetScope === 'all'
			? t('settings.reset.title')
			: t('settings.reset.pageTitle', { page: t(settingsLabels[resetScope]) })}
		action={t(resetScope === 'all' ? 'settings.reset.action' : 'settings.reset.pageAction')}
		busyAction={t('common.preparing')}
		busy={resetting}
		problem={resetFailures.length
			? t('settings.reset.failed', { sections: resetFailures.map((key) => t(key)).join(', ') })
			: ''}
		oncancel={closeReset}
		onconfirm={confirmReset}
	>
		<div class="reset-description">
			<p>
				{t(resetScope === 'all' ? 'settings.reset.description' : 'settings.reset.pageDescription')}
			</p>
			<p>{t('settings.reset.kept')}</p>
		</div>
	</ConfirmDialog>
{/if}

<style>
	/* Reserve the Reset button's height so pages without one keep the same heading. */
	.settings-panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-block-size: var(--ctl-h);
	}
	.compact-reset {
		display: none;
	}
	.index-reset {
		display: grid;
		gap: 4px;
		margin-top: 12px;
	}
	@media (max-width: 659px), (max-height: 519px) {
		.settings-panel-heading {
			display: contents;
		}
		.wide-reset {
			display: none;
		}
		.compact-reset {
			display: grid;
			gap: 4px;
		}
	}
	.reset-description {
		display: grid;
		gap: 8px;
	}
	:global(dialog.sheet.settings-sheet.center) {
		width: min(640px, calc(100vw - 32px));
		height: min(720px, calc(100dvh - 32px));
	}
	:global(dialog.settings-sheet.bottom) {
		height: 100dvh;
		max-height: 100dvh;
	}
	:global(dialog.settings-sheet.side) {
		width: min(100%, 560px);
		height: 100dvh;
	}
	.settings-content,
	.settings-index,
	.settings-panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-content: start;
		min-width: 0;
		gap: 12px;
	}
	.settings-content {
		overflow-wrap: anywhere;
	}
	.settings-index input {
		width: 100%;
		min-width: 0;
	}
	.settings-heading {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}
	.settings-content :global(.row:not([popover] *)) {
		width: 100%;
		text-align: start;
		min-height: 44px;
	}
	.settings-content :global(.row-name:not([popover] *)) {
		white-space: normal;
	}
	.export-character-label {
		display: flex;
		flex: 1;
		min-inline-size: 0;
		white-space: pre-wrap;
	}
	.export-character-label bdi {
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	nav button[aria-current='page'] {
		font-weight: 700;
	}
	nav button :global(svg) {
		flex: none;
	}
	.settings-panel :global(.row:not([data-variant='field'], [popover] *)) {
		padding-inline: 0;
	}
	/* PixelLab: the recent-activity list takes whatever height the page leaves. */
	.fills-activity {
		flex: 1 0 auto;
		grid-template-rows: auto minmax(0, 1fr);
	}
	.fills-activity .settings-panel {
		display: flex;
		flex-direction: column;
	}
	.search-result small {
		display: block;
	}
	.detail .settings-links,
	.searching .settings-links {
		display: none;
	}
	@media (max-width: 659px), (max-height: 519px) {
		.settings-heading:not(:focus-visible) {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
	}
	@media (min-width: 660px) and (min-height: 520px) {
		/* Two columns scroll on their own, so a long page never carries the index away. The page adds no height of its
		   own, so the centered dialog grows to fit the whole index and stops at the window's sheet margin; a modal dialog is
		   inset on every side, so auto would stretch it. */
		:global(dialog.sheet.settings-sheet.center) {
			height: fit-content;
		}
		:global(.sheet-body:has(> .settings-content)) {
			padding: 0;
			overflow: hidden;
			scrollbar-gutter: auto;
		}
		.settings-content {
			flex: 1 1 auto;
			min-block-size: 0;
			grid-template-rows: minmax(0, 1fr);
		}
		.detail,
		.searching {
			grid-template-columns: minmax(280px, 1fr) minmax(0, 1.8fr);
			gap: 0;
		}
		/* The padding the body gave up keeps focus rings clear of each column's clipping edge. */
		.settings-index,
		.settings-panel {
			overflow: auto;
			overscroll-behavior: contain;
			padding-block: 18px;
		}
		.settings-index {
			padding-inline: 20px 12px;
		}
		.settings-panel {
			contain: size;
			padding-inline: 12px 20px;
			scrollbar-gutter: stable;
		}
		/* Search keeps the index in place, unseen, so the dialog does not shrink while typing. */
		.searching .settings-index {
			overflow: hidden;
		}
		.searching .settings-links {
			display: block;
			visibility: hidden;
		}
		.detail:not(.searching) .settings-links {
			display: block;
		}
		.settings-content .settings-index-link {
			display: none;
		}
	}
</style>
