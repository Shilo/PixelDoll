// Which State or Move each Live Views action plays (docs/design/live-view-controls-plan.md). Pure: the saved choices
// live in liveSettings.ts. Exports and generation never read these; they only drive Top-down and Side-scroller.
import { clipKind } from '../../lib/runtime/timeline.js';
import { moveWords } from '../../lib/rig/clips.ts';
import { DEFAULT_MOVE } from '../../lib/rig/rig.ts';
import type { RigAnimation } from '../../lib/store/manifest.ts';

export const LIVE_ROLES = ['idle', 'walk', 'attack', 'jump', 'attackUp', 'attackDown'] as const;
export type LiveRole = (typeof LIVE_ROLES)[number];
/** The saved choice per role; a missing role plays its Automatic clip. */
export type LiveRoleChoices = Partial<Record<LiveRole, string>>;

/** Whole words in a Move's ID that name an action, tried after its exact ID. Idle and Walk keep their exact IDs only, so
 * a character's existing walk never changes to a "walk-attack". */
const ROLE_WORDS: Record<'attack' | 'jump', readonly string[]> = {
	attack: ['attack', 'slash', 'punch', 'strike', 'stab', 'swing', 'kick', 'shoot', 'cast'],
	jump: ['jump', 'jumping', 'leap', 'hop']
};

/**
 * The clip Automatic plays for a role: the clip with the role's own ID, then for Attack and Jump the first Move whose ID
 * names it, in the character's order. Attack up and down have none: they fall back to Attack.
 */
export function automaticClip(
	animations: readonly RigAnimation[],
	role: LiveRole
): string | undefined {
	if (role === 'attackUp' || role === 'attackDown') return undefined;
	if (animations.some((clip) => clip.id === role)) return role;
	if (role === 'idle' || role === 'walk') return undefined;
	const words = ROLE_WORDS[role];
	return animations.find(
		(clip) =>
			clip.id !== DEFAULT_MOVE &&
			clipKind(clip) === 'move' &&
			moveWords(clip.id).some((word) => words.includes(word))
	)?.id;
}

/** A saved choice counts only while that clip exists, so a trashed clip plays Automatic until it is restored. */
export function chosenClip(
	animations: readonly RigAnimation[],
	choices: LiveRoleChoices | undefined,
	role: LiveRole
) {
	const chosen = choices?.[role];
	return chosen && animations.some((clip) => clip.id === chosen) ? chosen : undefined;
}

export interface LiveClips {
	/** Each list is tried in order, per facing, until one has artwork. */
	idle: string[];
	walk: string[];
	/** Empty when the character has no clip for the action. */
	attack: string[];
	jump: string[];
	attackUp: string[];
	attackDown: string[];
}

/** Idle falls back to Standing, Walk to Idle; Attack up and down fall back to Attack. */
export function liveClips(
	animations: readonly RigAnimation[],
	choices?: LiveRoleChoices
): LiveClips {
	const pick = (role: LiveRole) =>
		chosenClip(animations, choices, role) ?? automaticClip(animations, role);
	const chain = (...clips: (string | undefined)[]) => [
		...new Set(clips.filter((clip): clip is string => !!clip))
	];
	const idle = chain(pick('idle') ?? 'idle', DEFAULT_MOVE);
	const attack = chain(pick('attack'));
	return {
		idle,
		walk: chain(pick('walk') ?? 'walk', ...idle),
		attack,
		jump: chain(pick('jump')),
		attackUp: chain(pick('attackUp'), ...attack),
		attackDown: chain(pick('attackDown'), ...attack)
	};
}
