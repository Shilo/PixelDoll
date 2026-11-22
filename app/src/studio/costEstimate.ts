// The cost estimate's model: a character's moves, items, States and directions priced with the same planners the Studio
// quotes before each paid request (movePricing, items, stateGenerationPlan), then turned into dollars at a plan's published
// price. Pure: no Svelte, queue or storage. Hypothetical moves and items are priced on a cloned rig; nothing is saved.
import { DEFAULT_MOVE, DIRECTIONS } from '../lib/rig/rig.ts';
import type {
	DirectionName,
	Item,
	Keypoint,
	Manifest,
	Rig,
	RigAnimation,
	RigDirection
} from '../lib/store/manifest.ts';
import { LABELS, hasAll } from '../lib/rig/poses.ts';
import { mirrorPartner } from '../lib/rig/mirror.ts';
import {
	canPose,
	itemPoseGens,
	padOf,
	planAnchoredMove,
	planGens,
	planItem,
	type Method
} from '../lib/items/items.ts';
import { requireSlot } from '../lib/items/slots.ts';
import { hasCompleteCells } from '../lib/dress/dress.ts';
import { setupFrameHashes } from '../lib/rig/setup.ts';
import {
	creationCall,
	ownProvenance,
	recordedCost,
	type RecordedCost
} from '../lib/store/generation.ts';
import { PLAN_PRICES, type PricedTier } from '../lib/pixellab/plans.ts';
import {
	EST,
	estimate,
	extendable,
	isAuthoredAction,
	moveEstimate,
	moveFrames
} from './movePricing.ts';
import { moveFrameCounts, type MoveAnimationModel } from './moveAnimationOptions.ts';
import {
	managedStateCost,
	planStateGeneration,
	type StateGenerationModel
} from './stateGenerationPlan.ts';
import { promptSuggestionDefaults } from './promptSuggestionDefaults.ts';
import type { CharacterModel } from './characterConfig.ts';

type BodySpec = Omit<Parameters<typeof moveEstimate>[1], 'items'>;

/** Drawn facings of a saved move made the same way. `free` marks imported or bundled art that cost nothing here. */
export interface MovePart {
	dirs: DirectionName[];
	model: MoveAnimationModel | 'import';
	spec: BodySpec;
	free: boolean;
}
/** A saved move, priced facing by facing from how each was made. */
export interface CostMove {
	id: string;
	/** The first facing's route: the default for facings the move does not have yet. */
	model: MoveAnimationModel | 'import';
	spec: BodySpec;
	free: boolean;
	parts: MovePart[];
	/** Drawn directions that already have this move's frames. */
	done: DirectionName[];
}
export interface CostItem {
	id: string;
	item: Item;
	held: boolean;
	/** Copied from another character or bundled with the demo: its saved art cost this character nothing. */
	inherited: boolean;
}
/** A State's route as saved: a local capture is free; Pro Flash has no offline price and is estimated as Pro. */
export type StateRoute = StateGenerationModel | 'managed' | 'capture';
/** The route added States take: the latest generated one, or the State settings when none is saved. */
export type AddedStateRoute = { route: Exclude<StateRoute, 'capture'>; assumed: boolean };
export interface CostCharacter {
	id: string;
	kind: 'character' | 'demo' | 'copy' | 'new';
	manifest: Manifest;
	setup: { kind: 'draw'; size: number; model?: Exclude<CharacterModel, 'v3'> } | { kind: 'import' };
	moves: CostMove[];
	items: CostItem[];
	states: StateRoute[];
	addedState: AddedStateRoute;
	moveModel: MoveAnimationModel;
	spent: RecordedCost;
}
export interface Coverage {
	/** Covers every move except those listed, or (false) only those listed. */
	all: boolean;
	except: number[];
}
export interface CostInputs {
	directions: RigDirection[];
	moves: number;
	items: number;
	states: number;
	retries: number;
	/** Frame count by move index, where it differs from the move's own. */
	frames: Record<number, number>;
	/** Move coverage by item index, where the user narrowed it. */
	coverage: Record<number, Coverage>;
}
export const DEFAULT_RETRIES = 2;

