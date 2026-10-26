// Code loaded on first use (sheets, the paid pipelines) stays out of the startup bundle. A failed chunk load (offline, or a
// deploy replaced the file) becomes a LoadError with one plain message. It is not a generation failure: paid flows keep
// their saved state so a reload resumes them.
export class LoadError extends Error {}
export const lazy = <T>(load: () => Promise<T>) => load().catch((e: unknown) => {
  console.error(e);
  throw new LoadError('Part of PixelDoll could not load. Reload to try again.');
});
