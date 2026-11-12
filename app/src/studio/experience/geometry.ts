// Scene composition shared by CSS (as custom properties), the actor canvas, the cast and toasts, so the
// character's feet, the playback bar, the panel and the world's floor all agree on one set of numbers.
// Approved in docs/design/2026-11-11-ui-refinement/ui-lab-5.html (its geo()).

export type Screen = 'characters' | 'studio';
export interface Box {
	l: number;
	r: number;
	t: number;
	b: number;
}
export interface Layout {
	screen: Screen;
	w: number;
	h: number;
	/** Short landscape: the panel stays beside the stage. */
	short: boolean;
	/** The panel is a bottom sheet (phones and portrait tablets). */
	sheet: boolean;
	phone: boolean;
	edge: number;
	top: number;
	/** Header row height and the header's bottom edge. */
	row: number;
	headerBottom: number;
	rail: number;
	/** Sheet height and top; 0 when the panel is a side rail, or hidden because no usable sheet fits. */
	sheetHeight: number;
	sheetTop: number;
	/** Side rail top. */
	railTop: number;
	/** Free stage: between the header (and phone view tabs) and the panel. */
	stage: Box;
	/** Playback bar top and height (Customize). */
	playbackTop: number;
	playbackHeight: number;
	/** A narrow stage: the bar keeps 44 px targets by moving Inspect into More and dropping its separators. */
	compactPlayback: boolean;
	/** Too narrow even for that: one facing button that cycles the directions replaces the direction buttons. */
	cycleFacing: boolean;
	/** Characters on a phone: where the cast list starts. */
	listTop: number;
	/** The character's feet. */
	feet: { x: number; y: number };
	/** Share of the free height the character may fill. */
	fill: number;
	/** The column toasts center over: the stage beside a tall rail, else (a sheet, short landscape) the whole width,
	 * where a toast wraps less and so covers less of the character. */
	column: { l: number; r: number };
	/** Toast top edge. */
	toastTop: number;
}

export const PLAYBACK_HEIGHT = 54;
/** The phone's floating view tab row under the header. */
export const VIEW_TABS = 40;
/** The side rail's first row: Customize's panel tabs, 44 px. */
const PANEL_ROW = 44;
/** The eye line sits this share of the visible character height above the feet. */
export const EYE = 0.86;
const GAP = 12;
/** Stage widths below which the playback bar goes compact, then cycles facing (Play, move, four directions need ~300 px). */
const COMPACT_STAGE = 430,
	CYCLE_STAGE = 300;
/** The shortest bottom sheet that still shows a category header and a row of tiles. */
const MIN_SHEET = 200;
/** Stage height the playback bar needs under the header: the feet 16 px below the stage top, 14 px above the bar,
 * the bar and its 10 px gap above a sheet. */
const STAGE_FLOOR = 16 + 14 + PLAYBACK_HEIGHT + 10;
/** The narrowest stage worth keeping beside a side rail. */
const MIN_STAGE = 200;
/** Room above the feet a phone keeps for the hero: a whole 64 px frame at 2 whole pixels per pixel. */
const PHONE_HERO = 128;

export function layout(w: number, h: number, screen: Screen): Layout {
	const short = h <= 540,
		phone = w <= 600;
	const edge = phone ? 16 : w < 1100 ? 20 : w >= 1920 ? 32 : 24;
	const top = short || phone ? 8 : 12,
		row = short || phone ? 44 : 48,
		headerBottom = top + row;
	const rail = w < 1100 ? (w < 900 ? 300 : 320) : Math.min(420, Math.max(340, w * 0.24));
	const studio = screen === 'studio';
	// Phone widths always use the sheet: a side rail would leave no stage (320×400 is short but too narrow).
	let sheet = phone || (!short && (w <= 760 || (w < h && w <= 1024)));
	// Phone widths and sheets float the view tabs in a row under the bar.
	const tabs = studio && (sheet || phone) ? VIEW_TABS : 0;
	// Compact heights (320×568) give the stage enough room for a 2x hero above the playback bar before the sheet grows.
	const heroFloor = headerBottom + tabs + 16 + PHONE_HERO / 0.75 + 14 + PLAYBACK_HEIGHT + 10;
	let sheetHeight = sheet
		? Math.round(Math.min(h - 250, Math.max(240, h * 0.45), Math.max(200, h - heroFloor)))
		: 0;
	if (sheet && sheetHeight < MIN_SHEET) {
		// Too short for a usable sheet (a phone in landscape, a squat window): the panel moves beside the stage when a
		// stage still fits next to it; otherwise it keeps a usable height if the stage still fits above it, else it
		// hides until the window grows (a sliver of a sheet shows nothing usable and covers the character).
		if (w - edge - rail - GAP >= MIN_STAGE) {
			sheet = false;
			sheetHeight = 0;
		} else sheetHeight = h - headerBottom - tabs - STAGE_FLOOR >= MIN_SHEET ? MIN_SHEET : 0;
	}
	const sheetTop = h - sheetHeight;
	const railTop = headerBottom + (short ? 4 : 12);
	const stage: Box = sheet
		? { l: 0, r: w, t: headerBottom + tabs, b: sheetTop }
		: { l: 0, r: Math.max(0, w - edge - rail - GAP), t: headerBottom + tabs, b: h };
	const stageWidth = stage.r - stage.l,
		compactPlayback = stageWidth <= COMPACT_STAGE,
		cycleFacing = stageWidth < CYCLE_STAGE,
		playbackHeight = PLAYBACK_HEIGHT;
	// A phone held sideways (short, with the floating view tabs) lowers the bar to the window edge and lets the hero
	// fill more of the little height left, so it still draws at 2 whole pixels per pixel.
	const tight = studio && short && !sheet && tabs > 0;
	// The bar never rises into the header or the view tabs, even in windows too short for the usual spacing.
	const playbackTop = Math.max(
		stage.t + 16 + 14,
		(sheetHeight ? sheetTop - 10 : tight ? h - 8 : h - edge) - playbackHeight
	);
	const listTop = Math.round(h * 0.6);
	// The feet always stay below the header, even in windows too short for the usual spacing.
	const feetY = Math.max(
		stage.t + 16,
		studio ? playbackTop - (tight ? 10 : 14) : sheet ? listTop - 86 : h - edge - 100
	);
	const column = sheet || short ? { l: 0, r: w } : { l: stage.l, r: stage.r };
	return {
		screen,
		w,
		h,
		short,
		sheet,
		phone,
		edge,
		top,
		row,
		headerBottom,
		rail,
		sheetHeight,
		sheetTop,
		railTop,
		stage,
		playbackTop,
		playbackHeight,
		compactPlayback,
		cycleFacing,
		listTop,
		feet: { x: Math.round((stage.l + stage.r) / 2), y: feetY },
		fill: tight ? 0.9 : studio ? 0.75 : 0.6,
		column,
		// Spanning the width beside a short rail, a toast on Customize starts under the panel tabs so it never covers
		// them. Characters keeps it high: lower, it would hide the selected character, the screen's hero.
		toastTop: Math.max(
			headerBottom + 8 + tabs,
			studio && !sheet && short ? railTop + PANEL_ROW + 8 : 0
		)
	};
}

