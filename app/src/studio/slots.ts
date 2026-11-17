// Wardrobe categories per character (pure, node-runnable): every built-in slot and each custom slot is its own category.
// Organization (label, Wardrobe order, Not shown) lives on the character's own Slot definitions in manifest.slots; a built-in
// without one uses its catalog default. Wardrobe order never changes drawing: manifest.slots array order and z stay the
// render contract (docs/design/2026-11-16-slot-system/plan.md §6).
import type { Manifest, Slot, SlotProfile, ZOverride } from '../lib/store/manifest.ts';
import { createSlot, DEFAULT_WARDROBE_ORDER, SLOTS, slotLadder } from '../lib/items/slots.ts';
import { reservedPathSegment } from '../lib/export/paths.ts';
import { BASE_CLOTHES, UNDERWEAR_CLOTHES } from './model.ts';

/** The frozen character: never a Wardrobe category. */
export const BASE_KEY = 'body';
export const BASE_LABEL = 'Base';
export const ACCESSORY = 'Accessory';
export const MAX_LABEL = 24;
export const MAX_HINT = 120;

export interface Category {
	key: string;
	label: string;
	profile: SlotProfile;
	custom: boolean;
	/** Not shown in Wardrobe (organization only: never unequips, never leaves exports). */
	hidden: boolean;
	order: number;
}

/** Category copy by behavior profile, so a custom copy inherits its source's icon and examples. */
const COPY: Record<Exclude<SlotProfile, 'body'>, { icon: string; ideas: { label: string }[] }> = {
	head: {
		icon: 'head',
		ideas: [
			{ label: 'wizard hat' },
			{ label: 'iron knight helmet' },
			{ label: 'golden crown' },
			{ label: 'hood' }
		]
	},
	hair: {
		icon: 'hair',
		ideas: [{ label: 'long braided hair' }, { label: 'short spiky hair' }, { label: 'ponytail' }]
	},
	face_acc: {
		icon: 'face',
		ideas: [{ label: 'round glasses' }, { label: 'eye patch' }, { label: 'bandit mask' }]
	},
	torso_inner: {
		icon: 'body',
		ideas: [{ label: 'leather vest' }, { label: 'chainmail shirt' }, { label: 'blue tunic' }]
	},
	arms: {
		icon: 'hands',
		ideas: [{ label: 'leather gloves' }, { label: 'iron gauntlets' }, { label: 'cloth wraps' }]
	},
	legs: {
		icon: 'legs',
		ideas: [{ label: 'brown trousers' }, { label: 'plate greaves' }, { label: 'pleated skirt' }]
	},
	feet: {
		icon: 'feet',
		ideas: [{ label: 'leather boots' }, { label: 'sandals' }, { label: 'iron sabatons' }]
	},
	back: {
		icon: 'back',
		ideas: [{ label: 'red cape' }, { label: 'travel backpack' }, { label: 'quiver of arrows' }]
	},
	main_hand: {
		icon: 'main_hand',
		ideas: [{ label: 'steel sword' }, { label: 'wooden staff' }, { label: 'battle axe' }]
	},
	off_hand: {
		icon: 'off_hand',
		ideas: [{ label: 'round shield' }, { label: 'iron lantern' }, { label: 'wooden longbow' }]
	},
	facial_hair: {
		icon: 'hair',
		ideas: [{ label: 'full beard' }, { label: 'handlebar mustache' }, { label: 'goatee' }]
	},
	torso_outer: {
		icon: 'body',
		ideas: [{ label: 'steel plate armor' }, { label: 'hooded robe' }, { label: 'long coat' }]
	},
	underwear: {
		icon: 'legs',
		ideas: [{ label: 'plain white underwear set' }, { label: 'striped swimsuit' }]
	},
	waist: {
		icon: 'legs',
		ideas: [{ label: 'leather belt' }, { label: 'red sash' }, { label: 'belt pouch' }]
	},
	neck: {
		icon: 'body',
		ideas: [{ label: 'gold amulet' }, { label: 'wool scarf' }, { label: 'bead necklace' }]
	},
	shoulders: {
		icon: 'body',
		ideas: [{ label: 'steel pauldrons' }, { label: 'fur mantle' }]
	},
	accessory: {
		icon: 'accessory',
		ideas: [{ label: 'brass brooch' }, { label: 'ribbon bow' }, { label: 'charm pouch' }]
	}
};

