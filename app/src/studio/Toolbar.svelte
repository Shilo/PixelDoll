<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import LanguagePicker from './LanguagePicker.svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	import { app } from '../lib/app.svelte.ts';
	import { workspaceCopy, workspaceUrl } from '../lib/store/workspace-mode.ts';
	import { popoverFocus } from './experience/focus.ts';
	import { tick } from 'svelte';
	import { experience, characters, setMode, type WorldMode } from './experience/state.svelte.ts';
	import CharacterThumb from './experience/CharacterThumb.svelte';
	import SharePopover from './SharePopover.svelte';
	import CharacterActions from './CharacterActions.svelte';
	import CharacterName from './CharacterName.svelte';
	import DemoCopyRow from './DemoCopyRow.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import NewCharacterButton from './NewCharacterButton.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import MenuDisclosure from './MenuDisclosure.svelte';
	import WardrobeVisibility from './WardrobeVisibility.svelte';
	import ApiPeek from './ApiPeek.svelte';
	import FullscreenButton from './FullscreenButton.svelte';
	import AffiliationNotice from './AffiliationNotice.svelte';
	import PixelLabUsage from './PixelLabUsage.svelte';
	import VersionRow from './VersionRow.svelte';
	import { queue } from '../lib/pixellab/queue.ts';
	import { pwa, installApp, requestUpdate, requestInstallHelp } from '../lib/pwa.ts';
	import { characterFacts } from './model.ts';
	import { sharedItemsHidden } from './wardrobeVisibility.svelte.ts';
	import {
		ui,
		doc,
		store,
		creates,
		settingUp,
		gens,
		openProject,
		openRename,
		undo,
		redo,
		randomize,
		refreshProjects,
		characterName,
		toggleTheme,
		isDemo,
		stoppedWork
	} from './state.svelte.ts';
	import {
		Archive,
		CircleAlert,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Download,
		FileArchive,
		MonitorDown,
		BookOpen,
		ExternalLink,
		CircleHelp,
		RefreshCw,
		Share2,
		Ellipsis,
		KeyRound,
		Redo2,
		Sun,
		Moon,
		Undo2,
		House,
		Activity,
		Pencil,
		PersonStanding,
		Copy,
		Dices,
		Eye,
		Layers2,
		Mountain,
		Grid2x2,
		PawPrint,
		Shirt
	} from './icons.ts';

	const m = $derived(store.project?.manifest);
	const facts = $derived(m && characterFacts(m));
	const name = $derived(characterName());
	let mountMenuOpen = $state(false);
	const prompt = $derived(m?.items.find((it) => it.id === m.rig.baseItem)?.prompt ?? '');
	const characterCount = $derived(store.projects.filter((p) => !p.dev).length);
	const VIEWS = [
		['preview', 'toolbar.viewPreview', Eye],
		['topdown', 'toolbar.viewTopDown', Layers2],
		['side', 'toolbar.viewSide', Mountain]
	] as const;
	async function changeMode(mode: WorldMode) {
		setMode(mode);
		await tick();
		focusWorld();
	}
	function focusWorld() {
		document.querySelector<HTMLElement>('.world-stage')?.focus({ preventScroll: true });
	}
	function resumeWorldAfterPointer(header: HTMLElement) {
		const clicked = async (event: MouseEvent) => {
			const button = event.target instanceof Element ? event.target.closest('button') : null;
			if (event.detail === 0 || !button || button.hasAttribute('popovertarget')) return;
			await tick();
			if (
				experience.screen !== 'studio' ||
				ui.sheet ||
				document.querySelector('dialog[open], [popover]:popover-open') ||
				(document.activeElement !== button && document.activeElement !== document.body)
			)
				return;
			focusWorld();
		};
		header.addEventListener('click', clicked);
		return () => header.removeEventListener('click', clicked);
	}
	let copyFeedback = $state<'copied' | 'failed' | null>(null);
	const copyMessage = $derived(
		copyFeedback === 'copied'
			? t('toolbar.copiedPrompt')
			: copyFeedback === 'failed'
				? t('toolbar.selectPromptToCopy')
				: t('toolbar.copyPrompt')
	);
	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			copyFeedback = 'copied';
		} catch {
			copyFeedback = 'failed';
		}
	}
	const devRigs = $derived(import.meta.env.DEV ? store.projects.filter((p) => p.dev) : []);
	const active = $derived($queue.counts.running + $queue.counts.pending);
	const busy = $derived(
		active > 0 ||
			gens.some((g) => g.phase === 'running') ||
			creates.some((run) => run.running && !run.error) ||
			(!!settingUp.spec && !settingUp.done && !settingUp.error)
	);
	const stopped = $derived(stoppedWork());
	const undoLabel = $derived(doc.undo.at(-1)?.label);
	const redoLabel = $derived(doc.redo.at(-1)?.label);
	const undoText = $derived(
		undoLabel && t('toolbar.undoAction', { action: displayMessage(undoLabel) })
	);
	const redoText = $derived(
		redoLabel && t('toolbar.redoAction', { action: displayMessage(redoLabel) })
	);
	let menu: HTMLElement;
	const close = () => menu?.hidePopover?.();
	const pick = (id: string) => {
		close();
		if (id !== doc.id) void openProject(id);
	};
	const closeOptions = () => document.getElementById('experience-options')?.hidePopover();
	const sheet = (s: typeof ui.sheet) => {
		close();
		ui.sheet = s;
	};
	/** Prefer centering the view switch over the character (the stage's middle), not the window; stay clear of the
	 *  name and the actions, and fall back to the bar's center when there is no room. Floating rows (phones,
	 *  sheets) are positioned by CSS and are left alone. */
	function centerOnStage(node: HTMLElement) {
		const header = node.parentElement!;
		const update = () => {
			node.style.removeProperty('--view-shift');
			if (getComputedStyle(node).position === 'absolute') return;
			const css = getComputedStyle(node),
				stageCenter =
					(parseFloat(css.getPropertyValue('--stage-left')) +
						innerWidth -
						parseFloat(css.getPropertyValue('--stage-right'))) /
					2;
			// The side columns stretch to fill the grid, so measure the controls inside them, not the columns.
			const visible = (selector: string) =>
				[...(header.querySelector(selector)?.children ?? [])]
					.map((el) => el.getBoundingClientRect())
					.filter((r) => r.width > 0);
			const box = node.getBoundingClientRect(),
				start = visible('.header-start'),
				end = visible('.header-actions');
			if (!Number.isFinite(stageCenter) || !start.length || !end.length) return;
			const gap = 12,
				min = Math.max(...start.map((r) => r.right)) + gap - box.left,
				max = Math.min(...end.map((r) => r.left)) - gap - box.right;
			if (min > max) return;
			const shift = Math.min(max, Math.max(min, stageCenter - (box.left + box.width / 2)));
			node.style.setProperty('--view-shift', `${Math.round(shift)}px`);
		};
		const observer = new ResizeObserver(update);
		for (const el of [header, ...header.children]) observer.observe(el);
		addEventListener('resize', update);
		update();
		return () => {
			observer.disconnect();
			removeEventListener('resize', update);
		};
	}