// ---------- reading a character ----------
const CREATORS: Record<string, Exclude<CharacterModel, 'v3'> | undefined> = {
	'/create-character-v3': undefined,
	'/create-character-with-8-directions': 'standard',
	'/create-character-pro': 'pro',
	'/create-character-pro-flash': 'pro-flash'
};
const STATE_ROUTES: Record<string, StateRoute> = {
	local: 'capture',
	'/create-character-state': 'managed',
	'/edit-images-v2': 'pro',
	'/edit-animation-v2': 'pro',
	'/transfer-outfit-v2': 'pro',
	'/edit-image-pixen': 'pixen',
	'/edit-image-pro-flash': 'pro-flash'
};
/** The bundled demo's records carry no request hash: the person never paid for them. */
/** The bundled demo's records carry no request hash (every paid record has one), so art from the demo, and every
 *  copy of it, keeps that record however much paid work is added later. */
const bundled = (item: Pick<Item, 'provenance'> | undefined) =>
	!!item?.provenance?.some((p) => !p.requestHash);
const drawnOf = (directions: readonly RigDirection[]) =>
	directions.filter((d) => !d.mirrorOf).map((d) => d.id);
export const isMove = (a: RigAnimation) => a.kind !== 'state' && a.id !== DEFAULT_MOVE;

/** How each facing of a saved move was made, as the spec the Moves sheet would send to make it again. */
function savedMove(m: Manifest, a: RigAnimation): CostMove {
	const body = m.items.find((i) => i.id === m.rig.baseItem)!;
	const drawn = drawnOf(m.rig.directions);
	const done = drawn.filter((d) => body.layers[0]?.cells?.[a.id]?.[d]?.some(Boolean));
	const frames = a.cells;
	const part = (dir: DirectionName): MovePart => {
		const source = a.sources?.[dir];
		const motion = source?.motion ?? '';
		const authored = /^authored:(.+)$/.exec(motion)?.[1];
		const model = source?.route ?? 'import';
		const described = (model: MoveAnimationModel): BodySpec => ({
			id: a.id,
			frames,
			animation: { model, frameCount: frames },
			...(model === 'skeleton-v3' ? { motionSource: 'standalone' as const } : {})
		});
		const spec: BodySpec =
			model === 'import'
				? described('skeleton-v3')
				: model !== 'skeleton-v3'
					? described(model)
					: motion.startsWith('managed-skeleton-v3:walking')
						? { id: a.id, action: 'walk', frames, animation: { model } }
						: authored
							? { id: a.id, action: authored, frames, animation: { model, frameCount: frames } }
							: described(model);
		// Imported art, and the demo's moves, whose records carry no request hash, cost this character nothing.
		const paid = !!source?.provenance.some((i) => !!body.provenance?.[i]?.requestHash);
		return { dirs: [dir], model, spec, free: model === 'import' || !paid };
	};
	const parts: MovePart[] = [];
	for (const dir of drawn.filter((d) => a.sources?.[d])) {
		const next = part(dir);
		const same = parts.find(
			(p) => p.free === next.free && JSON.stringify(p.spec) === JSON.stringify(next.spec)
		);
		if (same) same.dirs.push(dir);
		else parts.push(next);
	}
	const first = parts[0] ?? part(drawn[0]);
	return {
		id: a.id,
		model: first.model,
		spec: first.spec,
		free: parts.every((p) => p.free),
		parts,
		done
	};
}

function stateRoute(a: RigAnimation): StateRoute {
	return STATE_ROUTES[a.source?.endpoint ?? 'local'] ?? 'capture';
}

