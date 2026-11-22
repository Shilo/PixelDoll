import { beforeEach, describe, expect, it, test, vi } from 'vitest';
const { api, ApiError } = vi.hoisted(() => ({
	api: vi.fn(),
	ApiError: class ApiError extends Error {
		constructor(public status: number) {
			super('PixelLab error');
		}
	}
}));
vi.mock('../../src/lib/pixellab/client.ts', () => ({ api, ApiError }));
import {
	enhanceErrorMessage,
	enhancePrompt,
	enhanceRequest,
	EnhanceTooLong,
	pixenSize,
	trimStaticBoilerplate,
	type EnhanceSpec
} from '../../src/studio/promptEnhance.ts';

const character: EnhanceSpec = {
	kind: 'character',
	input: { image_size: { width: 96, height: 96 }, view: 'side' }
};
const activity = { scope: 'enhance:fixture', label: 'Enhance' };
beforeEach(() => api.mockReset());

describe('enhanceRequest', () => {
	it('sends a character the field text, or the prompt a Details field stands for', () => {
		expect(enhanceRequest(character, 'freckled elf')).toMatchObject({
			path: '/enhance-character-v3-prompt',
			body: { description: 'freckled elf', image_size: { width: 96, height: 96 }, view: 'side' }
		});
		expect(
			enhanceRequest({ ...character, description: 'freckled elf, slim build' }, 'freckled elf').body
		).toMatchObject({ description: 'freckled elf, slim build' });
	});
	it('describes an item alone on a transparent Pixen canvas of its own size', () => {
		expect(enhanceRequest({ kind: 'item', width: 90, height: 90 }, 'iron helmet')).toMatchObject({
			path: '/enhance-pixen-prompt',
			body: {
				description: 'iron helmet',
				image_size: { width: 92, height: 92 },
				no_background: true
			}
		});
	});
	it('sends a move its start frame, and its end frame only when there is one', () => {
		const motion: EnhanceSpec = {
			kind: 'motion',
			first: 'start',
			engine: 'pixminimax',
			frameCount: 8
		};
		expect(enhanceRequest(motion, 'walk', { first: 'start' }).body).toEqual({
			first_frame: { type: 'base64', base64: 'start', format: 'png' },
			action: 'walk',
			engine: 'pixminimax',
			frame_count: 8
		});
		expect(enhanceRequest(motion, 'walk', { first: 'start', last: 'end' }).body).toMatchObject({
			last_frame: { type: 'base64', base64: 'end', format: 'png' }
		});
	});
	it('describes a State as one V3 pose, toward the reference when there is one', () => {
		const pose: EnhanceSpec = { kind: 'pose', first: 'source' };
		expect(enhanceRequest(pose, 'raise fist', { first: 'source' }).body).toEqual({
			first_frame: { type: 'base64', base64: 'source', format: 'png' },
			action: 'raise fist',
			engine: 'v3',
			frame_count: 1
		});
		expect(
			enhanceRequest(pose, 'raise fist', { first: 'source', last: 'reference' }).body
		).toMatchObject({ last_frame: { base64: 'reference' } });
	});
});

describe('pixenSize', () => {
	it.each([
		[[90, 90], { width: 92, height: 92 }],
		[[10, 40], { width: 40, height: 40 }],
		[[24, 64], { width: 64, height: 64 }],
		[[64, 112], { width: 64, height: 112 }],
		[[768, 768], { width: 512, height: 512 }]
	])('%j becomes %j', ([width, height], size) => {
		expect(pixenSize(width, height)).toEqual(size);
	});
});

// Real answers from /enhance-animation-v3-prompt with engine v3 (recorded during live checks).
const ENDING =
	'Static camera, completely locked-off shot. Maintain the crisp 2D pixel art aesthetic, thick outlines, flat colors, and the strict original perspective throughout the entire fluid animation.';
describe('trimStaticBoilerplate', () => {
	it('drops the trailing camera and animation directions from a pose', () => {
		const pose =
			'The character slowly lifts both arms from their sides. The motion remains smooth, transitioning into a defensive, folded-arm stance.';
		expect(trimStaticBoilerplate(`${pose} ${ENDING}`)).toBe(pose);
	});
	it('keeps text without that ending exactly as written', () => {
		const text = 'A camera-facing pose with the fist held high. The chin is raised.';
		expect(trimStaticBoilerplate(text)).toBe(text);
	});
	it('keeps pose sentences that mention the camera, even right before the ending', () => {
		expect(
			trimStaticBoilerplate(
				'Bend both knees. Turn the face toward the camera. Static camera, completely locked-off shot.'
			)
		).toBe('Bend both knees. Turn the face toward the camera.');
	});
	it('keeps the text when it is nothing but the ending', () => {
		expect(trimStaticBoilerplate(ENDING)).toBe(ENDING);
	});
});

describe('enhancePrompt', () => {
	it('submits once and returns the enhanced text', async () => {
		api.mockResolvedValue({ enhanced_prompt: 'A freckled elf with pointed ears' });
		await expect(
			enhancePrompt(
				'fixture-key',
				character,
				'freckled elf',
				2000,
				new AbortController().signal,
				activity
			)
		).resolves.toBe('A freckled elf with pointed ears');
		expect(api).toHaveBeenCalledExactlyOnceWith(
			'fixture-key',
			'POST',
			'/enhance-character-v3-prompt',
			{ description: 'freckled elf', image_size: { width: 96, height: 96 }, view: 'side' },
			expect.any(AbortSignal),
			{ activityScope: 'enhance:fixture', label: 'Enhance' }
		);
	});
	it('trims a pose answer before checking its length', async () => {
		api.mockResolvedValue({ enhanced_prompt: `Fist raised high. ${ENDING}` });
		await expect(
			enhancePrompt(
				'fixture-key',
				{ kind: 'pose', first: 'source' },
				'raise fist',
				20,
				new AbortController().signal,
				activity
			)
		).resolves.toBe('Fist raised high.');
	});
	test.each([{}, { enhanced_prompt: '' }, { enhanced_prompt: 'a'.repeat(2001) }])(
		'rejects malformed or overlong output %j without retrying',
		async (response) => {
			api.mockResolvedValue(response);
			await expect(
				enhancePrompt('fixture-key', character, 'elf', 2000, new AbortController().signal, activity)
			).rejects.toBeInstanceOf(EnhanceTooLong);
			expect(api).toHaveBeenCalledTimes(1);
		}
	);
});

describe('enhanceErrorMessage', () => {
	it.each([
		[new ApiError(401), 'create.form.enhanceError.reconnect'],
		[new ApiError(402), 'create.form.enhanceError.credits'],
		[new ApiError(0), 'create.form.enhanceError.noAnswer'],
		[new ApiError(500), 'create.form.enhanceError.failedApi'],
		[new EnhanceTooLong(), 'create.form.tooLong']
	])('%s', (error, key) => {
		expect(enhanceErrorMessage(error)).toMatchObject({ key });
	});
});
