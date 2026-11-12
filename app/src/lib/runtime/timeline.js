/** @typedef {{cell: number, ms: number}} TimelineFrame */

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
