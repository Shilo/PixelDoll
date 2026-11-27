<script lang="ts">
	// The one States and Moves picker: playback bar, Share and the Create State source all use it.
	import { t } from 'svelte-whisper';
	import type { Img } from '../../lib/image/png.ts';
	import type { playbackClips } from '../../lib/runtime/timeline.js';
	import { displayMove } from '../displayMove.ts';
	import type { MoveRef } from '../model.ts';
	import { Check, ChevronDown, Layers2, PersonStanding, Sparkles } from '../icons.ts';
	import { ALL_CLIPS, ALL_MOVES, ALL_STATES } from '../shareClips.ts';
	import PopoverArrow from '../PopoverArrow.svelte';
	import SettingsItemButton from '../SettingsItemButton.svelte';
	import Sprite from '../Sprite.svelte';
	import { ui } from '../state.svelte.ts';
	import { navigateMenu, popoverFocus } from './focus.ts';
	import { croppedBacking, croppedThumbnail } from './thumbnails.svelte.ts';

	let {
		clips,
		moveRefs,
		selected,
		compact = false,
		bulk = false,
		field,
		label,
		settings = false,
		automatic,
		unavailable,
		valueLabel,
		disabled = false,
		thumbnail,
		placement,
		boxed = false,
		onselect
	}: {
		clips: readonly Pick<ReturnType<typeof playbackClips>[number], 'id' | 'key' | 'kind'>[];
		moveRefs: readonly MoveRef[];
		selected: string;
		compact?: boolean;
		bulk?: boolean;
		/** A labeled full-width field trigger (Create State's Source) instead of the toolbar button. */
		field?: string;
		/** Accessible name for the quiet trigger when the surrounding row already shows the visible label. */
		label?: string;
		/** A Settings row (like Language): the whole row opens the menu, and the menu fits its widest choice. */
		settings?: boolean;
		/** A row that clears the choice, such as Mount's Automatic (no Riding pose). */
		automatic?: string;
		/** Keys that cannot be chosen, with the reason shown under the row name. */
		unavailable?: ReadonlyMap<string, string>;
		/** Trigger text when the current choice is none of the clips, such as a redraw's original start. */
		valueLabel?: string;
		disabled?: boolean;
		/** Row artwork; the trigger itself never shows a thumbnail because its context already previews the choice. */
		thumbnail?: (key: string) => Img | null;
		/** Where the menu opens; the toolbar's opens above it, a header's below. */
		placement?: 'top' | 'bottom-start' | 'bottom-end';
		/** A boxed trigger like a select, for a header that pairs it with select boxes; the toolbar's is quiet. */
		boxed?: boolean;
		onselect: (clip: string) => void;
	} = $props();

	const menuId = $props.id();
	const states = $derived(clips.filter((clip) => clip.kind === 'state'));
	const moves = $derived(clips.filter((clip) => clip.kind === 'move'));
	const value = $derived(
		valueLabel ?? (selected === '' && automatic ? automatic : clipLabel(selected))
	);
	const menuLabel = $derived(label ?? field ?? t(bulk ? 'share.clips' : 'common.move'));
	let menu: HTMLDivElement;
	let expanded = $state(false);

	function clipLabel(key: string) {
		if (bulk) {
			if (key === ALL_STATES) return t('share.allStates');
			if (key === ALL_MOVES) return t('share.allMoves');
			if (key === ALL_CLIPS) return t('share.allClips');
		}
		return displayMove(key, moveRefs);
	}
</script>

