<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	import { app } from '../lib/app.svelte.ts';
	import { navigateMenu, popoverFocus } from './experience/focus.ts';
	import { tick } from 'svelte';
	import { experience, characters, setMode, type WorldMode } from './experience/state.svelte.ts';
	import CharacterThumb from './experience/CharacterThumb.svelte';
	import SharePopover from './SharePopover.svelte';
	import CharacterActions from './CharacterActions.svelte';
	import CharacterName from './CharacterName.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import NewCharacterButton from './NewCharacterButton.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import GlobalActions from './GlobalActions.svelte';
	import MoreMenu from './MoreMenu.svelte';
	import { historyText } from './historyText.ts';
	import { activityStatus } from './activityStatus.svelte.ts';
	import { characterFacts } from './model.ts';
	import {
		ui,
		doc,
		store,
		openProject,
		openRename,
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
		Pencil,
		PersonStanding,
		Copy,
		Dices,
		Eye,
		Layers2,
		Mountain
	} from './icons.ts';

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
			<!-- Undo shows once there is something to undo, and Redo after it once there is something to redo. Each takes room
			     only while usable (the owner's choice: no idle space, at the cost of Undo shifting when Redo appears). -->
			<button
				class="bu-action header-undo"
				class:slot-gone={!undoText}
				data-variant="quiet"
				aria-label={undoText ?? t('common.undo')}
				title={undoText ?? t('common.undo')}
				disabled={!undoText}
				bind:this={undoButton}
				onclick={() => step(undo, redoButton)}><Undo2 size={18} /></button
			>
			<button
				class="bu-action header-redo"
				class:slot-gone={!redoText}
				data-variant="quiet"
				aria-label={redoText ?? t('common.redo')}
				title={redoText ?? t('common.redo')}
				disabled={!redoText}
				bind:this={redoButton}
				onclick={() => step(redo, undoButton)}><Redo2 size={18} /></button
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
		<GlobalActions />
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
	</div>
</div>

<style>
	.project-choices {
		gap: 0;
	}
	.slot-gone {
		display: none;
	}
</style>
