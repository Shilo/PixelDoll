import { bakedFrame, composeCell, equipped, hiddenSlots, shownItems, type Frame } from '../../lib/compose/compose.ts';
import { recolor } from '../../lib/dress/dress.ts';
import { DEFAULT_MOVE } from '../../lib/rig/rig.ts';
import type { Img } from '../../lib/image/png.ts';
import type { DirectionName, Item, Layer, Preset, Project, RigAnimation, Sha256 } from '../../lib/store/manifest.ts';
import { directionInfo, directionLabel, dot, nearestDirection, unit, type Vector } from './movement.ts';

export interface BodySequence { clip: string; direction: DirectionName; frames: RigAnimation['frames']; duration: number; loop: boolean }
export interface Presentation {
  kind: 'animation' | 'still' | 'rest' | 'unavailable';
  moving: boolean;
  requestedClip: string;
  intendedDirection: DirectionName | null;
  direction: DirectionName | null;
  /** Null for a stored original rest image or unavailable artwork. */
  clip: string | null;
  cell: number;
  sequence?: BodySequence;
  issue: string | null;
  /** Stable coverage identity: exclude the changing fallback direction and playback frame. */
  issueKey: string | null;
  loading: boolean;
}
export interface PresentationAvailability {
  project: Project;
  directions: DirectionName[];
  animations: Map<string, Map<DirectionName, BodySequence>>;
  rests: Map<DirectionName, Sha256>;
  /** Render-only owner-local original views; their stored hashes and project pixels remain untouched. */
  restImages: Map<DirectionName, Img>;
  stills: Map<DirectionName, { clip: string; cell: number }>;
  metadataIssues: string[];
  loading: boolean;
  /** Validated once on asset revisions, never by scanning pixels in the animation loop. */
  complete(item: Item, clip: string, direction: DirectionName, cells: readonly number[]): boolean;
}

interface CheckedCell { valid: boolean; visible: boolean; source?: DirectionName }
export interface PresentationOptions {
  loading?: boolean;
  /** Optional raw project plus the current selected variants, for rest originals outside clip layer cells. */
  sourceProject?: Project;
  variants?: Preset['variants'];
}

