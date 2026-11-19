import type en from './locales/en.json';

declare module 'svelte-whisper' {
	interface Register {
		dictionary: typeof en;
	}
}
