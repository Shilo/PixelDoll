// Approved round-six scene art controls. UI appearance remains owned by Bronze.
import { assetUrl } from '../../lib/assets.ts';
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

// Code-only controls, intentionally absent from the user preferences.
export const REFLECTION = {
	enabled: true,
	selection: true,
	preview: true,
	topdown: true,
	side: true,
	opacity: 0.12,
	compression: 0.35
};
export const MOTION = {
	speed: 300,
	cameraResponse: 9,
	/** Touch stick sizes in CSS px; compact applies on narrow or short screens such as phones in landscape. */
	joystick: {
		regular: { base: 144, thumb: 48, stroke: 2 },
		compact: { base: 128, thumb: 44, stroke: 2 },
		compactQuery: '(max-width: 360px), (max-height: 400px)',
		deadZone: 8
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
