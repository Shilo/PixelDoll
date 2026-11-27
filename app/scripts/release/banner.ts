import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import { composeCell, layerFrame } from '../../src/lib/runtime/paperdoll.js';
import { decodePngBytes } from '../../src/lib/runtime/png.js';
import type {
	DirectionName,
	Img,
	Manifest,
	Project,
	Sha256
} from '../../src/lib/runtime/types.d.ts';

const fixture = new URL('../../public/fixtures/s2/', import.meta.url);
const width = 160;
const height = 112;
const leather = { torso_inner: 'vest_leather' };
const caped = { ...leather, back: 'cape_red' };
const fighter = { ...leather, main_hand: 'sword_steel', head: 'helmet_steel' };
const outfits: Record<string, string>[] = [
	caped,
	{ ...caped, hair: 'hair_brown' },
	fighter,
	{ ...fighter, back: 'cape_red' },
	{ ...caped, head: 'hat_wizard' }
];
const poses: { move: string; direction: DirectionName; cell: number; hats?: true }[] = [
	{ move: 'walk', direction: 'south', cell: 0, hats: true },
	{ move: 'walk', direction: 'south', cell: 4, hats: true },
	{ move: 'walk', direction: 'east', cell: 2, hats: true },
	{ move: 'walk', direction: 'west', cell: 5, hats: true },
	{ move: 'walk', direction: 'north', cell: 6 },
	{ move: 'cross-punch', direction: 'south', cell: 3 }
];
const colors = ['#252235', '#203843', '#3b2837', '#273a32', '#3d3029'];
const candidates = outfits.flatMap((outfit) =>
	poses
		.filter((pose) => outfit.head !== 'hat_wizard' || pose.hats)
		.flatMap((pose) => colors.map((color) => ({ outfit, ...pose, color })))
);

export function bannerChoices(version: string) {
	const first = createHash('sha256').update(version).digest().readUInt32BE() % candidates.length;
	return [...candidates.slice(first), ...candidates.slice(0, first)];
}

// The fixture sheets store columns by cell and rows by generated direction. The shared compositor handles
// equipment, pivot, layer order and mirrored directions after we register the selected slice from each sheet.
async function dollFrame(manifest: Manifest, choice: (typeof candidates)[number]) {
	const { outfit, move, direction, cell } = choice;
	const generated = manifest.rig.directions.filter((entry) => !entry.mirrorOf);
	const source =
		manifest.rig.directions.find((entry) => entry.id === direction)?.mirrorOf ?? direction;
	const row = generated.findIndex((entry) => entry.id === source);
	if (row < 0) throw new Error(`Unknown release banner fixture direction ${direction}`);
	const items = manifest.items.filter(
		(item) => item.id === manifest.rig.baseItem || outfit[item.slot] === item.id
	);
	if (
		!items.some((item) => item.id === manifest.rig.baseItem) ||
		Object.values(outfit).some((id) => !items.some((item) => item.id === id))
	)
		throw new Error('Release banner outfit is missing from the fixture');
	const images = new Map<Sha256, Img>();
	const project: Project = { manifest: { ...manifest, items: structuredClone(items) }, images };
	for (const item of project.manifest.items) {
		for (const layer of item.layers) {
			const sheet = layer.sheets?.[move];
			if (!sheet || (item.coverage && !item.coverage.includes(`${move}/${source}/${cell}`)))
				throw new Error(
					`Release banner fixture lacks ${item.id} artwork for ${move}/${source}/${cell}`
				);
			const image = await decodePngBytes(await readFile(new URL(sheet, fixture)));
			const { w, h } = layerFrame(manifest.rig, layer);
			const data = new Uint8ClampedArray(w * h * 4);
			if (image.w < (cell + 1) * w || image.h < (row + 1) * h)
				throw new Error(`Release banner frame is outside ${sheet}`);
			for (let y = 0; y < h; y++) {
				const offset = ((row * h + y) * image.w + cell * w) * 4;
				data.set(image.data.subarray(offset, offset + w * 4), y * w * 4);
			}
			const id = `sha256:${createHash('sha256').update(data).digest('hex')}` as const;
			const frames = new Array<Sha256 | null>(cell + 1).fill(null);
			frames[cell] = id;
			layer.cells = { [move]: { [source]: frames } };
			images.set(id, { data, w, h });
		}
	}
	return composeCell(project, outfit, move, direction, cell);
}

