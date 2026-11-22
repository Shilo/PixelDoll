import { expect, test } from 'vitest';
import { SLOTS } from '../../src/lib/items/slots.ts';
import { profileOf } from '../../src/studio/slots.ts';
import { promptSuggestionDefaults } from '../../src/studio/promptSuggestionDefaults.ts';
import {
	addSuggestion,
	deleteSuggestion,
	editSuggestion,
	effectiveSuggestions,
	parseSuggestionStorage,
	saveSuggestionList,
	type PromptSuggestion
} from '../../src/studio/promptSuggestions.ts';

const defaults = [
	{ id: 'alpha', title: 'Erste', prompt: 'First prompt', action: 'walk' },
	{ id: 'beta', title: 'Zweite', prompt: 'Second prompt' },
	{ id: 'gamma', title: 'Dritte', prompt: 'Third prompt' }
] satisfies PromptSuggestion[];

test('every item profile has defaults, and custom slots share their profile catalog', () => {
	for (const { profile } of SLOTS) {
		if (profile && profile !== 'body')
			expect(promptSuggestionDefaults[`item.${profile}`].length).toBeGreaterThan(0);
	}
	const head = SLOTS.find(({ id }) => id === 'head')!;
	const profile = profileOf({ slots: [{ ...head, id: 'helmets' }] }, 'helmets');
	expect(profile).toBe('head');
	expect(promptSuggestionDefaults['item.head'][0]).toEqual({
		id: 'head.knightHelmet',
		titleKey: 'studioSlots.ideas.head.1',
		prompt: 'iron knight helmet'
	});
});

test('built-in edits store only trimmed non-default fields and preserve the action', () => {
	const titled = editSuggestion({}, defaults, 'alpha', 'title', '  studioSlots.labels.head  ');
	const edited = editSuggestion(titled, defaults, 'alpha', 'prompt', '  Swing both arms.  ');
	expect(saveSuggestionList({}, 'move', edited)).toEqual({
		move: { edits: { alpha: { title: 'studioSlots.labels.head', prompt: 'Swing both arms.' } } }
	});
	expect(effectiveSuggestions(defaults, edited)[0]).toEqual({
		id: 'alpha',
		title: 'studioSlots.labels.head',
		prompt: 'Swing both arms.',
		action: 'walk'
	});
	const localized = editSuggestion(edited, defaults, 'alpha', 'title', ' Erste ');
	expect(localized.edits).toEqual({ alpha: { prompt: 'Swing both arms.' } });
	const blank = editSuggestion(localized, defaults, 'alpha', 'prompt', '  ');
	expect(saveSuggestionList({}, 'move', blank)).toEqual({});
	expect(editSuggestion({}, defaults, 'alpha', 'prompt', ' First prompt ').edits).toEqual({});
});

test('adds need a prompt and fall back to prompt words; deleting alone does not set order', () => {
	const added = { id: 'u_added', title: '  ', prompt: '  A tiny paper boat flies.  ' };
	expect(addSuggestion({}, { ...added, prompt: ' ' })).toEqual({});
	const list = deleteSuggestion(addSuggestion({}, added), defaults, 'beta');
	expect(saveSuggestionList({}, 'move', list)).toEqual({
		move: {
			added: [{ id: 'u_added', title: '', prompt: 'A tiny paper boat flies.' }],
			removed: ['beta']
		}
	});
	expect(effectiveSuggestions(defaults, list).at(-1)).toEqual({
		id: 'u_added',
		title: 'A tiny paper boat',
		prompt: 'A tiny paper boat flies.'
	});
	expect(editSuggestion(list, defaults, added.id, 'prompt', '')).toBe(list);
	expect(saveSuggestionList({}, 'move', deleteSuggestion(list, defaults, added.id))).toEqual({
		move: { removed: ['beta'] }
	});
});

test('new defaults follow their default predecessor and missing defaults leave dormant edits', () => {
	const list = {
		order: ['gamma', 'u_sorted', 'alpha', 'removed'],
		edits: { removed: { title: 'Dormant title' } },
		added: [
			{ id: 'u_sorted', title: 'Sorted', prompt: 'Sorted prompt' },
			{ id: 'u_new', title: 'Added', prompt: 'Added prompt' }
		]
	};
	expect(effectiveSuggestions(defaults, list).map(({ id }) => id)).toEqual([
		'gamma',
		'u_sorted',
		'alpha',
		'beta',
		'u_new'
	]);
	expect(saveSuggestionList({}, 'move', list).move?.edits).toEqual(list.edits);
});

test('corrupt storage is distinguishable from empty storage', () => {
	expect(parseSuggestionStorage(null)).toEqual({});
	expect(parseSuggestionStorage('{broken')).toBeNull();
	expect(parseSuggestionStorage('[]')).toBeNull();
	expect(parseSuggestionStorage('{"move":{"order":"invalid"}}')).toBeNull();
	expect(parseSuggestionStorage('{"move":{"removed":["walk"]}}')).toEqual({
		move: { removed: ['walk'] }
	});
});

test('blank stored fields still show the defaults', () => {
	const list = parseSuggestionStorage(
		JSON.stringify({ move: { edits: { alpha: { title: '', prompt: '  ' } } } })
	)!.move;
	expect(effectiveSuggestions(defaults, list)[0]).toEqual(defaults[0]);
});
