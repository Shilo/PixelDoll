// Every finished item of the user's other saved characters, offered in the wardrobe. Built from the saved records only:
// nothing is persisted, and images load lazily for thumbnails.
import * as db from '../store/db.ts';
import { decodePng, type Img } from '../image/png.ts';
import { recolor } from '../dress/dress.ts';
import { listProjects } from '../store/project.ts';
import type { Item, Manifest, Preset, Project } from '../store/manifest.ts';

export interface SharedItem {
	sourceId: string;
	sourceName: string;
	source: Manifest;
	item: Item;
	/** The source's current colors. */
	variants: Preset['variants'];
	at: string;
}

/** Same slot and same request: the same item for the wardrobe's purposes. */
const sameAs = (item: Item) =>
	`${item.slot}\n${(item.prompt.trim() || item.name).toLowerCase().replace(/\s+/g, ' ')}`;
const shareable = (m: Manifest, item: Item) =>
	item.status === 'accepted' &&
	item.id !== m.rig.baseItem &&
	item.slot !== 'body' &&
	!item.variantOf &&
	item.baseHash === m.rig.baseHash &&
	!!item.coverage?.length;
const latest = (item: Item, fallback: string) =>
	item.provenance.reduce((at, p) => (p.createdAt > at ? p.createdAt : at), '') || fallback;

/** Items of other studio characters, without ones this character already has; one entry per item, the most recent kept. */
export async function listShared(targetId: string, target: Manifest | null): Promise<SharedItem[]> {
	const own = new Set(target?.items.map(sameAs) ?? []),
		kept = new Map<string, SharedItem>();
	for (const rec of await listProjects()) {
		if (rec.id === targetId || rec.origin === 'dev') continue;
		const m = rec.manifest,
			variants =
				(rec as { dress?: { current?: Pick<Preset, 'variants'> } }).dress?.current?.variants ??
				m.presets[0]?.variants ??
				{};
		for (const item of m.items) {
			const key = sameAs(item);
			if (!shareable(m, item) || own.has(key)) continue;
			const entry = {
				sourceId: rec.id,
				sourceName: m.name,
				source: m,
				item,
				variants,
				at: latest(item, rec.savedAt)
			};
			const other = kept.get(key);
			if (!other || entry.at > other.at) kept.set(key, entry);
		}
	}
	return [...kept.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** The source character with its current colors and only the images its item's first visible frame needs, for a thumbnail. */
export async function sharedPreview(entry: SharedItem, cells: string[]): Promise<Project> {
	const images = new Map<string, Img>();
	for (const h of cells) {
		const blob = await db.getBlob(h.slice(7));
		if (!blob) throw new Error(`An image of ${entry.item.name} is missing.`);
		images.set(h, await decodePng(blob));
	}
	return recolor({ manifest: { ...entry.source, items: [entry.item] }, images }, entry.variants);
}
