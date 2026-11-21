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

/** An app-side check that warns before a paid request the provider would accept. The user may generate anyway, explicitly
 *  and with the warning and cost shown; a hard stop stays a plain LocalizedError. */
export class PreflightWarning extends LocalizedError {
	constructor(
		readonly id: string,
		english: string,
		key: WhisperKey,
		vars?: WhisperVars
	) {
		super(english, key, vars);
	}
}
/** Issues still blocking a request: hard stops, and warnings the user has not accepted by id. */
export const blockingIssues = <T>(issues: readonly T[], accepted: readonly string[] = []): T[] =>
	issues.filter((issue) => !(issue instanceof PreflightWarning && accepted.includes(issue.id)));

export function errorTranslation(error: unknown): Message | undefined {
	return error instanceof LocalizedError ? error.translation : undefined;
}

export function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function errorMessage(error: unknown): Message | string {
	return errorTranslation(error) ?? errorText(error);
}
