import {
	bakedFrame,
	equipped,
	hiddenSlots,
	layerFrame,
	rigFrame,
	unionFrame,
	shownItems,
	type Frame
} from '../../lib/compose/compose.ts';
import type { Img } from '../../lib/image/png.ts';
import type { DirectionName, Preset, Project } from '../../lib/store/manifest.ts';

interface Pixels {
	left: number;
	top: number;
	right: number;
	bottom: number;
}
// Images are immutable project assets. Replacing an image invalidates its entry
// naturally; palette copies have their own identities. Null means transparent.
const pixels = new WeakMap<Img, Pixels | null | false>();
function paintedPixels(image: Img): Pixels | null | false {
	const cached = pixels.get(image);
	if (cached !== undefined) return cached;
	const { w, h, data } = image;
	if (
		!Number.isInteger(w) ||
		!Number.isInteger(h) ||
		w <= 0 ||
		h <= 0 ||
		!data ||
		data.length !== w * h * 4
	) {
		pixels.set(image, false);
		return false;
	}
	let left = w,
		top = h,
		right = 0,
		bottom = 0;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			if (!data[(y * w + x) * 4 + 3]) continue;
			left = Math.min(left, x);
			top = Math.min(top, y);
			right = Math.max(right, x + 1);
			bottom = Math.max(bottom, y + 1);
		}
	const bounds = right ? { left, top, right, bottom } : null;
	pixels.set(image, bounds);
	return bounds;
}
const validFrame = (frame: Frame): boolean =>
	Number.isInteger(frame.w) &&
	frame.w > 0 &&
	Number.isInteger(frame.h) &&
	frame.h > 0 &&
	Number.isFinite(frame.x) &&
	Number.isFinite(frame.y);

/** Stable painted union of every pose of the current visible outfit, including
 * original body rests. Frame.x/y locate the pivot within this union, exactly as
 * bakedFrame does. Use only for fitting; render/export still use the full frame.
 * With a direction, only that facing's poses count (a mirrored facing as its source, flipped).
 * Call on project/outfit changes, never once per animation frame. */
export function paintedFrame(
	project: Project,
	items: Preset['items'],
	direction?: DirectionName
): Frame {
	const m = project.manifest;
	const baked = bakedFrame(m),
		rig = rigFrame(m.rig);
	// If even the baked metadata is broken, keep a finite rig-sized fallback.
	const fallback = validFrame(baked)
		? baked
		: validFrame(rig)
			? rig
			: { w: 64, h: 64, x: 32, y: 64 };
	if (!validFrame(baked) || !validFrame(rig)) return fallback;
	const mirrored = !direction && m.rig.directions.some((d) => !!d.mirrorOf),
		source = direction && m.rig.directions.find((d) => d.id === direction)?.mirrorOf;
	const on = equipped(m, items),
		hidden = hiddenSlots(m, on);
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	function include(image: Img | undefined, frame: Frame, flip: boolean): boolean {
		if (!image || image.w !== frame.w || image.h !== frame.h || !validFrame(frame)) return false;
		const bounds = paintedPixels(image);
		if (bounds === false) return false;
		if (!bounds) return true;
		const x0 = flip
			? frame.w - bounds.right
			: mirrored
				? Math.min(bounds.left, frame.w - bounds.right)
				: bounds.left;
		const x1 = flip
			? frame.w - bounds.left
			: mirrored
				? Math.max(bounds.right, frame.w - bounds.left)
				: bounds.right;
		left = Math.min(left, x0 - frame.x);
		right = Math.max(right, x1 - frame.x);
		top = Math.min(top, bounds.top - frame.y);
		bottom = Math.max(bottom, bounds.bottom - frame.y);
		return true;
	}
	for (const item of shownItems(m, on)) {
		if (hidden.has(item.slot)) continue;
		if (!m.slots.some((slot) => slot.id === item.slot)) return fallback;
		for (const layer of item.layers) {
			const frame = layerFrame(m.rig, layer);
			if (!validFrame(frame)) return fallback;
			for (const directions of Object.values(layer.cells ?? {})) {
				if (!directions || typeof directions !== 'object' || Array.isArray(directions))
					return fallback;
				const own = direction && directions[direction],
					mirror = source && directions[source];
				const lists: [unknown, boolean][] = !direction
					? Object.values(directions).map((cells) => [cells, false])
					: own
						? [[own, false]]
						: mirror
							? [[mirror, true]]
							: [];
				for (const [cells, flip] of lists) {
					if (!Array.isArray(cells)) return fallback;
					for (const hash of cells) {
						if (hash === null) continue; // Authored transparent cell.
						if (
							typeof hash !== 'string' ||
							!include(
								project.layerImages?.get(layer)?.get(hash) ?? project.images.get(hash),
								frame,
								flip
							)
						)
							return fallback;
					}
				}
			}
		}
	}
	return Number.isFinite(left)
		? { w: right - left, h: bottom - top, x: left === 0 ? 0 : -left, y: top === 0 ? 0 : -top }
		: fallback;
}

