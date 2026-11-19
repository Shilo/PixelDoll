import { bytesToBase64 } from './png.ts';
import { referenceKeyCollisions, type Key } from './chroma.ts';

export const REFERENCE_MAX_MB = 8;

export interface ImageReference {
	base64: string;
	width: number;
	height: number;
}

export interface PickedReference extends ImageReference {
	name: string;
	keyCollisions?: Record<Key, number>;
}

export function referenceSizeError(image: ImageReference, max: number): string {
	return image.width > max || image.height > max
		? `Choose a reference no larger than ${max} × ${max} px.`
		: '';
}

export async function readReference(
	file: File,
	max: number,
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
		const image = { width: bitmap.width, height: bitmap.height, base64: '' };
		const error = referenceSizeError(image, max);
		if (error) throw new Error(error);
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext('2d')!;
		context.drawImage(bitmap, 0, 0);
		const { data } = context.getImageData(0, 0, image.width, image.height);
		if (!data.some((value, index) => index % 4 === 3 && value >= 128))
			throw new Error('This image has no visible artwork. Choose a different file.');
		const png = await canvas.convertToBlob({ type: 'image/png' });
		return {
			...image,
			...(inspectColors
				? { keyCollisions: referenceKeyCollisions({ w: image.width, h: image.height, data }) }
				: {}),
			base64: bytesToBase64(new Uint8Array(await png.arrayBuffer())),
			name: file.name
		};
	} finally {
		bitmap.close();
	}
}
