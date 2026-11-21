<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { getLocale, t, type WhisperKey } from 'svelte-whisper';
	import { exportFormatNames } from './exportFormatNames.ts';
	import { workspaceCopy, workspaceUrl } from '../lib/store/workspace-mode.ts';
	import {
		Archive,
		CodeXml,
		Download,
		ExternalLink,
		Info,
		KeyRound,
		Moon,
		Settings2,
		Shirt,
		Sun,
		SunMoon
	} from './icons.ts';
	import { developerModeEnabled } from './developerMode.svelte.ts';
	import DeveloperSettings from './DeveloperSettings.svelte';
	import LanguagePicker from './LanguagePicker.svelte';
	import WardrobeVisibility from './WardrobeVisibility.svelte';
	import AboutSettings from './AboutSettings.svelte';
	import PixelLabSettings from './PixelLabSettings.svelte';
	import LibrarySettings from './LibrarySettings.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import {
		settingsLabels,
		settingsNavigation,
		type SettingsSection
	} from './settingsNavigation.svelte.ts';
	import { setTheme, ui } from './state.svelte.ts';

	let {
		exportSettings,
		busy,
		libraryBusy = $bindable(false)
	}: {
		exportSettings: Snippet<[string | undefined]>;
		busy: boolean;
		libraryBusy?: boolean;
	} = $props();
	const themeLabel = $derived(t('settings.theme'));
	const appearanceGroup = $props.id();
	const appearanceOptions = $derived([
		{ value: 'dark', label: t('settings.dark'), icon: Moon },
		{ value: 'light', label: t('settings.light'), icon: Sun }
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
						'connectSheet.aPIKey',
						'connectSheet.forgetKey'
					]
				},
				{ id: 'recent-activity', label: 'activity.title' }
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
				{ id: 'language', label: 'language.label' }
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
				{ id: 'restore', label: 'librarySettings.restoreFromBackup' }
			]
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
		(section) => !workspaceCopy || !['pixellab', 'library', 'developer'].includes(section.id)
	);
	const groups: SettingsSection[][] = [
		['pixellab'],
		['general', 'wardrobe'],
		['export', 'library'],
		['developer', 'about']
	];
	const navigation = groups
		.map((group) => available.filter(({ id }) => group.includes(id)))
		.filter((group) => group.length);
	const wide = new MediaQuery('(min-width: 660px) and (min-height: 520px)');
	const active = $derived(
		available.find(
			(section) => section.id === (settingsNavigation.section ?? (wide.current ? 'general' : null))
		)
	);
	let query = $state('');
	let reviewingBackup = $state(false);
	let targetEntry = $state<string>();
	let panel: HTMLElement;
	let search: HTMLInputElement;
	let previousSection: SettingsSection | null = null;
	$effect(() => {
		const section = settingsNavigation.section;
		if (previousSection && !section) {
			query = '';
			void tick().then(() => {
				panel.closest('.sheet-body')?.scrollTo(0, 0);
				search.focus({ preventScroll: true });
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
				const text = normalize(
					[
						...[section.label, entry.label, ...('terms' in entry ? (entry.terms ?? []) : [])].map(
							(key) => t(key)
						),
						...('names' in entry ? (entry.names ?? []) : [])
					].join(' '),
					locale
				);
				return words.every((word) => text.includes(word)) ? [{ section, entry }] : [];
			})
		);
	});

	async function show(section: SettingsSection | null, entry?: string) {
		query = '';
		targetEntry = entry;
		settingsNavigation.section = section;
		await tick();
		panel.closest('.sheet-body')?.scrollTo(0, 0);
		if (!section) {
			search.focus({ preventScroll: true });
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
</script>

<div class={['settings-content', { detail: Boolean(active), searching: Boolean(query.trim()) }]}>
	<div class="settings-index">
		<input
			class="bu-input input"
			type="search"
			readonly={busy || reviewingBackup}
			aria-label={t('settings.search')}
			placeholder={t('experience.placeholderSearch')}
			bind:this={search}
			bind:value={query}
		/>
		{#if !query.trim()}
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
			</div>
		{/if}
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
					disabled={busy}
					onclick={() => show(section.id, entry.id)}
				>
					<span class="row-name"
						>{t(entry.label)}<small class="bu-muted">{t(section.label)}</small></span
					>
					<SurfaceChevron />
				</button>
			{:else}
				<p role="status" class="bu-muted">{t('settings.noResults')}</p>
			{/each}
		{:else if active}
			<h3 class="settings-heading" tabindex="-1">{t(active.label)}</h3>
			{#if settingsNavigation.fromExport && settingsNavigation.section}
				<button
					class="row bu-action settings-index-link"
					data-variant="quiet"
					disabled={busy}
					onclick={() => show(null)}>{t('settings.all')}<SurfaceChevron /></button
				>
			{/if}
			{#if active.id === 'general'}
				<div class="appearance-row" data-setting="theme">
					<span class="appearance-label"><SunMoon size={18} aria-hidden="true" /> {themeLabel}</span
					>
					<div class="appearance-options" role="radiogroup" aria-label={themeLabel}>
						{#each appearanceOptions as { value, label, icon: Icon } (value)}
							<label class="appearance-option">
								<input
									type="radio"
									name={appearanceGroup}
									{value}
									checked={ui.theme === value}
									onchange={() => setTheme(value)}
								/>
								<Icon size={14} aria-hidden="true" />
								<span>{label}</span>
							</label>
						{/each}
					</div>
				</div>
				<div data-setting="language" tabindex="-1"><LanguagePicker /></div>
			{:else if active.id === 'wardrobe'}
				<div data-setting="visibility" tabindex="-1">
					<WardrobeVisibility scope="global" />
				</div>
			{:else if active.id === 'export'}
				{@render exportSettings(targetEntry)}
			{:else if active.id === 'library'}
				<LibrarySettings bind:busy={libraryBusy} bind:reviewing={reviewingBackup} />
			{:else if active.id === 'developer'}
				<DeveloperSettings>
					{#snippet tools()}
						{#if !workspaceCopy}
							<button
								class="row bu-action"
								data-variant="quiet"
								type="button"
								onclick={() => {
									if (developerModeEnabled())
										window.open(workspaceUrl(true), '_blank', 'noopener,noreferrer');
								}}
							>
								<Archive size={18} aria-hidden="true" />
								<span class="row-name">{t('workspaceCopy.title')}</span>
								<ExternalLink size={16} aria-hidden="true" />
							</button>
						{/if}
					{/snippet}
				</DeveloperSettings>
			{:else if active.id === 'about'}
				<AboutSettings />
			{:else}
				<PixelLabSettings />
			{/if}
		{/if}
	</section>
</div>

<style>
	:global(dialog.settings-sheet.center) {
		height: min(540px, calc(100dvh - 32px));
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
		align-content: start;
		min-width: 0;
		gap: 12px;
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
	.appearance-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0 10px;
	}
	.appearance-label {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
	}
	.appearance-label :global(svg) {
		flex: none;
	}
	.appearance-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0 16px;
	}
	.appearance-option {
		display: flex;
		align-items: center;
		min-block-size: 44px;
		gap: 4px;
		cursor: pointer;
	}
	.settings-content :global(.row) {
		width: 100%;
		text-align: start;
		min-height: 44px;
	}
	.settings-content :global(.row-name) {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	nav button[aria-current='page'] {
		font-weight: 700;
	}
	nav button :global(svg) {
		flex: none;
	}
	.settings-panel :global(.row:not([data-variant='field'])) {
		padding-inline: 0;
	}
	.search-result small {
		display: block;
	}
	.detail:not(.searching) .settings-links {
		display: none;
	}
	@media (max-width: 659px), (max-height: 519px) {
		.settings-heading {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
	}
	@media (min-width: 660px) and (min-height: 520px) {
		.detail,
		.searching {
			grid-template-columns: minmax(248px, 1fr) minmax(0, 1.8fr);
			gap: 24px;
		}
		.detail:not(.searching) .settings-links {
			display: block;
		}
		.settings-content .settings-index-link {
			display: none;
		}
	}
</style>
