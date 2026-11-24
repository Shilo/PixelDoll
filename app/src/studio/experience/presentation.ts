import { clipKind, sampleTimeline, timelineDuration } from '../../lib/runtime/timeline.js';
import {
	bakedFrame,
	composeCell,
	composeLayeredAction,
	equipped,
	hiddenSlots,
	shownItems,
	type Frame
} from '../../lib/compose/compose.ts';
import { DEFAULT_MOVE } from '../../lib/rig/rig.ts';
import { liveClips, type LiveClips } from './liveRoles.ts';
import { moveLabel } from '../model.ts';
import type { Img } from '../../lib/image/png.ts';
import type {
	DirectionName,
	Item,
	Layer,
	Preset,
	Project,
	RigAnimation
} from '../../lib/store/manifest.ts';
import {
	directionInfo,
	directionLabel,
	dot,
	nearestDirection,
	travelDelta,
	unit,
	type Vector
} from './movement.ts';

/** The Move a mounted rider plays, and the State the Riding template creates. */
export const RIDE_MOVE = 'ride',
	RIDING_STATE = 'riding';
export interface BodySequence {
	clip: string;
	direction: DirectionName;
	frames: RigAnimation['frames'];
	duration: number;
}
export interface Presentation {
	kind: 'animation' | 'still' | 'unavailable';
	moving: boolean;
	requestedClip: string;
	intendedDirection: DirectionName | null;
	direction: DirectionName | null;
	/** Null for unavailable artwork. */
	clip: string | null;
	cell: number;
	sequence?: BodySequence;
	/** Canonical English diagnostic; people see `notice` worded in their language. */
	issue: string | null;
	/** Present whenever `issue` is. */
	notice?: PresentationNotice;
	/** Stable coverage identity: exclude the changing fallback direction and playback frame. */
	issueKey: string | null;
	loading: boolean;
}
/** What the actor shows instead of a missing view. */
export type PresentationFallback =
	| { kind: 'nothing' }
	| { kind: 'still' }
	| { kind: 'move'; move: string }
	| { kind: 'direction'; direction: DirectionName };
/** Typed so the UI words each notice as a whole sentence in the active language; `diagnostic` stays raw technical text. */
export type PresentationNotice =
	| {
			kind: 'missing-move';
			move: string;
			fallback: Exclude<PresentationFallback, { kind: 'direction' }>;
	  }
	| {
			kind: 'missing-direction';
			move: string;
			direction: DirectionName;
			fallback: PresentationFallback;
	  }
	| { kind: 'undeclared-direction' }
	| { kind: 'hidden-items'; count: number; move: string; direction?: DirectionName }
	| { kind: 'diagnostic'; text: string };

/** The canonical English of a notice, kept for diagnostics, tests and non-UI callers. */
export function noticeText(notice: PresentationNotice): string {
	switch (notice.kind) {
		case 'missing-move':
		case 'missing-direction': {
			// Plain words for people, not diagnostics: what is missing, then what they see instead.
			const move = moveLabel(notice.move);
			const missing =
				notice.kind === 'missing-move'
					? `No ${move} move yet`
					: `${move} has no ${directionLabel(notice.direction).toLowerCase()} frames yet`;
			const fallback = notice.fallback;
			const showing =
				fallback.kind === 'nothing'
					? 'so there is nothing to show'
					: fallback.kind === 'still'
						? 'so the character stands still'
						: fallback.kind === 'move'
							? `so it plays ${moveLabel(fallback.move)}`
							: `so it faces ${directionLabel(fallback.direction).toLowerCase()}`;
			return `${missing}, ${showing}`;
		}
		case 'undeclared-direction':
			return 'This facing is not declared by the character';
		case 'hidden-items':
			return `${notice.count} ${notice.count === 1 ? 'item' : 'items'} hidden — missing ${notice.move}${notice.direction ? ` / ${directionLabel(notice.direction)}` : ''} frames`;
		case 'diagnostic':
			return notice.text;
	}
}
const withNotice = <T extends object>(
	result: T,
	notice: PresentationNotice,
	issueKey: string
): T & { issue: string; notice: PresentationNotice; issueKey: string } => ({
	...result,
	issue: noticeText(notice),
	notice,
	issueKey
});
export interface PresentationAvailability {
	project: Project;
	directions: DirectionName[];
	animations: Map<string, Map<DirectionName, BodySequence>>;
	stills: Map<DirectionName, { clip: string; cell: number }>;
	metadataIssues: string[];
	loading: boolean;
	/** Validated once on asset revisions, never by scanning pixels in the animation loop. */
	complete(item: Item, clip: string, direction: DirectionName, cells: readonly number[]): boolean;
}

