// pixeldoll/1 manifest types (docs/manifest-spec.md §2). Rig types live in rig/rig.ts.
import type { Img } from '../image/png.ts';
import type { DirectionName, Rig, Sha256 } from '../rig/rig.ts';
import type { EquipmentLineage } from '../equipment/types.ts';
export type { ClipSource, DirectionName, Keypoint, RestView, Rig, RigAnimation, RigDirection, Sha256 } from '../rig/rig.ts';

export type Hex = `#${string}`;
export type CellKey = `${string}/${DirectionName}/${number}`;
export const CURRENT_FORMAT = 'pixeldoll/2' as const;
export const supportedFormat = (value: unknown): value is Manifest['format'] => value === 'pixeldoll/1' || value === CURRENT_FORMAT;

export interface Manifest {
  format: 'pixeldoll/1' | 'pixeldoll/2';
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
  /** v2 approved baseline, used when an outfit has no explicit selection. */
  defaultVariant?: string;
}

export interface Slot {
  id: string;
  z: number;
  bgZ?: number;
  class: 'base' | 'rigid' | 'held' | 'worn';
  anchor?: string;
  required?: boolean;
  hides?: string[];
  clips?: string[]; // B14: slots tucked under this slot's item (hair under a helmet: only what hangs below the brim shows); hides wins
  zOverrides?: ZOverride[];
  band?: boolean;
}
export interface ZOverride { layer: 'fg' | 'bg'; z: number; dir?: DirectionName; anim?: string; cell?: number }

export interface Item {
  /** Explicit reviewed/generated target cells, including intentional transparent cells; absence is legacy coverage. */
  coverage?: CellKey[];
  id: string;
  name: string;
  slot: string;
  status: 'draft' | 'accepted' | 'stale';
  mirror: 'flip' | 'generate';
  hides?: string[];
  variantOf?: string; // B14 export only: baked "<item>~<under>" copy of item `variantOf` tucked under item `under` (slot.clips)
  under?: string;
  materials: string[];
  regions?: 'shirt-shorts'; // B15 base only: garment grays carry their region in the blue LSB (even = shirt, odd = shorts)
  prompt: string;
  layers: Layer[];
  baseHash: Sha256;
  route?: 'skeleton-pose' | 'inpaint-grid' | 'ea2-anchor' | 'diff'; // manifest-spec v1.3
  extractor?: 'chroma' | 'diff'; // deprecated (v1.2), still written for older readers
  key?: 'green' | 'magenta';
  dressed?: Partial<Record<DirectionName, Sha256>>; // skeleton-pose: dressed chroma keyframes
  anchorCell?: CellKey; // ea2-anchor: design-call cell passed as frame 1 to later calls
  provenance: Provenance[];
  designWarnings?: string[]; // explicitly accepted keyframe design issues, retained when move QA is replaced
  paletteRepairs?: ItemPaletteRepair[]; // explicit local edits; paid source provenance and historical QA remain intact
  qa?: ItemQa; // not read by compose/export
  design?: EquipmentLineage;
}
/** Original and corrected layer references for an explicit free color edit. Historical source blobs need not remain loaded. */
export interface ItemPaletteRepair {
  version: 'neutral-owned-v1';
  materialId: string;
  anim: string;
  dir: DirectionName;
  frames: { cell: number; changedPixels: number; layers: { id: string; before: Sha256; after: Sha256 }[] }[];
}
/** Scalar checks for one evaluation; extrema or totals over its frames. */
export interface QaSummary {
  /** Contains reused cells without a new API measurement; aggregate numeric checks are incomplete. */
  unmeasured?: boolean;
  minKeyKept: number;
  maxKeyOutside: number;
  minAreaRatio: number;
  maxAreaCV: number;
  maxPaletteDist: number;
  clipPx: number; // historical name: border-contact observations, not a measurement of pixels lost outside the frame
  handedness?: 'ok' | 'switched';
  shiftedFrames?: number; // cells whose silhouette fits the base better at a non-zero 1 px shift
  grip?: { R: number; L: number; amb: number; none: number }; // held items, per cell
  strayPx?: number; // removed by the largest-component filter (posed cells)
  status: 'pass' | 'warn' | 'fail' | 'accepted';
}
/** Gates G1–G10 and H4 (architecture §3.3). */
export interface ItemQa extends QaSummary {
  rerolls: number; // recorded retry history, not a count of current frames
  cells: Record<CellKey, CellQa>;
  clips?: Record<string, QaSummary & { hand?: 'r' | 'l' | '?' }>; // anim/direction; replaceable current checks
  legacy?: { clips: string[]; summary?: QaSummary }; // indivisible older checks, retained until these clips are replaced
}
export interface CellQa {
  route: 'posed' | 'ea2' | 'grid' | 'diff' | 'chroma' | 'propagated' | 'mirrored' | 'two-pass' | 'import';
  provenance?: number;
  area: number;
  keyKept?: number;
  offset?: [number, number];
  repaired?: boolean; // held (S5): item lost by the pose, dressed keyframe pasted at the wrist move
  snappedPct?: number; // no palette snap yet
}
export interface Layer {
  id: 'main' | 'fg' | 'bg';
  role: 'fg' | 'bg';
  z: number;
  cells?: Record<string, Partial<Record<DirectionName, (Sha256 | null)[]>>>; // project; null = transparent
  sheets?: Record<string, string>; // export manifest; anim -> sheet path
  sourceSheets?: Record<string, string>; // v2 original source-ramp sheets when canonical sheets render defaults
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
export type Engine = 'generic' | 'godot' | 'unity' | 'phaser' | 'gdevelop' | 'aseprite';
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
export interface Project {
  manifest: Manifest;
  images: Map<string, Img>;
  /** Render-only owner-local palettes. Original content hashes and persisted PNGs never change. */
  layerImages?: Map<Layer, Map<string, Img>>;
}
