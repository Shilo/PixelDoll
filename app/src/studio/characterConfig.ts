import { DIRECTIONS, type DirectionName, type RigDirection, type Rig } from '../lib/rig/rig.ts';
import { BASE_BODY, UNDERWEAR_BODY, isBaseBody } from './model.ts';

export const BODY_SIZES = [48, 64, 96, 128] as const;
export const TRAITS = {
	kind: {
		label: 'Kind',
		options: ['Human', 'Elf', 'Dwarf', 'Orc', 'Undead'],
		help: 'The kind of humanoid. Leave Not set to add no extra hint.'
	},
	build: {
		label: 'Build',
		options: ['Slender', 'Broad', 'Muscular', 'Rounded'],
		help: 'Slender: narrow frame. Broad: wide torso. Muscular: defined muscles. Rounded: soft, rounded torso.'
	},
	proportions: {
		label: 'Proportions',
		options: ['Natural', 'Chibi'],
		help: 'Natural head-to-body proportions, or Chibi with a larger head and shorter limbs. Separate from size in pixels.'
	},
	skin: {
		label: 'Skin',
		options: ['Deep brown', 'Brown', 'Tan', 'Light tan', 'Light', 'Pale'],
		help: 'Skin-tone guidance. Leave Not set to add no extra hint; exact palette colors can be edited later.'
	}
} as const;
export type Trait = keyof typeof TRAITS;
export const TRAIT_KEYS = Object.keys(TRAITS) as Trait[];
export const UNSET = 'Not set';
export const PAIRS: [DirectionName, DirectionName][] = [
	['north-west', 'north-east'],
	['west', 'east'],
	['south-west', 'south-east']
];
export const DIRECTION_LABELS: Record<DirectionName, string> = {
	north: 'N',
	'north-east': 'NE',
	east: 'E',
	'south-east': 'SE',
	south: 'S',
	'south-west': 'SW',
	west: 'W',
	'north-west': 'NW'
};
export const COMPASS: (DirectionName | null)[] = [
	'north-west',
	'north',
	'north-east',
	'west',
	null,
	'east',
	'south-west',
	'south',
	'south-east'
];
export const ANGLES: Record<DirectionName, number> = {
	north: 0,
	'north-east': 45,
	east: 90,
	'south-east': 135,
	south: 180,
	'south-west': 225,
	west: 270,
	'north-west': 315
};
export type Mirrors = Partial<Record<DirectionName, DirectionName>>;
export const PRESETS = [
	{
		id: 'eight',
		label: 'Top-down 8',
		selected: [...DIRECTIONS],
		mirrors: { 'north-west': 'north-east', west: 'east', 'south-west': 'south-east' },
		view: 'low top-down'
	},
	{
		id: 'four',
		label: 'Top-down 4',
		selected: ['north', 'east', 'south', 'west'],
		mirrors: { west: 'east' },
		view: 'low top-down'
	},
	{
		id: 'diagonal',
		label: 'Diagonal 4',
		selected: ['north-east', 'south-east', 'south-west', 'north-west'],
		mirrors: { 'north-west': 'north-east', 'south-west': 'south-east' },
		view: 'high top-down'
	},
	{
		id: 'side',
		label: 'Side-scroller 2',
		selected: ['east', 'west'],
		mirrors: { west: 'east' },
		view: 'side'
	},
	{ id: 'unique', label: 'Unique 8', selected: [...DIRECTIONS], mirrors: {}, view: 'low top-down' }
] satisfies {
	id: string;
	label: string;
	selected: DirectionName[];
	mirrors: Mirrors;
	view: NonNullable<Rig['view']>;
}[];

