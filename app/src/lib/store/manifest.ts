// pixeldoll/1 manifest types (docs/manifest-spec.md §2). Rig types live in rig/rig.ts.
import type { Img } from '../image/png.ts';
import type { DirectionName, Rig, Sha256 } from '../rig/rig.ts';
export type { DirectionName, Rig, RigAnimation, RigDirection, Sha256 } from '../rig/rig.ts';

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
  rect?: { shape: string; grow: number };
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
  reference?: Sha256;
  extractor?: 'novel2_grow1' | 'novel_cc';
  provenance: Provenance[];
  qa?: unknown; // ItemQa (spec §2); not read by compose/export
}
export interface Layer {
  id: 'main' | 'fg' | 'bg';
  role: 'fg' | 'bg';
  z: number;
  cells?: Record<string, Partial<Record<DirectionName, (Sha256 | null)[]>>>; // project; null = transparent
  sheets?: Record<string, string>; // export manifest; anim -> sheet path
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
}

/** In-memory project: the manifest plus decoded cell images keyed by hash. */
export interface Project { manifest: Manifest; images: Map<string, Img> }
