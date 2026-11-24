import { LocalizedError } from '../lib/message.ts';

// The async Clipboard API exposes images and text only, never copied files, so ZIP drop boxes cannot paste.
export const canPasteImages = () =>
	typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';

const isImage = (type: string) => type.startsWith('image/');
const isImageUrl = (url: string) => /^(data:image\/|blob:|https?:)/i.test(url);

/** Copying pixels from some apps exposes them as a format only the canvas can decode. */
async function toPng(blob: Blob, type: string): Promise<Blob | undefined> {
	if (type === 'image/png') return blob;
	const bitmap = await createImageBitmap(blob).catch(() => undefined);
	if (!bitmap) return undefined;
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
	bitmap.close();
	return canvas.convertToBlob({ type: 'image/png' });
}

/** Some browsers expose a copied image only as markup, so pull its pixels out of the URL. */
function markupImageUrls(html: string): string[] {
	const document = new DOMParser().parseFromString(html, 'text/html');
	return Array.from(document.images)
		.map((image) => image.getAttribute('src') ?? '')
		.filter(isImageUrl);
}

async function fileFromUrl(url: string): Promise<File | undefined> {
	try {
		const response = await fetch(url);
		const blob = await response.blob();
		if (!response.ok || !isImage(blob.type)) return undefined;
		const png = await toPng(blob, blob.type);
		return png
			? new File([png], 'clipboard.png', { type: 'image/png' })
			: new File([blob], `clipboard.${blob.type.slice(6)}`, { type: blob.type });
	} catch (error) {
		console.error('clipboard image URL', error);
		return undefined;
	}
}

async function imageFile(item: ClipboardItem): Promise<File | undefined> {
	const types = item.types.filter(isImage);
	const type = types.includes('image/png') ? 'image/png' : types[0];
	if (type) {
		const blob = await item.getType(type);
		if (blob.size) {
			const png = await toPng(blob, type);
			if (png) return new File([png], 'clipboard.png', { type: 'image/png' });
			if (type === 'image/jpeg' || type === 'image/webp')
				return new File([blob], `clipboard.${type.slice(6)}`, { type });
		}
	}
	if (item.types.includes('text/html')) {
		for (const url of markupImageUrls(await (await item.getType('text/html')).text())) {
			const file = await fileFromUrl(url);
			if (file) return file;
		}
	}
	if (item.types.includes('text/plain')) {
		const text = (await (await item.getType('text/plain')).text()).trim();
		if (text.startsWith('data:image/')) return fileFromUrl(text);
	}
	return undefined;
}

/** The images on the clipboard as files, ready for a drop box. */
export async function clipboardImages(): Promise<File[]> {
	let items: ClipboardItems;
	try {
		items = await navigator.clipboard.read();
	} catch (error) {
		console.error('clipboard read', error);
		throw error instanceof DOMException && error.name === 'NotAllowedError'
			? new LocalizedError(
					'Clipboard access was blocked. Allow it for this site, then try again.',
					'clipboard.denied'
				)
			: new LocalizedError('The clipboard could not be read.', 'clipboard.unreadable');
	}
	const files: File[] = [];
	for (const item of items) {
		const file = await imageFile(item);
		if (file) files.push(file);
	}
	if (!files.length)
		throw new LocalizedError(
			'The clipboard has no image. Copy an image first.',
			'clipboard.noImage'
		);
	return files;
}
