import type { WhisperKey } from 'svelte-whisper';
import type { SlotProfile } from '../lib/store/manifest.ts';
import { moveTemplatePrompt } from './moveAnimationOptions.ts';

export type SuggestionListKey =
	'character.look' | 'state.pose' | 'move' | `item.${Exclude<SlotProfile, 'body'>}`;

export interface SuggestionDefault {
	id: string;
	titleKey?: WhisperKey;
	prompt: string;
	action?: string;
}

const move = (action: string, titleKey?: WhisperKey): SuggestionDefault => ({
	id: action,
	titleKey,
	action,
	prompt: moveTemplatePrompt(action)
});

export const promptSuggestionDefaults: Record<SuggestionListKey, readonly SuggestionDefault[]> = {
	'character.look': [
		{
			id: 'friendly',
			titleKey: 'create.form.looks.friendly',
			prompt: 'soft cheeks and a slight smile'
		},
		{
			id: 'freckled',
			titleKey: 'create.form.looks.freckled',
			prompt: 'freckles across the nose and cheeks'
		},
		{
			id: 'determined',
			titleKey: 'create.form.looks.determined',
			prompt: 'strong brows and a focused stare'
		},
		{
			id: 'elderly',
			titleKey: 'create.form.looks.elderly',
			prompt: 'deep wrinkles and tired eyes'
		},
		{
			id: 'scarred',
			titleKey: 'create.form.looks.scarred',
			prompt: 'a diagonal scar across one cheek'
		},
		{
			id: 'glowingEyes',
			titleKey: 'create.form.looks.glowingEyes',
			prompt: 'eyes glowing a single bright color'
		}
	],
	'state.pose': [
		{
			id: 'armsCrossed',
			titleKey: 'stateCapture.poses.armsCrossed',
			prompt: 'Fold both arms across the chest.'
		},
		{
			id: 'handsOnHips',
			titleKey: 'stateCapture.poses.handsOnHips',
			prompt: 'Rest both hands on the hips, elbows out.'
		},
		{
			id: 'crouch',
			titleKey: 'stateCapture.poses.crouch',
			prompt: 'Bend both knees and lower the hips.'
		},
		{ id: 'sit', titleKey: 'stateCapture.poses.sit', prompt: 'Sit on the ground with knees bent.' },
		{ id: 'kneel', titleKey: 'stateCapture.poses.kneel', prompt: 'Lower onto one knee.' },
		{
			id: 'wave',
			titleKey: 'stateCapture.poses.wave',
			prompt: 'Raise one hand beside the head, palm out.'
		},
		// Names the State "riding", which mounted riding uses (docs/research/2026-11-21-riding-state/README.md).
		{
			id: 'riding',
			titleKey: 'stateCapture.poses.riding',
			action: 'riding',
			prompt:
				'Hold a still riding pose. Preserve the direction, camera, clothing and proportions. Sit upright astride an invisible seat, with knees bent apart and the lower legs hanging at the sides, feet under the hips. Keep hands forward at waist height. Draw only the character on transparency.'
		}
	],
	// Ride stays out: the Move sheet never offers it as a template.
	move: [
		move('idle', 'moveNames.idle'),
		move('walk', 'moveNames.walk'),
		move('run', 'moveNames.run'),
		move('jump', 'moveNames.jump'),
		move('slash'),
		move('hurt'),
		move('death'),
		move('cast')
	],
	'item.head': [
		{ id: 'head.knightHelmet', titleKey: 'studioSlots.ideas.head.1', prompt: 'iron knight helmet' },
		{ id: 'head.hood', titleKey: 'studioSlots.ideas.head.3', prompt: 'hood' },
		{ id: 'head.wizardHat', titleKey: 'studioSlots.ideas.head.0', prompt: 'wizard hat' },
		{ id: 'head.goldenCrown', titleKey: 'studioSlots.ideas.head.2', prompt: 'golden crown' }
	],
	'item.hair': [
		{ id: 'hair.shortSpikyHair', titleKey: 'studioSlots.ideas.hair.1', prompt: 'short spiky hair' },
		{ id: 'hair.ponytail', titleKey: 'studioSlots.ideas.hair.2', prompt: 'ponytail' },
		{
			id: 'hair.longBraidedHair',
			titleKey: 'studioSlots.ideas.hair.0',
			prompt: 'long braided hair'
		}
	],
	'item.face_acc': [
		{
			id: 'face_acc.roundGlasses',
			titleKey: 'studioSlots.ideas.face_acc.0',
			prompt: 'round glasses'
		},
		{ id: 'face_acc.eyePatch', titleKey: 'studioSlots.ideas.face_acc.1', prompt: 'eye patch' },
		{ id: 'face_acc.banditMask', titleKey: 'studioSlots.ideas.face_acc.2', prompt: 'bandit mask' }
	],
	'item.torso_inner': [
		{
			id: 'torso_inner.blueTunic',
			titleKey: 'studioSlots.ideas.torso_inner.2',
			prompt: 'blue tunic'
		},
		{
			id: 'torso_inner.leatherVest',
			titleKey: 'studioSlots.ideas.torso_inner.0',
			prompt: 'leather vest'
		},
		{
			id: 'torso_inner.chainmailShirt',
			titleKey: 'studioSlots.ideas.torso_inner.1',
			prompt: 'chainmail shirt'
		}
	],
	'item.arms': [
		{ id: 'arms.leatherGloves', titleKey: 'studioSlots.ideas.arms.0', prompt: 'leather gloves' },
		{ id: 'arms.ironGauntlets', titleKey: 'studioSlots.ideas.arms.1', prompt: 'iron gauntlets' },
		{ id: 'arms.clothWraps', titleKey: 'studioSlots.ideas.arms.2', prompt: 'cloth wraps' }
	],
	'item.legs': [
		{ id: 'legs.brownTrousers', titleKey: 'studioSlots.ideas.legs.0', prompt: 'brown trousers' },
		{ id: 'legs.plateGreaves', titleKey: 'studioSlots.ideas.legs.1', prompt: 'plate greaves' },
		{ id: 'legs.pleatedSkirt', titleKey: 'studioSlots.ideas.legs.2', prompt: 'pleated skirt' }
	],
	'item.feet': [
		{ id: 'feet.leatherBoots', titleKey: 'studioSlots.ideas.feet.0', prompt: 'leather boots' },
		{ id: 'feet.sandals', titleKey: 'studioSlots.ideas.feet.1', prompt: 'sandals' },
		{ id: 'feet.ironSabatons', titleKey: 'studioSlots.ideas.feet.2', prompt: 'iron sabatons' }
	],
	'item.back': [
		{ id: 'back.redCape', titleKey: 'studioSlots.ideas.back.0', prompt: 'red cape' },
		{ id: 'back.travelBackpack', titleKey: 'studioSlots.ideas.back.1', prompt: 'travel backpack' },
		{ id: 'back.quiverOfArrows', titleKey: 'studioSlots.ideas.back.2', prompt: 'quiver of arrows' }
	],
	'item.main_hand': [
		{
			id: 'main_hand.steelSword',
			titleKey: 'studioSlots.ideas.main_hand.0',
			prompt: 'steel sword'
		},
		{
			id: 'main_hand.woodenStaff',
			titleKey: 'studioSlots.ideas.main_hand.1',
			prompt: 'wooden staff'
		},
		{ id: 'main_hand.battleAxe', titleKey: 'studioSlots.ideas.main_hand.2', prompt: 'battle axe' }
	],
	'item.off_hand': [
		{
			id: 'off_hand.roundShield',
			titleKey: 'studioSlots.ideas.off_hand.0',
			prompt: 'round shield'
		},
		{
			id: 'off_hand.ironLantern',
			titleKey: 'studioSlots.ideas.off_hand.1',
			prompt: 'iron lantern'
		},
		{
			id: 'off_hand.woodenLongbow',
			titleKey: 'studioSlots.ideas.off_hand.2',
			prompt: 'wooden longbow'
		}
	],
	'item.facial_hair': [
		{
			id: 'facial_hair.fullBeard',
			titleKey: 'studioSlots.ideas.facial_hair.0',
			prompt: 'full beard'
		},
		{ id: 'facial_hair.goatee', titleKey: 'studioSlots.ideas.facial_hair.2', prompt: 'goatee' },
		{
			id: 'facial_hair.handlebarMustache',
			titleKey: 'studioSlots.ideas.facial_hair.1',
			prompt: 'handlebar mustache'
		}
	],
	'item.torso_outer': [
		{
			id: 'torso_outer.steelPlateArmor',
			titleKey: 'studioSlots.ideas.torso_outer.0',
			prompt: 'steel plate armor'
		},
		{
			id: 'torso_outer.hoodedRobe',
			titleKey: 'studioSlots.ideas.torso_outer.1',
			prompt: 'hooded robe'
		},
		{ id: 'torso_outer.longCoat', titleKey: 'studioSlots.ideas.torso_outer.2', prompt: 'long coat' }
	],
	'item.underwear': [
		{
			id: 'underwear.plainWhiteUnderwearSet',
			titleKey: 'studioSlots.ideas.underwear.0',
			prompt: 'plain white underwear set'
		},
		{
			id: 'underwear.stripedSwimsuit',
			titleKey: 'studioSlots.ideas.underwear.1',
			prompt: 'striped swimsuit'
		}
	],
	'item.waist': [
		{ id: 'waist.leatherBelt', titleKey: 'studioSlots.ideas.waist.0', prompt: 'leather belt' },
		{ id: 'waist.redSash', titleKey: 'studioSlots.ideas.waist.1', prompt: 'red sash' },
		{ id: 'waist.beltPouch', titleKey: 'studioSlots.ideas.waist.2', prompt: 'belt pouch' }
	],
	'item.neck': [
		{ id: 'neck.goldAmulet', titleKey: 'studioSlots.ideas.neck.0', prompt: 'gold amulet' },
		{ id: 'neck.woolScarf', titleKey: 'studioSlots.ideas.neck.1', prompt: 'wool scarf' },
		{ id: 'neck.beadNecklace', titleKey: 'studioSlots.ideas.neck.2', prompt: 'bead necklace' }
	],
	'item.shoulders': [
		{
			id: 'shoulders.steelPauldrons',
			titleKey: 'studioSlots.ideas.shoulders.0',
			prompt: 'steel pauldrons'
		},
		{ id: 'shoulders.furMantle', titleKey: 'studioSlots.ideas.shoulders.1', prompt: 'fur mantle' }
	],
	'item.accessory': [
		{
			id: 'accessory.brassBrooch',
			titleKey: 'studioSlots.ideas.accessory.0',
			prompt: 'brass brooch'
		},
		{ id: 'accessory.ribbonBow', titleKey: 'studioSlots.ideas.accessory.1', prompt: 'ribbon bow' },
		{ id: 'accessory.charmPouch', titleKey: 'studioSlots.ideas.accessory.2', prompt: 'charm pouch' }
	]
};
