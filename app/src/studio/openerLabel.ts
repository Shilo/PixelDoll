export function openerLabel(label: string): string {
	return label.trimEnd().replace(/(?:\.{3,}|…+)$/u, '') + '...';
}

export function openerName(name: string): string {
	return name.endsWith('...') ? name : name + '...';
}