export interface CharacterDraft {
	name: string;
	details: string;
	kind: string;
	build: string;
	proportions: string;
	skin: string;
	prompt: string;
	body: number | undefined;
	bodyPreset: number | null;
	frame: number | undefined;
	auto: boolean;
	view: NonNullable<Rig['view']>;
	selected: DirectionName[];
	mirrors: Mirrors;
	seed: string;
	/** Advanced: drawing model and V3 style guidance ('' = PixelLab's default). */
	model?: CharacterModel;
	outline?: string;
	detail?: string;
	tab: 'appearance' | 'prompt';
	enhanceOnConnect?: 'details' | 'prompt';
}
/** The model that draws a new character. All end in the same V3 registration, so moves and items work the same way. */
export type CharacterModel = 'v3' | 'pro' | 'pro-flash';
export interface ModelLimits {
	label: string;
	help: string;
	/** Body sizes PixelDoll accepts for this model, in BODY_STEP steps (check the OpenAPI snapshot before widening). */
	body: { min: number; max: number };
	/** Whether the model takes V3's outline and detail hints. */
	styleHints: boolean;
}
export const BODY_STEP = 4;
/** Each model's creation limits, in one place: the New character form and every validation read this table, so changing
 * a limit is a one-line edit. v3 is the default. Prices live in estimate() (create.ts). */
export const MODELS: Record<CharacterModel, ModelLimits> = {
	v3: {
		label: 'Default (V3)',
		help: 'Balanced proportions.',
		body: { min: 32, max: 256 },
		styleHints: true
	},
	pro: {
		label: 'Pro',
		help: 'Follows the prompt more closely, at several times the cost.',
		body: { min: 32, max: 168 },
		styleHints: false
	},
	'pro-flash': {
		label: 'Pro Flash',
		help: 'A chibi style with a big head and short legs, at about three times the cost.',
		body: { min: 32, max: 256 },
		styleHints: false
	}
};
export const MODEL_IDS = Object.keys(MODELS) as CharacterModel[];
/** The limits of a model; absent or unknown means the default (createCharacter refuses unknown models separately). */
export const modelOf = (model?: string): ModelLimits =>
	MODELS[model && Object.hasOwn(MODELS, model) ? (model as CharacterModel) : 'v3'];
/** V3 style hints (soft guidance the model may not follow exactly), for models with styleHints. */
export const OUTLINES = [
	{ value: '', label: 'Default (black)' },
	{ value: 'single color outline', label: 'Colored' },
	{ value: 'selective outline', label: 'Selective' },
	{ value: 'lineless', label: 'None' }
] as const;
export const DETAILS = [
	{ value: '', label: 'Default (medium)' },
	{ value: 'low detail', label: 'Low' },
	{ value: 'highly detailed', label: 'High' }
] as const;
export const OUTLINE_VALUES: string[] = OUTLINES.map((o) => o.value).filter(Boolean);
export const DETAIL_VALUES: string[] = DETAILS.map((o) => o.value).filter(Boolean);
/** Advanced choices as CreateSpec fields; defaults are left out, so a default creation keeps its request identity. */
export function styleOf(d: Pick<CharacterDraft, 'model' | 'outline' | 'detail'>): {
	model?: Exclude<CharacterModel, 'v3'>;
	outline?: string;
	detail?: string;
} {
	const model = d.model && d.model !== 'v3' ? { model: d.model } : {};
	if (!modelOf(d.model).styleHints) return model;
	return {
		...model,
		...(d.outline ? { outline: d.outline } : {}),
		...(d.detail ? { detail: d.detail } : {})
	};
}
export const autoFrame = (body: number) =>
	Math.min(256, 16 * Math.ceil((body + 2 * Math.min(16, Math.max(8, Math.ceil(body / 8)))) / 16));
export function newCharacterDraft(): CharacterDraft {
	return {
		name: '',
		details: '',
		kind: UNSET,
		build: UNSET,
		proportions: UNSET,
		skin: UNSET,
		prompt: UNDERWEAR_BODY,
		body: 64,
		bodyPreset: 64,
		frame: 80,
		auto: true,
		view: 'low top-down',
		selected: [...DIRECTIONS],
		mirrors: { 'north-west': 'north-east', west: 'east', 'south-west': 'south-east' },
		seed: '',
		tab: 'appearance'
	};
}

