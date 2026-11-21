import { app } from '../lib/app.svelte.ts';
import { errorMessage } from '../lib/i18n.ts';
import { message } from '../lib/message.ts';
import { readSavedKey } from '../lib/shared-auth.ts';
import { exportBackup } from '../lib/store/backup.ts';
import { saveZip } from './download.svelte.ts';
import { prepareWorkspaceExport, toast } from './state.svelte.ts';

export async function downloadLibraryBackup() {
	await prepareWorkspaceExport();
	const result = await exportBackup([app.key, readSavedKey()]);
	const date = new Date().toISOString().slice(0, 10);
	saveZip(result.bytes, `pixeldoll-${date}.backup.zip`);
	return result.hasOmissions;
}

export async function downloadLibraryBackupWithFeedback() {
	try {
		if (await downloadLibraryBackup())
			toast(message('librarySettings.backupOmissions'), { tone: 'warning' });
	} catch (error) {
		toast(errorMessage(error), { tone: 'danger' });
	}
}
