// Remove this module and its Studio import/call when PixelDoll leaves preview.
import { message } from '../lib/message.ts';

export const PREVIEW_NOTICE = {
	title: message('studio.previewTitle', { version: __APP_VERSION__ }),
	tone: 'warning'
} as const;
