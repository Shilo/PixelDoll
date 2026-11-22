// Ready-made prompts offered under prompt boxes, most commonly useful first. The prompt is the English text sent to
// PixelLab; the caption is what the pill shows. Item ideas live with their slot (slots.ts), move templates with the
// move rig (moveAnimationOptions.ts).
import type { WhisperKey } from 'svelte-whisper';

export interface PromptIdea {
	id: string;
	caption: WhisperKey;
	prompt: string;
}

/** New State: one still pose, described as the change from the source frame. Body only. */
export const POSE_IDEAS: readonly PromptIdea[] = [
	{
		id: 'armsCrossed',
		caption: 'stateCapture.poses.armsCrossed',
		prompt: 'Fold both arms across the chest.'
	},
	{
		id: 'handsOnHips',
		caption: 'stateCapture.poses.handsOnHips',
		prompt: 'Rest both hands on the hips, elbows out.'
	},
	{
		id: 'crouch',
		caption: 'stateCapture.poses.crouch',
		prompt: 'Bend both knees and lower the hips.'
	},
	{ id: 'sit', caption: 'stateCapture.poses.sit', prompt: 'Sit on the ground with knees bent.' },
	{ id: 'kneel', caption: 'stateCapture.poses.kneel', prompt: 'Lower onto one knee.' },
	{
		id: 'wave',
		caption: 'stateCapture.poses.wave',
		prompt: 'Raise one hand beside the head, palm out.'
	}
];

/** New character Details: the face and look of a base body (traits and clothes are set elsewhere). */
export const LOOK_IDEAS: readonly PromptIdea[] = [
	{
		id: 'friendly',
		caption: 'create.form.looks.friendly',
		prompt: 'soft cheeks and a slight smile'
	},
	{
		id: 'freckled',
		caption: 'create.form.looks.freckled',
		prompt: 'freckles across the nose and cheeks'
	},
	{
		id: 'determined',
		caption: 'create.form.looks.determined',
		prompt: 'strong brows and a focused stare'
	},
	{ id: 'elderly', caption: 'create.form.looks.elderly', prompt: 'deep wrinkles and tired eyes' },
	{
		id: 'scarred',
		caption: 'create.form.looks.scarred',
		prompt: 'a diagonal scar across one cheek'
	},
	{
		id: 'glowingEyes',
		caption: 'create.form.looks.glowingEyes',
		prompt: 'eyes glowing a single bright color'
	}
];
