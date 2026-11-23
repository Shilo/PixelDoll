import { app } from '../lib/app.svelte.ts';
import { DEBUG_FOLDER, debugBackupEnabled } from '../lib/debug/flags.ts';
import { keyForms, scrubText } from '../lib/debug/sanitize.ts';
import { errorMessage } from '../lib/i18n.ts';
import { LocalizedError, message } from '../lib/message.ts';
import { readSavedKey } from '../lib/shared-auth.ts';
import { exportBackup } from '../lib/store/backup.ts';
import { saveZip } from './download.svelte.ts';
import { getLocale } from 'svelte-whisper';
import { PRE_RELEASE } from './previewNotice.ts';
import { doc, prepareWorkspaceExport, toast, ui } from './state.svelte.ts';

/** The debug/ folder (Settings > Library, Developer mode). Loaded only when a debugging backup is written. */
async function debugFiles(keys: string[]) {
	const { debugFiles } = await import('../lib/debug/bundle.ts');
	return debugFiles({
		keys,
		locale: getLocale() || 'en',
		preRelease: PRE_RELEASE,
		studio: { ui, doc }
	});
}

/** A debugging backup that could not gather its details still saves the characters, with a note on what failed. */
const failedDebug = (error: unknown, keys: string[]) => [
	{
		name: `${DEBUG_FOLDER}failed.txt`,
		data: new TextEncoder().encode(
			scrubText(
				`The debugging details could not be written: ${error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)}`,
				keyForms(keys)
			)
		)
	}
];
const tooLarge = (error: unknown) =>
	error instanceof LocalizedError && error.translation.key === 'backup.error.tooLarge';

export async function downloadLibraryBackup() {
	await prepareWorkspaceExport();
	const keys = [app.key, readSavedKey()];
	let debug: { name: string; data: Uint8Array }[] = [];
	if (debugBackupEnabled())
		debug = await debugFiles(keys).catch((error: unknown) => {
			console.error('debug backup', error);
			return failedDebug(error, keys);
		});
	let result;
	try {
		result = await exportBackup(keys, debug);
	} catch (error) {
		if (!debug.length || !tooLarge(error)) throw error;
		debug = failedDebug(error, keys);
		try {
			result = await exportBackup(keys, debug);
		} catch (again) {
			if (!tooLarge(again)) throw again;
			// Even the note does not fit: the characters matter more than saying why the details are missing.
			console.warn('debug backup left out: the library alone fills the backup', again);
			debug = [];
			result = await exportBackup(keys);
		}
	}
	const date = new Date().toISOString().slice(0, 10);
	saveZip(result.bytes, `pixeldoll-${date}${debug.length ? '.debug' : ''}.backup.zip`);
	return result.hasOmissions;
}

export async function downloadLibraryBackupWithFeedback() {
	try {
		if (await downloadLibraryBackup())
			toast(message('librarySettings.backupOmissions'), { tone: 'warning' });
	} catch (error) {
		toast(errorMessage(error), { tone: 'danger', error });
	}
}
