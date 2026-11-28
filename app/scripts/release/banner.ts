import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { decodePngBytes } from '../../src/lib/runtime/png.js';

/** The banner's art pixels: a 2:1 PixelLab Pixen scene, scaled 4x by whole pixels for GitHub. */
export const bannerSize = { width: 320, height: 160 };
export const bannerAssetName = 'banner@4x.png';
// Generous: Pixen usually answers in under a minute, but a busy account can take many times longer.
const pixenTimeout = 20 * 60_000;

/** A banner could not be generated; the release goes ahead with the default banner and says why. */
export class BannerError extends Error {}

/**
 * The exact request text: a fixed frame around Claude's one-sentence scene. Positive wording only: PixelLab's own
 * research found that naming what to avoid (text, logos) can draw it in.
 */
export function bannerPrompt(scene: string) {
	const sentence = scene.trim().replace(/[\s.!?]*$/, '.');
	return `Wide, eye-level pixel-art scene in a cozy fantasy world of clothes and costumes. ${sentence} Garments, fabrics and accessories fill the setting. Crisp silhouettes and a clearly lit focal action. The setting fills the canvas to all four edges.`;
}

/** The release's own banner when it has one, else the shared default `releases/banner.png`. */
export function bannerPath(folder: string, version: string) {
	const own = join(folder, version, 'banner.png');
	if (existsSync(own)) return own;
	const shared = join(folder, 'banner.png');
	if (!existsSync(shared)) throw new Error('The default banner releases/banner.png is missing');
	return shared;
}

const seedOf = (version: string) =>
	version.split('.').reduce((seed, part) => seed * 1000 + Number(part), 0) % 2_147_483_647;

/** Generates one banner with PixelLab Pixen. Every failure is a BannerError; nothing paid is ever retried. */
export async function generateBanner(scene: string, version: string, key: string) {
	let response: Response;
	let text: string;
	try {
		response = await fetch('https://api.pixellab.ai/v2/create-image-pixen', {
			method: 'POST',
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				description: bannerPrompt(scene),
				image_size: bannerSize,
				view: 'side',
				detail: 'highly detailed',
				no_background: false,
				enhance_prompt: false,
				seed: seedOf(version)
			}),
			signal: AbortSignal.timeout(pixenTimeout)
		});
		// The body arrives after the headers, so a dropped connection or the timeout can still strike here.
		text = await response.text();
	} catch (error) {
		throw new BannerError(`PixelLab did not answer: ${String(error)}`, { cause: error });
	}
	if (!response.ok) {
		const reason =
			response.status === 401
				? 'the PIXELLAB_API_KEY was rejected'
				: response.status === 402
					? 'the PixelLab account is out of credits'
					: response.status === 429 || response.status === 529
						? 'PixelLab is busy'
						: /"code"\s*:\s*5000/.test(text)
							? 'PixelLab declined the scene'
							: `PixelLab answered ${response.status}`;
		throw new BannerError(`${reason}: ${text.slice(0, 300)}`);
	}
	let base64: unknown;
	try {
		base64 = JSON.parse(text).image?.base64;
	} catch (error) {
		throw new BannerError(`PixelLab sent an unreadable reply: ${text.slice(0, 200)}`, {
			cause: error
		});
	}
	if (typeof base64 !== 'string') throw new BannerError('PixelLab sent no image');
	const png = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
	await checkBanner(png, 'PixelLab image');
	return new Uint8Array(png);
}

/** A banner must be the banner size and fully opaque; anything else would show as a broken or framed picture. */
export async function checkBanner(png: Uint8Array, what: string) {
	// The decoder ignores a tRNS chunk, which browsers honor as transparency in RGB and palette images.
	if (hasChunk(png, 'tRNS')) throw new BannerError(`${what} has transparent pixels`);
	let image;
	try {
		image = await decodePngBytes(png);
	} catch (error) {
		throw new BannerError(`${what} is not a readable PNG`, { cause: error });
	}
	if (image.w !== bannerSize.width || image.h !== bannerSize.height)
		throw new BannerError(
			`${what} is ${image.w}x${image.h}; banners are ${bannerSize.width}x${bannerSize.height}`
		);
	for (let i = 3; i < image.data.length; i += 4)
		if (image.data[i] !== 255) throw new BannerError(`${what} has transparent pixels`);
}

/** The 4x copy GitHub shows: GitHub smooths scaled images, so it gets whole-pixel enlarged art. */
export async function enlargeBanner(png: Uint8Array) {
	const image = await decodePngBytes(png);
	const w = image.w * 4,
		h = image.h * 4,
		data = new Uint8Array(w * h * 4);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const from = ((y >> 2) * image.w + (x >> 2)) * 4;
			data.set(image.data.subarray(from, from + 4), (y * w + x) * 4);
		}
	return encodePng(w, h, data);
}

function hasChunk(png: Uint8Array, type: string) {
	const bytes = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
	for (let at = 8; at + 8 <= bytes.length; at += 12 + bytes.readUInt32BE(at)) {
		const name = bytes.toString('latin1', at + 4, at + 8);
		if (name === type) return true;
		if (name === 'IEND') return false;
	}
	return false;
}

export const readBanner = (path: string) => new Uint8Array(readFileSync(path));

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc(bytes: Uint8Array) {
	let c = 0xffffffff;
	for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, 'latin1');
	out.set(data, 8);
	out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}
// The app's PNG encoder (src/lib/image/pngraw.ts) imports app modules Node cannot run, so the release script keeps
// this minimal RGBA encoder.
function encodePng(w: number, h: number, rgba: Uint8Array) {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(w, 0);
	header.writeUInt32BE(h, 4);
	header[8] = 8;
	header[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h);
	for (let y = 0; y < h; y++)
		raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
	return new Uint8Array(
		Buffer.concat([
			Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
			chunk('IHDR', header),
			chunk('IDAT', deflateSync(raw)),
			chunk('IEND', new Uint8Array())
		])
	);
}
