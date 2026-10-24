import type { CharacterDraft } from './characterConfig.ts'
// In-memory form values survive the Connect sheet replacing their form. Never persisted or exported.
export const formDrafts: {
  item?: { projectId: string; sourceGroup: string; group: string; slot: string; prompt: string; color: string; name: string }
  character?: CharacterDraft
  setup?: { projectId: string; looks: string; restAnim: string }
  move?: { projectId: string; action: string; text: string; skip: string[]; dirs?: import('../lib/store/manifest.ts').DirectionName[]; poseStyle?: 'visible-side-v1' }
} = {}
