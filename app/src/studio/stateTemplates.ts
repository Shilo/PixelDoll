// Editable starting prompts for Create State. Sent to PixelLab as written, so they stay English; see
// docs/research/2026-11-21-riding-state/README.md for how the riding wording was tested.
export const STATE_TEMPLATES = {
	riding:
		"Change only the pose. Keep the same view and facing. The character sits upright astride an invisible horse: torso vertical, legs apart around the horse's sides, the near leg hangs almost straight down with the knee only slightly bent and the foot directly below the hip, toes forward. Elbows bent, empty hands forward at waist height as if holding reins. Preserve the character's design, proportions and pixel-art style. Draw only the character, no horse, saddle or reins."
} as const;
export type StateTemplate = keyof typeof STATE_TEMPLATES;
