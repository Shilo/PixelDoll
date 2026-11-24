// Device-local developer switches, read without Svelte so the boot-time debug log can check them.
import { workspaceCopy } from '../store/workspace-mode.ts';

export const DEVELOPER_MODE_KEY = 'pixeldoll.developerMode';
export const DEBUG_BACKUP_KEY = 'pixeldoll.debugBackup';

export function readFlag(key: string): boolean {
	try {
		return localStorage.getItem(key) === '1';
	} catch {
		return false;
	}
}

/** Backups carry debugging details, and the debug log is kept across reloads, only while both switches are on. */
export const debugBackupEnabled = () =>
	!workspaceCopy && readFlag(DEVELOPER_MODE_KEY) && readFlag(DEBUG_BACKUP_KEY);

/** Where a backup carries debugging details; restore skips it. */
export const DEBUG_FOLDER = 'debug/';
