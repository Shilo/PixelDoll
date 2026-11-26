/** Every tip, in priority order (catalog.svelte.ts defines each). Plain data, so tests can mark them done. */
export const TIP_IDS = [
	'customize',
	'new-character',
	'pixellab',
	'gear',
	'export',
	'add-item',
	'generate-items',
	'add-move',
	'add-state'
] as const;
export type TipId = (typeof TIP_IDS)[number];
