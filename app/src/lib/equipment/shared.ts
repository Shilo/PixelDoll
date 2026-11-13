// Every finished item of the user's other saved characters, offered in the wardrobe. Built from the saved records only:
// nothing is persisted. Fit checks read the frames they compare, and thumbnails load lazily.
import * as db from '../store/db.ts';
import { decodePng, type Img } from '../image/png.ts';
import { recolor } from '../dress/dress.ts';
import { listProjects } from '../store/project.ts';
import type { Item, Manifest, Preset, Project, Sha256, UnfitNote } from '../store/manifest.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { bodyOf } from './compatibility.ts';
import { itemKey, sharedFit, unfittedPlan, type SharedFit } from './copy.ts';

export interface SharedItem {
	sourceId: string;
	sourceName: string;
	source: Manifest;
	/** When the source was last saved: with the ids, a stable identity for its thumbnail. */
	savedAt: string;
	item: Item;
	/** The source's current colors. */
	variants: Preset['variants'];
	at: string;
	/** How it comes to the open character. */
	fit: SharedFit;
	/** What wearing it unfitted approximates (fit 'unfitted' only). */
	notes?: UnfitNote[];
	/** A bundled source's decoded images: they are not stored. */
	images?: ReadonlyMap<string, Img>;
}
/** A character that is not stored, such as the bundled demo, offered as a source with its decoded images. */
export interface BundledSource {
	id: string;
	manifest: Manifest;
	variants: Preset['variants'];
	images: ReadonlyMap<string, Img>;
}
/** Older than any saved character: an equal saved item (an editable copy of the demo) lists ahead of the bundled one. */
const BUNDLED_AT = '1970-01-01T00:00:00.000Z';

const shareable = (m: Manifest, item: Item) =>
	item.status === 'accepted' &&
	item.id !== m.rig.baseItem &&
	item.slot !== 'body' &&
	!item.variantOf &&
	!item.unfitted &&
	item.baseHash === m.rig.baseHash &&
	!!item.coverage?.length;
const latest = (item: Item, fallback: string) =>
	item.provenance.reduce((at, p) => (p.createdAt > at ? p.createdAt : at), '') || fallback;
const RANK: Record<SharedFit, number> = { copy: 0, refit: 1, unfitted: 2, remake: 3 };
/** Listing order: items fitted to this body, then ones worn as drawn, then ones to make new. */
const tier = (x: SharedItem) => (x.fit === 'remake' ? 2 : x.fit === 'unfitted' ? 1 : 0);

/** Outcomes of earlier listings by source save, item and the target's rig, body and slots: a refresh decides only what
 *  changed since. Only the latest listing's entries are kept. */
let fits = new Map<string, SharedFit>();
/** Forget the remembered outcomes (an add found one out of date). */
export const forgetFits = () => {
	fits = new Map();
};

/** Items of the other characters, saved and `bundled` (the demo), without ones this character already has; one entry per item:
 *  the one that fits this character best (exact copy, then re-fit, then worn as drawn, then made new), the most recent first
 *  within each tier. An entry whose images cannot be read is skipped and counted, so the others still list. `images` are
 *  decoded images already in memory (the open character's), read before storage. */
export async function listShared(
	targetId: string,
	target: Manifest | null,
	images?: ReadonlyMap<string, Img>,
	bundled: readonly BundledSource[] = []
): Promise<{ items: SharedItem[]; skipped: number }> {
	const own = new Set(target?.items.filter((it) => it.status === 'accepted').map(itemKey) ?? []),
		groups = new Map<string, Omit<SharedItem, 'fit'>[]>();
	const sources = [
		...(await listProjects())
			.filter((rec) => rec.origin !== 'dev')
			.map((rec) => ({
				id: rec.id,
				manifest: rec.manifest,
				savedAt: rec.savedAt,
				variants:
					(rec as { dress?: { current?: Pick<Preset, 'variants'> } }).dress?.current?.variants ??
					rec.manifest.presets[0]?.variants ??
					{},
				images: undefined as ReadonlyMap<string, Img> | undefined
			})),
		...bundled.map((b) => ({ ...b, savedAt: BUNDLED_AT }))
	];
	for (const rec of sources) {
		if (rec.id === targetId) continue;
		const m = rec.manifest,
			variants = rec.variants;
		for (const item of m.items) {
			const key = itemKey(item);
			if (!shareable(m, item) || own.has(key)) continue;
			groups.set(key, [
				...(groups.get(key) ?? []),
				{
					sourceId: rec.id,
					sourceName: m.name,
					source: m,
					savedAt: rec.savedAt,
					item,
					variants,
					at: rec.images ? BUNDLED_AT : latest(item, rec.savedAt),
					...(rec.images ? { images: rec.images } : {})
				}
			]);
		}
	}
	// Images decode once per listing: the target's body frames serve every entry.
	const decoded = new Map<Sha256, Promise<Img>>(),
		load = (h: Sha256) => {
			let im = decoded.get(h);
			const local = images?.get(h) ?? bundled.find((b) => b.images.has(h))?.images.get(h);
			if (!im && local) decoded.set(h, (im = Promise.resolve(local)));
			if (!im)
				decoded.set(
					h,
					(im = db.getBlob(h.slice(7)).then((blob) => {
						if (!blob) throw new Error(`An image is missing (${h.slice(7, 19)}).`);
						return decodePng(blob);
					}))
				);
			return im;
		};
	const shape = target
			? await sha256(
					stableStringify({ rig: target.rig, body: bodyOf(target), slots: target.slots })
				)
			: '',
		known = fits,
		kept: SharedItem[] = [];
	let skipped = 0;
	fits = new Map();
	for (const entries of groups.values()) {
		let best: SharedItem | undefined;
		for (const entry of entries.sort((a, b) => b.at.localeCompare(a.at))) {
			const key = [entry.sourceId, entry.savedAt, entry.item.id, targetId, shape].join('|');
			let fit = known.get(key);
			try {
				fit ??= target ? await sharedFit(entry.source, entry.item, target, load) : 'remake';
			} catch (e) {
				console.warn('shared item skipped', entry.sourceId, entry.item.id, e);
				skipped++;
				continue;
			}
			fits.set(key, fit);
			// On a tie the original beats a re-fit of it (its pixels were moved for another body).
			if (
				!best ||
				RANK[fit] < RANK[best.fit] ||
				(RANK[fit] === RANK[best.fit] && !!best.item.refit && !entry.item.refit)
			)
				best = { ...entry, fit };
			if (fit === 'copy') break;
		}
		// Worked out once for the entry listed, not on every render of its tile and menu.
		if (best?.fit === 'unfitted' && target)
			best.notes = unfittedPlan(best.source, best.item, target).notes;
		if (best) kept.push(best);
	}
	return {
		items: kept.sort((a, b) => tier(a) - tier(b) || b.at.localeCompare(a.at)),
		skipped
	};
}

/** The source character with its current colors and only the images its item's first visible frame needs, for a thumbnail. */
export async function sharedPreview(entry: SharedItem, cells: string[]): Promise<Project> {
	const images = new Map<string, Img>();
	for (const h of cells) {
		const kept = entry.images?.get(h);
		if (kept) {
			images.set(h, kept);
			continue;
		}
		const blob = await db.getBlob(h.slice(7));
		if (!blob) throw new Error(`An image of ${entry.item.name} is missing.`);
		images.set(h, await decodePng(blob));
	}
	return recolor({ manifest: { ...entry.source, items: [entry.item] }, images }, entry.variants);
}