/** Rebuild when the project, its images, or coverage changes. No requests or storage writes occur here. */
export function buildPresentation(project: Project, options: PresentationOptions = {}): PresentationAvailability {
  const m = project.manifest, metadataIssues: string[] = [];
  const directions = [...new Set(m.rig.directions.map(d => d.id).filter(id => {
    if (directionInfo(id)) return true;
    metadataIssues.push(`Unknown direction: ${id}`); return false;
  }))];
  if (!directions.length) metadataIssues.push('No declared character directions');
  const visible = new WeakMap<Img, boolean>();
  const validImage = (image: Img | undefined, width?: number, height?: number): image is Img => !!image && Number.isInteger(image.w) && Number.isInteger(image.h) && image.w > 0 && image.h > 0 && image.data.length === image.w * image.h * 4 && (width === undefined || image.w === width) && (height === undefined || image.h === height);
  const hasPixels = (image: Img): boolean => {
    if (!visible.has(image)) visible.set(image, image.data.some((value, i) => i % 4 === 3 && value > 0));
    return visible.get(image)!;
  };
  const checked = new WeakMap<Layer, Map<string, CheckedCell>>();
  const cell = (layer: Layer, clip: string, direction: DirectionName, index: number): CheckedCell => {
    let cache = checked.get(layer); if (!cache) { cache = new Map(); checked.set(layer, cache); }
    const key = `${clip}/${direction}/${index}`, cached = cache.get(key); if (cached) return cached;
    let at: DirectionName | undefined = direction;
    const seen = new Set<DirectionName>();
    let result: CheckedCell = { valid: false, visible: false };
    while (at && !seen.has(at)) {
      seen.add(at);
      const cells = layer.cells?.[clip]?.[at];
      if (cells) {
        if (!Object.hasOwn(cells, index)) break; // A missing entry is not authored transparency.
        const hash = cells[index];
        if (hash === null) result = { valid: true, visible: false, source: at };
        else if (typeof hash === 'string') {
          const image = project.layerImages?.get(layer)?.get(hash) ?? project.images.get(hash);
          if (validImage(image, layer.cell?.w ?? m.rig.cell.w, layer.cell?.h ?? m.rig.cell.h)) result = { valid: true, visible: hasPixels(image), source: at };
        }
        break;
      }
      at = m.rig.directions.find(d => d.id === at)?.mirrorOf;
    }
    cache.set(key, result); return result;
  };
  // Check mirror metadata even when stored cells happen to mask an invalid reference.
  for (const d of m.rig.directions) {
    const seen = new Set<DirectionName>(); let at: DirectionName | undefined = d.id;
    while (at) {
      if (seen.has(at)) { metadataIssues.push(`Cyclic mirror: ${d.id}`); break; }
      seen.add(at); const entry = m.rig.directions.find(candidate => candidate.id === at);
      if (!entry) { metadataIssues.push(`Missing mirror source: ${at}`); break; }
      at = entry.mirrorOf;
    }
  }
  const coverageCache = new WeakMap<Item, Map<string, boolean>>();
  const complete = (item: Item, clip: string, direction: DirectionName, cells: readonly number[]): boolean => {
    let cache = coverageCache.get(item); if (!cache) { cache = new Map(); coverageCache.set(item, cache); }
    const key = `${clip}/${direction}/${cells.join(',')}`;
    if (cache.has(key)) return cache.get(key)!;
    if (!item.layers.length || !cells.length) return false;
    const coverage = item.coverage && new Set<string>(item.coverage);
    const valid = cells.every(index => item.layers.every(layer => {
      const c = cell(layer, clip, direction, index);
      return c.valid && (!coverage || coverage.has(`${clip}/${direction}/${index}`) || !!c.source && coverage.has(`${clip}/${c.source}/${index}`));
    }));
    cache.set(key, valid); return valid;
  };
  const body = m.items.find(item => item.id === m.rig.baseItem);
  const animations = new Map<string, Map<DirectionName, BodySequence>>(), rests = new Map<DirectionName, Sha256>(), restImages = new Map<DirectionName, Img>(), stills = new Map<DirectionName, { clip: string; cell: number }>();
  // recolor() deliberately visits layer cells, so add a transient body-only layer
  // for original standing views. Never recolor already-rendered clip pixels twice.
  const restLayer: Layer = { id: 'main', role: 'fg', z: body?.layers[0]?.z ?? 0, cells: { rest: Object.fromEntries(Object.entries(m.rig.rest ?? {}).flatMap(([id, rest]) => rest ? [[id, [rest.image]]] : [])) } };
  const restSource = options.sourceProject && body
    ? recolor({ manifest: { ...m, items: [{ ...body, layers: [restLayer] }] }, images: options.sourceProject.images }, options.variants ?? {})
    : null;
  for (const [id, rest] of Object.entries(m.rig.rest ?? {}) as [DirectionName, NonNullable<typeof m.rig.rest>[DirectionName]][]) {
    const image = rest && (restSource?.layerImages?.get(restLayer)?.get(rest.image) ?? restSource?.images.get(rest.image)
      ?? body?.layers.map(layer => project.layerImages?.get(layer)?.get(rest.image)).find(Boolean) ?? project.images.get(rest.image));
    if (directionInfo(id) && rest && validImage(image, m.rig.cell.w, m.rig.cell.h) && hasPixels(image)) { rests.set(id, rest.image); restImages.set(id, image); }
  }
  if (body) {
    // Rescue stills may use stored original directions outside the intentional animated set.
    const storedDirections = [...new Set([...directions, ...body.layers.flatMap(layer => Object.values(layer.cells ?? {}).flatMap(dirs => Object.keys(dirs) as DirectionName[]))])].filter(id => directionInfo(id));
    for (const animation of m.rig.animations) {
      const usable = new Map<DirectionName, BodySequence>(); animations.set(animation.id, usable);
      const duration = animation.frames.reduce((sum, frame) => sum + frame.ms, 0);
      const validTimeline = Number.isInteger(animation.cells) && animation.cells > 0 && animation.frames.length > 0 && Number.isFinite(duration) && animation.frames.every(frame => Number.isInteger(frame.cell) && frame.cell >= 0 && frame.cell < animation.cells && Number.isFinite(frame.ms) && frame.ms > 0);
      for (const direction of storedDirections) {
        // A short/broken timeline can still furnish an honest single-frame rescue.
        const storedIndices = [...new Set(body.layers.flatMap(layer => Object.values(layer.cells?.[animation.id] ?? {}).flatMap(cells => Object.keys(cells ?? {}).map(Number))))].filter(index => Number.isInteger(index) && index >= 0 && index < animation.cells).sort((x, y) => x - y);
        for (const index of storedIndices) {
          if (complete(body, animation.id, direction, [index]) && body.layers.some(layer => cell(layer, animation.id, direction, index).visible)) {
            if (!stills.has(direction)) stills.set(direction, { clip: animation.id, cell: index });
            break;
          }
        }
        if (!validTimeline || !directions.includes(direction)) continue;
        const cells = animation.frames.map(frame => frame.cell);
        if (!complete(body, animation.id, direction, cells) || !cells.some(index => body.layers.some(layer => cell(layer, animation.id, direction, index).visible))) continue;
        usable.set(direction, { clip: animation.id, direction, frames: animation.frames, duration, loop: animation.loop });
      }
    }
  }
  return { project, directions, animations, rests, restImages, stills, metadataIssues, loading: options.loading ?? false, complete };
}

