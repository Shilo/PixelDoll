import { bytesToBase64, type Img } from '../../lib/image/png.ts';
import { opaqueBox } from '../../lib/rig/normalize.ts';

type Point = { x: number; y: number };
type Size = { w: number; h: number };
type Crop = Point & Size;
export type EvidenceBackground = 'neutral' | 'light' | 'dark';

export interface SheetCell {
	image: Img | null;
	covered: boolean;
	/** Top-left of the native image in the shared frame. */
	offset?: Point;
}

export interface SheetSpec {
	label: string;
	kind: 'frames' | 'item' | 'worn' | 'source';
	rows: { label: string; cells: SheetCell[] }[];
	columns: string[];
	pivot?: Point;
}

type SheetPage = SheetSpec & {
	crop: Crop;
	background: EvidenceBackground;
	scale: number;
};

export interface Evidence {
	label: string;
	/** PNG bytes, base64. */
	data: string;
	width: number;
	height: number;
	scale: number;
	/** Native frames for a second render at the panel's device-pixel scale. */
	page: SheetPage;
}

export const MAX_SIDE = 1568;
const GAP = 6,
	ROW_LABEL = 96,
	COLUMN_LABEL = 20,
	MIN_COLUMN = 56,
	MIN_ROW = 16;

// Fixed evidence palettes keep the same contrast in the PNG and in the Studio.
const PALETTES = {
	neutral: { sheet: '#6b6b6b', cell: '#5a5a5a', ink: '#f2f2f2', hatch: '#929292' },
	light: { sheet: '#eeeeee', cell: '#ffffff', ink: '#222222', hatch: '#888888' },
	dark: { sheet: '#242424', cell: '#161616', ink: '#f2f2f2', hatch: '#777777' }
};

function sharedCrop(sheets: SheetSpec[], frame: Size): Crop {
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	for (const sheet of sheets)
		for (const row of sheet.rows)
			for (const { image, offset } of row.cells) {
				if (!image) continue;
				const box = opaqueBox(image);
				if (!box) continue;
				const { x, y } = offset ?? { x: 0, y: 0 };
				left = Math.min(left, x + Math.max(0, box.x0 - 1));
				top = Math.min(top, y + Math.max(0, box.y0 - 1));
				right = Math.max(right, x + Math.min(image.w, box.x1 + 2));
				bottom = Math.max(bottom, y + Math.min(image.h, box.y1 + 2));
			}
	if (!Number.isFinite(left)) return { x: 0, y: 0, w: frame.w, h: frame.h };
	// Include the pivot's pixel edge even if it lies outside the visible artwork.
	for (const { pivot } of sheets) {
		if (!pivot) continue;
		left = Math.min(left, Math.floor(pivot.x));
		top = Math.min(top, Math.floor(pivot.y));
		right = Math.max(right, Math.ceil(pivot.x));
		bottom = Math.max(bottom, Math.ceil(pivot.y));
	}
	return { x: left, y: top, w: right - left, h: bottom - top };
}

function sheetLayout(crop: Size, scale: number, columns: number, rows: number) {
	const cw = crop.w * scale,
		ch = crop.h * scale;
	const colStride = Math.max(MIN_COLUMN, cw) + GAP,
		rowStride = Math.max(MIN_ROW, ch) + GAP;
	return {
		cw,
		ch,
		colStride,
		rowStride,
		width: ROW_LABEL + GAP + columns * colStride,
		height: COLUMN_LABEL + GAP + rows * rowStride
	};
}

export function planEvidence(
	sheets: SheetSpec[],
	frame: Size,
	requestedScale: number,
	background: EvidenceBackground = 'neutral'
) {
	const crop = sharedCrop(sheets, frame);
	const maxScale = Math.floor(
		Math.min(
			(MAX_SIDE - ROW_LABEL - 2 * GAP) / crop.w,
			(MAX_SIDE - COLUMN_LABEL - 2 * GAP) / crop.h
		)
	);
	if (maxScale < 1)
		throw new RangeError('The evidence frame exceeds the maximum sheet size at 1×.');
	const scale = Math.min(requestedScale, maxScale);
	const { colStride, rowStride } = sheetLayout(crop, scale, 1, 1);
	const colsPerPage = Math.floor((MAX_SIDE - ROW_LABEL - GAP) / colStride),
		rowsPerPage = Math.floor((MAX_SIDE - COLUMN_LABEL - GAP) / rowStride);
	return sheets.flatMap((sheet) => {
		const pages =
			Math.ceil(sheet.rows.length / rowsPerPage) * Math.ceil(sheet.columns.length / colsPerPage);
		const result = [];
		for (let r = 0; r < sheet.rows.length; r += rowsPerPage)
			for (let c = 0; c < sheet.columns.length; c += colsPerPage) {
				const page: number = result.length + 1;
				const spec: SheetPage = {
					...sheet,
					label: pages === 1 ? sheet.label : `${sheet.label} (${page}/${pages})`,
					rows: sheet.rows.slice(r, r + rowsPerPage).map((row) => ({
						label: row.label,
						cells: row.cells.slice(c, c + colsPerPage)
					})),
					columns: sheet.columns.slice(c, c + colsPerPage),
					crop,
					background,
					scale
				};
				const uncovered = spec.rows.flatMap((row) =>
					row.cells.flatMap((cell, i) =>
						cell.covered ? [] : [{ row: row.label, column: spec.columns[i] }]
					)
				);
				const total = spec.rows.length * spec.columns.length;
				const { width, height } = sheetLayout(crop, scale, spec.columns.length, spec.rows.length);
				result.push({
					spec,
					meta: {
						label: spec.label,
						kind: spec.kind,
						page,
						pages,
						rows: spec.rows.map((row) => row.label),
						columns: spec.columns,
						width,
						height,
						scale,
						crop,
						pivot: spec.pivot ?? null,
						background,
						coverage: { total, covered: total - uncovered.length, uncovered }
					}
				});
			}
		return result;
	});
}

