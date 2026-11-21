import { t, type WhisperKey } from 'svelte-whisper';
import { moveLabel } from './model.ts';

const labels: Readonly<Record<string, WhisperKey>> = {
	default: 'moveNames.default',
	idle: 'moveNames.idle',
	walk: 'moveNames.walk'
};

export function displayMove(id: string, ids: readonly string[] = []): string {
	const label = moveLabel(id, ids);
	if (id === 'standing' && ids.includes('default') && label === moveLabel(id))
		return `${label} (${id})`;
	return Object.hasOwn(labels, id) && !label.endsWith(` (${id})`) ? t(labels[id]) : label;
}
