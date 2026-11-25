<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SegmentedControl } from '@shilo/bronze-ui/svelte';
	import Help from './Help.svelte';
	import ReferenceField from './ReferenceField.svelte';
	import SizePreview from './SizePreview.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import DirectionPresets from './DirectionPresets.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { characterEnhanceInput } from './enhanceCharacter.ts';
	import type { EnhanceSpec } from './promptEnhance.ts';
	import { Copy, Check, ChevronRight } from './icons.ts';
	import PromptField from './PromptField.svelte';
	import PromptSuggestions from './PromptSuggestions.svelte';
	import { promptSuggestions } from './promptSuggestions.svelte.ts';
	import { displayDirectionShort } from './displayDirection.ts';
	import { displayError, displayMessage, errorMessage } from '../lib/i18n.ts';
	import { message as notice, type Message } from '../lib/message.ts';
	import { t, type WhisperKey } from 'svelte-whisper';
	import {
		autoFrame,
		BODY_SIZES,
		BODY_STEP,
		bodyErrors,
		characterReference,
		characterReferenceIssue,
		DETAILS,
		draftErrors,
		isNudeBase,
		MODEL_IDS,
		MODELS,
		modelOf,
		OUTLINES,
		presetOf,
		readPrompt,
		setPreset,
		toggleDirection,
		toggleMirror,
		TRAITS,
		TRAIT_KEYS,
		UNSET,
		validBodySize,
		writeDetails,
		writeNudeBase,
		writeTrait,
		type CharacterDraft,
		type CharacterModel,
		type Trait
	} from './characterConfig.ts';
	import type { DirectionName } from '../lib/rig/rig.ts';

	let {
		draft: d = $bindable(),
		busy = $bindable(false),
		referenceLoading = $bindable(false),
		onconnect,
		enhanceScope
	}: {
		draft: CharacterDraft;
		busy?: boolean;
		referenceLoading?: boolean;
		enhanceScope: string;
		onconnect: (target: 'details' | 'prompt') => void;
	} = $props();
	// Trait, preset, model and style values are prompt and draft data; only their displayed names are translated.
	const TRAIT_TEXT: Record<Trait, { label: WhisperKey; help: WhisperKey }> = {
		kind: { label: 'create.form.traits.kind.label', help: 'create.form.traits.kind.help' },
		build: { label: 'create.form.traits.build.label', help: 'create.form.traits.build.help' },
		proportions: {
			label: 'create.form.traits.proportions.label',
			help: 'create.form.traits.proportions.help'
		},
		skin: { label: 'create.form.traits.skin.label', help: 'create.form.traits.skin.help' }
	};
	const OPTION_TEXT: Record<string, WhisperKey> = {
		Human: 'create.form.traitOptions.human',
		Elf: 'create.form.traitOptions.elf',
		Dwarf: 'create.form.traitOptions.dwarf',
		Orc: 'create.form.traitOptions.orc',
		Undead: 'create.form.traitOptions.undead',
		Slender: 'create.form.traitOptions.slender',
		Broad: 'create.form.traitOptions.broad',
		Muscular: 'create.form.traitOptions.muscular',
		Rounded: 'create.form.traitOptions.rounded',
		Natural: 'create.form.traitOptions.natural',
		Chibi: 'create.form.traitOptions.chibi',
		'Deep brown': 'create.form.traitOptions.deepBrown',
		Brown: 'create.form.traitOptions.brown',
		Tan: 'create.form.traitOptions.tan',
		'Light tan': 'create.form.traitOptions.lightTan',
		Light: 'create.form.traitOptions.light',
		Pale: 'create.form.traitOptions.pale'
	};
	const optionText = (option: string) => (OPTION_TEXT[option] ? t(OPTION_TEXT[option]) : option);
	const MODEL_TEXT: Record<CharacterModel, { label: WhisperKey; help: WhisperKey }> = {
		v3: { label: 'create.form.models.v3.label', help: 'create.form.models.v3.help' },
		standard: {
			label: 'create.form.models.standard.label',
			help: 'create.form.models.standard.help'
		},
		pro: { label: 'create.form.models.pro.label', help: 'create.form.models.pro.help' },
		'pro-flash': {
			label: 'create.form.models.proFlash.label',
			help: 'create.form.models.proFlash.help'
		}
	};
	const modelId = $derived(
		MODEL_IDS.includes(d.model as CharacterModel) ? (d.model as CharacterModel) : 'v3'
	);
	const OUTLINE_TEXT: Record<string, WhisperKey> = {
		'single color outline': 'generationDetails.outline.colored',
		'selective outline': 'generationDetails.outline.selective',
		lineless: 'generationDetails.outline.none'
	};
	const DETAIL_TEXT: Record<string, WhisperKey> = {
		'low detail': 'generationDetails.detail.low',
		'highly detailed': 'generationDetails.detail.high'
	};
	const styleText = (keys: Record<string, WhisperKey>, value: string, fallback: string) =>
		keys[value] ? t(keys[value]) : fallback;
	let frameInput: HTMLInputElement;
	let message = $state<Message | string>(''),
		copied = $state(false);
	let detailsField = $state<PromptField>();
	let promptField = $state<PromptField>();
	const frame = $derived(d.auto && Number.isFinite(d.body) ? autoFrame(d.body!) : d.frame);
	// Advanced starts open when a reopened draft already changed something there, so no choice is hidden.
	// It is bound, not set once, so a re-render (a new summary note after a model change) never closes it.
	let advancedOpen = $state(!!(d.seed || (d.model && d.model !== 'v3') || d.outline || d.detail));
	// The selected model's limits (MODELS in characterConfig.ts) decide which controls show and what they accept.
	const model = $derived(modelOf(d.model));
	const bodyErrorValue = $derived(bodyErrors(d.body, d.model)[0]);
	const bodyError = $derived(bodyErrorValue ? displayError(bodyErrorValue) : '');
	const referenceMax = $derived(
		Math.min(
			characterReference[modelId].max,
			(modelId === 'pro-flash' || modelId === 'standard') && d.body && !bodyError
				? d.body
				: modelId === 'v3' && frame && Number.isInteger(frame) && frame >= 32
					? frame
					: Infinity
		)
	);
	const advancedNote = $derived(
		[
			model === MODELS.v3 ? '' : t(MODEL_TEXT[modelId].label),
			model.styleHints && d.outline
				? t('create.form.outlineNote', {
						outline: styleText(
							OUTLINE_TEXT,
							d.outline,
							OUTLINES.find((o) => o.value === d.outline)?.label ?? d.outline
						)
					})
				: '',
			model.styleHints && d.detail
				? t('create.form.detailNote', {
						detail: styleText(
							DETAIL_TEXT,
							d.detail,
							DETAILS.find((o) => o.value === d.detail)?.label ?? d.detail
						)
					})
				: '',
			d.seed ? t('generationDetails.seed', { seed: d.seed }) : ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	const preset = $derived(presetOf(d));
	const errors = $derived(draftErrors(d));
	let promoted = $state<DirectionName | undefined>();
	const announcement = $derived(
		promoted ? t('create.form.ownView', { direction: displayDirectionShort(promoted) }) : ''
	);
	const editorHelpId = $props.id(),
		bodyErrorId = `${editorHelpId}-body-error`;
	const editorHelpText = $derived(
		d.tab === 'appearance' ? t('create.form.appearanceHelp') : t('create.form.promptHelp')
	);
	// Both fields enhance the whole appearance: Details sends the full prompt and keeps only the prose it gets back.
	const promptSpec = $derived.by((): Extract<EnhanceSpec, { kind: 'character' }> => {
		const { description: _description, ...input } = characterEnhanceInput(d);
		return { kind: 'character', input };
	});
	const detailsSpec = $derived<EnhanceSpec>({ ...promptSpec, description: d.prompt });
	const enhanceBlocked = $derived(
		referenceLoading || !validBodySize(d.body) || d.prompt.length > 2000
	);
	function acceptDetails(enhanced: string): string | Message {
		// The enhancer sees the whole appearance. Its prose improves Details; selected hints remain authoritative.
		const parsed = { ...d };
		readPrompt(parsed, enhanced);
		for (const key of TRAIT_KEYS) writeTrait(parsed, key, UNSET);
		if (!parsed.details.trim()) return notice('create.form.noDetails');
		const candidate = { ...d };
		writeDetails(candidate, parsed.details);
		if (candidate.prompt.length > 2000) return notice('create.form.tooLong');
		return parsed.details;
	}
	function edited() {
		message = '';
		copied = false;
	}
	function details(value: string) {
		edited();
		writeDetails(d, value);
	}
	function trait(key: Trait, value: string) {
		edited();
		detailsField?.clearUndo();
		writeTrait(d, key, value);
	}
	function tabKey(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
		e.preventDefault();
		d.tab =
			e.key === 'Home'
				? 'appearance'
				: e.key === 'End'
					? 'prompt'
					: d.tab === 'appearance'
						? 'prompt'
						: 'appearance';
		document.getElementById(`${d.tab}-tab`)?.focus();
	}
	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(d.prompt);
			copied = true;
			message = '';
		} catch {
			d.tab = 'prompt';
			message = notice('create.form.selectToCopy');
		}
	}
	// Connecting from Enhance reopens the form; finish the enhancement that asked for the key.
	onMount(() => {
		const target = d.enhanceOnConnect;
		delete d.enhanceOnConnect;
		if (!target || !app.key) return;
		d.tab = target === 'details' ? 'appearance' : 'prompt';
		void tick().then(() => (target === 'details' ? detailsField : promptField)?.enhance());
	});
