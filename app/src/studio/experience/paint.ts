/**
 * Records one animation frame's 2D drawing and replays it on the real canvas only when it differs from the last frame
 * painted. The stage computes a frame on every animation frame; most of them draw exactly what is already on screen, and
 * repainting a full-window canvas for nothing cost a whole CPU core per open Studio.
 */
export function frameRecorder(target: CanvasRenderingContext2D) {
	let calls: unknown[][] = [],
		painted = '',
		version = 0,
		next = 0;
	const ids = new WeakMap<object, number>();
	const id = (value: object) => {
		let n = ids.get(value);
		if (n === undefined) ids.set(value, (n = ++next));
		return n;
	};
	// Only the calls and property writes the stage makes are recorded; reading the context's state is not supported.
	const context = new Proxy({} as CanvasRenderingContext2D, {
		get:
			(_, name) =>
			(...args: unknown[]) =>
				void calls.push([name, ...args]),
		set: (_, name, value) => {
			calls.push(['=', name, value]);
			return true;
		}
	});
	const real = target as unknown as Record<string | symbol, unknown>;
	return {
		context,
		/** An image the frames draw (a canvas) was redrawn in place, so equal calls no longer paint equal pixels. */
		redrawn() {
			version++;
		},
		/** The canvas lost its pixels (resized or its context restored): paint the next frame whatever it holds. */
		invalidate() {
			painted = '';
		},
		/** Paint the recorded frame unless it matches the last one painted; reports whether it painted. */
		commit() {
			const frame = calls;
			calls = [];
			// Images compare by identity plus the redraw version; every other argument by value.
			const stamp = `${version} ${JSON.stringify(frame, (_, value: unknown) =>
				value && typeof value === 'object' && !Array.isArray(value) ? `#${id(value)}` : value
			)}`;
			if (stamp === painted) return false;
			painted = stamp;
			for (const [name, ...args] of frame)
				if (name === '=') real[args[0] as string] = args[1];
				else (real[name as string] as (...a: unknown[]) => void).apply(target, args);
			return true;
		}
	};
}
