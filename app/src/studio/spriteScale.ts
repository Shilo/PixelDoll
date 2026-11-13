/** CSS px per sprite px for a sprite drawn at k device px per sprite px, shrunk to fit `limit` if given (Sprite.svelte). */
export function spriteScale(k: number, w: number, h: number, dpr: number, limit?: number): number {
	const px = k / dpr;
	return px * (limit ? Math.min(1, limit / Math.max(w * px, h * px)) : 1);
}
