// In-memory form values survive the Connect sheet replacing their form. Never persisted or exported.
export const formDrafts: {
  item?: { projectId: string; sourceGroup: string; group: string; slot: string; prompt: string; colour: string; name: string }
  character?: { desc: string; skin: number; build: string; name: string; seed: number; dirs: 4 | 8; size: 48 | 56 }
  setup?: { projectId: string; looks: string; restAnim: string }
} = {}
