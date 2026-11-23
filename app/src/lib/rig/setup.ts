// Turn frozen imported artwork into the same rig contract used by creation, without repainting its existing layers.
import { cellImg } from '../compose/compose.ts';
import {
	DIRECTIONS,
	DEFAULT_MOVE,
	cellHash,
	cellKey,
	matchesStanding,
	type DirectionName,
	type Keypoint,
	type Rig,
	type Sha256
} from './rig.ts';
import { HEADROOM_MIN, anchorTracks, type Built } from './freeze.ts';
import { clipQa } from './clips.ts';
import { fixedFacingLocomotion, importedPoseIssues } from './pose-review.ts';
import { opaqueBox } from './normalize.ts';
import { fromApi, hasAll } from './poses.ts';
import { flipH, mirrorPartner } from './mirror.ts';
import { flipSkeleton, type Skeleton } from './skeleton.ts';
import type { Img } from '../image/png.ts';
import type { Layer, Project, Provenance } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { LocalizedError } from '../message.ts';

export interface SetupPlan {
	restAnim: string;
	fixedRest: boolean;
	rest: Partial<Record<DirectionName, Img>>;
	registrationDirections: 4 | 8;
	frames: Map<Sha256, Img>;
	gens: number;
	warnings: string[];
}
export const STATE_CAPTURE_MODE = 'state-capture';

/** Moves rig setup skipped because a frame had no valid joints: kept as drawn, marked to make again (rigQa.redo). */
export const setupRedoMoves = (rec?: Pick<StoredProject, 'rigQa'> | null): string[] => {
	const redo = (rec?.rigQa as { redo?: unknown } | undefined)?.redo;
	return Array.isArray(redo) ? redo.filter((id): id is string => typeof id === 'string') : [];
};

export function rigReady(
	rec?:
		(Pick<StoredProject, 'manifest' | 'character'> & Partial<Pick<StoredProject, 'rigQa'>>) | null,
	requireRegistration = true
): boolean {
	const r = rec?.manifest.rig;
	if (!r || (requireRegistration && (!rec.character?.id || !rec.character.looks?.trim())))
		return false;
	const base = rec.manifest.items.find((i) => i.id === r.baseItem)?.layers[0],
		redo = setupRedoMoves(rec);
	return (
		!!base &&
		r.directions.every((d) => d.mirrorOf || hasAll(r.rest?.[d.id]?.keypoints)) &&
		r.animations.every((a) => {
			if (a.kind === 'state' && a.id !== DEFAULT_MOVE) return true;
			// A move setup skipped waits to be made again; the rest of the rig is ready without it.
			if (redo.includes(a.id) && !a.sources) return true;
			return r.directions.every((d) => {
				if (d.mirrorOf || !base.cells?.[a.id]?.[d.id]?.some(Boolean)) return true;
				if (matchesStanding(r, a, d.id, base.cells?.[a.id]?.[d.id]?.[0])) return true;
				const poses = a.sources?.[d.id]?.keypoints;
				return poses?.length === a.cells && poses.every(hasAll);
			});
		})
	);
}

/** The move whose first frame stands in for a drawn view's missing saved original. */
export const setupRestAnimation = (rig: Pick<Rig, 'animations'>, restAnim?: string) =>
	restAnim
		? rig.animations.find((a) => a.id === restAnim)
		: (rig.animations.find((a) => /^(default|rest|idle|standing)$/.test(a.id)) ??
			rig.animations[0]);
/** The stored frames setup measures, by hash: each drawn view's saved original (else its standing frame) and every frame
 *  of every move in the drawn views. setupPlan checks the pixels too; identical frames are measured once. */
export function setupFrameHashes(
	rig: Pick<Rig, 'animations' | 'directions' | 'rest'>,
	layer: Pick<Layer, 'cells'> | undefined,
	restAnim?: string
): Set<string> {
	const standing = setupRestAnimation(rig, restAnim);
	const hashes = new Set<string>();
	for (const { id, mirrorOf } of rig.directions) {
		if (mirrorOf) continue;
		const rest = rig.rest?.[id]?.image ?? (standing && layer?.cells?.[standing.id]?.[id]?.[0]);
		if (rest) hashes.add(rest);
		for (const a of rig.animations)
			for (const hash of layer?.cells?.[a.id]?.[id] ?? []) if (hash) hashes.add(hash);
	}
	return hashes;
}

