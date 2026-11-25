import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchSizes } from '../../src/studio/watchSizes.ts';

class FakeResizeObserver {
	static instances: FakeResizeObserver[] = [];
	readonly observed: { element: HTMLElement; options?: ResizeObserverOptions }[] = [];
	disconnected = false;
	constructor(readonly callback: ResizeObserverCallback) {
		FakeResizeObserver.instances.push(this);
	}
	observe(element: HTMLElement, options?: ResizeObserverOptions) {
		this.observed.push({ element, options });
	}
	disconnect() {
		this.disconnected = true;
	}
	fire() {
		this.callback([], this as unknown as ResizeObserver);
	}
}

const frames: FrameRequestCallback[] = [];
const requestFrame = vi.fn((callback: FrameRequestCallback) => {
	frames.push(callback);
	return frames.length;
});
const cancelFrame = vi.fn();

afterEach(() => {
	FakeResizeObserver.instances = [];
	frames.length = 0;
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

function runFrame() {
	frames.shift()?.(0);
}

describe('watchSizes', () => {
	it('measures once synchronously, then waits for an animation frame after a resize', () => {
		vi.stubGlobal('ResizeObserver', FakeResizeObserver);
		vi.stubGlobal('requestAnimationFrame', requestFrame);
		vi.stubGlobal('cancelAnimationFrame', cancelFrame);
		const first = {} as HTMLElement,
			second = {} as HTMLElement,
			measure = vi.fn();

		const cleanup = watchSizes([first, second], measure);
		expect(measure).toHaveBeenCalledTimes(1);
		const observer = FakeResizeObserver.instances[0];
		expect(observer.observed).toEqual([
			{ element: first, options: { box: 'border-box' } },
			{ element: second, options: { box: 'border-box' } }
		]);

		observer.fire();
		expect(measure).toHaveBeenCalledTimes(1);
		expect(requestFrame).toHaveBeenCalledTimes(1);
		runFrame();
		expect(measure).toHaveBeenCalledTimes(2);
		cleanup();
	});

	it('coalesces a burst of resizes and cancels a pending frame on cleanup', () => {
		vi.stubGlobal('ResizeObserver', FakeResizeObserver);
		vi.stubGlobal('requestAnimationFrame', requestFrame);
		vi.stubGlobal('cancelAnimationFrame', cancelFrame);
		const measure = vi.fn();

		const cleanup = watchSizes([{} as HTMLElement], measure);
		const observer = FakeResizeObserver.instances[0];
		observer.fire();
		observer.fire();
		observer.fire();
		expect(requestFrame).toHaveBeenCalledTimes(3);
		// Each notification cancels the pending frame (including the first, harmlessly, when there is none).
		expect(cancelFrame).toHaveBeenCalledTimes(3);
		cleanup();
		expect(cancelFrame).toHaveBeenCalledTimes(4);
		expect(observer.disconnected).toBe(true);
	});
});
