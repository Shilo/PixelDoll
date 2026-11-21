import type { DirectionName, Rig } from '../rig/rig.ts';
import type { Layer, Manifest, Slot, SlotProfile } from '../store/manifest.ts';

export type SlotSource = readonly Slot[] | Pick<Manifest, 'slots'>;
export type SlotRef = string | Slot;

export function retargetLayerDepth(layer: Layer, from: Slot, to: Slot) {
	const baseline = (slot: Slot) => (layer.role === 'bg' ? (slot.bgZ ?? slot.z) : slot.z);
	return layer.z - baseline(from) + baseline(to);
}

export function retainSlotDirections(slots: Slot[], directions: Rig['directions']): Slot[] {
	const allowed = new Set(directions.map(({ id }) => id));
	return slots.map((slot) => {
		const overrides = slot.zOverrides?.filter(({ dir }) => !dir || allowed.has(dir));
		return overrides?.length === slot.zOverrides?.length
			? slot
			: { ...slot, zOverrides: overrides };
	});
}
export const DEFAULT_WARDROBE_ORDER = [
	'head',
	'hair',
	'face_acc',
	'torso_inner',
	'arms',
	'legs',
	'feet',
	'back',
	'main_hand',
	'off_hand',
	'facial_hair',
	'torso_outer',
	'underwear',
	'waist',
	'neck',
	'shoulders'
] as const;
const LABELS: Record<SlotProfile, string> = {
	body: 'Base',
	head: 'Head',
	hair: 'Hair',
	face_acc: 'Face',
	torso_inner: 'Body',
	arms: 'Hands',
	legs: 'Legs',
	feet: 'Feet',
	back: 'Back',
	main_hand: 'Main hand',
	off_hand: 'Off hand',
	facial_hair: 'Facial hair',
	torso_outer: 'Outerwear',
	underwear: 'Underwear',
	waist: 'Waist',
	neck: 'Neck',
	shoulders: 'Shoulders',
	accessory: 'Accessory'
};

/** M4/T3: a held item's bg (blade outside the body) sits above the cape's bg (z 4) in S/E/W, else the cape hides the hilt and
 * blade (T3 Ranger: 220 sword px hidden over walk S); from behind (north) the cape stays over it (bg z as built). */
const heldBgOverCape = (): Slot['zOverrides'] =>
	(['south', 'south-east', 'east', 'west', 'south-west'] as const).map((dir) => ({
		layer: 'bg',
		z: 5,
		dir
	})); // B15: + the front 3/4 views of 8-dir rigs
/** Default slot ladder (architecture §4). Array order = tie-break for equal z. */
const BUILTINS: Slot[] = [
	{ id: 'body', z: 10, class: 'base', required: true },
	{ id: 'underwear', z: 15, class: 'worn', anchor: 'hip' },
	{ id: 'feet', z: 20, class: 'worn', anchor: 'foot_r' },
	{ id: 'legs', z: 30, class: 'worn', anchor: 'hip' },
	{ id: 'torso_inner', z: 40, class: 'worn', anchor: 'neck' },
	{ id: 'waist', z: 50, class: 'worn', anchor: 'hip' },
	{ id: 'torso_outer', z: 60, class: 'worn', anchor: 'neck' },
	{ id: 'shoulders', z: 65, class: 'worn', anchor: 'neck' },
	{ id: 'arms', z: 70, class: 'worn', anchor: 'hand_r' },
	{ id: 'neck', z: 80, class: 'rigid', anchor: 'neck' },
	{ id: 'back', z: 90, bgZ: 4, class: 'worn', anchor: 'neck' },
	{ id: 'facial_hair', z: 100, class: 'rigid', anchor: 'head' },
	{
		id: 'hair',
		z: 110,
		bgZ: 3,
		class: 'rigid',
		anchor: 'head',
		zOverrides: [{ layer: 'bg', z: 5 }]
	}, // T3: long hair lies over the cape (bg 4) in every view: 359 hair px hidden over walk E
	{ id: 'face_acc', z: 120, class: 'rigid', anchor: 'head', band: true },
	// B14: hair is tucked under a helmet (only what hangs below the brim shows) instead of hidden (T3: hides erased long hair);
	// a hood or full mask checks "hide hair" (item.hides)
	{ id: 'head', z: 130, class: 'rigid', anchor: 'head', clips: ['hair'], band: true },
	{ id: 'off_hand', z: 140, bgZ: 2, class: 'held', anchor: 'hand_l', zOverrides: heldBgOverCape() },
	{ id: 'main_hand', z: 150, bgZ: 1, class: 'held', anchor: 'hand_r', zOverrides: heldBgOverCape() }
];

/** Where the character's left side faces the viewer, the off hand (hand_l) is the near hand, so its layers draw over the
 * main-hand item's (front over front, and back over back where both back layers share a z). Only originally generated views:
 * a mirrored view flips its source's pixels (the main hand is near there), so it keeps the source's order. */
