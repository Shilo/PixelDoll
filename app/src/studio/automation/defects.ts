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
	'Small parts apart from the main art, outlined in yellow on the sheet. A part may be intentional (an earring, a strand of hair, a spark): check it on the sheet before treating it as a stray.';

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

/** The frame's small parts: all of them (to outline on the sheet) and the capped listing for the digest. */
function findDefects(direction: string, frame: number, image: Img) {
	const [main, ...rest] = components(maskOf(image), image.w, image.h)
		.map((part) => box(part, image.w))
		.sort((a, b) => b.size - a.size || a.y - b.y || a.x - b.x);
	// Every part but the largest counts, even one as large as it.
	const parts = rest.filter((part) => part.size <= MAX_PART_SIZE);
	if (!main || !parts.length) return null;
	const listed: FrameDefects = {
		direction,
		frame,
		main,
		detached: parts.slice(0, MAX_DETACHED),
		detachedCount: parts.length
	};
	return { parts, listed };
}

/** Null when the frame is one piece, empty, or has no part small enough to look like a stray. */
export const frameDefects = (direction: string, frame: number, image: Img): FrameDefects | null =>
	findDefects(direction, frame, image)?.listed ?? null;

/** Builds the digest one frame at a time, so a call never has to hold every frame it checks. */
export class DefectDigest {
	#checked = 0;
	#empty: string[] = [];
	#frames: FrameDefects[] = [];
	#more = 0;

	/** Checks one frame and returns all of its small parts, to outline on the sheet even past the digest's caps. */
	add({ direction, frame, image }: EvidenceFrame): Part[] {
		this.#checked++;
		if (!image || !opaqueBox(image)) {
			this.#empty.push(`${direction} frame ${frame}`);
			return [];
		}
		const found = findDefects(direction, frame, image);
		if (!found) return [];
		if (this.#frames.length < MAX_FRAMES) this.#frames.push(found.listed);
		else this.#more++;
		return found.parts;
	}

	/** What an agent should look at; frames that are one piece are left out so the digest stays small. */
	result() {
		const digest = {
			framesChecked: this.#checked,
			/** "east frame 3": covered frames with no opaque pixel. */
			emptyFrames: [...this.#empty],
			frames: [...this.#frames],
			/** Frames with small parts beyond the listed ones. */
			moreFrames: this.#more
		};
		return digest.frames.length ? { ...digest, note: DEFECT_NOTE } : digest;
	}
}

export function defectDigest(frames: Iterable<EvidenceFrame>) {
	const digest = new DefectDigest();
	for (const frame of frames) digest.add(frame);
	return digest.result();
}