interface CheckedCell {
	valid: boolean;
	visible: boolean;
	source?: DirectionName;
}
export interface PresentationOptions {
	loading?: boolean;
	allowPartialAnimations?: boolean;
}

/** Rebuild when the project, its images, or coverage changes. No requests or storage writes occur here. */
export function buildPresentation(
	project: Project,
	options: PresentationOptions = {}
): PresentationAvailability {
	const m = project.manifest,
		metadataIssues: string[] = [];
	const directions = [
		...new Set(
			m.rig.directions
				.map((d) => d.id)
				.filter((id) => {
					if (directionInfo(id)) return true;
					metadataIssues.push(`Unknown direction: ${id}`);
					return false;
				})
		)
	];
	if (!directions.length) metadataIssues.push('No declared character directions');
	const visible = new WeakMap<Img, boolean>();
	const validImage = (image: Img | undefined, width?: number, height?: number): image is Img =>
		!!image &&
		Number.isInteger(image.w) &&
		Number.isInteger(image.h) &&
		image.w > 0 &&
		image.h > 0 &&
		image.data.length === image.w * image.h * 4 &&
		(width === undefined || image.w === width) &&
		(height === undefined || image.h === height);
	const hasPixels = (image: Img): boolean => {
		if (!visible.has(image))
			visible.set(
				image,
				image.data.some((value, i) => i % 4 === 3 && value > 0)
			);
		return visible.get(image)!;
	};
	const checked = new WeakMap<Layer, Map<string, CheckedCell>>();
	const cell = (
		layer: Layer,
		clip: string,
		direction: DirectionName,
		index: number
	): CheckedCell => {
		let cache = checked.get(layer);
		if (!cache) {
			cache = new Map();
			checked.set(layer, cache);
		}
		const key = `${clip}/${direction}/${index}`,
			cached = cache.get(key);
		if (cached) return cached;
		let at: DirectionName | undefined = direction;
		const seen = new Set<DirectionName>();
		let result: CheckedCell = { valid: false, visible: false };
		while (at && !seen.has(at)) {
			seen.add(at);
			const cells = layer.cells?.[clip]?.[at];
			if (cells) {
				if (!Object.hasOwn(cells, index)) break; // A missing entry is not authored transparency.
				const hash = cells[index];
				if (hash === null) result = { valid: true, visible: false, source: at };
				else if (typeof hash === 'string') {
					const image = project.layerImages?.get(layer)?.get(hash) ?? project.images.get(hash);
					if (validImage(image, layer.cell?.w ?? m.rig.cell.w, layer.cell?.h ?? m.rig.cell.h))
						result = { valid: true, visible: hasPixels(image), source: at };
				}
				break;
			}
			at = m.rig.directions.find((d) => d.id === at)?.mirrorOf;
		}
		cache.set(key, result);
		return result;
	};
	// Check mirror metadata even when stored cells happen to mask an invalid reference.
	for (const d of m.rig.directions) {
		const seen = new Set<DirectionName>();
		let at: DirectionName | undefined = d.id;
		while (at) {
			if (seen.has(at)) {
				metadataIssues.push(`Cyclic mirror: ${d.id}`);
				break;
			}
			seen.add(at);
			const entry = m.rig.directions.find((candidate) => candidate.id === at);
			if (!entry) {
				metadataIssues.push(`Missing mirror source: ${at}`);
				break;
			}
			at = entry.mirrorOf;
		}
	}
	const coverageCache = new WeakMap<Item, Map<string, boolean>>();
	const complete = (
		item: Item,
		clip: string,
		direction: DirectionName,
		cells: readonly number[]
	): boolean => {
		let cache = coverageCache.get(item);
		if (!cache) {
			cache = new Map();
			coverageCache.set(item, cache);
		}
		const key = `${clip}/${direction}/${cells.join(',')}`;
		if (cache.has(key)) return cache.get(key)!;
		if (!item.layers.length || !cells.length) return false;
		const coverage = item.id === m.rig.baseItem ? null : new Set<string>(item.coverage);
		const valid = cells.every((index) =>
			item.layers.every((layer) => {
				const c = cell(layer, clip, direction, index);
				return (
					c.valid &&
					(!coverage ||
						coverage.has(`${clip}/${direction}/${index}`) ||
						(!!c.source && coverage.has(`${clip}/${c.source}/${index}`)))
				);
			})
		);
		cache.set(key, valid);
		return valid;
	};
	const body = m.items.find((item) => item.id === m.rig.baseItem);
	const animations = new Map<string, Map<DirectionName, BodySequence>>(),
		stills = new Map<DirectionName, { clip: string; cell: number }>();
	if (body) {
		// Rescue stills may use stored original directions outside the intentional animated set.
		const storedDirections = [
			...new Set([
				...directions,
				...body.layers.flatMap((layer) =>
					Object.values(layer.cells ?? {}).flatMap((dirs) => Object.keys(dirs) as DirectionName[])
				)
			])
		].filter((id) => directionInfo(id));
		for (const animation of m.rig.animations) {
			const usable = new Map<DirectionName, BodySequence>();
			animations.set(animation.id, usable);
			const duration = timelineDuration(animation.frames);
			const validTimeline =
				Number.isInteger(animation.cells) &&
				animation.cells > 0 &&
				animation.frames.length > 0 &&
				Number.isFinite(duration) &&
				animation.frames.every(
					(frame) =>
						Number.isInteger(frame.cell) &&
						frame.cell >= 0 &&
						frame.cell < animation.cells &&
						Number.isFinite(frame.ms) &&
						frame.ms > 0
				);
			for (const direction of storedDirections) {
				// A short/broken timeline can still furnish an honest single-frame rescue.
				const storedIndices = [
					...new Set(
						body.layers.flatMap((layer) =>
							Object.values(layer.cells?.[animation.id] ?? {}).flatMap((cells) =>
								Object.keys(cells ?? {}).map(Number)
							)
						)
					)
				]
					.filter((index) => Number.isInteger(index) && index >= 0 && index < animation.cells)
					.sort((x, y) => x - y);
				for (const index of storedIndices) {
					if (
						complete(body, animation.id, direction, [index]) &&
						body.layers.some((layer) => cell(layer, animation.id, direction, index).visible)
					) {
						if (!stills.has(direction)) stills.set(direction, { clip: animation.id, cell: index });
						break;
					}
				}
				if (!validTimeline || !directions.includes(direction)) continue;
				const frames = options.allowPartialAnimations
					? animation.frames.filter((frame) =>
							complete(body, animation.id, direction, [frame.cell])
						)
					: animation.frames;
				const cells = frames.map((frame) => frame.cell);
				if (
					!complete(body, animation.id, direction, cells) ||
					!cells.some((index) =>
						body.layers.some((layer) => cell(layer, animation.id, direction, index).visible)
					)
				)
					continue;
				usable.set(direction, {
					clip: animation.id,
					direction,
					frames,
					duration: frames === animation.frames ? duration : timelineDuration(frames)
				});
			}
		}
	}
	return {
		project,
		directions,
		animations,
		stills,
		metadataIssues,
		loading: options.loading ?? false,
		complete
	};
}