export function characterOf(
	id: string,
	m: Manifest,
	defaults: { moveModel: MoveAnimationModel; stateModel: StateGenerationModel }
): CostCharacter {
	const base = m.items.find((i) => i.id === m.rig.baseItem);
	const created = base && creationCall(base);
	const size = created?.params?.image_size;
	const states = m.rig.animations.filter((a) => a.kind === 'state' && a.id !== DEFAULT_MOVE);
	const routes = states.map(stateRoute);
	const generated = routes.filter((r): r is AddedStateRoute['route'] => r !== 'capture');
	const kind = id.startsWith('fixture:') ? 'demo' : bundled(base) ? 'copy' : 'character';
	return {
		id,
		kind,
		manifest: m,
		setup: created
			? {
					kind: 'draw',
					size:
						typeof size === 'number'
							? size
							: ((size as { width?: number } | undefined)?.width ?? m.rig.cell.w),
					model: CREATORS[created.endpoint]
				}
			: { kind: 'import' },
		moves: m.rig.animations.filter(isMove).map((a) => savedMove(m, a)),
		items: m.items
			.filter((i) => i.id !== m.rig.baseItem && !i.variantOf)
			.map((item) => ({
				id: item.id,
				item,
				held: requireSlot(m, item.slot).class === 'held',
				inherited: !!item.copiedFrom || bundled(item)
			})),
		states: routes,
		addedState: generated.length
			? { route: generated.at(-1)!, assumed: false }
			: { route: defaults.stateModel, assumed: true },
		moveModel: defaults.moveModel,
		spent: recordedCost(ownProvenance(m).filter((p) => !!p.requestHash))
	};
}

/** Neutral standing joints for a character that does not exist yet: only the authored moves' frame counts read them. */
const restJoints = (): Keypoint[] =>
	LABELS.map((label, index) => ({ label, x: 0.5, y: (index + 1) / (LABELS.length + 1) }));

/** A character the creator would make with these defaults, with no moves, items or States yet. */
export function newCharacter(
	draft: { body: number; frame: number; model?: CharacterModel; directions: RigDirection[] },
	defaults: { moveModel: MoveAnimationModel; stateModel: StateGenerationModel }
): CostCharacter {
	const cell = { w: draft.frame, h: draft.frame };
	const m: Manifest = {
		format: 'pixeldoll/3',
		name: '',
		app: '',
		rig: {
			cell,
			pivot: { x: cell.w / 2, y: cell.h },
			directions: draft.directions,
			animations: [{ id: DEFAULT_MOVE, cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }],
			baseItem: 'base',
			baseHash: 'sha256:new',
			rest: Object.fromEntries(
				DIRECTIONS.map((d) => [d, { image: 'sha256:new', keypoints: restJoints() }])
			)
		},
		materials: [],
		slots: [],
		items: [],
		presets: []
	};
	return {
		id: 'new',
		kind: 'new',
		manifest: m,
		setup: {
			kind: 'draw',
			size: draft.body,
			model: draft.model === 'v3' ? undefined : draft.model
		},
		moves: [],
		items: [],
		states: [],
		addedState: { route: defaults.stateModel, assumed: true },
		moveModel: defaults.moveModel,
		spent: recordedCost([])
	};
}

export function seedInputs(c: CostCharacter): CostInputs {
	return {
		directions: c.manifest.rig.directions.map((d) => ({ ...d })),
		moves: c.moves.length,
		items: c.items.length,
		states: c.states.length,
		retries: DEFAULT_RETRIES,
		frames: {},
		coverage: {}
	};
}

// ---------- added moves ----------
const SUGGESTED = promptSuggestionDefaults.move.flatMap((s) => (s.action ? [s.action] : []));

/** The moves added after the saved ones: the Moves sheet's suggestions it has not made yet, in the sheet's order, then
 *  copies of its most common move (an eight-frame described move when it has none). */
export function addedMoves(c: CostCharacter): { suggested: BodySpec[]; typical: BodySpec } {
	const model = c.moveModel;
	const taken = new Set(c.manifest.rig.animations.map((a) => a.id));
	const suggested = SUGGESTED.filter((action) => !taken.has(action)).map((action): BodySpec => ({
		id: action,
		action,
		frames: 8,
		animation: { model },
		...(model === 'skeleton-v3' && !isAuthoredAction(action)
			? { motionSource: 'standalone' as const }
			: {})
	}));
	const counts = new Map<string, { spec: BodySpec; n: number }>();
	for (const move of c.moves.filter((move) => !move.free)) {
		const key = JSON.stringify({ ...move.spec, id: '' });
		counts.set(key, { spec: move.spec, n: (counts.get(key)?.n ?? 0) + 1 });
	}
	const common = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.spec;
	return {
		suggested,
		typical: common
			? { ...common, id: 'cost-move' }
			: {
					id: 'cost-move',
					frames: 8,
					animation: { model },
					...(model === 'skeleton-v3' ? { motionSource: 'standalone' as const } : {})
				}
	};
}

