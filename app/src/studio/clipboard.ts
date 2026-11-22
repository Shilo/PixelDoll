import { LocalizedError } from '../lib/message.ts';

// The async Clipboard API exposes images and text only, never copied files, so ZIP drop boxes cannot paste.
export const canPasteImages = () =>
	typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';

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
		const type = item.types.find((type) => type.startsWith('image/'));
		if (!type) continue;
		const blob = await item.getType(type);
		files.push(new File([blob], `clipboard.${type.slice(6).split('+')[0]}`, { type }));
	}
	if (!files.length)
		throw new LocalizedError(
			'The clipboard has no image. Copy an image first.',
			'clipboard.noImage'
		);
	return files;
}
