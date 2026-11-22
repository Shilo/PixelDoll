// Visual evidence for agents: labeled contact sheets of real frames, enlarged by whole pixels only (no smoothing), so a model
// sees the same pixels the Studio and exports use. One sheet answers what would otherwise take one call per frame.
import { bytesToBase64, type Img } from '../../lib/image/png.ts';

export interface Evidence {
	label: string;
	/** PNG bytes, base64. */
	data: string;
	width: number;
	height: number;
	/** Whole-pixel enlargement applied to every frame. */
	scale: number;
}

export interface SheetCell {
	image: Img | null;
}
export interface SheetSpec {
	label: string;
	rows: { label: string; cells: SheetCell[] }[];
	columns: string[];
	/** Requested enlargement; lowered to keep the sheet within MAX_SIDE. */
	scale: number;
}

/** Longest side of one sheet: large enough to read single pixels at small frame sizes, small enough for model input limits. */
export const MAX_SIDE = 1568;
const GAP = 4,
	ROW_LABEL = 96,
	COLUMN_LABEL = 20;
// Flat neutral gray: no checkerboard to mistake for artwork, and no chroma-key color.
const BACKGROUND = '#6b6b6b',
	PANEL = '#5a5a5a',
	INK = '#f2f2f2';

export function sheetScale(
	spec: Pick<SheetSpec, 'rows' | 'columns' | 'scale'>,
	w: number,
	h: number
) {
	const cols = Math.max(1, spec.columns.length),
		rows = Math.max(1, spec.rows.length);
	const fit = Math.min(
		Math.floor((MAX_SIDE - ROW_LABEL - GAP * (cols + 1)) / (cols * w)),
		Math.floor((MAX_SIDE - COLUMN_LABEL - GAP * (rows + 1)) / (rows * h))
	);
	return Math.max(1, Math.min(Math.floor(spec.scale), fit));
}

/** The smallest box holding every opaque pixel of all images (same-size frames), with a 1 px margin; null when all are
 *  empty. One box for the whole sheet keeps frames aligned with each other. */
export function opaqueBounds(images: readonly Img[]) {
	let x0 = Infinity,
		y0 = Infinity,
		x1 = -1,
		y1 = -1;
	for (const im of images)
		for (let y = 0; y < im.h; y++)
			for (let x = 0; x < im.w; x++)
				if (im.data[(y * im.w + x) * 4 + 3]) {
					if (x < x0) x0 = x;
					if (x > x1) x1 = x;
					if (y < y0) y0 = y;
					if (y > y1) y1 = y;
				}
	if (x1 < 0) return null;
	const w = images[0].w,
		h = images[0].h;
	x0 = Math.max(0, x0 - 1);
	y0 = Math.max(0, y0 - 1);
	return { x: x0, y: y0, w: Math.min(w, x1 + 2) - x0, h: Math.min(h, y1 + 2) - y0 };
}

export function crop(im: Img, box: { x: number; y: number; w: number; h: number }): Img {
	const data = new Uint8ClampedArray(box.w * box.h * 4);
	for (let y = 0; y < box.h; y++)
		data.set(
			im.data.subarray(((box.y + y) * im.w + box.x) * 4, ((box.y + y) * im.w + box.x + box.w) * 4),
			y * box.w * 4
		);
	return { w: box.w, h: box.h, data };
}

/** Draw a labeled grid of frames (rows, for example directions; columns, for example frames). Empty cells stay blank.
 *  Every frame is cropped to the same box around all artwork, so padded canvases (held items) do not waste the scale. */
export async function renderSheet(spec: SheetSpec): Promise<Evidence> {
	const all = spec.rows.flatMap((r) => r.cells.map((c) => c.image)).filter((x) => !!x);
	const box =
		all.length && all.every((im) => im.w === all[0].w && im.h === all[0].h)
			? opaqueBounds(all)
			: null;
	if (box)
		spec = {
			...spec,
			rows: spec.rows.map((r) => ({
				...r,
				cells: r.cells.map((c) => ({ image: c.image && crop(c.image, box) }))
			}))
		};
	const frames = spec.rows.flatMap((r) => r.cells.map((c) => c.image)).filter((x) => !!x);
	const w = Math.max(1, ...frames.map((f) => f.w)),
		h = Math.max(1, ...frames.map((f) => f.h));
	const scale = sheetScale(spec, w, h),
		cw = w * scale,
		ch = h * scale;
	const cols = Math.max(1, spec.columns.length);
	const width = ROW_LABEL + GAP + cols * (cw + GAP),
		height = COLUMN_LABEL + GAP + spec.rows.length * (ch + GAP);
	const canvas = new OffscreenCanvas(width, height),
		g = canvas.getContext('2d')!;
	g.imageSmoothingEnabled = false;
	g.fillStyle = BACKGROUND;
	g.fillRect(0, 0, width, height);
	g.font = '12px system-ui, sans-serif';
	g.textBaseline = 'middle';
	g.fillStyle = INK;
	spec.columns.forEach((label, c) =>
		g.fillText(label, ROW_LABEL + GAP + c * (cw + GAP), COLUMN_LABEL / 2, cw)
	);
	for (const [r, row] of spec.rows.entries()) {
		const y = COLUMN_LABEL + GAP + r * (ch + GAP);
		g.fillStyle = INK;
		g.fillText(row.label, 4, y + ch / 2, ROW_LABEL - 8);
		for (const [c, cell] of row.cells.entries()) {
			const x = ROW_LABEL + GAP + c * (cw + GAP);
			g.fillStyle = PANEL;
			g.fillRect(x, y, cw, ch);
			if (!cell.image) continue;
			const bitmap = await createImageBitmap(
				new ImageData(new Uint8ClampedArray(cell.image.data), cell.image.w, cell.image.h)
			);
			// Centered on the cell so frames of different sizes (held items) still share a pivot column.
			g.drawImage(
				bitmap,
				x + Math.floor((w - cell.image.w) / 2) * scale,
				y + Math.floor((h - cell.image.h) / 2) * scale,
				cell.image.w * scale,
				cell.image.h * scale
			);
			bitmap.close();
		}
	}
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	return {
		label: spec.label,
		data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
		width,
		height,
		scale
	};
}
