import { layerFrame } from '../compose/compose.ts';
import { hasCells } from '../dress/dress.ts';
import type { Img } from '../image/png.ts';
import { retainItemQa } from '../items/qa-summary.ts';
import { retainSlotDirections } from '../items/slots.ts';
import { LocalizedError } from '../message.ts';
import type { Item, Manifest, Project } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { centeredMirrorFrame, flipH, flipX, mirrorPartner } from './mirror.ts';
import { opaqueBox } from './normalize.ts';
import { flipSkeleton } from './skeleton.ts';
import {
	ANCHORS,
	baseHashOf,
	cellHash,
	cellKey,
	DEFAULT_MOVE,
	DIRECTIONS,
	storedCellHashes,
	type DirectionName,
	type Keypoint,
	type RigDirection,
	type Sha256
} from './rig.ts';

export const directionLabel = (id: DirectionName) =>
	id[0].toUpperCase() + id.slice(1).replace('-', ' ');

const visibleCells = new WeakMap<Img, boolean>();

export function directionArtwork(original: readonly RigDirection[], direction: RigDirection) {
	const existing = original.find(({ id }) => id === direction.id);
	const from = direction.mirrorOf ?? (!existing ? mirrorPartner(direction.id) : undefined);
	return from && (!existing || existing.mirrorOf !== direction.mirrorOf)
		? { id: from, flip: true }
		: { id: direction.id, flip: false };
}

export function availableDirectionViews(original: readonly RigDirection[]) {
	const available = new Set(original.map(({ id }) => id));
	return DIRECTIONS.filter((id) => {
		const partner = mirrorPartner(id);
		return available.has(id) || (partner && available.has(partner));
	});
}

export function editDirectionChoice(
	original: readonly RigDirection[],
	selected: readonly RigDirection[],
	id: DirectionName,
	control: 'direction' | 'mirror'
): RigDirection[] {
	const choices = new Map(selected.map((view) => [view.id, view]));
	const current = choices.get(id);
	const partner = mirrorPartner(id);
	if (control === 'direction' && current) choices.delete(id);
	else if (control === 'mirror' && current?.mirrorOf) choices.set(id, { id });
	else {
		const existing = original.find((view) => view.id === id);
		if (control === 'direction' && existing && !existing.mirrorOf) choices.set(id, existing);
		else if (partner) {
			const source = choices.get(partner);
			if (!source || source.mirrorOf) choices.set(partner, { id: partner });
			choices.set(id, { id, mirrorOf: partner });
		}
	}
	return DIRECTIONS.flatMap((dir) => {
		const choice = choices.get(dir);
		return choice ? [choice] : [];
	});
}

