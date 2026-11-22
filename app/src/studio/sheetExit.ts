// The open sheets' and alerts' exits, so browser Back (and the Android back gesture) follows the same path as the
// topmost one's own controls: an alert takes its safe choice, a sheet's inner pane steps back, otherwise the sheet's
// close request runs (which may first ask to discard changes).
export type SheetExit = {
	/** Present while an inner pane can step back. */
	readonly back?: () => void;
	/** The same request as the X (a sheet) or the safe choice (an alert), Escape and the backdrop. */
	close(): void;
	/** A confirm alert over the sheet: it answers Back even while the sheet below is saving. */
	readonly alert?: boolean;
};

const stack: SheetExit[] = [];

/** Registers a mounted sheet or alert on top; the returned function releases it. */
export function claimSheetExit(exit: SheetExit): () => void {
	stack.push(exit);
	return () => {
		const index = stack.lastIndexOf(exit);
		if (index >= 0) stack.splice(index, 1);
	};
}

export const alertOnTop = () => !!stack.at(-1)?.alert;

/** Browser Back while a sheet is open. Returns false when nothing claimed its exits. */
export function sheetBrowserBack(): boolean {
	const top = stack.at(-1);
	if (!top) return false;
	if (top.back) top.back();
	else top.close();
	return true;
}
