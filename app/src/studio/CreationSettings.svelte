<script lang="ts">
	import { formatNumber, t, type WhisperKey } from 'svelte-whisper';
	import {
		BODY_STEP,
		MODELS,
		MODEL_IDS,
		PRESETS,
		autoFrame,
		bodyErrors,
		sizeErrors,
		type CharacterModel
	} from './characterConfig.ts';
	import {
		itemMethods,
		moveModels,
		preferredMoveFrameCounts,
		saveCreationSettings,
		stateModels,
		type CreationSection,
		type CreationSettings
	} from './creationSettings.ts';
	import { displayError } from '../lib/i18n.ts';
	import {
		creationSettingsRevision,
		currentCreationSettings,
		noteCreationSettings
	} from './settingsDefaults.svelte.ts';

	let { section }: { section: CreationSection } = $props();
	const character = $derived(currentCreationSettings('characters').values);
	const move = $derived(currentCreationSettings('moves').values);
	const stateChoices = $derived(currentCreationSettings('states').values);
	const item = $derived(currentCreationSettings('items').values);
	const status = $derived(currentCreationSettings(section));
	const valid = $derived(status.valid);
	let error = $state<string>();
	let errorRevision = $state(-1);
	const automaticFrame = $derived(autoFrame(character.body));
	const moveFrames = $derived(preferredMoveFrameCounts(move.model));
	const characterNames = {
		v3: 'V3',
		pro: 'Pro',
		'pro-flash': 'Pro Flash',
		standard: 'Standard'
	} satisfies Record<CharacterModel, string>;
	const moveNames = { pixminimax: 'PixMiniMax', 'skeleton-v3': 'Skeleton V3', v3: 'V3' };
	const stateNames = { pro: 'Pro', 'pro-flash': 'Pro Flash', pixen: 'V3 (Pixen)' };
	const methodNames = {
		auto: 'creationSettings.automatic',
		skel: 'generationDetails.method.skeletonPose',
		anchor: 'generationDetails.method.frameEditing'
	} as const;
	const id = $props.id();

	function change<Section extends CreationSection>(
		scope: Section,
		update: Partial<CreationSettings[Section]>,
		input: HTMLInputElement | HTMLSelectElement,
		previous: string | number
	) {
		try {
			if (saveCreationSettings(localStorage, scope, update)) {
				error = undefined;
				noteCreationSettings();
				return;
			}
			if (scope === 'characters') {
				const next = { ...character, ...update };
				const [issue] =
					next.frame === 'auto'
						? bodyErrors(next.body, next.model)
						: sizeErrors(next.body, next.frame, next.model);
				const min = autoFrame(next.body);
				error =
					typeof next.frame === 'number' &&
					next.frame < min &&
					!bodyErrors(next.body, next.model).length
						? t('creationSettings.frameMinimum', { min })
						: issue
							? displayError(issue)
							: t('creationSettings.saveFailed');
			} else {
				error = t(
					scope === 'moves' ? 'creationSettings.incompatible' : 'creationSettings.saveFailed'
				);
			}
			noteCreationSettings();
		} catch {
			error = t('creationSettings.saveFailed');
		}
		errorRevision = creationSettingsRevision();
		input.value = String(previous);
	}
</script>