// ---------- pricing ----------
export interface CostLine {
	/** Generations for this work priced from scratch, including retries. Art the character inherited is free. */
	gens: number;
	/** The part still to make. */
	toGo: number;
}
export interface MoveRow extends CostLine {
	id: string;
	frames: number;
	model: MoveAnimationModel | 'import';
	added: boolean;
}
export interface ItemRow extends CostLine {
	id?: string;
	name?: string;
	held: boolean;
	covered: number;
	/** Saved art that cannot be fitted to more moves, so a move it lacks needs a new design. */
	remake: boolean;
	inherited: boolean;
}
export interface CostResult {
	attempts: number;
	drawn: DirectionName[];
	setup: CostLine;
	moves: CostLine;
	items: CostLine;
	states: CostLine & AddedStateRoute;
	total: number;
	toGo: number;
	move: (index: number) => MoveRow;
	item: (index: number) => ItemRow;
	frameChoices: (index: number) => number[];
}

const sumLines = (lines: CostLine[]): CostLine => ({
	gens: lines.reduce((s, l) => s + l.gens, 0),
	toGo: lines.reduce((s, l) => s + l.toGo, 0)
});
export const covers = (coverage: Coverage | undefined, move: number) =>
	!coverage || coverage.all !== coverage.except.includes(move);
const coveredIn = (coverage: Coverage | undefined, start: number, end: number) => {
	if (end <= start) return 0;
	if (!coverage) return end - start;
	const listed = coverage.except.filter((i) => i >= start && i < end).length;
	return coverage.all ? end - start - listed : listed;
};
export const coveredCount = (coverage: Coverage | undefined, moves: number) =>
	coveredIn(coverage, 0, moves);