async function scaleBanner(page: Page, native: Uint8Array) {
	const png = await page.evaluate(
		async ({ data, width, height }) => {
			const image = new Image();
			image.src = `data:image/png;base64,${data}`;
			await image.decode();
			if (image.width !== width || image.height !== height)
				throw new Error('Unexpected native release banner size');
			const canvas = document.createElement('canvas');
			canvas.width = width * 4;
			canvas.height = height * 4;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Cannot scale the release banner without a canvas');
			context.imageSmoothingEnabled = false;
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			return canvas.toDataURL('image/png').split(',')[1];
		},
		{ data: Buffer.from(native).toString('base64'), width, height }
	);
	return Buffer.from(png, 'base64');
}

export async function upscaleBanner(native: Uint8Array) {
	const browser = await chromium.launch();
	try {
		return await scaleBanner(await browser.newPage(), native);
	} finally {
		await browser.close();
	}
}

export async function composeBanner(version: string, recent: ReadonlySet<string>) {
	const manifest = JSON.parse(await readFile(new URL('fixture.json', fixture), 'utf8')) as Manifest;
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		for (const choice of bannerChoices(version)) {
			const doll = await dollFrame(manifest, choice);
			const { color } = choice;
			const drawn = await page.evaluate(
				({ pixels, w, h, width, height, color }) => {
					const sprite = document.createElement('canvas');
					sprite.width = w;
					sprite.height = h;
					const spriteContext = sprite.getContext('2d');
					const banner = document.createElement('canvas');
					banner.width = width;
					banner.height = height;
					const context = banner.getContext('2d');
					if (!spriteContext || !context)
						throw new Error('Cannot compose the release banner without a canvas');
					const data = new Uint8ClampedArray(pixels);
					spriteContext.putImageData(new ImageData(data, w, h), 0, 0);
					let left = w,
						top = h,
						right = -1,
						bottom = -1;
					for (let y = 0; y < h; y++) {
						for (let x = 0; x < w; x++) {
							if (!data[(y * w + x) * 4 + 3]) continue;
							left = Math.min(left, x);
							top = Math.min(top, y);
							right = Math.max(right, x);
							bottom = Math.max(bottom, y);
						}
					}
					if (right < 0) throw new Error('Release banner fixture frame is transparent');
					const cropW = right - left + 1;
					const cropH = bottom - top + 1;
					// Every banner draws the doll at 2x; a pose too wide or tall for that (a tall hat facing south) is skipped.
					const scale = 2;
					if (cropW * scale > width || cropH * scale > height) return null;
					context.fillStyle = color;
					context.fillRect(0, 0, width, height);
					context.imageSmoothingEnabled = false;
					context.drawImage(
						sprite,
						left,
						top,
						cropW,
						cropH,
						(width - cropW * scale) / 2,
						(height - cropH * scale) / 2,
						cropW * scale,
						cropH * scale
					);
					return {
						png: banner.toDataURL('image/png').split(',')[1],
						rgba: Array.from(context.getImageData(0, 0, width, height).data)
					};
				},
				{ pixels: Array.from(doll.data), w: doll.w, h: doll.h, width, height, color }
			);
			if (!drawn) continue;
			const { png, rgba } = drawn;
			const hash = createHash('sha256').update(Buffer.from(rgba)).digest('hex');
			if (recent.has(hash)) continue;
			const native = Buffer.from(png, 'base64');
			return { native, large: await scaleBanner(page, native), hash };
		}
		throw new Error('No release banner differs from the last eight releases');
	} finally {
		await browser.close();
	}
}