/** Room around the feet the hero may fill: its share of the free height above them, 31% of the stage width to each
 * side and down to the stage bottom. The actor canvas and the cast both fit into it. */
export function heroRoom(g: Layout): { above: number; side: number; below: number } {
	return {
		above: Math.max(0, g.feet.y - g.stage.t - 16) * g.fill,
		side: Math.max(0, g.stage.r - g.stage.l) * 0.31,
		below: Math.max(8, g.stage.b - g.feet.y)
	};
}

/** Largest whole-pixel scale at which a `width`×`height` px character above the feet fits its room. */
export function heroScale(g: Layout, height: number, width: number): number {
	const room = heroRoom(g);
	return Math.max(
		1,
		Math.floor(Math.min(room.above / Math.max(1, height), (2 * room.side) / Math.max(1, width)))
	);
}

export interface WorldArt {
	/** Image size in px. */
	width: number;
	height: number;
	/** Horizon (the eye line) and floor point as fractions of the image height; the floor point sits on the vanishing line x 0.5. */
	horizon: number;
	floor: number;
}
export interface Placement {
	scale: number;
	x: number;
	y: number;
	/** Height of the covered area: down to just under a bottom sheet, else the viewport. */
	coverBottom: number;
	/** The character's eye line, where the image horizon sits. */
	eye: number;
	/** Whether the image's vanishing line (x 0.5) sits on the character; false only when that would need over 1.3x
	 * (then the image is 1.3x and clamped to the viewport edge on the far side). */
	centered: boolean;
}

/** Uniformly scale the world (never stretch) with its horizon on the character's eye line and its vanishing line on
 * the character, covering the viewport down to `coverBottom` with no gaps. The floor is a uniform plane, so with the
 * horizon at eye level the feet always stand on it. */
export function placeWorld(
	g: Layout,
	art: WorldArt,
	feet: { x: number; y: number },
	characterHeight: number
): Placement {
	// Only Customize shows a bottom sheet; the world reaches just under it. Characters' list sits on the world itself.
	const coverBottom = g.sheet && g.screen === 'studio' ? g.sheetTop + 24 : g.h;
	const eye = feet.y - EYE * characterHeight,
		above = art.horizon * art.height,
		below = (1 - art.horizon) * art.height;
	const base = Math.max(
		// The world's own proportions: its floor point would sit at the feet.
		(EYE * characterHeight) / ((art.floor - art.horizon) * art.height),
		eye / above,
		(coverBottom - eye) / below,
		g.w / art.width
	);
	// Grow up to 1.3x to bring the vanishing line onto the character; past that, stay at 1.3x and clamp to the far
	// edge. The scale is continuous in the window size, so resizing never makes the world jump.
	const centeredScale = (2 * Math.max(feet.x, g.w - feet.x)) / art.width;
	const scale = Math.min(Math.max(base, centeredScale), base * 1.3);
	const centered = centeredScale <= scale * (1 + 1e-9);
	return {
		scale,
		x: Math.min(0, Math.max(g.w - scale * art.width, feet.x - scale * 0.5 * art.width)),
		y: eye - scale * above,
		coverBottom,
		eye,
		centered
	};
}
