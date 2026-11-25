import { editGens } from '../lib/items/items.ts';
import { EDIT_MIN_FRAMES, editFrameCap, type Size } from '../lib/pixellab/routes.ts';
import { poseCallGens } from '../lib/rig/clips.ts';
import type { DirectionName, Keypoint, Rig, Sha256 } from '../lib/rig/rig.ts';

export type StateGenerationModel = 'pro' | 'pro-flash' | 'pixen';

export interface VerifiedStateParent {
	readonly id: string;
	readonly size: Readonly<Size>;
	readonly facingCount: 4 | 8;
}

export interface StateGenerationInput {
	readonly model: StateGenerationModel;
	readonly cellSize: Readonly<Size>;
	readonly facingIds: readonly DirectionName[];
	readonly referenceSize?: Readonly<Size>;
	readonly allowOutfitTransfer?: boolean;
	readonly managedParent?: VerifiedStateParent;
	readonly flashNativeShapes?: readonly Readonly<Size>[];
}

export interface StateSheetLayout {
	readonly canvas: Readonly<Size>;
	readonly columns: number;
	readonly rows: number;
}

export type StateGenerationBatch = { readonly facingIds: readonly DirectionName[] } & (
	{ readonly transport: 'cells' } | ({ readonly transport: 'sheet' } & StateSheetLayout)
);

export type StateGenerationRejection =
	| 'invalid-cell-size'
	| 'no-facings'
	| 'duplicate-facings'
	| 'invalid-reference-size'
	| 'reference-too-large'
	| 'unsupported-cell-size'
	| 'pixen-reference-unsupported'
	| 'flash-shapes-unconfirmed'
	| 'flash-canvas-unsupported';

export interface StateGenerationCost {
	readonly kind: 'fixed' | 'estimate';
	readonly minGenerations: number;
	readonly maxGenerations: number;
}

type LocalStateRoute =
	| {
			readonly endpoint: '/edit-images-v2' | '/edit-image-pro-flash';
			readonly method: 'text' | 'reference';
	  }
	| { readonly endpoint: '/edit-animation-v2' | '/edit-image-pixen'; readonly method: 'text' }
	| { readonly endpoint: '/transfer-outfit-v2'; readonly method: 'reference' };

export type StateGenerationPlan =
	| { readonly kind: 'rejected'; readonly reason: StateGenerationRejection }
	| ({
			readonly kind: 'ready';
			readonly cellSize: Readonly<Size>;
			readonly batches: readonly StateGenerationBatch[];
			readonly warnings: readonly 'sheet-quality-unverified'[];
			readonly cost?: StateGenerationCost;
	  } & (
			| (LocalStateRoute & { readonly referenceSize?: Readonly<Size> })
			| {
					readonly endpoint: '/animate-with-skeleton-v3';
					readonly method: 'text';
					readonly view: NonNullable<Rig['view']>;
					readonly guides: readonly {
						direction: DirectionName;
						reference: Sha256;
						joints: Keypoint[];
						poses: Keypoint[][];
					}[];
			  }
			| {
					readonly endpoint: '/create-character-state';
					readonly method: 'text';
					readonly parentId: string;
					readonly remoteFacingCount: 4 | 8;
			  }
	  ));

const longest = ({ width, height }: Readonly<Size>) => Math.max(width, height);
const shortest = ({ width, height }: Readonly<Size>) => Math.min(width, height);
const area = ({ width, height }: Readonly<Size>) => width * height;
const sameSize = (first: Readonly<Size>, second: Readonly<Size>) =>
	first.width === second.width && first.height === second.height;
const validSize = ({ width, height }: Readonly<Size>) =>
	Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
const fits = (source: Readonly<Size>, canvas: Readonly<Size>) =>
	source.width <= canvas.width && source.height <= canvas.height;
const moreCompact = (candidate: Readonly<Size>, best: Readonly<Size>) =>
	area(candidate) < area(best) ||
	(area(candidate) === area(best) && longest(candidate) < longest(best));
const reject = (reason: StateGenerationRejection): StateGenerationPlan => ({
	kind: 'rejected',
	reason
});

function balancedBatches(facingIds: readonly DirectionName[], cap: number): DirectionName[][] {
	let offset = 0;
	const jobs = Math.ceil(facingIds.length / cap);
	return Array.from({ length: jobs }, (_, index) => {
		const count = Math.ceil((facingIds.length - offset) / (jobs - index));
		const batch = facingIds.slice(offset, offset + count);
		offset += count;
		return batch;
	});
}