/** Preflight happens offline and before any spending. A source rest clip can be explicitly selected in the UI. */
export async function setupPlan(p: Project, restAnim?: string): Promise<SetupPlan> {
	const m = p.manifest,
		rig = m.rig,
		warnings: string[] = [];
	if (
		rig.cell.w !== rig.cell.h ||
		!Number.isInteger(rig.cell.w) ||
		rig.cell.w < 32 ||
		rig.cell.w > 256
	)
		throw new LocalizedError(
			'Rig setup needs a square frame of 32–256 whole pixels.',
			'setup.errors.squareFrame'
		);
	if (rig.template && rig.template !== 'mannequin')
		throw new LocalizedError(
			'Rig setup currently supports humanoid characters. This character uses a different body template.',
			'setup.errors.humanoidOnly'
		);
	const base = m.items.find((i) => i.id === rig.baseItem)!;
	if (base.layers.length !== 1)
		throw new LocalizedError(
			'Rig setup needs a single frozen base-body layer.',
			'setup.errors.singleBaseLayer'
		);
	const a = setupRestAnimation(rig, restAnim);
	if (!a)
		throw new LocalizedError('Choose a standing reference move.', 'setup.errors.chooseReference');
	const rest: SetupPlan['rest'] = {},
		frames: SetupPlan['frames'] = new Map();
	for (const d of DIRECTIONS) {
		const hash = rig.rest?.[d]?.image,
			im = hash && p.images.get(hash);
		if (im) rest[d] = im;
	}
	for (const d of rig.directions) {
		if (d.mirrorOf) continue;
		const existing = rest[d.id];
		const im = existing || cellImg(p, base.layers[0], a.id, d.id, 0);
		if (!im || !opaqueBox(im))
			throw new LocalizedError(
				`${a.id} has no ${d.id} standing reference. Choose a move with every view.`,
				'setup.errors.noStandingReference',
				{ move: a.id }
			);
		const top = opaqueBox(im)!.y0;
		if (top < HEADROOM_MIN)
			warnings.push(
				`${d.id} leaves ${top} px above the head; tall hair or hats may need a larger frame.`
			);
		rest[d.id] = im;
		frames.set(await cellHash(im), im);
	}
	for (const { id, mirrorOf: source } of rig.directions) {
		if (rest[id] || !source || source !== mirrorPartner(id)) continue;
		const reference = rig.rest?.[source],
			image = reference && p.images.get(reference.image);
		if (
			image &&
			reference &&
			!reference.registrationOnly &&
			hasAll(reference.keypoints) &&
			opaqueBox(image)
		)
			rest[id] = flipH(image);
	}
	const registrationDirections = DIRECTIONS.every((d) => rest[d]) ? 8 : 4;
	const required =
		registrationDirections === 8 ? DIRECTIONS : (['south', 'east', 'north', 'west'] as const);
	if (required.some((d) => !rest[d]))
		throw new LocalizedError(
			'Rig setup needs saved original standing views or all four cardinal views. Import the missing rotations first.',
			'setup.errors.needsStandingViews'
		);
	for (const a of rig.animations)
		for (const d of rig.directions.filter((d) => !d.mirrorOf)) {
			const cells = Array.from({ length: a.cells }, (_, i) =>
				cellImg(p, base.layers[0], a.id, d.id, i)
			);
			if (!cells.some((im) => im && opaqueBox(im))) continue; // genuine sparse clip
			if (cells.some((im) => !im || !opaqueBox(im)))
				throw new LocalizedError(
					`${a.id}/${d.id} contains an empty body frame.`,
					'setup.errors.emptyBodyFrame',
					{ move: a.id }
				);
			for (const im of cells as Img[]) frames.set(await cellHash(im), im);
		}
	for (const it of m.items.filter((i) => i.slot !== 'body' && !i.dressed))
		warnings.push(
			`${it.name} keeps its existing frames. Make it again after setup to animate it onto future moves.`
		);
	const fixedRest = rig.directions.some(({ id, mirrorOf }) => {
		const reference = rig.rest?.[id];
		return !mirrorOf && reference && !reference.registrationOnly && p.images.has(reference.image);
	});
	return {
		restAnim: a.id,
		fixedRest,
		rest,
		registrationDirections,
		frames,
		gens: +(0.25 + frames.size * 0.1).toFixed(2),
		warnings
	};
}

/** Assemble real measurements; imported originals have no requested pose to score against. A move with a frame that has no
 *  valid joints is skipped (left without poses and listed in rigQa.redo); the standing views must all be measured. */
