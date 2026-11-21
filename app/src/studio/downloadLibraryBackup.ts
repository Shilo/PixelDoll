import { app } from '../lib/app.svelte.ts';
import { readSavedKey } from '../lib/shared-auth.ts';
import { exportBackup } from '../lib/store/backup.ts';
import { saveZip } from './download.svelte.ts';
import { prepareWorkspaceExport } from './state.svelte.ts';

export async function downloadLibraryBackup() {
	await prepareWorkspaceExport();
	const result = await exportBackup([app.key, readSavedKey()]);
	const date = new Date().toISOString().slice(0, 10);
	saveZip(result.bytes, `pixeldoll-${date}.backup.zip`);
	return result.hasOmissions;
}
