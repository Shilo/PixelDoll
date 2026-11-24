// Flat-ground jump for the live views (docs/design/live-view-controls-plan.md). Heights are in standing body heights,
// so a different frame, outfit, zoom or viewport never changes the arc. For a peak `h` reached after `t` seconds, rising
// gravity is 2h/t² and launch speed 2h/t; falling gravity is stronger, so landing feels weighty (GDC "Building a Better
// Jump"). The simulation owns height; the authored pivot never moves.
export const JUMP = { height: 0.35, apexSeconds: 0.22, fallGravity: 1.5 } as const;

export interface JumpState {
	/** Above the floor in standing body heights; 0 on the floor. */
	height: number;
	/** Upward speed in body heights per second. */
	velocity: number;
}
export const GROUNDED: JumpState = Object.freeze({ height: 0, velocity: 0 });

const rise = (2 * JUMP.height) / JUMP.apexSeconds ** 2,
	fall = rise * JUMP.fallGravity,
	launchSpeed = (2 * JUMP.height) / JUMP.apexSeconds,
	fallSeconds = Math.sqrt((2 * JUMP.height) / fall);
/** Seconds from takeoff to landing. */
export const FLIGHT_SECONDS = JUMP.apexSeconds + fallSeconds;

export const airborne = (state: JumpState) => state.height > 0 || state.velocity > 0;

/** Takes off from the floor only; a jump in flight is unchanged. */
export const launch = (state: JumpState): JumpState =>
	airborne(state) ? state : { height: 0, velocity: launchSpeed };

/** Advances by elapsed seconds, splitting a step that crosses the apex so falling gravity starts there. */
export function stepJump(state: JumpState, seconds: number): JumpState {
	let dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
	if (!airborne(state) || !dt) return state;
	let { height, velocity } = state;
	if (velocity > 0) {
		const toApex = Math.min(dt, velocity / rise);
		height += velocity * toApex - (rise * toApex ** 2) / 2;
		velocity -= rise * toApex;
		dt -= toApex;
		if (velocity < 1e-9) velocity = 0;
	}
	if (dt > 0) {
		height += velocity * dt - (fall * dt ** 2) / 2;
		velocity -= fall * dt;
	}
	return height <= 0 ? GROUNDED : { height, velocity };
}

/** How far through the flight the jump is, 0 at takeoff to 1 at landing, for sampling a Jump clip. */
export function flightPhase(state: JumpState): number {
	if (!airborne(state)) return 0;
	const seconds =
		state.velocity > 0
			? (launchSpeed - state.velocity) / rise
			: JUMP.apexSeconds + -state.velocity / fall;
	return Math.min(1, Math.max(0, seconds / FLIGHT_SECONDS));
}
