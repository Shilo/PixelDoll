// Remove this module and its Studio import/call when PixelDoll leaves preview.
export const PREVIEW_NOTICE = {
	title: `Beta version · v${__APP_VERSION__}`,
	risk: 'Saved characters may stop working after updates.',
	description: 'Export to keep a copy of your sprites.',
	tone: 'warning'
} as const;
