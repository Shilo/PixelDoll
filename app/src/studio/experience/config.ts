// Approved round-six scene art controls. UI appearance remains owned by Bronze.
import { assetUrl } from '../../lib/assets.ts';
import { TRAVEL } from './movement.ts';
export type WorldTheme = 'dark' | 'light';
export type WorldMode = 'preview' | 'topdown' | 'side';
type RGB = readonly [number, number, number];
type Sample = readonly [number, number, number, number];

// Custom-property URLs otherwise resolve relative to the bundled CSS in /assets/.
// Resolve once against the page, retaining Vite's relative GitHub Pages base.
const asset = (name: string) => assetUrl(`worlds/${name}-stage.png`);
export const BACKGROUNDS = { dark: asset('obsidian'), light: asset('porcelain') } as const;
const backgrounds = (url: string) => ({
	selection: url,
	creation: url,
	preview: url,
	topdown: url,
	side: url
});

export const WORLDS: Record<
	WorldTheme,
	{
		backgrounds: ReturnType<typeof backgrounds>;
		floor: RGB;
		seam: RGB;
		fog: RGB;
		horizon: number;
		/** Where the character stands, as a fraction of the image height on its vanishing line (x 0.5). */
		floorPoint: number;
		/** The floor's focal length in image px, measured from the tile nearest the floor point (height to width of a
		 * square tile = rows below the horizon / focal): it sets how flat a circle on the floor looks. */
		focal: number;
		sample: Sample;
	}
> = {
	dark: {
		backgrounds: backgrounds(BACKGROUNDS.dark),
		floor: [0.085, 0.095, 0.105],
		seam: [0.49, 0.4, 0.27],
		fog: [0.145, 0.155, 0.165],
		horizon: 0.53,
		floorPoint: 0.8,
		focal: 700,
		sample: [0.58, 0.82, 0.055, 0.055]
	},
	light: {
		backgrounds: backgrounds(BACKGROUNDS.light),
		floor: [0.92, 0.9, 0.85],
		seam: [0.48, 0.36, 0.22],
		fog: [0.94, 0.92, 0.88],
		horizon: 0.475,
		floorPoint: 0.8,
		focal: 760,
		sample: [0.57, 0.82, 0.055, 0.055]
	}
};

export const MOTION = {
	...TRAVEL,
	cameraResponse: 9,
	/** Share of the eased camera's trailing lag removed by aiming it ahead of travel (movement.ts integrateMovement). */
	cameraLead: 0.75,
	/** World units within which a click or held mouse press counts as the spot the character stands on. */
	arrival: 4,
	/** Sprint (Shift or the Sprint toggle) multiplies travel speed, walking or riding. */
	sprintMultiplier: 1.5,
	/** Touch stick sizes in CSS px; compact applies on narrow or short screens such as phones in landscape. */
	joystick: {
		regular: { base: 144, thumb: 48, stroke: 2 },
		compact: { base: 128, thumb: 44, stroke: 2 },
		compactQuery: '(max-width: 360px), (max-height: 400px)',
		deadZone: 8
	},
	/**
	 * The touch action cluster at the stage's lower right: the Attack stick (the largest, under the thumb's rest) with
	 * Jump above it, Sprint at its upper left and Mount to its left, on an arc the thumb reaches by pivoting. Each button
	 * is [diameter, x, y] with its center relative to the stick's center in CSS px.
	 */
	actions: {
		/** A stage shorter than this (CSS px) takes the compact cluster, so Jump stays clear of the zoom controls. */
		compactBelow: 280,
		regular: {
			stick: { base: 112, thumb: 44, stroke: 2 },
			jump: [56, 0, -98],
			sprint: [48, -72, -64],
			mount: [44, -102, 0]
		},
		compact: {
			stick: { base: 96, thumb: 40, stroke: 2 },
			jump: [52, 0, -86],
			sprint: [44, -67, -45],
			mount: [44, -102, 0]
		}
	},
	tileSize: 100
};

/** Pixel size of every world image (public/worlds/*-stage.png); the world is scaled uniformly from it, never stretched. */
const WORLD_SIZE = [1672, 941] as const;

/** The world image's geometry for uniform placement (geometry.ts). */
export const worldArt = (theme: WorldTheme) => {
	const w = WORLDS[theme];
	return {
		width: WORLD_SIZE[0],
		height: WORLD_SIZE[1],
		horizon: w.horizon,
		floor: w.floorPoint,
		focal: w.focal
	};
};
