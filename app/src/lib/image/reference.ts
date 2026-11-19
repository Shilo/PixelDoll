import { bytesToBase64 } from './png.ts';
import { referenceKeyCollisions, type Key } from './chroma.ts';
import { opaqueBox } from '../rig/normalize.ts';

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
	inspectColors: boolean
): Promise<PickedReference> {
	if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
		throw new Error('Choose a PNG, JPEG, or WebP image.');
	if (file.size > REFERENCE_MAX_MB * 1024 * 1024)
		throw new Error(`Choose an image no larger than ${REFERENCE_MAX_MB} MB.`);
	const bitmap = await createImageBitmap(file).catch(() => {
		throw new Error('This image could not be opened. Choose a different file.');
	});
	try {
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
		if (!box || !data.some((value, index) => index % 4 === 3 && value >= 128))
			throw new Error(
				scale < 1
					? 'No visible artwork remains after resizing. Choose a different image.'
					: 'This image has no visible artwork. Choose a different file.'
			);
		const png = await canvas.convertToBlob({ type: 'image/png' });
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
