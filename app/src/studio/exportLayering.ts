// The moving-attack fragments an engine export cuts, from the live view's waist and clips. Shared by the Export sheet and
// project folder publishing so both write the same files.
import { currentLiveClips, currentLiveLayering } from './experience/liveViews.ts';
import type { ActionSheetOptions } from '../lib/export/sheets.ts';
import type { RigAnimation } from '../lib/rig/rig.ts';

export function exportActionLayering(
	projectId: string,
	animations: readonly RigAnimation[],
	enabled: boolean
): ActionSheetOptions | undefined {
	if (!enabled) return undefined;
	const layering = currentLiveLayering(projectId);
	const clips = currentLiveClips(projectId, animations);
	return {
		waist: layering.waist,
		walk: clips.walk.slice(0, 1),
		attacks: [...clips.attack, ...clips.attackUp, ...clips.attackDown]
	};
}
