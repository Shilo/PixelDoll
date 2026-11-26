<script lang="ts">
	// The More menu: one instance at a time, in the top bar or in the New character screen's own bar while that
	// screen covers it (a modal makes everything outside it inert), so Full screen and More are always in reach.
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import LanguagePicker from './LanguagePicker.svelte';
	import { openSettings, SETTINGS_KEYS } from './settingsNavigation.svelte.ts';
	import KeyShortcut, { ariaShortcut } from './KeyShortcut.svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import { app } from '../lib/app.svelte.ts';
	import { repository } from '../lib/repository.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { popoverFocus } from './experience/focus.ts';
	import { experience } from './experience/state.svelte.ts';
	import { replayDemoTips } from './experience/demoTips.svelte.ts';
	import DemoCopyRow from './DemoCopyRow.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import FullscreenButton from './FullscreenButton.svelte';
	import MenuDisclosure from './MenuDisclosure.svelte';
	import WardrobeVisibility from './WardrobeVisibility.svelte';
	import AffiliationNotice from './AffiliationNotice.svelte';
	import LibraryBackupButton from './LibraryBackupButton.svelte';
	import { downloadLibraryBackupWithFeedback } from './downloadLibraryBackup.ts';
	import PixelLabUsage from './PixelLabUsage.svelte';
	import { queue } from '../lib/pixellab/queue.ts';
	import { pwa, installApp, requestUpdate, requestInstallHelp } from '../lib/pwa.ts';
	import { sharedItemsHidden } from './wardrobeVisibility.svelte.ts';
	import { historyText } from './historyText.ts';
	import { activityStatus } from './activityStatus.svelte.ts';
	import { ui, doc, store, undo, redo, randomize } from './state.svelte.ts';
	import {
		Archive,
		MonitorDown,
		BookOpen,
		Bug,
		ExternalLink,
		CircleHelp,
		Lightbulb,
		RefreshCw,
		Share2,
		Settings2,
		KeyRound,
		Redo2,
		Undo2,
		Activity,
		Dices,
		Download,
		Grid2x2,
		PawPrint,
		Shirt
	} from './icons.ts';

	/** `creator`: the New character screen, which has no character actions to move here. */
	let { context = 'screen' }: { context?: 'screen' | 'creator' } = $props();
	const studio = $derived(experience.screen === 'studio' && context === 'screen');
	const m = $derived(store.project?.manifest);
	const undoText = $derived(historyText('undo'));
	const redoText = $derived(historyText('redo'));
	const closeOptions = () => document.getElementById('experience-options')?.hidePopover();
</script>

