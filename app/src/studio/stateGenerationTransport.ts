import { base64ToBytes, bytesToBase64, makeImg, pngSize, type Img } from '../lib/image/png.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import type { ImageReference } from '../lib/image/reference.ts';
import { png, routes, type Req, type Size } from '../lib/pixellab/routes.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';
import type { DirectionName } from '../lib/rig/rig.ts';
import type { StateGenerationBatch, StateGenerationPlan } from './stateGenerationPlan.ts';
import type { StateGenerationSource } from './stateGenerationSource.ts';

export type ReadyStatePlan = Extract<StateGenerationPlan, { kind: 'ready' }>;

const sameSize = (first: Readonly<Size>, second: Readonly<Size>) =>
	first.width === second.width && first.height === second.height;

function requireImage(image: Img | undefined, size: Readonly<Size>): asserts image is Img {
	if (
		!image ||
		image.w !== size.width ||
		image.h !== size.height ||
		image.data.length !== size.width * size.height * 4
	)
		throw new Error(`Expected a complete ${size.width} × ${size.height} RGBA image.`);
}

function canvasFor(cell: Readonly<Size>, batch: StateGenerationBatch): Readonly<Size> {
	const count = batch.facingIds.length;
	if (!count || new Set(batch.facingIds).size !== count)
		throw new Error('State batch must contain unique facings.');
	if (batch.transport === 'cells') return cell;
	const { canvas, columns, rows } = batch;
	if (
		!Number.isSafeInteger(columns) ||
		columns < 1 ||
		rows !== Math.ceil(count / columns) ||
		!Number.isSafeInteger(canvas.width) ||
		!Number.isSafeInteger(canvas.height) ||
		columns * cell.width > canvas.width ||
		rows * cell.height > canvas.height
	)
		throw new Error('State cells do not fit the planned sheet.');
	return canvas;
}

const origin = { x: 0, y: 0 };
const cellOffset = (cell: Readonly<Size>, columns: number, index: number) => ({
	x: (index % columns) * cell.width,
	y: Math.floor(index / columns) * cell.height
});

function copyPixels(source: Img, target: Img, size: Readonly<Size>, from = origin, to = origin) {
	for (let row = 0; row < size.height; row++) {
		const start = ((from.y + row) * source.w + from.x) * 4;
		const offset = ((to.y + row) * target.w + to.x) * 4;
		target.data.set(source.data.subarray(start, start + size.width * 4), offset);
	}
}

function checkedReference(plan: ReadyStatePlan, reference: ImageReference | undefined) {
	if ((plan.method === 'reference') !== Boolean(reference))
		throw new Error('The State reference does not match the planned method.');
	if (!reference) return undefined;
	const { width, height, base64 } = reference;
	const native = pngSize(base64ToBytes(base64));
	if (
		!('referenceSize' in plan) ||
		!plan.referenceSize ||
		!sameSize(reference, plan.referenceSize) ||
		!native ||
		native.w !== width ||
		native.h !== height
	)
		throw new Error('The State reference does not match the planned dimensions.');
	return { image: png(base64), size: { width, height } };
}

export async function stateRequests(
	plan: ReadyStatePlan,
	source: StateGenerationSource,
	id: string,
	description: string,
	seed: number,
	reference?: ImageReference
): Promise<Req[]> {
	const { cellSize } = plan;
	const sourceViews = new Map(source.views.map(({ direction, image }) => [direction, image]));
	const facingIds = plan.batches.flatMap((batch) => batch.facingIds);
	if (
		!sameSize(cellSize, source.size) ||
		!facingIds.length ||
		new Set(facingIds).size !== facingIds.length ||
		facingIds.length !== source.views.length ||
		facingIds.length !== sourceViews.size ||
		facingIds.some((direction) => !sourceViews.has(direction))
	)
		throw new Error('The State source does not match the planned canvas and facings.');
	const prompt = description.trim();
	const ref = checkedReference(plan, reference);
	if (plan.endpoint === '/create-character-state')
		return [
			routes.createCharacterState({
				character_id: plan.parentId,
				state_name: id,
				edit_description: prompt,
				seed,
				no_background: true
			})
		];

	return Promise.all(
		plan.batches.map(async (batch, index) => {
			const controls = { seed: (seed + index) & 0x7fffffff, no_background: true };
			const canvas = canvasFor(cellSize, batch);
			const cells = batch.facingIds.map((direction) => {
				const image = sourceViews.get(direction);
				requireImage(image, cellSize);
				if (!opaqueBox(image)) throw new Error(`The ${direction} State source is empty.`);
				return image;
			});
			let inputs = cells;
			if (batch.transport === 'sheet') {
				const sheet = makeImg(canvas.width, canvas.height);
				cells.forEach((image, index) =>
					copyPixels(image, sheet, cellSize, origin, cellOffset(cellSize, batch.columns, index))
				);
				inputs = [sheet];
			}
			const images = await Promise.all(
				inputs.map(async (image) => png(bytesToBase64(await encodePngBytes(image))))
			);
			switch (plan.endpoint) {
				case '/edit-images-v2': {
					const shared = {
						edit_images: images.map((image) => ({ image, ...canvas })),
						image_size: canvas,
						...controls
					};
					return routes.editImagesV2(
						ref
							? {
									...shared,
									method: 'edit_with_reference',
									reference_image: { image: ref.image, ...ref.size },
									...(prompt && { description: prompt })
								}
							: { ...shared, method: 'edit_with_text', description: prompt }
					);
				}
				case '/edit-animation-v2':
				case '/transfer-outfit-v2': {
					if (batch.transport !== 'cells' || images.length < 2)
						throw new Error('State animation edits require multiple native cells.');
					const shared = {
						frames: images.map((image) => ({ image, size: cellSize })),
						image_size: cellSize,
						...controls
					};
					if (plan.endpoint === '/edit-animation-v2')
						return routes.editAnimationV2({ ...shared, description: prompt });
					if (!ref) throw new Error('Outfit transfer requires a reference.');
					return routes.transferOutfitV2({
						...shared,
						reference_image: ref,
						...(prompt && { additional_instructions: prompt })
					});
				}
				case '/edit-image-pro-flash':
				case '/edit-image-pixen': {
					const [image] = images;
					if (!image || images.length !== 1)
						throw new Error('State image edits require exactly one input image.');
					const shared = { image, ...controls };
					return plan.endpoint === '/edit-image-pixen'
						? routes.editImagePixen({ ...shared, ...canvas, description: prompt })
						: routes.editImageProFlash(
								ref
									? { ...shared, method: 'reference', reference_image: ref.image }
									: { ...shared, method: 'text', description: prompt }
							);
				}
			}
		})
	);
}

export function decodeStateBatch(
	plan: ReadyStatePlan,
	batch: StateGenerationBatch,
	images: Img[]
): { direction: DirectionName; image: Img }[] {
	if (plan.endpoint === '/create-character-state')
		throw new Error('Managed State results must come from the child character.');
	const canvas = canvasFor(plan.cellSize, batch);
	const count = batch.transport === 'sheet' ? 1 : batch.facingIds.length;
	if (images.length !== count) throw new Error(`Expected ${count} State result image(s).`);
	for (const image of images) requireImage(image, canvas);
	return batch.facingIds.map((direction, index) => {
		let image = images[index];
		if (batch.transport === 'sheet') {
			const { cellSize } = plan;
			image = makeImg(cellSize.width, cellSize.height);
			copyPixels(images[0], image, cellSize, cellOffset(cellSize, batch.columns, index));
		}
		if (!opaqueBox(image)) throw new Error(`The ${direction} State result is empty.`);
		return { direction, image };
	});
}
