import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import {
	actionPrompt,
	loopedText,
	moveFormIssue,
	moveFormMotion,
	moveFormStop,
	moveRequestSpec,
	newMoveActions,
	planMoveForm,
	redrawDirections,
	sameMoveDirections,
	type MoveFormChoices
} from '../../src/studio/moveForm.ts';
import { moveTemplatePrompt } from '../../src/studio/moveAnimationOptions.ts';
import type { LocalizedError } from '../../src/lib/message.ts';

// The demo: south, east, north drawn, west mirrors east; saved moves walk (8 frames) and cross-punch.
const demo = async (): Promise<Manifest> =>
	JSON.parse(
		await readFile(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8')
	);
const choices = (over: Partial<MoveFormChoices> = {}): MoveFormChoices => ({
	action: '',
	text: '',
	replaceSelected: false,
	templatePicked: false,
	preferredModel: 'skeleton-v3',
	dirs: [],
	references: {},
	...over
});
const context = (manifest: Manifest, over = {}) => ({
	manifest,
	pending: [] as string[],
	reviews: {},
	...over
});
const issueOf = (manifest: Manifest, c: MoveFormChoices, over = {}) => {
	const form = planMoveForm(c, context(manifest));
	return moveFormIssue(form, moveFormMotion(form, 'standalone'), {
		manifest,
		record: null,
		replaceSelected: c.replaceSelected,
		templatePicked: c.templatePicked,
		reviews: {},
		regenerating: false,
		offered: newMoveActions(manifest),
		retryChanged: () => false,
		name: (id) => id,
		...over
	});
};

test('a new move offers only template actions the character lacks', async () => {
	const actions = newMoveActions(await demo());
	expect(actions).not.toContain('walk');
	expect(actions).toContain('slash');
	expect(actions).toContain('idle');
});

test('a picked template is a new move in every drawn direction, priced with the preferred model', async () => {
	const m = await demo();
	const form = planMoveForm(
		choices({ action: 'slash', text: moveTemplatePrompt('slash'), templatePicked: true }),
		context(m, { characterId: 'pl-1' })
	);
	expect(form).toMatchObject({
		id: 'slash',
		replacing: false,
		describing: false,
		model: 'skeleton-v3',
		targetDirs: ['south', 'east', 'north'],
		keptFrames: undefined
	});
	// An authored action is drawn from its own pose table, never the managed skeleton.
	expect(form.managedId).toBeUndefined();
	const spec = moveRequestSpec(form, moveFormMotion(form, 'standalone'), {
		seed: 7,
		acceptedWarnings: []
	});
	expect(spec).toMatchObject({
		id: 'slash',
		action: 'slash',
		items: [],
		reviewBeforePublish: true,
		poseStyle: 'visible-side-v1',
		seed: 7,
		approvedDirs: ['south', 'east', 'north']
	});
	expect(spec).not.toHaveProperty('dirs');
	expect(spec).not.toHaveProperty('acceptedWarnings');
});

test('a described move is named from its first words or gets the first free move-N', async () => {
	const m = await demo();
	const described = planMoveForm(
		choices({ text: 'Spin attack, twirling twice' }),
		context(m, { characterId: 'pl-1' })
	);
	expect(described).toMatchObject({ id: 'spin-attack', describing: true });
	// A described skeleton move draws its motion on the character's PixelLab skeleton.
	expect(described.managedId).toBe('pl-1');
	expect(moveFormMotion(described, 'managed').action).toBeUndefined();
	const unnamed = planMoveForm(
		choices({ text: '回転する' }),
		context(m, { pending: ['move-1'], reviews: { 'move-2': {} } })
	);
	expect(unnamed.id).toBe('move-3');
});

test('a chosen frame count applies only when the model supports it', async () => {
	const m = await demo();
	const pick = (model: 'pixminimax' | 'v3', frames: number) =>
		planMoveForm(choices({ text: 'wave hello', model, frames }), context(m));
	expect(pick('pixminimax', 12).animation.frameCount).toBe(12);
	expect(pick('pixminimax', 10).animation).not.toHaveProperty('frameCount');
	expect(pick('pixminimax', 10).frameCounts).not.toContain(10);
});

test('a partial redraw keeps the saved frame count and picks a model that can', async () => {
	const m = await demo();
	const form = planMoveForm(
		choices({
			action: 'walk',
			text: actionPrompt(m, 'walk', true).prompt,
			replaceSelected: true,
			templatePicked: true,
			dirs: ['east']
		}),
		context(m)
	);
	expect(form).toMatchObject({ replacing: true, targetDirs: ['east'], keptFrames: 8 });
	expect(form.frameCounts).toContain(8);
	expect(form.animation.frameCount).toBe(8);
	const spec = moveRequestSpec(form, moveFormMotion(form, 'standalone'), {
		seed: 1,
		acceptedWarnings: ['frame-room-move']
	});
	expect(spec).toMatchObject({
		replace: true,
		dirs: ['east'],
		acceptedWarnings: ['frame-room-move']
	});
	expect(spec).not.toHaveProperty('approvedDirs');
});

test('a described move may not reuse a saved move name', async () => {
	const m = await demo();
	const issue = issueOf(m, choices({ text: 'Cross punch, faster' }));
	expect((issue as LocalizedError).translation.key).toBe('moveSheet.duplicateOption');
	expect(issueOf(m, choices({ text: 'wave hello' }))).toBe('');
});

test('a move waiting for review or already queued stops the form', async () => {
	const m = await demo();
	const c = choices({ action: 'slash', text: moveTemplatePrompt('slash'), templatePicked: true });
	const ready = issueOf(m, c, { reviews: { slash: {} } });
	expect((ready as LocalizedError).translation.key).toBe('moveSheet.checkpoint.ready');
	const form = planMoveForm(c, context(m));
	const queued = moveFormStop(form, '', ['slash'], (id) => id);
	expect((queued as LocalizedError).translation.key).toBe('moveSheet.alreadyQueued');
	expect(moveFormStop(form, '', [], (id) => id)).toBe('');
	const empty = planMoveForm(choices(), context(m));
	expect((moveFormStop(empty, '', [], (id) => id) as LocalizedError).translation.key).toBe(
		'create.errors.describeMove'
	);
});

test('a redraw starts on the views that failed checks, else all', () => {
	const all = ['south', 'east', 'north'] as const;
	expect(redrawDirections({ clips: { 'walk/east': { fails: [1] } } }, all, 'walk')).toEqual([
		'east'
	]);
	expect(redrawDirections(undefined, all, 'walk')).toEqual([...all]);
});

test('template text follows a Loop change but typed text stays', () => {
	expect(loopedText(moveTemplatePrompt('walk', true), 'walk', true, false)).toBe(
		moveTemplatePrompt('walk', false)
	);
	expect(loopedText('limping walk', 'walk', true, false)).toBe('limping walk');
});

test('a template customized in Settings gains and loses the looping wording too', () => {
	const tail = moveTemplatePrompt('walk', true).slice(moveTemplatePrompt('walk', false).length);
	const custom = `heavy armored walk${tail}`;
	expect(loopedText(custom, 'walk', true, false, custom)).toBe('heavy armored walk');
	expect(loopedText('heavy armored walk', 'walk', false, true, custom)).toBe(custom);
	// Customized without the wording, it gains it when the move loops.
	expect(loopedText('stomp', 'walk', true, false, 'stomp')).toBe('stomp');
	expect(loopedText('stomp', 'walk', false, true, 'stomp')).toBe(`stomp${tail}`);
	// Typed text and templates whose wording does not follow Loop stay as they are.
	expect(loopedText('limping walk', 'walk', true, false, custom)).toBe('limping walk');
	expect(loopedText('big slash', 'slash', false, true, 'big slash')).toBe('big slash');
});

test('a pending Loop confirmation survives replanning with unchanged directions', async () => {
	const m = await demo();
	const form = choices({ text: 'Wave', model: 'v3' });
	const before = planMoveForm(form, context(m)).targetDirs;
	const after = planMoveForm(form, context(m, { pending: ['slash'] })).targetDirs;
	expect(after).not.toBe(before);
	expect(sameMoveDirections(before, after)).toBe(true);
	expect(sameMoveDirections(before, after.slice(1))).toBe(false);
	expect(sameMoveDirections(before, [...after].reverse())).toBe(false);
});
