// Dress-up persistence (browser): open a fixture or an IndexedDB project, save outfit presets + materials + z overrides.
// IndexedDB projects (records with a manifest) are written back in place; fixtures get a side record "dress-<source>".
import { loadFixture } from '../compose/fixture.ts';
import {
	loadProject,
	rememberDecoded,
	untilAborted,
	type StoredProject
} from '../store/project.ts';
import { rigArtworkVersion } from '../rig/rig.ts';
import * as db from '../store/db.ts';
import type { Manifest, Material, Preset, Project, Sha256, Slot } from '../store/manifest.ts';
import { CURRENT_FORMAT, supportedFormat } from '../store/manifest.ts';
import type { Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { assetUrl } from '../assets.ts';
import { stableStringify } from '../image/hash.ts';
import { retainSlotDirections } from '../items/slots.ts';

export interface Outfit {
	items: Preset['items'];
	variants: Preset['variants'];
}
export interface DressState {
	/** Snapshots from another format are ignored and removed (store/project.ts deleteOutdated). */
	format: typeof CURRENT_FORMAT;
	materials: Material[];
	presets: Preset[];
	/** The character's slot definitions in render order (array order breaks equal-depth ties): drawing depth, overrides,
	 *  custom slots and Wardrobe organization (labels, order, Not shown). */
	slots: Slot[];
	hides: Record<string, string[] | null>;
	current?: Outfit;
	itemIds: string[];
}
interface ProjectRecord {
	id: string;
	manifest?: Manifest;
	dress?: { current?: Outfit };
	character?: StoredProject['character'];
	moveRecovery?: StoredProject['moveRecovery'];
}

export const FIXTURES = ['s2'];

// Every open of a bundled character (the Studio and each demo thumbnail at startup) shares one download per file for the
// page's lifetime; the set is fixed and small. A failed download is dropped so the next open fetches it again.
const fixtureFiles = new Map<string, Promise<Uint8Array>>();
function fixtureFile(url: string): Promise<Uint8Array> {
	let file = fixtureFiles.get(url);
	if (!file) {
		file = fetch(url).then(async (response) => {
			if (!response.ok)
				throw new Error(
					`The bundled character could not load (${response.status}). Reconnect and reload to try again.`
				);
			return new Uint8Array(await response.arrayBuffer());
		});
		fixtureFiles.set(url, file);
		file.catch(() => fixtureFiles.delete(url)); // the caller awaiting it reports the error
	}
	return file;
}

// A bundled character is built from its files once for the page's lifetime; a failed build is dropped and tried again.
const fixtureProjects = new Map<string, Promise<Project>>();
function fixtureProject(name: string): Promise<Project> {
	let built = fixtureProjects.get(name);
	if (!built) {
		built = loadFixture((p) => fixtureFile(assetUrl(`fixtures/${name}/${p}`)));
		fixtureProjects.set(name, built);
		built.catch(() => fixtureProjects.delete(name)); // the opens awaiting it report the error
	}
	return built;
}

/** Sources: "fixture:<name>" and every IndexedDB project record holding a current manifest. */
export async function listSources(): Promise<{ id: string; label: string }[]> {
	const recs = (await db.all<ProjectRecord>('projects')).filter(
		(r) => supportedFormat(r?.manifest?.format) && r.id?.startsWith('rig-')
	);
	return [
		...FIXTURES.map((f) => ({ id: `fixture:${f}`, label: `fixture ${f}` })),
		...recs.map((r) => ({
			id: r.id,
			label: `${r.manifest!.name} · ${r.id} · ${r.manifest!.items.length} items`
		}))
	];
}

/** A bundled fixture with its saved colors and outfit. Each call gets its own manifest and image map (the Studio edits them in
 *  place); the decoded images are shared. Also read, without opening it, to offer the demo's items to other characters. */
export async function openFixture(
	id: string,
	signal?: AbortSignal
): Promise<{ project: Project; current?: Outfit }> {
	const built = await untilAborted(fixtureProject(id.slice(8)), signal);
	const project: Project = {
		manifest: structuredClone(built.manifest),
		images: new Map(built.images)
	};
	const saved = await db.get<DressState>('projects', `dress-${id}`).catch(() => undefined);
	signal?.throwIfAborted();
	if (saved?.format !== CURRENT_FORMAT) return { project };
	applyDress(project.manifest, saved);
	return { project, current: saved.current };
}

export async function openSource(
	id: string,
	signal?: AbortSignal,
	options?: Parameters<typeof loadProject>[2]
): Promise<{ project: Project; current?: Outfit; missingImages?: number }> {
	signal?.throwIfAborted();
	if (id.startsWith('fixture:')) return openFixture(id, signal);
	const { rec, project, missingImages } = await loadProject(id, signal, options);
	signal?.throwIfAborted();
	return { project, current: (rec as ProjectRecord).dress?.current, missingImages };
}

export const dressOf = (m: Manifest, current?: Outfit): DressState => ({
	format: CURRENT_FORMAT,
	itemIds: m.items.map((it) => it.id),
	materials: m.materials,
	presets: m.presets,
	slots: m.slots,
	hides: Object.fromEntries(m.items.map((it) => [it.id, it.hides ?? null])),
	current
});

/** The snapshot's slot definitions, plus any slot it does not know that holds items (a newer fit: a snapshot never strands art).
 *  An empty slot absent from the snapshot was deleted or not yet organized there; an empty built-in falls back to its default. */
function mergeSlots(m: Pick<Manifest, 'slots' | 'items'>, saved: Slot[]): Slot[] {
	const known = new Set(saved.map((s) => s.id)),
		used = new Set(m.items.map((it) => it.slot));
	const slots = structuredClone(saved);
	for (const s of m.slots) {
		if (known.has(s.id) || !used.has(s.id)) continue;
		slots.splice(slots.findLastIndex((x) => x.z <= s.z) + 1, 0, structuredClone(s));
	}
	return slots;
}

/** Slot edits one view made, carried onto the latest slot definitions (a three-way merge by slot id). `base`: the definitions
 *  the view started from; `mine`: the view's definitions now; `theirs`: the latest ones (the saved record, or this view after
 *  other changes). A slot `mine` added or changed from `base` takes `mine`'s version and place (by depth; equal depths keep
 *  `mine`'s order). A slot `mine` left unchanged keeps `theirs`'s version, so a stale view never overwrites a newer edit and
 *  never brings back a slot deleted elsewhere. A slot `mine` removed is removed only when `theirs` still has `base`'s exact
 *  version and it is not in `keep` (slots holding items or item attempts): removing it must never strand work. A slot deleted
 *  elsewhere stays deleted even when `mine` changed it, unless it is in `keep`. */
export function mergeSlotEdits(
	base: readonly Slot[],
	mine: readonly Slot[],
	theirs: readonly Slot[],
	keep: ReadonlySet<string> = new Set()
): Slot[] {
	const byId = (list: readonly Slot[]) => new Map(list.map((s) => [s.id, s])),
		B = byId(base),
		M = byId(mine),
		T = byId(theirs);
	const same = (a: Slot | undefined, b: Slot | undefined) =>
		!!a && !!b && stableStringify(a) === stableStringify(b);
	const edited = (id: string) => M.has(id) && !same(M.get(id), B.get(id));
	const out = theirs
		.filter((s) => {
			if (M.has(s.id)) return !edited(s.id);
			if (!B.has(s.id)) return true; // added elsewhere
			return keep.has(s.id) || !same(s, B.get(s.id)); // removed here: kept when busy or changed elsewhere
		})
		.map((s) => structuredClone(s));
	const rank = new Map(mine.map((s, i) => [s.id, i]));
	for (const s of mine) {
		if (!edited(s.id)) continue;
		if (B.has(s.id) && !T.has(s.id) && !keep.has(s.id)) continue; // deleted elsewhere
		const i = rank.get(s.id)!;
		const at = out.findLastIndex((x) => x.z < s.z || (x.z === s.z && (rank.get(x.id) ?? -1) < i));
		out.splice(at + 1, 0, structuredClone(s));
	}
	return out;
}

/** Overlay a saved dress state; item.materials are rebuilt from material owners. */
export function applyDress(m: Manifest, d: DressState) {
	// An older autosave does not own items added after its snapshot. Retain their palettes, while allowing palette removal
	// for items that the snapshot actually covered. Never restore materials for an item already removed in another action.
	const owners = new Set([...d.itemIds, ...d.materials.map((x) => x.owner)]),
		current = new Set(m.items.map((it) => it.id));
	m.materials = [
		...structuredClone(d.materials).filter((x) => current.has(x.owner)),
		...m.materials.filter((x) => current.has(x.owner) && !owners.has(x.owner))
	];
	m.presets = structuredClone(d.presets);
	if (Array.isArray(d.slots)) m.slots = mergeSlots(m, d.slots);
	for (const it of m.items) {
		it.materials = m.materials.filter((x) => x.owner === it.id).map((x) => x.id);
		const h = d.hides?.[it.id];
		if (h !== undefined) h ? (it.hides = [...h]) : delete it.hides;
	}
}

/** B15: persist a base region split (splitBase + deriveMaterials ran on `m`): new cell blobs, then one atomic update of the
 * base cells, regions mark, base materials, baseHash and the items moved from the old hash. */
export async function saveSplit(
	id: string,
	m: Manifest,
	split: { oldHash: string; images: Map<string, Img> }
) {
	const blobs = new Map<string, Blob>();
	for (const [h, im] of split.images)
		blobs.set(
			h.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	const base = m.items.find((i) => i.id === m.rig.baseItem)!;
	await db.updateCharacter<ProjectRecord>(id, blobs, (rec) => {
		if (!rec?.manifest) throw new Error(`project ${id} vanished`);
		const cur = rec.manifest,
			cb = cur.items.find((i) => i.id === cur.rig.baseItem)!;
		if (
			cur.rig.baseHash === m.rig.baseHash &&
			cur.rig.baseHash !== split.oldHash &&
			cb.regions === base.regions
		)
			return rec; // another tab completed the same split
		if (cur.rig.baseHash !== split.oldHash && cur.rig.baseHash !== m.rig.baseHash)
			throw new Error(
				'This character changed while preparing its colors. Open it again before editing.'
			);
		const receiptMatches =
			rec.moveRecovery?.bodyRigVersion === rigArtworkVersion(cur.rig, rec.character);
		cb.layers = structuredClone(base.layers);
		cb.regions = base.regions;
		cb.materials = [...base.materials];
		cur.materials = [
			...cur.materials.filter((x) => x.owner !== cb.id),
			...structuredClone(m.materials.filter((x) => x.owner === cb.id))
		];
		if (cur.rig.baseHash === split.oldHash) {
			cur.rig.baseHash = m.rig.baseHash;
			for (const it of cur.items) if (it.baseHash === split.oldHash) it.baseHash = m.rig.baseHash;
		}
		if (receiptMatches && rec.moveRecovery)
			rec.moveRecovery = {
				...rec.moveRecovery,
				bodyRigVersion: rigArtworkVersion(cur.rig, rec.character)
			};
		return rec;
	});
	// The next open reads these cells: they are already decoded here.
	for (const [h, im] of split.images) rememberDecoded(h as Sha256, im);
}

/** How a save writes slot definitions. `base`: the definitions the saving view started from (its last open or save), so only
 *  the slots it changed since are written (mergeSlotEdits): a routine save of a stale view changes no slot. `keep`: slots its
 *  item attempts use, never removed. Without it the snapshot's whole list is written (a developer page's own save). */
export interface SlotSave {
	base: readonly Slot[];
	keep?: Iterable<string>;
}
/** Save. For IndexedDB projects: one atomic read-modify-write (db.update), so concurrent item writes are kept (R6 P1-5).
 *  Returns the slot definitions now saved, for the view to continue from. */
export async function saveDress(
	id: string,
	m: Manifest,
	current: Outfit,
	slotSave?: SlotSave
): Promise<Slot[]> {
	const d = structuredClone(dressOf(m, current));
	const merged = (theirs: readonly Slot[], items: readonly { slot: string }[]) =>
		slotSave
			? mergeSlotEdits(
					slotSave.base,
					d.slots,
					theirs,
					new Set([...items.map((it) => it.slot), ...(slotSave.keep ?? [])])
				)
			: d.slots;
	if (id.startsWith('fixture:')) {
		// The bundled demo's dress state is its own small record, read as openFixture reads it (unreadable: the bundled
		// character this view opened). Not one transaction: the demo is a preview, and its items never change.
		const key = `dress-${id}`,
			prev = await db.get<DressState>('projects', key).catch(() => undefined);
		const theirs =
			prev?.format === CURRENT_FORMAT && Array.isArray(prev.slots)
				? prev.slots
				: (slotSave?.base ?? d.slots);
		const slots = merged(theirs, m.items);
		await db.put('projects', key, { id: key, kind: 'dress', ...d, slots });
		return structuredClone(slots);
	}
	let saved: Slot[] = [];
	await db.update<ProjectRecord>('projects', id, (rec) => {
		if (!rec?.manifest) throw new Error(`project ${id} vanished`);
		const manifest = rec.manifest,
			live = new Set(manifest.items.map((it) => it.id));
		const known = new Set([...d.itemIds, ...d.materials.map((mat) => mat.owner)]);
		const retained = rec.dress?.current;
		// A fit accepted after this snapshot owns its new materials and current equipped slot/variant selection.
		const newSlots = Object.entries(retained?.items ?? {}).filter(
			([, item]) => item && live.has(item) && !known.has(item)
		);
		const materials = [
			...d.materials.filter((mat) => live.has(mat.owner)),
			...manifest.materials.filter((mat) => live.has(mat.owner) && !known.has(mat.owner))
		];
		const materialIds = new Set(materials.map((mat) => mat.id));
		for (const mat of materials) if (mat.linkTo && !materialIds.has(mat.linkTo)) delete mat.linkTo;
		const extraVariants = Object.fromEntries(
			Object.entries(retained?.variants ?? {}).filter(([id]) =>
				materials.some((mat) => mat.id === id && !known.has(mat.owner))
			)
		);
		const current = d.current && {
			items: { ...d.current.items, ...Object.fromEntries(newSlots) },
			variants: { ...d.current.variants, ...extraVariants }
		};
		const slots = retainSlotDirections(
			merged(manifest.slots, manifest.items),
			manifest.rig.directions
		);
		const cleaned = { ...d, materials, current, slots };
		for (const preset of [...cleaned.presets, ...(current ? [current] : [])]) {
			for (const slot of Object.keys(preset.items))
				if (preset.items[slot] && !live.has(preset.items[slot]!)) preset.items[slot] = null;
			for (const material of Object.keys(preset.variants))
				if (!materialIds.has(material)) delete preset.variants[material];
		}
		applyDress(manifest, cleaned);
		rec.dress = { current };
		saved = structuredClone(manifest.slots);
		return rec;
	});
	return saved;
}
