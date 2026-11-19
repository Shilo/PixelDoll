import { hasCells } from '../dress/dress.ts';
import type { Img } from '../image/png.ts';
import { retainItemQa } from '../items/qa-summary.ts';
import { retainSlotDirections } from '../items/slots.ts';
import { LocalizedError } from '../message.ts';
import type { Item, Manifest, Project } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { flipH, mirrorPartner } from './mirror.ts';
import { opaqueBox } from './normalize.ts';
import {
	baseHashOf,
	cellHash,
	DEFAULT_MOVE,
	DIRECTIONS,
	storedCellHashes,
	type DirectionName,
	type RigDirection,
	type Sha256
} from './rig.ts';

export const directionLabel = (id: DirectionName) =>
	id[0].toUpperCase() + id.slice(1).replace('-', ' ');

const visibleCells = new WeakMap<Img, boolean>();

export function directionProblem(
	project: Project,
	directions: readonly RigDirection[],
	mode: 'import' | 'saved'
): string {
	return directionProblemError(project, directions, mode)?.message ?? '';
}

export function directionProblemError(
	{ manifest, images }: Project,
	directions: readonly RigDirection[],
	mode: 'import' | 'saved'
): LocalizedError | undefined {
	if (!directions.length)
		return new LocalizedError('Keep at least one direction.', 'directionProblem.keepOne');
	const original = new Map(manifest.rig.directions.map((dir) => [dir.id, dir]));
	if (new Set(directions.map(({ id }) => id)).size !== directions.length)
		return new LocalizedError('A direction can only be used once.', 'directionProblem.duplicate');
	for (const { id, mirrorOf } of directions) {
		if (
			!DIRECTIONS.includes(id) ||
			(mode === 'saved' && (!original.has(id) || original.get(id)?.mirrorOf !== mirrorOf)) ||
			(mode === 'import' && !mirrorOf && !original.has(id))
		)
			return new LocalizedError(
				'That direction is not available for this character.',
				'directionProblem.unavailable'
			);
		if (
			mirrorOf &&
			((mode === 'import' && mirrorPartner(id) !== mirrorOf) ||
				!directions.some((source) => source.id === mirrorOf && !source.mirrorOf))
		)
			return new LocalizedError(
				`Keep ${directionLabel(mirrorOf)} or turn off its ${directionLabel(id)} mirror.`,
				'directionProblem.mirrorSource',
				{ source: mirrorOf, mirror: id }
			);
	}
	const base = manifest.items.find(({ id }) => id === manifest.rig.baseItem);
	const empty = manifest.rig.animations.filter(
		({ id }) =>
			!directions.some((dir) =>
				hasCells(manifest, base, id, mode === 'import' ? (dir.mirrorOf ?? dir.id) : dir.id)
			)
	);
	if (empty.length)
		return new LocalizedError(
			`Keep a direction with artwork for ${empty.map(({ id }) => id.replaceAll(/[-_]/g, ' ')).join(', ')}.`,
			'directionProblem.moveArtwork',
			{ moves: empty.map(({ id }) => id), moveIds: manifest.rig.animations.map(({ id }) => id) }
		);
	if (mode === 'saved') {
		const visible = (hash: Sha256) => {
			const image = images.get(hash);
			if (!image) return false;
			const cached = visibleCells.get(image);
			if (cached !== undefined) return cached;
			const opaque = !!opaqueBox(image);
			visibleCells.set(image, opaque);
			return opaque;
		};
		const hasArtwork = (item: Item, views: readonly RigDirection[]) =>
			views.some((dir) =>
				manifest.rig.animations.some((move) => hasCells(manifest, item, move.id, dir.id, visible))
			);
		const stranded = manifest.items.filter(
			(item) =>
				item !== base && !hasArtwork(item, directions) && hasArtwork(item, manifest.rig.directions)
		);
		if (stranded.length)
			return new LocalizedError(
				`Keep a direction with artwork for ${stranded.map(({ name }) => name).join(', ')} or remove that equipment first.`,
				'directionProblem.equipmentArtwork',
				{ items: stranded.map(({ name }) => name) }
			);
	}
	return undefined;
}

function pruneDirections<T>(
	entries: Partial<Record<DirectionName, T>> | undefined,
	keep: Set<DirectionName>
) {
	if (entries) for (const dir of DIRECTIONS) if (!keep.has(dir)) delete entries[dir];
}

async function rehash(manifest: Manifest) {
	const base = manifest.items.find(({ id }) => id === manifest.rig.baseItem)!;
	const previous = manifest.rig.baseHash;
	manifest.rig.baseHash = await baseHashOf(
		manifest.rig,
		storedCellHashes(manifest.rig, base.layers[0].cells)
	);
	for (const item of manifest.items)
		if (item.baseHash === previous) item.baseHash = manifest.rig.baseHash;
}

function keepStandingReferences(manifest: Manifest, retained: Set<DirectionName>) {
	const { rig } = manifest;
	const standing = manifest.items.find(({ id }) => id === rig.baseItem)?.layers[0].cells?.[
		DEFAULT_MOVE
	];
	for (const dir of rig.directions) {
		const image = !dir.mirrorOf && !retained.has(dir.id) && standing?.[dir.id]?.[0];
		if (image && !rig.rest?.[dir.id])
			(rig.rest ??= {})[dir.id] = { image, keypoints: [], registrationOnly: true };
	}
}

