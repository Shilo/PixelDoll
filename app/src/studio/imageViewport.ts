/** Where an image sits in a zoomable viewer: CSS pixels per image pixel, and the image's top-left corner in the
 *  viewer's own coordinates. */
export interface Viewport {
	scale: number;
	x: number;
	y: number;
}

export interface Size {
	w: number;
	h: number;
}

/** The largest scale that shows the whole image; at or above 100% it snaps down to whole device pixels so pixel art
 *  stays even. */
export function fitScale(view: Size, image: Size, dpr = 1): number {
	if (view.w <= 0 || view.h <= 0 || image.w <= 0 || image.h <= 0) return 1;
	const fit = Math.min(view.w / image.w, view.h / image.h);
	return fit >= 1 ? Math.max(1, Math.floor(fit * dpr)) / dpr : fit;
}

/** The image at `scale`, centered. */
export function centered(view: Size, image: Size, scale: number): Viewport {
	return { scale, x: (view.w - image.w * scale) / 2, y: (view.h - image.h * scale) / 2 };
}

/** Keeps the image reachable: larger than the view on an axis, it covers the view (no empty edge can be dragged in);
 *  smaller, it stays wholly inside. */
export function clampViewport(viewport: Viewport, view: Size, image: Size): Viewport {
	const axis = (offset: number, room: number, size: number) => {
		const low = Math.min(0, room - size),
			high = Math.max(0, room - size);
		return Math.min(high, Math.max(low, offset));
	};
	return {
		scale: viewport.scale,
		x: axis(viewport.x, view.w, image.w * viewport.scale),
		y: axis(viewport.y, view.h, image.h * viewport.scale)
	};
}

/** Zooms to `scale` keeping the image pixel under `point` (viewer coordinates) where it is. */
export function zoomAround(
	viewport: Viewport,
	point: { x: number; y: number },
	scale: number
): Viewport {
	const ratio = scale / viewport.scale;
	return {
		scale,
		x: point.x - (point.x - viewport.x) * ratio,
		y: point.y - (point.y - viewport.y) * ratio
	};
}

/** The next zoom a button or key steps to: half again larger or smaller, landing on the fit when a step would pass it,
 *  within the bounds. Steps are proportional because a viewer's fit can be any size (a small sprite fits at 2700%). */
export function viewerZoomStep(
	zoom: { scale: number; fit: number; min: number; max: number },
	direction: 1 | -1
): number {
	const next = zoom.scale * 1.5 ** direction;
	const passesFit =
		direction > 0
			? zoom.scale < zoom.fit - 1e-9 && next > zoom.fit
			: zoom.scale > zoom.fit + 1e-9 && next < zoom.fit;
	return Math.min(zoom.max, Math.max(zoom.min, passesFit ? zoom.fit : next));
}
