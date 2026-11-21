import { bytesToBase64 } from './png.ts';
import { referenceKeyCollisions, type Key } from './chroma.ts';
import { opaqueBox } from '../rig/normalize.ts';
import { LocalizedError } from '../message.ts';

export const REFERENCE_MAX_MB = 8;

export interface ReferenceSize {
	width: number;
	height: number;
}

export interface ImageReference extends ReferenceSize {
	base64: string;
}

export interface PickedReference extends ImageReference {
	name: string;
	previewBox: string;
	resizedFrom?: ReferenceSize;
	keyCollisions?: Record<Key, number>;
}

export function referenceSizeError(image: ImageReference, max: number): string {
	return image.width > max || image.height > max
		? `Choose a reference no larger than ${max} × ${max} px.`
		: '';
}

export async function readReference(
	file: File,
	max: ReferenceSize,
	inspectColors: boolean,
	exactFrame = false
): Promise<PickedReference> {
	if (exactFrame && file.type !== 'image/png')
		throw new LocalizedError('Choose a PNG image.', 'moveSheet.referencePng');
	if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
		throw new LocalizedError('Choose a PNG, JPEG, or WebP image.', 'reference.unsupported');
	if (file.size > REFERENCE_MAX_MB * 1024 * 1024)
		throw new LocalizedError(
			`Choose an image no larger than ${REFERENCE_MAX_MB} MB.`,
			'reference.tooLarge',
			{ mb: REFERENCE_MAX_MB }
		);
	const bitmap = await createImageBitmap(
		file,
		exactFrame ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : undefined
	).catch(() => {
		throw new LocalizedError(
			'This image could not be opened. Choose a different file.',
			'reference.unreadable'
		);
	});
	try {
		const invalidFrame = () =>
			new LocalizedError(
				'Use a frame of the correct size with a transparent background.',
				'moveSheet.referenceInvalid',
				{ width: max.width, height: max.height }
			);
		if (exactFrame && (bitmap.width !== max.width || bitmap.height !== max.height))
			throw invalidFrame();
		const scale = Math.min(1, max.width / bitmap.width, max.height / bitmap.height);
		const image = {
			width: Math.max(1, Math.round(bitmap.width * scale)),
			height: Math.max(1, Math.round(bitmap.height * scale))
		};
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext('2d')!;
		context.imageSmoothingEnabled = false;
		context.drawImage(bitmap, 0, 0, image.width, image.height);
		const { data } = context.getImageData(0, 0, image.width, image.height);
		const pixels = { w: image.width, h: image.height, data };
		const box = opaqueBox(pixels);
		if (exactFrame && (!box || !data.some((alpha, index) => index % 4 === 3 && alpha === 0)))
			throw invalidFrame();
		if (!box || !data.some((value, index) => index % 4 === 3 && value >= 128))
			throw scale < 1
				? new LocalizedError(
						'No visible artwork remains after resizing. Choose a different image.',
						'reference.noArtworkResized'
					)
				: new LocalizedError(
						'This image has no visible artwork. Choose a different file.',
						'reference.noArtwork'
					);
		const png = exactFrame ? file : await canvas.convertToBlob({ type: 'image/png' });
		return {
			...image,
			previewBox: `${box.x0} ${box.y0} ${box.x1 - box.x0 + 1} ${box.y1 - box.y0 + 1}`,
			...(scale < 1 ? { resizedFrom: { width: bitmap.width, height: bitmap.height } } : {}),
			...(inspectColors ? { keyCollisions: referenceKeyCollisions(pixels) } : {}),
			base64: bytesToBase64(new Uint8Array(await png.arrayBuffer())),
			name: file.name
		};
	} finally {
		bitmap.close();
	}
}
