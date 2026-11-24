// How a character or item was generated, read from its provenance (what was actually sent and billed) and its rig. Nothing
// here is stored separately: older records show whatever their provenance holds, and absent values are left out.
import type { Item, Manifest, Provenance } from './manifest.ts';
import { message, type Message } from '../message.ts';

const TOOLS: Record<string, string> = {
	'/create-character-v3': 'Character V3',
	'/create-character-with-8-directions': 'Character Standard',
	'/create-character-pro': 'Character Pro',
	'/create-character-pro-flash': 'Character Pro Flash',
	'/estimate-skeleton': 'Skeleton estimate',
	'/animate-with-skeleton-v3': 'Skeleton animation V3',
	'/animate-with-text-v3': 'Animation V3',
	'/animate-pixminimax': 'PixMiniMax',
	'/edit-animation-v2': 'Edit animation V2',
	'/inpaint-v3': 'Inpaint V3',
	'/transfer-outfit-v2': 'Transfer outfit V2'
};
/** Fixed model labels for the calls that draw a character; report labels must come from this allow-list. */
export const CREATION_MODEL_LABELS: Readonly<Record<string, string>> = {
	'/create-character-v3': 'V3',
	'/create-character-with-8-directions': 'Standard',
	'/create-character-pro': 'Pro',
	'/create-character-pro-flash': 'Pro Flash'
};
const MODES: Record<string, string> = {
	'skeleton-v3': 'Skeleton V3',
	pixminimax: 'PixMiniMax',
	v3: 'Animation V3'
};
/** A readable PixelLab model or tool name for one call. */
export function toolOf(p: Pick<Provenance, 'endpoint' | 'params'>): string {
	if (p.endpoint === '/characters/animations') {
		const mode = p.params?.mode;
		return `Character animation${typeof mode === 'string' ? ` (${MODES[mode] ?? mode})` : ''}`;
	}
	return (
		TOOLS[p.endpoint] ?? (p.endpoint.startsWith('/characters/') ? 'Character read' : p.endpoint)
	);
}

/** The seed a call sent, when it sent one (joint estimates send none). */
export function seedOf(p: Pick<Provenance, 'params'>): number | undefined {
	const seed = p.params?.seed;
	return typeof seed === 'number' && Number.isFinite(seed) ? seed : undefined;
}
const amount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The text a call sent to PixelLab as its prompt, when it had one. */
export function requestPromptOf(p: Pick<Provenance, 'params'>): string {
	const params = p.params ?? {};
	for (const key of ['description', 'action_description', 'action', 'additional_instructions']) {
		const v = params[key];
		if (typeof v === 'string' && v.trim()) return v;
	}
	return '';
}

export interface RecordedCost {
	generations: number;
	usd: number;
	/** Calls whose cost PixelLab did not report. */
	unknown: number;
	calls: number;
	/** Attempts later re-rolled; their cost is included. */
	replaced: number;
}
/** Items a character made itself: not the base, an export-only variant, or a copy, whose calls the source character paid for. */
export const ownItems = (m: Pick<Manifest, 'items' | 'rig'>) =>
	m.items.filter((i) => i.id !== m.rig.baseItem && !i.variantOf && !i.copiedFrom);
