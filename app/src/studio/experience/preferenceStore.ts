// One JSON preference document in this browser, such as Mount or Live Views. Storage is optional: an unreadable or
// blocked store leaves the parsed defaults in place. A workspace copy keeps its own in memory, like the other Studio
// preferences, and never follows other tabs.
import { copyPreferences, workspaceCopy } from '../../lib/store/workspace-mode.ts';

export interface PreferenceStore<T> {
	key: string;
	read(): T;
	/**
	 * Applies one change to what is saved now, not to this tab's snapshot, so another tab's choices survive. Returns the
	 * result and whether the browser saved it; an unsaved change still applies for this session.
	 */
	update(
		change: (current: T) => T,
		/** What to build on instead of storage, when this tab holds choices storage refused. */
		base?: T
	): { preferences: T; saved: boolean };
	/** Calls `changed` when another tab saves this document; returns the stop function. */
	watch(changed: () => void): () => void;
}

/** `parse` validates every field on its own, so one bad value never discards the others; it must accept null. */
export function preferenceStore<T>(
	key: string,
	parse: (text: string | null) => T
): PreferenceStore<T> {
	const read = () => {
		try {
			return parse(workspaceCopy ? (copyPreferences.get(key) ?? null) : localStorage.getItem(key));
		} catch {
			return parse(null);
		}
	};
	return {
		key,
		read,
		update(change, base) {
			const current = base ?? read();
			const preferences = change(current);
			// Unchanged, nothing is written, so another tab's newer save is never overwritten with this read.
			if (preferences === current) return { preferences, saved: !base };
			const text = JSON.stringify(preferences);
			try {
				if (workspaceCopy) copyPreferences.set(key, text);
				else localStorage.setItem(key, text);
				return { preferences, saved: true };
			} catch {
				return { preferences, saved: false };
			}
		},
		watch(changed) {
			if (workspaceCopy) return () => {};
			const sync = (event: StorageEvent) => {
				if (event.key !== key && event.key !== null) return;
				try {
					if (event.storageArea !== localStorage) return;
				} catch {
					return;
				}
				changed();
			};
			addEventListener('storage', sync);
			return () => removeEventListener('storage', sync);
		}
	};
}

/** A plain object, or an empty one for anything else. */
export const asObject = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

/** A JSON object, or an empty one for anything else. */
export function parseObject(text: string | null): Record<string, unknown> {
	try {
		return asObject(JSON.parse(text ?? 'null'));
	} catch {
		return {};
	}
}