const defaultFacing = (a: PresentationAvailability): DirectionName | undefined => a.directions.includes('south') ? 'south' : a.directions.includes('east') ? 'east' : a.directions[0];
const initial = (a: PresentationAvailability, requestedClip: string, intendedDirection: DirectionName | null, moving = false): Presentation => ({ kind: 'unavailable', moving, requestedClip, intendedDirection, direction: null, clip: null, cell: 0, issue: null, issueKey: null, loading: a.loading });
const animated = (base: Presentation, sequence: BodySequence): Presentation => ({ ...base, kind: 'animation', direction: sequence.direction, clip: sequence.clip, sequence, cell: sequence.frames[0].cell });
const still = (a: PresentationAvailability, base: Presentation, direction: DirectionName): Presentation => {
  if (a.rests.has(direction)) return { ...base, kind: 'rest', direction };
  const pose = a.stills.get(direction);
  return pose ? { ...base, kind: 'still', direction, ...pose } : base;
};
function withIssue(a: PresentationAvailability, result: Presentation): Presentation {
  if (a.loading) return result;
  if (result.issue) return result;
  if (a.metadataIssues.length) return { ...result, issue: a.metadataIssues[0], issueKey: 'metadata' };
  if (result.kind === 'animation' && result.clip === result.requestedClip && result.direction === result.intendedDirection) return result;
  const wholeClip = !a.animations.get(result.requestedClip)?.size;
  if (wholeClip && result.clip === DEFAULT_MOVE) return result; // a new character stands in its Default pose until idle/walk are added
  const missing = wholeClip ? result.requestedClip : `${directionLabel(result.intendedDirection ?? '')} ${result.requestedClip}`;
  const showing = result.kind === 'unavailable' ? 'no artwork available' : result.kind !== 'animation' ? 'showing a still pose' : result.clip !== result.requestedClip ? `showing ${result.clip}` : `showing ${directionLabel(result.direction!)}`;
  return { ...result, issue: `${missing} missing — ${showing}`, issueKey: `${result.requestedClip}:${wholeClip ? 'all' : result.intendedDirection}` };
}

/** Preview never changes the selected clip, declared direction, or animation availability to hide a gap. */
export function resolvePreview(a: PresentationAvailability, options: { clip: string; direction: DirectionName }): Presentation {
  const base = initial(a, options.clip, options.direction);
  if (!a.directions.includes(options.direction)) return { ...base, issue: a.loading ? null : 'This facing is not declared by the character', issueKey: a.loading ? null : 'undeclared-direction' };
  const sequence = a.animations.get(options.clip)?.get(options.direction);
  return withIssue(a, sequence ? animated(base, sequence) : still(a, base, options.direction));
}

