// When a list's search field earns its place. Kept pure so the rule is testable without a DOM.
export function searchFieldVisible(input: {
	query: string;
	overflowing: boolean;
	total: number;
	minItems?: number;
	canSearch?: boolean;
}): boolean {
	// An active query always keeps its field, so it can be read and cleared.
	if (input.query !== '') return true;
	// A list with nothing to search (Wardrobe with only Empty and New tiles) never shows it, even when it scrolls.
	if (input.canSearch === false) return false;
	return input.overflowing || input.total >= (input.minItems ?? 6);
}
