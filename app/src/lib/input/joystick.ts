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
/**
 * Engine-agnostic stick logic; the host forwards pointer input and draws the snapshot however it likes. The two motion
 * flags combine into the classic types (JOYSTICK_TYPES) and their hybrids: a stick that rests in a corner, centers on
 * the press and then follows the finger is `{ rest, centerOnPress: true, follow: true }`.
 */
export interface JoystickOptions {
	readonly axis: JoystickAxis;
	/** Thumb-center throw in CSS pixels that gives full output. */
	readonly travel: number;
	/** Radial neutral zone in CSS pixels; output is rescaled so it still rises smoothly from zero. */
	readonly deadZone: number;
	/** Drag the base along when the finger passes full throw, so reversing never has to undo an overshoot. */
	readonly follow: boolean;
	/** Center the base on the press point, so a press starts at zero output. Off keeps the base at rest. Default on. */
	readonly centerOnPress?: boolean;
	/** Where the base waits while idle, and returns on release. Without one the stick shows only while pressed. */
	readonly rest?: Point | null;
	/** Distance from `rest` that accepts a press. Defaults to `travel` with a rest point; without one, anywhere. */
	readonly activationRadius?: number;
}
export interface JoystickSnapshot {
	readonly pointerId: number | null;
	/** The base center: the rest point (or null) while idle, the press point or rest while pressed, moved by `follow`. */
	readonly origin: Point | null;
	/** Thumb-center displacement from the origin, clamped to a circle of radius `travel`. */
	readonly offset: Point;
	/** Analog output in screen space, magnitude 0 to 1. */
	readonly value: Point;
}

/** The reference VirtualJoystick's types, as flag presets. */
export const JOYSTICK_TYPES = {
	/** Centers on the press: the most intuitive for new players. */
	dynamic: { centerOnPress: true, follow: false },
	/** Stays where it is: the most precise for experienced players. */
	fixed: { centerOnPress: false, follow: false },
	/** A finger past the rim drags the stick along: fluid. */
	follow: { centerOnPress: false, follow: true }
} as const satisfies Record<string, Pick<JoystickOptions, 'centerOnPress' | 'follow'>>;

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

/** One stick, driven by one pointer from press until it lifts. */
export class Joystick {
	readonly options: JoystickOptions;
	readonly #idle: JoystickSnapshot;
	#state: JoystickSnapshot;

	constructor(options: JoystickOptions) {
		const { travel, deadZone, rest, activationRadius } = options;
		if (
			!Number.isFinite(travel) ||
			!Number.isFinite(deadZone) ||
			deadZone < 0 ||
			deadZone >= travel ||
			(rest && !finite(rest)) ||
			(activationRadius !== undefined && !(activationRadius >= 0))
		)
			throw new RangeError(
				`Invalid joystick geometry: travel ${travel}, dead zone ${deadZone}, activation ${activationRadius}`
			);
		this.options = { ...options };
		this.#idle = rest ? Object.freeze({ ...IDLE, origin: { x: rest.x, y: rest.y } }) : IDLE;
		this.#state = this.#idle;
	}

	get snapshot(): JoystickSnapshot {
		return this.#state;
	}
	get pressed(): boolean {
		return this.#state.pointerId !== null;
	}

	/** Whether a press here would take the stick: within the activation radius of its rest point. */
	contains(point: Point): boolean {
		const { rest, activationRadius, travel } = this.options;
		if (!finite(point)) return false;
		if (!rest) return true;
		const reach = activationRadius ?? travel;
		return Math.hypot(point.x - rest.x, point.y - rest.y) <= reach;
	}

	/** Takes the stick for this pointer, unless another pointer holds it or the press is outside its area. */
	begin(pointerId: number, point: Point): JoystickSnapshot {
		if (this.pressed || !this.contains(point)) return this.#state;
		const { rest, centerOnPress = true } = this.options;
		const origin = centerOnPress || !rest ? { x: point.x, y: point.y } : rest;
		this.#state = { pointerId, origin, offset: ZERO, value: ZERO };
		// A stick that keeps its base gives output from the press itself, as if dragged there.
		return origin === rest ? this.move(pointerId, point) : this.#state;
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

	/** Lets go: back at rest (or hidden) with zero output. */
	cancel(): JoystickSnapshot {
		this.#state = this.#idle;
		return this.#idle;
	}
}