</script>

<div class="creator-grid">
	<section class="appearance" aria-label={t('create.form.appearanceSection')}>
		<div class="editor-toolbar">
			<div
				class="creator-tabs bu-tabs"
				role="tablist"
				tabindex="-1"
				aria-label={t('create.form.promptEditor')}
			>
				<button
					role="tab"
					id="appearance-tab"
					aria-controls="appearance-panel"
					tabindex={d.tab === 'appearance' ? 0 : -1}
					aria-selected={d.tab === 'appearance'}
					onkeydown={tabKey}
					onclick={() => (d.tab = 'appearance')}>{t('create.form.appearanceTab')}</button
				>
				<button
					role="tab"
					id="prompt-tab"
					aria-controls="prompt-panel"
					tabindex={d.tab === 'prompt' ? 0 : -1}
					aria-selected={d.tab === 'prompt'}
					onkeydown={tabKey}
					onclick={() => (d.tab = 'prompt')}>{t('common.prompt')}</button
				>
			</div>
			<Help
				iconOnly
				tooltipId={editorHelpId}
				title={d.tab === 'appearance'
					? t('create.form.appearanceHelpTitle')
					: t('create.form.promptHelpTitle')}
				text={editorHelpText}
			/>
		</div>
		{#if d.tab === 'appearance'}
			<div
				id="appearance-panel"
				role="tabpanel"
				aria-labelledby="appearance-tab"
				class="editor-panel"
			>
				<div class="creator-field">
					<PromptField
						bind:this={detailsField}
						bind:busy
						class="details-input"
						label={t('common.details')}
						copyLabel={t('create.form.copyDetails')}
						value={d.details}
						onvalue={details}
						save={() => d.prompt}
						restore={(saved) => {
							edited();
							readPrompt(d, saved);
						}}
						spec={detailsSpec}
						accept={acceptDetails}
						activity={{ scope: `${enhanceScope}:details`, label: 'Enhance character prompt' }}
						maxOutput={2000}
						enhanceDisabled={enhanceBlocked}
						onconnect={() => onconnect('details')}
						onmessage={(note) => (message = note)}
						maxlength={2000}
						placeholder={t('create.form.detailsPlaceholder')}
					/>
					<PromptSuggestions
						label={t('create.form.lookIdeas')}
						value={d.details}
						suggestions={promptSuggestions('character.look')}
						onpick={(idea) => details(idea.prompt)}
					/>
				</div>
				{#each TRAIT_KEYS as key (key)}
					<div class="trait-row">
						<Help title={t(TRAIT_TEXT[key].label)} text={t(TRAIT_TEXT[key].help)} /><select
							class="bu-input input"
							aria-label={t(TRAIT_TEXT[key].label)}
							value={d[key]}
							onchange={(e) => trait(key, e.currentTarget.value)}
							><option value={UNSET}>{t('create.form.notSet')}</option
							>{#each TRAITS[key].options as option (option)}<option value={option}
									>{optionText(option)}</option
								>{/each}</select
						>
					</div>
				{/each}
				<div class="base-clothing compact-segments">
					<Help title={t('create.form.baseClothing')} text={t('create.form.baseClothingHelp')} />
					<SegmentedControl
						label={t('create.form.baseClothing')}
						options={[
							{ value: 'underwear', label: t('create.form.underwear') },
							{ value: 'none', label: t('create.form.nothingWorn') }
						]}
						value={isNudeBase(d) ? 'none' : 'underwear'}
						onchange={(selection) => {
							edited();
							detailsField?.clearUndo();
							writeNudeBase(d, selection === 'none');
						}}
					/>
				</div>
				<div class="prompt-note">
					<button
						class="prompt-excerpt"
						onclick={() => (d.tab = 'prompt')}
						aria-label={t('create.form.editPrompt')}>{d.prompt}</button
					><button
						class="bu-action btn icon copy"
						data-variant="outline"
						title={t('create.form.copyPrompt')}
						aria-label={t('create.form.copyPrompt')}
						onclick={copyPrompt}
						>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</button
					>
				</div>
			</div>
		{:else}
			<div id="prompt-panel" role="tabpanel" aria-labelledby="prompt-tab" class="editor-panel">
				<PromptField
					bind:this={promptField}
					bind:busy
					class="exact-input"
					label={t('create.form.exactPrompt')}
					copyLabel={t('create.form.copyPrompt')}
					value={d.prompt}
					onvalue={(text) => {
						edited();
						readPrompt(d, text);
					}}
					spec={promptSpec}
					activity={{ scope: `${enhanceScope}:prompt`, label: 'Enhance character prompt' }}
					maxOutput={2000}
					enhanceDisabled={enhanceBlocked}
					onconnect={() => onconnect('prompt')}
					onmessage={(note) => (message = note)}
					maxlength={2000}
					spellcheck={false}
				/>
			</div>
		{/if}
		{#if message}<p class="creator-message" role="status">{displayMessage(message)}</p>{/if}
	</section>

	<section class="creator-rail" aria-label={t('create.form.sizeGuideReference')}>
		<div class="creator-guide">
			<h3>{t('create.form.sizeGuide')}</h3>
			<SizePreview body={d.body || 0} frame={frame || 0} />
		</div>
		<ReferenceField
			bind:value={d.reference}
			bind:loading={referenceLoading}
			label={modelId === 'standard' ? t('create.form.reference.characterSprite') : undefined}
			hint={t(characterReference[modelId].hint)}
			max={{ width: referenceMax, height: referenceMax }}
			issue={displayError(characterReferenceIssue(d.reference, d.model, frame, d.body) ?? '')}
			disabled={busy}
		/>
	</section>
	<section class="geometry" aria-label={t('create.form.geometrySection')}>
		<div class="creator-field">
			<Help
				title={t('create.form.bodySize')}
				text={t('create.form.bodySizeHelp', {
					min: model.body.min,
					max: model.body.max,
					step: BODY_STEP
				})}
			/>
			<div class="body-presets" role="group" aria-label={t('create.form.bodyPresets')}>
				{#each BODY_SIZES as size (size)}<button
						class="bu-action btn"
						data-variant="outline"
						disabled={size < model.body.min || size > model.body.max}
						aria-pressed={d.bodyPreset === size}
						onclick={() => {
							d.body = size;
							d.bodyPreset = size;
						}}>{size}</button
					>{/each}
			</div>
			<div class="pixel-input">
				<input
					class="bu-input input"
					aria-label={t('create.form.bodySize')}
					type="number"
					min={model.body.min}
					max={model.body.max}
					step={BODY_STEP}
					aria-invalid={!!bodyError}
					aria-describedby={bodyError ? bodyErrorId : undefined}
					bind:value={d.body}
					oninput={() => (d.bodyPreset = null)}
				/><span aria-hidden="true">px</span>
			</div>
			{#if bodyError}<p class="field-error" id={bodyErrorId}>{bodyError}</p>{/if}
		</div>
		<div class="creator-field">
			<Help title={t('generationDetails.settings.frame')} text={t('create.form.frameHelp')} />
			<div class="frame-controls">
				<button
					class="bu-action btn"
					data-variant="outline"
					aria-pressed={d.auto}
					onclick={() => {
						d.frame = frame;
						d.auto = !d.auto;
						if (!d.auto) {
							frameInput.focus();
							frameInput.select();
						}
					}}>{t('create.form.auto')}</button
				>
				<div class="pixel-input">
					<input
						bind:this={frameInput}
						class="bu-input input"
						aria-label={t('create.form.frameSize')}
						type="number"
						min={autoFrame(d.body || 32)}
						max="256"
						step="1"
						value={frame ?? ''}
						oninput={(e) => {
							d.auto = false;
							d.frame = e.currentTarget.value === '' ? undefined : e.currentTarget.valueAsNumber;
						}}
					/><span aria-hidden="true">px</span>
				</div>
			</div>
		</div>
		{#if (frame ?? 0) > 80}<p class="creator-message">
				{(frame ?? 0) > 128 ? t('create.form.frameAbove128') : t('create.form.frameAbove80')}
			</p>{/if}
		<div class="creator-field camera">
			<Help
				title={t('generationDetails.settings.camera')}
				text={t('create.form.cameraHelp')}
			/><select
				class="bu-input input"
				aria-label={t('generationDetails.settings.camera')}
				bind:value={d.view}
				><option value="low top-down">{t('create.form.cameras.low')}</option><option
					value="high top-down">{t('create.form.cameras.high')}</option
				><option value="side">{t('create.form.cameras.side')}</option></select
			>
		</div>
	</section>

	<section class="facing" aria-label={t('create.form.directionsSection')}>
		<Help title={t('common.directions')} text={t('create.form.directionsHelp')} />
		<DirectionPresets
			active={preset}
			onselect={(choice) => {
				setPreset(d, choice.id);
				promoted = undefined;
			}}
		/>
		<DirectionCompass
			label={t('create.form.facingDirections')}
			selected={d.selected}
			mirrors={d.mirrors}
			shortLabels
			ontoggle={(dir) => (promoted = toggleDirection(d, dir))}
			onmirror={(dir) => toggleMirror(d, dir)}
		/>
		<span class="direction-announcement" aria-live="polite">{announcement}</span>
		<details class="disclosure advanced" bind:open={advancedOpen}>
			<summary
				><ChevronRight size={14} />{t('common.advanced')}{#if advancedNote}<span
						class="faint advanced-note">{advancedNote}</span
					>{/if}</summary
			>
			<div>
				<div class="trait-row">
					<Help title={t('create.form.model')} text={t('create.form.modelHelp')} /><select
						class="bu-input input"
						aria-label={t('create.form.model')}
						value={d.model ?? 'v3'}
						onchange={(e) => (d.model = e.currentTarget.value as CharacterModel)}
						>{#each MODEL_IDS as id (id)}<option value={id}>{t(MODEL_TEXT[id].label)}</option
							>{/each}</select
					>
				</div>
				{#if model.styleHints}
					<div class="trait-row">
						<Help
							title={t('generationDetails.settings.outline')}
							text={t('create.form.outlineHelp')}
						/><select
							class="bu-input input"
							aria-label={t('generationDetails.settings.outline')}
							value={d.outline ?? ''}
							onchange={(e) => (d.outline = e.currentTarget.value)}
							>{#each OUTLINES as o (o.value)}<option value={o.value}
									>{o.value
										? styleText(OUTLINE_TEXT, o.value, o.label)
										: t('create.form.outlines.default')}</option
								>{/each}</select
						>
					</div>
					<div class="trait-row">
						<Help
							title={t('generationDetails.settings.detail')}
							text={t('create.form.detailHelp')}
						/><select
							class="bu-input input"
							aria-label={t('generationDetails.settings.detail')}
							value={d.detail ?? ''}
							onchange={(e) => (d.detail = e.currentTarget.value)}
							>{#each DETAILS as o (o.value)}<option value={o.value}
									>{o.value
										? styleText(DETAIL_TEXT, o.value, o.label)
										: t('create.form.details.default')}</option
								>{/each}</select
						>
					</div>
				{:else}
					<p class="faint small">
						{t('create.form.modelSummary', {
							help: t(MODEL_TEXT[modelId].help),
							min: model.body.min,
							max: model.body.max
						})}
					</p>
				{/if}
				<div class="trait-row">
					<Help
						title={t('generationDetails.settings.seed')}
						text={t('create.form.seedHelp')}
					/><input
						class="bu-input input"
						aria-label={t('generationDetails.settings.seed')}
						inputmode="numeric"
						pattern="[0-9]*"
						bind:value={d.seed}
						placeholder={t('create.form.random')}
					/>
				</div>
			</div>
		</details>
	</section>
</div>
{#if errors.length}<p class="creator-validation" role="status">{displayError(errors[0])}</p>{/if}

<style>
	.creator-grid {
		display: grid;
		grid-template-columns: minmax(250px, 1.1fr) minmax(170px, 0.8fr) minmax(290px, 1.15fr);
		gap: 24px;
		align-items: start;
	}
	section {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.appearance {
		gap: 10px;
		container-type: inline-size;
	}
	.editor-toolbar {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
	}
	.creator-tabs {
		display: flex;
		flex: 0 1 auto;
		min-width: max-content;
		gap: 3px;
		padding: 3px;
	}
	.creator-tabs button {
		flex: 1;
		height: 40px;
		padding: 0 6px;
		font-size: var(--fs-sm);
	}

	.editor-panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 336px;
	}
	.creator-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	:global(.appearance .details-input) {
		resize: vertical;
		min-height: 82px;
		max-height: 160px;
		font-size: var(--fs);
	}
	.trait-row {
		display: grid;
		grid-template-columns: 88px minmax(0, 1fr);
		gap: 8px;
		align-items: center;
	}
	.trait-row :global(.help-title) {
		align-self: center;
	}
	.base-clothing {
		display: grid;
		gap: 4px;
	}
	.base-clothing :global(.help-title) {
		justify-self: start;
	}
	.input {
		width: 100%;
		min-width: 0;
	}
	.prompt-note {
		display: flex;
		align-items: flex-start;
		gap: 4px;
		padding-top: 2px;
	}
	.prompt-excerpt {
		flex: 1;
		min-width: 0;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
		text-align: left;
		border: 0;
		background: none;
		padding: 0;
		color: var(--text-3);
		font: inherit;
		font-size: 11px;
		line-height: 1.5;
		cursor: pointer;
		height: 49.5px;
		overflow-wrap: anywhere;
	}
	.copy {
		flex: none;
		color: var(--text-3);
	}
	:global(.appearance .exact-input) {
		min-height: 302px;
		resize: vertical;
		line-height: 1.6;
		font-size: var(--fs-sm);
	}
	.body-presets,
	.frame-controls {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 5px;
	}
	.body-presets .btn,
	.frame-controls .btn {
		padding-inline: 0;
	}
	.frame-controls .btn {
		height: auto;
		align-self: stretch;
	}
	.frame-controls .pixel-input {
		grid-column: span 3;
	}
	.pixel-input {
		position: relative;
		min-width: 0;
	}
	.pixel-input input {
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

	@media (pointer: coarse) {
		.creator-tabs button {
			min-height: 44px;
		}
	}
	.direction-announcement {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.advanced {
		margin-top: 4px;
	}
	.advanced > summary {
		min-height: 36px;
	}
	.advanced-note {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 400;
		font-size: var(--fs-sm);
	}
	.advanced > div {
		padding-left: 0;
		gap: 10px;
	}
	.creator-message,
	.creator-validation {
		color: var(--text-2);
		font-size: var(--fs-sm);
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.creator-validation,
	.field-error {
		color: var(--danger-text, var(--text-2));
	}
	.field-error {
		margin: 0;
		font-size: var(--fs-sm);
		line-height: 1.5;
	}
	@media (max-width: 850px) {
		.creator-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 22px;
		}
		.facing {
			grid-column: 1/-1;
			max-width: 360px;
		}
	}
	@media (max-width: 599px), (max-height: 499px) {
		.creator-grid {
			display: flex;
			flex-direction: column;
			gap: 22px;
		}
		section {
			width: 100%;
		}
		.editor-panel {
			min-height: 0;
		}
		.creator-tabs button {
			height: 40px;
		}
		.editor-toolbar {
			min-height: 46px;
		}
		.trait-row {
			grid-template-columns: 90px minmax(0, 1fr);
		}
		.input {
			min-height: 44px;
			font-size: 16px;
		}
		.body-presets .btn,
		.frame-controls .btn {
			min-height: 44px;
		}
		.facing {
			max-width: none;
		}
		:global(.appearance .exact-input) {
			min-height: 300px;
		}
		.prompt-excerpt {
			font-size: 12px;
			height: 54px;
		}
	}
	@media (pointer: coarse) {
		.editor-toolbar .creator-tabs button {
			min-width: 44px;
		}
	}
	@media (max-width: 599px), (max-height: 499px), (pointer: coarse) {
		@container (max-width:400px) {
			.editor-toolbar :global(.help-title.icon-only) {
				width: 32px;
				min-width: 32px;
			}
		}
	}
</style>