export async function attachImportedRig(
	p: Project,
	plan: SetupPlan,
	measured: Map<string, Keypoint[]>,
	provenance: Provenance[]
): Promise<{
	manifest: Project['manifest'];
	images: Project['images'];
	skeletons: Record<string, Skeleton>;
	rigQa: unknown;
}> {
	const manifest = structuredClone(p.manifest),
		rig = manifest.rig,
		images = new Map(p.images),
		skeletons: Record<string, Skeleton> = {};
	const base = manifest.items.find((i) => i.id === rig.baseItem)!;
	const start = base.provenance.length;
	base.provenance.push(...provenance);
	const get = async (im: Img) => {
		const hash = await cellHash(im),
			k = measured.get(hash);
		if (!hasAll(k))
			throw new LocalizedError(
				'PixelLab could not find all 18 valid joints on a body frame. Existing artwork is unchanged; reconnect or choose a clearer standing reference and resume.',
				'setup.errors.jointsMissing'
			);
		return { hash, keypoints: k! };
	};
	const unmeasured = async (im: Img | undefined) =>
		!!im && !hasAll(measured.get(await cellHash(im)));
	rig.rest = { ...rig.rest };
	for (const d of rig.directions.filter((d) => !d.mirrorOf)) {
		const im = plan.rest[d.id]!,
			{ hash, keypoints } = await get(im);
		images.set(hash, im);
		rig.rest[d.id] = { image: hash, keypoints };
	}
	const built: Built = {
		rig,
		cells: {},
		pivotFrom: cellKey(plan.restAnim, rig.directions.find((d) => !d.mirrorOf)!.id, 0),
		errors: [],
		warnings: []
	};
	const byHash: Record<string, Skeleton> = {},
		clips: Record<string, ReturnType<typeof clipQa>> = {},
		warnings = [...plan.warnings],
		redo: string[] = [];
	for (const a of rig.animations) {
		const views = rig.directions.filter((d) => !d.mirrorOf);
		// The standing move (pivot, rest views, anchors) and Default are never skipped: get() stops setup there instead.
		let skip = false;
		if (a.id !== plan.restAnim && a.id !== DEFAULT_MOVE)
			for (const d of views)
				for (let i = 0; i < a.cells && !skip; i++)
					skip = await unmeasured(cellImg(p, base.layers[0], a.id, d.id, i) ?? undefined);
		if (skip) {
			delete a.sources;
			redo.push(a.id);
			warnings.push(
				`${a.id} was skipped: PixelLab could not find valid joints on one of its frames. Make it again to animate items on it.`
			);
			continue;
		}
		a.sources = {};
		for (const d of rig.directions.filter((d) => !d.mirrorOf)) {
			const frames = Array.from({ length: a.cells }, (_, i) =>
				cellImg(p, base.layers[0], a.id, d.id, i)
			);
			if (!frames.some(Boolean)) continue;
			const poses: Keypoint[][] = [];
			for (const [i, im] of (frames as Img[]).entries()) {
				const { hash, keypoints } = await get(im),
					s = fromApi(keypoints, rig.cell),
					key = cellKey(a.id, d.id, i);
				poses.push(keypoints);
				skeletons[key] = s;
				byHash[hash] = s;
				built.cells[key] = { img: im, hash, box: opaqueBox(im), offset: [0, 0] };
			}
			const reference = rig.rest[d.id]!;
			const isRest = a.cells === 1 && (await cellHash(frames[0]!)) === reference.image;
			a.sources[d.id] = {
				route: 'import',
				reference: reference.image,
				keypoints: poses,
				measured: poses,
				motion: isRest ? 'imported-rest' : 'estimated:frozen-import',
				provenance: provenance.map((_, i) => start + i)
			};
			const qa = clipQa({
				anim: a.id,
				rest: plan.rest[d.id]!,
				frames: frames as Img[],
				measured: poses,
				stray: 0,
				...(fixedFacingLocomotion(a.id) ? { facing: { dir: d.id, rest: reference.keypoints } } : {})
			});
			clips[`${a.id}/${d.id}`] = qa;
			warnings.push(...[...qa.fails, ...qa.warnings].map((f) => `${a.id}/${d.id}: ${f}`));
		}
	}
	for (const d of rig.directions.filter((d) => d.mirrorOf))
		for (const a of rig.animations)
			for (let i = 0; i < a.cells; i++) {
				const src = skeletons[cellKey(a.id, d.mirrorOf!, i)];
				if (src) skeletons[cellKey(a.id, d.id, i)] = flipSkeleton(src, rig.cell.w);
			}
	// Standing-only edits made before setup already paid for their chroma references. Promote only an exact
	// standing binding; selecting another reference must never pose an item from the wrong body image.
	for (const item of manifest.items)
		if (
			item.route === 'ea2-anchor' &&
			item.standing &&
			item.key &&
			item.dressed &&
			item.baseHash === rig.baseHash
		) {
			const clip = rig.animations.find((a) => a.id === item.standing);
			if (
				clip?.cells === 1 &&
				rig.directions
					.filter((d) => !d.mirrorOf)
					.every(
						(d) =>
							item.dressed?.[d.id] &&
							matchesStanding(rig, clip, d.id, base.layers[0].cells?.[clip.id]?.[d.id]?.[0])
					)
			)
				item.route = 'skeleton-pose';
		}
	const tracks = anchorTracks(built, byHash);
	rig.anchors = tracks.anchors;
	warnings.push(...importedPoseIssues(rig));
	return {
		manifest,
		images,
		skeletons,
		rigQa: {
			warnings,
			pivotFrom: built.pivotFrom,
			clips,
			tracks: tracks.stats.map(({ points: _, ...t }) => t),
			...(redo.length ? { redo } : {})
		}
	};
}