export function characterCost(c: CostCharacter, inputs: CostInputs): CostResult {
	const attempts = 1 + inputs.retries;
	const drawn = drawnOf(inputs.directions);
	const free = !drawn.length;
	// Demo art is the starting point, not work to finish: only changes from the saved character are priced.
	const bundledArt = c.kind === 'demo' || c.kind === 'copy';
	const seeded = drawnOf(c.manifest.rig.directions);
	const original = c.manifest;
	const added = addedMoves(c);
	const savedMoves = Math.min(inputs.moves, c.moves.length);
	const suggestedEnd = Math.min(inputs.moves, c.moves.length + added.suggested.length);
	const editedFrames = (index: number) => inputs.frames[index] !== undefined;
	// Saved and suggested moves and any move with its own frame count are priced one by one; the rest are copies of the
	// typical move, priced once.
	const listed = [
		...Array.from({ length: Math.max(savedMoves, suggestedEnd) }, (_, i) => i),
		...Object.keys(inputs.frames)
			.map(Number)
			.filter((i) => i >= suggestedEnd && i < inputs.moves)
	];
	const typicalCount = inputs.moves - listed.length;
	const typicalIndex = (() => {
		let i = suggestedEnd;
		while (editedFrames(i)) i++;
		return i;
	})();
	const specAt = (index: number): BodySpec => {
		const spec =
			index < c.moves.length
				? c.moves[index].spec
				: index < c.moves.length + added.suggested.length
					? added.suggested[index - c.moves.length]
					: {
							...added.typical,
							id: editedFrames(index) ? `cost-move-${index}` : added.typical.id
						};
		const frames = inputs.frames[index];
		return frames === undefined
			? spec
			: { ...spec, animation: { ...spec.animation!, frameCount: frames } };
	};
	const plain: Manifest = { ...original, rig: { ...original.rig, directions: inputs.directions } };
	const framesOf = (index: number) => moveFrames(plain, specAt(index));
	const synthetic = (index: number): RigAnimation => {
		const cells = framesOf(index);
		return {
			id: specAt(index).id,
			cells,
			loop: true,
			frames: Array.from({ length: cells }, (_, cell) => ({ cell, ms: 100 }))
		};
	};
	// Added moves exist on the working rig, without frames, so anchored items can be planned on them.
	const savedStanding =
		original.rig.animations.find((a) => a.id === DEFAULT_MOVE)?.id ??
		original.rig.animations.find((a) => a.cells === 1)?.id;
	// A character without standing views (the bundled demo) still gets a one-frame pose to plan new item designs on.
	const standing = savedStanding ?? 'cost-standing';
	const rig: Rig = {
		...original.rig,
		directions: inputs.directions,
		animations: [
			...original.rig.animations.flatMap((a) => {
				if (!isMove(a)) return [a];
				const index = c.moves.findIndex((move) => move.id === a.id);
				return index >= savedMoves ? [] : [editedFrames(index) ? synthetic(index) : a];
			}),
			...listed.filter((i) => i >= c.moves.length).map(synthetic),
			...(typicalCount > 0 ? [synthetic(typicalIndex)] : []),
			...(savedStanding
				? []
				: [
						{
							id: standing,
							kind: 'state' as const,
							cells: 1,
							loop: false,
							frames: [{ cell: 0, ms: 100 }]
						}
					])
		]
	};
	const m: Manifest = { ...original, rig };
	const missing = (done: readonly DirectionName[]) => drawn.filter((d) => !done.includes(d));
	const savedMoveAt = (index: number) =>
		index < savedMoves && !editedFrames(index) ? c.moves[index] : undefined;
	const estimateBody = (spec: BodySpec, dirs: DirectionName[]) =>
		dirs.length ? moveEstimate(m, { ...spec, items: [], dirs }).body : 0;
	/** A kept saved move re-prices each facing by its own route; a new or re-timed one uses its single spec. */
	const body = (index: number, dirs: DirectionName[], paidOnly = false) => {
		const kept = savedMoveAt(index);
		if (!kept) return estimateBody(specAt(index), dirs);
		const known = kept.parts.flatMap((part) => part.dirs);
		const byPart = kept.parts.reduce(
			(sum, part) =>
				sum +
				(paidOnly && part.free
					? 0
					: estimateBody(
							part.spec,
							dirs.filter((d) => part.dirs.includes(d))
						)),
			0
		);
		return (
			byPart +
			(paidOnly
				? 0
				: estimateBody(
						kept.spec,
						dirs.filter((d) => !known.includes(d))
					))
		);
	};

	const moveRow = (index: number): MoveRow => {
		const saved = index < c.moves.length ? c.moves[index] : undefined;
		const row = {
			id: specAt(index).id,
			frames: framesOf(index),
			model: saved?.model ?? c.moveModel,
			added: !saved
		};
		if (free) return { ...row, gens: 0, toGo: 0 };
		const kept = savedMoveAt(index);
		if (!kept) {
			const gens = body(index, drawn);
			return { ...row, gens, toGo: gens };
		}
		const toGo = body(index, missing(bundledArt ? seeded : kept.done));
		const done = drawn.filter((d) => (bundledArt ? seeded : kept.done).includes(d));
		return { ...row, gens: body(index, done, true) + toGo, toGo };
	};
	const typicalRow = typicalCount > 0 ? moveRow(typicalIndex) : undefined;
	const movesLine = sumLines([
		...listed.map(moveRow),
		...(typicalRow
			? [{ gens: typicalRow.gens * typicalCount, toGo: typicalRow.toGo * typicalCount }]
			: [])
	]);

	// Items.
	const genericSlot =
		original.slots.find((slot) => slot.class === 'worn')?.id ?? requireSlot([], 'torso_inner').id;
	// Rig setup (setupPlan): registration plus one joint check per distinct standing and body frame of the drawn views.
	const setupCost =
		0.25 +
		EST *
			setupFrameHashes(
				{ ...original.rig, directions: inputs.directions },
				original.items.find((i) => i.id === original.rig.baseItem)?.layers[0]
			).size;
	// New moves need the rig's standing joints. A character without them (the bundled demo, some imports) is set up first,
	// after which items are posed on the skeleton like any other.
	const jointsMissing = drawn.some((d) => !hasAll(original.rig.rest?.[d]?.keypoints));
	const setupFirst = jointsMissing && movesLine.toGo > 0;
	const posable = setupFirst || canPose(rig, { anims: [standing], dirs: drawn, standing });
	const methodOf = (item: Pick<Item, 'route'>): Method =>
		item.route === 'ea2-anchor' || !posable ? 'anchor' : 'skel';
	const genericItem: Item = {
		id: '#item',
		name: '',
		slot: genericSlot,
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		prompt: '',
		layers: [],
		baseHash: rig.baseHash,
		key: 'green',
		standing,
		provenance: []
	};
	const design = (item: Item) => {
		const slot = requireSlot(original, item.slot);
		const method = methodOf(item);
		const pad = padOf(slot, method, rig.cell);
		const plan = planItem(rig, {
			anims: [standing],
			dirs: drawn,
			method,
			key: item.key ?? 'green',
			standing,
			slot: item.slot,
			slotConfig: slot
		});
		return planGens(plan, { w: rig.cell.w + 2 * pad, h: rig.cell.h + 2 * pad });
	};
	const fitCache = new Map<string, number>();
	const fit = (item: Item, index: number, dirs: DirectionName[]) => {
		if (!dirs.length) return 0;
		const move = listed.includes(index) ? index : 'typical';
		const key = `${item.id}|${move}|${dirs.join()}`;
		let gens = fitCache.get(key);
		if (gens === undefined) {
			const anim = specAt(index).id;
			gens =
				methodOf(item) === 'anchor'
					? planGens(
							planAnchoredMove(
								rig,
								{
									standing,
									dressed: Object.fromEntries(dirs.map((d) => [d, 'sha256:cost' as const]))
								},
								anim,
								dirs
							),
							rig.cell
						)
					: itemPoseGens(rig, item, anim, framesOf(index), dirs, original);
			fitCache.set(key, gens);
		}
		return gens;
	};

	const itemRow = (index: number): ItemRow => {
		const saved = index < c.items.length ? c.items[index] : undefined;
		const item = saved?.item ?? genericItem;
		const coverage = inputs.coverage[index];
		const base = {
			id: saved?.id,
			name: saved?.item.name,
			held: saved?.held ?? false,
			covered: coveredCount(coverage, inputs.moves),
			inherited: saved?.inherited ?? false
		};
		if (free) return { ...base, remake: false, gens: 0, toGo: 0 };
		// Fitting a saved item to more moves needs its own standing design in every drawn direction.
		const canExtend =
			!saved || (!!extendable(original, item.id) && drawn.every((d) => !!item.dressed?.[d]));
		const typicalCovered =
			coveredIn(coverage, suggestedEnd, inputs.moves) -
			listed.filter((i) => i >= suggestedEnd && covers(coverage, i)).length;
		let gens = 0,
			toGo = 0;
		for (const i of listed) {
			if (!covers(coverage, i)) continue;
			const move = saved && savedMoveAt(i);
			const done = !move
				? []
				: bundledArt && saved.inherited
					? drawn.filter((d) => seeded.includes(d))
					: drawn.filter((d) => seeded.includes(d) && hasCompleteCells(original, item, move.id, d));
			const rest = fit(item, i, missing(done));
			gens += (done.length && !saved?.inherited ? fit(item, i, done) : 0) + rest;
			toGo += rest;
		}
		if (typicalCount > 0) {
			const each = fit(item, typicalIndex, drawn) * typicalCovered;
			gens += each;
			toGo += each;
		}
		if (saved && !canExtend && toGo > 0) {
			const fresh = { ...item, id: `${item.id}#remake`, route: undefined, dressed: undefined };
			const remade =
				design(fresh) +
				listed
					.filter((i) => covers(coverage, i))
					.reduce((sum, i) => sum + fit(fresh, i, drawn), 0) +
				(typicalCount > 0 ? fit(fresh, typicalIndex, drawn) * typicalCovered : 0);
			// The old frames belong to the old design: the finished item is the remake alone.
			return { ...base, remake: true, gens: remade, toGo: remade };
		}
		const designGens = saved?.inherited ? 0 : design(item);
		gens += designGens;
		if (!saved) toGo += designGens;
		return { ...base, remake: false, gens, toGo };
	};
	const addedItems = Math.max(0, inputs.items - c.items.length);
	const narrowed = Object.keys(inputs.coverage)
		.map(Number)
		.filter((i) => i >= c.items.length && i < inputs.items);
	const genericCount = addedItems - narrowed.length;
	const genericIndex = (() => {
		let i = c.items.length;
		while (inputs.coverage[i]) i++;
		return i;
	})();
	const generic = genericCount > 0 ? itemRow(genericIndex) : undefined;
	const itemsLine = sumLines([
		...Array.from({ length: Math.min(inputs.items, c.items.length) }, (_, i) => itemRow(i)),
		...narrowed.map(itemRow),
		...(generic ? [{ gens: generic.gens * genericCount, toGo: generic.toGo * genericCount }] : [])
	]);

	// States: saved ones at their own route, added ones at the character's latest route.
	const cellSize = { width: rig.cell.w, height: rig.cell.h };
	const stateGens = (route: StateRoute): number => {
		if (route === 'capture') return 0;
		if (route === 'managed') return managedStateCost(cellSize).maxGenerations;
		const plan = planStateGeneration({ model: route, cellSize, facingIds: drawn });
		if (plan.kind === 'ready' && plan.cost) return plan.cost.maxGenerations;
		return route === 'pro' ? 0 : stateGens('pro');
	};
	const addedStates = Math.max(0, inputs.states - c.states.length);
	const addedEach = free ? 0 : stateGens(c.addedState.route);
	const statesLine = sumLines([
		...c.states
			.slice(0, inputs.states)
			.map((route) => ({ gens: free ? 0 : stateGens(route), toGo: 0 })),
		{ gens: addedEach * addedStates, toGo: addedEach * addedStates }
	]);

	// Setup: a drawn character's creation price, or imported art's rig setup; bundled art pays setup only to add moves.
	const fromScratch =
		c.setup.kind === 'draw'
			? estimate({
					directions: inputs.directions,
					size: c.setup.size,
					model: c.setup.model,
					reference: undefined
				}).maxGens
			: setupCost;
	const setupLine = free
		? { gens: 0, toGo: 0 }
		: c.kind === 'new'
			? { gens: fromScratch, toGo: fromScratch }
			: bundledArt
				? { gens: setupFirst ? setupCost : 0, toGo: setupFirst ? setupCost : 0 }
				: { gens: fromScratch, toGo: setupFirst ? setupCost : 0 };

	const times = (line: CostLine): CostLine => ({
		gens: line.gens * attempts,
		toGo: line.toGo * attempts
	});
	const [setup, moves, items, states] = [setupLine, movesLine, itemsLine, statesLine].map(times);
	return {
		attempts,
		drawn,
		setup,
		moves,
		items,
		states: {
			...states,
			route: c.addedState.route,
			assumed: c.addedState.assumed
		},
		total: setup.gens + moves.gens + items.gens + states.gens,
		toGo: setup.toGo + moves.toGo + items.toGo + states.toGo,
		move: (index) => {
			const row = typicalRow && !listed.includes(index) ? typicalRow : moveRow(index);
			return { ...row, ...times(row) };
		},
		item: (index) => {
			const row =
				generic && index >= c.items.length && !inputs.coverage[index] ? generic : itemRow(index);
			return { ...row, ...times(row) };
		},
		frameChoices: (index) =>
			moveFrameCounts(specAt(index).animation?.model ?? 'skeleton-v3', rig.cell.w)
	};
}

