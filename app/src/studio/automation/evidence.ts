// Visual evidence for agents: labeled contact sheets of real frames, enlarged by whole pixels only (no smoothing), so a model
// sees the same pixels the Studio and exports use. One sheet answers what would otherwise take one call per frame.
//
// All sheets of one call share one scale. The worn, composite and source sheets also share one crop and pivot, so they line
// up; an item-alone sheet gets its own tight crop, so a small held item is not lost in a whole-body frame (its rulers count
// the same frame pixels). A cell may hold a function that draws its frame: the call measures each frame once and draws it
// again only when a page is painted, so it never holds every frame at once. The panel paints a page at a whole number of
// device pixels per artwork pixel, so every artwork pixel keeps one size at fractional device pixel ratios. Pages become PNG
// only when a script asks.
import { bytesToBase64, type Img } from '../../lib/image/png.ts';
import { opaqueBox, type Box } from '../../lib/rig/normalize.ts';
import { missingAt, missingFrames } from '../../lib/dress/dress.ts';
import type { DirectionName, Item, Manifest, Preset } from '../../lib/store/manifest.ts';
import { AgentError } from './contract.ts';

type Point = { x: number; y: number };
type Size = { w: number; h: number };
type Crop = Point & Size;
/** A drawn frame's size and opaque box (null: no opaque pixel). */
type Measured = Size & { box: Box | null };

export interface SheetCell {
	/** The frame, or a function that draws it each time its page is painted (with `measured`). */
	image: Img | null | (() => Img | null);
	/** Size and opaque box of the drawn frame, measured when the call was planned; null when nothing was drawn. */
	measured?: Measured | null;
	/** False draws the cell hatched and labeled "no frame": no frame exists there. A frame without one opaque pixel is
	 *  drawn with a dashed outline and labeled "empty"; transparent pixels show the cell color. */
	covered: boolean;
	/** Ids of worn items with no layer in this frame: it is drawn without them and marked by a bar under the cell. */
	missing?: string[];
	/** Top-left of the native image in the shared frame. */
	offset?: Point;
	/** Boxes outlined on the cell, in the image's own pixels: the detached parts the digest found. */
	marks?: Crop[];
}

