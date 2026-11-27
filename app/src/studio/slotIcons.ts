// Wardrobe slot icons, drawn as filled pixel silhouettes on Lucide's 24px grid. At 16px a 1.6px Lucide outline lands on
// barely one device pixel and fine interior lines average into grey, so each slot is one bold outer shape with at most one
// cut-out hint (a visor slit, a belt buckle, a sole line). Every icon fills 3-21 on the grid, shares currentColor and is
// tested as a solid contact sheet in both themes: the silhouette, not the detail, has to name the slot. Custom categories
// choose one of these instead of borrowing their behavior's drawing.
import type { SlotIcon } from '../lib/store/manifest.ts';

/**
 * The grid every drawing is authored on. GroupIcon draws this viewBox at whatever size a surface asks for, so a
 * replacement set changes this number together with the paths and nothing else.
 */
export const SLOT_ICON_VIEW_BOX = 24;

/**
 * The surfaces an icon appears on, named instead of measured: the rail and the section header are the two that matter,
 * and the rest keep the same drawing at a compact size. Sizes live here so a new set (or a new grid) is one edit, and so
 * no call site can drift to a size of its own.
 */
export const SLOT_ICON_SIZES = {
	/** A sticky section title in Wardrobe or Colors. */
	header: 16,
	/** A vertical category tab in the Wardrobe or Colors rail. */
	rail: 24,
	/** An item, outfit or slot tile, and the empty tile while it generates. */
	thumbnail: 24,
	/** A control or list row: slot picker, slot settings, not-shown rows. */
	inline: 18,
	/** One drawing in the custom-slot icon picker. */
	choice: 20
} as const;

export type SlotIconSurface = keyof typeof SLOT_ICON_SIZES;

/** One `d` per icon: disjoint parts and even-odd holes share a path, so overlapping parts are avoided. */
export const SLOT_ICON_PATHS: Record<SlotIcon, string> = {
	// Base: a standing figure, never a clothing shape.
	body: 'M12 2.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 9h8v6H8zM5 9h2v6H5zM17 9h2v6h-2zM9 16h2.5v6H9zM12.5 16H15v6h-2.5z',
	// A hat with a brim and band: headgear, unlike hair's open fringe.
	head: 'M5.5 15a6.5 6.5 0 0 1 13 0v1h-13zM3 16h18v3H3zM7 12.5h10v1.5H7z',
	// A cap with three hanging locks and uneven notches between them.
	hair: 'M5 21v-7a7 7 0 0 1 14 0v7h-3v-6l-2 1v5h-2.5v-5l-2 1v4z',
	// A pair of lenses with a bridge.
	face_acc:
		'M5 9h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2zM16 9h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2zM10 11h4v2h-4z',
	// A short-sleeved tee with a neck notch.
	torso_inner: 'M9 3h6l5 2.5-1.5 3.5-2-1V21H7.5V8L5.5 9 4 5.5zM10 3.2h4v1.5h-4z',
	// A long coat with a V collar and sleeves: clearly longer and narrower than the tee.
	torso_outer: 'M8 3h8l2 2v14h-2v2H8v-2H6V5zM10.5 3.2 12 6l1.5-2.8z',
	// Briefs: a short waist with two leg openings.
	underwear: 'M4 5h16v6l-4 6h-3v-5h-2v5H7l-3-6z',
	// A belt with a buckle opening and prong.
	waist: 'M3 9h18v6H3zM9 10h6v4H9zM11.5 10.2h1v3.6h-1z',
	// Trousers: a long waist with two tapering legs.
	legs: 'M6 3h12l1.5 18h-5.5l-1-8.5-1 8.5H4.5z',
	// A side-view boot with its sole separated by a cut line.
	feet: 'M7 3h7v9l5 3v6H7zM7.5 18h11v1.5h-11z',
	// A mitten with a thumb and cuff: the gear worn on hands.
	arms: 'M7 16v-6a5 5 0 0 1 10 0v6zM5.5 10a2.5 2.5 0 0 0 0 5H7v-5zM5.5 16h13v5h-13z',
	// A pair of shoulder caps with a neck gap: shoulder armor, wider than it is tall.
	shoulders: 'M3 19c0-5 2.5-9 6-9 2 0 3 1 3 3v6zM15 13c0-2 1-3 3-3 3.5 0 6 4 6 9h-9z',
	// A necklace: a chain U with a pendant.
	neck: 'M6 3v5a6 6 0 0 0 12 0V3h-2.5v5a3.5 3.5 0 0 1-7 0V3zM12 14l3 3-3 3-3-3z',
	// A flared cape with a neck notch and a ragged hem.
	back: 'M8 3h8l5 17-2 1.5-1.5-2-1.5 2-1.5-2-1.5 2-1.5-2-1.5 2-1.5-2L4 20zM10 3.2h4v2h-4z',
	// A sword standing on its point, so blade, guard, grip and pommel all read straight on.
	main_hand: 'M9.5 4.5 12 2l2.5 2.5V15h-5zM6.5 15h11v2.5h-11zM10.5 17.5h3V21h-3zM9 21h6v1.5H9z',
	// A heater shield with a boss.
	off_hand:
		'M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5zM12 8a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
	// A mustache with a goatee: two strokes around an implied mouth.
	facial_hair:
		'M12 12c-2-1-4-2-6.5-1.5C3 11 2 13 3 15c2 .5 4-.5 5.8-1.8 1.2-.8 2.2-.8 3.2.3 1-1.1 2-1.1 3.2-.3C17 14.5 19 15.5 21 15c1-2 0-4-2.5-4.5C16 10 14 11 12 12zM10 15.5h4L12 19z',
	// A ring with a stone: jewelry with no chain.
	accessory:
		'M12 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 11.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM9 2.5h6l2 4-5 2.5-5-2.5z',
	// Generic custom-category icons, so Wings does not have to look like Back.
	tag: 'M4 4h9l7 7-9 9-7-7zM8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
	star: 'M12 2.5l2.9 6.2 6.6.8-4.9 4.7 1.3 6.6L12 17.6l-5.9 3.2 1.3-6.6L2.5 9.5l6.6-.8z',
	gem: 'M7 3h10l4 6-9 12L3 9zM4.6 8.4h14.8v1.2H4.6z'
};
