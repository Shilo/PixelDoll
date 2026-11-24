<script lang="ts">
	import { t, type WhisperKey } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { displayMove } from './displayMove.ts';
	import { chosenClip, liveClips, type LiveRole } from './experience/liveRoles.ts';
	import { chooseLiveRole } from './experience/liveViews.ts';
	import PlaybackPicker from './experience/PlaybackPicker.svelte';
	import { experience } from './experience/state.svelte.ts';
	import { lookClipThumbnail } from './moveThumbnails.ts';
	import { characterName, doc, store, toast, ui, view } from './state.svelte.ts';

	const moves = $derived(store.project?.manifest.rig.animations ?? []);
	const clips = $derived(playbackClips(moves));
	const choices = $derived(experience.liveRoles[doc.id]);
	const roles: { role: LiveRole; label: WhisperKey }[] = [
		{ role: 'idle', label: 'liveViews.idle' },
		{ role: 'walk', label: 'liveViews.walk' },
		{ role: 'attack', label: 'liveViews.attack' },
		{ role: 'jump', label: 'liveViews.jump' },
		{ role: 'attackUp', label: 'liveViews.attackUp' },
		{ role: 'attackDown', label: 'liveViews.attackDown' }
	];

	/** Automatic names the clip it plays now, so people see what a choice replaces. */
	function automatic(role: LiveRole) {
		if (role === 'attackUp' || role === 'attackDown') return t('liveViews.sameAsAttack');
		const chain = liveClips(moves, { ...choices, [role]: undefined })[role];
		const clip = chain.find((id) => moves.some((move) => move.id === id));
		return clip
			? t('liveViews.automaticClip', { clip: displayMove(clip, moves) })
			: t('liveViews.automaticNone');
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
	{/each}
	<p class="bu-muted small">{t('liveViews.sideAttackHelp')}</p>
	<section class="controls" aria-labelledby="live-controls">
		<h4 id="live-controls" class="small">{t('liveViews.controls')}</h4>
		<p class="bu-muted small">{t('liveViews.hintTopDown')}</p>
		<p class="bu-muted small">{t('liveViews.hintTouch')}</p>
	</section>
{:else}
	<p class="bu-muted">{t('liveViews.openCharacter')}</p>
{/if}

<style>
	.character {
		margin: 0;
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
