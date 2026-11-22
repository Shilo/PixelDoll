// Visual evidence for agents: labeled contact sheets of real frames, enlarged by whole pixels only (no smoothing), so a model
// sees the same pixels the Studio and exports use. One sheet answers what would otherwise take one call per frame.
//
// All sheets of one call share one crop, scale and pivot, so the item-alone, worn and source sheets line up. The PNGs for
// tools are drawn at one canvas pixel per CSS pixel; the panel redraws the same pages at a whole number of device pixels per
// artwork pixel, with labels, gaps and rulers sized by the device pixel ratio.
import { bytesToBase64, type Img } from '../../lib/image/png.ts';
import { opaqueBox } from '../../lib/rig/normalize.ts';
import { AgentError } from './contract.ts';

type Point = { x: number; y: number };
type Size = { w: number; h: number };
type Crop = Point & Size;
export type EvidenceBackground = 'neutral' | 'light' | 'dark';

export interface SheetCell {
	image: Img | null;
	/** False draws the cell hatched: no frame exists there, which is not the same as a transparent frame. */
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

export type SheetPage = SheetSpec & {
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

/** Longest side of one sheet: large enough to read single pixels at small frame sizes, small enough for model input limits. */
export const MAX_SIDE = 1568;
/** Pages one call may produce, so a review stays a handful of images. */
export const MAX_SHEETS = 8;
// Interface geometry in CSS pixels; the panel multiplies it by the device pixel ratio.
const GAP = 6,
	ROW_LABEL = 96,
	COLUMN_LABEL = 20,
	MIN_COLUMN = 56,
	MIN_ROW = 16;

// Fixed evidence palettes keep the same contrast in the PNG and in the Studio.
export const PALETTES = {
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

/** Canvas size of a page: artwork at `scale` canvas pixels per artwork pixel, interface geometry at `dpr`. */
function sheetLayout(crop: Size, scale: number, columns: number, rows: number, dpr = 1) {
	const u = (n: number) => Math.round(n * dpr);
	const cw = crop.w * scale,
		ch = crop.h * scale,
		gap = u(GAP),
		rowLabel = u(ROW_LABEL),
		columnLabel = u(COLUMN_LABEL);
	const colStride = Math.max(u(MIN_COLUMN), cw) + gap,
		rowStride = Math.max(u(MIN_ROW), ch) + gap;
	return {
		u,
		cw,
		ch,
		gap,
		rowLabel,
		columnLabel,
		colStride,
		rowStride,
		width: rowLabel + gap + columns * colStride,
		height: columnLabel + gap + rows * rowStride
	};
}

/** Frames per page within MAX_SIDE at `scale`. */
function capacity(crop: Size, scale: number) {
	const { colStride, rowStride } = sheetLayout(crop, scale, 1, 1);
	return {
		columns: Math.max(1, Math.floor((MAX_SIDE - ROW_LABEL - GAP) / colStride)),
		rows: Math.max(1, Math.floor((MAX_SIDE - COLUMN_LABEL - GAP) / rowStride))
	};
}

const pageCount = (sheet: SheetSpec, cap: ReturnType<typeof capacity>) =>
	Math.ceil(sheet.rows.length / cap.rows) * Math.ceil(sheet.columns.length / cap.columns);

/** Prefer every sheet on one page at a readable scale (2 or more), lowering the requested scale to get there; otherwise
 *  keep the largest scale at which the call stays within MAX_SHEETS pages. */
function chooseScale(sheets: SheetSpec[], crop: Size, top: number) {
	for (let scale = top; scale >= 2; scale--) {
		const cap = capacity(crop, scale);
		if (sheets.every((sheet) => pageCount(sheet, cap) === 1)) return scale;
	}
	for (let scale = top; scale >= 1; scale--) {
		const cap = capacity(crop, scale);
		if (sheets.reduce((n, sheet) => n + pageCount(sheet, cap), 0) <= MAX_SHEETS) return scale;
	}
	throw new AgentError(
		`These frames need more than ${MAX_SHEETS} sheets. Ask for fewer frames or directions.`,
		'invalid'
	);
}

/** Cells drawn hatched because no frame exists there. */
export const uncoveredCells = (spec: Pick<SheetSpec, 'rows' | 'columns'>) =>
	spec.rows.flatMap((row) =>
		row.cells.flatMap((cell, i) =>
			cell.covered ? [] : [{ row: row.label, column: spec.columns[i] }]
		)
	);

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
		throw new AgentError(
			`A ${crop.w}x${crop.h} frame does not fit a ${MAX_SIDE} px sheet even at 1x.`,
			'unsupported'
		);
	const scale = chooseScale(sheets, crop, Math.min(requestedScale, maxScale));
	const cap = capacity(crop, scale);
	return sheets.flatMap((sheet) => {
		const pages = pageCount(sheet, cap);
		const result = [];
		for (let r = 0; r < sheet.rows.length; r += cap.rows)
			for (let c = 0; c < sheet.columns.length; c += cap.columns) {
				const page: number = result.length + 1;
				const spec: SheetPage = {
					...sheet,
					label: pages === 1 ? sheet.label : `${sheet.label} (${page}/${pages})`,
					rows: sheet.rows.slice(r, r + cap.rows).map((row) => ({
						label: row.label,
						cells: row.cells.slice(c, c + cap.columns)
					})),
					columns: sheet.columns.slice(c, c + cap.columns),
					crop,
					background,
					scale
				};
				const uncovered = uncoveredCells(spec);
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

/** The largest whole scale, at most the pages' own, at which all pages fit the area together, stacked, each with `chrome`
 *  CSS pixels for its caption. `width` and `height` are CSS pixels; the scale is in device pixels per artwork pixel. */
export function fitScale(
	pages: SheetPage[],
	area: { width: number; height: number; dpr: number; chrome: number }
) {
	for (let scale = pages[0]?.scale ?? 1; scale > 1; scale--) {
		let width = 0,
			height = 0;
		for (const page of pages) {
			const size = sheetLayout(page.crop, scale, page.columns.length, page.rows.length, area.dpr);
			width = Math.max(width, size.width / area.dpr);
			height += size.height / area.dpr + area.chrome;
		}
		if (width <= area.width && height <= area.height) return scale;
	}
	return 1;
}

type SheetContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function hatch(g: SheetContext, x: number, y: number, w: number, h: number, step: number) {
	g.save();
	g.beginPath();
	g.rect(x, y, w, h);
	g.clip();
	g.beginPath();
	for (let i = -h; i < w; i += step) {
		g.moveTo(x + i, y + h);
		g.lineTo(x + i + h, y);
	}
	g.stroke();
	g.restore();
}

/** Draws one page at `scale` canvas pixels per artwork pixel, with interface geometry at `dpr`. */
export function paintSheet(g: SheetContext, spec: SheetPage, scale: number, dpr = 1) {
	const { crop, rows, columns, pivot } = spec;
	const { u, width, height, cw, ch, gap, rowLabel, columnLabel, colStride, rowStride } =
		sheetLayout(crop, scale, columns.length, rows.length, dpr);
	const line = Math.max(1, Math.round(dpr));
	g.canvas.width = width;
	g.canvas.height = height;
	const scratch = new OffscreenCanvas(1, 1),
		source = scratch.getContext('2d')!;
	const palette = PALETTES[spec.background];
	g.imageSmoothingEnabled = false;
	g.fillStyle = palette.sheet;
	g.fillRect(0, 0, width, height);
	g.font = `${u(12)}px system-ui, sans-serif`;
	g.textBaseline = 'middle';
	g.lineWidth = line;
	g.fillStyle = palette.ink;
	columns.forEach((label, c) =>
		g.fillText(label, rowLabel + gap + c * colStride, columnLabel / 2, colStride - gap)
	);
	for (const [r, row] of rows.entries()) {
		const y = columnLabel + gap + r * rowStride;
		g.fillStyle = palette.ink;
		g.fillText(row.label, u(4), y + (rowStride - gap) / 2, rowLabel - u(8));
		for (const [c, { image, covered, offset }] of row.cells.entries()) {
			const x = rowLabel + gap + c * colStride;
			g.fillStyle = palette.cell;
			g.fillRect(x, y, cw, ch);
			if (!covered) {
				g.strokeStyle = palette.hatch;
				hatch(g, x, y, cw, ch, u(8));
				// Keep the coverage marker visible even when a partial composite fills the cell.
				g.fillStyle = palette.hatch;
				g.fillRect(x, y + ch, cw, u(2));
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
					// Frame pixels are never backed by a SharedArrayBuffer.
					source.putImageData(
						new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.w, image.h),
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
			// Rulers in the gap above and left of the cell: a tick every 8 artwork pixels, a longer one at the pivot. They stay
			// clear of the coverage bar under the previous row.
			g.fillStyle = palette.ink;
			for (let col = Math.ceil(crop.x / 8) * 8; col <= crop.x + crop.w; col += 8)
				g.fillRect(x + (col - crop.x) * scale, y - u(3), line, u(2));
			for (let rw = Math.ceil(crop.y / 8) * 8; rw <= crop.y + crop.h; rw += 8)
				g.fillRect(x - u(3), y + (rw - crop.y) * scale, u(2), line);
			if (pivot) {
				g.fillRect(x + Math.round((pivot.x - crop.x) * scale) - line, y - u(4), 3 * line, u(4));
				g.fillRect(x - u(4), y + Math.round((pivot.y - crop.y) * scale) - line, u(4), 3 * line);
			}
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
