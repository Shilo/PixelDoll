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

/** Whether two messages are the same stop: one code with the same values. */
export const sameMessage = (a: Message | string | undefined, b: Message | string | undefined) =>
	!!a &&
	!!b &&
	typeof a !== 'string' &&
	typeof b !== 'string' &&
	a.key === b.key &&
	JSON.stringify(a.vars ?? {}) === JSON.stringify(b.vars ?? {});

/** An error's typed code: its catalog key. Recovery routes on this, never on message text. */
export const errorKey = (error: unknown): WhisperKey | undefined => errorTranslation(error)?.key;

export function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function errorMessage(error: unknown): Message | string {
	return errorTranslation(error) ?? errorText(error);
}

/** A translated error as a stored log keeps it: its Message, with the English text for code that needs words without the
 *  i18n runtime (an error rebuilt from the log, a developer page). */
export interface LoggedMessage extends Message {
	text: string;
	/** A paid call that stopped (1-based): its outcome is read from that call's record when shown. */
	call?: number;
}
export const loggedMessage = (error: LocalizedError): LoggedMessage => ({
	...error.translation,
	text: error.message
});
/** The error a log entry describes, keeping its translation. */
export const loggedError = (entry: string | LoggedMessage): Error =>
	typeof entry === 'string'
		? new Error(entry)
		: new LocalizedError(entry.text, entry.key, entry.vars);
