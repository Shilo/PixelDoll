import { DIRECTIONS, type DirectionName, type RigDirection, type Rig } from '../lib/rig/rig.ts';
import { BASE_BODY, isBaseBody } from './model.ts';

export const BODY_SIZES = [48, 64, 96, 128] as const;
export const TRAITS = {
  kind: { label: 'Kind', options: ['Human', 'Elf', 'Dwarf', 'Orc', 'Undead'], help: 'The kind of humanoid. Leave Not set to add no extra hint.' },
  build: { label: 'Build', options: ['Slender', 'Broad', 'Muscular', 'Rounded'], help: 'Slender: narrow frame. Broad: wide torso. Muscular: defined muscles. Rounded: soft, rounded torso.' },
  proportions: { label: 'Proportions', options: ['Natural', 'Chibi'], help: 'Natural head-to-body proportions, or Chibi with a larger head and shorter limbs. Separate from size in pixels.' },
  skin: { label: 'Skin', options: ['Deep brown', 'Brown', 'Tan', 'Light tan', 'Light', 'Pale'], help: 'Skin-tone guidance. Leave Not set to add no extra hint; exact palette colors can be edited later.' },
} as const;
export type Trait = keyof typeof TRAITS;
export const TRAIT_KEYS = Object.keys(TRAITS) as Trait[];
export const UNSET = 'Not set';
export const PAIRS: [DirectionName, DirectionName][] = [['north-west', 'north-east'], ['west', 'east'], ['south-west', 'south-east']];
export const DIRECTION_LABELS: Record<DirectionName, string> = { north: 'N', 'north-east': 'NE', east: 'E', 'south-east': 'SE', south: 'S', 'south-west': 'SW', west: 'W', 'north-west': 'NW' };
export const COMPASS: (DirectionName | null)[] = ['north-west', 'north', 'north-east', 'west', null, 'east', 'south-west', 'south', 'south-east'];
export const ANGLES: Record<DirectionName, number> = { north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315 };
export type Mirrors = Partial<Record<DirectionName, DirectionName>>;
export const PRESETS = [
  { id: 'eight', label: 'Top-down 8', selected: [...DIRECTIONS], mirrors: { 'north-west': 'north-east', west: 'east', 'south-west': 'south-east' }, view: 'low top-down' },
  { id: 'four', label: 'Top-down 4', selected: ['north', 'east', 'south', 'west'], mirrors: { west: 'east' }, view: 'low top-down' },
  { id: 'diagonal', label: 'Diagonal 4', selected: ['north-east', 'south-east', 'south-west', 'north-west'], mirrors: { 'north-west': 'north-east', 'south-west': 'south-east' }, view: 'high top-down' },
  { id: 'side', label: 'Side-scroller 2', selected: ['east', 'west'], mirrors: { west: 'east' }, view: 'side' },
  { id: 'unique', label: 'Unique 8', selected: [...DIRECTIONS], mirrors: {}, view: 'low top-down' },
] satisfies { id: string; label: string; selected: DirectionName[]; mirrors: Mirrors; view: NonNullable<Rig['view']> }[];

export interface CharacterDraft {
  name: string; details: string; kind: string; build: string; proportions: string; skin: string; prompt: string;
  body: number | undefined; bodyPreset: number | null; frame: number | undefined; auto: boolean;
  view: NonNullable<Rig['view']>; selected: DirectionName[]; mirrors: Mirrors; seed: string; tab: 'appearance' | 'prompt';
  enhanceOnConnect?: 'details' | 'prompt';
}
export const autoFrame = (body: number) => Math.min(256, 16 * Math.ceil((body + 2 * Math.min(16, Math.max(8, Math.ceil(body / 8)))) / 16));
export function newCharacterDraft(): CharacterDraft {
  return { name: '', details: '', kind: UNSET, build: UNSET, proportions: UNSET, skin: UNSET, prompt: BASE_BODY, body: 64, bodyPreset: 64, frame: 80, auto: true, view: 'low top-down', selected: [...DIRECTIONS], mirrors: { 'north-west': 'north-east', west: 'east', 'south-west': 'south-east' }, seed: '', tab: 'appearance' };
}

