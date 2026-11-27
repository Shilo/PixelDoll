// Wardrobe slot icons in Lucide's own style, so categories read like the rest of the app's icons: Lucide core wherever it
// has the item, Lucide Lab next, and drawings only for gear neither has (belt, necklace, pauldrons), made to Lucide's
// design guide (24 grid, 2 px round stroke, simple geometric parts). Hair and Back use core Scissors and Backpack: drawn
// hair and capes read as an arch or a skirt at 16 px. Each drawing keeps one outline that names the slot, so pairs that
// sit near each other (belt and underwear, necklace and ring) stay apart at the smallest size.
import type { SlotIcon } from '../lib/store/manifest.ts';

/** The grid every drawing is authored on: Lucide's. GroupIcon draws it at whatever size a surface asks for. */
export const SLOT_ICON_VIEW_BOX = 24;

/**
 * The surfaces an icon appears on, named instead of measured. Where text carries the row the icon matches the 16 px
 * Lucide actions beside it; where the icon is the target it is 24, so Lucide's 2 px stroke lands on whole pixels at
 * every device pixel ratio. List rows sit between at 18: the icon names the row, so it outranks the 16 px chevrons and
 * checks there. The stroke scales with the size (no absoluteStrokeWidth), so small icons never look bolder than the rail.
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
	/** One unlabeled drawing in the custom-slot icon picker, the same size as the rail it chooses for. */
	choice: 24
} as const;

export type SlotIconSurface = keyof typeof SLOT_ICON_SIZES;

/** One SVG element of a drawing, in Lucide's icon-node shape. */
export type SlotIconElement =
	['path', { d: string }] | ['circle', { cx: number; cy: number; r: number }];

/** Lucide core icons the set uses, by their Lucide name; GroupIcon maps each to its component. */
export type LucideSlotIcon =
	| 'person-standing'
	| 'hard-hat'
	| 'scissors'
	| 'glasses'
	| 'shirt'
	| 'jacket'
	| 'hand'
	| 'backpack'
	| 'sword'
	| 'shield'
	| 'tag'
	| 'star'
	| 'gem';

/** A Lucide core icon, or the elements of a drawing GroupIcon renders with Lucide's stroke attributes. */
export type SlotIconArt = LucideSlotIcon | readonly SlotIconElement[];

const path = (...ds: string[]): SlotIconElement[] => ds.map((d) => ['path', { d }]);

export const SLOT_ICONS: Record<SlotIcon, SlotIconArt> = {
	body: 'person-standing',
	head: 'hard-hat',
	hair: 'scissors',
	face_acc: 'glasses',
	torso_inner: 'shirt',
	torso_outer: 'jacket',
	// Lucide Lab shorts-boxer (ISC, notice at the end of this file).
	underwear: path(
		'M10.7 15.8 9 20H4a2 2 0 0 1-2-2V5c0-.6.4-1 1-1h18c.6 0 1 .4 1 1v13a2 2 0 0 1-2 2h-5l-1.7-4.2',
		'M2 8h20',
		'M16 8v4a4 4 0 0 1-8 0V8'
	),
	// A strap with a square buckle and prong.
	waist: path('M3 8h18v8H3z', 'M9 8h6v8H9z', 'M12 10v4'),
	// Lucide Lab trousers (ISC, notice at the end of this file).
	legs: path(
		'M4 6h16',
		'M6 22a2 2 0 0 1-2-2V3c0-.6.4-1 1-1h14c.6 0 1 .4 1 1v17a2 2 0 0 1-2 2h-3l-3-10-3 10Z',
		'm6 11-2 1',
		'M9 8.5V6',
		'M15 6v2.5',
		'm20 12-2-1',
		'M4 18h6',
		'M14 18h6'
	),
	// Lucide Lab sneaker (ISC, notice at the end of this file).
	feet: path(
		'M14.1 7.9 12.5 10',
		'M17.4 10.1 16 12',
		'M2 16a2 2 0 0 0 2 2h13c2.8 0 5-2.2 5-5a2 2 0 0 0-2-2c-.8 0-1.6-.2-2.2-.7l-6.2-4.2c-.4-.3-.9-.2-1.3.1 0 0-.6.8-1.2 1.1a3.5 3.5 0 0 1-4.2.1C4.4 7 3.7 6.3 3.7 6.3A.92.92 0 0 0 2 7Z',
		'M2 11c0 1.7 1.3 3 3 3h7'
	),
	arms: 'hand',
	// Two sloping pads joined by a neck curve: shoulder armor with no torso below it.
	shoulders: path(
		'M2 18c0-3 2-7 6-8l2 4c-2 1-3 2-3 4z',
		'M22 18c0-3-2-7-6-8l-2 4c2 1 3 2 3 4z',
		'M8 10c1-2 2-3 4-3s3 1 4 3'
	),
	// A chain with a hanging pendant: jewelry worn at the neck, unlike the ring's closed band.
	neck: path('M6 3v4a6 6 0 0 0 12 0V3', 'M12 14l3 3-3 3-3-3z'),
	back: 'backpack',
	main_hand: 'sword',
	off_hand: 'shield',
	// Lucide Lab mustache (ISC, notice at the end of this file).
	facial_hair: path(
		'M18.2 8.6a3.9 3.9 0 0 0-6.2-.2 3.75 3.75 0 0 0-6.2.2l-.6.8C4.5 10.4 3.3 11 2 11a5.55 5.55 0 0 0 10 3.2A5.45 5.45 0 0 0 22 11c-1.3 0-2.5-.6-3.2-1.6Z'
	),
	// Lucide Lab gem-ring (ISC, notice at the end of this file).
	accessory: [
		...path('M13.2 8.1 16 4.4 14.4 2H9.6L8 4.4l2.8 3.7'),
		['circle', { cx: 12, cy: 15, r: 7 }]
	],
	tag: 'tag',
	star: 'star',
	gem: 'gem'
};

/* The license the Lucide Lab drawings above are copied under
   (https://github.com/lucide-icons/lucide-lab).

   ISC License

   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

   Permission to use, copy, modify, and/or distribute this software for any
   purpose with or without fee is hereby granted, provided that the above
   copyright notice and this permission notice appear in all copies.

   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/
