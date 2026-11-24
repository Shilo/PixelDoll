import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { RigAnimation } from '../../src/lib/store/manifest.ts';
import { automaticClip, liveClips } from '../../src/studio/experience/liveRoles.ts';
import { livePreferences, parseLivePreferences } from '../../src/studio/experience/liveSettings.ts';
import {
	chooseLiveRole,
	forgetLiveChoices,
	liveViewsAtDefaults,
	resetLiveViews
} from '../../src/studio/experience/liveViews.ts';
import { experience } from '../../src/studio/experience/state.svelte.ts';

// The experience module is a Svelte rune module; plain state is enough for this logic.
vi.hoisted(() => Object.assign(globalThis, { $state: <T>(value: T) => value }));

const clip = (id: string, kind?: 'state'): RigAnimation =>
	({ id, kind, cells: 1, loop: !kind, frames: [{ cell: 0, ms: 100 }] }) as RigAnimation;

describe('Live views roles', () => {
	test('Automatic prefers the exact ID, then the first Move whose ID names the role', () => {
		const animations = [
			clip('default', 'state'),
			clip('jump-pose', 'state'),
			clip('walk-cycle'),
			clip('cross-punch'),
			clip('sword-slash'),
			clip('big-leap')
		];
		// Idle and Walk keep their exact IDs, as before Live views settings.
		expect(automaticClip(animations, 'walk')).toBeUndefined();
		expect(automaticClip([...animations, clip('walk')], 'walk')).toBe('walk');
		expect(automaticClip(animations, 'attack')).toBe('cross-punch');
		// A State never stands in for an action, and whole words only.
		expect(automaticClip(animations, 'jump')).toBe('big-leap');
		expect(automaticClip([...animations, clip('attack')], 'attack')).toBe('attack');
		expect(automaticClip([clip('rune-blast'), clip('hopscotch')], 'jump')).toBeUndefined();
		expect(automaticClip([clip('attack', 'state')], 'attack')).toBe('attack');
		expect(automaticClip(animations, 'attackUp')).toBeUndefined();
	});

	test('chains fall back Walk to Idle to Standing, and Attack up and down to Attack', () => {
		const animations = [clip('default', 'state'), clip('idle'), clip('punch'), clip('uppercut')];
		expect(liveClips(animations)).toEqual({
			idle: ['idle', 'default'],
			walk: ['walk', 'idle', 'default'],
			attack: ['punch'],
			jump: [],
			attackUp: ['punch'],
			attackDown: ['punch']
		});
		const chosen = liveClips(animations, { idle: 'default', walk: 'idle', attackUp: 'uppercut' });
		expect(chosen.idle).toEqual(['default']);
		expect(chosen.walk).toEqual(['idle', 'default']);
		expect(chosen.attackUp).toEqual(['uppercut', 'punch']);
		// A trashed or deleted clip plays Automatic until it exists again.
		expect(liveClips(animations, { attack: 'gone' }).attack).toEqual(['punch']);
	});
});

describe('Live views settings', () => {
	const store = new Map<string, string>();
	beforeEach(() => {
		store.clear();
		experience.liveRoles = {};
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value)
		});
	});

	test('choices persist per character, Automatic removes one, and Reset clears the page or all', () => {
		expect(chooseLiveRole('a', 'attack', 'punch')).toBe(true);
		chooseLiveRole('a', 'jump', 'hop');
		chooseLiveRole('b', 'idle', 'rest');
		chooseLiveRole('a', 'jump', '');
		expect(livePreferences.read()).toEqual({
			roles: { a: { attack: 'punch' }, b: { idle: 'rest' } }
		});
		expect(experience.liveRoles).toEqual(livePreferences.read().roles);
		expect(liveViewsAtDefaults('a')).toBe(false);
		resetLiveViews('a');
		expect(liveViewsAtDefaults('a')).toBe(true);
		expect(livePreferences.read().roles).toEqual({ b: { idle: 'rest' } });
		resetLiveViews(null);
		expect(livePreferences.read().roles).toEqual({});
	});

	test('a permanently deleted clip or character forgets only its own choices, keeping other tabs’ saves', () => {
		chooseLiveRole('a', 'attack', 'punch');
		// Another tab saves a choice this tab has not seen yet.
		store.set(
			'pixeldoll.liveViews',
			JSON.stringify({
				roles: { a: { attack: 'punch', jump: 'punch', idle: 'rest' }, b: { walk: 'x' } }
			})
		);
		forgetLiveChoices('a', 'punch');
		expect(livePreferences.read().roles).toEqual({ a: { idle: 'rest' }, b: { walk: 'x' } });
		forgetLiveChoices('b');
		expect(livePreferences.read().roles).toEqual({ a: { idle: 'rest' } });
	});

	test('a refused save still applies here and later changes build on it', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota');
			}
		});
		expect(chooseLiveRole('a', 'attack', 'punch')).toBe(false);
		expect(chooseLiveRole('a', 'jump', 'hop')).toBe(false);
		expect(experience.liveRoles).toEqual({ a: { attack: 'punch', jump: 'hop' } });
	});

	test('tampered data keeps every valid character and role', () => {
		expect(
			parseLivePreferences(
				JSON.stringify({
					roles: { a: { attack: 'punch', fly: 'x', jump: 3, idle: '' }, b: 'walk', c: [] }
				})
			)
		).toEqual({ roles: { a: { attack: 'punch' } } });
		expect(parseLivePreferences('not json')).toEqual({ roles: {} });
	});
});

describe('preference store', () => {
	test('follows other tabs only for its own key or a cleared store', () => {
		let listener: ((event: StorageEvent) => void) | undefined;
		const storage = { getItem: () => null, setItem: () => {} };
		vi.stubGlobal('localStorage', storage);
		vi.stubGlobal('addEventListener', (_: string, fn: typeof listener) => (listener = fn));
		vi.stubGlobal('removeEventListener', () => (listener = undefined));
		const changed = vi.fn();
		const stop = livePreferences.watch(changed);
		const event = (key: string | null, storageArea: unknown = storage) =>
			listener!({ key, storageArea } as unknown as StorageEvent);
		event('pixeldoll.mount');
		event('pixeldoll.liveViews', {});
		expect(changed).not.toHaveBeenCalled();
		event('pixeldoll.liveViews');
		event(null);
		expect(changed).toHaveBeenCalledTimes(2);
		stop();
		expect(listener).toBeUndefined();
		vi.unstubAllGlobals();
	});
});
