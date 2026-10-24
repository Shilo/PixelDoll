import type { DirectionName } from '../../lib/store/manifest.ts';

/** Ground coordinates: x points east/right; y points north/up. */
export interface Vector { x: number; y: number }
export interface DirectionInfo { id: DirectionName; label: string; short: string; vector: Vector }

const diagonal = Math.SQRT1_2;
/** Stable tie order is independent of the order of a character's declared directions. */
export const COMPASS: readonly DirectionInfo[] = [
  { id: 'south', label: 'South', short: 'S', vector: { x: 0, y: -1 } },
  { id: 'east', label: 'East', short: 'E', vector: { x: 1, y: 0 } },
  { id: 'north', label: 'North', short: 'N', vector: { x: 0, y: 1 } },
  { id: 'west', label: 'West', short: 'W', vector: { x: -1, y: 0 } },
  { id: 'south-east', label: 'South-east', short: 'SE', vector: { x: diagonal, y: -diagonal } },
  { id: 'north-east', label: 'North-east', short: 'NE', vector: { x: diagonal, y: diagonal } },
  { id: 'south-west', label: 'South-west', short: 'SW', vector: { x: -diagonal, y: -diagonal } },
  { id: 'north-west', label: 'North-west', short: 'NW', vector: { x: -diagonal, y: diagonal } },
];

const identity = (id: string) => id.toLowerCase().replaceAll('-', '');
export const directionInfo = (id: string): DirectionInfo | undefined => COMPASS.find(d => identity(d.id) === identity(id));
export const directionLabel = (id: string): string => directionInfo(id)?.label ?? id;
export const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y;

export function unit(vector: Vector, deadZone = 0): Vector {
  const length = Math.hypot(vector.x, vector.y);
  return Number.isFinite(length) && length > Math.max(0, deadZone) ? { x: vector.x / length, y: vector.y / length } : { x: 0, y: 0 };
}

/** Nearest declared compass angle, retaining history only on numerical ties. Legacy aliases keep their original ID. */
export function nearestDirection<T extends string>(directions: readonly T[], vector: Vector, previous?: T | null, previousIntended?: T | null, defaultDirection?: T | null): T | null {
  const valid = [...new Set(directions)].filter(id => directionInfo(id));
  if (!valid.length || !Number.isFinite(vector.x) || !Number.isFinite(vector.y)) return null;
  const u = unit(vector), scores = valid.map(id => dot(u, directionInfo(id)!.vector)), best = Math.max(...scores);
  const ties = valid.filter((_, i) => best - scores[i] <= 1e-8);
  for (const preference of [previous, previousIntended, defaultDirection]) {
    const match = preference && ties.find(id => identity(id) === identity(preference));
    if (match) return match;
  }
  return ties.sort((a, b) => COMPASS.indexOf(directionInfo(a)!) - COMPASS.indexOf(directionInfo(b)!))[0];
}

export const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);

/** Opposites cancel and chords move at the same speed as cardinal input. */
export function keyboardVector(keys: ReadonlySet<string>, horizontalOnly = false): Vector {
  const lower = new Set([...keys].map(key => key.toLowerCase()));
  const held = (...names: string[]) => names.some(name => lower.has(name));
  return unit({ x: Number(held('d', 'arrowright')) - Number(held('a', 'arrowleft')), y: horizontalOnly ? 0 : Number(held('w', 'arrowup')) - Number(held('s', 'arrowdown')) });
}

/** Pointer displacement uses screen coordinates; preserve analog strength outside the dead zone. */
export function pointerVector(x: number, y: number, radius: number, deadZone = 0.12, horizontalOnly = false): Vector {
  if (![x, y, radius, deadZone].every(Number.isFinite) || radius <= 0) return { x: 0, y: 0 };
  const vector = { x: x / radius, y: horizontalOnly ? 0 : -y / radius }, length = Math.hypot(vector.x, vector.y);
  if (length <= Math.max(0, deadZone)) return { x: 0, y: 0 };
  const strength = Math.min(1, length);
  return { x: vector.x / length * strength, y: vector.y / length * strength };
}

/** Bounded integration avoids a jump after a background tab resumes. It never changes the requested velocity. */
export function integrateMovement(position: Vector, camera: Vector, velocity: Vector, deltaSeconds: number, speed = 90, response = 7): { position: Vector; camera: Vector } {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
  const valid = [velocity.x, velocity.y, speed].every(Number.isFinite);
  const next = { x: position.x + (valid ? velocity.x * speed * dt : 0), y: position.y + (valid ? velocity.y * speed * dt : 0) };
  const amount = Number.isFinite(response) ? 1 - Math.exp(-Math.max(0, response) * dt) : 0;
  return { position: next, camera: { x: camera.x + (next.x - camera.x) * amount, y: camera.y + (next.y - camera.y) * amount } };
}