const defaultFacing = (a: PresentationAvailability): DirectionName | undefined =>
	a.directions.includes('south')
		? 'south'
		: a.directions.includes('east')
			? 'east'
			: a.directions[0];
const initial = (
	a: PresentationAvailability,
	requestedClip: string,
	intendedDirection: DirectionName | null,
	moving = false
): Presentation => ({
	kind: 'unavailable',
	moving,
	requestedClip,
	intendedDirection,
	direction: null,
	clip: null,
	cell: 0,
	issue: null,
	issueKey: null,
	loading: a.loading
});
const animated = (base: Presentation, sequence: BodySequence): Presentation => ({
	...base,
	kind: 'animation',
	direction: sequence.direction,
	clip: sequence.clip,
	sequence,
	cell: sequence.frames[0].cell
});
const still = (
	a: PresentationAvailability,
	base: Presentation,
	direction: DirectionName
): Presentation => {
	const pose = a.stills.get(direction);
	return pose ? { ...base, kind: 'still', direction, ...pose } : base;
};
function withIssue(a: PresentationAvailability, result: Presentation): Presentation {
	if (a.loading) return result;
	if (result.issue) return result;
	if (a.metadataIssues.length)
		return withNotice(result, { kind: 'diagnostic', text: a.metadataIssues[0] }, 'metadata');
	if (
		result.kind === 'animation' &&
		result.clip === result.requestedClip &&
		result.direction === result.intendedDirection
	)
		return result;
	const wholeClip = !a.animations.get(result.requestedClip)?.size;
	if (wholeClip && result.clip === DEFAULT_MOVE) return result; // a new character stands in its Default pose until idle/walk are added
	const move = result.requestedClip,
		issueKey = `${move}:${wholeClip ? 'all' : result.intendedDirection}`;
	const fallback: PresentationFallback =
		result.kind === 'unavailable'
			? { kind: 'nothing' }
			: result.kind !== 'animation'
				? { kind: 'still' }
				: result.clip !== move
					? { kind: 'move', move: result.clip! }
					: { kind: 'direction', direction: result.direction! };
	const intended = result.intendedDirection;
	// Only a clip with frames can face elsewhere, and a character with no directions already has a metadata issue.
	const notice: PresentationNotice =
		!wholeClip && intended
			? { kind: 'missing-direction', move, direction: intended, fallback }
			: {
					kind: 'missing-move',
					move,
					fallback: fallback.kind === 'direction' ? { kind: 'still' } : fallback
				};
	return withNotice(result, notice, issueKey);
}

