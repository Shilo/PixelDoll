<script lang="ts">
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { experience } from './experience/state.svelte.ts';
	import {
		activeRiderPose,
		riderPoseOptions,
		setMountLegs,
		setRidingPose,
		setShowMount
	} from './experience/riderPose.ts';
	import type { MountLegMode } from './experience/mountLegs.ts';
	import { Footprints, PawPrint, PersonStanding } from './icons.ts';
	import { applyRiderPose } from './mountPreview.ts';
	import MountPreview from './MountPreview.svelte';
	import SettingsItemSegmented from './SettingsItemSegmented.svelte';
	import SettingsItemToggle from './SettingsItemToggle.svelte';
	import { doc, store, toast } from './state.svelte.ts';

	const id = $props.id();
	const manifest = $derived(store.project?.manifest);
	const moves = $derived(manifest?.rig.animations ?? []);
	const poses = $derived(riderPoseOptions(manifest));
	const pose = $derived(activeRiderPose(doc.id, manifest));
	const legOptions = $derived([
		{ value: 'none', label: t('common.none') },
		{ value: 'far', label: t('toolbar.farLeg') },
		{ value: 'both', label: t('toolbar.bothLegs') }
	] as const);

	function saved(ok: boolean) {
		if (!ok) toast(message('settings.mountNotSaved'), { tone: 'warning' });
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
	<label class="row riding-pose" data-setting="riding-pose" for="{id}-pose">
		<PersonStanding size={18} aria-hidden="true" />
		<span class="row-name">{t('toolbar.riderPose')}</span>
		<select
			id="{id}-pose"
			class="bu-input input"
			value={pose ?? ''}
			onchange={(event) => {
				saved(setRidingPose(doc.id, event.currentTarget.value));
				applyRiderPose();
			}}
		>
			<option value="">{t('toolbar.riderPoseRide')}</option>
			{#each poses as option (option.id)}
				<option value={option.id} disabled={option.missing.length > 0}
					>{option.missing.length
						? t('toolbar.riderPoseIncomplete', {
								name: displayMove(option.id, moves),
								directions: option.missing.map(displayDirectionInSentence).join(', ')
							})
						: displayMove(option.id, moves)}</option
				>
			{/each}
		</select>
	</label>
{/if}
<SettingsItemSegmented
	label={t('toolbar.hideLegs')}
	setting="hide-legs"
	options={legOptions}
	value={experience.mountLegs}
	disabled={!!pose}
	onselect={(value: MountLegMode) => saved(setMountLegs(value))}
>
	{#snippet icon()}<Footprints size={18} aria-hidden="true" />{/snippet}
</SettingsItemSegmented>
{#if experience.testMount && experience.mountLegIssue}
	<p class="bu-muted small">{experience.mountLegIssue}</p>
{/if}

<style>
	.riding-pose {
		inline-size: 100%;
		min-height: 44px;
		padding-inline: 0;
		gap: 10px;
	}
	.riding-pose select {
		inline-size: auto;
		max-inline-size: 15rem;
		margin-inline-start: auto;
	}
</style>
