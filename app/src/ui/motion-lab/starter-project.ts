// Adopt a reviewed layout for native starter artwork. No inference, generation or per-frame registration.
import { makeImg, type Img } from '../../lib/image/png.ts';
import { encodePngBytes } from '../../lib/image/pngraw.ts';
import { sha256 } from '../../lib/image/hash.ts';
import {
	CURRENT_FORMAT,
	type CellKey,
	type ItemQa,
	type Project
} from '../../lib/store/manifest.ts';
import type { ZipEntry } from '../../lib/store/zip.ts';
import {
	baseHashOf,
	cellHash,
	defaultMs,
	DIRECTIONS,
	playlist,
	validateRig,
	type DirectionName,
	type Rig,
	type Sha256
} from '../../lib/rig/rig.ts';
import { hasAll } from '../../lib/rig/poses.ts';
import {
	createStarterPlan,
	matchStarterFrames,
	validateStarterReceipt,
	STARTER_PRESETS,
	type StarterNativeFrame,
	type StarterPlan,
	type StarterPresetId,
	type StarterReceipt
} from '../../lib/rig/starter-presets.ts';

export interface StarterOffset {
	x: number;
	y: number;
}
export interface StarterLayout {
	cell: { w: number; h: number };
	restOffset: StarterOffset;
	offsets: Record<StarterPresetId, Partial<Record<DirectionName, StarterOffset>>>;
	idleSource: 'standing' | 'generated';
	/** One raw source index for every playback slot, shared by every directional view of the action. */
	sourceFrames: Record<StarterPresetId, number[]>;
	reviewed: boolean;
	notes: string;
}
export interface StarterProjectClip {
	plan: StarterPlan;
	receipts: readonly StarterReceipt[];
	entries: readonly StarterNativeFrame[];
}
export interface StarterProjectEvidence {
	version: 1;
	kind: 'pixeldoll-native-starter-review';
	qualified: false;
	equippedQualified: false;
	providerTiming: false;
	layout: StarterLayout;
	source: {
		name: string;
		cell: Rig['cell'];
		pivot: Rig['pivot'];
		view: Rig['view'];
		rest: {
			direction: DirectionName;
			rgbaHash: Sha256;
			archivePngHash: Sha256;
			outputHash: Sha256;
			path: string;
		}[];
	};
	clips: {
		preset: StarterPresetId;
		playableSource: 'standing-reference' | 'native-motion';
		researchOnly: boolean;
		binding?: string;
		animationGroupId?: string;
		jobs: StarterReceipt['jobs'];
		nativeCells: Partial<Record<DirectionName, { w: number; h: number }>>;
		sourceFrames: number[];
		uniquePlayableSourceFrames: number[];
		frames: {
			direction: DirectionName;
			index: number;
			rgbaHash: Sha256;
			archivePngHash: Sha256;
			outputHash?: Sha256;
			playableCell?: number;
			path: string;
		}[];
		playableFrames: ({ direction: DirectionName; cell: number; outputHash: Sha256 } & (
			{ sourceKind: 'standing-reference' } | { sourceKind: 'native-motion'; sourceIndex: number }
		))[];
		playback: { loop: boolean; frames: { cell: number; ms: number }[] };
	}[];
	notes: string[];
}
const PRESETS: StarterPresetId[] = ['idle', 'walk', 'slash'];
const validCell = (cell: { w: number; h: number }) =>
	!!cell && [cell.w, cell.h].every((v) => Number.isSafeInteger(v) && v > 0 && v <= 512);
const validOffset = (offset: StarterOffset | undefined): offset is StarterOffset =>
	!!offset && Number.isSafeInteger(offset.x) && Number.isSafeInteger(offset.y);
const cloneImage = (image: Img): Img => ({
	w: image.w,
	h: image.h,
	data: new Uint8ClampedArray(image.data)
});