/** Preview never changes the selected clip, declared direction, or animation availability to hide a gap. */
export function resolvePreview(
	a: PresentationAvailability,
	options: { clip: string; direction: DirectionName }
): Presentation {
	const base = initial(a, options.clip, options.direction);
	if (!a.directions.includes(options.direction))
		return a.loading
			? base
			: withNotice(base, { kind: 'undeclared-direction' }, 'undeclared-direction');
	const sequence = a.animations.get(options.clip)?.get(options.direction);
	return withIssue(a, sequence ? animated(base, sequence) : still(a, base, options.direction));
}

/** Velocity chooses simulation state; incomplete artwork only changes the displayed presentation. */
export function resolveLive(
	a: PresentationAvailability,
	options: {
		velocity: Vector;
		previous?: Presentation | null;
		defaultDirection?: DirectionName;
		deadZone?: number;
		riding?: boolean;
		/** A State or Move chosen as the rider's pose; used only while riding, and only for the exact facing it covers. */
		riderPose?: string;
		/** The worn outfit. While riding without a chosen pose, the first pose in the riding order that shows all of it wins. */
		items?: Preset['items'];
		/** The character's Idle and Walk chains (liveRoles.ts liveClips); each falls back in order, per facing. */
		clips?: Pick<LiveClips, 'idle' | 'walk'>;
	}
): Presentation {
	const { idle, walk } = options.clips ?? liveClips(a.project.manifest.rig.animations);
	const velocity = unit(options.velocity, options.deadZone ?? 1e-6),
		moving = !!(velocity.x || velocity.y),
		previous = options.previous;
	const saved = options.defaultDirection ?? defaultFacing(a);
	// A riding pose may show fallback art. Retain travel intent independently from the rider's drawn facing.
	const lastFacing = options.riding
		? (previous?.intendedDirection ?? previous?.direction)
		: previous?.direction;
	const retained =
		lastFacing && a.directions.includes(lastFacing)
			? lastFacing
			: previous?.intendedDirection && a.directions.includes(previous.intendedDirection)
				? previous.intendedDirection
				: saved;
	const intended = moving
		? nearestDirection(a.directions, velocity, lastFacing, previous?.intendedDirection, saved)
		: (retained ?? nearestDirection(a.directions, { x: 0, y: -1 }));
	// Riding order: the chosen Riding pose, the Ride Move, the Riding State, then Idle and Standing. The first three
	// show only for the exact facing, so the rider never faces away from the mount.
	const riding = options.riding
		? [
				options.riderPose,
				RIDE_MOVE,
				a.project.manifest.rig.animations.some(
					(clip) => clip.id === RIDING_STATE && clipKind(clip) === 'state'
				)
					? RIDING_STATE
					: undefined
			].filter((clip): clip is string => !!clip)
		: [];
	const ridingClip =
		options.riderPose ?? riding.find((clip) => a.animations.get(clip)?.has(intended!)) ?? idle[0];
	const start = initial(
		a,
		options.riding ? ridingClip : moving ? walk[0] : idle[0],
		intended,
		moving
	);
	const base = [options.velocity.x, options.velocity.y].every(Number.isFinite)
		? start
		: withNotice(
				start,
				{ kind: 'diagnostic', text: 'Movement input is not finite' },
				'invalid-velocity'
			);
	const facing = directionInfo(intended ?? '')?.vector ?? { x: 0, y: -1 },
		desired = moving ? velocity : facing;
	const eligible = (direction: DirectionName) =>
		dot(directionInfo(direction)!.vector, facing) >= -1e-8;
	// Pending resources are distinct from confirmed coverage gaps. Keep a still-valid
	// presentation rather than changing the actor to a fallback during a partial load.
	if (a.loading && previous?.direction && !a.animations.get(base.requestedClip)?.has(intended!)) {
		const sequence =
			previous.kind === 'animation' && previous.clip
				? a.animations.get(previous.clip)?.get(previous.direction)
				: undefined;
		if (sequence) return animated(base, sequence);
		if (previous.kind === 'still' && previous.clip) {
			const body = a.project.manifest.items.find(
				(item) => item.id === a.project.manifest.rig.baseItem
			);
			if (body && a.complete(body, previous.clip, previous.direction, [previous.cell]))
				return {
					...base,
					kind: 'still',
					clip: previous.clip,
					direction: previous.direction,
					cell: previous.cell
				};
		}
	}
	// A chosen Riding pose missing this facing falls through the order, and withIssue names the gap.
	for (const clip of riding) {
		const sequence = intended ? a.animations.get(clip)?.get(intended) : undefined;
		if (sequence) return withIssue(a, animated(base, sequence));
	}
	// Idle and Standing only stand in for a riding pose. Items are drawn on Standing first and may never be posed onto
	// Idle, so the stand-in that shows the whole worn outfit wins. Standing in for Idle is no gap to report.
	if (options.riding && options.items && intended) {
		const worn = wornItems(a, options.items);
		const dressed = idle
			.map((clip) => a.animations.get(clip)?.get(intended))
			.find((sequence) => sequence && showsOutfit(a, worn, sequence));
		if (dressed)
			return withIssue(
				a,
				animated(
					base.requestedClip === idle[0] ? { ...base, requestedClip: dressed.clip } : base,
					dressed
				)
			);
	}
	for (const clip of options.riding || !moving ? idle : walk) {
		// Default: a new character's standing views
		const sequences = a.animations.get(clip),
			directions = [...(sequences?.keys() ?? [])].filter(eligible);
		const direction =
			intended && directions.includes(intended)
				? intended
				: nearestDirection(
						directions,
						desired,
						previous?.direction,
						previous?.intendedDirection,
						saved
					);
		if (direction) return withIssue(a, animated(base, sequences!.get(direction)!));
	}
	const artwork = [...a.stills.keys()],
		declared = artwork.filter((direction) => a.directions.includes(direction));
	const direction = nearestDirection(
		declared.length ? declared : artwork,
		desired,
		previous?.direction,
		previous?.intendedDirection,
		saved
	);
	return withIssue(a, direction ? still(a, base, direction) : base);
}

