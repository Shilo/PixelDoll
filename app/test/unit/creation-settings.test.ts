import { describe, expect, it } from 'vitest';
import {
	creationDefaults,
	creationSettingsKey,
	readCreationSettings,
	saveCreationSettings
} from '../../src/studio/creationSettings.ts';

function memoryStorage() {
	const entries = new Map<string, string>();
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => entries.set(key, value),
		removeItem: (key: string) => entries.delete(key)
	};
}

describe('creation preferences', () => {
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
			frames: 20
		});
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
