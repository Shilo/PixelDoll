import { afterEach, expect, it, vi } from 'vitest';
import {
	BannerError,
	bannerPrompt,
	enlargeBanner,
	generateBanner
} from '../../scripts/release/banner.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { decodePngBytes } from '../../src/lib/runtime/png.js';

const image = (w: number, h: number, alpha = 255) =>
	encodePngBytes({
		w,
		h,
		data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? alpha : i % 251))
	});
const reply = async (png: Uint8Array) =>
	Response.json({ image: { base64: Buffer.from(png).toString('base64') } });

afterEach(() => vi.unstubAllGlobals());

it('ends the scene with exactly one period inside the fixed frame', () => {
	for (const scene of ['A tailor fits a cape', 'A tailor fits a cape.', 'A tailor fits a cape ...'])
		expect(bannerPrompt(` ${scene} `)).toBe(
			'Wide, eye-level pixel-art scene in a cozy fantasy world. A tailor fits a cape. Crisp silhouettes and a clearly lit focal action. The setting fills the canvas to all four edges.'
		);
});

it('accepts only an opaque 320x160 picture and reports every PixelLab failure as a banner error', async () => {
	const fetch = vi.fn<typeof globalThis.fetch>();
	vi.stubGlobal('fetch', fetch);
	fetch.mockResolvedValueOnce(await reply(await image(320, 160)));
	await expect(generateBanner('A scene', '1.2.3', 'key')).resolves.toHaveLength(
		(await image(320, 160)).length
	);
	const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
	expect(body).toMatchObject({ image_size: { width: 320, height: 160 }, no_background: false });

	const failures: [Response | Error, RegExp][] = [
		[new Response('{}', { status: 401 }), /PIXELLAB_API_KEY was rejected/],
		[new Response('{}', { status: 402 }), /out of credits/],
		[new Response('{"code": 5000}', { status: 422 }), /declined the scene/],
		[new DOMException('timed out', 'TimeoutError'), /did not answer/],
		[await reply(await image(160, 80)), /is 160x80/],
		[await reply(await image(320, 160, 0)), /transparent/],
		[Response.json({}), /no image/]
	];
	for (const [answer, message] of failures) {
		if (answer instanceof Response) fetch.mockResolvedValueOnce(answer);
		else fetch.mockRejectedValueOnce(answer);
		const failure = generateBanner('A scene', '1.2.3', 'key');
		await expect(failure).rejects.toBeInstanceOf(BannerError);
		await expect(failure).rejects.toThrow(message);
	}
	// One request per attempt: a paid call is never retried.
	expect(fetch).toHaveBeenCalledTimes(failures.length + 1);
});

it('enlarges by whole pixels for GitHub', async () => {
	const small = await decodePngBytes(await image(3, 2));
	const large = await decodePngBytes(await enlargeBanner(await image(3, 2)));
	expect([large.w, large.h]).toEqual([12, 8]);
	for (let y = 0; y < 8; y++)
		for (let x = 0; x < 12; x++)
			expect([...large.data.subarray((y * 12 + x) * 4, (y * 12 + x) * 4 + 4)]).toEqual([
				...small.data.subarray(((y >> 2) * 3 + (x >> 2)) * 4, ((y >> 2) * 3 + (x >> 2)) * 4 + 4)
			]);
});