</script>

<header class="experience-header" {@attach resumeWorldAfterPointer}>
	<div class="header-start">
		{#if experience.screen === 'studio'}<button
				class="bu-action header-back"
				data-variant="quiet"
				aria-label={t('common.characters')}
				title={t('common.characters')}
				onclick={characters}><ChevronLeft size={20} /></button
			><!-- The page heading sits beside the menu button: a heading is not allowed inside a button. -->
			<h1 class="sr">{name}</h1>
			<button
				class="name-menu project-btn"
				popovertarget="project-menu"
				aria-haspopup="menu"
				onclick={() => void refreshProjects()}
				><span class="name-line"
					><span class="name-text"><CharacterName id={doc.id} {name} /></span>
					<ChevronDown size={16} aria-hidden="true" /></span
				>{#if facts}<span class="name-facts"
						>{t('sizePreview.frame', { measure: facts.frame })} · {facts.counts
							.map(displayMessage)
							.join(' · ')}</span
					>{/if}</button
			>{:else}<span class="brand"><PersonStanding size={20} />PixelDoll</span><span
				class="brand-divider"
				aria-hidden="true"
			></span>
			<h1 class="screen-title">{t('common.characters')}</h1>
			<span class="screen-count num"
				><span aria-hidden="true">{formatNumber(characterCount)}</span><span class="sr"
					>{t('toolbar.characterCount', {
						count: characterCount,
						n: formatNumber(characterCount)
					})}</span
				></span
			>{/if}
	</div>
	{#if experience.screen === 'studio'}
		<!-- A view switch over one stage, not tabs with panels: pressed toggle buttons. -->
		<div
			class="view-modes"
			role="group"
			aria-label={t('toolbar.characterView')}
			{@attach centerOnStage}
		>
			{#each VIEWS as [id, labelKey, Icon] (id)}
				{@const label = t(labelKey)}
				<button
					class="bu-action"
					data-variant="tab"
					aria-pressed={experience.mode === id}
					aria-controls="world-stage"
					aria-label={label}
					title={label}
					onclick={() => changeMode(id)}
					><span class="bu-tab-label"
						><Icon size={18} aria-hidden="true" /><span
							class="view-label bu-tab-text"
							data-text={label}>{label}</span
						></span
					></button
				>{/each}
		</div>
	{/if}
	<div class="header-actions">
		{#if experience.screen === 'characters'}
			<NewCharacterButton />
		{:else}
			<button
				class="bu-action test-mount-toggle"
				data-variant="quiet"
				aria-label={t('toolbar.mountSettings')}
				data-active={experience.testMount || undefined}
				aria-expanded={mountMenuOpen}
				title={experience.testMount
					? t('toolbar.titleMountSettingsMounted')
					: t('toolbar.mountSettings')}
				popovertarget="mount-options"
				disabled={!m}><PawPrint size={18} aria-hidden="true" /></button
			>
			<button
				class="bu-action header-random"
				data-variant="quiet"
				aria-label={t('common.randomLook')}
				title={t('toolbar.titleRandomLookItemsAndColors')}
				disabled={!m}
				onclick={randomize}><Dices size={18} /></button
			>
			<button
				class="bu-action header-undo"
				data-variant="quiet"
				aria-label={undoText ?? t('common.undo')}
				title={undoText ?? t('common.undo')}
				disabled={!undoLabel}
				onclick={undo}><Undo2 size={18} /></button
			>
			<button
				class="bu-action header-redo"
				data-variant="quiet"
				aria-label={redoText ?? t('common.redo')}
				title={redoText ?? t('common.redo')}
				disabled={!redoLabel}
				onclick={redo}><Redo2 size={18} /></button
			>
			<button
				class="bu-action header-share"
				data-variant="outline"
				aria-label={t('toolbar.shareCharacter')}
				title={t('common.share')}
				popovertarget="share-popover"
				disabled={!m}
				><Share2 size={16} /><span>{openerLabel(t('common.share'))}</span><SurfaceChevron /></button
			>
			<button
				class="bu-action header-export"
				data-variant="outline"
				aria-label={t('toolbar.export')}
				title={t('toolbar.export')}
				onclick={() => (ui.sheet = 'export')}
				disabled={!m}
				><Download size={16} /><span>{openerLabel(t('toolbar.export'))}</span><SurfaceChevron
				/></button
			>
		{/if}
		{#if busy}<button
				class="bu-action"
				data-variant="quiet"
				aria-label={t('activity.title')}
				title={t('activity.title')}
				onclick={() => (ui.sheet = 'activity')}
				><span class="bu-ring ring spin"></span><span class="num">{active || ''}</span></button
			>{:else if stopped}<button
				class="bu-action stopped-work"
				data-variant="quiet"
				aria-label={t('activity.title')}
				title={t('generation.status.needsAttention')}
				onclick={() => (ui.sheet = 'activity')}
				><CircleAlert size={18} /><span class="num">{stopped}</span></button
			>{/if}
		<FullscreenButton />
		<button
			class="bu-action"
			data-variant="quiet"
			aria-label={t('toolbar.moreOptions')}
			title={t('toolbar.moreOptions')}
			data-popover-fallback="share-popover"
			popovertarget="experience-options"><Ellipsis size={20} /></button
		>
	</div>
</header>
<SharePopover />
{#if experience.screen === 'studio'}
	<div
		id="mount-options"
		class="menu options-menu bu-popover-anchor"
		data-placement="bottom-end"
		popover
		ontoggle={(event) => {
			mountMenuOpen = event.newState === 'open';
			popoverFocus(event);
		}}
	>
		<PopoverArrow />
		<div class="menu-surface bu-popover-surface bu-floating">
			<div class="menu-prompt">
				<p class="menu-sec">{t('toolbar.mountSettings')}</p>
			</div>
			<label class="row bu-check" for="show-mount"
				><span class="row-name">{t('toolbar.showMount')}</span><input
					id="show-mount"
					class="bu-switch"
					type="checkbox"
					role="switch"
					bind:checked={experience.testMount}
				/></label
			>
			<div class="menu-prompt">
				<label class="row" for="mount-legs"
					><span class="row-name">{t('toolbar.hideLegs')}</span><select
						id="mount-legs"
						class="bu-input mount-leg-select"
						bind:value={experience.mountLegs}
						disabled={!experience.testMount}
						aria-describedby="mount-legs-note"
						><option value="none">{t('common.none')}</option><option value="far"
							>{t('toolbar.farLeg')}</option
						><option value="both">{t('toolbar.bothLegs')}</option></select
					></label
				>
				<p id="mount-legs-note" class="menu-prompt-text faint small">
					{#if experience.testMount && experience.mountLegIssue}
						{experience.mountLegIssue}
					{:else if experience.mountLegs === 'both'}
						{t('toolbar.cutsBelowTheHipsHandsMayBe')}
					{:else if experience.mountLegs === 'far'}
						{t('toolbar.anApproximateCutoutMayHideClothingOr')}
					{/if}
				</p>
			</div>
		</div>
	</div>
{/if}
<div
	id="experience-options"
	class="menu options-menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	ontoggle={(event) => popoverFocus(event)}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		{#if !workspaceCopy}<button
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
		{/if}
		<!-- Character actions: demo editing and actions moved from the toolbar on smaller screens. -->
		{#if experience.screen === 'studio'}<DemoCopyRow id={doc.id} close={closeOptions} />{/if}
		{#if experience.screen === 'studio'}<button
				class="row bu-action mobile-random"
				data-variant="quiet"
				disabled={!m}
				onclick={() => {
					closeOptions();
					randomize();
				}}><Dices size={18} /><span class="row-name">{t('common.randomLook')}</span></button
			>{/if}
		{#if experience.screen === 'studio'}<button
				class="row bu-action mobile-undo"
				data-variant="quiet"
				disabled={!undoLabel}
				onclick={() => {
					closeOptions();
					undo();
				}}><Undo2 size={18} /><span class="row-name">{undoText ?? t('common.undo')}</span></button
			>{/if}
		{#if experience.screen === 'studio'}<button
				class="row bu-action mobile-redo"
				data-variant="quiet"
				disabled={!redoLabel}
				onclick={() => {
					closeOptions();
					redo();
				}}><Redo2 size={18} /><span class="row-name">{redoText ?? t('common.redo')}</span></button
			>{/if}
		{#if experience.screen === 'studio'}<button
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
		<!-- Narrow phones move Inspect here from the playback bar so its controls keep full-size targets. -->
		{#if experience.screen === 'studio' && experience.mode === 'preview'}<button
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
		{#if experience.screen === 'studio'}<hr
				class={{ 'mobile-sep': !doc.id.startsWith('fixture:') }}
			/>{/if}
		<LanguagePicker />
		<!-- Preferences: change how the Studio looks or what the Wardrobe shows. -->
		<MenuDisclosure sectionKey="more-wardrobe-settings" label={t('toolbar.wardrobeSettings')}>
			{#snippet icon()}<Shirt size={18} aria-hidden="true" />{/snippet}
			{#snippet aside()}
				{#if sharedItemsHidden(doc.id)}
					<span class="row-aside wardrobe-status faint small">{t('toolbar.ownItemsOnly')}</span>
				{/if}
			{/snippet}
			<WardrobeVisibility />
		</MenuDisclosure>
		<button
			class="row bu-action"
			data-variant="quiet"
			onclick={() => {
				toggleTheme();
				closeOptions();
			}}
			>{#if ui.theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}<span
				class="row-name"
				>{ui.theme === 'dark' ? t('toolbar.lightMode') : t('toolbar.darkMode')}</span
			></button
		>
		<hr />
		<!-- Diagnostics: inspect generation activity and API requests. -->
		<button
			class="row bu-action"
			data-variant="quiet"
			onclick={() => {
				closeOptions();
				ui.sheet = 'activity';
			}}
			><Activity size={18} /><span class="row-name">{openerLabel(t('activity.title'))}</span
			>{#if $queue.role === 'follower'}<span class="small">{t('toolbar.otherTab')}</span
				>{/if}<SurfaceChevron /></button
		>
		<ApiPeek scope="all" all menu />
		<hr />
		{#if !workspaceCopy}
			<!-- Workspace: export or open a copy independently of the active character. -->
			<button class="row bu-action" data-variant="quiet" popovertarget="workspace-options">
				<Archive size={18} />
				<span class="row-name">{openerLabel(t('toolbar.workspace'))}</span>

				<SurfaceChevron /></button
			>
			<div
				id="workspace-options"
				class="menu bu-popover-anchor"
				data-placement="bottom-end"
				popover
				role="group"
				aria-label={t('toolbar.workspaceActions')}
				ontoggle={(event) => popoverFocus(event)}
			>
				<PopoverArrow />
				<div class="menu-surface bu-popover-surface bu-floating">
					<button
						class="row bu-action"
						data-variant="quiet"
						onclick={() => {
							closeOptions();
							ui.sheet = 'workspaceExport';
						}}
						><Download size={18} /><span class="row-name"
							>{openerLabel(t('workspace.exportTitle'))}</span
						><SurfaceChevron /></button
					>
					<a
						class="row bu-action"
						data-variant="quiet"
						href={workspaceUrl(true)}
						target="_blank"
						rel="noopener"
						onclick={closeOptions}
						><FileArchive size={18} /><span class="row-name">{t('workspaceCopy.title')}</span
						><ExternalLink size={16} aria-hidden="true" /></a
					>
				</div>
			</div>
			<hr />
		{/if}
		<!-- App info: installation, updates, source code, and build version. -->
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
				onclick={requestUpdate}
				><RefreshCw size={18} /><span class="row-name"
					>{t('toolbar.updateToVVersion', { version: $pwa.available.version })}</span
				></button
			>{/if}
		{#if import.meta.env.PROD}
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
					<a
						class="row bu-action"
						data-variant="quiet"
						href="https://github.com/Shilo/PixelDoll/blob/main/docs/user-guide.md"
						target="_blank"
						rel="noopener"
						onclick={closeOptions}
						><BookOpen size={18} /><span class="row-name">{t('toolbar.userGuide')}</span
						><ExternalLink size={16} aria-hidden="true" /></a
					>
					{#if !workspaceCopy}
						<button class="row bu-action" data-variant="quiet" onclick={requestInstallHelp}>
							<MonitorDown size={18} /><span class="row-name"
								>{openerLabel(t('pwaRuntime.installationHelp'))}</span
							>
							<SurfaceChevron />
						</button>
					{/if}
				</div>
			</div>
		{/if}
		<VersionRow />
		<!-- Attribution footer: keep this below the app links. -->
		<AffiliationNotice />
	</div>
</div>

<div
	id="project-menu"
	class="menu bu-popover-anchor"
	data-placement="bottom-start"
	popover
	bind:this={menu}
	role="menu"
	aria-label={t('common.characters')}
	ontoggle={(e) => {
		copyFeedback = null;
		popoverFocus(e);
	}}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		{#if experience.screen === 'studio' && prompt}
			<div class="menu-prompt">
				<p class="menu-sec">{t('common.prompt')}</p>
				<p class="menu-prompt-text">{prompt}</p>
				<button class="row" role="menuitem" aria-label={copyMessage} onclick={copyPrompt}
					><Copy size={16} /><span class="row-name">{copyMessage}</span></button
				>
			</div>
			<hr />
		{/if}
		<p class="menu-sec">{t('common.characters')}</p>
		{#snippet proj(p: (typeof store.projects)[number])}
			<CharacterActions id={p.id} name={p.name}>
				<button
					class="row bu-action"
					data-variant="row"
					role="menuitemradio"
					aria-checked={p.id === doc.id}
					aria-label={p.name}
					onclick={() => pick(p.id)}
				>
					<CharacterThumb id={p.id} name={p.name} size={48} /><span class="row-name"
						><CharacterName id={p.id} name={p.name} /></span
					>
				</button>
			</CharacterActions>
		{/snippet}
		<div class="bu-choice-group project-choices">
			{#each store.projects.filter((p) => !p.dev) as p (p.id)}{@render proj(p)}{/each}
		</div>
		<NewCharacterButton row />
		{#if !isDemo()}<button
				class="row"
				role="menuitem"
				aria-label={t('toolbar.renameCharacter')}
				onclick={() => {
					close();
					openRename(doc.id);
				}}
				><Pencil size={16} /><span class="row-name">{openerLabel(t('toolbar.rename'))}</span
				><SurfaceChevron /></button
			>{/if}
		{#if !isDemo()}<button
				class="row"
				role="menuitem"
				aria-label={t('toolbar.setUpCharacter')}
				onclick={() => sheet('setup')}
				><PersonStanding size={16} /><span class="row-name"
					>{openerLabel(t('toolbar.setUpCharacter'))}</span
				><SurfaceChevron /></button
			>{/if}
		<DeleteRow
			opens
			label={t('characterActions.labelDeleteCharacter')}
			locked={isDemo() ? t('characterActions.demoDeleteLocked') : ''}
			onclick={() => {
				ui.deleting = doc.id;
				sheet('delete');
			}}
		/>
		<hr />
		<button
			class="row"
			role="menuitem"
			aria-label={app.key ? t('toolbar.pixelLabAccount') : t('toolbar.connectPixelLab2')}
			onclick={() => sheet('connect')}
			><KeyRound size={16} /><span class="row-name"
				>{openerLabel(app.key ? t('toolbar.pixelLabAccount') : t('toolbar.connectPixelLab2'))}</span
			>
			{#if app.balance}<span class="faint small num"
					>{t('toolbar.generationsRemaining', {
						count: Math.round(app.balance.subscription.generations),
						n: formatNumber(Math.round(app.balance.subscription.generations))
					})}</span
				>{/if}<SurfaceChevron /></button
		>
		<button
			class="row"
			role="menuitem"
			aria-label={t('activity.title')}
			onclick={() => sheet('activity')}
			><Activity size={16} /><span class="row-name">{openerLabel(t('activity.title'))}</span
			>{#if active}<span class="badge accent">{formatNumber(active)}</span>{/if}<SurfaceChevron
			/></button
		>
		<button
			class="row"
			role="menuitem"
			aria-label={t('toolbar.characterSelection')}
			onclick={() => {
				close();
				characters();
			}}><House size={16} /><span class="row-name">{t('toolbar.characterSelection')}</span></button
		>
		{#if import.meta.env.DEV}<a
				class="row"
				role="menuitem"
				aria-label="Developer pages"
				href="#/dev"
				onclick={close}
				style="text-decoration:none"
				><Ellipsis size={16} /><span class="row-name">Developer pages (M1–M5)</span></a
			>{/if}
		<!-- T2: rigs frozen on the M2 dev pages stay out of the main list; reachable here for developers only -->
		{#if import.meta.env.DEV && devRigs.length}
			<details class="dev-rigs">
				<summary class="row"
					><ChevronRight size={16} /><span class="row-name">Developer rigs</span><span
						class="faint small num">{devRigs.length}</span
					></summary
				>
				<div class="bu-choice-group project-choices">
					{#each devRigs as p (p.id)}{@render proj(p)}{/each}
				</div>
			</details>
		{/if}
	</div>
</div>

<style>
	.project-choices {
		gap: 0;
	}
	.stopped-work {
		color: var(--bu-danger);
	}
	@container (max-width: 300px) {
		.wardrobe-status {
			display: none;
		}
	}
</style>
