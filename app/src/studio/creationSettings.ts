import {
	MODEL_IDS,
	PRESETS,
	BODY_SIZES,
	autoFrame,
	newCharacterDraft,
	presetOf,
	setPreset,
	sizeErrors,
	validBodySize,
	writeNudeBase,
	type CharacterModel
} from './characterConfig.ts';
import { moveFrameCounts, type MoveAnimationModel } from './moveAnimationOptions.ts';
import type { StateGenerationModel } from './stateGenerationPlan.ts';
import type { Method } from '../lib/items/items.ts';
import type { ItemDrawing } from '../lib/rig/rig.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';
import { planStateGeneration, type StateGenerationInput } from './stateGenerationPlan.ts';

export const creationSections = ['characters', 'moves', 'states', 'items'] as const;
export type CreationSection = (typeof creationSections)[number];
export const moveModels = [
	'pixminimax',
	'skeleton-v3',
	'v3'
] as const satisfies readonly MoveAnimationModel[];
export const stateModels = [
	'pro',
	'pro-flash',
	'pixen'
] as const satisfies readonly StateGenerationModel[];
export const itemMethods = ['auto', 'skel', 'anchor'] as const satisfies readonly (
	'auto' | Method
)[];
export const itemDrawings = ['anchor', 'skeleton'] as const satisfies readonly ItemDrawing[];

export type CreationSettings = {
	characters: {
		model: CharacterModel;
		clothing: 'underwear' | 'none';
		body: number;
		frame: 'auto' | number;
		directions: string;
	};
	moves: { model: MoveAnimationModel; frames: 'auto' | number; itemDrawing: ItemDrawing };
	states: { model: StateGenerationModel };
	items: { method: (typeof itemMethods)[number] };
};

const character = newCharacterDraft();
export const creationDefaults: Readonly<{
	[Section in CreationSection]: Readonly<CreationSettings[Section]>;
}> = {
	characters: {
		model: 'v3',
		clothing: 'underwear',
		body: character.body!,
		frame: 'auto',
		directions: presetOf(character)!
	},
	moves: { model: 'skeleton-v3', frames: 'auto', itemDrawing: 'anchor' },
	states: { model: 'pro' },
	items: { method: 'auto' }
};

export const isCreationSection = (section: string | null): section is CreationSection =>
	creationSections.some((name) => name === section);

export const creationSettingsKey = (section: CreationSection) => `pixeldoll.creation.${section}`;

export const preferredMoveFrameCounts = (model: MoveAnimationModel) => moveFrameCounts(model, 32);

export function validCreationSettings(section: CreationSection, value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	if (Object.keys(value).length !== Object.keys(creationDefaults[section]).length) return false;
	switch (section) {
		case 'characters': {
			const { model, clothing, body, frame, directions } = value as CreationSettings['characters'];
			return (
				MODEL_IDS.includes(model) &&
				(clothing === 'underwear' || clothing === 'none') &&
				validBodySize(body, model) &&
				PRESETS.some((preset) => preset.id === directions) &&
				(frame === 'auto' || (typeof frame === 'number' && !sizeErrors(body, frame, model).length))
			);
		}
		case 'moves': {
			const { model, frames, itemDrawing } = value as CreationSettings['moves'];
			return (
				moveModels.includes(model) &&
				(frames === 'auto' || preferredMoveFrameCounts(model).includes(frames)) &&
				itemDrawings.includes(itemDrawing)
			);
		}
		case 'states':
			return stateModels.includes((value as CreationSettings['states']).model);
		case 'items':
			return itemMethods.includes((value as CreationSettings['items']).method);
	}
}

export function readCreationSettings<Section extends CreationSection>(
	storage: Pick<Storage, 'getItem'>,
	section: Section
) {
	const raw = storage.getItem(creationSettingsKey(section));
	if (raw === null) return { values: creationDefaults[section], valid: true };
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { values: creationDefaults[section], valid: false };
	}
	// A choice added after the record was saved takes its default; a wrong value or an unknown key still fails.
	if (value && typeof value === 'object' && !Array.isArray(value))
		value = { ...creationDefaults[section], ...value };
	return validCreationSettings(section, value)
		? { values: value as CreationSettings[Section], valid: true }
		: { values: creationDefaults[section], valid: false };
}

export function saveCreationSettings<Section extends CreationSection>(
	storage: Pick<Storage, 'getItem' | 'setItem'>,
	section: Section,
	change: Partial<CreationSettings[Section]>
) {
	const saved = readCreationSettings(storage, section);
	const values = { ...saved.values, ...change };
	if (!saved.valid || !validCreationSettings(section, values)) return false;
	storage.setItem(creationSettingsKey(section), JSON.stringify(values));
	return true;
}

export function openingCreationSettings<Section extends CreationSection>(section: Section) {
	if (workspaceCopy) return creationDefaults[section];
	try {
		return readCreationSettings(localStorage, section).values;
	} catch {
		return creationDefaults[section];
	}
}

export function characterDraftWithDefaults(values: CreationSettings['characters']) {
	const draft = newCharacterDraft();
	draft.model = values.model;
	draft.body = values.body;
	draft.bodyPreset = BODY_SIZES.some((size) => size === values.body) ? values.body : null;
	draft.frame = values.frame === 'auto' ? autoFrame(values.body) : values.frame;
	draft.auto = values.frame === 'auto';
	setPreset(draft, values.directions);
	if (values.clothing === 'none') writeNudeBase(draft, true);
	return draft;
}

export function resolveMoveFramePreference(
	model: MoveAnimationModel,
	frames: CreationSettings['moves']['frames'],
	canvas: number
) {
	return frames !== 'auto' && moveFrameCounts(model, canvas).includes(frames) ? frames : undefined;
}

export function resolveStateModelPreference(
	model: StateGenerationModel,
	source: Pick<StateGenerationInput, 'cellSize' | 'facingIds'> | undefined
) {
	if (
		model === 'pixen' &&
		source &&
		planStateGeneration({ ...source, model }).kind === 'rejected' &&
		planStateGeneration({ ...source, model: 'pro' }).kind === 'ready'
	)
		return 'pro';
	return model;
}