/** The shown worn items besides the body. */
function wornItems(a: PresentationAvailability, items: Preset['items']) {
	const m = a.project.manifest;
	return shownItems(m, equipped(m, items)).filter((item) => item.id !== m.rig.baseItem);
}
/** Whether this sequence draws every worn item, so rendering it hides none (renderPresentation's check). */
function showsOutfit(a: PresentationAvailability, worn: Item[], sequence: BodySequence) {
	const cells = sequence.frames.map((frame) => frame.cell);
	return worn.every((item) => a.complete(item, sequence.clip, sequence.direction, cells));
}
/** Worn items this clip cannot draw in some facing it has, so they hide whenever it shows (the Riding pose warning). */
export function itemsHiddenIn(a: PresentationAvailability, items: Preset['items'], clip: string) {
	const sequences = [...(a.animations.get(clip)?.values() ?? [])];
	return wornItems(a, items).filter(
		(item) => !sequences.every((sequence) => showsOutfit(a, [item], sequence))
	);
}

/** Exact south still for current-outfit thumbnails; never labels another facing as south. */
export function southStill(a: PresentationAvailability): Presentation {
	const base = initial(a, DEFAULT_MOVE, 'south');
	const sequence =
		a.animations.get(DEFAULT_MOVE)?.get('south') ??
		a.animations.get('idle')?.get('south') ??
		[...a.animations.values()].map((dirs) => dirs.get('south')).find(Boolean);
	if (sequence)
		return {
			...base,
			kind: 'still',
			direction: 'south',
			clip: sequence.clip,
			cell: sequence.frames[0].cell
		};
	const pose = a.stills.get('south');
	return pose ? { ...base, kind: 'still', direction: 'south', ...pose } : base;
}

