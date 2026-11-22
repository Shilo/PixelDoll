// Visual evidence for agents: labeled contact sheets of real frames, enlarged by whole pixels only (no smoothing), so a model
// sees the same pixels the Studio and exports use. One sheet answers what would otherwise take one call per frame.
//
// All sheets of one call share one scale. The worn, composite and source sheets also share one crop and pivot, so they line
// up; an item-alone sheet gets its own tight crop, so a small held item is not lost in a whole-body frame (its rulers count
// the same frame pixels). Sheets are drawn at one canvas pixel per CSS pixel; the panel draws them again at a whole number of
// CSS pixels per artwork pixel and lets the browser enlarge them without smoothing. Pages become PNG only when a script asks.
import { bytesToBase64, type Img } from '../../lib/image/png.ts';
import { opaqueBox } from '../../lib/rig/normalize.ts';
import { AgentError } from './contract.ts';

type Point = { x: number; y: number };
type Size = { w: number; h: number };
type Crop = Point & Size;

export interface SheetCell {
	image: Img | null;
	/** False draws the cell hatched and labeled "no frame": no frame exists there. A frame without one opaque pixel is
	 *  drawn with a dashed outline and labeled "empty"; transparent pixels show the cell color. */
	covered: boolean;
	/** Top-left of the native image in the shared frame. */
	offset?: Point;
	/** Boxes outlined on the cell, in the image's own pixels: the detached parts the digest lists. */
	marks?: Crop[];
}

export interface SheetSpec {
	label: string;
	kind: 'frames' | 'item' | 'worn' | 'source';
	/** What rows and columns are, written in the sheet's corner ("direction", "frame"). */
	axes: { rows: string; columns: string };
	rows: { label: string; cells: SheetCell[] }[];
	columns: string[];
	pivot?: Point;
}

export type SheetPage = SheetSpec & { crop: Crop; scale: number };

/** One page of a call: its plan, drawn in the page and encoded as PNG only on request (encodeSheet). */
export interface Evidence {
	label: string;
	width: number;
	height: number;
	scale: number;
	page: SheetPage;
}

/** Longest side of one sheet: large enough to read single pixels at small frame sizes, small enough for model input limits. */
export const MAX_SIDE = 1568;
/** Pages one call may produce, so a review stays a handful of images. */
export const MAX_SHEETS = 8;
// Interface geometry in CSS pixels.
const GAP = 6,
	ROW_LABEL = 96,
	COLUMN_LABEL = 20,
	MIN_COLUMN = 56,
	MIN_ROW = 16;

// One fixed, slightly violet mid-tone: unlike a neutral gray it is not mistaken for steel or shadow, and it keeps the same
// contrast in the PNG and in the Studio. Marks use a color pixel art rarely uses at full strength.
export const PALETTE = {
	sheet: '#45405a',
	cell: '#5b5573',
	ink: '#f4f2fa',
	hatch: '#9d96b8',
	mark: '#ffe600'
};

