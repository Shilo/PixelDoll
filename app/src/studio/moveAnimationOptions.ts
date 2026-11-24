import type { ImageReference } from '../lib/image/reference.ts';
import { actionOf } from '../lib/rig/clips.ts';
import { MOVE_TEMPLATES } from '../lib/pixellab/routes.ts';
import type { DirectionName } from '../lib/store/manifest.ts';

export type MoveAnimationModel = 'skeleton-v3' | 'v3' | 'pixminimax';

export type MoveFrameReferences<Image = ImageReference> = Partial<
	Record<DirectionName, { start?: Image; end?: Image | null }>
>;

export type MoveAnimationOptions = {
	model: MoveAnimationModel;
	frameCount?: number;
	loop?: boolean;
	references?: MoveFrameReferences;
};

export const gaitTemplate = (action?: string) => action === 'walk' || action === 'run';
/** A qualified template's own loop setting, else the rule for moves without a template. */
export const templateLoops = (action?: string) =>
	action && Object.hasOwn(MOVE_TEMPLATES, action)
		? MOVE_TEMPLATES[action].loop
		: action === 'idle' || gaitTemplate(action);

export function moveTemplatePrompt(action: string, loop = templateLoops(action)): string {
	// A template that is not a gait needs its own prompt: `actionOf` would name its Walk-like id "walking".
	const own = MOVE_TEMPLATES[action]?.prompt;
	if (own) return own;
	const prompt = actionOf(action);
	return gaitTemplate(action) && loop
		? `${prompt}, continuous even strides, no stopping or settling into a standing pose`
		: prompt;
}

export function automaticMoveEnd(loop: boolean | undefined): boolean {
	return !!loop;
}

export function moveReferenceEnd<Image>(
	references: { end?: Image | null } | undefined,
	loop: boolean | undefined,
	start: Image
): Image | undefined {
	return references?.end === undefined
		? automaticMoveEnd(loop)
			? start
			: undefined
		: (references.end ?? undefined);
}

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
