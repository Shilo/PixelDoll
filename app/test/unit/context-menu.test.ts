import { afterEach, beforeEach, expect, test, vi, type Mock } from 'vitest';
import { contextMenu } from '../../src/lib/input/contextMenu.ts';

let host: EventTarget, node: EventTarget;
let open: Mock<(element: HTMLElement) => void>;
let cleanup: () => void;
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
	cleanup = contextMenu(open)(node as HTMLElement) as () => void;
});
afterEach(() => {
	cleanup();
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
test('the shared callback receives its attached element for every activation method', () => {
	send(node, 'contextmenu');
	send(node, 'keydown', { key: 'ContextMenu' });
	send(node, 'keydown', { key: 'F10', shiftKey: true });
	press();
	vi.advanceTimersByTime(550);
	expect(open.mock.calls).toEqual([[node], [node], [node], [node]]);
});
test('cleanup cancels pending work and removes every element and window listener', () => {
	cleanup();
	const nodeAdd = vi.spyOn(node, 'addEventListener');
	const nodeRemove = vi.spyOn(node, 'removeEventListener');
	const hostAdd = vi.spyOn(host, 'addEventListener');
	const hostRemove = vi.spyOn(host, 'removeEventListener');
	cleanup = contextMenu(open)(node as HTMLElement) as () => void;
	press();
	cleanup();
	vi.advanceTimersByTime(600);
	for (const [type, listener] of nodeAdd.mock.calls)
		expect(
			nodeRemove.mock.calls.some(([removed, handler]) => removed === type && handler === listener)
		).toBe(true);
	for (const [type, listener] of hostAdd.mock.calls)
		expect(
			hostRemove.mock.calls.some(([removed, handler]) => removed === type && handler === listener)
		).toBe(true);
	for (const type of ['contextmenu', 'keydown', 'click', 'touchend'])
		expect(send(node, type, { key: 'ContextMenu' }).defaultPrevented).toBe(false);
	press();
	vi.advanceTimersByTime(600);
	expect(open).not.toHaveBeenCalled();
});
test('replacing an attachment cancels the old hold and uses only the new callback', () => {
	press();
	vi.advanceTimersByTime(300);
	cleanup();
	const replacement = vi.fn();
	cleanup = contextMenu(replacement)(node as HTMLElement) as () => void;
	vi.advanceTimersByTime(600);
	expect(open).not.toHaveBeenCalled();
	expect(replacement).not.toHaveBeenCalled();
	send(node, 'contextmenu');
	expect(replacement).toHaveBeenCalledExactlyOnceWith(node);
	expect(open).not.toHaveBeenCalled();
});
test('one attachment factory can be reused across independent elements', () => {
	cleanup();
	const attach = contextMenu(open);
	cleanup = attach(node as HTMLElement) as () => void;
	const other = new EventTarget();
	const detach = attach(other as HTMLElement) as () => void;
	try {
		press();
		vi.advanceTimersByTime(550);
		expect(open).toHaveBeenCalledExactlyOnceWith(node);
		expect(send(other, 'click').defaultPrevented).toBe(false);
		send(other, 'contextmenu');
		expect(open.mock.calls).toEqual([[node], [other]]);
	} finally {
		detach();
	}
});
