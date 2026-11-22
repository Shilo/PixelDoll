import { t } from 'svelte-whisper';
import { displayMessage } from '../lib/i18n.ts';
import { doc } from './state.svelte.ts';

/** "Undo <step>" / "Redo <step>" for the next history step, or undefined when that stack is empty. Read it in a
 *  reactive context: it follows the open character's history. */
export function historyText(kind: 'undo' | 'redo'): string | undefined {
	const label = doc[kind].at(-1)?.label;
	return label
		? t(kind === 'undo' ? 'toolbar.undoAction' : 'toolbar.redoAction', {
				action: displayMessage(label)
			})
		: undefined;
}
