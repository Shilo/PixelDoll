import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { slotDrag } from '../../src/studio/slotDrag.ts';

let host: EventTarget;
let document: EventTarget & { hidden: boolean };
let node: HTMLElement;
let cleanup: () => void;
const start = vi.fn();
const move = vi.fn();
const end = vi.fn();
const armed = vi.fn();
let captures: Set<number>;

function send(target: EventTarget, type: string, properties: Record<string, unknown> = {}) {
	const event = Object.assign(new Event(type, { cancelable: true }), properties);
	target.dispatchEvent(event);
	return event;
}
function pointer(type: string, x = 20, y = 20, properties: Record<string, unknown> = {}) {
	return send(type === 'pointerdown' ? node : host, type, {
		pointerType: 'mouse',
		pointerId: 1,
		button: 0,
		isPrimary: true,
		clientX: x,
		clientY: y,
		...properties
	});
}
function touch(type: string, x = 20, y = 20) {
	const contact = { identifier: 1, clientX: x, clientY: y };
	return send(type === 'touchstart' ? node : host, type, {
		touches: type === 'touchend' || type === 'touchcancel' ? [] : [contact],
		changedTouches: [contact]
	});
}
function click(detail = 1) {
	return send(host, 'click', { detail });
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	host = new EventTarget();
	document = Object.assign(new EventTarget(), { hidden: false });
	captures = new Set();
	node = Object.assign(new EventTarget(), {
		ownerDocument: document,
		setPointerCapture: vi.fn((id: number) => captures.add(id)),
		hasPointerCapture: (id: number) => captures.has(id),
		releasePointerCapture: vi.fn((id: number) => captures.delete(id))
	}) as unknown as HTMLElement;
	vi.stubGlobal('window', host);
	cleanup = slotDrag(node, { start, move, end, armed });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

test.each(['mouse', 'pen'])(
	'%s starts at six pixels and suppresses only the release click',
	(kind) => {
		pointer('pointerdown', 20, 20, { pointerType: kind });
		pointer('pointermove', 25);
		expect(start).not.toHaveBeenCalled();
		pointer('pointermove', 26);
		pointer('pointermove', 30, 40);
		expect(start).toHaveBeenCalledTimes(1);
		expect(move.mock.calls).toEqual([
			[26, 20],
			[30, 40]
		]);
		expect(captures.has(1)).toBe(true);
		pointer('pointerup');
		pointer('pointerup');
		expect(end).toHaveBeenCalledExactlyOnceWith(true);
		expect(captures.size).toBe(0);
		expect(click().defaultPrevented).toBe(true);
		expect(click().defaultPrevented).toBe(false);
	}
);

test('ordinary mouse clicks and short touch taps remain available to the menu', () => {
	pointer('pointerdown');
	pointer('pointerup');
	expect(click().defaultPrevented).toBe(false);
	touch('touchstart');
	vi.advanceTimersByTime(299);
	expect(touch('touchend').defaultPrevented).toBe(false);
	vi.advanceTimersByTime(500);
	expect(click().defaultPrevented).toBe(false);
	expect(start).not.toHaveBeenCalled();
	expect(end).not.toHaveBeenCalled();
	expect(armed).not.toHaveBeenCalled();
});

test('slot context menus cancel the hold and preserve drag and scrolling tolerance', () => {
	cleanup();
	const menu = vi.fn();
	cleanup = slotDrag(node, { start, move, end, armed, menu });
	pointer('pointerdown', 20, 20, { pointerType: 'touch' });
	touch('touchstart');
	vi.advanceTimersByTime(550);
	expect(menu).toHaveBeenCalledExactlyOnceWith(node);
	expect(armed.mock.calls).toEqual([[true], [false]]);
	touch('touchmove', 60);
	touch('touchend');
	expect(start).not.toHaveBeenCalled();
	expect(click().defaultPrevented).toBe(true);
	menu.mockClear();
	pointer('pointerdown', 20, 20, { pointerType: 'touch' });
	touch('touchstart');
	vi.advanceTimersByTime(300);
	touch('touchmove', 29);
	vi.advanceTimersByTime(300);
	expect(menu).not.toHaveBeenCalled();
	touch('touchend');
	expect(end).toHaveBeenCalledExactlyOnceWith(true);
	menu.mockClear();
	pointer('pointerdown', 20, 20, { pointerType: 'touch' });
	touch('touchstart');
	touch('touchmove', 20, 60);
	vi.advanceTimersByTime(600);
	expect(menu).not.toHaveBeenCalled();
	expect(send(node, 'contextmenu').defaultPrevented).toBe(true);
	expect(menu).toHaveBeenCalledExactlyOnceWith(node);
	menu.mockClear();
	send(node, 'keydown', { key: 'F10', shiftKey: true });
	expect(menu).toHaveBeenCalledExactlyOnceWith(node);
});

test('stationary hold arms without reordering or suppressing its tap', () => {
	touch('touchstart');
	vi.advanceTimersByTime(300);
	expect(armed).toHaveBeenCalledExactlyOnceWith(true);
	vi.advanceTimersByTime(3000);
	expect(start).not.toHaveBeenCalled();
	expect(touch('touchend').defaultPrevented).toBe(false);
	expect(armed.mock.calls).toEqual([[true], [false]]);
	expect(end).not.toHaveBeenCalled();
	expect(click().defaultPrevented).toBe(false);
});

test('pre-hold movement over eight pixels abandons tracking without blocking scrolling', () => {
	touch('touchstart');
	expect(touch('touchmove', 20, 28).defaultPrevented).toBe(false);
	expect(touch('touchmove', 20, 29).defaultPrevented).toBe(false);
	vi.advanceTimersByTime(400);
	expect(touch('touchmove', 20, 60).defaultPrevented).toBe(false);
	touch('touchend');
	expect(armed).not.toHaveBeenCalled();
	expect(start).not.toHaveBeenCalled();
	expect(end).not.toHaveBeenCalled();
});

test('armed touch blocks every move, starts at eight pixels and ignores touch pointers', () => {
	pointer('pointerdown', 20, 20, { pointerType: 'touch' });
	pointer('pointermove', 40);
	expect(start).not.toHaveBeenCalled();
	touch('touchstart');
	vi.advanceTimersByTime(300);
	expect(touch('touchmove').defaultPrevented).toBe(true);
	expect(touch('touchmove', 27).defaultPrevented).toBe(true);
	expect(start).not.toHaveBeenCalled();
	expect(touch('touchmove', 28).defaultPrevented).toBe(true);
	pointer('pointercancel');
	expect(end).not.toHaveBeenCalled();
	expect(touch('touchend').defaultPrevented).toBe(true);
	expect(start).toHaveBeenCalledTimes(1);
	expect(move).toHaveBeenCalledExactlyOnceWith(28, 20);
	expect(end).toHaveBeenCalledExactlyOnceWith(true);
	expect(click().defaultPrevented).toBe(true);
});

test.each(['touchcancel', 'Escape', 'blur', 'hidden', 'cleanup'])(
	'%s cancels an active touch once',
	(reason) => {
		touch('touchstart');
		vi.advanceTimersByTime(300);
		touch('touchmove', 28);
		if (reason === 'cleanup') cleanup();
		else if (reason === 'Escape')
			expect(send(host, 'keydown', { key: 'Escape' }).defaultPrevented).toBe(true);
		else if (reason === 'blur') send(host, 'blur');
		else if (reason === 'hidden') {
			document.hidden = true;
			send(document, 'visibilitychange');
		} else touch('touchcancel');
		touch('touchend');
		expect(end).toHaveBeenCalledExactlyOnceWith(false);
		expect(armed.mock.calls).toEqual([[true], [false]]);
	}
);

test.each(['pointercancel', 'lostpointercapture', 'Escape', 'blur', 'cleanup'])(
	'%s cancels an active pointer once and releases capture',
	(reason) => {
		pointer('pointerdown');
		pointer('pointermove', 26);
		if (reason === 'cleanup') cleanup();
		else if (reason === 'Escape')
			expect(send(host, 'keydown', { key: 'Escape' }).defaultPrevented).toBe(true);
		else if (reason === 'blur') send(host, 'blur');
		else if (reason === 'lostpointercapture') send(node, reason, { pointerId: 1 });
		else pointer(reason);
		pointer('pointerup');
		expect(end).toHaveBeenCalledExactlyOnceWith(false);
		expect(captures.size).toBe(0);
		expect(send(host, 'keydown', { key: 'Escape' }).defaultPrevented).toBe(false);
	}
);

test('native long-touch context menu is blocked without interrupting the hold', () => {
	touch('touchstart');
	vi.advanceTimersByTime(200);
	expect(send(node, 'contextmenu').defaultPrevented).toBe(true);
	vi.advanceTimersByTime(100);
	touch('touchmove', 28);
	touch('touchend');
	expect(end).toHaveBeenCalledExactlyOnceWith(true);
	expect(send(node, 'contextmenu').defaultPrevented).toBe(false);
});

test('additional fingers cancel a hold or drag, even outside the attached element', () => {
	for (const started of [false, true]) {
		touch('touchstart');
		if (started) {
			vi.advanceTimersByTime(300);
			touch('touchmove', 28);
		}
		send(host, 'touchstart', { touches: [{ identifier: 1 }, { identifier: 2 }] });
		vi.advanceTimersByTime(400);
		expect(touch('touchmove', 60).defaultPrevented).toBe(false);
		touch('touchend');
	}
	expect(armed.mock.calls).toEqual([[true], [false]]);
	expect(end).toHaveBeenCalledExactlyOnceWith(false);
});

test('unrelated pointers and secondary buttons cannot start or finish a drag', () => {
	pointer('pointerdown', 20, 20, { button: 2 });
	pointer('pointermove', 50);
	pointer('pointerdown', 20, 20, { isPrimary: false });
	pointer('pointermove', 50);
	expect(start).not.toHaveBeenCalled();
	pointer('pointerdown');
	pointer('pointermove', 50, 20, { pointerId: 2 });
	pointer('pointermove', 50, 20, { pointerType: 'touch' });
	expect(start).not.toHaveBeenCalled();
	pointer('pointermove', 26);
	pointer('pointerup', 26, 20, { pointerId: 2 });
	pointer('pointercancel', 26, 20, { pointerType: 'touch' });
	expect(end).not.toHaveBeenCalled();
	pointer('pointerup');
	expect(end).toHaveBeenCalledExactlyOnceWith(true);
});

test('post-drop click is suppressed before a relocated target can open its menu', () => {
	const menu = vi.fn();
	host.addEventListener('click', menu);
	touch('touchstart');
	vi.advanceTimersByTime(300);
	touch('touchmove', 28);
	touch('touchend');
	const event = new Event('click', { cancelable: true });
	Object.assign(event, { detail: 1 });
	Object.defineProperty(event, 'target', { value: new EventTarget() });
	host.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	expect(menu).not.toHaveBeenCalled();
	expect(click(0).defaultPrevented).toBe(false);
	expect(menu).toHaveBeenCalledTimes(1);
});

test.each(['pointerdown', 'touchstart'])(
	'a fresh %s elsewhere clears suppression without swallowing keyboard activation',
	(type) => {
		pointer('pointerdown');
		pointer('pointermove', 26);
		pointer('pointerup');
		expect(click(0).defaultPrevented).toBe(false);
		send(host, type, { pointerType: 'mouse', touches: [{ identifier: 2 }] });
		expect(click().defaultPrevented).toBe(false);
	}
);

test.each(['Escape', 'touchcancel', 'blur', 'hidden'])(
	'%s clears a pending hold without drag callbacks',
	(reason) => {
		touch('touchstart');
		vi.advanceTimersByTime(100);
		if (reason === 'Escape') send(host, 'keydown', { key: 'Escape' });
		else if (reason === 'touchcancel') touch('touchcancel');
		else if (reason === 'blur') send(host, 'blur');
		else {
			document.hidden = true;
			send(document, 'visibilitychange');
		}
		vi.advanceTimersByTime(400);
		expect(touch('touchmove', 50).defaultPrevented).toBe(false);
		expect(armed).not.toHaveBeenCalled();
		expect(start).not.toHaveBeenCalled();
		expect(end).not.toHaveBeenCalled();
	}
);

test('cleanup removes every listener and pending timer', () => {
	cleanup();
	const nodeAdd = vi.spyOn(node, 'addEventListener');
	const nodeRemove = vi.spyOn(node, 'removeEventListener');
	const hostAdd = vi.spyOn(host, 'addEventListener');
	const hostRemove = vi.spyOn(host, 'removeEventListener');
	const documentAdd = vi.spyOn(document, 'addEventListener');
	const documentRemove = vi.spyOn(document, 'removeEventListener');
	cleanup = slotDrag(node, { start, move, end, armed });
	expect(hostAdd).toHaveBeenCalledWith('touchmove', expect.any(Function), {
		capture: true,
		passive: false
	});
	touch('touchstart');
	cleanup();
	vi.advanceTimersByTime(500);
	expect(vi.getTimerCount()).toBe(0);
	for (const [added, removed] of [
		[nodeAdd, nodeRemove],
		[hostAdd, hostRemove],
		[documentAdd, documentRemove]
	] as const)
		for (const [type, listener] of added.mock.calls)
			expect(
				removed.mock.calls.some(
					([removedType, handler]) => removedType === type && handler === listener
				)
			).toBe(true);
	touch('touchstart');
	vi.advanceTimersByTime(500);
	expect(touch('touchmove', 50).defaultPrevented).toBe(false);
	expect(click().defaultPrevented).toBe(false);
	expect(send(node, 'contextmenu').defaultPrevented).toBe(false);
	expect(armed).not.toHaveBeenCalled();
	expect(start).not.toHaveBeenCalled();
	expect(end).not.toHaveBeenCalled();
});
