// Code loaded on first use (sheets, the paid pipelines) stays out of the startup bundle. A failed chunk load (offline, or a
// deploy replaced the file) becomes a LoadError. It is not a generation failure: paid flows keep
// their saved state so a reload resumes them.
import { LocalizedError } from './message.ts';

export class LoadError extends LocalizedError {
	// Literal, so a minified build still reports it by name.
	override name = 'LoadError';
	/** The import's own failure: a problem report names its type and the file it asked for. */
	constructor(cause?: unknown) {
		super('Part of PixelDoll could not load. Reload to try again.', 'common.loadFailed');
		if (cause !== undefined) this.cause = cause;
	}
}
export const lazy = <T>(load: () => Promise<T>) =>
	load().catch((e: unknown) => {
		console.error(e);
		throw new LoadError(e);
	});