/** Every call recorded for a character's body and its own items. */
export const ownProvenance = (m: Pick<Manifest, 'items' | 'rig'>): Provenance[] => [
	...(m.items.find((i) => i.id === m.rig.baseItem)?.provenance ?? []),
	...ownItems(m).flatMap((i) => i.provenance ?? [])
];
export function recordedCost(provenance: Provenance[]): RecordedCost {
	const cost: RecordedCost = { generations: 0, usd: 0, unknown: 0, calls: 0, replaced: 0 };
	for (const p of provenance) {
		cost.calls++;
		if (p.replaced) cost.replaced++;
		if (!p.usage) cost.unknown++;
		cost.generations += amount(p.usage?.generations);
		cost.usd += amount(p.usage?.usd);
	}
	cost.generations = +cost.generations.toFixed(2);
	cost.usd = +cost.usd.toFixed(4);
	return cost;
}
/** "12.5 gens · $0.042 · 1 unknown"; "Free" when every call reported no cost; "" when nothing was recorded. */
export function costText(c: RecordedCost): string {
	const text = [
		c.generations ? `${+c.generations.toFixed(2)} gens` : '',
		c.usd ? `$${c.usd < 0.001 ? c.usd.toFixed(4) : c.usd.toFixed(3)}` : '',
		c.unknown ? `${c.unknown} unknown` : ''
	]
		.filter(Boolean)
		.join(' · ');
	return text || (c.calls ? 'Free' : '');
}

const OUTLINES: Record<string, string> = {
	'single color black outline': 'Black',
	'single color outline': 'Colored',
	'selective outline': 'Selective',
	lineless: 'None'
};
const DETAILS: Record<string, string> = {
	'low detail': 'Low',
	'medium detail': 'Medium',
	'highly detailed': 'High'
};

export interface GenerationDetails {
	/** The prompt as the person wrote it (items include the chosen color). */
	prompt: string;
	/** Distinct prompts sent to PixelLab, in call order: PixelDoll's guidance included. */
	requestPrompts: string[];
	/** Distinct models and tools, in call order, with their call counts. */
	tools: { name: string; calls: number }[];
	/** `label` and `value` stay the English copy source; the messages are for display only. */
	settings: {
		label: string;
		value: string;
		labelMessage?: Message;
		valueMessage?: Message;
	}[];
	cost: RecordedCost;
	createdAt?: string;
}

const FACINGS: Record<string, string> = {
	south: 'S',
	'south-east': 'SE',
	east: 'E',
	'north-east': 'NE',
	north: 'N',
	'north-west': 'NW',
	west: 'W',
	'south-west': 'SW'
};
const ROUTES: Record<NonNullable<Item['route']>, string> = {
	'skeleton-pose': 'Skeleton posing',
	'inpaint-grid': 'Inpainted grid',
	'ea2-anchor': 'Frame editing',
	diff: 'Difference extraction'
};
const ROUTE_KEYS: Record<NonNullable<Item['route']>, Message> = {
	'skeleton-pose': message('generationDetails.method.skeletonPose'),
	'inpaint-grid': message('generationDetails.method.inpaintGrid'),
	'ea2-anchor': message('generationDetails.method.frameEditing'),
	diff: message('generationDetails.method.differenceExtraction')
};
export const routeName = (route: Item['route']) => (route ? ROUTES[route] : '');
const OUTLINE_KEYS: Record<string, Message> = {
	Black: message('generationDetails.outline.black'),
	Colored: message('generationDetails.outline.colored'),
	Selective: message('generationDetails.outline.selective'),
	None: message('generationDetails.outline.none')
};
const DETAIL_KEYS: Record<string, Message> = {
	Low: message('generationDetails.detail.low'),
	Medium: message('generationDetails.detail.medium'),
	High: message('generationDetails.detail.high')
};
const CAMERA_KEYS = {
	'low top-down': message('create.form.cameras.low'),
	'high top-down': message('create.form.cameras.high'),
	side: message('create.form.cameras.side')
} satisfies Record<NonNullable<Manifest['rig']['view']>, Message>;

export const cameraMessage = (view: NonNullable<Manifest['rig']['view']>): Message | undefined =>
	Object.hasOwn(CAMERA_KEYS, view) ? CAMERA_KEYS[view] : undefined;

const CREATORS = [
	'/create-character-v3',
	'/create-character-with-8-directions',
	'/create-character-pro',
	'/create-character-pro-flash'
];
/** The call that drew a created character, absent for imported art (registration-only calls send direction images). */
export const creationCall = (base: Pick<Item, 'provenance'>) =>
	base.provenance?.find((p) => CREATORS.includes(p.endpoint) && !p.params?.direction_images);
