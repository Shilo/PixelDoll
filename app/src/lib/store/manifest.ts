// pixeldoll/1 manifest types (docs/manifest-spec.md §2). Rig types live in rig/rig.ts.
import type { Img } from '../image/png.ts';
import type { DirectionName, Rig, Sha256 } from '../rig/rig.ts';
export type { ClipSource, DirectionName, Keypoint, RestView, Rig, RigAnimation, RigDirection, Sha256 } from '../rig/rig.ts';

export type Hex = `#${string}`;
export type CellKey = `${string}/${DirectionName}/${number}`;

export interface Manifest {
  format: 'pixeldoll/1';
  name: string;
  app: string;
  rig: Rig;
  materials: Material[];
  slots: Slot[]; // array order = tie-break for equal z
  items: Item[]; // includes the base (slot "body")
  presets: Preset[]; // presets[0] = default
  export?: ExportInfo;
}

export interface Material {
  id: string;
  label: string;
  ramp: Hex[];
  variants: Record<string, Hex[]>;
  linkTo?: string;
  owner: string;
}

export interface Slot {
  id: string;
  z: number;
  bgZ?: number;
  class: 'base' | 'rigid' | 'held' | 'worn';
  anchor?: string;
  required?: boolean;
  hides?: string[];
  zOverrides?: ZOverride[];
  band?: boolean;
}
export interface ZOverride { layer: 'fg' | 'bg'; z: number; dir?: DirectionName; anim?: string; cell?: number }

export interface Item {
  id: string;
  name: string;
  slot: string;
  status: 'draft' | 'accepted' | 'stale';
  mirror: 'flip' | 'generate';
  hides?: string[];
  materials: string[];
  prompt: string;
  layers: Layer[];
  baseHash: Sha256;
  route?: 'skeleton-pose' | 'inpaint-grid' | 'ea2-anchor' | 'diff'; // manifest-spec v1.3
  extractor?: 'chroma' | 'diff'; // deprecated (v1.2), still written for older readers
  key?: 'green' | 'magenta';
  dressed?: Partial<Record<DirectionName, Sha256>>; // skeleton-pose: dressed chroma keyframes
  anchorCell?: CellKey; // ea2-anchor: design-call cell passed as frame 1 to later calls
  provenance: Provenance[];
  qa?: ItemQa; // not read by compose/export
}
/** Gates G1–G8 (architecture §3.3); worst value over all cells/clips of the item. */
export interface ItemQa {
  minKeyKept: number;
  maxKeyOutside: number;
  minAreaRatio: number;
  maxAreaCV: number;
  maxPaletteDist: number;
  clipPx: number;
  handedness?: 'ok' | 'switched';
  shiftedFrames?: number; // cells whose silhouette fits the base better at a non-zero 1 px shift
  grip?: { R: number; L: number; amb: number; none: number }; // held items, per cell
  strayPx?: number; // removed by the largest-component filter (posed cells)
  rerolls: number;
  status: 'pass' | 'warn' | 'fail' | 'accepted';
  cells: Record<CellKey, CellQa>;
}
export interface CellQa {
  route: 'posed' | 'ea2' | 'grid' | 'diff' | 'chroma' | 'propagated' | 'mirrored' | 'two-pass' | 'import';
  provenance?: number;
  area: number;
  keyKept?: number;
  offset?: [number, number];
  snappedPct?: number; // no palette snap yet
}
export interface Layer {
  id: 'main' | 'fg' | 'bg';
  role: 'fg' | 'bg';
  z: number;
  cells?: Record<string, Partial<Record<DirectionName, (Sha256 | null)[]>>>; // project; null = transparent
  sheets?: Record<string, string>; // export manifest; anim -> sheet path
  cell?: { w: number; h: number }; // v1.3.1 oversize layer (held items: 96x96); default rig.cell; always written in manifest.json
  pivot?: { x: number; y: number }; // same body point in this layer's cell (rig.pivot + pad); default rig.pivot
}
export interface Provenance {
  endpoint: string;
  params: Record<string, unknown>;
  seed: number;
  requestHash: Sha256;
  jobId?: string;
  usage?: { generations?: number; usd?: number };
  createdAt: string;
  produced: CellKey[];
}
export interface Preset {
  id: string;
  name: string;
  items: Record<string, string | null>; // slot -> item id
  variants: Record<string, string>;
}
export type Engine = 'generic' | 'godot' | 'unity' | 'phaser' | 'aseprite';
export interface ExportInfo {
  exportedAt: string;
  layout: 'pixeldoll-sheets/1';
  engines: Engine[];
  pixelsPerUnit: number;
  baked?: string[];
  bakedCell?: { w: number; h: number }; // v1.3.1: baked composite cell = union of every exported layer around the pivot
  bakedPivot?: { x: number; y: number };
}

/** In-memory project: the manifest plus decoded cell images keyed by hash. */
export interface Project { manifest: Manifest; images: Map<string, Img> }