export interface PlaybackClock {
	key: string;
	elapsedMs: number;
	duration: number;
	cell: number;
}
/** Match a live walking gait to ground travel. Fallback breathing and other actions retain their own timing. */
export function livePlaybackDelta(
	presentation: Presentation,
	velocity: Vector,
	deltaMs: number,
	travelRate = 1,
	/** The character's chosen Walk (liveRoles.ts). */
	walkClip = 'walk'
): number {
	const dt = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
	// Ride follows travel whether it was asked for or reached as a riding fallback.
	if (presentation.clip === RIDE_MOVE) {
		return travelDelta(velocity, dt, travelRate);
	}
	if (
		presentation.kind !== 'animation' ||
		!presentation.moving ||
		presentation.requestedClip !== walkClip ||
		presentation.clip !== walkClip
	)
		return dt;
	return travelDelta(velocity, dt, travelRate);
}
/** Facing changes carry normalized phase. Genuine clip/source changes start once at frame zero. */
export function advancePlayback(
	presentation: Presentation,
	previous: PlaybackClock | null | undefined,
	deltaMs: number
): PlaybackClock {
	const sequence = presentation.kind === 'animation' ? presentation.sequence : undefined;
	const key = sequence
		? `animation:${sequence.clip}:${presentation.moving ? 'moving' : 'stopped'}`
		: `${presentation.kind}:${presentation.clip ?? ''}:${presentation.cell}`;
	if (!sequence) return { key, elapsedMs: 0, duration: 0, cell: presentation.cell };
	const dt = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
	let elapsedMs =
		previous?.key === key
			? (previous.duration > 0 ? (previous.elapsedMs / previous.duration) * sequence.duration : 0) +
				dt
			: 0;
	elapsedMs %= sequence.duration;
	const cell = sampleTimeline(sequence.frames, elapsedMs);
	return { key, elapsedMs, duration: sequence.duration, cell };
}

/** loading: worn drafts still generating this view ("Sword loading — East, North"), shown instead of hiding them as missing;
 *  loadingItems holds the same facts for the UI to word. issue is canonical English; notice is present whenever it is. */
