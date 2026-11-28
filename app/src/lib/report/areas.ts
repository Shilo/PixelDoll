/** Every English area name a problem report or its trail may print. A name outside this list is reported as PixelDoll, so a
 *  call site can never put free text there. */
export const AREA_NAMES = [
	'PixelDoll',
	'Characters',
	'Studio',
	'Inspect',
	'Connect PixelLab',
	'New character',
	'New item',
	'Export',
	'Activity',
	'Item View and edit',
	'Item generation',
	'Add a move',
	'Move review',
	'Generate items',
	'New state',
	'State review',
	'Edit appearance',
	'Rename',
	'Directions',
	'Import from file',
	'Import from PixelLab',
	'Delete',
	'Character View and edit',
	'Rig setup',
	'Settings',
	'Workspace copy',
	'Categories',
	'Frames',
	'Adjust frame',
	'Cost estimate',
	'Move View and edit'
] as const;
export type AreaName = (typeof AREA_NAMES)[number];
const KNOWN = new Set<string>(AREA_NAMES);
export const areaName = (value: unknown): AreaName | undefined =>
	typeof value === 'string' && KNOWN.has(value) ? (value as AreaName) : undefined;
