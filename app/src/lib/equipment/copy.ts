// A free copy of another character's item: an ordinary, independent item with its own ids and materials whose cells reuse the
// source's content-addressed blobs (or their flips, for a view the source mirrors), so its pixels stay byte-identical.
import * as db from '../store/db.ts';
import { cutAt } from '../compose/compose.ts';
import { decodePng, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { flipH } from '../rig/mirror.ts';
import { cellHash } from '../rig/rig.ts';
import { variantOf, variantRampOf } from '../dress/dress.ts';
import { slotLadder } from '../items/items.ts';
import { putItem, type StoredProject } from '../store/project.ts';
import type {
	CellKey,
	DirectionName,
	Item,
	Manifest,
	Material,
	Preset,
	Sha256
} from '../store/manifest.ts';
import { stableStringify } from '../image/hash.ts';
import { assessCopy, cellId, type CopyAssessment, type Flip } from './compatibility.ts';
import { refitShared } from './refit.ts';

export interface CopyCandidate {
	item: Item;
	materials: Material[];
	assessment: CopyAssessment;
}

/** Image blobs an item references (cells and dressed references). */
export function itemHashes(item: Item): Sha256[] {
	const refs = new Set<Sha256>();
	for (const h of Object.values(item.dressed ?? {})) if (h) refs.add(h);
	for (const l of item.layers)
		for (const ds of Object.values(l.cells ?? {}))
			for (const cs of Object.values(ds ?? {})) for (const h of cs ?? []) if (h) refs.add(h);
	return [...refs];
}

/** Flipped hashes of stored images, keeping each flipped image for publication. */
export function flipper(load: (hash: Sha256) => Promise<Img>): {
	flip: Flip;
	made: Map<Sha256, Img>;
} {
	const made = new Map<Sha256, Img>(),
		memo = new Map<Sha256, Promise<Sha256>>();
	const flip: Flip = (hash) => {
		let flipped = memo.get(hash);
		if (!flipped) {
			flipped = load(hash).then(async (im) => {
				const out = flipH(im),
					h = await cellHash(out);
				made.set(h, out);
				return h;
			});
			memo.set(hash, flipped);
		}
		return flipped;
	};
	return { flip, made };
}

/** The copy, or null when the bodies differ. `variants` are the source's current colors: they become the copy's defaults. */
export async function prepareCopy(
	source: Manifest,
	itemId: string,
	variants: Preset['variants'],
	target: Manifest,
	flip: Flip
): Promise<CopyCandidate | null> {
	const original = source.items.find((it) => it.id === itemId);
	if (!original || original.slot === 'body' || original.variantOf)
		throw new Error('That item is no longer available.');
	const assessment = await assessCopy(source, original, target, flip);
	if (!assessment.fits) return null;
	const item = structuredClone(original),
		id = `gear-${crypto.randomUUID()}`;
	item.id = id;
	item.baseHash = target.rig.baseHash;
	item.coverage = assessment.matches.map((match) => match.target as CellKey);
	const materials = source.materials
		.filter((mat) => mat.owner === itemId)
		.map((mat, i) => {
			const copy: Material = { ...structuredClone(mat), id: `${id}_${i + 1}`, owner: id };
			// Links point at the source's other materials; the copy owns its resolved colors.
			delete copy.linkTo;
			const name = variantOf(source, variants, mat.id),
				ramp = name ? variantRampOf(mat, name) : undefined;
			if (name && ramp) {
				copy.variants[name] = ramp;
				copy.defaultVariant = name;
			} else delete copy.defaultVariant;
			return copy;
		});
	item.materials = materials.map((mat) => mat.id);
	const cells = target.rig.animations;
	const layerCells = item.layers.map(() => ({}) as NonNullable<Item['layers'][number]['cells']>),
		baseCut: NonNullable<Item['baseCut']> = {};
	for (const match of assessment.matches) {
		const [ta, td, ti] = match.target.split('/') as [string, DirectionName, string],
			[sa, sd, si] = match.source.split('/') as [string, DirectionName, string],
			n = cells.find((a) => a.id === ta)!.cells;
		// An identical body cell hides the same base px under the item (a mirrored source view flips them).
		const cut = cutAt(source, original, sa, sd, +si);
		if (cut?.length)
			((baseCut[ta] ??= {})[td] ??= Array(n).fill(null))[+ti] = [...cut].sort((a, b) => a - b);
		for (const [i, layer] of original.layers.entries())
			((layerCells[i][ta] ??= {})[td] ??= Array(n).fill(null))[+ti] = await cellId(
				source,
				layer,
				sa,
				sd,
				+si,
				flip
			);
	}
	item.layers.forEach((layer, i) => {
		layer.cells = layerCells[i];
		delete layer.sheets;
	});
	if (Object.keys(baseCut).length) item.baseCut = baseCut;
	else delete item.baseCut;
	// Standing references only fit future moves when the standing views match.
	if (!assessment.canExtend) {
		delete item.dressed;
		delete item.route;
	}
	if (item.qa) {
		// The art is unchanged on an identical body, so the source checks still describe it, as one summary per copied move.
		const {
			cells: _cells,
			clips: _clips,
			inherited: _inherited,
			rerolls: _rerolls,
			...summary
		} = item.qa;
		item.qa.cells = {};
		item.qa.clips = {};
		item.qa.inherited = {
			clips: [...new Set(assessment.matches.map((m) => m.target.split('/').slice(0, 2).join('/')))],
			summary
		};
	}
	return { item, materials, assessment };
}

/** Copy an item of another saved character into `targetId` in one transaction: exact on an identical body, otherwise a free
 *  approximate fit when one exists (marked for review). Returns the new item, or null when it does not fit (nothing is
 *  written). Never generates anything. */
export async function acceptCopy(
	sourceId: string,
	itemId: string,
	targetId: string
): Promise<Item | null> {
	if (!targetId.startsWith('rig-'))
		throw new Error('Make an editable copy of the demo to add items to it.');
	const [source, target] = await Promise.all([
		db.get<StoredProject & { dress?: { current?: Pick<Preset, 'variants'> } }>(
			'projects',
			sourceId
		),
		db.get<StoredProject>('projects', targetId)
	]);
	const original = source?.manifest.items.find((it) => it.id === itemId);
	if (!source || !original) throw new Error('That character or item was removed.');
	if (!target) throw new Error('This character was removed.');
	const variants = source.dress?.current?.variants ?? source.manifest.presets[0]?.variants ?? {};
	const { flip, made } = flipper(async (h) => {
		const blob = await db.getBlob(h.slice(7));
		if (!blob) throw new Error(`An image of ${original.name} is missing (${h.slice(7, 19)}).`);
		return decodePng(blob);
	});
	let candidate = await prepareCopy(source.manifest, itemId, variants, target.manifest, flip);
	if (!candidate) {
		candidate = await refitShared(source.manifest, itemId, variants, target.manifest);
		if (!candidate) return null;
		candidate.item.fittedFrom = source.manifest.name;
		if (candidate.item.qa) candidate.item.qa.status = 'warn';
	}
	const { item, materials } = candidate;
	// Store the referenced blobs with the copy, so a concurrent deletion and cleanup of the source cannot sweep them.
	const blobs = new Map<string, Blob>();
	for (const h of itemHashes(item)) {
		const im = made.get(h),
			blob = im
				? new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
				: await db.getBlob(h.slice(7));
		if (!blob) throw new Error(`An image of ${original.name} is missing (${h.slice(7, 19)}).`);
		blobs.set(h.slice(7), blob);
	}
	const body = (m: Manifest) =>
		stableStringify({ rig: m.rig, body: m.items.find((it) => it.id === m.rig.baseItem) });
	await db.updateCharacter<StoredProject>(targetId, blobs, (rec) => {
		if (!rec) throw new Error('This character was removed.');
		if (body(rec.manifest) !== body(target.manifest))
			throw new Error('This character changed while the item was being added. Try again.');
		putItem(rec.manifest, item, slotLadder(rec.manifest.rig));
		rec.manifest.materials.push(...materials);
		rec.savedAt = new Date().toISOString();
		return rec;
	});
	return item;
}
