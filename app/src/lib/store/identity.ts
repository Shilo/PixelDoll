import { reservedPathSegment } from '../export/paths.ts';
import { LocalizedError } from '../message.ts';
import type { Item, Manifest } from './manifest.ts';

export const MAX_EXPORT_ID_LENGTH = 40;
export const validExportId = (id: string) =>
	id.length <= MAX_EXPORT_ID_LENGTH && /^[a-z0-9][a-z0-9_-]*$/.test(id) && !reservedPathSegment(id);

export function defaultCharacterExportId(recordId: string, name = 'character') {
	const label = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 27);
	return `${label || 'character'}_${recordId.replace(/[^a-z0-9]/g, '').slice(-12)}`;
}

export const itemExportId = (item: Pick<Item, 'id' | 'exportId'>) => item.exportId ?? item.id;

export function itemExportIdTaken(items: readonly Item[], itemId: string, exportId: string) {
	return items.some(
		(item) => !item.variantOf && item.id !== itemId && itemExportId(item) === exportId
	);
}

export function checkExportIdentity(manifest: Manifest) {
	const aliases = new Set<string>();
	if (manifest.exportId !== undefined) checkId(manifest.exportId);
	for (const item of manifest.items) {
		if (item.variantOf) continue;
		if (item.exportId !== undefined) checkId(item.exportId);
		const id = itemExportId(item);
		if (aliases.has(id)) throw duplicateExportId();
		aliases.add(id);
	}
}

function checkId(id: string) {
	if (typeof id !== 'string' || !validExportId(id))
		throw new LocalizedError('Invalid export ID.', 'renameSheet.invalidExportId');
}

export const duplicateExportId = () =>
	new LocalizedError('Another item uses this export ID.', 'renameSheet.duplicateExportId');

export function newItemExportId(items: readonly Item[], itemId: string): string | undefined {
	if (validExportId(itemId) && !itemExportIdTaken(items, itemId, itemId)) return undefined;
	const stem =
		itemId
			.replace(/[^a-z0-9_-]/g, '_')
			.replace(/^[^a-z0-9]+/, '')
			.slice(0, MAX_EXPORT_ID_LENGTH) || 'item';
	if (validExportId(stem) && !itemExportIdTaken(items, itemId, stem)) return stem;
	for (let index = 2; ; index++) {
		const suffix = `_${index}`;
		const candidate = `${stem.slice(0, MAX_EXPORT_ID_LENGTH - suffix.length)}${suffix}`;
		if (!itemExportIdTaken(items, itemId, candidate)) return candidate;
	}
}

export function itemContent({ name: _name, exportId: _exportId, ...content }: Item) {
	return content;
}

export function editIdentity(
	manifest: Manifest,
	projectId: string,
	itemId: string | undefined,
	name: string | undefined,
	exportId?: string
) {
	if (name !== undefined && (!name.trim() || name.trim().length > 60))
		throw new LocalizedError('Enter a name of 1–60 characters.', 'renameSheet.invalidName');
	const target = itemId
		? manifest.items.find((item) => item.id === itemId && !item.variantOf)
		: manifest;
	if (!target) throw new LocalizedError('The item no longer exists.', 'renameSheet.itemMissing');
	if (exportId !== undefined) {
		checkId(exportId);
		if (itemId && itemExportIdTaken(manifest.items, itemId, exportId)) throw duplicateExportId();
		target.exportId = exportId;
	} else if (!itemId) manifest.exportId ??= defaultCharacterExportId(projectId);
	if (name !== undefined) target.name = name.trim();
	return { name: target.name, exportId: target.exportId };
}