export async function configureImportedDirections(
	project: Project,
	directions: RigDirection[]
): Promise<Project> {
	const problem = directionProblemError(project, directions, 'import');
	if (problem) throw problem;
	const manifest = structuredClone(project.manifest);
	const base = manifest.items.find(({ id }) => id === manifest.rig.baseItem)!;
	if (
		manifest.items.length !== 1 ||
		base.layers.length !== 1 ||
		manifest.rig.directions.some((dir) => dir.mirrorOf)
	)
		throw new Error('Only original PixelLab character artwork can be configured during import.');
	const keep = new Set(directions.filter((dir) => !dir.mirrorOf).map((dir) => dir.id));
	keepStandingReferences(manifest, keep);
	const images = new Map<string, Img>();
	const mirrored = new Map<Sha256, Promise<Sha256>>();
	for (const rows of Object.values(base.layers[0].cells ?? {})) {
		pruneDirections(rows, keep);
		for (const { id, mirrorOf } of directions) {
			const source = mirrorOf && rows[mirrorOf];
			if (!source) continue;
			rows[id] = await Promise.all(
				source.map((hash) => {
					if (!hash) return null;
					let flipped = mirrored.get(hash);
					if (!flipped) {
						const img = flipH(project.images.get(hash)!);
						flipped = cellHash(img).then((key) => {
							images.set(key, img);
							return key;
						});
						mirrored.set(hash, flipped);
					}
					return flipped;
				})
			);
		}
		for (const row of Object.values(rows))
			for (const hash of row ?? [])
				if (hash && !images.has(hash)) images.set(hash, project.images.get(hash)!);
	}
	for (const reference of Object.values(manifest.rig.rest ?? {}))
		if (reference) images.set(reference.image, project.images.get(reference.image)!);
	manifest.rig.directions = directions.map((dir) => ({ ...dir }));
	base.mirror = directions.some((dir) => dir.mirrorOf) ? 'flip' : 'generate';
	await rehash(manifest);
	return { manifest, images };
}

export async function retainCharacterDirections(
	record: StoredProject,
	directions: RigDirection[],
	images: Project['images']
): Promise<StoredProject> {
	const problem = directionProblemError({ manifest: record.manifest, images }, directions, 'saved');
	if (problem) throw problem;
	const result = structuredClone(record);
	const { manifest } = result;
	const { rig } = manifest;
	const keep = new Set(directions.map(({ id }) => id));
	const keepKey = (key: string) => keep.has(key.split('/')[1] as DirectionName);
	keepStandingReferences(manifest, keep);
	rig.directions = rig.directions.filter(({ id }) => keep.has(id));
	for (const move of rig.animations) {
		pruneDirections(move.sources, keep);
		if (move.directions) move.directions = move.directions.filter((dir) => keep.has(dir));
	}
	for (const track of Object.values(rig.anchors ?? {}))
		for (const row of Object.values(track)) pruneDirections(row, keep);
	manifest.slots = retainSlotDirections(manifest.slots, rig.directions);
	for (const item of manifest.items) {
		for (const layer of item.layers)
			for (const row of Object.values(layer.cells ?? {})) pruneDirections(row, keep);
		for (const row of Object.values(item.baseCut ?? {})) pruneDirections(row, keep);
		pruneDirections(item.dressed, keep);
		for (const key of ['coverage', 'pending'] as const)
			if (item[key]) item[key] = item[key].filter(keepKey);
		if (item.anchorCell && !keepKey(item.anchorCell)) delete item.anchorCell;
		if (item.refit) item.refit = item.refit.filter(({ dir }) => keep.has(dir));
		if (item.unfitted) item.unfitted = item.unfitted.filter(({ dir }) => !dir || keep.has(dir));
		if (item.paletteRepairs)
			item.paletteRepairs = item.paletteRepairs.filter(({ dir }) => keep.has(dir));
		retainItemQa(item, keepKey);
	}
	for (const key of Object.keys(result.skeletons ?? {}))
		if (!keepKey(key)) delete result.skeletons![key];
	if (result.rigQa && typeof result.rigQa === 'object') {
		const qa = result.rigQa as {
			clips?: Record<string, unknown>;
			tracks?: { animDir: string }[];
			warnings?: string[];
			pivotFrom?: string;
		};
		for (const key of Object.keys(qa.clips ?? {})) if (!keepKey(key)) delete qa.clips![key];
		if (Array.isArray(qa.tracks)) qa.tracks = qa.tracks.filter((track) => keepKey(track.animDir));
		if (Array.isArray(qa.warnings))
			qa.warnings = qa.warnings.filter((warning) => {
				const scoped = /^(?:[^/ :]+\/)?([^/ :]+):? /.exec(warning);
				return (
					!DIRECTIONS.includes(scoped?.[1] as DirectionName) ||
					keep.has(scoped![1] as DirectionName)
				);
			});
		if (qa.pivotFrom && !keepKey(qa.pivotFrom)) delete qa.pivotFrom;
	}
	delete result.moveRecovery;
	await rehash(manifest);
	return result;
}
