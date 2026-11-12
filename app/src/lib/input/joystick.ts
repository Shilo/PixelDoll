/** Screen coordinates in CSS pixels: x points right, y points down. */
export interface Point {
	readonly x: number;
	readonly y: number;
}
/** 'x' locks the stick to a horizontal track (side-scrolling). */
export type JoystickAxis = 'xy' | 'x';
/** Outer diameters of the base ring and the thumb, and the ring's stroke width. */
export interface JoystickSize {
	readonly base: number;
	readonly thumb: number;
	readonly stroke: number;
}
export interface JoystickOptions {
	readonly axis: JoystickAxis;
	/** Thumb-center throw in CSS pixels that gives full output. */
	readonly travel: number;
	/** Radial neutral zone in CSS pixels; output is rescaled so it still rises smoothly from zero. */
	readonly deadZone: number;
	/** Drag the base along when the finger passes full throw, so reversing never has to undo an overshoot. */
	readonly follow: boolean;
}
export interface JoystickSnapshot {
	readonly pointerId: number | null;
	/** The base center; it moves with the finger when `follow` is on. Null while idle. */
	readonly origin: Point | null;
	/** Thumb-center displacement from the origin, clamped to a circle of radius `travel`. */
	readonly offset: Point;
	/** Analog output in screen space, magnitude 0 to 1. */
	readonly value: Point;
}

const ZERO: Point = Object.freeze({ x: 0, y: 0 });
export const IDLE: JoystickSnapshot = Object.freeze({
	pointerId: null,
	origin: null,
	offset: ZERO,
	value: ZERO
});
const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

/** At full throw the thumb's edge meets the inside of the ring, so the thumb never leaves its base. */
export const joystickTravel = (size: JoystickSize): number =>
	(size.base - size.thumb) / 2 - size.stroke;

/** One floating stick: it appears where a pointer lands and follows only that pointer until it lifts. */
export class Joystick {
	#state: JoystickSnapshot = IDLE;
	readonly options: JoystickOptions;

	constructor(options: JoystickOptions) {
		const { travel, deadZone } = options;
		if (
			!Number.isFinite(travel) ||
			!Number.isFinite(deadZone) ||
			deadZone < 0 ||
			deadZone >= travel
		)
			throw new RangeError(`Invalid joystick geometry: travel ${travel}, dead zone ${deadZone}`);
		this.options = { ...options };
	}

	get snapshot(): JoystickSnapshot {
		return this.#state;
	}

	begin(pointerId: number, point: Point): JoystickSnapshot {
		if (this.#state.pointerId === null && finite(point))
			this.#state = { pointerId, origin: { x: point.x, y: point.y }, offset: ZERO, value: ZERO };
		return this.#state;
	}

	move(pointerId: number, point: Point): JoystickSnapshot {
		const { origin } = this.#state;
		if (this.#state.pointerId !== pointerId || !origin) return this.#state;
		if (!finite(point)) return this.cancel();
		const { axis, travel, deadZone, follow } = this.options;
		let dx = point.x - origin.x,
			dy = axis === 'x' ? 0 : point.y - origin.y;
		const length = Math.hypot(dx, dy);
		let next = origin;
		if (length > travel) {
			const keep = travel / length;
			if (follow) next = { x: origin.x + dx * (1 - keep), y: origin.y + dy * (1 - keep) };
			dx *= keep;
			dy *= keep;
		}
		const reach = Math.min(length, travel),
			strength = Math.max(0, (reach - deadZone) / (travel - deadZone));
		this.#state = {
			pointerId,
			origin: next,
			offset: { x: dx, y: dy },
			value: strength > 0 ? { x: (dx / reach) * strength, y: (dy / reach) * strength } : ZERO
		};
		return this.#state;
	}

	end(pointerId: number): JoystickSnapshot {
		return this.#state.pointerId === pointerId ? this.cancel() : this.#state;
	}

	cancel(): JoystickSnapshot {
		this.#state = IDLE;
		return IDLE;
	}
}
