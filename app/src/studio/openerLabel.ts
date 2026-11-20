export function openerLabel(label: string): string {
	return label.trimEnd().replace(/(?:\.{3,}|…)+$/u, '') + '...';
}