function cropOf(sheets: SheetSpec[], frame: Size, withPivot: boolean): Crop {
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
	if (withPivot)
		for (const { pivot } of sheets) {
			if (!pivot) continue;
			left = Math.min(left, Math.floor(pivot.x));
			top = Math.min(top, Math.floor(pivot.y));
			right = Math.max(right, Math.ceil(pivot.x));
			bottom = Math.max(bottom, Math.ceil(pivot.y));
		}
	return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Each sheet's crop: one shared by every sheet but the item-alone ones, which share their own tight one. */
function cropsOf(sheets: SheetSpec[], frame: Size): Crop[] {
	const alone = sheets.filter((sheet) => sheet.kind === 'item'),
		rest = sheets.filter((sheet) => sheet.kind !== 'item');
	const aloneCrop = alone.length ? cropOf(alone, frame, false) : undefined,
		restCrop = rest.length ? cropOf(rest, frame, true) : undefined;
	return sheets.map((sheet) => (sheet.kind === 'item' ? aloneCrop! : restCrop!));
}

/** Canvas size of a page at `scale` canvas pixels per artwork pixel. */
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
function chooseScale(sheets: SheetSpec[], crops: Crop[], top: number) {
	const pages = (scale: number) =>
		sheets.map((sheet, i) => pageCount(sheet, capacity(crops[i], scale)));
	for (let scale = top; scale >= 2; scale--) if (pages(scale).every((n) => n === 1)) return scale;
	for (let scale = top; scale >= 1; scale--)
		if (pages(scale).reduce((a, b) => a + b, 0) <= MAX_SHEETS) return scale;
	throw new AgentError(
		`These frames need more than ${MAX_SHEETS} sheets. Ask for fewer frames or directions.`,
		'invalid'
	);
}

const cellsWhere = (
	spec: Pick<SheetSpec, 'rows' | 'columns'>,
	test: (cell: SheetCell) => boolean
) =>
	spec.rows.flatMap((row) =>
		row.cells.flatMap((cell, i) =>
			test(cell) ? [{ row: row.label, column: spec.columns[i] }] : []
		)
	);
const isEmpty = (cell: SheetCell) => cell.covered && (!cell.image || !opaqueBox(cell.image));
/** Cells drawn hatched because no frame exists there. */
export const uncoveredCells = (spec: Pick<SheetSpec, 'rows' | 'columns'>) =>
	cellsWhere(spec, (cell) => !cell.covered);
/** Cells whose frame exists but has no opaque pixel. */
export const emptyCells = (spec: Pick<SheetSpec, 'rows' | 'columns'>) => cellsWhere(spec, isEmpty);

export function planEvidence(sheets: SheetSpec[], frame: Size, requestedScale: number) {
	const crops = cropsOf(sheets, frame);
	const limits = crops.map((crop) => ({
		crop,
		scale: Math.floor(
			Math.min(
				(MAX_SIDE - ROW_LABEL - 2 * GAP) / crop.w,
				(MAX_SIDE - COLUMN_LABEL - 2 * GAP) / crop.h
			)
		)
	}));
	const tightest = limits.reduce((a, b) => (b.scale < a.scale ? b : a));
	if (tightest.scale < 1)
		throw new AgentError(
			`A ${tightest.crop.w}x${tightest.crop.h} frame does not fit a ${MAX_SIDE} px sheet even at 1x.`,
			'unsupported'
		);
	const scale = chooseScale(sheets, crops, Math.min(requestedScale, tightest.scale));
	return sheets.flatMap((sheet, index) => {
		const crop = crops[index],
			cap = capacity(crop, scale),
			pages = pageCount(sheet, cap);
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
						rowsAre: spec.axes.rows,
						columnsAre: spec.axes.columns,
						rows: spec.rows.map((row) => row.label),
						columns: spec.columns,
						width,
						height,
						scale,
						crop,
						pivot: spec.pivot ?? null,
						coverage: {
							total,
							covered: total - uncovered.length,
							uncovered,
							empty: emptyCells(spec)
						}
					}
				});
			}
		return result;
	});
}

/** The largest whole number of CSS pixels per artwork pixel, at most the page's own scale, at which the page fits the area
 *  (CSS pixels). The panel draws the page at that scale; labels keep their size. */
