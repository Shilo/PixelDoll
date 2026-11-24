import { describe, expect, it } from 'vitest';
import {
	characterDraftWithDefaults,
	creationDefaults,
	creationSettingsKey,
	readCreationSettings,
	resolveMoveFramePreference,
	resolveStateModelPreference,
	saveCreationSettings
} from '../../src/studio/creationSettings.ts';
import { isNudeBase, presetOf, styleOf } from '../../src/studio/characterConfig.ts';

function memoryStorage() {
	const entries = new Map<string, string>();
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => entries.set(key, value),
		removeItem: (key: string) => entries.delete(key)
	};
}

describe('creation preferences', () => {
	it('seeds the character draft without changing request identity for baseline V3', () => {
		const values = creationDefaults.characters;
		const baseline = characterDraftWithDefaults(values);
		expect(styleOf(baseline)).toEqual({});
		expect(baseline).toMatchObject({ body: 64, bodyPreset: 64, frame: 80, auto: true });
		const customized = characterDraftWithDefaults({
			...values,
			body: 68,
			frame: 112,
			directions: 'side',
			model: 'pro',
			clothing: 'none'
		});
		expect(customized).toMatchObject({
			body: 68,
			bodyPreset: null,
			frame: 112,
			auto: false,
			view: 'side',
			model: 'pro'
		});
		expect(presetOf(customized)).toBe('side');
		expect(isNudeBase(customized)).toBe(true);
	});

	it('uses automatic frames when a saved count exceeds the actual canvas limit', () => {
		expect(resolveMoveFramePreference('v3', 16, 64)).toBe(16);
		expect(resolveMoveFramePreference('v3', 16, 256)).toBeUndefined();
		expect(resolveMoveFramePreference('skeleton-v3', 3, 256)).toBe(3);
		expect(resolveMoveFramePreference('skeleton-v3', 'auto', 256)).toBeUndefined();
	});

	it('falls back from Pixen only when the source is known and Pro supports it', () => {
		const source = (size: number) => ({
			cellSize: { width: size, height: size },
			facingIds: ['south'] as const
		});
		expect(resolveStateModelPreference('pixen', source(256))).toBe('pixen');
		expect(resolveStateModelPreference('pixen', source(288))).toBe('pro');
		expect(resolveStateModelPreference('pixen', source(600))).toBe('pixen');
		expect(resolveStateModelPreference('pro-flash', source(288))).toBe('pro-flash');
	});

	it('starts with the app defaults and keeps saved sections independent', () => {
		const storage = memoryStorage();
		expect(readCreationSettings(storage, 'characters')).toEqual({
			values: creationDefaults.characters,
			valid: true
		});
		expect(saveCreationSettings(storage, 'characters', { clothing: 'none' })).toBe(true);
		expect(saveCreationSettings(storage, 'characters', { model: 'pro' })).toBe(true);
		expect(saveCreationSettings(storage, 'moves', { frames: 12 })).toBe(true);
		expect(saveCreationSettings(storage, 'states', { model: 'pixen' })).toBe(true);
		expect(saveCreationSettings(storage, 'items', { method: 'anchor' })).toBe(true);
		expect(readCreationSettings(storage, 'characters').values).toMatchObject({
			clothing: 'none',
			model: 'pro'
		});
		storage.removeItem(creationSettingsKey('characters'));
		expect(readCreationSettings(storage, 'characters').values).toEqual(creationDefaults.characters);
		expect(readCreationSettings(storage, 'moves').values.frames).toBe(12);
		expect(readCreationSettings(storage, 'states').values.model).toBe('pixen');
		expect(readCreationSettings(storage, 'items').values.method).toBe('anchor');
	});

	it('rejects incompatible values without replacing the saved preferences', () => {
		const storage = memoryStorage();
		expect(saveCreationSettings(storage, 'characters', { body: 192 })).toBe(true);
		expect(saveCreationSettings(storage, 'characters', { model: 'pro' })).toBe(false);
		expect(saveCreationSettings(storage, 'characters', { frame: 64 })).toBe(false);
		expect(readCreationSettings(storage, 'characters').values).toMatchObject({
			body: 192,
			model: 'v3',
			frame: 'auto'
		});
		expect(saveCreationSettings(storage, 'moves', { model: 'pixminimax', frames: 20 })).toBe(true);
		expect(saveCreationSettings(storage, 'moves', { model: 'v3' })).toBe(false);
		expect(readCreationSettings(storage, 'moves').values).toEqual({
			model: 'pixminimax',
			frames: 20,
			itemDrawing: 'skeleton'
		});
	});

	it('fills a choice added after the record was saved and still rejects a wrong value', () => {
		const storage = memoryStorage();
		const key = creationSettingsKey('moves');
		storage.setItem(key, '{"model":"pixminimax","frames":20}');
		expect(readCreationSettings(storage, 'moves')).toEqual({
			values: { model: 'pixminimax', frames: 20, itemDrawing: 'skeleton' },
			valid: true
		});
		expect(saveCreationSettings(storage, 'moves', { itemDrawing: 'anchor' })).toBe(true);
		expect(JSON.parse(storage.getItem(key)!)).toEqual({
			model: 'pixminimax',
			frames: 20,
			itemDrawing: 'anchor'
		});
		for (const raw of [
			'{"model":"pixminimax","frames":20,"itemDrawing":"grid"}',
			'["skeleton-v3"]',
			'null'
		]) {
			storage.setItem(key, raw);
			expect(readCreationSettings(storage, 'moves')).toEqual({
				values: creationDefaults.moves,
				valid: false
			});
			expect(saveCreationSettings(storage, 'moves', { itemDrawing: 'anchor' })).toBe(false);
			expect(storage.getItem(key)).toBe(raw);
		}
	});

	it.each(['not JSON', '{"model":"unknown"}', '{"model":"pro","extra":true}'])(
		'flags unreadable settings without silently replacing them: %s',
		(raw) => {
			const storage = memoryStorage();
			const key = creationSettingsKey('states');
			storage.setItem(key, raw);
			expect(readCreationSettings(storage, 'states')).toEqual({
				values: creationDefaults.states,
				valid: false
			});
			expect(saveCreationSettings(storage, 'states', { model: 'pixen' })).toBe(false);
			expect(storage.getItem(key)).toBe(raw);
		}
	);
});
