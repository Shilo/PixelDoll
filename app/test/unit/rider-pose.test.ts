import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { experience } from '../../src/studio/experience/state.svelte.ts';
import {
	activeRiderPose,
	forgetRidingPose,
	mountAtDefaults,
	resetMount,
	riderPoseOptions,
	setMountLegs,
	setRidingPose,
	setShowMount,
	syncRiderPose
} from '../../src/studio/experience/riderPose.ts';
import { readMountPreferences } from '../../src/studio/experience/mountStorage.ts';

// The experience module is a Svelte rune module; plain state is enough for this logic.
vi.hoisted(() => Object.assign(globalThis, { $state: <T>(value: T) => value }));

const manifest = {
	rig: {
		baseItem: 'base',
		directions: [{ id: 'east' }, { id: 'west', mirrorOf: 'east' }, { id: 'south' }],
		animations: [
			{ id: 'default', kind: 'state', cells: 1, loop: false, frames: [{ cell: 0, ms: 100 }] },
			{ id: 'walk', cells: 2, loop: true, frames: [] },
			{ id: 'riding', kind: 'state', cells: 1, loop: false, frames: [{ cell: 0, ms: 100 }] },
			{ id: 'half', kind: 'state', cells: 1, loop: false, frames: [{ cell: 0, ms: 100 }] }
		]
	},
	items: [
		{
			id: 'base',
			layers: [
				{
					cells: {
						default: { east: ['sha256:a'], south: ['sha256:a'] },
						riding: { east: ['sha256:b'], south: ['sha256:c'] },
						half: { east: ['sha256:d'] }
					}
				}
			]
		}
	]
} as unknown as Manifest;

describe('rider pose', () => {
	beforeEach(() => {
		experience.testMount = false;
		experience.ridingPoses = {};
		experience.riderPoseReplaced = null;
	});

	test('offers saved States except Standing, with the facings each cannot show', () => {
		expect(riderPoseOptions(manifest)).toEqual([
			{ id: 'riding', missing: [] },
			{ id: 'half', missing: ['south'] }
		]);
	});

	test('belongs to the character it was chosen on and to a State it still has', () => {
		experience.ridingPoses = { a: 'riding' };
		expect(activeRiderPose('a', manifest)).toBe('riding');
		expect(activeRiderPose('b', manifest)).toBeUndefined();
		// An incomplete State stays chosen so its missing facings are named on stage, not hidden.
		experience.ridingPoses = { a: 'half' };
		expect(activeRiderPose('a', manifest)).toBe('half');
		experience.ridingPoses = { a: 'gone' };
		expect(activeRiderPose('a', manifest)).toBeUndefined();
	});

	test('mounting selects the pose in Preview and dismounting restores the earlier selection', () => {
		experience.ridingPoses = { a: 'riding' };
		expect(syncRiderPose('a', manifest, 'walk')).toBe('walk');
		experience.testMount = true;
		expect(syncRiderPose('a', manifest, 'walk')).toBe('riding');
		experience.testMount = false;
		expect(syncRiderPose('a', manifest, 'riding')).toBe('walk');
		expect(experience.riderPoseReplaced).toBeNull();
	});

	test('a selection changed while mounted stays after dismounting', () => {
		experience.ridingPoses = { a: 'riding' };
		experience.testMount = true;
		syncRiderPose('a', manifest, 'walk');
		experience.testMount = false;
		expect(syncRiderPose('a', manifest, 'default')).toBe('default');
		expect(experience.riderPoseReplaced).toBeNull();
	});

	test('settings persist per browser, the Riding pose per character, and Reset clears them', () => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value)
		});
		expect(setShowMount(true)).toBe(true);
		setMountLegs('both');
		setRidingPose('a', 'riding');
		setRidingPose('b', 'half');
		setRidingPose('b', '');
		expect(readMountPreferences()).toEqual({ show: true, legs: 'both', poses: { a: 'riding' } });
		expect(mountAtDefaults('a')).toBe(false);
		resetMount(null);
		expect(mountAtDefaults('a')).toBe(true);
		expect(readMountPreferences()).toEqual({ show: false, legs: 'far', poses: {} });
		// Unreadable or tampered data falls back to the defaults field by field.
		store.set('pixeldoll.mount', '{"show":"yes","legs":"left","poses":{"a":7,"c":"riding"}}');
		expect(readMountPreferences()).toEqual({ show: false, legs: 'far', poses: { c: 'riding' } });
		store.set('pixeldoll.mount', 'not json');
		expect(readMountPreferences()).toEqual({ show: false, legs: 'far', poses: {} });
		// Another tab's pose survives this tab's change, and removing a State forgets only its own pose.
		setRidingPose('a', 'riding');
		store.set(
			'pixeldoll.mount',
			JSON.stringify({ ...readMountPreferences(), poses: { a: 'riding', b: 'half' } })
		);
		setShowMount(true);
		expect(readMountPreferences().poses).toEqual({ a: 'riding', b: 'half' });
		forgetRidingPose('a', 'other');
		forgetRidingPose('b', 'half');
		expect(readMountPreferences().poses).toEqual({ a: 'riding' });
		forgetRidingPose('a');
		expect(experience.ridingPoses).toEqual({});
		// Another tab's newer pose survives removing the older State it replaced.
		setRidingPose('b', 'old');
		store.set(
			'pixeldoll.mount',
			JSON.stringify({ ...readMountPreferences(), poses: { b: 'new' } })
		);
		forgetRidingPose('b', 'old');
		expect(readMountPreferences().poses).toEqual({ b: 'new' });
		resetMount(null);
		// Reset this page clears the open character's pose only; Reset all clears every character's.
		setRidingPose('a', 'riding');
		setRidingPose('b', 'half');
		resetMount('a');
		expect(readMountPreferences().poses).toEqual({ b: 'half' });
		expect(mountAtDefaults('a')).toBe(true);
		resetMount(null);
		expect(readMountPreferences().poses).toEqual({});
		// A refused save still applies, and the next change builds on it rather than on older storage.
		const setItem = (key: string, value: string) => void store.set(key, value);
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: () => {
				throw new Error('blocked');
			}
		});
		expect(setShowMount(true)).toBe(false);
		// A pose chosen while saving fails is still forgotten when its State is removed.
		setRidingPose('c', 'gone');
		forgetRidingPose('c', 'gone');
		expect(experience.ridingPoses.c).toBeUndefined();
		vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem });
		expect(setMountLegs('none')).toBe(true);
		expect(readMountPreferences()).toMatchObject({ show: true, legs: 'none' });
		vi.unstubAllGlobals();
	});
});
