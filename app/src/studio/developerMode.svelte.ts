import { DEBUG_BACKUP_KEY, DEVELOPER_MODE_KEY as key, readFlag } from '../lib/debug/flags.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';

const read = () => readFlag(key);

let enabled = $state(read());
let debugDetails = $state(readFlag(DEBUG_BACKUP_KEY));
export const developerModeEnabled = () => enabled;
export const localDeveloperToolsEnabled = () => import.meta.env.DEV && !workspaceCopy && enabled;

/** The Include debugging details switch (Settings > Library) as saved, whether or not Developer mode is on. */
export const debugDetailsSaved = () => debugDetails;
/** Library backups add debug/ (lib/debug/bundle.ts): Developer mode and the switch are on, outside a workspace copy. */
export const debugBackupOn = () => enabled && debugDetails && !workspaceCopy;

export function setDebugDetails(value: boolean) {
	debugDetails = value;
	try {
		if (value) localStorage.setItem(DEBUG_BACKUP_KEY, '1');
		else localStorage.removeItem(DEBUG_BACKUP_KEY);
		return true;
	} catch {
		debugDetails = readFlag(DEBUG_BACKUP_KEY);
		return false;
	}
}

export function setDeveloperMode(value: boolean) {
	enabled = value;
	try {
		if (value) localStorage.setItem(key, '1');
		else localStorage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}

export function watchDeveloperMode() {
	const sync = (event: StorageEvent) => {
		if (event.storageArea !== localStorage) return;
		if (event.key === key || event.key === null) enabled = read();
		// The backup reads the saved switch, so every tab must show what it will do.
		if (event.key === DEBUG_BACKUP_KEY || event.key === null)
			debugDetails = readFlag(DEBUG_BACKUP_KEY);
	};
	addEventListener('storage', sync);
	return () => removeEventListener('storage', sync);
}
