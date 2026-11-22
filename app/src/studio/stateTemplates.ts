// Editable starting prompts for Create State. Sent to PixelLab as written, so they stay English; see
// docs/research/2026-11-21-riding-state/README.md for how the riding wording was tested.
export const STATE_TEMPLATES = {
	riding:
		'Change only the pose. Show the same character sitting upright astride an invisible mount, with one leg on each side. Bend the knees and let the lower legs hang down at the sides, not forward like sitting in a chair. Keep the elbows relaxed and the empty hands slightly forward. Preserve the character’s design, proportions, pixel-art style, and facing. Draw only the rider. No mount, saddle, reins, or props.'
} as const;
export type StateTemplate = keyof typeof STATE_TEMPLATES;