function compactSheet(
	cell: Readonly<Size>,
	count: number,
	canvasFor: (native: Size) => Size | undefined
): StateSheetLayout | undefined {
	let best: StateSheetLayout | undefined;
	for (let columns = count; columns > 0; columns--) {
		const rows = Math.ceil(count / columns);
		const canvas = canvasFor({ width: columns * cell.width, height: rows * cell.height });
		if (canvas && (!best || moreCompact(canvas, best.canvas))) best = { canvas, columns, rows };
	}
	return best;
}

function pixenCanvas(native: Size): Size | undefined {
	const width = Math.ceil(native.width / 4) * 4;
	const height = Math.ceil(native.height / 4) * 4;
	if (Math.max(width, height) > 256) return undefined;
	if (width * height >= 256) return { width, height };
	let best = { width, height: Math.ceil(256 / width / 4) * 4 };
	for (let paddedWidth = width + 4; paddedWidth <= 64; paddedWidth += 4) {
		const canvas = {
			width: paddedWidth,
			height: Math.max(height, Math.ceil(256 / paddedWidth / 4) * 4)
		};
		if (moreCompact(canvas, best)) best = canvas;
	}
	return best;
}

function sheetBatch(
	facingIds: readonly DirectionName[],
	layout: StateSheetLayout
): StateGenerationBatch {
	return { transport: 'sheet', facingIds: [...facingIds], ...layout };
}

function estimate(jobs: number, min: number, max = min): StateGenerationCost {
	return { kind: 'estimate', minGenerations: min * jobs, maxGenerations: max * jobs };
}

/** The managed Pro State quote: one request for the whole parent, whatever its facing count. */
export function managedStateCost(cellSize: Readonly<Size>): StateGenerationCost {
	const side = longest(cellSize);
	return {
		kind: 'estimate',
		minGenerations: 10,
		maxGenerations: side <= 70 ? 10 : side <= 93 ? 15 : 25
	};
}

export function localStateCost(
	endpoint: LocalStateRoute['endpoint'] | '/animate-with-skeleton-v3',
	cellSize: Readonly<Size>,
	batches: readonly StateGenerationBatch[]
): StateGenerationCost | undefined {
	const count = batches.length;
	switch (endpoint) {
		case '/animate-with-skeleton-v3':
			return estimate(count, poseCallGens(3));
		case '/edit-image-pro-flash':
			return undefined;
		case '/edit-image-pixen':
			return { kind: 'fixed', minGenerations: count, maxGenerations: count };
		case '/edit-images-v2': {
			const maxGenerations = batches.reduce((sum, batch) => {
				const extent = longest(batch.transport === 'sheet' ? batch.canvas : cellSize);
				return sum + (extent <= 256 ? 10 : extent <= 336 ? 15 : 25);
			}, 0);
			return { kind: 'estimate', minGenerations: 10 * count, maxGenerations };
		}
		case '/edit-animation-v2':
		case '/transfer-outfit-v2':
			return estimate(count, editGens({ w: cellSize.width, h: cellSize.height }));
	}
}

