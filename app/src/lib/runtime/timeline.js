/** @typedef {{cell: number, ms: number}} TimelineFrame */
/** @typedef {import('./types.d.ts').RigAnimation} PlaybackClip */

/** @param {PlaybackClip} clip @returns {'state' | 'move'} */
export function clipKind(clip) {
	return clip.kind ?? (clip.id === 'default' ? 'state' : 'move');
}

/** @param {readonly PlaybackClip[]} clips */
export function playbackClips(clips) {
	const occupied = new Set(clips.map(({ id }) => id));
	let displaced = 'standing-move';
	while (occupied.has(displaced)) displaced += '-move';
	return clips.map((clip) => ({
		id:
			clip.id === 'default'
				? 'standing'
				: clip.id === 'standing' && occupied.has('default')
					? displaced
					: clip.id,
		key: clip.id,
		kind: clipKind(clip),
		clip
	}));
}

/** @param {{frames: readonly TimelineFrame[]}} clip */
export function lastPlaybackCell(clip) {
	return clip.frames.at(-1)?.cell;
}

/** @param {readonly TimelineFrame[]} frames */
export function timelineDuration(frames) {
	return frames.reduce((total, frame) => total + frame.ms, 0);
}

/** @param {readonly TimelineFrame[]} frames @param {number} elapsedMs @param {boolean} [loop] */
export function sampleTimeline(frames, elapsedMs, loop = true) {
	const duration = timelineDuration(frames);
	if (
		!frames.length ||
		!Number.isFinite(duration) ||
		duration <= 0 ||
		frames.some((frame) => !Number.isFinite(frame.ms) || frame.ms <= 0)
	)
		throw new Error('PixelDoll: invalid animation timeline');
	const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
	let remaining = loop ? elapsed % duration : Math.min(elapsed, duration);
	for (const frame of frames) {
		if (remaining < frame.ms) return frame.cell;
		remaining -= frame.ms;
	}
	return frames[frames.length - 1].cell;
}
