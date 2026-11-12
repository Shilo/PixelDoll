import { afterEach, beforeEach, expect, test, vi, type Mock } from 'vitest';
import { contextMenu } from '../../src/studio/contextMenu.ts';

let host: EventTarget, node: EventTarget;
let open: Mock<() => void>;
let action: ReturnType<typeof contextMenu>;
function send(target: EventTarget, type: string, properties: Record<string, unknown> = {}) {
	const event = new Event(type, { cancelable: true });
	Object.assign(event, properties);
	target.dispatchEvent(event);
	return event;
}
function press() {
	send(node, 'pointerdown', {
		pointerType: 'touch',
		button: 0,
		isPrimary: true,
		pointerId: 1,
		clientX: 20,
		clientY: 20
	});
}
beforeEach(() => {
	vi.useFakeTimers();
	host = new EventTarget();
	node = new EventTarget();
	vi.stubGlobal('window', host);
	open = vi.fn();
	action = contextMenu(node as HTMLElement, open);
});
afterEach(() => {
	action.destroy();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
test.each(['pointerup', 'pointercancel', 'scroll'])('%s cancels pending long press', (type) => {
	press();
	vi.advanceTimersByTime(300);
	send(host, type, { pointerId: 1 });
	vi.advanceTimersByTime(600);
	expect(open).not.toHaveBeenCalled();
});
test('movement cancels and release click is suppressed only once', () => {
	press();
	send(host, 'pointermove', { pointerId: 1, clientX: 31, clientY: 20 });
	vi.advanceTimersByTime(600);
	expect(open).not.toHaveBeenCalled();
	press();
	vi.advanceTimersByTime(550);
	expect(open).toHaveBeenCalledTimes(1);
	send(host, 'pointerup', { pointerId: 1 });
	expect(send(node, 'click').defaultPrevented).toBe(true);
	expect(send(node, 'click').defaultPrevented).toBe(false);
});
test('native context menu does not duplicate long press', () => {
	press();
	vi.advanceTimersByTime(550);
	expect(send(node, 'contextmenu').defaultPrevented).toBe(true);
	expect(open).toHaveBeenCalledTimes(1);
});
test('long-press touch release prevents native compatibility mouse events', () => {
	press();
	expect(send(node, 'touchend').defaultPrevented).toBe(false);
	vi.advanceTimersByTime(550);
	expect(send(node, 'touchend').defaultPrevented).toBe(true);
});
test('cancel after long press does not swallow later keyboard activation', () => {
	press();
	vi.advanceTimersByTime(550);
	send(host, 'pointercancel', { pointerId: 1 });
	expect(send(node, 'click', { detail: 0 }).defaultPrevented).toBe(false);
});