export interface RenderedPresentation {
	image: Img | null;
	frame: Frame;
	hiddenItems: Item[];
	issue: string | null;
	notice?: PresentationNotice;
	issueKey: string | null;
	loading: string | null;
	loadingItems: { name: string; directions: DirectionName[] }[];
	attackLayered?: boolean;
	attackFallback?: string;
}
/** Consume the production recolored project and current outfit map (DressState.current.items). */
export function liveActionFallback(
	enabled: boolean,
	grounded: boolean,
	mounted: boolean,
	walk: Presentation,
	action: Presentation,
	walkClip: string
) {
	if (!enabled) return 'disabled';
	if (mounted) return 'mounted';
	if (!grounded) return 'airborne';
	if (!walk.moving || !walk.clip || walk.clip !== walkClip || walk.kind !== 'animation')
		return 'not-walking';
	if (walk.direction !== action.direction) return 'direction';
	return null;
}

export function renderPresentation(
	a: PresentationAvailability,
	items: Preset['items'],
	presentation: Presentation,
	cell = presentation.cell,
	fitFrame?: (items: Preset['items'], cells: readonly number[]) => Frame,
	lower?: { pose: Presentation; cell: number; waist: number }
): RenderedPresentation {
	const p = a.project,
		m = p.manifest,
		frame = bakedFrame(m);
	const result: RenderedPresentation = {
		image: null,
		frame,
		hiddenItems: [],
		issue: null,
		issueKey: null,
		loading: null,
		loadingItems: []
	};
	if (presentation.kind === 'unavailable' || !presentation.direction) return result;
	const direction = presentation.direction,
		clip = presentation.clip!;
	const cells =
		presentation.kind === 'animation'
			? presentation.sequence!.frames.map((f) => f.cell)
			: [presentation.cell];
	const on = equipped(m, items),
		hidden = hiddenSlots(m, on),
		worn = shownItems(m, on);
	const filtered = { ...items },
		loading = result.loadingItems,
		mirrored = m.rig.directions.find((d) => d.id === direction)?.mirrorOf;
	for (const item of worn) {
		if (item.id === m.rig.baseItem) continue;
		if (!a.complete(item, clip, direction, cells)) {
			filtered[item.slot] = null;
			// a generating draft's cells are on their way, not missing
			const pending = [
				...new Set(
					(item.pending ?? [])
						.filter((k) => k.startsWith(`${clip}/`))
						.map((k) => k.split('/')[1] as DirectionName)
				)
			];
			if (pending.includes(direction) || (mirrored && pending.includes(mirrored)))
				loading.push({ name: item.name, directions: pending });
			else if (!hidden.has(item.slot)) result.hiddenItems.push(item);
		}
	}
	result.loading =
		loading
			.map((entry) => `${entry.name} loading — ${entry.directions.map(directionLabel).join(', ')}`)
			.join(' · ') || null;
	result.frame = fitFrame?.(filtered, cells) ?? frame;
	const actualCell = cells.includes(cell) ? cell : cells[0];
	if (lower?.pose.direction && lower.pose.clip) {
		const walk = { clip: lower.pose.clip, direction: lower.pose.direction, cell: lower.cell };
		const layered = composeLayeredAction(
			p,
			filtered,
			walk,
			{ clip, direction, cell: actualCell },
			lower.waist,
			result.frame
		);
		result.image = layered.image;
		result.frame = layered.frame;
		result.attackLayered = !!layered.image;
		result.attackFallback = layered.fallback ?? undefined;
	}
	result.image ??= composeCell(p, filtered, clip, direction, actualCell, result.frame);
	if (result.hiddenItems.length && !a.loading) {
		// Missing in every view: naming the facing shown would read as if turning brought the items back.
		const everywhere = result.hiddenItems.every((item) =>
			m.rig.directions.every((d) => !a.complete(item, clip, d.id, cells))
		);
		result.notice = {
			kind: 'hidden-items',
			count: result.hiddenItems.length,
			move: clip,
			direction: everywhere ? undefined : direction
		};
		result.issue = noticeText(result.notice);
		result.issueKey = `items:${clip}:${everywhere ? '' : direction}:${result.hiddenItems
			.map((item) => item.variantOf ?? item.id)
			.sort()
			.join(',')}`;
	}
	return result;
}