export function planStateGeneration(input: StateGenerationInput): StateGenerationPlan {
	const { cellSize, facingIds, referenceSize, managedParent, flashNativeShapes } = input;
	if (!validSize(cellSize)) return reject('invalid-cell-size');
	if (!facingIds.length) return reject('no-facings');
	if (new Set(facingIds).size !== facingIds.length) return reject('duplicate-facings');
	if (referenceSize && !validSize(referenceSize)) return reject('invalid-reference-size');
	const side = longest(cellSize);
	const reference = referenceSize !== undefined;
	const method = reference ? 'reference' : 'text';
	const cells = (cap: number): StateGenerationBatch[] =>
		balancedBatches(facingIds, cap).map((group) => ({ transport: 'cells', facingIds: group }));
	const ready = (
		route: LocalStateRoute,
		batches: readonly StateGenerationBatch[],
		cost = localStateCost(route.endpoint, cellSize, batches)
	): StateGenerationPlan => ({
		kind: 'ready',
		...route,
		cellSize: { ...cellSize },
		...(referenceSize && { referenceSize: { ...referenceSize } }),
		batches,
		warnings: batches.some((batch) => batch.transport === 'sheet' && batch.facingIds.length > 1)
			? ['sheet-quality-unverified']
			: [],
		...(cost && { cost })
	});

	if (input.model === 'pixen') {
		if (reference) return reject('pixen-reference-unsupported');
		if (side > 256) return reject('unsupported-cell-size');
		const layouts: StateSheetLayout[] = [];
		for (let count = 1; count <= facingIds.length; count++) {
			const layout = compactSheet(cellSize, count, pixenCanvas);
			if (!layout) break;
			layouts.push(layout);
		}
		const batches = balancedBatches(facingIds, layouts.length).map((group) => {
			const layout = layouts[group.length - 1];
			return group.length === 1 && sameSize(cellSize, layout.canvas)
				? { transport: 'cells' as const, facingIds: group }
				: sheetBatch(group, layout);
		});
		return ready({ endpoint: '/edit-image-pixen', method: 'text' }, batches);
	}

	if (input.model === 'pro-flash') {
		if (!flashNativeShapes?.length) return reject('flash-shapes-unconfirmed');
		const route = { endpoint: '/edit-image-pro-flash', method } as const;
		const layouts: StateSheetLayout[] = [];
		for (let count = 1; count <= facingIds.length; count++) {
			const layout = compactSheet(cellSize, count, (native) => {
				let canvas: Readonly<Size> | undefined;
				for (const shape of flashNativeShapes)
					if (
						fits(native, shape) &&
						(!referenceSize || fits(referenceSize, shape)) &&
						(!canvas || moreCompact(shape, canvas))
					)
						canvas = shape;
				return canvas;
			});
			if (!layout) break;
			layouts.push(layout);
		}
		if (!layouts.length)
			return reject(
				referenceSize && flashNativeShapes.some((shape) => fits(cellSize, shape))
					? 'reference-too-large'
					: 'flash-canvas-unsupported'
			);
		return ready(
			route,
			balancedBatches(facingIds, layouts.length).map((group) => {
				const layout = layouts[group.length - 1];
				return group.length === 1 && sameSize(cellSize, layout.canvas)
					? { transport: 'cells' as const, facingIds: group }
					: sheetBatch(group, layout);
			})
		);
	}

	if (
		!reference &&
		managedParent?.id.trim() &&
		(managedParent.facingCount === 4 || managedParent.facingCount === 8) &&
		managedParent.facingCount >= facingIds.length &&
		sameSize(managedParent.size, cellSize)
	)
		return {
			kind: 'ready',
			endpoint: '/create-character-state',
			method: 'text',
			parentId: managedParent.id,
			remoteFacingCount: managedParent.facingCount,
			cellSize: { ...cellSize },
			batches: cells(facingIds.length),
			warnings: []
		};

	if (referenceSize && longest(referenceSize) > 512) return reject('reference-too-large');
	const nativePro = shortest(cellSize) >= 32 && side <= 512;
	const cap = side <= 128 ? editFrameCap(side) - Number(reference) : 1;
	const images = (batches: readonly StateGenerationBatch[]) =>
		ready({ endpoint: '/edit-images-v2', method }, batches);
	if (nativePro && facingIds.length <= cap) return images(cells(cap));
	if (nativePro && side >= 81) {
		const layout = compactSheet(cellSize, facingIds.length, (native) =>
			longest(native) <= 512 ? native : undefined
		);
		if (layout) return images([sheetBatch(facingIds, layout)]);
	}
	const animationRoute =
		!referenceSize && shortest(cellSize) >= 16
			? ({ endpoint: '/edit-animation-v2', method: 'text' } as const)
			: referenceSize &&
				  input.allowOutfitTransfer !== false &&
				  nativePro &&
				  longest(referenceSize) <= 256
				? ({ endpoint: '/transfer-outfit-v2', method: 'reference' } as const)
				: undefined;
	if (animationRoute && side <= 256 && (side >= 129 || !nativePro)) {
		const batches = cells(editFrameCap(side) - Number(reference));
		if (batches.every((batch) => batch.facingIds.length >= EDIT_MIN_FRAMES))
			return ready(animationRoute, batches);
	}
	return nativePro ? images(cells(cap)) : reject('unsupported-cell-size');
}