export function fitScale(page: SheetPage, area: { width: number; height: number }) {
	for (let scale = page.scale; scale > 1; scale--) {
		const size = sheetLayout(page.crop, scale, page.columns.length, page.rows.length);
		if (size.width <= area.width && size.height <= area.height) return scale;
	}
	return 1;
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

/** A small word on a cell ("no frame", "empty"), on a patch of the cell color so it stays readable over hatching. */
function cellNote(g: SheetContext, text: string, x: number, y: number, w: number, h: number) {
	if (w < 40 || h < 12) return;
	const width = Math.min(w - 4, g.measureText(text).width + 6);
	g.fillStyle = PALETTE.cell;
	g.fillRect(x + (w - width) / 2, y + h / 2 - 6, width, 12);
	g.fillStyle = PALETTE.ink;
	g.textAlign = 'center';
	g.fillText(text, x + w / 2, y + h / 2, w - 6);
	g.textAlign = 'start';
}

/** Draws one page at `scale` canvas pixels per artwork pixel; interface geometry stays at one canvas pixel per CSS pixel. */
export function paintSheet(g: SheetContext, spec: SheetPage, scale = spec.scale) {
	const { crop, rows, columns, pivot, axes } = spec;
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
	g.imageSmoothingEnabled = false;
	g.fillStyle = PALETTE.sheet;
	g.fillRect(0, 0, width, height);
	g.textBaseline = 'middle';
	g.lineWidth = 1;
	g.fillStyle = PALETTE.ink;
	// The corner names the axes: rows down, columns across.
	g.font = '11px system-ui, sans-serif';
	g.fillText(
		[axes.rows && `${axes.rows} ↓`, axes.columns && `${axes.columns} →`].filter(Boolean).join('  '),
		4,
		COLUMN_LABEL / 2,
		ROW_LABEL - 4
	);
	g.font = '12px system-ui, sans-serif';
	columns.forEach((label, c) =>
		g.fillText(label, ROW_LABEL + GAP + c * colStride, COLUMN_LABEL / 2, colStride - GAP)
	);
	for (const [r, row] of rows.entries()) {
		const y = COLUMN_LABEL + GAP + r * rowStride;
		g.fillStyle = PALETTE.ink;
		g.font = '12px system-ui, sans-serif';
		g.fillText(row.label, 4, y + (rowStride - GAP) / 2, ROW_LABEL - 8);
		g.font = '10px system-ui, sans-serif';
		for (const [c, cell] of row.cells.entries()) {
			const { image, covered, offset, marks } = cell;
			const x = ROW_LABEL + GAP + c * colStride;
			g.fillStyle = PALETTE.cell;
			g.fillRect(x, y, cw, ch);
			if (!covered) {
				g.strokeStyle = PALETTE.hatch;
				hatch(g, x, y, cw, ch);
				// Keep the coverage marker visible even when a partial composite fills the cell.
				g.fillStyle = PALETTE.hatch;
				g.fillRect(x, y + ch, cw, 2);
			}
			const { x: ox, y: oy } = offset ?? { x: 0, y: 0 };
			if (image) {
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
			if (!covered) cellNote(g, 'no frame', x, y, cw, ch);
			else if (isEmpty(cell)) {
				g.save();
				g.strokeStyle = PALETTE.hatch;
				g.setLineDash([4, 3]);
				g.strokeRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
				g.restore();
				cellNote(g, 'empty', x, y, cw, ch);
			}
			// Detached parts, outlined one artwork pixel outside their box.
			g.strokeStyle = PALETTE.mark;
			for (const box of marks ?? [])
				g.strokeRect(
					x + (ox + box.x - 1 - crop.x) * scale + 0.5,
					y + (oy + box.y - 1 - crop.y) * scale + 0.5,
					(box.w + 2) * scale - 1,
					(box.h + 2) * scale - 1
				);
			// Rulers in the gap above and left of the cell: a tick every 8 frame pixels, a longer one at the pivot. They stay
			// clear of the coverage bar under the previous row.
			g.fillStyle = PALETTE.ink;
			for (let col = Math.ceil(crop.x / 8) * 8; col <= crop.x + crop.w; col += 8)
				g.fillRect(x + (col - crop.x) * scale, y - 3, 1, 2);
			for (let rw = Math.ceil(crop.y / 8) * 8; rw <= crop.y + crop.h; rw += 8)
				g.fillRect(x - 3, y + (rw - crop.y) * scale, 2, 1);
			if (pivot && pivot.x >= crop.x && pivot.x <= crop.x + crop.w)
				g.fillRect(x + Math.round((pivot.x - crop.x) * scale) - 1, y - 4, 3, 4);
			if (pivot && pivot.y >= crop.y && pivot.y <= crop.y + crop.h)
				g.fillRect(x - 4, y + Math.round((pivot.y - crop.y) * scale) - 1, 4, 3);
		}
	}
	return { width, height };
}

/** A page as base64 PNG, for script clients that asked for image data. */
export async function encodeSheet(page: SheetPage): Promise<string> {
	const canvas = new OffscreenCanvas(1, 1);
	paintSheet(canvas.getContext('2d')!, page);
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}
