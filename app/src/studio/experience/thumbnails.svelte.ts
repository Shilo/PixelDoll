import { SvelteMap } from 'svelte/reactivity';
import type { Img } from '../../lib/image/png.ts';
import type { Frame } from '../../lib/compose/compose.ts';
import { spriteScale } from '../spriteScale.ts';
import { crop, characterFacts } from '../model.ts';
import { stableStringify } from '../../lib/image/hash.ts';
import type { Preset, Project } from '../../lib/store/manifest.ts';
import { buildPresentation, southStill, renderPresentation } from './presentation.ts';
import { standingFrame } from './bounds.ts';

const cropped = new WeakMap<Img, Img | null>();

export function croppedThumbnail(image: Img): Img | null {
	if (!cropped.has(image)) cropped.set(image, crop(image));
	return cropped.get(image)!;
}

type CharacterStill = { image: Img | null; frame: Frame; body: Frame; facts: string };
const rendered = new WeakMap<Project, { key: string; still: CharacterStill }>();

export function characterStill(
	project: Project,
	items: Preset['items'],
	revision = 0
): CharacterStill {
	const key = stableStringify([revision, items]);
	const cached = rendered.get(project);
	if (cached?.key === key) return cached.still;
	const assets = buildPresentation(project);
	const pose = southStill(assets);
	const { image, frame } = renderPresentation(assets, items, pose);
	const still = {
		image,
		frame,
		body: standingFrame(project, pose.direction ?? 'south'),
		facts: characterFacts(project.manifest)
	};
	rendered.set(project, { key, still });
	return still;
}

// One still per character, shared by every thumbnail (cast, its reflection, the list and the name menu): stepping to
// another character or opening the menu reuses it instead of reading and decoding the character again, so nothing blinks.
// look is the listed revision it was drawn from; a newer one redraws it in the background, keeping the old one shown.
export const stills = new SvelteMap<string, CharacterStill & { look: string }>();
// Per character, the newest write: a live look or a read. Only the newest read may publish, and none after a live look.
// Plain on purpose: finishing a read must not rerun the effects (a failed read would retry in a loop).
export const newest = new Map<string, { look: string; reading: boolean }>();

type Still = { image: Img | null; frame: Frame; body?: Frame };

/** The whole device px per art px a character thumbnail of `size` CSS px backs its frame with. */
export function thumbBacking(size: number, still: Still | undefined, dpr: number): number {
	return Math.max(1, Math.floor((size / (still?.frame.h ?? 64)) * dpr));
}

/** CSS px per art px of a character thumbnail of `size` CSS px, as CharacterThumb and Sprite draw it. */
export function thumbScale(size: number, still: Still | undefined, dpr: number): number {
	return spriteScale(
		thumbBacking(size, still, dpr),
		still?.image?.w ?? 64,
		still?.image?.h ?? 64,
		dpr,
		size
	);
}

export function thumbAnchors(size: number, still: Still | undefined, dpr: number) {
	const scale = thumbScale(size, still, dpr);
	const frame = still?.frame ?? { w: 64, h: 64, x: 32, y: 64 };
	const body = still?.body ?? frame;
	const width = still?.image?.w ?? 64;
	const height = still?.image?.h ?? 64;
	const ground = {
		x: (frame.x + body.w / 2 - body.x - width / 2) * scale,
		y: (frame.y + body.h - body.y - height) * scale
	};
	return { ground, center: { x: ground.x, y: ground.y - (body.h * scale) / 2 } };
}

/** Drop the stills of characters no longer listed (deleted here or in another tab); a read still running for one is
 *  discarded when it finishes. Call only with a complete listing. */
export function keepThumbnails(listed: ReadonlySet<string>) {
	for (const id of [...stills.keys(), ...newest.keys()])
		if (!listed.has(id)) {
			stills.delete(id);
			newest.delete(id);
		}
}
