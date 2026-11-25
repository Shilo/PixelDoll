<script lang="ts">
	import { t, type WhisperKey } from 'svelte-whisper';

	import { message } from '../lib/message.ts';

	import { playbackClips } from '../lib/runtime/timeline.js';

	import { displayMove } from './displayMove.ts';

	import { chosenClip, liveClips, type LiveRole } from './experience/liveRoles.ts';

	import Help from './Help.svelte';

	import SettingsItemToggle from './SettingsItemToggle.svelte';

	import {
		chooseLiveLayering,
		chooseLiveRole,
		currentLiveLayering
	} from './experience/liveViews.ts';

	import PlaybackPicker from './experience/PlaybackPicker.svelte';

	import { experience } from './experience/state.svelte.ts';

	import { lookClipThumbnail } from './moveThumbnails.ts';

	import { characterName, doc, store, toast, ui, view } from './state.svelte.ts';

	const moves = $derived(store.project?.manifest.rig.animations ?? []);

	const clips = $derived(playbackClips(moves));

	const layering = $derived(currentLiveLayering(doc.id));

	let waistInput = $state<HTMLInputElement>();

	/** True between typing in the waist field and leaving it. Auto stays unpressed while an edit is in progress. */
	let waistEdited = $state(false);

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

	/** Out-of-range whole numbers clamp to the nearest limit; empty or invalid text shows the committed value again. */
	function finishWaistEdit(input: HTMLInputElement) {
		waistEdited = false;
		const waist = input.valueAsNumber;
		if (!Number.isInteger(waist)) {
			input.value = String(layering.waist);
			return;
		}
		const clamped = Math.min(4, Math.max(-4, waist));
		if (clamped !== layering.waist) setLayering(true, clamped);
		input.value = String(clamped);
	}

	function choose(role: LiveRole, clip: string) {
		if (!doc.id) return;

		if (!chooseLiveRole(doc.id, role, clip))
			toast(message('liveViews.notSaved'), { tone: 'warning' });
	}
</script>

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
					<span>{t('liveViews.waist')}</span>

					<Help iconOnly title={t('liveViews.waist')} text={t('liveViews.waistHelp')} />

					<button
						class="bu-action btn"
						data-variant="outline"
						aria-pressed={!waistEdited && layering.waist === 0}
						onclick={() => {
							waistEdited = false;
							setLayering(true, 0);
							waistInput?.focus();
							waistInput?.select();
						}}>{t('create.form.auto')}</button
					>

					<div class="pixel-input">
						<input
							bind:this={waistInput}
							class="bu-input input"
							aria-label={t('liveViews.waist')}
							type="number"
							min={-4}
							max={4}
							step={1}
							value={layering.waist}
							oninput={(event) => {
								waistEdited = true;
								const waist = event.currentTarget.valueAsNumber;
								if (Number.isInteger(waist) && waist >= -4 && waist <= 4) setLayering(true, waist);
							}}
							onblur={(event) => finishWaistEdit(event.currentTarget)}
						/><span aria-hidden="true">px</span>
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
	.layering {
		display: flex;

		align-items: center;

		gap: 8px;
	}

	.layering {
		flex-wrap: wrap;
	}

	.pixel-input {
		position: relative;
		inline-size: 80px;
	}

	.pixel-input input {
		inline-size: 100%;
		padding-right: 33px;
		font-variant-numeric: tabular-nums;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.pixel-input input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}

	.pixel-input > span {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-3);
		font-size: var(--fs-sm);
		pointer-events: none;
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
