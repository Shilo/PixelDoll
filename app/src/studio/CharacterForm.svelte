<script lang="ts">
	import { onMount } from 'svelte';
	import Help from './Help.svelte';
	import ReferenceField from './ReferenceField.svelte';
	import SizePreview from './SizePreview.svelte';
	import ApiPeek from './ApiPeek.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { ApiError } from '../lib/pixellab/client.ts';
	import { enhanceCharacter } from './enhanceCharacter.ts';
	import { routes } from '../lib/pixellab/routes.ts';
	import { Copy, Check, ChevronRight, WandSparkles, Undo2 } from './icons.ts';
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
		PRESETS,
		presetOf,
		readPrompt,
		setPreset,
		styleOf,
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
		onconnect
	}: {
		draft: CharacterDraft;
		busy?: boolean;
		referenceLoading?: boolean;
		onconnect: (target: 'details' | 'prompt') => void;
	} = $props();
	const scope = `enhance:${crypto.randomUUID()}`;
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
	const PRESET_TEXT: Record<string, WhisperKey> = {
		eight: 'create.form.presets.eight',
		four: 'create.form.presets.four',
		diagonal: 'create.form.presets.diagonal',
		side: 'create.form.presets.side',
		unique: 'create.form.presets.unique'
	};
	const MODEL_TEXT: Record<CharacterModel, { label: WhisperKey; help: WhisperKey }> = {
		v3: { label: 'create.form.models.v3.label', help: 'create.form.models.v3.help' },
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
		copied = $state<'details' | 'prompt' | null>(null);
	let undo = $state<{ target: 'details' | 'prompt'; before: string; after: string } | null>(null);
	let abort: AbortController | undefined;
	let alive = true;
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
			modelId === 'pro-flash' && d.body && !bodyError
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
	const enhanceTarget = $derived(d.tab === 'appearance' ? 'details' : 'prompt');
	let editorHelp: { show: () => Promise<void>; hide: () => void };
	const editorHelpId = $props.id(),
		bodyErrorId = `${editorHelpId}-body-error`;
	const editorHelpText = $derived(
		d.tab === 'appearance' ? t('create.form.appearanceHelp') : t('create.form.promptHelp')
	);
	// Enhance with the chosen V3 style hints, so the text it writes fits the drawing they guide.
	const enhanceInput = () => ({
		description: d.prompt,
		image_size: { width: d.body || 0, height: d.body || 0 },
		view: d.view,
		...(({ outline, detail }) => ({
			...(outline ? { outline } : {}),
			...(detail ? { detail } : {})
		}))(styleOf(d))
	});
	const canEnhance = (target: 'details' | 'prompt') =>
		!busy &&
		!referenceLoading &&
		!!(target === 'details' ? d.details : d.prompt).trim() &&
		validBodySize(d.body) &&
		enhanceInput().description.length <= 2000;
	const canUndo = (target: 'details' | 'prompt') =>
		undo?.target === target && undo.after === d.prompt;
	function edited() {
		undo = null;
		message = '';
		copied = null;
	}
	function details(value: string) {
		edited();
		writeDetails(d, value);
	}
	function trait(key: Trait, value: string) {
		edited();
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
	async function copy(target: 'details' | 'prompt') {
		try {
			await navigator.clipboard.writeText(target === 'details' ? d.details : d.prompt);
			copied = target;
			message = '';
		} catch {
			if (target === 'prompt') d.tab = 'prompt';
			message = notice('create.form.selectToCopy');
		}
	}
	async function enhance(target: 'details' | 'prompt') {
		copied = null;
		if (canUndo(target)) {
			readPrompt(d, undo!.before);
			undo = null;
			message = '';
			return;
		}
		if (!canEnhance(target)) return;
		if (!app.key) {
			onconnect(target);
			return;
		}
		const input = enhanceInput(),
			before = d.prompt;
		abort = new AbortController();
		busy = true;
		message = '';
		try {
			const enhanced = await enhanceCharacter(app.key, input, abort.signal, scope);
			if (!alive) return;
			if (d.prompt !== before || d.body !== input.image_size.width || d.view !== input.view) {
				message = notice('create.form.settingsChanged');
				return;
			}
			if (target === 'prompt') readPrompt(d, enhanced);
			else {
				// The enhancer sees the whole appearance. Its prose improves Details; selected hints remain authoritative.
				const parsed = { ...d };
				readPrompt(parsed, enhanced);
				for (const key of TRAIT_KEYS) writeTrait(parsed, key, UNSET);
				if (!parsed.details.trim()) {
					message = notice('create.form.noDetails');
					return;
				}
				const candidate = { ...d };
				writeDetails(candidate, parsed.details);
				if (candidate.prompt.length > 2000) {
					message = notice('create.form.tooLong');
					return;
				}
				writeDetails(d, parsed.details);
			}
			undo = { target, before, after: d.prompt };
		} catch (e) {
			if (alive)
				message =
					e instanceof ApiError
						? e.status === 401
							? notice('create.form.enhanceError.reconnect')
							: e.status === 402
								? notice('create.form.enhanceError.credits')
								: e.status === 0
									? notice('create.form.enhanceError.noAnswer')
									: notice('create.form.enhanceError.failedApi')
						: e instanceof Error
							? errorMessage(e)
							: notice('create.form.enhanceError.failed');
		} finally {
			if (alive) busy = false;
		}
	}
	onMount(() => {
		const target = d.enhanceOnConnect;
		delete d.enhanceOnConnect;
		if (target && app.key) void enhance(target);
		return () => {
			alive = false;
			abort?.abort();
		};
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
				aria-describedby={editorHelpId}
				onpointerenter={(e) => {
					if (e.pointerType === 'mouse') void editorHelp.show();
				}}
				onpointerleave={(e) => {
					if (e.pointerType === 'mouse') editorHelp.hide();
				}}
				onfocusin={(e) => {
					if ((e.target as HTMLElement).matches(':focus-visible')) void editorHelp.show();
				}}
				onfocusout={() => editorHelp.hide()}
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
			<span class="prompt-actions">
				<Help
					bind:this={editorHelp}
					iconOnly
					tooltipId={editorHelpId}
					title={d.tab === 'appearance'
						? t('create.form.appearanceHelpTitle')
						: t('create.form.promptHelpTitle')}
					text={editorHelpText}
				/>
				<ApiPeek
					scope={d.tab === 'appearance' ? 'character-details-enhance' : 'character-prompt-enhance'}
					label={d.tab === 'appearance'
						? t('create.form.enhanceDetails')
						: t('create.form.enhancePrompt')}
					plan={[
						{
							...routes.enhanceCharacterV3Prompt(enhanceInput()),
							label:
								d.tab === 'appearance'
									? 'Enhance character details'
									: 'Enhance exact character prompt',
							generations: 0.05
						}
					]}
					activityScope={scope}
				/>
				<button
					class="bu-action btn icon copy"
					data-variant="outline"
					aria-label={d.tab === 'appearance'
						? t('create.form.copyDetails')
						: t('create.form.copyPrompt')}
					title={d.tab === 'appearance'
						? t('create.form.copyDetails')
						: t('create.form.copyPrompt')}
					onclick={() => copy(enhanceTarget)}
					>{#if copied === enhanceTarget}<Check size={14} />{:else}<Copy size={14} />{/if}</button
				>
				<button
					class="bu-action btn small enhance"
					data-variant="outline"
					aria-label={canUndo(enhanceTarget)
						? t('common.undo')
						: busy
							? t('create.form.enhancing')
							: t('create.form.enhance')}
					aria-busy={busy}
					title={canUndo(enhanceTarget)
						? t('create.form.undoTitle')
						: t('create.form.enhanceTitle')}
					disabled={busy || (!canUndo(enhanceTarget) && !canEnhance(enhanceTarget))}
					onclick={() => enhance(enhanceTarget)}
				>
					{#if canUndo(enhanceTarget)}<Undo2 size={13} />{:else}<WandSparkles size={13} />{/if}
					<span class="enhance-label"
						><span class="enhance-sizer" aria-hidden="true">{t('create.form.enhance')}</span><span
							class="enhance-text"
							>{canUndo(enhanceTarget)
								? t('common.undo')
								: busy
									? t('create.form.enhancing')
									: t('create.form.enhance')}</span
						></span
					>
				</button>
			</span>
		</div>
		{#if d.tab === 'appearance'}
			<div
				id="appearance-panel"
				role="tabpanel"
				aria-labelledby="appearance-tab"
				class="editor-panel"
			>
				<div class="creator-field">
					<textarea
						class="bu-input input details-input"
						aria-label={t('common.details')}
						rows="3"
						maxlength="2000"
						value={d.details}
						oninput={(e) => details(e.currentTarget.value)}
						placeholder={t('create.form.detailsPlaceholder')}></textarea>
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
				<div class="trait-row">
					<Help title={t('create.form.nude')} text={t('create.form.nudeHelp')} /><label
						class="bu-check bu-action nude-field"
						data-variant="field"
						><span>{isNudeBase(d) ? t('create.form.nothingWorn') : t('create.form.underwear')}</span
						><input
							class="bu-switch"
							type="checkbox"
							role="switch"
							aria-label={t('create.form.nude')}
							checked={isNudeBase(d)}
							onchange={(event) => {
								edited();
								writeNudeBase(d, event.currentTarget.checked);
							}}
						/></label
					>
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
						onclick={() => copy('prompt')}
						>{#if copied === 'prompt'}<Check size={14} />{:else}<Copy size={14} />{/if}</button
					>
				</div>
			</div>
		{:else}
			<div id="prompt-panel" role="tabpanel" aria-labelledby="prompt-tab" class="editor-panel">
				<textarea
					class="bu-input input exact-input"
					aria-label={t('create.form.exactPrompt')}
					value={d.prompt}
					oninput={(e) => {
						edited();
						readPrompt(d, e.currentTarget.value);
					}}
					maxlength="2000"
					spellcheck="false"></textarea>
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
		<div class="direction-presets" role="group" aria-label={t('create.form.directionPresets')}>
			{#each PRESETS as p (p.id)}<button
					class="bu-action btn"
					data-variant="outline"
					aria-pressed={preset === p.id}
					onclick={() => {
						setPreset(d, p.id);
						promoted = undefined;
					}}>{PRESET_TEXT[p.id] ? t(PRESET_TEXT[p.id]) : p.label}</button
				>{/each}
		</div>
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
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		min-height: 36px;
	}
	.creator-tabs {
		display: flex;
		flex: 1 1 auto;
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
	.enhance {
		min-width: 78px;
		gap: 4px;
		padding-inline: 7px;
		font-size: var(--fs-sm);
	}
	.enhance-label {
		position: relative;
	}
	.enhance-sizer {
		visibility: hidden;
	}
	.enhance-text {
		position: absolute;
		inset: 0;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.prompt-actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 3px;
		margin-inline-start: auto;
	}
	.details-input {
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
	/* A field like the selects above it: the state on the left, the switch at the trailing edge. */
	.nude-field {
		min-height: 44px;
		justify-content: space-between;
		padding: 0 9px 0 12px;
		border-radius: var(--bu-radius-control);
		font-size: 16px;
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
	.exact-input {
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

	.direction-presets {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 5px;
		margin-top: -4px;
	}
	.direction-presets .btn {
		grid-column: span 2;
		padding-inline: 3px;
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.direction-presets .btn:nth-child(-n + 2) {
		grid-column: span 3;
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
		.frame-controls .btn,
		.direction-presets .btn {
			min-height: 44px;
		}
		.facing {
			max-width: none;
		}
		.exact-input {
			min-height: 300px;
		}
		.direction-presets .btn {
			font-size: 12px;
		}
		.prompt-excerpt {
			font-size: 12px;
			height: 54px;
		}
	}
	@container (max-width:290px) {
		.enhance-label {
			display: none;
		}
		.editor-toolbar .enhance {
			min-width: 44px;
			width: 44px;
			padding-inline: 0;
		}
	}
	@media (pointer: coarse) {
		@container (max-width:340px) {
			.enhance-label {
				display: none;
			}
			.editor-toolbar .enhance {
				min-width: 44px;
				width: 44px;
				padding-inline: 0;
			}
		}
	}
	@media (pointer: coarse) {
		.editor-toolbar .creator-tabs button {
			min-width: 44px;
		}
	}
	@media (max-width: 599px), (max-height: 499px), (pointer: coarse) {
		@container (max-width:400px) {
			.editor-toolbar :global(.help-title.icon-only),
			.editor-toolbar :global(.api-peek-trigger),
			.editor-toolbar .copy {
				width: 32px;
				min-width: 32px;
			}
		}
	}
</style>
