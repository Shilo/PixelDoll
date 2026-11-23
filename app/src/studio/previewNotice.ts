import { message } from '../lib/message.ts';

export const PRE_RELEASE = true;

export const PREVIEW_NOTICE = {
	title: message('studio.previewTitle', { version: __APP_VERSION__ }),
	tone: 'warning',
	report: false
} as const;
