// Paging inside one sheet (New item, New move and New State to their Import page), as Export pages to its Settings: the new
// page starts at the top and coming back returns to where the form was; focus lands on the page title going in and on the
// opener it left from coming back.
import { tick } from 'svelte';

let formScroll = 0;
const openSheet = () => document.querySelector<HTMLDialogElement>('dialog.sheet[open]');

/** Call before the page changes: remembers where the form was scrolled. */
export function leaveSheetForm() {
	formScroll = openSheet()?.querySelector('.sheet-body')?.scrollTop ?? 0;
}

export async function showSheetPage(inner: boolean) {
	await tick();
	const dialog = openSheet();
	dialog?.querySelector('.sheet-body')?.scrollTo(0, inner ? 0 : formScroll);
	const target = inner
		? dialog?.querySelector<HTMLElement>('.sheet-title')
		: (dialog?.querySelector<HTMLElement>('.sheet-start .surface-opener') ??
			dialog?.querySelector<HTMLElement>('.sheet-start button'));
	target?.focus({ preventScroll: true });
}
