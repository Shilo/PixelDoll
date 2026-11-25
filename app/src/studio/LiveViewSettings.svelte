<script lang="ts">
	import { t, type WhisperKey } from 'svelte-whisper';

	import { message } from '../lib/message.ts';

	import { playbackClips } from '../lib/runtime/timeline.js';

	import { displayMove } from './displayMove.ts';

	import { chosenClip, liveClips, type LiveRole } from './experience/liveRoles.ts';

	import Help from './Help.svelte';

	import NumberStepper from './NumberStepper.svelte';
	import SettingsItemToggle from './SettingsItemToggle.svelte';

	import {
		chooseLiveLayering,
		chooseLiveRole,
		currentLiveLayering
	} from './experience/liveViews.ts';

	import PlaybackPicker from './experience/PlaybackPicker.svelte';

	import { experience } from './experience/state.svelte.ts';
	import { panelSettings, setPanelSettings } from './experience/panelSettings.svelte.ts';

	import { lookClipThumbnail } from './moveThumbnails.ts';

	import { characterName, doc, store, toast, ui, view } from './state.svelte.ts';

	const moves = $derived(store.project?.manifest.rig.animations ?? []);

	const clips = $derived(playbackClips(moves));

	const layering = $derived(currentLiveLayering(doc.id));

	const waistLabel = $props.id();

	const choices = $derived(experience.liveRoles[doc.id]);

	const roles: { role: LiveRole; label: WhisperKey }[] = [
		{ role: 'idle', label: 'liveViews.idle' },

		{ role: 'walk', label: 'liveViews.walk' },
		{ role: 'run', label: 'liveViews.run' },
		{ role: 'jump', label: 'liveViews.jump' },
		{ role: 'attack', label: 'liveViews.attack' },

		{ role: 'attackUp', label: 'liveViews.attackUp' },

		{ role: 'attackDown', label: 'liveViews.attackDown' }
	];

	/** Automatic names the clip it plays now, so people see what a choice replaces. */

	function automatic(role: LiveRole) {
		if (role === 'attackUp' || role === 'attackDown') return t('liveViews.sameAsAttack');
		const automaticClips = liveClips(moves, { ...choices, [role]: undefined });
		const clip = automaticClips[role].find((id) => moves.some((move) => move.id === id));
		// Run without its own clip sprints with Walk, played faster.
		if (role === 'run' && clip && automaticClips.walk.includes(clip))
			return t('liveViews.automaticFaster', { clip: displayMove(clip, moves) });
		// With no Idle, Walk or Standing the character still shows its art standing still (presentation.ts stills).

		return clip
			? t('liveViews.automaticClip', { clip: displayMove(clip, moves) })
			: role === 'idle' || role === 'walk' || role === 'run'
				? t('liveViews.automaticStill')
				: t('liveViews.automaticNone');
	}

	function setLayering(on: boolean, waist: number) {
		if (doc.id && !chooseLiveLayering(doc.id, { on, waist }))
			toast(message('liveViews.notSaved'), { tone: 'warning' });
	}

	function choose(role: LiveRole, clip: string) {
		if (!doc.id) return;

		if (!chooseLiveRole(doc.id, role, clip))
			toast(message('liveViews.notSaved'), { tone: 'warning' });
	}
</script>

<SettingsItemToggle
	setting="panel-auto-hide"
	checked={panelSettings.autoHide}
	aria-describedby="studio-panel-auto-hide-help"
	onchange={(event) => {
		if (!setPanelSettings({ autoHide: event.currentTarget.checked }))
			toast(message('studioPanel.notSaved'), { tone: 'warning' });
	}}
>
	<span class="row-name">{t('studioPanel.autoHide')}</span>
</SettingsItemToggle>
<p class="bu-muted small auto-hide-help" id="studio-panel-auto-hide-help">
	{t('studioPanel.autoHideHelp')}
</p>

{#if doc.id}
	<p class="bu-muted small character">{t('liveViews.forCharacter', { name: characterName() })}</p>

	{#each roles as { role, label } (role)}
		{#if role === 'attackUp'}
			<h4 class="small side-heading">{t('toolbar.viewSide')}</h4>
		{/if}

		<div data-setting="live-{role}" tabindex="-1">
			<PlaybackPicker
				settings
				{clips}
				moveRefs={moves}
				selected={chosenClip(moves, choices, role) ?? ''}
				label={t(label)}
				automatic={automatic(role)}
				thumbnail={(key) =>
					view.project && lookClipThumbnail(view.project, view.items, key, ui.dir)}
				onselect={(clip) => choose(role, clip)}
			/>
		</div>

		{#if role === 'attack'}
			<SettingsItemToggle
				tooltip={t('liveViews.layeringHelp')}
				checked={layering.on}
				onchange={(event) => setLayering(event.currentTarget.checked, layering.waist)}
			>
				<span class="row-name">{t('liveViews.walkWhileAttacking')}</span>
			</SettingsItemToggle>

			{#if layering.on}
				<div class="layering" data-setting="live-waist">
					<div class="layering-head">
						<span id={waistLabel}>{t('liveViews.waist')}</span>

						<Help iconOnly title={t('liveViews.waist')} text={t('liveViews.waistHelp')} />
					</div>

					<div class="layering-controls">
						<button
							class="bu-action btn layering-auto"
							data-variant="outline"
							aria-pressed={layering.waist === 0}
							onclick={() => setLayering(true, 0)}>{t('create.form.auto')}</button
						>

						<NumberStepper
							value={layering.waist}
							min={-4}
							max={4}
							suffix="px"
							labelledby={waistLabel}
							decreaseLabel={t('liveViews.raiseWaist')}
							increaseLabel={t('liveViews.lowerWaist')}
							onchange={(waist) => setLayering(true, waist)}
						/>
					</div>
				</div>
			{/if}
		{/if}
	{/each}

	<p class="bu-muted small">{t('liveViews.sideAttackHelp')}</p>

	<section class="controls" aria-labelledby="live-controls">
		<h4 id="live-controls" class="small">{t('liveViews.controls')}</h4>

		<p class="bu-muted small">{t('liveViews.hintTopDown')}</p>

		<p class="bu-muted small">{t('liveViews.hintSide')}</p>

		<p class="bu-muted small">{t('liveViews.hintTouch')}</p>
	</section>
{:else}
	<p class="bu-muted">{t('liveViews.openCharacter')}</p>
{/if}

<style>
	.auto-hide-help {
		margin: -2px 0 16px;
	}
	.layering {
		display: grid;

		gap: 8px;
	}

	.layering-head,
	.layering-controls {
		display: flex;

		align-items: center;

		gap: 8px;
	}

	.layering-controls {
		flex-wrap: wrap;
	}

	.layering-auto {
		min-block-size: 44px;
	}

	.character {
		margin: 0;
	}

	.side-heading {
		margin: 8px 0 0;
	}

	.controls {
		display: grid;

		gap: 4px;

		margin-top: 8px;
	}

	.controls :is(h4, p) {
		margin: 0;
	}
</style>
