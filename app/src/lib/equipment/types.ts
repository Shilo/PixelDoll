import type { Img } from '../image/png.ts';
import type { DirectionName, Item, Manifest, Material, Preset, Project, Sha256 } from '../store/manifest.ts';

/** An immutable, self-contained source snapshot. Blobs are content-addressed in the shared image store. */
export interface EquipmentDesign {
  kind: 'equipment-design';
  format: 'pixeldoll-design/1';
  id: string;
  revision: Sha256;
  name: string;
  slot: string;
  itemId: string;
  createdAt: string;
  source: Manifest;
  imageHashes: Sha256[];
  variants: Preset['variants'];
  warnings: string[];
  /** Present only on a newly prepared snapshot, never persisted or serialized. */
  images?: Map<string, Img>;
}
export interface EquipmentLineage {
  dressedStamp?: string;
  designId: string;
  revision: Sha256;
  snapshot: Omit<EquipmentDesign, 'images'>;
  roleMaterials: Record<string, string>;
  unmappedRoles?: string[];
  targetAudit: Sha256;
  targetStamp: string;
}
export interface CellMatch { target: string; source: string }
export interface FitAssessment {
  status: 'ready' | 'fit' | 'setup' | 'unsupported';
  freeCells: number;
  totalCells: number;
  missingCells: number;
  canExtend: boolean;
  targetRigReady: boolean;
  canCopy: boolean;
  reasons: string[];
  warnings: string[];
  matches: CellMatch[];
}
export interface FitCandidate {
  extensionItemId?: string;
  extensionStamp?: string;
  reuseRest?: boolean;
  project: Project;
  itemId: string;
  designId: string;
  targetAudit: Sha256;
  targetStamp: string;
  materials: Material[];
  variants: Preset['variants'];
  assessment: FitAssessment;
}
export interface FitPlan {
  extension?: { itemId: string; anims: string[]; cells: string[]; stamp: string; reuseRest: boolean; freeMatches?: CellMatch[]; freeSource?: Omit<EquipmentDesign, 'images'> };
  design: Omit<EquipmentDesign, 'images'>;
  targetId: string;
  targetAudit: Sha256;
  targetStamp: string;
  assessment: FitAssessment;
  previewGens: number;
  poseGens: number;
  directions: DirectionName[];
  createdAt: string;
}
export type FitStage = 'ready' | 'rest-running' | 'rest-review' | 'pose-running' | 'fit-review' | 'needs-attention' | 'accepted' | 'discarded';
export interface FitCall {
  superseded?: boolean;
  id: string;
  stage: 'rest' | 'pose';
  direction?: DirectionName;
  cells: string[];
  seed: number;
  recId?: string;
  limit: number;
}
export interface FitDraft {
  kind: 'equipment-fit-draft';
  format: 'pixeldoll-fit/1';
  id: string;
  name: string;
  targetId: string;
  targetProjectId: string;
  plan: FitPlan;
  stage: FitStage;
  updatedAt: string;
  error: string;
  qualityFails?: string[];
  warnings?: string[];
  failedCells?: string[];
  retryGens?: number;
  retryStage?: 'rest' | 'pose';
  previewGens: number;
  poseGens: number;
  spentGens: number;
  spentUsd?: number;
  budget: { previewGens: number; poseGens: number };
  resumeStage?: 'rest' | 'pose';
  calls: FitCall[];
  rest?: Partial<Record<DirectionName, Sha256>>;
  candidate?: { manifest: Manifest; imageHashes: Sha256[]; itemId: string; materials: Material[]; variants: Preset['variants'] };
  acceptedItemId?: string;
}
export type FitReview = { draft: FitDraft; project: Project | null; itemId: string | null };
export type AcceptOptions = { wear: boolean };
export const designItem = (design: EquipmentDesign): Item => {
  const item = design.source.items.find((it) => it.id === design.itemId);
  if (!item) throw new Error('The saved design is missing its source item.');
  return item;
};