export function displayScale(pages: SheetPage[], availableWidth: number, availableHeight: number) {
	let scale = pages[0]?.scale ?? 1;
	for (const page of pages)
		while (scale > 1) {
			const { width, height } = sheetLayout(
				page.crop,
				scale,
				page.columns.length,
				page.rows.length
			);
			if (width <= availableWidth && height <= availableHeight) break;
			scale--;
		}
	return scale;
}

type SheetContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function hatch(g: SheetContext, x: number, y: number, w: number, h: number) {
	g.save();
	g.beginPath();
	g.rect(x, y, w, h);
	g.clip();
	g.beginPath();
	for (let i = -h; i < w; i += 8) {
		g.moveTo(x + i, y + h);
		g.lineTo(x + i + h, y);
	}
	g.stroke();
	g.restore();
}

function ruler(g: SheetContext, crop: Crop, scale: number, x: number, y: number, pivot?: Point) {
	for (let col = Math.ceil(crop.x / 8) * 8; col <= crop.x + crop.w; col += 8)
		g.fillRect(x + (col - crop.x) * scale, y - 3, 1, 2);
	for (let row = Math.ceil(crop.y / 8) * 8; row <= crop.y + crop.h; row += 8)
		g.fillRect(x - 3, y + (row - crop.y) * scale, 2, 1);
	if (pivot) {
		g.fillRect(x + Math.round((pivot.x - crop.x) * scale) - 1, y - 5, 3, 4);
		g.fillRect(x - 5, y + Math.round((pivot.y - crop.y) * scale) - 1, 4, 3);
	}
}

export function paintSheet(g: SheetContext, spec: SheetPage, scale: number) {
	const { crop, rows, columns, pivot } = spec;
	const { width, height, cw, ch, colStride, rowStride } = sheetLayout(
		crop,
		scale,
		columns.length,
		rows.length
	);
	g.canvas.width = width;
	g.canvas.height = height;
	const scratch = new OffscreenCanvas(1, 1),
		source = scratch.getContext('2d')!;
	const palette = PALETTES[spec.background];
	g.imageSmoothingEnabled = false;
	g.fillStyle = palette.sheet;
	g.fillRect(0, 0, width, height);
	g.font = '12px system-ui, sans-serif';
	g.textBaseline = 'middle';
	g.fillStyle = palette.ink;
	columns.forEach((label, c) =>
		g.fillText(label, ROW_LABEL + GAP + c * colStride, COLUMN_LABEL / 2, colStride - GAP)
	);
	for (const [r, row] of rows.entries()) {
		const y = COLUMN_LABEL + GAP + r * rowStride;
		g.fillStyle = palette.ink;
		g.fillText(row.label, 4, y + (rowStride - GAP) / 2, ROW_LABEL - 8);
		for (const [c, { image, covered, offset }] of row.cells.entries()) {
			const x = ROW_LABEL + GAP + c * colStride;
			g.fillStyle = palette.cell;
			g.fillRect(x, y, cw, ch);
			if (!covered) {
				g.strokeStyle = palette.hatch;
				hatch(g, x, y, cw, ch);
				// Keep the coverage marker visible even when a partial composite fills the cell.
				g.fillStyle = palette.hatch;
				g.fillRect(x, y + ch, cw, 2);
			}
			if (image) {
				const { x: ox, y: oy } = offset ?? { x: 0, y: 0 };
				const left = Math.max(0, crop.x - ox),
					top = Math.max(0, crop.y - oy),
					w = Math.min(image.w, crop.x + crop.w - ox) - left,
					h = Math.min(image.h, crop.y + crop.h - oy) - top;
				if (w > 0 && h > 0) {
					scratch.width = image.w;
					scratch.height = image.h;
					source.putImageData(
						new ImageData(new Uint8ClampedArray(image.data), image.w, image.h),
						0,
						0
					);
					g.drawImage(
						scratch,
						left,
						top,
						w,
						h,
						x + (ox + left - crop.x) * scale,
						y + (oy + top - crop.y) * scale,
						w * scale,
						h * scale
					);
				}
			}
			g.fillStyle = palette.ink;
			ruler(g, crop, scale, x, y, pivot);
		}
	}
	return { width, height };
}

export async function renderSheet(page: SheetPage): Promise<Evidence> {
	const canvas = new OffscreenCanvas(1, 1);
	const { width, height } = paintSheet(canvas.getContext('2d')!, page, page.scale);
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	return {
		label: page.label,
		data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
		width,
		height,
		scale: page.scale,
		page
	};
}
