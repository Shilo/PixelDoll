// The one character ZIP an Import page reads, from a drop or the file picker.
import { LocalizedError } from '../lib/message.ts';
import { lazy } from '../lib/lazy.ts';
import { MAX_ZIP_BYTES } from '../lib/store/zip.ts';
import type { ImportedCharacter } from '../lib/store/import.ts';

export async function readZipFiles(files: readonly File[]): Promise<ImportedCharacter> {
	if (files.length !== 1)
		throw new LocalizedError('Choose one character ZIP at a time.', 'import.error.oneAtATime');
	const [file] = files;
	if (!/\.zip$/i.test(file.name))
		throw new LocalizedError(
			'Choose a ZIP file exported from PixelLab or PixelDoll.',
			'import.error.chooseZip'
		);
	if (file.size > MAX_ZIP_BYTES)
		throw new LocalizedError('Choose a ZIP smaller than 64 MB.', 'zip.tooLarge');
	const { readCharacterZip } = await lazy(() => import('../lib/store/import.ts'));
	return readCharacterZip(new Uint8Array(await file.arrayBuffer()), undefined, 'all');
}
