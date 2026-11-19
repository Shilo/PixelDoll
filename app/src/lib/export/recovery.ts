import { layerFrame } from '../compose/compose.ts';
import type { Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import type { Layer, Project } from '../store/manifest.ts';
import { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, zip, type ZipEntry } from '../store/zip.ts';
import { message, type Message } from '../message.ts';

function* tracks(layer: Layer, onInvalid?: () => void) {
	for (const [move, dirs] of Object.entries(layer?.cells ?? {}))
		for (const [facing, cells] of Object.entries(dirs ?? {}))
			if (Array.isArray(cells)) yield { move, facing, cells };
			else if (cells != null) onInvalid?.();
}

const usableImage = (image: Img | undefined): image is Img =>
	!!image &&
	[image.w, image.h].every((size) => Number.isInteger(size) && size > 0 && size <= 4096) &&
	image.data instanceof Uint8ClampedArray &&
	image.data.length === image.w * image.h * 4;

/** English notes for the ZIP; `messages` receives each note's display message. */
export function leaveEmptyFrames(
	{ manifest, images }: Project,
	messages?: Map<string, Message>
): string[] {
	const warnings: string[] = [];
	for (const item of manifest.items) {
		let count = 0;
		for (const layer of item.layers) {
			const size = layerFrame(manifest.rig, layer);
			for (const { cells } of tracks(layer))
				for (const [index, hash] of cells.entries()) {
					if (hash == null) continue;
					const image = images.get(hash);
					if (usableImage(image) && image.w === size.w && image.h === size.h) continue;
					cells[index] = null;
					count++;
				}
		}
		if (count) {
			const text = `${item.name}: ${count === 1 ? '1 frame was' : `${count} frames were`} left empty.`;
			warnings.push(text);
			messages?.set(text, message('export.warnings.emptyFrames', { item: item.name, count }));
		}
	}
	return warnings;
}

export async function recoverArtwork(
	{ manifest, images }: Project,
	problem: string,
	limit = MAX_ZIP_BYTES
) {
	const entries: ZipEntry[] = [];
	const encoder = new TextEncoder();
	const written = new Map<string, string | null>();
	const rejectedSizes = new Map<string, number>();
	const index: {
		item: string;
		layer: string;
		move: string;
		facing: string;
		frameCount: number;
		images: (string | null)[];
	}[] = [];
	let bytes = 1024 + encoder.encode(problem).length;
	let skipped = false;
	async function keep(hash: string | null) {
		if (hash == null) return null;
		if (typeof hash !== 'string') {
			skipped = true;
			return null;
		}
		if (written.has(hash)) return written.get(hash)!;
		if (bytes + (rejectedSizes.get(hash) ?? 0) > limit) {
			skipped = true;
			return null;
		}
		const image = images.get(hash);
		let path: string | null = null;
		if (usableImage(image) && entries.length < MAX_ZIP_ENTRIES - 2 && bytes < limit) {
			try {
				const data = await encodePngBytes(image);
				if (bytes + data.length + 128 <= limit) {
					path = `frames/${entries.length + 1}.png`;
					entries.push({ name: path, data });
					bytes += data.length + 128;
				} else rejectedSizes.set(hash, data.length + 128);
			} catch (error) {
				console.error('Could not recover an export image', error);
			}
		}
		if (!path) skipped = true;
		if (path || !rejectedSizes.has(hash)) written.set(hash, path);
		return path;
	}
	async function record(
		item: string,
		layer: string,
		move: string,
		facing: string,
		cells: (string | null)[]
	) {
		const track: (typeof index)[number] = {
			item,
			layer,
			move,
			facing,
			frameCount: cells.length,
			images: []
		};
		const header = encoder.encode(JSON.stringify(track)).length + 1;
		if (bytes + header > limit) {
			skipped ||= cells.some(Boolean);
			return;
		}
		let indexBytes = header;
		bytes += header;
		for (const hash of cells) {
			if (bytes + 20 > limit) {
				skipped = true;
				break;
			}
			bytes += 20;
			const path = await keep(hash);
			const pathBytes = (path ? path.length + 2 : 4) + 1;
			bytes -= 20 - pathBytes;
			indexBytes += pathBytes;
			track.images.push(path);
		}
		if (track.images.some(Boolean)) index.push(track);
		else bytes -= indexBytes;
	}
	for (const [facing, view] of Object.entries(manifest.rig?.rest ?? {}))
		if (view?.image) await record('Base', 'Reference', 'Standing', facing, [view.image]);
	for (const item of Array.isArray(manifest.items) ? manifest.items : []) {
		if (!Array.isArray(item?.layers)) skipped = true;
		for (const layer of Array.isArray(item?.layers) ? item.layers : [])
			for (const { move, facing, cells } of tracks(layer, () => {
				skipped = true;
			}))
				await record(item.name, layer.id, move, facing, cells);
		for (const [facing, hash] of Object.entries(item?.dressed ?? {}))
			if (hash) await record(item.name, 'Reference', 'Standing', facing, [hash]);
	}
	if (!entries.length) return null;
	const readme =
		'Recovered artwork\n\n' +
		problem +
		'\n\n' +
		'This is not a game-ready export or an editable PixelDoll project. It contains source PNGs with their original colors and a frame list in frames.json.\n' +
		(skipped ? '\nSome source images could not be included.\n' : '');
	entries.unshift(
		{ name: 'README.txt', data: encoder.encode(readme) },
		{ name: 'frames.json', data: encoder.encode(JSON.stringify(index)) }
	);
	return { entries, zip: await zip(entries), skipped };
}
