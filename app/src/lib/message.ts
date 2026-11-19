import type { WhisperKey, WhisperVars } from 'svelte-whisper';

export interface Message {
	key: WhisperKey;
	vars?: WhisperVars;
}

export function message(key: WhisperKey, vars?: WhisperVars): Message {
	return { key, vars };
}

export class LocalizedError extends Error {
	readonly translation: Message;

	constructor(english: string, key: WhisperKey, vars?: WhisperVars) {
		super(english);
		this.translation = message(key, vars);
	}
}

export function errorTranslation(error: unknown): Message | undefined {
	return error instanceof LocalizedError ? error.translation : undefined;
}

export function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function errorMessage(error: unknown): Message | string {
	return errorTranslation(error) ?? errorText(error);
}
