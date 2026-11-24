// Directional attacks in the live views (docs/design/live-view-controls-plan.md). Aim is separate from travel: the attack
// faces where it is aimed and leaves the remembered walking facing alone. It never turns the body away from the aim.
import type { DirectionName } from '../../lib/store/manifest.ts';
import type { LiveClips } from './liveRoles.ts';
import { COMPASS, directionInfo, dot, nearestDirection, unit, type Vector } from './movement.ts';
import type { BodySequence, PresentationAvailability } from './presentation.ts';

export type AttackFailure =
	{ kind: 'no-attack' } | { kind: 'no-direction'; move: string; direction: DirectionName | null };
export type AttackSector = 'up' | 'down' | 'level';
export type AttackChoice =
	{ sequence: BodySequence; sector: AttackSector } | { failure: AttackFailure };

/** Degrees past the 45° boundary an aim must cross to change sector while an attack turns, so it never flickers there. */
const SECTOR_DEADBAND = 8;

/** Side-scroller aim more than 45° from level plays Attack up or Attack down. An attack turning mid-swing passes its
 * `current` sector and keeps it until the aim leaves the boundary's deadband. */
export function attackSector(aim: Vector, current?: AttackSector): AttackSector {
	const u = unit(aim);
	const sector = Math.abs(u.y) > Math.abs(u.x) + 1e-9 ? (u.y > 0 ? 'up' : 'down') : 'level';
	if (!current || sector === current) return sector;
	const angle = (Math.atan2(Math.abs(u.y), Math.abs(u.x)) * 180) / Math.PI;
	const near = Math.abs(angle - 45) < SECTOR_DEADBAND;
	return near && (current === 'level' || current === (u.y > 0 ? 'up' : 'down')) ? current : sector;
}

/**
 * The attack clip and facing for an aim in ground coordinates (x east, y north or up). Top-down faces the nearest
 * authored direction within 90° of the aim. Side-scroller keeps a side profile: a near-vertical aim keeps the current
 * horizontal facing, so small changes never flip the sprite. A zero aim attacks along `facing`.
 */
export function resolveAttack(
	a: PresentationAvailability,
	clips: LiveClips,
	aim: Vector,
	options: {
		side: boolean;
		facing: DirectionName | null;
		/** The sector of an attack turning mid-swing, held through the boundary's deadband. */
		sector?: AttackSector;
	}
): AttackChoice {
	const facing = directionInfo(options.facing ?? '')?.vector ?? { x: 0, y: -1 };
	let u = unit(aim);
	if (!u.x && !u.y) u = facing;
	const sector = options.side ? attackSector(u, options.sector) : 'level';
	const chain =
		sector === 'up' ? clips.attackUp : sector === 'down' ? clips.attackDown : clips.attack;
	const toward = options.side
		? { x: Math.abs(u.x) > 0.25 ? Math.sign(u.x) : Math.sign(facing.x) || 1, y: 0 }
		: u;
	let missing: string | undefined;
	for (const clip of chain) {
		const sequences = a.animations.get(clip);
		if (!sequences?.size) continue;
		missing ??= clip;
		// Side-scroller shows only a side profile; Top-down any facing within 90° of the aim.
		const eligible = [...sequences.keys()].filter((direction) =>
			options.side
				? directionInfo(direction)!.vector.x === toward.x &&
					directionInfo(direction)!.vector.y === 0
				: dot(directionInfo(direction)!.vector, toward) > 1e-6
		);
		const direction = nearestDirection(eligible, toward, options.facing);
		if (direction) return { sequence: sequences.get(direction)!, sector };
	}
	return {
		failure: missing
			? // The aimed compass direction, not a facing the character happens to have.
				{
					kind: 'no-direction',
					move: missing,
					direction: nearestDirection(
						COMPASS.map((d) => d.id),
						toward
					)
				}
			: { kind: 'no-attack' }
	};
}
