export * from 'file:///<REPO>/app/src/lib/pixellab/queue.ts?real';
(globalThis as any).__jobs ??= [];
export const queue = { role: 'solo', subscribe(cb: (s: any) => void) { cb({ jobs: (globalThis as any).__jobs }); return () => {}; } };
