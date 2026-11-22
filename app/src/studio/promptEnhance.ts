// Which PixelLab enhancer each prompt uses, and how its request and answer are shaped. PromptField runs it; this
// module stays free of the DOM so every request and the static-pose trimming are unit tested.
import type { Img } from '../lib/image/png.ts';
import { api, ApiError } from '../lib/pixellab/client.ts';
import {
	png,
	routes,
	type EnhanceCharacterV3Prompt,
	type EnhancedCharacterV3Prompt
} from '../lib/pixellab/routes.ts';
import { errorMessage, message, type Message } from '../lib/message.ts';
import { b64 } from './create.ts';

export type EnhanceView = 'low top-down' | 'high top-down' | 'side';
/** A PNG as base64, or an image still to encode when Enhance is pressed. */
export type EnhanceImage = string | Img;

export type EnhanceSpec =
	/** A new character: text only (PixelLab's character enhancer takes no image). */
	| {
			kind: 'character';
			input: Omit<EnhanceCharacterV3Prompt, 'description'>;
			/** The text sent instead of the field's own, such as the whole prompt behind a Details field. */
			description?: string;
	  }
	/** An item, described on its own transparent canvas: text only. */
	| { kind: 'item'; width: number; height: number; view?: EnhanceView }
	/** A move: the motion from the start frame, toward the end frame when there is one. */
	| {
			kind: 'motion';
			first: EnhanceImage;
			last?: EnhanceImage;
			engine: 'v3' | 'pixminimax' | 'skeleton-v3';
			frameCount: number;
	  }
	/** A State: one still pose changed from the source frame, toward the reference when there is one. */
	| { kind: 'pose'; first: EnhanceImage; last?: EnhanceImage };

/** The longest text each enhancer accepts. */
export const ENHANCE_INPUT_LIMIT: Record<EnhanceSpec['kind'], number> = {
	character: 2000,
	item: 2000,
	motion: 500,
	pose: 500
};

/** Pixen sizes: a multiple of 4 from 16, no larger than 512×512 in area, and square when either side is below 32. */
export function pixenSize(width: number, height: number): { width: number; height: number } {
	const side = (value: number) => Math.max(16, Math.ceil(value / 4) * 4);
	let w = side(width),
		h = side(height);
	if (w < 32 || h < 32) w = h = Math.max(w, h);
	const scale = Math.sqrt((512 * 512) / (w * h));
	if (scale < 1) {
		w = Math.max(16, Math.floor((w * scale) / 4) * 4);
		h = Math.max(16, Math.floor((h * scale) / 4) * 4);
	}
	return { width: w, height: h };
}

/** The request for `text`, with any images already encoded as base64 PNG. */
export function enhanceRequest(
	spec: EnhanceSpec,
	text: string,
	images: { first?: string; last?: string } = {}
) {
	switch (spec.kind) {
		case 'character':
			return routes.enhanceCharacterV3Prompt({
				...spec.input,
				description: spec.description ?? text
			});
		case 'item':
			return routes.enhancePixenPrompt({
				description: text,
				image_size: pixenSize(spec.width, spec.height),
				no_background: true,
				...(spec.view ? { view: spec.view } : {})
			});
		case 'motion':
		case 'pose':
			if (!images.first) throw new Error('Enhance needs the start frame.');
			return routes.enhanceAnimationV3Prompt({
				first_frame: png(images.first),
				...(images.last ? { last_frame: png(images.last) } : {}),
				action: text,
				// A State is one still pose, described in full by V3 rather than as a motion caption.
				engine: spec.kind === 'pose' ? 'v3' : spec.engine,
				frame_count: spec.kind === 'pose' ? 1 : spec.frameCount
			});
	}
}

// The animation enhancer always closes with camera and style directions for a moving shot. A still pose drops that
// trailing run of sentences; anything else, including camera words earlier in the text, is kept as written.
const BOILERPLATE = [
	/^static camera\b/i,
	/^(completely )?locked-off shot\b/i,
	/^maintain the (crisp|original|strict)\b.*\b(aesthetic|perspective|style)\b/i
];
export function trimStaticBoilerplate(text: string): string {
	const sentences = text.trim().match(/[^.!?]+[.!?]*\s*/g) ?? [];
	let end = sentences.length;
	while (end > 0 && BOILERPLATE.some((pattern) => pattern.test(sentences[end - 1].trim()))) end--;
	return end && end < sentences.length ? sentences.slice(0, end).join('').trim() : text;
}

const encode = async (image: EnhanceImage | undefined) =>
	image === undefined ? undefined : typeof image === 'string' ? image : await b64(image);

/** Foreground, single submission: never retried, since an ambiguous answer may already be paid. */
export async function enhancePrompt(
	key: string,
	spec: EnhanceSpec,
	text: string,
	maxOutput: number,
	signal: AbortSignal,
	activity: { scope: string; label: string }
): Promise<string> {
	const first = 'first' in spec ? await encode(spec.first) : undefined;
	const last =
		'last' in spec ? (spec.last === spec.first ? first : await encode(spec.last)) : undefined;
	const request = enhanceRequest(spec, text, { first, last });
	const result = await api<EnhancedCharacterV3Prompt>(
		key,
		request.method,
		request.path,
		request.body,
		AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
		{ activityScope: activity.scope, label: activity.label }
	);
	const raw = typeof result?.enhanced_prompt === 'string' ? result.enhanced_prompt.trim() : '';
	if (!raw) throw new EnhanceTooLong();
	const enhanced = spec.kind === 'pose' ? trimStaticBoilerplate(raw) : raw;
	if (Array.from(enhanced).length > maxOutput) throw new EnhanceTooLong();
	return enhanced;
}

export class EnhanceTooLong extends Error {
	constructor() {
		super('The enhanced text is too long.');
	}
}

/** What to tell the user when Enhance fails; their text is always kept. */
export function enhanceErrorMessage(error: unknown): Message | string {
	if (error instanceof EnhanceTooLong) return message('create.form.tooLong');
	if (error instanceof ApiError)
		return error.status === 401
			? message('create.form.enhanceError.reconnect')
			: error.status === 402
				? message('create.form.enhanceError.credits')
				: error.status === 0
					? message('create.form.enhanceError.noAnswer')
					: message('create.form.enhanceError.failedApi');
	return error instanceof Error ? errorMessage(error) : message('create.form.enhanceError.failed');
}