/** Painted union of the bare body and every item the character owns, each worn alone: the room any outfit can
 * need. It does not depend on what is worn, so fitting by it never changes when gear is equipped. Call on project
 * changes, never once per animation frame. With a direction, only that facing counts. */
export function reachFrame(project: Project, direction?: DirectionName): Frame {
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	const include = (f: Frame) => {
		left = Math.min(left, -f.x);
		top = Math.min(top, -f.y);
		right = Math.max(right, f.w - f.x);
		bottom = Math.max(bottom, f.h - f.y);
	};
	include(paintedFrame(project, {}, direction));
	const m = project.manifest;
	for (const item of m.items)
		if (item.id !== m.rig.baseItem)
			include(paintedFrame(project, { [item.slot]: item.id }, direction));
	return { w: right - left, h: bottom - top, x: -left, y: -top };
}

export function previewBounds(project: Project) {
	const rig = project.manifest.rig;
	const bodies: Frame[] = [];
	const facings = new Map<DirectionName, { x: number; y: number; reach: Frame }>();
	for (const direction of rig.directions) {
		const body = paintedFrame(project, {}, direction.id);
		const reference =
			rig.rest?.[direction.id] ?? (direction.mirrorOf ? rig.rest?.[direction.mirrorOf] : undefined);
		const image = reference && project.images.get(reference.image);
		const pixels =
			image && image.w === rig.cell.w && image.h === rig.cell.h ? paintedPixels(image) : null;
		const flip = !rig.rest?.[direction.id] && !!direction.mirrorOf;
		const referenceFrame = pixels
			? {
					w: pixels.right - pixels.left,
					h: pixels.bottom - pixels.top,
					x: rig.pivot.x - (flip ? rig.cell.w - pixels.right : pixels.left),
					y: rig.pivot.y - pixels.top
				}
			: body;
		const x = referenceFrame.w / 2 - referenceFrame.x;
		const y = referenceFrame.h - referenceFrame.y;
		const reach = unionFrame([reachFrame(project, direction.id), referenceFrame]);
		facings.set(direction.id, { x, y, reach: { ...reach, x: reach.x + x, y: reach.y + y } });
		const fitted = unionFrame([body, referenceFrame]);
		bodies.push({ ...fitted, x: fitted.x + x, y: fitted.y + y });
	}
	return {
		body: bodies.length ? unionFrame(bodies) : paintedFrame(project, {}),
		reach: facings.size
			? unionFrame([...facings.values()].map((facing) => facing.reach))
			: reachFrame(project),
		facings
	};
}

/** Fit the complete pivot-relative frame into the room around the feet: `above` the pivot (the hero's share of
 * the free stage height), `side` px each way from it and `below` it. Oversize gear and large imported sprites must
 * not cross controls. Prefer whole device pixels; a source larger than the room is minified with nearest-neighbor
 * sampling. */
export function actorScale(
	frame: { w: number; h: number; x: number; y: number },
	room: { above: number; side: number; below: number },
	dpr = 1
): number {
	const density = Math.max(1, dpr);
	const fit = Math.max(
		0,
		Math.min(
			room.side / Math.max(1, frame.x),
			room.side / Math.max(1, frame.w - frame.x),
			frame.y > 0 ? room.above / frame.y : Infinity,
			frame.h - frame.y > 0 ? room.below / (frame.h - frame.y) : Infinity
		)
	);
	return fit * density < 1 ? fit : Math.floor(fit * density) / density;
}
