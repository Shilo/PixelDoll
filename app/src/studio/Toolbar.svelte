<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	import { app } from '../lib/app.svelte.ts';
	import { navigateMenu, popoverFocus } from './experience/focus.ts';
	import { tick } from 'svelte';
	import { contextMenu } from '../lib/input/contextMenu.ts';
	import { experience, characters, type WorldMode } from './experience/state.svelte.ts';
	import type { PanelSide } from './experience/panelSettings.svelte.ts';
	import CharacterThumb from './experience/CharacterThumb.svelte';
	import SharePopover from './SharePopover.svelte';
	import CharacterActions from './CharacterActions.svelte';
	import CharacterName from './CharacterName.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import NewCharacterButton from './NewCharacterButton.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import GlobalActions from './GlobalActions.svelte';
	import AudioSettingsButton from './AudioSettingsButton.svelte';
	import MoreMenu from './MoreMenu.svelte';
	import { historyText } from './historyText.ts';
	import { activityStatus } from './activityStatus.svelte.ts';
	import { characterFacts } from './model.ts';
	import {
		ui,
		doc,
		store,
		openProject,
		undo,
		redo,
		randomize,
		refreshProjects,
		characterName,
		isDemo
	} from './state.svelte.ts';
	import {
		ChevronDown,
		ChevronLeft,
		Download,
		Share2,
		KeyRound,
		Redo2,
		Undo2,
		House,
		Activity,
		PersonStanding,
		Copy,
		Dices,
		Eye,
		Layers2,
		Mountain,
		PanelLeftOpen,
		PanelLeftClose,
		PanelRightOpen,
		PanelRightClose,
		PanelBottomOpen,
		PanelBottomClose
	} from './icons.ts';
	let {
		panelOpen,
		panelSide,
		onpanel,
		onmode,
		oncharacteractions
	}: {
		panelOpen: boolean;
		panelSide: PanelSide | 'bottom';
		onpanel: () => void;
		onmode: (mode: WorldMode, pointer: string) => void;
		oncharacteractions: (source: HTMLElement) => void;
	} = $props();
	// The icon shows what a press does: open toward the dock edge, or close into it.
	const PANEL_ICONS = {
		left: [PanelLeftOpen, PanelLeftClose],
		right: [PanelRightOpen, PanelRightClose],
		bottom: [PanelBottomOpen, PanelBottomClose]
	} as const;
	const PanelIcon = $derived(PANEL_ICONS[panelSide][panelOpen ? 1 : 0]);
	$effect.pre(() => {
		void panelSide;
		const focused = document.activeElement;
		if (focused?.id === 'customization-toggle') {
			void tick().then(() => {
				if (!focused.isConnected && document.activeElement === document.body)
					document.getElementById('customization-toggle')?.focus({ preventScroll: true });
			});
		}
	});

	const m = $derived(store.project?.manifest);
	const facts = $derived(m && characterFacts(m));
	const name = $derived(characterName());
	const prompt = $derived(m?.items.find((it) => it.id === m.rig.baseItem)?.prompt ?? '');
	const characterCount = $derived(store.projects.filter((p) => !p.dev).length);
	const VIEWS = [
		['preview', 'toolbar.viewPreview', Eye],
		['topdown', 'toolbar.viewTopDown', Layers2],
		['side', 'toolbar.viewSide', Mountain]
	] as const;
	let activationPointer = '';
	async function changeMode(mode: WorldMode, event: MouseEvent) {
		const pointer = event.detail ? (event as PointerEvent).pointerType || activationPointer : '';
		activationPointer = '';
		onmode(mode, pointer);
		await tick();
		focusWorld();
	}
	function focusWorld() {
		const stage = document.querySelector<HTMLElement>('.world-stage');
		if (!stage?.closest('[inert]')) stage?.focus({ preventScroll: true });
	}
	function resumeWorldAfterPointer(header: HTMLElement) {
		const clicked = async (event: MouseEvent) => {
			const button = event.target instanceof Element ? event.target.closest('button') : null;
			if (event.detail === 0 || !button || button.matches('[popovertarget], #customization-toggle'))
				return;
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
	const active = $derived(activityStatus.active);
	const undoText = $derived(historyText('undo'));
	const redoText = $derived(historyText('redo'));
	let undoButton = $state<HTMLButtonElement>(),
		redoButton = $state<HTMLButtonElement>();
	/** Steps history; a button whose stack just emptied hides, so its focus moves to the other one. */
	async function step(action: () => Promise<void>, other: HTMLButtonElement | undefined) {
		const own = document.activeElement;
		// A step that writes the saved record stays on its stack until its write lands: decide only then.
		await action();
		await tick();
		if (!(own instanceof HTMLButtonElement) || !own.disabled) return;
		// Focus the person moved elsewhere meanwhile stays there; a disabled button leaves it on the page body.
		const now = document.activeElement;
		if (now !== own && now !== document.body) return;
		// The other one may live in More at this width; More then takes focus.
		const next =
			other && !other.disabled && other.checkVisibility()
				? other
				: document.querySelector<HTMLElement>(
						'.experience-header [popovertarget="experience-options"]'
					);
		next?.focus({ preventScroll: true });
	}
	let menu: HTMLElement;
	const close = () => menu?.hidePopover?.();
	const pick = (id: string) => {
		close();
		if (id !== doc.id) void openProject(id);
	};
	const sheet = (s: typeof ui.sheet) => {
		close();
		ui.sheet = s;
	};
	/** Prefer centering the view switch over the character (the stage's middle), not the window; stay clear of the
	 *  name and the actions, and fall back to the bar's center when there is no room. Floating rows (phones,
	 *  sheets) are positioned by CSS and are left alone. */
	function centerOnStage(node: HTMLElement) {
		// The stage changes as the panel opens and once it has finished closing.
		void panelOpen;
		void experience.panelClosing;
		void panelSide;
		// Reposition after translated labels change, before a stale offset can cover adjacent actions.
		void t('toolbar.viewSide');
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
			node.style.removeProperty('--view-shift');
		};
	}
	/** Keep Export reachable while there is room by moving presentation shortcuts first. */
	const OVERFLOW = ['undo', 'redo', 'random', 'share', 'fullscreen', 'audio', 'export'] as const;
	/** The narrowest a truncated character name may get before the next action moves into More. */
	const MIN_NAME = 96;
	let fitFrame = 0;
	let fitHeader: HTMLElement | undefined;
	/** The bar control that last had focus, so focus can follow it into More when it leaves the bar. */
	let fitFocus: Element | null = null;
	function fitNow() {
		const header = fitHeader,
			root = header?.closest<HTMLElement>('.experience');
		if (!header || !root) return;
		const name = header.querySelector<HTMLElement>('.name-text');
		const crowded = () =>
			header.scrollWidth > header.clientWidth + 1 ||
			(!!name && name.clientWidth < Math.min(name.scrollWidth, MIN_NAME));
		const moved: string[] = [];
		delete root.dataset.overflow;
		if (experience.screen === 'studio')
			for (const action of OVERFLOW) {
				if (!crowded()) break;
				if (action === 'audio' && !header.querySelector('.header-audio')?.checkVisibility())
					continue;
				moved.push(action);
				root.dataset.overflow = moved.join(' ');
			}
		// A focused action that moved into More hands focus to More rather than dropping it on the page.
		const focus = fitFocus;
		if (
			focus?.isConnected &&
			header.contains(focus) &&
			!focus.checkVisibility() &&
			(document.activeElement === focus || document.activeElement === document.body)
		)
			header
				.querySelector<HTMLElement>('[popovertarget="experience-options"]')
				?.focus({ preventScroll: true });
	}
	function scheduleFit() {
		cancelAnimationFrame(fitFrame);
		fitFrame = requestAnimationFrame(fitNow);
	}
	function fitActions(header: HTMLElement) {
		fitHeader = header;
		// Fit once before the first paint, so a long saved name never shows a squeezed bar for a frame.
		fitNow();
		const observer = new ResizeObserver(scheduleFit);
		for (const el of [header, ...header.children]) observer.observe(el);
		const focused = (e: FocusEvent) => (fitFocus = e.target as Element);
		header.addEventListener('focusin', focused);
		// A web font arriving late widens the name without resizing the bar.
		document.fonts.addEventListener('loadingdone', scheduleFit);
		return () => {
			observer.disconnect();
			header.removeEventListener('focusin', focused);
			document.fonts.removeEventListener('loadingdone', scheduleFit);
			cancelAnimationFrame(fitFrame);
			fitHeader = undefined;
			fitFocus = null;
			delete header.closest<HTMLElement>('.experience')?.dataset.overflow;
		};
	}
	// Content that changes a control's width without resizing the bar: the name, labels and history.
	$effect(() => {
		void [name, undoText, redoText, m, panelSide, experience.screen, t('toolbar.export')];
		scheduleFit();
	});
</script>

{#snippet panelToggle()}
	<button
		id="customization-toggle"
		class="bu-action panel-toggle"
		data-variant="quiet"
		aria-expanded={panelOpen}
		aria-controls="customization-rail"
		data-trail="toolbar.panel"
		aria-label={t('experience.customization')}
		title={t('experience.customization')}
		onclick={onpanel}><PanelIcon size={20} aria-hidden="true" /></button
	>
{/snippet}

<header class="experience-header" {@attach resumeWorldAfterPointer} {@attach fitActions}>
	<div class="header-start">
		{#if experience.screen === 'studio'}<button
				class="bu-action header-back"
				data-trail="toolbar.characters"
				data-variant="quiet"
				aria-label={t('common.characters')}
				title={t('common.characters')}
				onclick={characters}><ChevronLeft size={20} /></button
			><!-- The page heading sits beside the menu button: a heading is not allowed inside a button. -->
			{#if panelSide === 'left'}{@render panelToggle()}{/if}
			<h1 class="sr">{name}</h1>
			<button
				class="name-menu project-btn"
				{@attach contextMenu(oncharacteractions)}
				popovertarget="project-menu"
				aria-haspopup="menu"
				data-trail="toolbar.characterMenu"
				onclick={() => void refreshProjects()}
				><span class="name-line"
					><span class="name-text"><CharacterName id={doc.id} {name} /></span>
					<ChevronDown size={16} aria-hidden="true" /></span
				>{#if facts}<span class="name-facts"
						>{t('characterFacts.frame', { measure: facts.frame })} · {facts.counts
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
					data-trail="toolbar.viewMode"
					aria-controls="world-stage"
					aria-label={label}
					title={label}
					onpointerdown={(event) => (activationPointer = event.pointerType)}
					onclick={(event) => changeMode(id, event)}
					><span class="bu-tab-label"
						><Icon size={20} aria-hidden="true" /><span
							class="view-label bu-tab-text"
							data-text={label}>{label}</span
						></span
					></button
				>{/each}
		</div>
	{/if}
	<div class="header-actions">
		{#if experience.screen === 'characters'}
			<AudioSettingsButton />
			<NewCharacterButton />
		{:else}
			<!-- Undo shows once there is something to undo, and Redo after it once there is something to redo. Each takes room
			     only while usable (the owner's choice: no idle space, at the cost of Undo shifting when Redo appears). -->
			<button
				class="bu-action header-undo"
				class:slot-gone={!undoText}
				data-trail="toolbar.undo"
				data-variant="quiet"
				aria-label={undoText ?? t('common.undo')}
				title={undoText ?? t('common.undo')}
				disabled={!undoText}
				bind:this={undoButton}
				onclick={() => step(undo, redoButton)}><Undo2 size={20} /></button
			>
			<button
				class="bu-action header-redo"
				class:slot-gone={!redoText}
				data-trail="toolbar.redo"
				data-variant="quiet"
				aria-label={redoText ?? t('common.redo')}
				title={redoText ?? t('common.redo')}
				disabled={!redoText}
				bind:this={redoButton}
				onclick={() => step(redo, undoButton)}><Redo2 size={20} /></button
			>
			<AudioSettingsButton />
			<button
				class="bu-action header-random"
				data-trail="toolbar.randomLook"
				data-variant="quiet"
				aria-label={t('common.randomLook')}
				title={t('toolbar.titleRandomLookItemsAndColors')}
				disabled={!m}
				onclick={randomize}><Dices size={20} /></button
			>
			<button
				class="bu-action header-share"
				data-trail="toolbar.share"
				data-variant="outline"
				aria-label={t('toolbar.shareCharacter')}
				title={t('common.share')}
				popovertarget="share-popover"
				disabled={!m}
				><Share2 size={16} /><span>{openerLabel(t('common.share'))}</span><SurfaceChevron /></button
			>
			<button
				class="bu-action header-export"
				data-trail="toolbar.export"
				data-variant="outline"
				aria-label={t('toolbar.export')}
				title={t('toolbar.export')}
				onclick={() => (ui.sheet = 'export')}
				disabled={!m}
				><Download size={16} /><span>{openerLabel(t('toolbar.export'))}</span><SurfaceChevron
				/></button
			>
		{/if}
		<GlobalActions
			showAudio={false}
			beforeMore={experience.screen === 'studio' && panelSide !== 'left' ? panelToggle : undefined}
		/>
	</div>
</header>
<SharePopover />
{#if ui.sheet !== 'create'}<MoreMenu />{/if}

<div
	id="project-menu"
	class="menu bu-popover-anchor"
	data-placement="bottom-start"
	popover
	bind:this={menu}
	role="menu"
	aria-label={t('common.characters')}
	tabindex={-1}
	ontoggle={(e) => {
		copyFeedback = null;
		popoverFocus(e);
	}}
	onkeydown={(event) => navigateMenu(menu, event)}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		{#if experience.screen === 'studio' && prompt}
			<div class="menu-prompt">
				<p class="menu-sec">{t('common.prompt')}</p>
				<p class="menu-prompt-text">{prompt}</p>
				<button
					class="row bu-action"
					data-variant="quiet"
					role="menuitem"
					aria-label={copyMessage}
					data-trail="characterPicker.copyPrompt"
					onclick={copyPrompt}
					><Copy size={18} aria-hidden="true" /><span class="row-name">{copyMessage}</span></button
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
					data-trail="characterPicker.pick"
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
		<!-- Each character's own ⋮ above has Rename, Make copy with new look and Move to Trash; Set up is the open one's. -->
		{#if !isDemo()}<button
				class="row bu-action"
				data-variant="quiet"
				role="menuitem"
				aria-label={t('toolbar.setUpCharacter')}
				data-trail="characterPicker.setup"
				onclick={() => sheet('setup')}
				><PersonStanding size={18} aria-hidden="true" /><span class="row-name"
					>{openerLabel(t('toolbar.setUpCharacter'))}</span
				><SurfaceChevron /></button
			>{/if}
		<hr />
		<button
			class="row bu-action"
			data-variant="quiet"
			role="menuitem"
			aria-label={app.key ? t('toolbar.pixelLabAccount') : t('toolbar.connectPixelLab2')}
			data-trail="characterPicker.connect"
			onclick={() => sheet('connect')}
			><KeyRound size={18} aria-hidden="true" /><span class="row-name"
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
			class="row bu-action"
			data-variant="quiet"
			role="menuitem"
			aria-label={t('activity.title')}
			data-trail="characterPicker.activity"
			onclick={() => sheet('activity')}
			><Activity size={18} aria-hidden="true" /><span class="row-name"
				>{openerLabel(t('activity.title'))}</span
			>{#if active}<span class="badge accent">{formatNumber(active)}</span>{/if}<SurfaceChevron
			/></button
		>
		<button
			class="row bu-action"
			data-variant="quiet"
			role="menuitem"
			aria-label={t('toolbar.characterSelection')}
			data-trail="characterPicker.allCharacters"
			onclick={() => {
				close();
				characters();
			}}
			><House size={18} aria-hidden="true" /><span class="row-name"
				>{t('toolbar.characterSelection')}</span
			></button
		>
	</div>
</div>

<style>
	.row > :global(svg:first-child) {
		flex: none;
	}
	/* Match the toolbar breakpoint where Share and Export hide their labels. */
	@media (max-width: 1199px) {
		:is(.header-share, .header-export) > :global(svg:first-child) {
			width: 20px;
			height: 20px;
		}
	}
	.project-choices {
		gap: 0;
	}
	.slot-gone {
		display: none;
	}
</style>