const BUILTIN = new Map(SLOTS.map((s) => [s.id, s]));
export const isBuiltin = (key: string) => key !== BASE_KEY && BUILTIN.has(key);
/** Keys no custom slot may take: every built-in (shown or not) and Base, even when absent from this character. */
const RESERVED = new Set<string>([BASE_KEY, 'base', ...BUILTIN.keys(), ...DEFAULT_WARDROBE_ORDER]);

/** The character's own definition, else the catalog default (not a copy: never mutate the result). */
export const slotDef = (m: Pick<Manifest, 'slots'> | undefined, key: string): Slot | undefined =>
	m?.slots.find((s) => s.id === key) ?? BUILTIN.get(key);
export const profileOf = (m: Pick<Manifest, 'slots'> | undefined, key: string): SlotProfile => {
	const def = slotDef(m, key);
	return def?.profile ?? (isBuiltin(key) ? (key as SlotProfile) : 'accessory');
};
export function slotLabel(m: Pick<Manifest, 'slots'> | undefined, key: string): string {
	if (key === BASE_KEY) return BASE_LABEL;
	return slotDef(m, key)?.label ?? BUILTIN.get(key)?.label ?? key;
}
export const iconOf = (m: Pick<Manifest, 'slots'> | undefined, key: string) => {
	const p = profileOf(m, key);
	return p === 'body' ? 'body' : COPY[p].icon;
};
export const categoryCopy = (m: Pick<Manifest, 'slots'> | undefined, key: string) => {
	const p = profileOf(m, key);
	return COPY[p === 'body' ? 'accessory' : p];
};