{#snippet field(name: string, label: WhisperKey, control: import('svelte').Snippet<[string]>)}
	<div class="preference" data-setting={name} tabindex="-1">
		<label for={`${id}-${name}`}>{t(label)}</label>
		{@render control(`${id}-${name}`)}
	</div>
{/snippet}

<p class="bu-muted note">{t('creationSettings.description')}</p>
{#if 'unavailable' in status}
	<p class="note" role="alert">{t('creationSettings.storageUnavailable')}</p>
{:else if !valid}
	<p class="note" role="alert">{t('creationSettings.readFailed')}</p>
{/if}
<fieldset disabled={!valid} aria-label={t('creationSettings.defaults')}>
	{#if section === 'characters'}
		{#snippet model(inputId: string)}
			<select
				id={inputId}
				class="bu-select select"
				value={character.model}
				onchange={({ currentTarget }) =>
					change(
						'characters',
						{ model: currentTarget.value as CharacterModel },
						currentTarget,
						character.model
					)}
			>
				{#each MODEL_IDS as option (option)}<option value={option}>{characterNames[option]}</option
					>{/each}
			</select>
		{/snippet}
		{#snippet clothing(inputId: string)}
			<select
				id={inputId}
				class="bu-select select"
				value={character.clothing}
				onchange={({ currentTarget }) =>
					change(
						'characters',
						{ clothing: currentTarget.value as CreationSettings['characters']['clothing'] },
						currentTarget,
						character.clothing
					)}
			>
				<option value="underwear">{t('create.form.underwear')}</option>
				<option value="none">{t('create.form.nothingWorn')}</option>
			</select>
		{/snippet}
		{#snippet body(inputId: string)}
			<input
				id={inputId}
				class="bu-input input"
				type="number"
				min={MODELS[character.model].body.min}
				max={MODELS[character.model].body.max}
				step={BODY_STEP}
				value={character.body}
				onchange={({ currentTarget }) =>
					change(
						'characters',
						{ body: currentTarget.valueAsNumber },
						currentTarget,
						character.body
					)}
			/>
		{/snippet}
		{#snippet frame(inputId: string)}
			<select
				id={inputId}
				class="bu-select select"
				value={character.frame === 'auto' ? 'auto' : 'custom'}
				onchange={({ currentTarget }) =>
					change(
						'characters',
						{ frame: currentTarget.value === 'auto' ? 'auto' : automaticFrame },
						currentTarget,
						character.frame === 'auto' ? 'auto' : 'custom'
					)}
			>
				<option value="auto"
					>{t('creationSettings.autoSize', { size: formatNumber(automaticFrame) })}</option
				>
				<option value="custom">{t('creationSettings.custom')}</option>
			</select>
		{/snippet}
		{#snippet frameSize(inputId: string)}
			<input
				id={inputId}
				class="bu-input input"
				type="number"
				min={automaticFrame}
				max="256"
				value={character.frame}
				onchange={({ currentTarget }) =>
					change(
						'characters',
						{ frame: currentTarget.valueAsNumber },
						currentTarget,
						character.frame
					)}
			/>
		{/snippet}
		{#snippet directions(inputId: string)}
			<select
				id={inputId}
				class="bu-select select"
				value={character.directions}
				onchange={({ currentTarget }) =>
					change(
						'characters',
						{ directions: currentTarget.value },
						currentTarget,
						character.directions
					)}
			>
				{#each PRESETS as option (option.id)}<option value={option.id}
						>{t(`create.form.presets.${option.id}` as WhisperKey)}</option
					>{/each}
			</select>
		{/snippet}
		{@render field('character-model', 'create.form.model', model)}
		{@render field('body-size', 'create.form.bodySize', body)}
		{@render field('frame-size', 'create.form.frameSize', frame)}
		{#if character.frame !== 'auto'}{@render field(
				'custom-frame',
				'generationDetails.settings.frame',
				frameSize
			)}{/if}
		{@render field('direction-presets', 'common.direction', directions)}
		{@render field('base-clothing', 'create.form.baseClothing', clothing)}
	{:else if section === 'moves'}
		{#snippet model(inputId: string)}
			<select
				id={inputId}
				class="bu-select select"
				value={move.model}
				onchange={({ currentTarget }) =>
					change(
						'moves',
						{ model: currentTarget.value as CreationSettings['moves']['model'] },
						currentTarget,
						move.model
					)}
			>
				{#each moveModels as option (option)}<option value={option}>{moveNames[option]}</option
					>{/each}
			</select>
		{/snippet}
		{#snippet frames(inputId: string)}
			<select
				id={inputId}
				class="bu-select select"
				value={move.frames}
				onchange={({ currentTarget }) =>
					change(
						'moves',
						{ frames: currentTarget.value === 'auto' ? 'auto' : Number(currentTarget.value) },
						currentTarget,
						move.frames
					)}
			>
				<option value="auto">{t('creationSettings.automatic')}</option>
				{#each moveFrames as option (option)}<option value={option}>{formatNumber(option)}</option
					>{/each}
			</select>
		{/snippet}
		{@render field('move-model', 'moveSheet.motionModel', model)}
		{@render field('move-frames', 'moveSheet.frames', frames)}
		{#if move.frames === 'auto'}
			<p class="bu-muted note">{t('creationSettings.automaticFramesHelp')}</p>
		{:else if move.model === 'v3'}
			<p class="bu-muted note">{t('creationSettings.framesHelp')}</p>
		{/if}
	{:else if section === 'states'}
		{#snippet model(inputId: string)}
			<select
				id={inputId}
				class="bu-select select"
				value={stateChoices.model}
				onchange={({ currentTarget }) =>
					change(
						'states',
						{ model: currentTarget.value as CreationSettings['states']['model'] },
						currentTarget,
						stateChoices.model
					)}
			>
				{#each stateModels as option (option)}<option value={option}>{stateNames[option]}</option
					>{/each}
			</select>
		{/snippet}
		{@render field('state-model', 'create.form.model', model)}
	{:else}
		{#snippet method(inputId: string)}
			<select
				id={inputId}
				class="bu-select select"
				value={item.method}
				onchange={({ currentTarget }) =>
					change(
						'items',
						{ method: currentTarget.value as CreationSettings['items']['method'] },
						currentTarget,
						item.method
					)}
			>
				{#each itemMethods as option (option)}<option value={option}
						>{t(methodNames[option])}</option
					>{/each}
			</select>
		{/snippet}
		{@render field('item-method', 'newItem.method', method)}
		{#if item.method === 'auto'}
			<p class="bu-muted note">
				{t('creationSettings.methodHelp', {
					pose: t(methodNames.skel),
					edit: t(methodNames.anchor)
				})}
			</p>
		{/if}
	{/if}
</fieldset>
{#if error && valid && errorRevision === creationSettingsRevision()}<p class="note" role="alert">
		{error}
	</p>{/if}

<style>
	.note {
		margin: 0;
	}
	fieldset {
		display: grid;
		margin: 0;
		padding: 0;
		border: 0;
		min-inline-size: 0;
	}
	fieldset > .note {
		margin-block-start: 8px;
	}
	.preference {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 50%);
		align-items: center;
		gap: 12px;
		min-block-size: 48px;
		padding-block: 4px;
	}
	.preference :is(input, select) {
		inline-size: 100%;
		min-inline-size: 0;
	}
	@media (max-width: 380px) {
		.preference {
			grid-template-columns: minmax(0, 1fr);
			gap: 4px;
		}
	}
</style>
