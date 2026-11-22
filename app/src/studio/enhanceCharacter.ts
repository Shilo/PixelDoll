import { styleOf, type CharacterDraft } from './characterConfig.ts';
import type { EnhanceCharacterV3Prompt } from '../lib/pixellab/routes.ts';

export function characterEnhanceInput(draft: CharacterDraft): EnhanceCharacterV3Prompt {
	const { outline, detail } = styleOf(draft);
	return {
		description: draft.prompt,
		image_size: { width: draft.body || 0, height: draft.body || 0 },
		view: draft.view,
		...(outline ? { outline } : {}),
		...(detail ? { detail } : {})
	};
}