// ---------- dollars ----------
/** Free / Trial, unknown and unnumbered accounts are estimated at Tier 1 rates. */
export const pricedTier = (tier: number | null): PricedTier =>
	tier === 2 || tier === 3 ? tier : 1;
/** A plan's price over its monthly generations. */
export interface Rate {
	tier: PricedTier;
	generations: number;
}
/** The picked tier's published price over its published monthly generations. */
export function planRate(tier: number): Rate {
	const priced = pricedTier(tier);
	return { tier: priced, generations: PLAN_PRICES[priced].generations };
}
export const usdOf = (gens: number, rate: Rate, price: 'low' | 'list' = 'list') =>
	(gens * PLAN_PRICES[rate.tier][price]) / rate.generations;
export const spentUsd = (spent: RecordedCost, rate: Rate) =>
	usdOf(spent.generations, rate) + spent.usd;
/** The end cost: what was really spent plus the estimate of the work still to go. */
export const projectedUsd = (
	spent: RecordedCost,
	toGo: number,
	rate: Rate,
	price: 'low' | 'list' = 'list'
) => spentUsd(spent, rate) + usdOf(toGo, rate, price);
/** A first-attempt price of the work the character already has; what it really cost, retries included, is in Spent. */
export const currentGens = (r: Pick<CostResult, 'total' | 'toGo' | 'attempts'>) =>
	(r.total - r.toGo) / r.attempts;

