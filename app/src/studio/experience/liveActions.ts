// Attack and jump timing for the live views. Input only asks; the scene steps this once per frame with the elapsed time,
// so a paused scene (a sheet or hidden page passes 0) never skips takeoff, landing or the rest of an attack.
import { sampleTimeline } from '../../lib/runtime/timeline.js';
import type { AttackSector } from './attack.ts';
import { airborne, flightPhase, GROUNDED, launch, stepJump, type JumpState } from './jump.ts';
import type { Vector } from './movement.ts';
import type { BodySequence } from './presentation.ts';

/** A held attack starts the next one only after the last has finished and at least this long after it started. */
export const ATTACK_GAP_MS = 200;

export class LiveActions {
	jump: JumpState = GROUNDED;
	/** The playing attack. `duration` is the first swing's, kept when it turns, so turning never stretches or cuts it. */
	attack: {
		sequence: BodySequence;
		sector: AttackSector;
		elapsed: number;
		duration: number;
	} | null = null;
	#pending: Vector | null = null;
	/** Held attack inputs (key, mouse, button, stick) with their current aim, newest last. */
	#holds = new Map<string, () => Vector>();
	/** Held jump inputs (key, button): each landing takes off again while any is held. */
	#jumps = new Set<string>();
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
	holds(source: string) {
		return this.#holds.has(source);
	}
	/** The newest held input's aim right now, for a playing attack to turn to; null when nothing is held. */
	heldAim(): Vector | null {
		return [...this.#holds.values()].at(-1)?.() ?? null;
	}
	/** Takes off from the floor; ignored in the air. */
	takeOff() {
		this.jump = launch(this.jump);
	}
	/** Jumps now if on the floor, and again on every landing until released, so a quick tap still jumps once. */
	holdJump(source: string) {
		this.#jumps.add(source);
		this.takeOff();
	}
	releaseJump(source: string) {
		this.#jumps.delete(source);
	}
	get grounded() {
		return !airborne(this.jump);
	}
	/** Lost focus or a cancel: stop asking. A playing attack or jump finishes. */
	letGo() {
		this.#holds.clear();
		this.#jumps.clear();
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
		if (this.#jumps.size) this.takeOff();
		if (this.attack) {
			this.attack.elapsed += dt;
			if (this.attack.elapsed >= this.attack.duration) this.attack = null;
		}
		if (this.attack || this.#sinceStart < ATTACK_GAP_MS) return null;
		const held = [...this.#holds.values()].at(-1);
		const aim = this.#pending ?? held?.() ?? null;
		this.#pending = null;
		return aim;
	}
	start(sequence: BodySequence, sector: AttackSector = 'level') {
		this.attack = { sequence, sector, elapsed: 0, duration: sequence.duration };
		this.#sinceStart = 0;
	}
	/** Turns the playing attack to another facing or clip; it carries on from the same point of the swing. */
	turn(sequence: BodySequence, sector: AttackSector) {
		if (this.attack) this.attack = { ...this.attack, sequence, sector };
	}
	/** An attack that could not play (no art for that aim) waits the same gap before a held input asks again. */
	refused() {
		this.#sinceStart = 0;
	}
	/** The playing attack's frame, at the same share of its own timeline as the swing has played. */
	attackCell() {
		const attack = this.attack;
		if (!attack) return null;
		const { sequence } = attack,
			progress = Math.min(1, attack.elapsed / attack.duration);
		return sampleTimeline(
			sequence.frames,
			Math.min(progress * sequence.duration, sequence.duration - 1e-3)
		);
	}
	/** A Jump clip's frame for the current point of the flight, so the art follows the arc. */
	jumpCell(sequence: BodySequence) {
		return sampleTimeline(
			sequence.frames,
			Math.min(flightPhase(this.jump) * sequence.duration, sequence.duration - 1e-3)
		);
	}
}