export function directionProblemError(
	{ manifest, images }: Project,
	directions: readonly RigDirection[]
): LocalizedError | undefined {
	if (!directions.length)
		return new LocalizedError('Keep at least one direction.', 'directionProblem.keepOne');
	const original = new Map(manifest.rig.directions.map((dir) => [dir.id, dir]));
	if (new Set(directions.map(({ id }) => id)).size !== directions.length)
		return new LocalizedError('A direction can only be used once.', 'directionProblem.duplicate');
	for (const { id, mirrorOf } of directions) {
		const artwork = directionArtwork(manifest.rig.directions, { id, mirrorOf });
		if (!DIRECTIONS.includes(id) || !original.has(artwork.id))
			return new LocalizedError(
				'That direction is not available for this character.',
				'directionProblem.unavailable'
			);
		if (
			mirrorOf &&
			(mirrorPartner(id) !== mirrorOf ||
				!directions.some((source) => source.id === mirrorOf && !source.mirrorOf))
		)
			return new LocalizedError(
				`Keep ${directionLabel(mirrorOf)} or turn off its ${directionLabel(id)} mirror.`,
				'directionProblem.mirrorSource',
				{ source: mirrorOf, mirror: id }
			);
	}
	const base = manifest.items.find(({ id }) => id === manifest.rig.baseItem);
	const artwork = directions.map((dir) => directionArtwork(manifest.rig.directions, dir));
	if (
		artwork.some(({ flip }) => flip) &&
		manifest.items.some((item) =>
			item.layers.some(
				(layer) => !centeredMirrorFrame(manifest.rig, layerFrame(manifest.rig, layer))
			)
		)
	)
		return new LocalizedError(
			'This character has an off-center layer that cannot be mirrored.',
			'directionProblem.offCenterLayer'
		);
	const artworkDirs = artwork.map(({ id }) => id);
	const empty = manifest.rig.animations.filter(
		({ id }) => !artworkDirs.some((dir) => hasCells(manifest, base, id, dir))
	);
	if (empty.length)
		return new LocalizedError(
			`Keep a direction with artwork for ${empty.map(({ id }) => id.replaceAll(/[-_]/g, ' ')).join(', ')}.`,
			'directionProblem.moveArtwork',
			{ moves: empty.map(({ id }) => id), moveIds: manifest.rig.animations.map(({ id }) => id) }
		);
	if (manifest.items.length > 1) {
		const visible = (hash: Sha256) => {
			const image = images.get(hash);
			if (!image) return false;
			const cached = visibleCells.get(image);
			if (cached !== undefined) return cached;
			const opaque = !!opaqueBox(image);
			visibleCells.set(image, opaque);
			return opaque;
		};
		const hasArtwork = (item: Item, views: readonly DirectionName[]) =>
			views.some((dir) =>
				manifest.rig.animations.some((move) => hasCells(manifest, item, move.id, dir, visible))
			);
		const stranded = manifest.items.filter(
			(item) =>
				item !== base && !hasArtwork(item, artworkDirs) && hasArtwork(item, [...original.keys()])
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

/** Recompute `baseHash` from the base cells and move the items made for the previous body to it. */
export async function rehash(manifest: Manifest) {
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

type DirectionData = Pick<StoredProject, 'manifest' | 'skeletons' | 'rigQa' | 'moveRecovery'>;

export async function configureDirections<Data extends DirectionData>(
	record: Data,
	directions: RigDirection[],
	images: Project['images']
): Promise<{ record: Data; newImages: Map<Sha256, Img> }> {
	const problem = directionProblemError({ manifest: record.manifest, images }, directions);
	if (problem) throw problem;
	const result = structuredClone(record);
	const { manifest } = result;
	const original = record.manifest.rig;
	const { rig } = manifest;
	const keepOriginal = new Set(directions.filter(({ mirrorOf }) => !mirrorOf).map(({ id }) => id));
	keepStandingReferences(manifest, keepOriginal);
	const newImages = new Map<Sha256, Img>();
	const mirrored = new Map<Sha256, Promise<Sha256>>();
	const flipImage = (hash: Sha256) => {
		let flipped = mirrored.get(hash);
		if (!flipped) {
			const image = images.get(hash);
			if (!image) throw new Error(`Direction artwork is missing: ${hash}`);
			const img = flipH(image);
			flipped = cellHash(img).then((key) => {
				if (!images.has(key)) newImages.set(key, img);
				return key;
			});
			mirrored.set(hash, flipped);
		}
		return flipped;
	};
	const changed = new Set<DirectionName>();
	const width = rig.cell.w;
	const flipPose = (pose: Keypoint[]) => pose.map((point) => ({ ...point, x: 1 - point.x }));
	for (const direction of directions) {
		const { id, mirrorOf } = direction;
		const existing = original.directions.find((dir) => dir.id === id);
		if (existing && existing.mirrorOf === mirrorOf) continue;
		changed.add(id);
		const artwork = directionArtwork(original.directions, direction);
		const fallback = original.directions.find(({ id }) => id === artwork.id)?.mirrorOf;
		const rigSource = fallback ?? artwork.id;
		const flipRig = artwork.flip !== !!fallback;
		const rest = original.rest?.[rigSource];
		if (mirrorOf || !rest) {
			const target = rig.rest?.[id];
			if (target) target.registrationOnly = true;
		} else {
			(rig.rest ??= {})[id] = {
				...rest,
				image: flipRig ? await flipImage(rest.image) : rest.image,
				keypoints: flipRig ? flipPose(rest.keypoints) : structuredClone(rest.keypoints)
			};
		}
		for (const [index, move] of rig.animations.entries()) {
			const oldMove = original.animations[index];
			if (move.sources) delete move.sources[id];
			const oldSource = oldMove.sources?.[rigSource];
			if (!mirrorOf && oldSource && rig.rest?.[id]) {
				(move.sources ??= {})[id] = {
					route: 'import',
					reference: rig.rest[id].image,
					...(oldSource.motion === 'imported-rest' && { motion: oldSource.motion }),
					keypoints: flipRig
						? oldSource.keypoints?.map(flipPose)
						: structuredClone(oldSource.keypoints),
					measured: flipRig
						? oldSource.measured?.map(flipPose)
						: structuredClone(oldSource.measured),
					provenance: []
				};
			}
			for (let index = 0; index < move.cells; index++) {
				const key = cellKey(move.id, id, index);
				const direct = record.skeletons?.[cellKey(move.id, artwork.id, index)];
				const source = direct ?? record.skeletons?.[cellKey(move.id, rigSource, index)];
				if (result.skeletons) delete result.skeletons[key];
				if (source)
					(result.skeletons ??= {})[key] = (direct ? artwork.flip : flipRig)
						? flipSkeleton(source, width)
						: structuredClone(source);
			}
		}
		for (const anchor of ANCHORS)
			for (const [move, rows] of Object.entries(rig.anchors?.[anchor] ?? {})) {
				const old = original.anchors?.[anchor]?.[move];
				const source = old?.[artwork.id] ?? old?.[rigSource];
				delete rows[id];
				if (source)
					rows[id] = source.map(([x, y]) => [
						(old?.[artwork.id] ? artwork.flip : flipRig) ? flipX(x, width) : x,
						y
					]);
			}
		for (const [index, item] of manifest.items.entries()) {
			const old = record.manifest.items[index];
			for (const [layerIndex, layer] of item.layers.entries())
				for (const [move, rows] of Object.entries(layer.cells ?? {})) {
					const oldRows = old.layers[layerIndex].cells?.[move];
					const direct = oldRows?.[artwork.id];
					const source = direct ?? oldRows?.[rigSource];
					delete rows[id];
					if (source)
						rows[id] = (direct ? artwork.flip : flipRig)
							? await Promise.all(source.map((hash) => (hash ? flipImage(hash) : null)))
							: [...source];
				}
			for (const [move, rows] of Object.entries(item.baseCut ?? {})) {
				const direct = old.baseCut?.[move]?.[artwork.id];
				const source = direct ?? old.baseCut?.[move]?.[rigSource];
				delete rows[id];
				if (!mirrorOf && source)
					rows[id] = source.map((mask) =>
						mask && (direct ? artwork.flip : flipRig)
							? mask
									.map((pixel) => pixel - (pixel % width) + flipX(pixel % width, width))
									.sort((left, right) => left - right)
							: (mask?.slice() ?? null)
					);
			}
			if (item.dressed) delete item.dressed[id];
			const dressed = old.dressed?.[rigSource];
			if (!mirrorOf && dressed)
				(item.dressed ??= {})[id] = flipRig ? await flipImage(dressed) : dressed;
			if (item.coverage) {
				const coverage = (old.coverage ?? []).map(
					(key) => key.split('/') as [string, DirectionName, string]
				);
				const direct = new Set(
					coverage
						.filter(([, dir]) => dir === artwork.id)
						.map(([move, , frame]) => `${move}/${frame}`)
				);
				item.coverage = item.coverage.filter((key) => key.split('/')[1] !== id);
				for (const [move, dir, frame] of coverage)
					if (dir === artwork.id || (dir === rigSource && !direct.has(`${move}/${frame}`)))
						item.coverage.push(`${move}/${id}/${Number(frame)}`);
			}
		}
		for (const [index, slot] of manifest.slots.entries()) {
			if (!artwork.flip) continue;
			const overrides = record.manifest.slots[index].zOverrides;
			if (slot.zOverrides && overrides)
				slot.zOverrides = [
					...slot.zOverrides.filter(({ dir }) => dir !== id),
					...overrides
						.filter(({ dir }) => dir === artwork.id)
						.map((entry) => ({ ...entry, dir: id }))
				];
		}
	}
	pruneCharacterDirections(result, directions, changed);
	await rehash(manifest);
	return { record: result, newImages };
}

function pruneCharacterDirections(
	result: DirectionData,
	directions: RigDirection[],
	changed: Set<DirectionName>
) {
	const { manifest } = result;
	const { rig } = manifest;
	const keep = new Set(directions.map(({ id }) => id));
	const keepKey = (key: string) => keep.has(key.split('/')[1] as DirectionName);
	const keepQa = (key: string) => keepKey(key) && !changed.has(key.split('/')[1] as DirectionName);
	rig.directions = directions.map((dir) => ({ ...dir }));
	for (const move of rig.animations) {
		pruneDirections(move.sources, keep);
		if (move.directions) {
			const base = manifest.items.find(({ id }) => id === rig.baseItem);
			move.directions = directions
				.map(({ id }) => id)
				.filter((id) => hasCells(manifest, base, move.id, id));
		}
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
		item.mirror = directions.some(({ mirrorOf }) => mirrorOf) ? 'flip' : 'generate';
		if (item.anchorCell && !keepQa(item.anchorCell)) delete item.anchorCell;
		if (item.refit) item.refit = item.refit.filter(({ dir }) => keepQa(`/${dir}`));
		if (item.unfitted) item.unfitted = item.unfitted.filter(({ dir }) => !dir || keepQa(`/${dir}`));
		if (item.paletteRepairs)
			item.paletteRepairs = item.paletteRepairs.filter(({ dir }) => keepQa(`/${dir}`));
		retainItemQa(item, keepQa);
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
		for (const key of Object.keys(qa.clips ?? {})) if (!keepQa(key)) delete qa.clips![key];
		if (Array.isArray(qa.tracks)) qa.tracks = qa.tracks.filter((track) => keepQa(track.animDir));
		if (Array.isArray(qa.warnings))
			qa.warnings = qa.warnings.filter((warning) => {
				const scoped = /^(?:[^/ :]+\/)?([^/ :]+):? /.exec(warning);
				return !DIRECTIONS.includes(scoped?.[1] as DirectionName) || keepQa(`/${scoped![1]}`);
			});
		if (qa.pivotFrom && !keepQa(qa.pivotFrom)) delete qa.pivotFrom;
	}
	delete result.moveRecovery;
}

export async function configureImportedDirections(
	project: Project,
	directions: RigDirection[],
	extra: Pick<StoredProject, 'skeletons' | 'rigQa'> = {}
) {
	const { record, newImages } = await configureDirections(
		{ manifest: project.manifest, ...extra },
		directions,
		project.images
	);
	const { manifest, ...metadata } = record;
	const images = new Map<string, Img>();
	const add = (hash: Sha256 | null | undefined) => {
		if (hash && !images.has(hash))
			images.set(hash, newImages.get(hash) ?? project.images.get(hash)!);
	};
	for (const rest of Object.values(manifest.rig.rest ?? {})) add(rest?.image);
	for (const item of manifest.items) {
		for (const hash of Object.values(item.dressed ?? {})) add(hash);
		for (const layer of item.layers)
			for (const rows of Object.values(layer.cells ?? {}))
				for (const row of Object.values(rows)) for (const hash of row ?? []) add(hash);
	}
	return { manifest, images, metadata };
}
