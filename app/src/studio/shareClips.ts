export const ALL_STATES = '__all_states__';
export const ALL_MOVES = '__all_moves__';
export const ALL_CLIPS = '__all_clips__';

export function includesShareClip(selection: string, id: string, kind: 'state' | 'move') {
	return (
		selection === id ||
		selection === ALL_CLIPS ||
		selection === (kind === 'state' ? ALL_STATES : ALL_MOVES)
	);
}
