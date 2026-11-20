export type MoveAnimationModel = 'skeleton-v3' | 'v3' | 'pixminimax';

export type MoveAnimationOptions = { model: MoveAnimationModel; frameCount?: number };

export function moveFrameCounts(model: MoveAnimationModel, canvasSize: number): number[] {
	if (!Number.isInteger(canvasSize) || canvasSize < 1 || canvasSize > 256) return [];
	if (model === 'skeleton-v3') return Array.from({ length: 13 }, (_, index) => index + 3);
	if (model === 'pixminimax') return Array.from({ length: 10 }, (_, index) => (index + 1) * 4);
	if (model !== 'v3') return [];
	return [4, 6, 8, 10, 12, 14, 16].filter((count) => canvasSize * canvasSize * count <= 524_288);
}

export function defaultMoveFrameCount(
	model: MoveAnimationModel,
	canvasSize: number,
	preferred: number
): number {
	const counts = moveFrameCounts(model, canvasSize);
	return counts.reduce(
		(best, count) => (Math.abs(count - preferred) < Math.abs(best - preferred) ? count : best),
		counts[0] ?? preferred
	);
}
