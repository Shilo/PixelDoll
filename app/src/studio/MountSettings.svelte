<script lang="ts">
	import { getLocale, t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import { buildPresentation, itemsHiddenIn } from './experience/presentation.ts';
	import { experience } from './experience/state.svelte.ts';
	import {
		activeRiderPose,
		legsKept,
		riderPoseOptions,
		setMountLegs,
		setRidingPose,
		setShowMount
	} from './experience/riderPose.ts';
	import type { MountLegMode } from './experience/mountLegs.ts';
	import PlaybackPicker from './experience/PlaybackPicker.svelte';
	import { Footprints, PawPrint, TriangleAlert } from './icons.ts';
	import { applyRiderPose } from './mountPreview.ts';
	import { lookClipThumbnail } from './moveThumbnails.ts';
	import MountPreview from './MountPreview.svelte';
	import SettingsItemSegmented from './SettingsItemSegmented.svelte';
	import SettingsItemToggle from './SettingsItemToggle.svelte';
	import { doc, store, toast, ui, view } from './state.svelte.ts';

	const manifest = $derived(store.project?.manifest);
	const moves = $derived(manifest?.rig.animations ?? []);
	const clips = $derived(playbackClips(moves).filter((clip) => clip.key !== DEFAULT_MOVE));
	const poses = $derived(riderPoseOptions(manifest));
	const pose = $derived(activeRiderPose(doc.id, manifest));
	const unavailable = $derived(
		new Map(
			poses
				.filter((option) => option.missing.length)
				.map((option) => [
					option.id,
					t('toolbar.riderPoseMissing', {
						directions: option.missing.map(displayDirectionInSentence).join(', ')
					})
				])
		)
	);
	// Items are drawn on Standing first, so a chosen pose may lack some; they hide while riding in it.
	const hidden = $derived.by(() => {
		if (!pose || !view.project) return '';
		const names = itemsHiddenIn(buildPresentation(view.project), view.items, pose).map(
			(item) => item.name
		);
		return names.length
			? new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(names)
			: '';
	});
	const legOptions = $derived([
		{ value: 'none', label: t('common.none') },
		{ value: 'far', label: t('toolbar.farLeg') },
		{ value: 'both', label: t('toolbar.bothLegs') }
	] as const);

	function saved(ok: boolean) {
		if (!ok) toast(message('settings.mountNotSaved'), { tone: 'warning' });
	}
	function choosePose(clip: string) {
		if (!doc.id) return;
		saved(setRidingPose(doc.id, clip));
		applyRiderPose();
	}
</script>

<MountPreview />
<SettingsItemToggle
	setting="show-mount"
	checked={experience.testMount}
	onchange={(event) => {
		saved(setShowMount(event.currentTarget.checked));
		applyRiderPose();
	}}
>
	<PawPrint size={18} aria-hidden="true" />
	<span class="row-name">{t('toolbar.showMount')}</span>
</SettingsItemToggle>
{#if doc.id}
	<div class="riding-pose" data-setting="riding-pose" tabindex="-1">
		<PlaybackPicker
			settings
			{clips}
			moveRefs={moves}
			selected={pose ?? ''}
			label={t('toolbar.riderPose')}
			automatic={t('toolbar.riderPoseRide')}
			{unavailable}
			thumbnail={(key) => view.project && lookClipThumbnail(view.project, view.items, key, ui.dir)}
			onselect={choosePose}
		/>
		{#if hidden}<p class="notice warn small" role="status">
				<TriangleAlert size={14} aria-hidden="true" />{t('toolbar.riderPoseHides', {
					items: hidden
				})}
			</p>{/if}
	</div>
{/if}
<SettingsItemSegmented
	label={t('toolbar.hideLegs')}
	setting="hide-legs"
	options={legOptions}
	value={experience.mountLegs}
	disabled={legsKept(manifest, pose ?? null)}
	onselect={(value: MountLegMode) => saved(setMountLegs(value))}
>
	{#snippet icon()}<Footprints size={18} aria-hidden="true" />{/snippet}
</SettingsItemSegmented>
{#if experience.testMount && experience.mountLegIssue}
	<p class="bu-muted small">{experience.mountLegIssue}</p>
{/if}

<style>
	.riding-pose {
		display: grid;
		gap: 6px;
	}
	.riding-pose .notice {
		margin: 0;
	}
</style>