export interface SheetSpec {
	/** Stable English label for tool results. */
	label: string;
	/** The label in the person's language, for the panel (default: label). */
	shown?: string;
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
/** Frame pixels one call may compose (frames times frame area), checked before anything is composed. */
export const MAX_WORK = 24 * 1024 * 1024;
const FEWER =
	'Ask for fewer frames or directions (inspect_item and render_frames take frames and directions).';
// Interface geometry in CSS pixels. The column label band holds two lines in its corner: the axis of the rows, then of the
// columns.
const GAP = 6,
	ROW_LABEL = 96,
	COLUMN_LABEL = 32,
	MIN_COLUMN = 56,
	MIN_ROW = 16;

// One fixed, slightly violet mid-tone: unlike a neutral gray it is not mistaken for steel or shadow, and it keeps the same
// contrast in the PNG and in the Studio. Marks use a color pixel art rarely uses at full strength, edged in near black so
// they also stand out on yellow art.
export const PALETTE = {
	sheet: '#45405a',
	cell: '#5b5573',
	ink: '#f4f2fa',
	hatch: '#9d96b8',
	mark: '#ffe600',
	markEdge: '#17141f'
};

/** Words drawn on a sheet. Tool results and their PNGs keep English; the panel passes the person's language. */
export interface SheetText {
	noFrame: string;
	empty: string;
	axis: (name: string) => string;
}
const ENGLISH: SheetText = { noFrame: 'no frame', empty: 'empty', axis: (name) => name };

const measureOf = (cell: SheetCell): Measured | null =>
	typeof cell.image === 'function'
		? (cell.measured ?? null)
		: cell.image && { w: cell.image.w, h: cell.image.h, box: opaqueBox(cell.image) };
const pixelsOf = (cell: SheetCell) =>
	typeof cell.image === 'function' ? cell.image() : cell.image;

/** A cell drawn on demand, measured from its first drawing (which the caller may check, then drop). */
export const drawnCell = (
	draw: () => Img | null,
	first: Img | null,
	fields: Omit<SheetCell, 'image' | 'measured'>
): SheetCell => ({
	...fields,
	image: draw,
	measured: first && { w: first.w, h: first.h, box: opaqueBox(first) }
});

/** Which cells of one view and direction have a frame. The item alone has none where the item has none. A composite has
 *  one wherever the body has one: worn items without that frame are listed for the cell (`missing`) instead, since the
 *  frame is still drawn without them. */
export function coverageOf(
	m: Manifest,
	view: { only?: Item; outfit: Preset['items'] },
	anim: string,
	dir: DirectionName
): (cell: number) => Pick<SheetCell, 'covered' | 'missing'> {
	if (view.only) {
		const gaps = new Set(missingFrames(m, view.only, anim, dir));
		return (cell) => ({ covered: !gaps.has(cell) });
	}
	const base = m.items.find((it) => it.id === m.rig.baseItem);
	const body = new Set(base ? missingFrames(m, base, anim, dir) : []);
	const worn = missingAt(m, view.outfit, anim, dir).map((it) => ({
		id: it.id,
		gaps: new Set(missingFrames(m, it, anim, dir))
	}));
	return (cell) => {
		const missing = worn.filter(({ gaps }) => gaps.has(cell)).map(({ id }) => id);
		return { covered: !!base && !body.has(cell), ...(missing.length ? { missing } : {}) };
	};
}

/** Refuses a call that would compose more than MAX_WORK frame pixels, before anything is composed. */
export function checkWork(frames: number, frame: Size) {
	if (frames * frame.w * frame.h > MAX_WORK)
		throw new AgentError(
			`${frames} frames of ${frame.w}x${frame.h} px are too many for one call. ${FEWER}`,
			'invalid'
		);
}

function cropOf(sheets: SheetSpec[], frame: Size, withPivot: boolean): Crop {
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	for (const sheet of sheets)
		for (const row of sheet.rows)
			for (const cell of row.cells) {
				const measured = measureOf(cell);
				if (!measured?.box) continue;
				const { box } = measured;
				const { x, y } = cell.offset ?? { x: 0, y: 0 };
				left = Math.min(left, x + Math.max(0, box.x0 - 1));
				top = Math.min(top, y + Math.max(0, box.y0 - 1));
				right = Math.max(right, x + Math.min(measured.w, box.x1 + 2));
				bottom = Math.max(bottom, y + Math.min(measured.h, box.y1 + 2));
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

/** Canvas size of a page at `scale` canvas pixels per artwork pixel and `ui` canvas pixels per CSS pixel of interface. */
function sheetLayout(crop: Size, scale: number, columns: number, rows: number, ui = 1) {
	const gap = Math.round(GAP * ui),
		rowLabel = Math.round(ROW_LABEL * ui),
		columnLabel = Math.round(COLUMN_LABEL * ui);
	const cw = crop.w * scale,
		ch = crop.h * scale;
	const colStride = Math.max(Math.round(MIN_COLUMN * ui), cw) + gap,
		rowStride = Math.max(Math.round(MIN_ROW * ui), ch) + gap;
	return {
		gap,
		rowLabel,
		columnLabel,
		cw,
		ch,
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
function chooseScale(sheets: SheetSpec[], crops: Crop[], top: number) {
	const pages = (scale: number) =>
		sheets.map((sheet, i) => pageCount(sheet, capacity(crops[i], scale)));
	for (let scale = top; scale >= 2; scale--) if (pages(scale).every((n) => n === 1)) return scale;
	for (let scale = top; scale >= 1; scale--)
		if (pages(scale).reduce((a, b) => a + b, 0) <= MAX_SHEETS) return scale;
	throw new AgentError(`These frames need more than ${MAX_SHEETS} sheets. ${FEWER}`, 'invalid');
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
const isEmpty = (cell: SheetCell) => cell.covered && !measureOf(cell)?.box;
const isPartial = (cell: SheetCell) => cell.covered && !!cell.missing?.length;
/** Cells drawn hatched because no frame exists there. */
export const uncoveredCells = (spec: Pick<SheetSpec, 'rows' | 'columns'>) =>
	cellsWhere(spec, (cell) => !cell.covered);
/** Cells whose frame exists but has no opaque pixel. */
export const emptyCells = (spec: Pick<SheetSpec, 'rows' | 'columns'>) => cellsWhere(spec, isEmpty);
/** Drawn cells that lack some worn items' layers. */
export const partialCells = (spec: Pick<SheetSpec, 'rows' | 'columns'>) =>
	cellsWhere(spec, isPartial);
/** partialCells with the ids of the items each one lacks. */
const missingItems = (spec: Pick<SheetSpec, 'rows' | 'columns'>) =>
	spec.rows.flatMap((row) =>
		row.cells.flatMap((cell, i) =>
			isPartial(cell) ? [{ row: row.label, column: spec.columns[i], items: cell.missing! }] : []
		)
	);

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
				const part = (label: string) => (pages === 1 ? label : `${label} (${page}/${pages})`);
				const spec: SheetPage = {
					...sheet,
					label: part(sheet.label),
					shown: sheet.shown === undefined ? undefined : part(sheet.shown),
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
							empty: emptyCells(spec),
							missingItems: missingItems(spec)
						}
					}
				});
			}
		return result;
	});
}