const defaultOrder = (key: string) => {
	const i = (DEFAULT_WARDROBE_ORDER as readonly string[]).indexOf(key);
	return i < 0 ? DEFAULT_WARDROBE_ORDER.length : i;
};
/** Every category of a character in Wardrobe order (shown and not shown), Base excluded. Ties keep catalog then key order. */
export function categories(m: Pick<Manifest, 'slots'>): Category[] {
	const customs = m.slots.filter(
		(s) => s.id !== BASE_KEY && s.class !== 'base' && !isBuiltin(s.id)
	);
	const defs = [...[...BUILTIN.keys()].filter(isBuiltin).map((k) => slotDef(m, k)!), ...customs];
	return defs
		.map((s) => {
			const custom = !isBuiltin(s.id);
			return {
				key: s.id,
				label: slotLabel(m, s.id),
				profile: profileOf(m, s.id),
				custom,
				hidden: s.wardrobeHidden ?? (custom ? false : (BUILTIN.get(s.id)!.wardrobeHidden ?? false)),
				order: s.wardrobeOrder ?? defaultOrder(s.id)
			};
		})
		.sort(
			(a, b) =>
				a.order - b.order ||
				defaultOrder(a.key) - defaultOrder(b.key) ||
				(a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
		);
}
/** Categories Wardrobe shows: not hidden, or holding items or attempts (hiding never makes work unreachable). */
export const shownCategories = (m: Pick<Manifest, 'slots'>, busy: ReadonlySet<string>) =>
	categories(m).filter((c) => !c.hidden || busy.has(c.key));

// ---------- what a category holds ----------
export interface SlotUse {
	/** Saved items, including fitted variants. */
	items: number;
	/** Attempts being made or waiting for review. */
	making: number;
	/** Stopped, failed or uncertain attempts still listed in Activity. */
	stopped: number;
}
export interface DraftRef {
	rigId: string;
	slot: string;
	phase: 'running' | 'review' | 'failed';
}
export function slotUse(
	m: Pick<Manifest, 'items'>,
	projectId: string,
	key: string,
	drafts: readonly DraftRef[]
): SlotUse {
	const mine = drafts.filter((d) => d.rigId === projectId && d.slot === key);
	return {
		items: m.items.filter((it) => it.slot === key).length,
		making: mine.filter((d) => d.phase !== 'failed').length,
		stopped: mine.filter((d) => d.phase === 'failed').length
	};
}
export const isEmpty = (u: SlotUse) => !u.items && !u.making && !u.stopped;
const n = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`;
/** "2 items and 1 stopped attempt", or '' when empty. */
export function useText(u: SlotUse): string {
	const parts = [
		u.items && n(u.items, 'item'),
		u.making && n(u.making, 'item being made', 'items being made'),
		u.stopped && n(u.stopped, 'stopped attempt')
	].filter(Boolean) as string[];
	return parts.length < 2
		? (parts[0] ?? '')
		: `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
/** Why a category cannot be hidden, deleted or change behavior now, or '' when it is empty. */
export function busyReason(label: string, u: SlotUse, action: string): string {
	if (isEmpty(u)) return '';
	return `${label} has ${useText(u)}. Only an empty category can ${action}${u.stopped ? '; dismiss stopped attempts in Activity first' : ''}.`;
}

// ---------- names and keys ----------
export const cleanLabel = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const fold = (s: string) => cleanLabel(s).toLowerCase();
/** The category already using this name (case-insensitive, trimmed), Base included. */
export function labelOwner(
	m: Pick<Manifest, 'slots'>,
	label: string,
	except?: string
): Category | { key: typeof BASE_KEY; label: string } | undefined {
	const want = fold(label);
	if (!want) return;
	if (want === fold(BASE_LABEL)) return { key: BASE_KEY, label: BASE_LABEL };
	return categories(m).find((c) => c.key !== except && fold(c.label) === want);
}
/** Accessory, then Accessory 2, Accessory 3, ...: the first name no category uses. */
export function nextLabel(m: Pick<Manifest, 'slots'>, base = ACCESSORY): string {
	for (let i = 1; ; i++) {
		const label = i === 1 ? base : `${base} ${i}`;
		if (!labelOwner(m, label)) return label;
	}
}
/** A permanent, portable key suggested once from a name: lowercase ASCII words joined by underscores, never a built-in or
 *  reserved path name; names without Latin letters get "slot". Numbered (_2, _3) when taken, hidden built-ins included. */
export function keyFor(m: Pick<Manifest, 'slots'>, label: string): string {
	let base = label
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 32)
		.replace(/_+$/, '');
	if (!base) base = 'slot';
	else if (!/^[a-z]/.test(base)) base = `slot_${base}`.slice(0, 32);
	if (reservedPathSegment(base)) base = `${base}_slot`;
	const taken = new Set([...RESERVED, ...m.slots.map((s) => s.id.toLowerCase())]);
	for (let i = 1; ; i++) {
		const key = i === 1 ? base : `${base}_${i}`;
		if (!taken.has(key)) return key;
	}
}
/** A label problem, or '' when it can be used. */
export function labelProblem(m: Pick<Manifest, 'slots'>, label: string, except?: string): string {
	const clean = cleanLabel(label);
	if (!clean) return 'Enter a name.';
	if (clean.length > MAX_LABEL) return `Use at most ${MAX_LABEL} characters.`;
	const owner = labelOwner(m, clean, except);
	if (owner) return `${owner.label} already exists.`;
	return '';
}

// Words PixelDoll itself controls: the hint describes the item, never the background, keying, pose or hands.
const PROTECTED =
	/\b(background|chroma|green ?screen|magenta|transparent|alpha|mannequin|pose|posed|skeleton|keep every|unchanged|frame layout|frame count|sprite ?sheet|grid layout|packed grid|red dot|hand marked)\b/i;
export const cleanHint = (s: string) => s.replace(/\s+/g, ' ').trim();
/** A creative hint problem, or '' when it can be used. */
export function hintProblem(hint: string): string {
	const clean = cleanHint(hint);
	if (clean.length > MAX_HINT) return `Use at most ${MAX_HINT} characters.`;
	if (/[{}<>]/.test(clean)) return 'Describe the item in plain words.';
	const word = clean.match(PROTECTED)?.[0];
	if (word) return `PixelDoll handles “${word}” itself. Describe only the item.`;
	return '';
}