/** The fixed model label of the call that drew a created character, absent for imported art. */
export const creationModelOf = (base: Pick<Item, 'provenance'>): string | undefined => {
	const created = creationCall(base);
	return created ? CREATION_MODEL_LABELS[created.endpoint] : undefined;
};
/** The summary for one item; the base body describes the character's creation. */
export function generationDetails(m: Manifest, it: Item): GenerationDetails {
	const prov = it.provenance ?? [];
	const tools: GenerationDetails['tools'] = [];
	for (const p of prov) {
		const name = toolOf(p),
			known = tools.find((t) => t.name === name);
		if (known) known.calls++;
		else tools.push({ name, calls: 1 });
	}
	const settings: GenerationDetails['settings'] = [];
	const add = (label: string, value: unknown, labelMessage: Message, valueMessage?: Message) => {
		if (value !== undefined && value !== null && value !== '')
			settings.push({
				label,
				value: String(value),
				labelMessage,
				...(valueMessage ? { valueMessage } : {})
			});
	};
	if (it.id === m.rig.baseItem) {
		const created = creationCall(it);
		const size = created?.params?.image_size as { width?: number; height?: number } | undefined;
		const fromSprite =
			created?.endpoint === '/create-character-v3' && created.params?.reference_image;
		add(
			'Body',
			!fromSprite && size?.width ? `${size.width} px` : undefined,
			message('generationDetails.settings.body'),
			!fromSprite && size?.width
				? message('generationDetails.settings.bodyPx', { width: size.width })
				: undefined
		);
		if (fromSprite)
			add(
				'Reference',
				'Starting sprite',
				message('generationDetails.settings.reference'),
				message('generationDetails.settings.startingSprite')
			);
		add(
			'Frame',
			`${m.rig.cell.w} × ${m.rig.cell.h} px`,
			message('generationDetails.settings.frame'),
			message('share.resolution', {
				width: m.rig.cell.w,
				height: m.rig.cell.h
			})
		);
		add('Camera', m.rig.view, message('generationDetails.settings.camera'));
		add(
			'Facings',
			m.rig.directions
				.map((d) => (d.mirrorOf ? `${FACINGS[d.id]} (mirrored)` : FACINGS[d.id]))
				.join(', '),
			message('generationDetails.settings.facings')
		);
		const outline = created?.params?.outline,
			detail = created?.params?.detail,
			outlineText = typeof outline === 'string' ? (OUTLINES[outline] ?? outline) : undefined,
			detailText = typeof detail === 'string' ? (DETAILS[detail] ?? detail) : undefined;
		if (outlineText)
			add(
				'Outline',
				outlineText,
				message('generationDetails.settings.outline'),
				OUTLINE_KEYS[outlineText]
			);
		if (detailText)
			add(
				'Detail',
				detailText,
				message('generationDetails.settings.detail'),
				DETAIL_KEYS[detailText]
			);
		add('Seed', created && seedOf(created), message('generationDetails.settings.seed'));
	} else {
		add(
			'Method',
			routeName(it.route),
			message('generationDetails.settings.method'),
			it.route ? ROUTE_KEYS[it.route] : undefined
		);
		add('Color key', it.key, message('generationDetails.settings.colorKey'));
		const first = prov.find((p) => !p.replaced);
		add('Seed', first && seedOf(first), message('generationDetails.settings.seed'));
	}
	const times = prov
		.map((p) => Date.parse(p.createdAt))
		.filter(Number.isFinite)
		.sort((a, b) => a - b);
	return {
		prompt: it.prompt ?? '',
		requestPrompts: [...new Set(prov.map(requestPromptOf).filter(Boolean))],
		tools,
		settings,
		cost: recordedCost(prov),
		...(times.length ? { createdAt: new Date(times[0]).toISOString() } : {})
	};
}