const NEAR_OFF_HAND: readonly DirectionName[] = ['west', 'south-west', 'north-west'];
/** A slot's back-layer z facing `dir`, as compose resolves whole-direction overrides (a direction's own before an undirected one). */
const bgZAt = (slot: Slot, dir: DirectionName) => {
	const bg = (slot.zOverrides ?? []).filter((o) => o.layer === 'bg' && !o.anim && o.cell == null);
	return (bg.findLast((o) => o.dir === dir) ?? bg.findLast((o) => !o.dir))?.z ?? slot.bgZ ?? 0;
};
/** The default slot ladder for a rig (fresh copies): SLOTS plus the near-hand order of its generated left-side views. */
export const slotLadder = (rig: Pick<Rig, 'directions'>): Slot[] =>
	SLOTS.map((slot) => {
		const s = structuredClone(slot);
		if (s.id !== 'off_hand') return s;
		const main = slotOf('main_hand');
		for (const { id: dir } of rig.directions.filter(
			(d) => !d.mirrorOf && NEAR_OFF_HAND.includes(d.id)
		)) {
			s.zOverrides = [...(s.zOverrides ?? []), { layer: 'fg', z: main.z + 5, dir }];
			if (bgZAt(s, dir) <= bgZAt(main, dir))
				s.zOverrides.push({ layer: 'bg', z: bgZAt(main, dir) + 1, dir });
		}
		return s;
	});

export const SLOTS: Slot[] = BUILTINS.map((slot) => {
	const profile = slot.id as Exclude<SlotProfile, 'accessory'>;
	const order = DEFAULT_WARDROBE_ORDER.indexOf(profile as (typeof DEFAULT_WARDROBE_ORDER)[number]);
	return {
		...slot,
		label: LABELS[profile],
		origin: profile,
		profile,
		...(order >= 0 ? { wardrobeOrder: order, wardrobeHidden: order >= 10 } : {})
	};
});

export function requireSlot(source: SlotSource, id: string): Slot {
	const slots: readonly Slot[] = Array.isArray(source)
		? source
		: 'slots' in source
			? source.slots
			: [];
	const slot = slots.find((entry) => entry.id === id) ?? SLOTS.find((entry) => entry.id === id);
	if (!slot) throw new Error(`Unknown equipment slot: ${id}`);
	return slot;
}

export function insertSlotInLadder(slots: Slot[], slot: Slot, ladder: readonly Slot[] = SLOTS) {
	const order = ladder.findIndex((entry) => entry.id === slot.id);
	const before = slots.findIndex((entry) => {
		const rank = ladder.findIndex((candidate) => candidate.id === entry.id);
		return order >= 0 && rank > order;
	});
	slots.splice(before < 0 ? slots.length : before, 0, slot);
}

export function slotOf(slot: SlotRef, source: SlotSource = SLOTS): Slot {
	return typeof slot === 'string' ? requireSlot(source, slot) : slot;
}

export function behaviorOf(slot: SlotRef): SlotProfile {
	const resolved = slotOf(slot);
	const profile =
		resolved.profile ?? (SLOTS.some((entry) => entry.id === resolved.id) ? resolved.id : undefined);
	if (!profile || !Object.hasOwn(LABELS, profile))
		throw new Error(`Slot ${resolved.id} has no supported behavior profile.`);
	return profile as SlotProfile;
}

export function createSlot(
	id: string,
	source: Slot | SlotProfile = 'accessory',
	label?: string
): Slot {
	if (id === 'body' || SLOTS.some((slot) => slot.id === id))
		throw new Error('Custom slots need a new permanent key; body is reserved for Base.');
	const template: Slot =
		typeof source === 'string'
			? source === 'accessory'
				? { id: source, class: 'worn' as const, anchor: 'neck', z: 55, profile: source }
				: slotOf(source)
			: source;
	const profile = behaviorOf(template);
	if (profile === 'body') throw new Error('Base cannot be copied into an equipment slot.');
	return {
		...structuredClone(template),
		id,
		label: label ?? LABELS[profile],
		profile,
		...(template.origin
			? { origin: template.origin }
			: profile !== 'accessory'
				? { origin: profile }
				: {}),
		wardrobeHidden: false,
		wardrobeOrder: DEFAULT_WARDROBE_ORDER.length
	};
}

export function specSlot(spec: { slot?: string; slotConfig?: Slot }, source?: SlotSource): Slot {
	if (!spec.slot) throw new Error('Equipment generation needs a slot.');
	const snapshot = spec.slotConfig?.id === spec.slot ? spec.slotConfig : undefined;
	const slots: readonly Slot[] = source
		? Array.isArray(source)
			? source
			: 'slots' in source
				? (source.slots ?? [])
				: []
		: [];
	const current = slots.find((slot) => slot.id === spec.slot);
	if (
		current &&
		snapshot &&
		(current.class !== snapshot.class ||
			current.anchor !== snapshot.anchor ||
			behaviorOf(current) !== behaviorOf(snapshot))
	)
		throw new Error(
			`The equipment category ${spec.slot} now has a different behavior. Nothing was saved; restore its original category before keeping this item.`
		);
	return current ?? snapshot ?? slotOf(spec.slot);
}

export function handOf(slot: SlotRef): 'left' | 'right' {
	const resolved = slotOf(slot);
	if (resolved.class !== 'held' || !['hand_l', 'hand_r'].includes(resolved.anchor ?? ''))
		throw new Error('Held equipment needs an explicit left or right hand anchor.');
	return resolved.anchor === 'hand_l' ? 'left' : 'right';
}

export function creativePrompt(description: string, slot: Slot): string {
	const template = slot.promptTemplate?.trim();
	if (!template) return description;
	return template.includes('{{description}}')
		? template.replaceAll('{{description}}', () => description)
		: `${description}, ${template}`;
}