/** What a character's frozen body wears, from its stored looks text: a nude body makes removable underwear useful. */
export function baseClothesNote(looks: string | undefined): string {
	if (looks?.includes(BASE_CLOTHES)) return '';
	if (looks?.includes(UNDERWEAR_CLOTHES))
		return 'This character’s body was drawn in underwear. Underwear items draw over it but can’t remove it.';
	return 'If this character’s body was drawn wearing clothes, Underwear items draw over them but can’t remove them.';
}

// ---------- edits (in place on the open manifest; the Studio wraps each in one undo step) ----------
type Editable = Pick<Manifest, 'slots' | 'rig' | 'items' | 'presets'>;

/** Insert a definition by z, after any slot with the same z, so an existing draw order never changes. */
function insertByZ(m: Pick<Manifest, 'slots'>, slot: Slot) {
	const at = m.slots.findLastIndex((s) => s.z <= slot.z);
	m.slots.splice(at + 1, 0, slot);
}
/** A category's settings as this character resolves them (a built-in's ladder copy includes its per-rig hand order). */
function resolved(m: Editable, key: string): Slot {
	const s = m.slots.find((x) => x.id === key) ?? slotLadder(m.rig).find((x) => x.id === key);
	if (!s || key === BASE_KEY) throw new Error(`Unknown equipment slot: ${key}`);
	return structuredClone(s);
}
/** The character's own definition of a built-in, created from the rig's ladder on first organization. */
function own(m: Editable, key: string): Slot {
	const found = m.slots.find((s) => s.id === key);
	if (found) return found;
	const fresh = slotLadder(m.rig).find((s) => s.id === key);
	if (!fresh) throw new Error(`Unknown equipment slot: ${key}`);
	insertByZ(m, fresh);
	return fresh;
}
const shownEnd = (m: Pick<Manifest, 'slots'>, busy: ReadonlySet<string>) =>
	Math.max(-1, ...shownCategories(m, busy).map((c) => c.order)) + 1;

export function setHidden(m: Editable, key: string, hidden: boolean, busy: ReadonlySet<string>) {
	if (key === BASE_KEY) throw new Error('Base is always part of the character.');
	const wasShown = shownCategories(m, busy).some((c) => c.key === key),
		end = shownEnd(m, busy);
	const s = own(m, key);
	s.wardrobeHidden = hidden;
	// Shown again: it joins the end of the list people see.
	if (!hidden && !wasShown) s.wardrobeOrder = end;
}
/** Move a shown category to `to` among the shown ones. The shown list is small, so it is renumbered 0, 1, 2, ...: exports
 *  require non-negative whole numbers. Only definitions whose number changes are written. */
export function moveCategory(m: Editable, key: string, to: number, busy: ReadonlySet<string>) {
	const shown = shownCategories(m, busy),
		rest = shown.filter((c) => c.key !== key);
	if (rest.length === shown.length) return;
	const keys = rest.map((c) => c.key);
	keys.splice(Math.max(0, Math.min(rest.length, to)), 0, key);
	keys.forEach((k, i) => {
		if (shown.find((c) => c.key === k)!.order !== i) own(m, k).wardrobeOrder = i;
	});
}

