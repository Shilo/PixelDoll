import { parseObject, preferenceStore } from './preferenceStore.ts';

export type PanelSide = 'left' | 'right';

const store = preferenceStore(
	'pixeldoll.studioPanel',
	(
		text
	): {
		side: PanelSide;
		autoHide: boolean;
	} => {
		const value = parseObject(text);
		return { side: value.side === 'left' ? 'left' : 'right', autoHide: value.autoHide !== false };
	}
);

export const panelSettings = $state(store.read());
let unsaved = false;

export function setPanelSettings(change: Partial<typeof panelSettings>) {
	const result = store.update(
		(current) => ({ ...current, ...change }),
		unsaved ? $state.snapshot(panelSettings) : undefined
	);
	Object.assign(panelSettings, result.preferences);
	unsaved = !result.saved;
	return result.saved;
}

export function watchPanelSettings() {
	return store.watch(() => {
		Object.assign(panelSettings, store.read());
		unsaved = false;
	});
}
