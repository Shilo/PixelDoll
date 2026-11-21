import type { CharacterDraft } from './characterConfig.ts';
// In-memory form values survive the Connect sheet replacing their form. Never persisted or exported.
export const formDrafts: {
	item?: {
		projectId: string;
		sourceGroup: string;
		group: string;
		slot: string;
		prompt: string;
		color: string;
		name: string;
		reference?: import('../lib/image/reference.ts').PickedReference;
		method?: import('../lib/items/items.ts').Method;
	};
	character?: CharacterDraft;
	setup?: { projectId: string; looks: string; restAnim: string };
	move?: {
		projectId: string;
		action: string;
		replace: boolean;
		text: string;
		items: string[];
		dirs?: import('../lib/store/manifest.ts').DirectionName[];
		poseStyle?: 'visible-side-v1';
		animation?: import('./moveAnimationOptions.ts').MoveAnimationOptions;
		frameReferences?: import('./moveAnimationOptions.ts').MoveFrameReferences<
			import('../lib/image/reference.ts').PickedReference
		>;
		loop?: boolean;
	};
} = {};