/** Shared by layout preview and export. Only exact integer translation is allowed; any visible clipping fails. */
export function placeStarterImage(
	image: Img,
	cell: { w: number; h: number },
	offset: StarterOffset
): Img {
	if (
		!validCell(cell) ||
		!validCell(image) ||
		!validOffset(offset) ||
		!(image.data instanceof Uint8ClampedArray) ||
		image.data.length !== image.w * image.h * 4
	)
		throw new Error(
			'Starter placement needs a valid native canvas and an explicit integer pixel offset.'
		);
	const out = makeImg(cell.w, cell.h);
	for (let y = 0; y < image.h; y++)
		for (let x = 0; x < image.w; x++) {
			const from = (y * image.w + x) * 4,
				dx = x + offset.x,
				dy = y + offset.y;
			if (dx < 0 || dy < 0 || dx >= cell.w || dy >= cell.h) {
				if (image.data[from + 3] > 0)
					throw new Error(
						'The reviewed starter layout clips visible artwork. Enlarge its canvas or correct the whole-view offset.'
					);
				continue;
			}
			out.data.set(image.data.subarray(from, from + 4), (dy * cell.w + dx) * 4);
		}
	return out;
}

/** Complete body pack only. Frame joints, provider alignment and equipped acceptance are deliberately not fabricated. */
export async function buildStarterProject(
	source: Project,
	clips: readonly StarterProjectClip[],
	layout: StarterLayout
): Promise<{ project: Project; evidence: StarterProjectEvidence; rawEntries: ZipEntry[] }> {
	if (layout?.reviewed !== true || typeof layout.notes !== 'string' || !layout.notes.trim())
		throw new Error(
			'Review every native view, the common pivot and whole-view offsets, then record layout notes before exporting this starter pack.'
		);
	if (
		!validCell(layout.cell) ||
		!validOffset(layout.restOffset) ||
		!layout.offsets ||
		PRESETS.some(
			(p) => !layout.offsets[p] || DIRECTIONS.some((d) => !validOffset(layout.offsets[p][d]))
		)
	)
		throw new Error(
			'The starter layout needs a common canvas, standing offset and explicit integer offsets for every action and native direction.'
		);
	if (layout.idleSource !== 'standing' && layout.idleSource !== 'generated')
		throw new Error('Choose standing or generated as the explicit idle artwork source.');
	if (
		!layout.sourceFrames ||
		PRESETS.some((p) => {
			const map: readonly number[] = layout.sourceFrames[p];
			if (p === 'idle' && layout.idleSource === 'standing')
				return !Array.isArray(map) || map.length !== 0;
			return (
				!Array.isArray(map) ||
				map.length !== STARTER_PRESETS[p].frames ||
				map.some(
					(index) => !Number.isSafeInteger(index) || index < 0 || index >= STARTER_PRESETS[p].frames
				)
			);
		})
	)
		throw new Error(
			'Each starter action needs one shared source-frame map with its original playback-slot count and valid raw frame indexes. Per-view maps are not supported.'
		);
	const required = layout.idleSource === 'standing' ? ['walk', 'slash'] : PRESETS;
	if (
		!Array.isArray(clips) ||
		new Set(clips.map((c) => c?.plan?.preset)).size !== clips.length ||
		clips.some((c) => !PRESETS.includes(c?.plan?.preset)) ||
		required.some((id) => !clips.some((c) => c?.plan?.preset === id))
	)
		throw new Error(
			'A starter project requires exactly idle, walk and one right-handed attack in generated mode; standing idle needs only walk and attack, with optional complete idle research.'
		);
	const inputs: readonly StarterProjectClip[] = clips;
	const rig = structuredClone(source.manifest.rig),
		reviewed = structuredClone(layout),
		images = new Map<Sha256, Img>(),
		rawEntries: ZipEntry[] = [];
	const outputPivot = {
		x: rig.pivot.x + reviewed.restOffset.x,
		y: rig.pivot.y + reviewed.restOffset.y
	};
	if (
		!Number.isFinite(outputPivot.x) ||
		!Number.isFinite(outputPivot.y) ||
		outputPivot.x < 0 ||
		outputPivot.y < 0 ||
		outputPivot.x > reviewed.cell.w ||
		outputPivot.y > reviewed.cell.h
	)
		throw new Error(
			'The standing offset moves the source pivot outside the reviewed common canvas.'
		);
	const layoutErrors = validateRig({ ...rig, cell: reviewed.cell, pivot: outputPivot });
	if (layoutErrors.length)
		throw new Error(`The starter project layout is not compatible: ${layoutErrors.join('; ')}`);
	const sourceImages = new Map(
		DIRECTIONS.map((direction) => {
			const rest = rig.rest?.[direction],
				image = rest && source.images.get(rest.image);
			if (
				!image ||
				image.w !== rig.cell.w ||
				image.h !== rig.cell.h ||
				!image.data.some((v, i) => i % 4 === 3 && v > 0)
			)
				throw new Error(
					`${direction}: the exact native standing image is missing or has a different source canvas.`
				);
			return [direction, cloneImage(image)] as const;
		})
	);
	const prepared = PRESETS.filter((preset) => inputs.some((c) => c.plan.preset === preset)).map(
		(preset) => {
			const clip = inputs.find((c) => c.plan.preset === preset)!,
				plan = structuredClone(clip.plan);
			const rebound = createStarterPlan(plan.characterId, rig, preset, DIRECTIONS, plan.seed);
			if (rebound.binding !== plan.binding)
				throw new Error(
					'The starter source artwork, geometry or planned directions changed after generation. Keep the original review evidence.'
				);
			if (
				plan.characterId !== inputs[0].plan.characterId ||
				!Array.isArray(clip.receipts) ||
				!clip.receipts.length
			)
				throw new Error(
					'All starter actions must belong to the same source character with retained paid receipts.'
				);
			const receipts: StarterReceipt[] = [];
			const history: readonly StarterReceipt[] = clip.receipts;
			for (const receipt of history) {
				if (receipt?.binding !== plan.binding || !Array.isArray(receipt.jobs))
					throw new Error('A starter receipt belongs to different source artwork or action.');
				const jobs: StarterReceipt['jobs'] = receipt.jobs;
				receipts.push(
					validateStarterReceipt(
						plan,
						jobs.map((j) => j?.direction),
						{
							animation_group_id: receipt.animationGroupId,
							directions: jobs.map((j) => j?.direction),
							background_job_ids: jobs.map((j) => j?.jobId)
						},
						receipts
					)
				);
			}
			const jobs = receipts.flatMap((r) => r.jobs);
			if (
				jobs.length !== DIRECTIONS.length ||
				DIRECTIONS.some((d) => !jobs.some((j) => j.direction === d))
			)
				throw new Error(
					'All eight native directions need completed group receipts before exporting a starter project.'
				);
			const matched = matchStarterFrames(plan, clip.entries);
			return {
				plan,
				receipts,
				jobs,
				group: receipts[0].animationGroupId,
				nativeCells: structuredClone(matched.cells),
				frames: Object.fromEntries(
					DIRECTIONS.map((d) => [d, matched.frames[d]!.map(cloneImage)])
				) as Record<DirectionName, Img[]>
			};
		}
	);
	if (
		new Set(prepared.map((c) => c.group)).size !== prepared.length ||
		new Set(prepared.flatMap((c) => c.jobs.map((j) => j.jobId))).size !==
			prepared.length * DIRECTIONS.length
	)
		throw new Error(
			'Different starter actions cannot reuse the same animation group or paid direction job.'
		);
	const evidence: StarterProjectEvidence = {
		version: 1,
		kind: 'pixeldoll-native-starter-review',
		qualified: false,
		equippedQualified: false,
		providerTiming: false,
		layout: reviewed,
		source: {
			name: source.manifest.name,
			cell: { ...rig.cell },
			pivot: { ...rig.pivot },
			view: rig.view,
			rest: []
		},
		clips: [],
		notes: [
			'Body-only experimental pack. Reviewed alignment is an explicit authoring choice, not a measured provider pivot.',
			'Native canvases may differ between directions; each view keeps its original canvas and one reviewed offset for all its samples. Maximum native dimensions are not a common provider canvas or pivot.',
			'Native images are re-encoded losslessly for the archive; PNG hashes describe archive bytes, not the original provider encoding.',
			'Only integer translation is applied. No frame is resized, recentered independently, palette-adjusted or redrawn.',
			'One explicitly reviewed source-frame map applies to every view of an action. Selected raw samples become unique playable cells; unselected samples remain in raw evidence only.',
			'Standing joints are translated from the existing reference measurements. Generated frame joints, pose adherence, foot contact, equipped grip and professional art quality remain unmeasured.',
			'Playback uses PixelDoll default frame durations, not provider timing. The attack is nonlooping metadata; export preferences may override playback on export copies.'
		]
	};
	const cells: NonNullable<Project['manifest']['items'][number]['layers'][number]['cells']> = {
			default: {}
		},
		rest: NonNullable<Rig['rest']> = {};
	async function archive(image: Img, path: string) {
		const bytes = await encodePngBytes(image),
			rgbaHash = await cellHash(image),
			archivePngHash = `sha256:${await sha256(bytes)}` as Sha256;
		rawEntries.push({ name: path, data: bytes });
		return { rgbaHash, archivePngHash, path };
	}
	async function placed(image: Img, offset: StarterOffset) {
		const result = placeStarterImage(image, reviewed.cell, offset),
			hash = await cellHash(result);
		images.set(hash, result);
		return hash;
	}
	for (const direction of DIRECTIONS) {
		const image = sourceImages.get(direction)!,
			original = rig.rest![direction]!;
		if ((await cellHash(image)) !== original.image)
			throw new Error(`${direction}: standing pixels no longer match their exact source hash.`);
		const raw = await archive(image, `raw/standing/${direction}.png`),
			outputHash = await placed(image, reviewed.restOffset);
		const keypoints = original.keypoints.map((k) => ({
			label: k.label,
			x: (k.x * rig.cell.w + reviewed.restOffset.x) / reviewed.cell.w,
			y: (k.y * rig.cell.h + reviewed.restOffset.y) / reviewed.cell.h
		}));
		if (!hasAll(keypoints))
			throw new Error(
				'The reviewed standing translation moves existing reference joints outside the common canvas.'
			);
		rest[direction] = { image: outputHash, keypoints };
		cells.default[direction] = [outputHash];
		evidence.source.rest.push({ direction, ...raw, outputHash });
	}
	const animations: Rig['animations'] = [
		{ id: 'default', cells: 1, loop: true, frames: playlist(1, defaultMs('idle')) }
	];
	for (const id of PRESETS) {
		const clip = prepared.find((c) => c.plan.preset === id),
			standingIdle = id === 'idle' && reviewed.idleSource === 'standing';
		const sourceFrames = [...reviewed.sourceFrames[id]],
			uniquePlayableSourceFrames = [...new Set(sourceFrames)];
		const playback = {
			loop: STARTER_PRESETS[id].loop,
			frames: standingIdle
				? playlist(4, defaultMs('idle')).map((slot) => ({ ...slot, cell: 0 }))
				: playlist(sourceFrames.length, defaultMs(id)).map((slot, i) => ({
						...slot,
						cell: uniquePlayableSourceFrames.indexOf(sourceFrames[i])
					}))
		};
		cells[id] = {};
		const detail: StarterProjectEvidence['clips'][number] = {
			preset: id,
			playableSource: standingIdle ? 'standing-reference' : 'native-motion',
			researchOnly: standingIdle && !!clip,
			...(clip ? { binding: clip.plan.binding, animationGroupId: clip.group } : {}),
			jobs: clip?.jobs ?? [],
			nativeCells: clip?.nativeCells ?? {},
			sourceFrames,
			uniquePlayableSourceFrames,
			frames: [],
			playableFrames: [],
			playback
		};
		for (const direction of DIRECTIONS) {
			const offset = reviewed.offsets[id][direction]!;
			cells[id][direction] = [];
			if (standingIdle) {
				const outputHash = rest[direction]!.image;
				cells[id][direction]!.push(outputHash);
				detail.playableFrames.push({
					direction,
					sourceKind: 'standing-reference',
					cell: 0,
					outputHash
				});
			}
			for (const [cell, sourceIndex] of uniquePlayableSourceFrames.entries()) {
				const outputHash = await placed(clip!.frames[direction][sourceIndex], offset);
				cells[id][direction]!.push(outputHash);
				detail.playableFrames.push({
					direction,
					sourceKind: 'native-motion',
					sourceIndex,
					cell,
					outputHash
				});
			}
			for (const [index, image] of (clip?.frames[direction] ?? []).entries()) {
				const raw = await archive(image, `raw/${id}/${direction}/${index}.png`),
					playableCell = uniquePlayableSourceFrames.indexOf(index);
				detail.frames.push({
					direction,
					index,
					...raw,
					...(playableCell >= 0
						? { playableCell, outputHash: cells[id][direction]![playableCell]! }
						: {})
				});
			}
		}
		animations.push({
			id,
			cells: standingIdle ? 1 : uniquePlayableSourceFrames.length,
			...playback,
			...(!standingIdle
				? {
						source: {
							endpoint: '/characters/animations',
							mode: 'skeleton-v3',
							action_description: clip!.plan.action
						}
					}
				: {})
		});
		evidence.clips.push(detail);
	}
	const outputRig: Rig = {
		cell: { ...reviewed.cell },
		pivot: outputPivot,
		view: rig.view,
		template: 'mannequin',
		directions: DIRECTIONS.map((id) => ({ id })),
		animations,
		baseItem: 'body',
		baseHash: 'sha256:',
		rest
	};
	const hashes: Record<string, Sha256> = {},
		coverage: CellKey[] = [];
	for (const anim of animations)
		for (const direction of DIRECTIONS)
			for (let i = 0; i < anim.cells; i++) {
				const key: CellKey = `${anim.id}/${direction}/${i}`;
				hashes[key] = cells[anim.id][direction]![i]!;
				coverage.push(key);
			}
	outputRig.baseHash = await baseHashOf(outputRig, hashes);
	const outputErrors = validateRig(outputRig, hashes);
	if (outputErrors.length)
		throw new Error(`The starter project is not compatible: ${outputErrors.join('; ')}`);
	const qa: ItemQa = {
		status: 'warn',
		unmeasured: true,
		minKeyKept: 0,
		maxKeyOutside: 0,
		minAreaRatio: 0,
		maxAreaCV: 0,
		maxPaletteDist: 0,
		clipPx: 0,
		rerolls: 0,
		cells: {},
		clips: {}
	};
	const project: Project = {
		images,
		manifest: {
			format: CURRENT_FORMAT,
			name: `EXPERIMENTAL ${source.manifest.name} starter pack`,
			app: 'PixelDoll native starter review; not professionally qualified',
			rig: outputRig,
			materials: [],
			slots: [{ id: 'body', z: 10, class: 'base', required: true }],
			items: [
				{
					id: 'body',
					name: 'Experimental starter body',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					materials: [],
					prompt: `Body-only native starter pack. ${reviewed.notes.trim()}`,
					layers: [{ id: 'main', role: 'fg', z: 10, cells }],
					baseHash: outputRig.baseHash,
					coverage,
					provenance: [],
					qa,
					designWarnings: [
						'Experimental native body motion. Frame joints, foot contact, equipment grip and art quality have not been qualified.'
					]
				}
			],
			presets: [
				{
					id: 'body-review',
					name: 'Experimental body review',
					items: { body: 'body' },
					variants: {}
				}
			]
		}
	};
	return { project, evidence, rawEntries };
}
