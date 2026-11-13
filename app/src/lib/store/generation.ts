// How a character or item was generated, read from its provenance (what was actually sent and billed) and its rig. Nothing
// here is stored separately: older records show whatever their provenance holds, and absent values are left out.
import type { Item, Manifest, Provenance } from './manifest.ts';

const TOOLS: Record<string, string> = {
	'/create-character-v3': 'Character V3',
	'/create-character-pro-flash': 'Character Pro Flash',
	'/estimate-skeleton': 'Skeleton estimate',
	'/animate-with-skeleton-v3': 'Skeleton animation V3',
	'/edit-animation-v2': 'Edit animation V2',
	'/inpaint-v3': 'Inpaint V3',
	'/transfer-outfit-v2': 'Transfer outfit V2'
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
	settings: { label: string; value: string }[];
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
export const routeName = (route: Item['route']) => (route ? ROUTES[route] : '');

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
	const add = (label: string, value: unknown) => {
		if (value !== undefined && value !== null && value !== '')
			settings.push({ label, value: String(value) });
	};
	if (it.id === m.rig.baseItem) {
		// The first drawing call made from text: the character as created.
		const created = prov.find(
			(p) =>
				(p.endpoint === '/create-character-v3' || p.endpoint === '/create-character-pro-flash') &&
				!p.params?.reference_image
		);
		const size = created?.params?.image_size as { width?: number; height?: number } | undefined;
		add('Body', size?.width ? `${size.width} px` : undefined);
		add('Frame', `${m.rig.cell.w} × ${m.rig.cell.h} px`);
		add('Camera', m.rig.view);
		add(
			'Facings',
			m.rig.directions
				.map((d) => (d.mirrorOf ? `${FACINGS[d.id]} (mirrored)` : FACINGS[d.id]))
				.join(', ')
		);
		const outline = created?.params?.outline,
			detail = created?.params?.detail;
		if (typeof outline === 'string') add('Outline', OUTLINES[outline] ?? outline);
		if (typeof detail === 'string') add('Detail', DETAILS[detail] ?? detail);
		add('Seed', created && seedOf(created));
	} else {
		add('Method', routeName(it.route));
		add('Color key', it.key);
		const first = prov.find((p) => !p.replaced);
		add('Seed', first && seedOf(first));
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