function recognized(line: string): { key: Trait; value: string } | undefined {
	const text = line
		.trim()
		.replace(/\s*:\s*/, ': ')
		.toLowerCase();
	for (const key of TRAIT_KEYS)
		for (const value of TRAITS[key].options)
			if (text === `${TRAITS[key].label}: ${value}`.toLowerCase()) return { key, value };
}
/** Only complete known trait lines are interpreted. Arbitrary prose is never guessed or rewritten. */
export function readPrompt(
	d: CharacterDraft,
	prompt: string,
	preserveDetailsWhitespace = false
): void {
	d.prompt = prompt;
	const lines = prompt.split('\n'),
		matches = Object.fromEntries(TRAIT_KEYS.map((k) => [k, [] as number[]])) as Record<
			Trait,
			number[]
		>;
	lines.forEach((line, i) => {
		const hit = recognized(line);
		if (hit) matches[hit.key].push(i);
	});
	const owned = new Set<number>();
	for (const key of TRAIT_KEYS) {
		const indices = matches[key];
		d[key] = indices.length === 1 ? recognized(lines[indices[0]])!.value : UNSET;
		if (indices.length === 1) owned.add(indices[0]);
	}
	const details = lines.filter((line, i) => !owned.has(i) && !isBaseBody(line)).join('\n');
	d.details = preserveDetailsWhitespace ? details : details.trim();
}
export function isNudeBase(d: Pick<CharacterDraft, 'prompt'>): boolean {
	const bodies = d.prompt.split('\n').filter(isBaseBody);
	return bodies.length === 1 && bodies[0].trim() === BASE_BODY;
}
export function writeNudeBase(d: CharacterDraft, nude: boolean): void {
	const lines = d.prompt.split('\n');
	const first = lines.findIndex(isBaseBody);
	const next = lines.filter((line) => !isBaseBody(line));
	next.splice(first < 0 ? next.length : first, 0, nude ? BASE_BODY : UNDERWEAR_BODY);
	readPrompt(d, next.join('\n'));
}
export function writeTrait(d: CharacterDraft, key: Trait, value: string): void {
	const lines = d.prompt.split('\n'),
		indices = lines.map((l, i) => (recognized(l)?.key === key ? i : -1)).filter((i) => i >= 0);
	const at =
		indices[0] ?? (lines.findIndex(isBaseBody) >= 0 ? lines.findIndex(isBaseBody) : lines.length);
	const next = lines.filter((_, i) => !indices.includes(i));
	if (value !== UNSET) next.splice(at, 0, `${TRAITS[key].label}: ${value}`);
	readPrompt(d, next.join('\n'));
}
export function writeDetails(d: CharacterDraft, value: string): void {
	const lines = d.prompt.split('\n'),
		counts = Object.fromEntries(TRAIT_KEYS.map((k) => [k, 0])) as Record<Trait, number>;
	for (const line of lines) {
		const hit = recognized(line);
		if (hit) counts[hit.key]++;
	}
	let inserted = false;
	const next: string[] = [];
	for (const line of lines) {
		const hit = recognized(line);
		if (isBaseBody(line) || (hit && counts[hit.key] === 1)) next.push(line);
		else if (!inserted) {
			next.push(value);
			inserted = true;
		}
	}
	if (!inserted) next.unshift(value);
	// Keep spaces/newlines while typing in Details; only known trait lines leave the field.
	readPrompt(d, next.filter((l, i) => l || i > 0).join('\n'), true);
}
export function setPreset(d: CharacterDraft, id: string): void {
	const p = PRESETS.find((p) => p.id === id)!;
	d.selected = [...p.selected];
	d.mirrors = { ...p.mirrors };
	d.view = p.view;
}
export function presetOf(d: Pick<CharacterDraft, 'selected' | 'mirrors'>): string | undefined {
	return PRESETS.find(
		(p) =>
			p.selected.length === d.selected.length &&
			p.selected.every((v) => d.selected.includes(v)) &&
			JSON.stringify(Object.entries(p.mirrors).sort()) ===
				JSON.stringify(Object.entries(d.mirrors).sort())
	)?.id;
}
export function toggleDirection(
	d: Pick<CharacterDraft, 'selected' | 'mirrors'>,
	dir: DirectionName
): string {
	if (!d.selected.includes(dir)) {
		d.selected.push(dir);
		return '';
	}
	d.selected = d.selected.filter((v) => v !== dir);
	delete d.mirrors[dir];
	let promoted = '';
	for (const target of DIRECTIONS)
		if (d.mirrors[target] === dir) {
			delete d.mirrors[target];
			promoted = `${DIRECTION_LABELS[target]} now uses its own view.`;
		}
	return promoted;
}
export function toggleMirror(
	d: Pick<CharacterDraft, 'selected' | 'mirrors'>,
	dir: DirectionName
): void {
	const other = PAIRS.find((p) => p.includes(dir))?.find((v) => v !== dir);
	if (!other) return;
	if (d.mirrors[dir]) {
		delete d.mirrors[dir];
		return;
	}
	delete d.mirrors[other];
	if (!d.selected.includes(dir)) d.selected.push(dir);
	if (!d.selected.includes(other)) d.selected.push(other);
	d.mirrors[dir] = other;
}
export function facingOf(d: Pick<CharacterDraft, 'selected' | 'mirrors'>): RigDirection[] {
	return DIRECTIONS.filter((id) => d.selected.includes(id)).map((id) => ({
		id,
		...(d.mirrors[id] ? { mirrorOf: d.mirrors[id] } : {})
	}));
}
/** Validate again before any paid request; saved drafts and imported settings are not trusted. */
export function facingErrors(dirs: RigDirection[]): string[] {
	if (!dirs.length) return ['Choose at least one direction.'];
	if (new Set(dirs.map((d) => d.id)).size !== dirs.length) return ['Duplicate direction.'];
	const errors: string[] = [];
	for (const d of dirs) {
		if (!DIRECTIONS.includes(d.id)) errors.push('Unknown direction.');
		if (
			d.mirrorOf &&
			(!PAIRS.some((p) => p.includes(d.id) && p.includes(d.mirrorOf!) && d.id !== d.mirrorOf) ||
				!dirs.some((s) => s.id === d.mirrorOf && !s.mirrorOf))
		)
			errors.push(`Invalid mirror source for ${d.id}.`);
	}
	return errors;
}
/** The body size problem for a model, if any (its range from MODELS). */
export function bodyErrors(body: number | undefined, model?: string): string[] {
	const m = modelOf(model),
		{ min, max } = m.body;
	if (!Number.isInteger(body) || body! < min || body! > max)
		return [
			`Body size must be ${min}–${max} whole pixels${m === MODELS.v3 ? '' : ` with ${m.label}`}.`
		];
	if (body! % BODY_STEP)
		return [`Body size must use ${BODY_STEP} px steps (${min}, ${min + BODY_STEP}, …, ${max}).`];
	return [];
}
export const validBodySize = (body: number | undefined, model?: string) =>
	!bodyErrors(body, model).length;
export function sizeErrors(
	body: number | undefined,
	frame: number | undefined,
	model?: string
): string[] {
	const bad = bodyErrors(body, model);
	if (bad.length) return bad;
	const min = autoFrame(body!);
	return !Number.isInteger(frame) || frame! < min || frame! > 256
		? [`Frame must be ${min}–256 whole pixels.`]
		: [];
}
export function draftErrors(d: CharacterDraft): string[] {
	return [
		...sizeErrors(
			d.body,
			d.auto && Number.isFinite(d.body) ? autoFrame(d.body!) : d.frame,
			d.model
		),
		...facingErrors(facingOf(d)),
		...(d.seed &&
		(!/^\d+$/.test(d.seed) ||
			!Number.isSafeInteger(Number(d.seed)) ||
			Number(d.seed) > Number.MAX_SAFE_INTEGER - 100_000)
			? ['Seed must be a safe, non-negative whole number.']
			: []),
		...(!d.prompt.trim()
			? ['Enter a character prompt.']
			: d.prompt.length > 2000
				? ['The complete prompt must be 2,000 characters or fewer.']
				: [])
	];
}
export const freshSeed = () =>
	1 + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] % 2_000_000_000);