export interface NewSlot {
	/** Blank: the next free Accessory name. */
	label?: string;
	/** A category whose supported settings the new one copies (not its items); none: worn, over basic clothing. */
	like?: string;
}
/** Add a custom category; returns its permanent key. */
export function addCustom(m: Editable, o: NewSlot, busy: ReadonlySet<string>): string {
	const label = cleanLabel(o.label ?? '') || nextLabel(m);
	const problem = labelProblem(m, label);
	if (problem) throw new Error(problem);
	const key = keyFor(m, label);
	const source = o.like ? resolved(m, o.like) : 'accessory';
	const slot = createSlot(key, source, label);
	// A copy is organized and drawn as its own category: only behavior and depth come from the source.
	slot.wardrobeHidden = false;
	slot.wardrobeOrder = shownEnd(m, busy);
	delete slot.promptTemplate;
	insertByZ(m, slot);
	return key;
}
export function renameCustom(m: Editable, key: string, label: string) {
	const s = m.slots.find((x) => x.id === key);
	if (!s || isBuiltin(key) || key === BASE_KEY) throw new Error('Built-in names stay fixed.');
	const problem = labelProblem(m, label, key);
	if (problem) throw new Error(problem);
	s.label = cleanLabel(label);
}
export function setHint(m: Editable, key: string, hint: string) {
	const s = m.slots.find((x) => x.id === key);
	if (!s || isBuiltin(key)) throw new Error('Only custom categories take a creative hint.');
	const problem = hintProblem(hint);
	if (problem) throw new Error(problem);
	const clean = cleanHint(hint);
	if (clean) s.promptTemplate = clean;
	else delete s.promptTemplate;
}
/** Behavior a custom category can take: a built-in's supported settings, or plain worn clothing. */
export const BEHAVIORS: { profile: Exclude<SlotProfile, 'body'>; label: string }[] = [
	{ profile: 'accessory', label: 'Over basic clothing' },
	...DEFAULT_WARDROBE_ORDER.filter((k) => BUILTIN.has(k)).map((k) => ({
		profile: k as Exclude<SlotProfile, 'body'>,
		label: `Like ${BUILTIN.get(k)!.label ?? k}`
	}))
];
/** Replace a custom category's attachment settings with `src`'s, keeping its name, organization and hint. */
function rebuild(
	m: Editable,
	key: string,
	src: Slot | 'accessory',
	keep?: Pick<Slot, 'profile' | 'origin'>
) {
	const at = m.slots.findIndex((x) => x.id === key),
		cur = m.slots[at];
	const next = createSlot(key, src, cur.label);
	if (keep) {
		if (keep.profile) next.profile = keep.profile;
		if (keep.origin) next.origin = keep.origin;
		else delete next.origin;
	}
	next.wardrobeHidden = cur.wardrobeHidden;
	next.wardrobeOrder = cur.wardrobeOrder;
	if (cur.promptTemplate) next.promptTemplate = cur.promptTemplate;
	else delete next.promptTemplate;
	m.slots.splice(at, 1);
	insertByZ(m, next);
}
/** Change what a custom category generates and how it attaches. Callers check it is empty first: baked frames never move. */
export function setBehavior(m: Editable, key: string, profile: Exclude<SlotProfile, 'body'>) {
	if (!m.slots.some((x) => x.id === key) || isBuiltin(key))
		throw new Error('Built-in behavior stays fixed; add a custom copy.');
	rebuild(m, key, profile === 'accessory' ? 'accessory' : resolved(m, profile));
}
const sideOf = (s: Slot) => (s.anchor === 'hand_l' ? 'left' : 'right');
/** A held custom category's hand. Built-in held slots keep their hand; a copy may use the other one. The whole attachment
 *  (depths, behind-the-body depth and side-specific order) comes from the built-in holding with that hand, so the item
 *  layers like one held there; what it generates (its behavior) stays. */
export function setHand(m: Editable, key: string, side: 'left' | 'right') {
	const s = m.slots.find((x) => x.id === key);
	if (!s || isBuiltin(key) || s.class !== 'held')
		throw new Error('Only held custom categories choose a hand.');
	if (sideOf(s) === side) return;
	rebuild(m, key, resolved(m, side === 'left' ? 'off_hand' : 'main_hand'), {
		profile: s.profile,
		origin: s.origin
	});
}

/** Draw order a custom category can take: directly above any other category or Base, in drawing order. */
export function drawingOrder(
	m: Pick<Manifest, 'slots'>
): { key: string; label: string; z: number }[] {
	const keys = [BASE_KEY, ...categories(m).map((c) => c.key)];
	const index = (k: string) => {
		const i = m.slots.findIndex((s) => s.id === k);
		return i < 0 ? Infinity : i;
	};
	return keys
		.map((key) => ({ key, label: slotLabel(m, key), z: slotDef(m, key)!.z }))
		.sort((a, b) => a.z - b.z || index(a.key) - index(b.key));
}
/** The category drawn directly below this one, or '' when it draws lowest. */
export function drawsAbove(m: Pick<Manifest, 'slots'>, key: string): string {
	const order = drawingOrder(m),
		at = order.findIndex((x) => x.key === key);
	return at > 0 ? order[at - 1].key : '';
}
/** Draw a custom category's front directly above `above`: between it and the next depth, or at its depth just after it.
 *  The whole front moves together, items already made included: the undirected front override becomes the new depth and
 *  every directional or per-frame front override (a copied hand's near-side order, a manual layer move) shifts by the same
 *  step, so its relative order is kept. Back layers keep their depth (a cape's back stays behind the body). Future items
 *  start at the slot's depth, which is the same value. */