// ---------- savings tips ----------
export type Tip =
	| { kind: 'mirror'; saving: number; inputs: CostInputs }
	| { kind: 'held'; item: number; moves: number[]; saving: number; inputs: CostInputs }
	| { kind: 'trim'; move: number; frames: number; saving: number; inputs: CostInputs };

/** Up to two quality-safe changes with a real saving in cents at this tier, largest first. Only work still to go can
 *  get cheaper: money already spent stays spent. */
export function savingTips(c: CostCharacter, inputs: CostInputs, rate: Rate): Tip[] {
	const cents = (next: CostInputs) => Math.round(usdOf(characterCost(c, next).toGo, rate) * 100);
	const now = cents(inputs);
	const tips: Tip[] = [];
	const saving = (next: CostInputs) => (now - cents(next)) / 100;

	// Mirror each drawn western view whose eastern partner is drawn too.
	const mirrorable = inputs.directions.filter((d) => {
		const partner = mirrorPartner(d.id);
		return (
			d.id.includes('west') &&
			!d.mirrorOf &&
			!!partner &&
			inputs.directions.some((e) => e.id === partner && !e.mirrorOf)
		);
	});
	if (mirrorable.length) {
		const next = {
			...inputs,
			directions: inputs.directions.map((d) =>
				mirrorable.includes(d) ? { id: d.id, mirrorOf: mirrorPartner(d.id)! } : d
			)
		};
		tips.push({ kind: 'mirror', saving: saving(next), inputs: next });
	}

	// A held item back on the moves it was made for.
	c.items.slice(0, inputs.items).forEach((entry, index) => {
		if (!entry.held) return;
		const usual = c.moves
			.slice(0, inputs.moves)
			.flatMap((move, i) =>
				drawnOf(inputs.directions).some((d) => hasCompleteCells(c.manifest, entry.item, move.id, d))
					? [i]
					: []
			);
		const coverage = inputs.coverage[index];
		if (!usual.length || coveredCount(coverage, inputs.moves) <= usual.length) return;
		const next = {
			...inputs,
			coverage: { ...inputs.coverage, [index]: { all: false, except: usual } }
		};
		tips.push({ kind: 'held', item: index, moves: usual, saving: saving(next), inputs: next });
	});

	// Fewer frames on a move, kept at eight or more, where that crosses a price step.
	const result = characterCost(c, inputs);
	for (let index = 0; index < Math.min(inputs.moves, c.moves.length + 7); index++) {
		const row = result.move(index);
		const shorter = result
			.frameChoices(index)
			.filter((frames) => frames >= 8 && frames < row.frames)
			.reverse();
		for (const frames of shorter) {
			const next = { ...inputs, frames: { ...inputs.frames, [index]: frames } };
			const s = saving(next);
			if (s > 0) {
				tips.push({ kind: 'trim', move: index, frames, saving: s, inputs: next });
				break;
			}
		}
	}
	return tips
		.filter((tip) => tip.saving > 0)
		.sort((a, b) => b.saving - a.saving)
		.slice(0, 2);
}
