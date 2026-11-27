// Wardrobe slot icons in Lucide's own style, so categories read like the rest of the app's icons: Lucide core wherever it
// has the item, three Lucide Lab icons, and six drawings for gear Lucide lacks, made to its design guide (24 grid, 2 px
// round stroke, simple geometric parts). Hair and Back use core Scissors and Backpack: drawn hair and capes read as an arch
// or a skirt at 16 px. Each drawing keeps one outline that names the slot, so pairs that sit near each other (shirt and
// coat, trousers and underwear, necklace and ring) stay apart at the smallest size.
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
	| 'crown'
	| 'scissors'
	| 'glasses'
	| 'shirt'
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
	head: 'crown',
	hair: 'scissors',
	face_acc: 'glasses',
	torso_inner: 'shirt',
	// A long coat with a V collar and a center opening: clearly longer than the shirt and open at the front.
	torso_outer: path('M9 3 5 6v15h14V6l-4-3', 'M9 3l3 6 3-6', 'M12 9v12'),
	// Lucide Lab shorts-boxer (ISC, notice at the end of this file).
	underwear: path(
		'M10.7 15.8 9 20H4a2 2 0 0 1-2-2V5c0-.6.4-1 1-1h18c.6 0 1 .4 1 1v13a2 2 0 0 1-2 2h-5l-1.7-4.2',
		'M2 8h20',
		'M16 8v4a4 4 0 0 1-8 0V8'
	),
	// A strap with a square buckle and prong.
	waist: path('M3 8h18v8H3z', 'M9 8h6v8H9z', 'M12 10v4'),
	// A waistband over two long legs split by one crotch notch: far taller than the underwear.
	legs: path('M6 4h12', 'M6 4v16h4l2-8 2 8h4V4'),
	// A side-view boot: shaft, toe and a sole line.
	feet: path('M6 4h8v9l4 3v4H6z', 'M6 16h12'),
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

/* The license the three Lucide Lab drawings above are copied under
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
