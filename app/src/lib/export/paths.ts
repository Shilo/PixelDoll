export const reservedPathSegment = (name: string) =>
	/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name);

export const portableAssetName = (name: string) =>
	reservedPathSegment(name) ? name.replace(/^[^.]+/, '$&_') : name;

export const portablePathId = (id: string) => (reservedPathSegment(id) ? `_${id}` : id);

export const bakedSheetPath = (presetId: string, animationId: string) =>
	`baked/${portablePathId(presetId)}/${portablePathId(animationId)}.png`;
