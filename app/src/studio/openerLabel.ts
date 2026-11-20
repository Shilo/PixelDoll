export function openerLabel(label: string): string {
	const trimmed = label.trimEnd();
	return trimmed.endsWith('…') ? trimmed.slice(0, -1) + '...' : openerName(trimmed);
}

export function openerName(name: string): string {
	return name.endsWith('...') ? name : name + '...';
}