/** Velocity chooses simulation state; incomplete artwork only changes the displayed presentation. */
export function resolveLive(a: PresentationAvailability, options: { velocity: Vector; previous?: Presentation | null; defaultDirection?: DirectionName; deadZone?: number }): Presentation {
  const velocity = unit(options.velocity, options.deadZone ?? 1e-6), moving = !!(velocity.x || velocity.y), previous = options.previous;
  const saved = options.defaultDirection ?? defaultFacing(a);
  const retained = previous?.direction && a.directions.includes(previous.direction) ? previous.direction : previous?.intendedDirection && a.directions.includes(previous.intendedDirection) ? previous.intendedDirection : saved;
  const intended = moving
    ? nearestDirection(a.directions, velocity, previous?.direction, previous?.intendedDirection, saved)
    : retained ?? nearestDirection(a.directions, { x: 0, y: -1 });
  const base = initial(a, moving ? 'walk' : 'idle', intended, moving);
  if (![options.velocity.x, options.velocity.y].every(Number.isFinite)) {
    base.issue = 'Movement input is not finite'; base.issueKey = 'invalid-velocity';
  }
  const facing = directionInfo(intended ?? '')?.vector ?? { x: 0, y: -1 }, desired = moving ? velocity : facing;
  const eligible = (direction: DirectionName) => dot(directionInfo(direction)!.vector, facing) >= -1e-8;
  // Pending resources are distinct from confirmed coverage gaps. Keep a still-valid
  // presentation rather than changing the actor to a fallback during a partial load.
  if (a.loading && previous?.direction && !a.animations.get(base.requestedClip)?.has(intended!)) {
    const sequence = previous.kind === 'animation' && previous.clip ? a.animations.get(previous.clip)?.get(previous.direction) : undefined;
    if (sequence) return animated(base, sequence);
    if (previous.kind === 'rest' && a.rests.has(previous.direction)) return still(a, base, previous.direction);
    if (previous.kind === 'still' && previous.clip) {
      const body = a.project.manifest.items.find(item => item.id === a.project.manifest.rig.baseItem);
      if (body && a.complete(body, previous.clip, previous.direction, [previous.cell])) return { ...base, kind: 'still', clip: previous.clip, direction: previous.direction, cell: previous.cell };
    }
  }
  for (const clip of moving ? ['walk', 'idle', DEFAULT_MOVE] : ['idle', DEFAULT_MOVE]) { // Default: a new character's standing views
    const sequences = a.animations.get(clip), directions = [...sequences?.keys() ?? []].filter(eligible);
    const direction = intended && directions.includes(intended) ? intended : nearestDirection(directions, desired, previous?.direction, previous?.intendedDirection, saved);
    if (direction) return withIssue(a, animated(base, sequences!.get(direction)!));
  }
  const resting = [...a.rests.keys()].filter(direction => a.directions.includes(direction) && eligible(direction));
  const restDirection = nearestDirection(resting, desired, previous?.direction, previous?.intendedDirection, saved);
  if (restDirection) return withIssue(a, still(a, base, restDirection));
  const artwork = [...new Set([...a.rests.keys(), ...a.stills.keys()])], declared = artwork.filter(direction => a.directions.includes(direction));
  const direction = nearestDirection(declared.length ? declared : artwork, desired, previous?.direction, previous?.intendedDirection, saved);
  return withIssue(a, direction ? still(a, base, direction) : base);
}

/** Exact south still for current-outfit thumbnails; never labels another facing as south. */
export function southStill(a: PresentationAvailability): Presentation {
  const base = initial(a, 'idle', 'south');
  // Use an actual aligned clip cell for outfit thumbnails before an unequipped original.
  const sequence = a.animations.get('idle')?.get('south') ?? [...a.animations.values()].map(dirs => dirs.get('south')).find(Boolean);
  if (sequence) return { ...base, kind: 'still', direction: 'south', clip: sequence.clip, cell: sequence.frames[0].cell };
  const pose = a.stills.get('south');
  if (pose) return { ...base, kind: 'still', direction: 'south', ...pose };
  if (a.rests.has('south')) return still(a, base, 'south');
  return base;
}