export function setDrawsAbove(m: Editable, key: string, above: string) {
	const at = m.slots.findIndex((x) => x.id === key);
	if (at < 0 || isBuiltin(key) || key === above)
		throw new Error('Built-in drawing order stays fixed.');
	const s = m.slots[at],
		base = slotDef(m, above);
	if (!base) throw new Error(`Unknown equipment slot: ${above}`);
	const others = drawingOrder(m).filter((x) => x.key !== key);
	const higher = others.filter((x) => x.z > base.z).map((x) => x.z);
	const next = higher.length ? Math.min(...higher) : base.z + 20;
	const z = next - base.z >= 2 ? Math.floor((base.z + next) / 2) : base.z;
	const step = z - s.z;
	m.slots.splice(at, 1);
	s.z = z;
	if (z === base.z) {
		// Same depth: drawn after `above` (array order breaks ties), materialized so the tie has a position.
		if (isBuiltin(above)) own(m, above);
		const after = m.slots.findIndex((x) => x.id === above);
		m.slots.splice(after + 1, 0, s);
	} else insertByZ(m, s);
	const undirected = (o: ZOverride) => !o.dir && !o.anim && o.cell == null;
	s.zOverrides = [
		...(s.zOverrides ?? [])
			.filter((o) => !(o.layer === 'fg' && undirected(o)))
			.map((o) => (o.layer === 'fg' ? { ...o, z: o.z + step } : o)),
		{ layer: 'fg', z }
	];
}
/** A custom category's settings form. `hand` only for held behavior; `above` only when the person picked a drawing order:
 *  otherwise a new behavior or hand draws at its own default depth. */
export interface SlotSettings {
	label: string;
	profile: Exclude<SlotProfile, 'body'>;
	hand?: 'left' | 'right';
	above?: string;
	hint: string;
}
/** Whether saving these settings changes how new items attach (only an empty category may). */
export function changesAttachment(
	m: Pick<Manifest, 'slots'>,
	key: string,
	o: SlotSettings
): boolean {
	const s = m.slots.find((x) => x.id === key);
	if (!s) return false;
	if (o.profile !== (s.profile ?? 'accessory')) return true;
	return s.class === 'held' && !!o.hand && o.hand !== sideOf(s);
}
/** Apply a custom category's whole settings form as one edit: callers run it on a copy, so a refused part changes nothing. */
export function applySettings(m: Editable, key: string, o: SlotSettings) {
	const s = m.slots.find((x) => x.id === key);
	if (!s || isBuiltin(key) || key === BASE_KEY)
		throw new Error('Built-in categories can only be shown, hidden or moved.');
	if (cleanLabel(o.label) !== s.label) renameCustom(m, key, o.label);
	if (o.profile !== (s.profile ?? 'accessory')) setBehavior(m, key, o.profile);
	const now = m.slots.find((x) => x.id === key)!;
	if (now.class === 'held' && o.hand) setHand(m, key, o.hand);
	if (o.above && o.above !== drawsAbove(m, key)) setDrawsAbove(m, key, o.above);
	setHint(m, key, o.hint);
}
/** Remove an empty custom category and outfit entries naming it. Callers check it is empty first. */
export function deleteCustom(m: Editable, key: string) {
	if (isBuiltin(key) || key === BASE_KEY)
		throw new Error('Built-in categories can only be hidden.');
	if (m.items.some((it) => it.slot === key))
		throw new Error('Remove its items before deleting the category.');
	m.slots = m.slots.filter((s) => s.id !== key);
	for (const item of m.items) if (item.hides) item.hides = item.hides.filter((id) => id !== key);
	for (const slot of m.slots) {
		if (slot.hides) slot.hides = slot.hides.filter((id) => id !== key);
		if (slot.clips) slot.clips = slot.clips.filter((id) => id !== key);
	}
	for (const p of m.presets) delete p.items[key];
}
