import { workspaceCopy } from '../lib/store/workspace-mode.ts';

const key = 'pixeldoll.developerMode';

function read() {
	try {
		return localStorage.getItem(key) === '1';
	} catch {
		return false;
	}
}

let enabled = $state(read());
export const developerModeEnabled = () => enabled;
export const localDeveloperToolsEnabled = () => import.meta.env.DEV && !workspaceCopy && enabled;

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
		if (event.storageArea === localStorage && (event.key === key || event.key === null))
			enabled = read();
	};
	addEventListener('storage', sync);
	return () => removeEventListener('storage', sync);
}