<div
	id="experience-options"
	class="menu options-menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	ontoggle={(event) => popoverFocus(event)}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		<button
			class="row bu-action"
			data-variant="quiet"
			aria-haspopup="dialog"
			onclick={() => {
				closeOptions();
				ui.sheet = 'connect';
			}}
		>
			{#if app.key && !app.keyRejected}
				<PixelLabUsage compact />
			{:else}
				<KeyRound size={18} />
				<span class="row-name"
					>{openerLabel(
						t(app.keyRejected ? 'connectSheet.reconnect' : 'connectSheet.titleConnectPixelLab')
					)}</span
				>
				<SurfaceChevron />
			{/if}
		</button>
		<hr />
		<!-- Character actions: demo editing and actions moved from the toolbar on smaller screens. -->
		{#if studio}<DemoCopyRow id={doc.id} close={closeOptions} />{/if}
		{#if studio}<button
				class="row bu-action mobile-random"
				data-variant="quiet"
				disabled={!m}
				onclick={() => {
					closeOptions();
					randomize();
				}}><Dices size={18} /><span class="row-name">{t('common.randomLook')}</span></button
			>{/if}
		{#if studio}<button
				class="row bu-action mobile-undo"
				data-variant="quiet"
				disabled={!undoText}
				onclick={() => {
					closeOptions();
					undo();
				}}><Undo2 size={18} /><span class="row-name">{undoText ?? t('common.undo')}</span></button
			>{/if}
		{#if studio}<button
				class="row bu-action mobile-redo"
				data-variant="quiet"
				disabled={!redoText}
				onclick={() => {
					closeOptions();
					redo();
				}}><Redo2 size={18} /><span class="row-name">{redoText ?? t('common.redo')}</span></button
			>{/if}
		{#if studio}<button
				class="row bu-action mobile-share"
				data-variant="quiet"
				disabled={!m}
				onclick={() => {
					closeOptions();
					document.getElementById('share-popover')?.showPopover();
				}}
				><Share2 size={18} /><span class="row-name">{openerLabel(t('common.share'))}</span
				><SurfaceChevron /></button
			>{/if}
		{#if studio}<button
				class="row bu-action mobile-export"
				data-variant="quiet"
				aria-haspopup="dialog"
				disabled={!m}
				onclick={() => {
					closeOptions();
					ui.sheet = 'export';
				}}
				><Download size={18} /><span class="row-name">{openerLabel(t('toolbar.export'))}</span
				><SurfaceChevron /></button
			>{/if}
		{#if studio}<FullscreenButton row onactivate={closeOptions} />{/if}
		<!-- Narrow phones move Inspect here from the playback bar so its controls keep full-size targets. -->
		{#if studio && experience.mode === 'preview'}<button
				class="row bu-action mobile-inspect"
				data-variant="quiet"
				aria-label={t('experience.inspect')}
				disabled={!m}
				onclick={() => {
					closeOptions();
					ui.sheet = 'inspect';
				}}
				><Grid2x2 size={18} /><span class="row-name">{openerLabel(t('experience.inspect'))}</span
				><SurfaceChevron /></button
			>{/if}
		{#if studio && experience.mode === 'preview'}<button
				class="row bu-action mobile-mount"
				data-variant="quiet"
				aria-haspopup="dialog"
				disabled={!m}
				onclick={() => {
					closeOptions();
					openSettings('mount');
				}}
				><PawPrint size={18} /><span class="row-name"
					>{openerLabel(t('toolbar.mountSettings'))}</span
				><SurfaceChevron /></button
			>{/if}
		{#if studio}<hr class={{ 'mobile-sep': !doc.id.startsWith('fixture:') }} />{/if}
		<button
			class="row bu-action"
			data-variant="quiet"
			aria-haspopup="dialog"
			aria-keyshortcuts={ariaShortcut(SETTINGS_KEYS)}
			onclick={() => {
				closeOptions();
				openSettings();
			}}
			><Settings2 size={18} aria-hidden="true" /><span class="row-name"
				>{openerLabel(t('export.sheet.settings'))}</span
			><KeyShortcut keys={SETTINGS_KEYS} class="row-aside faint small" /><SurfaceChevron /></button
		>
		<LanguagePicker />
		<MenuDisclosure sectionKey="more-wardrobe-settings" label={t('toolbar.wardrobeSettings')}>
			{#snippet icon()}<Shirt size={18} aria-hidden="true" />{/snippet}
			{#snippet aside()}
				{#if sharedItemsHidden(doc.id)}
					<span class="row-aside wardrobe-status faint small">{t('toolbar.ownItemsOnly')}</span>
				{/if}
			{/snippet}
			<WardrobeVisibility />
		</MenuDisclosure>
		<hr />
		{#if !workspaceCopy}
			<LibraryBackupButton menu onbackup={downloadLibraryBackupWithFeedback} />
		{/if}
		<button
			class="row bu-action"
			data-variant="quiet"
			onclick={() => {
				closeOptions();
				ui.sheet = 'activity';
			}}
			><Activity size={18} /><span class="row-name">{openerLabel(t('activity.title'))}</span
			>{#if $queue.role === 'follower'}<span class="small">{t('toolbar.otherTab')}</span
				>{/if}{#if activityStatus.stopped}<span class="badge danger"
					>{formatNumber(activityStatus.stopped)}</span
				>{:else if activityStatus.active}<span class="badge accent"
					>{formatNumber(activityStatus.active)}</span
				>{/if}<SurfaceChevron /></button
		>
		{#if workspaceCopy}
			<button
				class="row bu-action"
				data-variant="quiet"
				aria-haspopup="dialog"
				onclick={() => {
					closeOptions();
					ui.sheet = 'workspaceReport';
				}}
				><Archive size={18} /><span class="row-name"
					>{openerLabel(t('workspace.activityTitle'))}</span
				><SurfaceChevron /></button
			>
		{/if}
		<!-- App actions: installation, updates, and help. -->
		{#if import.meta.env.PROD && !$pwa.installed && ($pwa.installable || $pwa.installing)}
			<button
				class="row bu-action"
				data-variant="quiet"
				disabled={$pwa.installing}
				onclick={() => {
					void installApp();
				}}
				><MonitorDown size={18} /><span class="row-name">{t('pwaRuntime.installPixelDoll')}</span
				></button
			>
		{/if}
		{#if $pwa.available}<button
				class="row bu-action"
				data-variant="quiet"
				disabled={!$pwa.ready}
				onclick={() => requestUpdate()}
				><RefreshCw size={18} /><span class="row-name"
					>{t('toolbar.updateToVVersion', { version: $pwa.available.version })}</span
				></button
			>{/if}
		<button
			class="row bu-action"
			data-variant="quiet"
			popovertarget="help-options"
			aria-controls="help-options"
		>
			<CircleHelp size={18} aria-hidden="true" />
			<span class="row-name">{openerLabel(t('toolbar.help'))}</span>
			<SurfaceChevron />
		</button>
		<div
			id="help-options"
			class="menu bu-popover-anchor"
			data-placement="bottom-end"
			popover
			role="group"
			aria-label={t('toolbar.help')}
			ontoggle={(event) => popoverFocus(event)}
		>
			<PopoverArrow />
			<div class="menu-surface bu-popover-surface bu-floating">
				{#if !workspaceCopy}<button
						class="row bu-action"
						data-variant="quiet"
						onclick={() => {
							closeOptions();
							replayDemoTips();
						}}
						><Lightbulb size={18} aria-hidden="true" /><span class="row-name"
							>{t('demoTips.replay')}</span
						></button
					>{/if}
				<a
					class="row bu-action"
					data-variant="quiet"
					href={`${repository}/blob/main/docs/user-guide.md`}
					target="_blank"
					rel="noopener"
					onclick={closeOptions}
					><BookOpen size={18} /><span class="row-name">{t('toolbar.userGuide')}</span><ExternalLink
						size={16}
						aria-hidden="true"
					/></a
				>
				<a
					class="row bu-action"
					data-variant="quiet"
					href={`${repository}/issues/new?template=problem-report.yml`}
					target="_blank"
					rel="noreferrer"
					aria-labelledby="problem-report-label"
					aria-describedby="problem-report-notice"
					onclick={closeOptions}
				>
					<Bug size={18} aria-hidden="true" />
					<span class="row-name">
						<span id="problem-report-label">{t('toolbar.reportProblem')}</span>
						<span id="problem-report-notice" class="row-reason bu-muted"
							>{t('toolbar.reportProblemNotice')}</span
						>
					</span>
					<ExternalLink size={16} aria-hidden="true" />
				</a>
				{#if import.meta.env.PROD && !workspaceCopy}
					<button class="row bu-action" data-variant="quiet" onclick={requestInstallHelp}>
						<MonitorDown size={18} /><span class="row-name"
							>{openerLabel(t('pwaRuntime.installationHelp'))}</span
						>
						<SurfaceChevron />
					</button>
				{/if}
			</div>
		</div>
		<!-- Attribution footer: keep this below the app links. -->
		<AffiliationNotice />
	</div>
</div>

<style>
	@container (max-width: 300px) {
		.wardrobe-status {
			display: none;
		}
	}
</style>
