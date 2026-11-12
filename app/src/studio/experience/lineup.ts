// Preview's facing lineup: on a wide stage the selected facing stands beside other facings of the same character,
// all at one shared whole-pixel scale, so an outfit can be judged from several sides at once.
import type { DirectionName } from '../../lib/rig/rig.ts';
import type { Frame } from '../../lib/compose/compose.ts';
import { PAIRS } from '../characterConfig.ts';
import { actorScale } from './bounds.ts';

/** Which facings join the selected one, best first: front and back, then the east side. West-side facings are
 * usually mirrors of their east twins, so they come last, and a facing never stands beside its own twin. */
const PICK: DirectionName[] = [
	'south',
	'north',
	'east',
	'south-east',
	'north-east',
	'west',
	'south-west',
	'north-west'
];
/** Turnaround order, front to back; a west-side facing takes its twin's place. */
const ROW: DirectionName[] = [
	'south',
	'south-east',
	'south-west',
	'east',
	'west',
	'north-east',
	'north-west',
	'north'
];
export const MAX_FACINGS = 5;
/** A lineup is only worth it while every facing keeps at least this share of the single facing's scale. */
export const MIN_SHARE = 0.5;
/** Nor below 2 screen pixels per sprite pixel, where pixel art stops reading on small screens. */
const MIN_SCALE = 2;
/** Space between neighbors, as a share of the body's width. */
const GAP = 0.25;
/** Clear space kept at each side of the stage. */
const MARGIN = 16;

/** Where the selected facing stands: the center of an odd row, left of center in an even one. */
export const focalSlot = (count: number) => Math.floor((count - 1) / 2);

const twin = (d: DirectionName) => PAIRS.find((p) => p.includes(d))?.find((v) => v !== d);

/** Up to `count` facings left to right, always including `selected`; never a facing with its horizontal twin.
 * The turnaround is rotated so the selected facing stands at the focal slot (`focalSlot`), the others continuing
 * around it in turnaround order: selecting a neighbor turns the row like a turntable. */
export function pickFacings(
	available: readonly DirectionName[],
	selected: DirectionName,
	count: number
): DirectionName[] {
	if (!available.includes(selected)) return [selected];
	const shown = [selected];
	for (const d of PICK) {
		if (shown.length >= count) break;
		const other = twin(d);
		if (available.includes(d) && !shown.includes(d) && !(other && shown.includes(other)))
			shown.push(d);
	}
	shown.sort((a, b) => ROW.indexOf(a) - ROW.indexOf(b));
	const turn = shown.indexOf(selected) - focalSlot(shown.length);
	return shown.map((_, i) => shown[(i + turn + shown.length) % shown.length]);
}

export interface Lineup {
	facings: DirectionName[];
	scale: number;
	/** Each facing's pivot, in px from the stage's feet point. */
	offsets: number[];
}

/** How many facings fit and at what shared scale. Height fitting uses the bare body (`body`), as for a single
 * facing; widths use `reach`, the room any of the character's items can need (bounds.ts reachFrame), so no outfit
 * crosses a neighbor or the stage edge and equipping gear never resizes the lineup. The row itself is packed by
 * each facing's own reach (`facing`), so neighbors stand a comfortable gap apart near the stage center instead
 * of spreading to its edges. */
export function planLineup(options: {
	available: readonly DirectionName[];
	selected: DirectionName;
	body: Frame;
	reach: Frame;
	/** One facing's reach (bounds.ts reachFrame with a direction); defaults to `reach`. */
	facing?: (direction: DirectionName) => Frame;
	room: { above: number; side: number; below: number };
	/** Stage width in px. */
	width: number;
	dpr?: number;
}): Lineup {
	const { available, selected, body, reach, room, dpr = 1 } = options;
	const single = actorScale(body, room, dpr),
		density = Math.max(1, dpr),
		width = Math.max(0, options.width - 2 * MARGIN);
	const alone = { facings: [selected], scale: single, offsets: [0] };
	// Only a stage with floor to spare beside the facing gets a lineup: when the width already limits the single
	// facing, the stage is full.
	const tall = Math.min(
		body.y > 0 ? room.above / body.y : Infinity,
		body.h > body.y ? room.below / (body.h - body.y) : Infinity
	);
	if (room.side / Math.max(1, body.x, body.w - body.x) < tall) return alone;
	const candidates = pickFacings(available, selected, MAX_FACINGS);
	for (let n = candidates.length; n >= 2; n--) {
		const gap = body.w * GAP,
			fit = width / Math.max(1, n * reach.w + (n - 1) * gap),
			scale = Math.min(single, fit * density < 1 ? fit : Math.floor(fit * density) / density);
		if (scale < Math.max(MIN_SCALE, MIN_SHARE * single)) continue;
		const facings = pickFacings(available, selected, n);
		// Each facing stands one gap past its neighbor's reach; the row's painted extent is centered on the stage.
		const reaches = facings.map((d) => options.facing?.(d) ?? reach),
			pivots = [0];
		for (let i = 1; i < n; i++) {
			const before = reaches[i - 1],
				after = reaches[i];
			pivots.push(pivots[i - 1] + (before.w - before.x + gap + after.x) * scale);
		}
		const center =
			(pivots[0] -
				reaches[0].x * scale +
				pivots[n - 1] +
				(reaches[n - 1].w - reaches[n - 1].x) * scale) /
			2;
		return {
			facings,
			scale,
			offsets: pivots.map((p) => Math.round((p - center) * density) / density)
		};
	}
	return alone;
}