function recognized(line: string): { key: Trait; value: string } | undefined {
  const text = line.trim().replace(/\s*:\s*/, ': ').toLowerCase();
  for (const key of TRAIT_KEYS) for (const value of TRAITS[key].options) if (text === `${TRAITS[key].label}: ${value}`.toLowerCase()) return { key, value };
}
/** Only complete known trait lines are interpreted. Arbitrary prose is never guessed or rewritten. */
export function readPrompt(d: CharacterDraft, prompt: string, preserveDetailsWhitespace = false): void {
  d.prompt = prompt;
  const lines = prompt.split('\n'), matches = Object.fromEntries(TRAIT_KEYS.map(k => [k, [] as number[]])) as Record<Trait, number[]>;
  lines.forEach((line, i) => { const hit = recognized(line); if (hit) matches[hit.key].push(i); });
  const owned = new Set<number>();
  for (const key of TRAIT_KEYS) {
    const indices = matches[key];
    d[key] = indices.length === 1 ? recognized(lines[indices[0]])!.value : UNSET;
    if (indices.length === 1) owned.add(indices[0]);
  }
  const details = lines.filter((line, i) => !owned.has(i) && !isBaseBody(line)).join('\n');
  d.details = preserveDetailsWhitespace ? details : details.trim();
}
export function writeTrait(d: CharacterDraft, key: Trait, value: string): void {
  const lines = d.prompt.split('\n'), indices = lines.map((l, i) => recognized(l)?.key === key ? i : -1).filter(i => i >= 0);
  const at = indices[0] ?? (lines.findIndex(isBaseBody) >= 0 ? lines.findIndex(isBaseBody) : lines.length);
  const next = lines.filter((_, i) => !indices.includes(i));
  if (value !== UNSET) next.splice(at, 0, `${TRAITS[key].label}: ${value}`);
  readPrompt(d, next.join('\n'));
}
export function writeDetails(d: CharacterDraft, value: string): void {
  const lines = d.prompt.split('\n'), counts = Object.fromEntries(TRAIT_KEYS.map(k => [k, 0])) as Record<Trait, number>;
  for (const line of lines) { const hit = recognized(line); if (hit) counts[hit.key]++; }
  let inserted = false;
  const next: string[] = [];
  for (const line of lines) {
    const hit = recognized(line);
    if (isBaseBody(line) || hit && counts[hit.key] === 1) next.push(line);
    else if (!inserted) { next.push(value); inserted = true; }
  }
  if (!inserted) next.unshift(value);
  // Keep spaces/newlines while typing in Details; only known trait lines leave the field.
  readPrompt(d, next.filter((l, i) => l || i > 0).join('\n'), true);
}
export function setPreset(d: CharacterDraft, id: string): void {
  const p = PRESETS.find(p => p.id === id)!;
  d.selected = [...p.selected]; d.mirrors = { ...p.mirrors }; d.view = p.view;
}
export function presetOf(d: Pick<CharacterDraft, 'selected' | 'mirrors'>): string | undefined {
  return PRESETS.find(p => p.selected.length === d.selected.length && p.selected.every(v => d.selected.includes(v)) && JSON.stringify(Object.entries(p.mirrors).sort()) === JSON.stringify(Object.entries(d.mirrors).sort()))?.id;
}
export function toggleDirection(d: Pick<CharacterDraft, 'selected' | 'mirrors'>, dir: DirectionName): string {
  if (!d.selected.includes(dir)) { d.selected.push(dir); return ''; }
  d.selected = d.selected.filter(v => v !== dir); delete d.mirrors[dir];
  let promoted = '';
  for (const target of DIRECTIONS) if (d.mirrors[target] === dir) { delete d.mirrors[target]; promoted = `${DIRECTION_LABELS[target]} now uses its own view.`; }
  return promoted;
}
export function toggleMirror(d: Pick<CharacterDraft, 'selected' | 'mirrors'>, dir: DirectionName): void {
  const other = PAIRS.find(p => p.includes(dir))?.find(v => v !== dir);
  if (!other) return;
  if (d.mirrors[dir]) { delete d.mirrors[dir]; return; }
  delete d.mirrors[other];
  if (!d.selected.includes(dir)) d.selected.push(dir);
  if (!d.selected.includes(other)) d.selected.push(other);
  d.mirrors[dir] = other;
}
export function facingOf(d: Pick<CharacterDraft, 'selected' | 'mirrors'>): RigDirection[] {
  return DIRECTIONS.filter(id => d.selected.includes(id)).map(id => ({ id, ...(d.mirrors[id] ? { mirrorOf: d.mirrors[id] } : {}) }));
}
/** Validate again before any paid request; saved drafts and imported settings are not trusted. */
export function facingErrors(dirs: RigDirection[]): string[] {
  if (!dirs.length) return ['Choose at least one direction.'];
  if (new Set(dirs.map(d => d.id)).size !== dirs.length) return ['Duplicate direction.'];
  const errors: string[] = [];
  for (const d of dirs) {
    if (!DIRECTIONS.includes(d.id)) errors.push('Unknown direction.');
    if (d.mirrorOf && (!PAIRS.some(p => p.includes(d.id) && p.includes(d.mirrorOf!) && d.id !== d.mirrorOf) || !dirs.some(s => s.id === d.mirrorOf && !s.mirrorOf))) errors.push(`Invalid mirror source for ${d.id}.`);
  }
  return errors;
}
export const validBodySize = (body: number | undefined) => Number.isInteger(body) && body! >= 32 && body! <= 256 && body! % 4 === 0;
export function sizeErrors(body: number | undefined, frame: number | undefined): string[] {
  if (!Number.isInteger(body) || body! < 32 || body! > 256) return ['Body size must be 32–256 whole pixels.'];
  if (!validBodySize(body)) return ['Body size must use 4 px steps (32, 36, 40, …, 256).'];
  const min = autoFrame(body!);
  return !Number.isInteger(frame) || frame! < min || frame! > 256 ? [`Frame must be ${min}–256 whole pixels.`] : [];
}
export function draftErrors(d: CharacterDraft): string[] {
  return [...sizeErrors(d.body, d.auto && Number.isFinite(d.body) ? autoFrame(d.body!) : d.frame), ...facingErrors(facingOf(d)),
    ...(d.seed && (!/^\d+$/.test(d.seed) || !Number.isSafeInteger(Number(d.seed)) || Number(d.seed) > Number.MAX_SAFE_INTEGER - 100_000) ? ['Seed must be a safe, non-negative whole number.'] : []),
    ...(!d.prompt.trim() ? ['Enter a character prompt.'] : d.prompt.length > 2000 ? ['The complete prompt must be 2,000 characters or fewer.'] : [])];
}
export const freshSeed = () => 1 + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] % 2_000_000_000);