{#snippet trigger()}
	<button
		type="button"
		class={['clip-trigger bu-action', { compact, boxed }]}
		data-trail="movePicker.open"
		data-variant={bulk || field || boxed ? 'field' : 'quiet'}
		aria-label={bulk || field || label ? `${menuLabel}: ${value}` : undefined}
		aria-haspopup="menu"
		aria-expanded={expanded}
		popovertarget={menuId}
		disabled={disabled || (!clips.length && !automatic)}
		title={bulk || field ? undefined : value}
		value={selected}
		onkeydown={(event) => {
			if (!expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
				event.preventDefault();
				menu.showPopover({ source: event.currentTarget });
			}
		}}
	>
		{#if bulk}<PersonStanding size={16} aria-hidden="true" />{:else if !field && !label}<span
				class="sr">{menuLabel}:</span
			>{/if}
		{#if boxed}<span class="clip-values"
				>{#each clips as clip (clip.id)}<span class="clip-sizer" aria-hidden="true"
						>{clipLabel(clip.key)}</span
					>{/each}<span class="clip-value">{value}</span></span
			>{:else}<span class="clip-value">{value}</span>{/if}
		<ChevronDown size={field ? 16 : 14} aria-hidden="true" />
	</button>
{/snippet}

{#if settings}
	<SettingsItemButton
		aria-label={`${menuLabel}: ${value}`}
		data-trail="movePicker.open"
		value={selected}
		aria-haspopup="menu"
		aria-expanded={expanded}
		popovertarget={menuId}
		disabled={disabled || (!clips.length && !automatic)}
		onkeydown={(event) => {
			if (!expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
				event.preventDefault();
				menu.showPopover({ source: event.currentTarget });
			}
		}}
	>
		<PersonStanding size={18} aria-hidden="true" />
		<span class="row-name">{menuLabel}</span>
		<span class="faint small clip-value">{value}</span>
		<ChevronDown size={16} aria-hidden="true" />
	</SettingsItemButton>
{:else if field}
	<div class="field clip-field">
		<span class="label" aria-hidden="true">{field}</span>
		{@render trigger()}
	</div>
{:else}
	<div class={bulk ? 'bulk-picker' : 'playback-move'}>{@render trigger()}</div>
{/if}
<div
	id={menuId}
	class={[
		'menu clip-menu bu-popover-anchor',
		{
			'two-columns': !compact && (bulk || (states.length > 0 && moves.length > 0)),
			'with-art': !!thumbnail,
			fit: settings
		}
	]}
	data-placement={placement ?? (field ? 'bottom-start' : settings ? 'bottom-end' : 'top')}
	popover
	role="menu"
	aria-label={menuLabel}
	tabindex={-1}
	bind:this={menu}
	ontoggle={(event) => {
		expanded = event.newState === 'open';
		popoverFocus(event);
	}}
	onkeydown={(event) => {
		if (event.key === 'Tab') {
			requestAnimationFrame(() => {
				if (menu.matches(':popover-open')) menu.hidePopover();
			});
		}
		navigateMenu(menu, event);
	}}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		{#if automatic}
			{@render option('', false, automatic)}
			<hr class="bu-separator" />
		{/if}
		<div class="clip-groups">
			{@render group(t('experience.tabMoves'), moves, ALL_MOVES)}
			{@render group(t('experience.tabStates'), states, ALL_STATES)}
		</div>
		{#if bulk && clips.length}
			<hr class="bu-separator" />
			{@render option(ALL_CLIPS)}
		{/if}
	</div>
</div>

{#snippet group(heading: string, entries: typeof clips, scope: string)}
	{#if entries.length || bulk}
		<div role="group" aria-label={heading}>
			<div class="menu-sec" aria-hidden="true">{heading}</div>
			{#if bulk}{@render option(scope, !entries.length)}{/if}
			{#each entries as entry (entry.id)}
				{@render option(entry.key)}
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet option(key: string, disabled = false, name?: string)}
	{@const scope = key === ALL_STATES || key === ALL_MOVES || key === ALL_CLIPS}
	{@const reason = unavailable?.get(key)}
	<button
		type="button"
		class="row clip-row bu-action"
		data-variant="quiet"
		role="menuitemradio"
		aria-checked={selected === key}
		data-trail="movePicker.pick"
		value={key}
		{disabled}
		aria-disabled={reason ? 'true' : undefined}
		aria-label={reason ? `${name ?? clipLabel(key)}: ${reason}` : undefined}
		title={reason}
		tabindex={-1}
		onclick={() => {
			if (reason) return;
			if (selected !== key) onselect(key);
			menu.hidePopover();
		}}
	>
		{#if thumbnail || (key === '' && automatic)}
			<span class="clip-art" aria-hidden="true">
				{#if key === '' && automatic}
					<Sparkles size={18} />
				{:else if scope}
					<Layers2 size={18} />
				{:else if expanded && thumbnail}
					{@const art = (() => {
						const image = thumbnail(key);
						return image && croppedThumbnail(image);
					})()}
					{#if art}<Sprite
							img={art}
							k={croppedBacking(32, art, ui.dpr)}
							fitToBox={art.w > 32 || art.h > 32}
							label=""
						/>{/if}
				{/if}
			</span>
		{/if}
		<span class="clip-name"
			>{name ?? clipLabel(key)}{#if reason}<span class="clip-note">{reason}</span>{/if}</span
		>
		{#if selected === key}<Check size={16} aria-hidden="true" />{/if}
	</button>
{/snippet}

<style>
	.bulk-picker .clip-trigger,
	.clip-field .clip-trigger {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		min-height: 44px;
		padding: 8px;
		font-size: 13px;
		text-align: start;
	}
	.bulk-picker .clip-trigger :global(svg:last-child),
	.clip-field .clip-trigger :global(svg:last-child) {
		margin-inline-start: auto;
	}
	.clip-field {
		display: grid;
		gap: 4px;
	}
	.clip-field .clip-trigger {
		padding-inline: 12px;
		font-size: 16px;
	}
	.playback-move .clip-trigger {
		min-width: 44px;
		max-width: min(180px, 100%);
	}
	.playback-move .clip-trigger.compact {
		flex: 1;
		max-width: 100%;
		padding-inline: 6px;
		font-size: 14px;
	}
	.playback-move .clip-trigger.boxed {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		min-height: 40px;
		padding: 6px 10px 6px 12px;
		/* The size of the select boxes beside it, not the toolbar's. */
		font-size: var(--bu-text-size);
	}
	/* Every choice sits in the same cell, hidden but for the chosen one, so the box keeps its longest choice's width. */
	.clip-values {
		display: grid;
		min-width: 0;
		text-align: start;
	}
	.clip-values > * {
		grid-area: 1 / 1;
	}
	.clip-sizer {
		visibility: hidden;
		white-space: nowrap;
	}
	/* Sized to its longest choice already, so its value never truncates (an ellipsis there was only sub-pixel rounding). */
	.clip-values .clip-value {
		overflow: visible;
		text-overflow: clip;
	}
	@media (pointer: coarse) {
		.playback-move .clip-trigger.boxed {
			min-height: 44px;
		}
	}
	.clip-value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.clip-name {
		flex: 1;
		min-width: 0;
	}
	.clip-note {
		display: block;
		font-size: var(--fs-sm);
		color: var(--bu-muted);
	}
	.clip-trigger :global(svg),
	.clip-row :global(svg) {
		flex: none;
	}
	.clip-art {
		flex: none;
		display: grid;
		place-items: center;
		inline-size: 36px;
		block-size: 36px;
		color: var(--bu-muted);
	}
	:global(.studio-app) .clip-menu {
		width: min(256px, calc(100vw - 16px));
	}
	:global(.studio-app) .clip-menu.with-art {
		width: min(280px, calc(100vw - 16px));
	}
	.clip-groups {
		display: grid;
		gap: 8px;
	}
	@media (min-width: 460px) {
		:global(.studio-app) .clip-menu.two-columns {
			width: 420px;
		}
		.two-columns .clip-groups {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0;
		}
		.two-columns [role='group']:first-child {
			padding-inline-end: 8px;
		}
		.two-columns [role='group'] + [role='group'] {
			border-inline-start: 1px solid var(--bu-line);
			padding-inline-start: 8px;
		}
	}
	@media (min-width: 520px) {
		:global(.studio-app) .clip-menu.two-columns.with-art {
			width: 460px;
		}
	}
	.clip-menu .clip-row {
		justify-content: space-between;
		gap: 8px;
		height: auto;
		min-height: 44px;
		padding: 4px 8px;
		font-size: inherit;
		text-align: start;
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.clip-menu.with-art .clip-row {
		padding-inline-start: 4px;
	}
	/* Last and specific enough to beat the fixed widths above: as wide as its widest choice, never past the screen. */
	:global(.studio-app .clip-menu.fit[popover]) {
		width: max-content;
		max-width: calc(100vw - 16px);
	}
</style>
