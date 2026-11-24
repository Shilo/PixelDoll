// Attack and jump timing for the live views. Input only asks; the scene steps this once per frame with the elapsed time,
// so a paused scene (a sheet or hidden page passes 0) never skips takeoff, landing or the rest of an attack.
import { sampleTimeline } from '../../lib/runtime/timeline.js';
import { airborne, flightPhase, GROUNDED, launch, stepJump, type JumpState } from './jump.ts';
import type { Vector } from './movement.ts';
import type { BodySequence } from './presentation.ts';

/** A held attack starts the next one only after the last has finished and at least this long after it started. */
export const ATTACK_GAP_MS = 200;

export class LiveActions {
	jump: JumpState = GROUNDED;
	attack: { sequence: BodySequence; elapsed: number } | null = null;
	#pending: Vector | null = null;
	/** Held attack inputs (keyboard, mouse) with their current aim, newest last. */
	#holds = new Map<string, () => Vector>();
	#sinceStart = Infinity;

	/** One attack. Ignored while one plays, so extra taps never queue up. */
	request(aim: Vector) {
		if (!this.attack) this.#pending = aim;
	}
	/** Attacks now and again after each finished attack, with fresh aim, until released. */
	hold(source: string, aim: () => Vector) {
		this.#holds.delete(source);
		this.#holds.set(source, aim);
		this.request(aim());
	}
	release(source: string) {
		this.#holds.delete(source);
	}
	get holding() {
		return this.#holds.size > 0;
	}
	/** Takes off from the floor; ignored in the air. */
	takeOff() {
		this.jump = launch(this.jump);
	}
	get grounded() {
		return !airborne(this.jump);
	}
	/** Lost focus or a cancel: stop asking. A playing attack or jump finishes. */
	letGo() {
		this.#holds.clear();
		this.#pending = null;
	}
	reset() {
		this.letGo();
		this.attack = null;
		this.jump = GROUNDED;
		this.#sinceStart = Infinity;
	}

	/** Advances by elapsed ms. Returns the aim of an attack to start now, for the scene to resolve and `start`. */
	step(deltaMs: number): Vector | null {
		const dt = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
		this.#sinceStart += dt;
		this.jump = stepJump(this.jump, dt / 1000);
		if (this.attack) {
			this.attack.elapsed += dt;
			if (this.attack.elapsed >= this.attack.sequence.duration) this.attack = null;
		}
		if (this.attack || this.#sinceStart < ATTACK_GAP_MS) return null;
		const held = [...this.#holds.values()].at(-1);
		const aim = this.#pending ?? held?.() ?? null;
		this.#pending = null;
		return aim;
	}
	start(sequence: BodySequence) {
		this.attack = { sequence, elapsed: 0 };
		this.#sinceStart = 0;
	}
	/** An attack that could not play (no art for that aim) waits the same gap before a held input asks again. */
	refused() {
		this.#sinceStart = 0;
	}
	/** The playing attack's frame. */
	attackCell() {
		const attack = this.attack;
		return attack
			? sampleTimeline(
					attack.sequence.frames,
					Math.min(attack.elapsed, attack.sequence.duration - 1e-3)
				)
			: null;
	}
	/** A Jump clip's frame for the current point of the flight, so the art follows the arc. */
	jumpCell(sequence: BodySequence) {
		return sampleTimeline(
			sequence.frames,
			Math.min(flightPhase(this.jump) * sequence.duration, sequence.duration - 1e-3)
		);
	}
}
