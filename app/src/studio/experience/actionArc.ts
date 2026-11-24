// The touch action cluster's one geometry (GameControls.svelte): every screen and orientation places Jump, Sprint and
// Mount at the same spots around the Attack stick, each its own angle on an arc the same gap from the stick's rim.
import { MOTION } from './config.ts';

export type ActionButton = keyof typeof MOTION.actions.buttons;

/** Each button's diameter and its center relative to the stick's center, in CSS px (y points down). */
export function actionArc(actions = MOTION.actions) {
	const radius = actions.stick.base / 2;
	return Object.fromEntries(
		Object.entries(actions.buttons).map(([id, { size, angle }]) => {
			const distance = radius + actions.gap + size / 2,
				turn = (angle * Math.PI) / 180;
			return [id, { size, x: Math.cos(turn) * distance, y: -Math.sin(turn) * distance }];
		})
	) as Record<ActionButton, { size: number; x: number; y: number }>;
}
