export const PRE_RELEASE = true;

export const PREVIEW_NOTICE = {
	title: `Pre-release · v${__APP_VERSION__}`,
	risk: 'Saved characters may stop working after updates.',
	description: 'Export to keep a copy of your sprites.',
	tone: 'warning'
} as const;
