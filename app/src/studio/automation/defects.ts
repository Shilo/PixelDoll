// Detached-pixel digest for agent evidence. A model looking at a contact sheet can miss a few pixels apart from the art, and
// a screenshot cannot give coordinates; this names the frame and the place instead. Parts are 8-connected, as pixel art
// reads a diagonal step as joined, and only tiny parts count, since larger separate parts (two boots, a blade apart from its
// hilt) are design.
import { components } from '../../lib/image/chroma.ts';
import type { Img } from '../../lib/image/png.ts';
import { maskOf } from '../../lib/image/similarity.ts';
import { opaqueBox } from '../../lib/rig/normalize.ts';

/** Box of one part in uncropped frame pixels. */
export interface Part {
	size: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface FrameDefects {
	direction: string;
	frame: number;
	/** The largest part, for where the small ones sit relative to the art. */
	main: Part;
	/** Small parts apart from the main one, largest first. */
	detached: Part[];
	/** Small parts found, including any beyond the listed ones. */
	detachedCount: number;
}

export interface EvidenceFrame {
	direction: string;
	frame: number;
	image: Img | null;
}

// Includes the small disconnected parts seen in the demo sword's walk.
const MAX_PART_SIZE = 8;
// Caps keep a frame full of specks from turning a tool result into a wall of coordinates.
const MAX_DETACHED = 6,
	MAX_FRAMES = 16;
export const DEFECT_NOTE =
	'Small parts apart from the main art. A part may be intentional (an earring, a strand of hair, a spark): check it on the sheet before treating it as a stray.';

function box(part: number[], w: number): Part {
	let x0 = Infinity,
		y0 = Infinity,
		x1 = -1,
		y1 = -1;
	for (const p of part) {
		const x = p % w,
			y = (p - x) / w;
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	}
	return { size: part.length, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Null when the frame is one piece, empty, or has no part small enough to look like a stray. */
export function frameDefects(direction: string, frame: number, image: Img): FrameDefects | null {
	const parts = components(maskOf(image), image.w, image.h)
		.map((part) => box(part, image.w))
		.sort((a, b) => b.size - a.size || a.y - b.y || a.x - b.x);
	const [main] = parts;
	if (!main) return null;
	const detached = parts.filter((part) => part.size <= MAX_PART_SIZE && part.size < main.size);
	if (!detached.length) return null;
	return {
		direction,
		frame,
		main,
		detached: detached.slice(0, MAX_DETACHED),
		detachedCount: detached.length
	};
}

/** What an agent should look at; frames that are one piece are left out so the digest stays small. */
export function defectDigest(frames: readonly EvidenceFrame[]) {
	const digest = {
		framesChecked: frames.length,
		/** "east frame 3": covered frames with no opaque pixel. */
		emptyFrames: [] as string[],
		frames: [] as FrameDefects[],
		/** Frames with small parts beyond the listed ones. */
		moreFrames: 0
	};
	for (const { direction, frame, image } of frames) {
		if (!image || !opaqueBox(image)) {
			digest.emptyFrames.push(`${direction} frame ${frame}`);
			continue;
		}
		const found = frameDefects(direction, frame, image);
		if (!found) continue;
		if (digest.frames.length < MAX_FRAMES) digest.frames.push(found);
		else digest.moreFrames++;
	}
	return digest.frames.length ? { ...digest, note: DEFECT_NOTE } : digest;
}