export interface PlaybackClock { key: string; elapsedMs: number; duration: number; cell: number }
/** Facing changes carry normalized phase. Genuine clip/source changes start once at frame zero. */
export function advancePlayback(presentation: Presentation, previous: PlaybackClock | null | undefined, deltaMs: number): PlaybackClock {
  const sequence = presentation.kind === 'animation' ? presentation.sequence : undefined;
  const key = sequence ? `animation:${sequence.clip}:${presentation.moving ? 'moving' : 'stopped'}` : `${presentation.kind}:${presentation.clip ?? ''}:${presentation.cell}`;
  if (!sequence) return { key, elapsedMs: 0, duration: 0, cell: presentation.cell };
  const dt = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  let elapsedMs = previous?.key === key ? (previous.duration > 0 ? previous.elapsedMs / previous.duration * sequence.duration : 0) + dt : 0;
  elapsedMs = sequence.loop ? elapsedMs % sequence.duration : Math.min(elapsedMs, sequence.duration);
  let remaining = elapsedMs, cell = sequence.frames.at(-1)!.cell;
  for (const frame of sequence.frames) { if (remaining < frame.ms) { cell = frame.cell; break; } remaining -= frame.ms; }
  return { key, elapsedMs, duration: sequence.duration, cell };
}

/** loading: worn drafts still generating this view ("Sword loading — East, North"), shown instead of hiding them as missing. */
export interface RenderedPresentation { image: Img | null; frame: Frame; hiddenItems: Item[]; issue: string | null; issueKey: string | null; loading: string | null }
/** Consume the production recolored project and current outfit map (DressState.current.items). */
export function renderPresentation(a: PresentationAvailability, items: Preset['items'], presentation: Presentation, cell = presentation.cell): RenderedPresentation {
  const p = a.project, m = p.manifest, frame = bakedFrame(m);
  const result: RenderedPresentation = { image: null, frame, hiddenItems: [], issue: null, issueKey: null, loading: null };
  if (presentation.kind === 'unavailable' || !presentation.direction) return result;
  const direction = presentation.direction, clip = presentation.kind === 'rest' ? 'rest' : presentation.clip!;
  const cells = presentation.kind === 'animation' ? presentation.sequence!.frames.map(f => f.cell) : [presentation.kind === 'rest' ? 0 : presentation.cell];
  const on = equipped(m, items), hidden = hiddenSlots(m, on), worn = shownItems(m, on);
  const filtered = { ...items }, loading: string[] = [], mirrored = m.rig.directions.find(d => d.id === direction)?.mirrorOf;
  for (const item of worn) {
    if (item.id === m.rig.baseItem) continue;
    // rig.rest stores original artwork, including views that differ from an
    // animated mirror. Mirrored clip equipment cannot certify that rest pose.
    const exactRest = presentation.kind !== 'rest' || item.layers.every(layer => Object.hasOwn(layer.cells?.rest?.[direction] ?? [], 0));
    if (!exactRest || !a.complete(item, clip, direction, cells)) {
      filtered[item.slot] = null;
      // a generating draft's cells are on their way, not missing
      const pending = [...new Set((item.pending ?? []).filter(k => k.startsWith(`${clip}/`)).map(k => k.split('/')[1]))];
      if (pending.includes(direction) || (mirrored && pending.includes(mirrored))) loading.push(`${item.name} loading — ${pending.map(directionLabel).join(', ')}`);
      else if (!hidden.has(item.slot)) result.hiddenItems.push(item);
    }
  }
  result.loading = loading.join(' · ') || null;
  // A rest original is a distinct body source. Only explicit rest equipment cells accompany it.
  let source = p;
  if (presentation.kind === 'rest') {
    const hash = a.rests.get(direction); if (!hash) return result;
    const layer: Layer = { id: 'main', role: 'fg', z: m.items.find(item => item.id === m.rig.baseItem)?.layers[0]?.z ?? 0, cells: { rest: { [direction]: [hash] } } };
    const layerImages = new Map(p.layerImages);
    layerImages.set(layer, new Map([[hash, a.restImages.get(direction)!]]));
    source = { ...p, layerImages, manifest: { ...m, items: m.items.map(item => item.id !== m.rig.baseItem ? item : { ...item, layers: [layer] }) } };
  }
  result.image = composeCell(source, filtered, clip, direction, cells.includes(cell) ? cell : cells[0], frame);
  if (result.hiddenItems.length && !a.loading) {
    result.issue = `${result.hiddenItems.length} ${result.hiddenItems.length === 1 ? 'item' : 'items'} hidden — missing ${clip} / ${directionLabel(direction)} frames`;
    result.issueKey = `items:${clip}:${direction}:${result.hiddenItems.map(item => item.variantOf ?? item.id).sort().join(',')}`;
  }
  return result;
}