/** How the panel shows a page in `area` (CSS pixels) on a screen with `dpr` device pixels per CSS pixel. `pixels` is canvas
 *  (device) pixels per artwork pixel: the largest whole number up to the page's own scale at which the page fits, but not
 *  below about one CSS pixel. `shown` is that in CSS pixels, and `clipped` says the page is larger than the area even then. */
export function fitSheet(page: SheetPage, area: { width: number; height: number }, dpr = 1) {
	const least = Math.max(1, Math.round(dpr));
	const fits = (pixels: number) => {
		const size = sheetLayout(page.crop, pixels, page.columns.length, page.rows.length, dpr);
		return size.width <= area.width * dpr && size.height <= area.height * dpr;
	};
	let pixels = Math.max(least, Math.floor(page.scale * dpr));
	while (pixels > least && !fits(pixels)) pixels--;
	return { pixels, shown: pixels / dpr, clipped: !fits(pixels) };
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

export interface PaintOptions {
	/** Canvas pixels per artwork pixel (default: the page's scale). */
	scale?: number;
	/** Canvas pixels per CSS pixel of labels, gaps and lines (default 1). */
	ui?: number;
	text?: SheetText;
}

/** Draws one page; the canvas takes the page's size. */
export function paintSheet(
	g: SheetContext,
	spec: SheetPage,
	{ scale = spec.scale, ui = 1, text = ENGLISH }: PaintOptions = {}
) {
	const { crop, rows, columns, pivot, axes } = spec;
	const { width, height, cw, ch, colStride, rowStride, gap, rowLabel, columnLabel } = sheetLayout(
		crop,
		scale,
		columns.length,
		rows.length,
		ui
	);
	const u = (n: number) => Math.round(n * ui),
		line = Math.max(1, u(1));
	const font = (size: number) => `${u(size)}px system-ui, sans-serif`;
	g.canvas.width = width;
	g.canvas.height = height;
	const scratch = new OffscreenCanvas(1, 1),
		source = scratch.getContext('2d')!;
	g.imageSmoothingEnabled = false;
	g.fillStyle = PALETTE.sheet;
	g.fillRect(0, 0, width, height);
	g.textBaseline = 'middle';
	g.lineWidth = line;
	g.fillStyle = PALETTE.ink;
	// The corner names the axes on two lines: rows (down), then columns (across) beside the column labels.
	const upper = Math.round(columnLabel * 0.3),
		lower = Math.round(columnLabel * 0.72);
	g.font = font(11);
	if (axes.rows) g.fillText(`${text.axis(axes.rows)} ↓`, u(4), upper, rowLabel - u(6));
	if (axes.columns) g.fillText(`${text.axis(axes.columns)} →`, u(4), lower, rowLabel - u(6));
	g.font = font(12);
	columns.forEach((label, c) =>
		g.fillText(label, rowLabel + gap + c * colStride, lower, colStride - gap)
	);
	/** A small word on a cell ("no frame", "empty"), on a patch of the cell color so it stays readable over hatching. */
	const cellNote = (note: string, x: number, y: number) => {
		if (cw < u(40) || ch < u(12)) return;
		const w = Math.min(cw - u(4), g.measureText(note).width + u(6));
		g.fillStyle = PALETTE.cell;
		g.fillRect(x + (cw - w) / 2, y + ch / 2 - u(6), w, u(12));
		g.fillStyle = PALETTE.ink;
		g.textAlign = 'center';
		g.fillText(note, x + cw / 2, y + ch / 2, cw - u(6));
		g.textAlign = 'start';
	};
	for (const [r, row] of rows.entries()) {
		const y = columnLabel + gap + r * rowStride;
		g.fillStyle = PALETTE.ink;
		g.font = font(12);
		g.fillText(row.label, u(4), y + (rowStride - gap) / 2, rowLabel - u(8));
		g.font = font(10);
		for (const [c, cell] of row.cells.entries()) {
			const { covered, offset, marks } = cell;
			const x = rowLabel + gap + c * colStride;
			g.fillStyle = PALETTE.cell;
			g.fillRect(x, y, cw, ch);
			if (!covered) {
				g.strokeStyle = PALETTE.hatch;
				hatch(g, x, y, cw, ch, u(8));
			}
			// A bar under the cell marks a missing frame, or a frame drawn without some worn items, even when art fills it.
			if (!covered || isPartial(cell)) {
				g.fillStyle = PALETTE.hatch;
				g.fillRect(x, y + ch, cw, u(2));
			}
			const { x: ox, y: oy } = offset ?? { x: 0, y: 0 };
			const image = pixelsOf(cell);
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
			if (!covered) cellNote(text.noFrame, x, y);
			else if (isEmpty(cell)) {
				g.save();
				g.strokeStyle = PALETTE.hatch;
				g.setLineDash([u(4), u(3)]);
				g.strokeRect(x + line * 1.5, y + line * 1.5, cw - line * 3, ch - line * 3);
				g.restore();
				cellNote(text.empty, x, y);
			}
			// Detached parts, outlined one artwork pixel outside their box: yellow, edged in near black, kept within the cell.
			if (marks?.length) {
				g.save();
				g.beginPath();
				g.rect(x, y, cw, ch);
				g.clip();
				for (const box of marks) {
					const bx = x + (ox + box.x - 1 - crop.x) * scale,
						by = y + (oy + box.y - 1 - crop.y) * scale,
						bw = (box.w + 2) * scale,
						bh = (box.h + 2) * scale;
					g.strokeStyle = PALETTE.markEdge;
					g.strokeRect(bx - line / 2, by - line / 2, bw + line, bh + line);
					g.strokeStyle = PALETTE.mark;
					g.strokeRect(bx + line / 2, by + line / 2, bw - line, bh - line);
				}
				g.restore();
			}
			// Rulers in the gap above and left of the cell: a tick every 8 frame pixels, a longer one at the pivot. They stay
			// clear of the coverage bar under the previous row.
			g.fillStyle = PALETTE.ink;
			for (let col = Math.ceil(crop.x / 8) * 8; col <= crop.x + crop.w; col += 8)
				g.fillRect(x + (col - crop.x) * scale, y - u(3), line, u(2));
			for (let rw = Math.ceil(crop.y / 8) * 8; rw <= crop.y + crop.h; rw += 8)
				g.fillRect(x - u(3), y + (rw - crop.y) * scale, u(2), line);
			if (pivot && pivot.x >= crop.x && pivot.x <= crop.x + crop.w)
				g.fillRect(x + Math.round((pivot.x - crop.x) * scale) - line, y - u(4), 3 * line, u(4));
			if (pivot && pivot.y >= crop.y && pivot.y <= crop.y + crop.h)
				g.fillRect(x - u(4), y + Math.round((pivot.y - crop.y) * scale) - line, u(4), 3 * line);
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
