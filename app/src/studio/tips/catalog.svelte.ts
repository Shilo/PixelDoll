/** Every tip, in priority order: what it points at and when it shows or is done. Conditions only read app state and the
 *  page; nothing here changes the app, and the app never calls in. See docs/design/onboarding.md. */
import type { WhisperKey } from 'svelte-whisper';
import { app } from '../../lib/app.svelte.ts';
import { DEMO, creates, doc, store, ui } from '../state.svelte.ts';
import { experience } from '../experience/state.svelte.ts';
import { missingMoves } from '../model.ts';
import { tips, type TipId } from './tips.svelte.ts';
import { fullyVisible } from './visibility.ts';

export type Side = 'bottom' | 'top' | 'left' | 'right';

export interface TipSpec {
	id: TipId;
	title: WhisperKey;
	/** The body, which may depend on the control found (Export in the bar or in More options). */
	body: (anchor: HTMLElement) => WhisperKey;
	/** The control to point at, or null while there is none. The host also requires it to be whole on screen. */
	anchor: () => HTMLElement | null;
	/** The preferred side; with no room the tip flips to the opposite side, then across. Default: below. */
	placement?: Side;
	/** Sides to try, in order, when the preferred one has no room (instead of opposite, then across). */
	fallbacks?: Side[];
	/** The control fades in only on hover (a row's ⋮): the tip may point at it anyway and keeps it shown meanwhile. */
	reveal?: boolean;
	/** At most one such tip per arrival on a screen and tab: after one, the next waits for the person to come back. */
	onePerVisit?: boolean;
	/** The app context the tip belongs to. */
	when: () => boolean;
	/** Tips that must be done first. */
	after?: TipId[];
	/** App state meaning the suggested action happened: the tip is done the moment this turns true, shown or not. */
	doneWhen?: () => boolean;
	/** Controls whose use (press, typing, paste) means the suggested action happened. */
	doneOn?: string;
}

/** What the host tracks about this visit, for conditions that depend on how the person got here. */
export const visit = $state({
	/** Counts arrivals on Characters (startup included), so a tip can wait for the next one. */
	charactersEntry: 0,
	/** The Characters arrival during which the Customize tip was done this visit; unset when it was done earlier. */
	customizeDoneEntry: null as number | null,
	/** The outfit worn when this Customize visit began (or tips were asked for again), keyed by when it was taken. */
	outfit: { key: '', value: '' }
});

const own = () => store.projects.filter((p) => !p.demo && !p.dev);
const creating = () =>
	creates.some(
		(run) => !run.projectId && !store.projects.some((project) => project.id === run.spec.projectId)
	);
/** Only the bundled demo is saved and nothing is being created: someone new, or anyone who asked for tips again. */
const greeting = () =>
	(store.projects.some((p) => p.demo) && !own().length && !creating()) || tips.requested;
const ownOpen = () => !!doc.id && store.projects.some((p) => p.id === doc.id && !p.demo);
/** Customize in Preview: live views are a game with their own controls. Zoom does not matter, since tips point at
 *  controls, which zoom never moves, and a zoom level is kept after zooming back to the fit. */
const calm = () => experience.screen === 'studio' && experience.mode === 'preview';

export const outfitNow = () =>
	JSON.stringify(
		Object.entries(doc.items)
			.filter(([, id]) => id)
			.sort()
	);
export const outfitKey = () =>
	experience.screen === 'studio' && !doc.loading && store.project?.manifest
		? `${doc.id}|${visit.charactersEntry}|${tips.request}`
		: '';

/** The clearest thing to try on: an item not worn yet (one with frames for the move on screen first), else a worn one,
 *  which can come off, else an Empty tile. */
let readyCache: { manifest: unknown; move: string; ids: Set<string> } | null = null;
/** Items with frames for the move on screen, worked out once per character and move rather than on every look. */
function readyItems(m: NonNullable<NonNullable<typeof store.project>['manifest']>) {
	if (readyCache?.manifest !== m || readyCache.move !== ui.anim)
		readyCache = {
			manifest: m,
			move: ui.anim,
			ids: new Set(
				m.items.filter((it) => !missingMoves(m, it).includes(ui.anim)).map((it) => it.id)
			)
		};
	return readyCache.ids;
}
function gearAnchor() {
	const panel = document.getElementById('customization-panel');
	const m = store.project?.manifest;
	if (!panel || !m) return null;
	const ready = readyItems(m);
	const items = [...panel.querySelectorAll<HTMLElement>('[data-tile]')].filter(
		// Only tiles a press puts on or takes off: not drafts, and not ones that open a choice menu first.
		(tile) =>
			!tile.dataset.tile!.startsWith('gen:') &&
			!tile.hasAttribute('aria-haspopup') &&
			fullyVisible(tile)
	);
	const worn = (tile: HTMLElement) => tile.getAttribute('aria-pressed') === 'true';
	const isReady = (tile: HTMLElement) => ready.has(tile.dataset.tile!);
	return (
		items.find((tile) => !worn(tile) && isReady(tile)) ??
		items.find((tile) => !worn(tile)) ??
		items.find(isReady) ??
		items[0] ??
		null
	);
}
/** Export in the top bar, or More options once the bar has moved Export into it. */
function exportAnchor() {
	const header = document.querySelector('.experience-header');
	const button = header?.querySelector<HTMLElement>('.header-export');
	return button?.checkVisibility()
		? button
		: (header?.querySelector<HTMLElement>('[popovertarget="experience-options"]') ?? null);
}
/** The first whole control matching a selector. */
const first = (selector: string) =>
	[...document.querySelectorAll<HTMLElement>(selector)].find((el) => fullyVisible(el)) ?? null;

export const catalog: TipSpec[] = [
	{
		id: 'customize',
		title: 'tips.customizeTitle',
		body: () => 'tips.customizeBody',
		anchor: () => document.querySelector('.customize-action'),
		when: () =>
			experience.screen === 'characters' &&
			doc.id === DEMO &&
			!!store.project?.manifest &&
			greeting(),
		doneWhen: () => experience.screen === 'studio'
	},
	{
		id: 'new-character',
		title: 'tips.newCharacterTitle',
		body: () => 'tips.newCharacterBody',
		anchor: () => document.querySelector('.selection-create'),
		// The other path from Characters, on a later arrival there, never in the same breath as the Customize tip.
		when: () =>
			experience.screen === 'characters' &&
			!own().length &&
			!creating() &&
			greeting() &&
			visit.charactersEntry !== visit.customizeDoneEntry,
		after: ['customize'],
		doneWhen: () => own().length > 0,
		doneOn: '.selection-create, .new-character-row'
	},
	{
		id: 'pixellab',
		title: 'tips.pixellabTitle',
		body: () => 'tips.pixellabBody',
		// The sign-up button of Connect's first-open guide; on later opens (the guide shows once), its key link.
		anchor: () =>
			document.querySelector<HTMLElement>('dialog[open] .trial-guide > a') ??
			document.querySelector<HTMLElement>('dialog[open] form a.btn[href$="/account"]'),
		placement: 'top',
		// Beside the button before below it, so the key field it leads to stays clear (a phone held sideways).
		fallbacks: ['left', 'right', 'bottom'],
		// Only while Connect asks for a key (not while replacing a working one).
		when: () => !app.key || app.keyRejected,
		// Connected: a key PixelLab accepted (a remembered key counts once its balance check succeeds).
		doneWhen: () => !!app.key && !app.keyRejected && !!app.balance,
		doneOn: "dialog[open] :is(a[href*='pixellab.ai'], input[type='password'])"
	},
	{
		id: 'gear',
		title: 'tips.gearTitle',
		body: () => 'tips.gearBody',
		anchor: gearAnchor,
		placement: 'top',
		when: () => calm() && ui.tab === 'wardrobe',
		doneWhen: () =>
			!!visit.outfit.key && visit.outfit.key === outfitKey() && outfitNow() !== visit.outfit.value
	},
	{
		id: 'export',
		title: 'tips.exportTitle',
		body: (anchor) =>
			anchor.matches('.header-export') ? 'tips.exportBody' : 'tips.exportInMoreBody',
		anchor: exportAnchor,
		when: calm,
		after: ['gear'],
		doneWhen: () => ui.sheet === 'export'
	},
	{
		id: 'add-item',
		title: 'tips.addItemTitle',
		body: () => 'tips.addItemBody',
		// The + in a slot's header: the empty slot's New tile is easy to find and disappears once the slot has gear,
		// while + stays and is easy to miss.
		anchor: () => first('#customization-panel [data-tip-anchor="new-item"]'),
		placement: 'top',
		onePerVisit: true,
		when: () => calm() && ui.tab === 'wardrobe' && ownOpen(),
		doneWhen: () => ui.sheet === 'newitem'
	},
	{
		id: 'generate-items',
		title: 'tips.generateItemsTitle',
		body: () => 'tips.generateItemsBody',
		// The ⋮ of a move whose menu offers Generate items. With a mouse it shows only on hover, so the tip keeps it shown
		// while pointing at it.
		anchor: () => {
			for (const action of document.querySelectorAll<HTMLElement>(
				'#customization-panel [data-tip-anchor="generate-items"]'
			)) {
				const id = action.closest('[popover]')?.id;
				const trigger = id ? document.querySelector<HTMLElement>(`[popovertarget="${id}"]`) : null;
				if (trigger && fullyVisible(trigger, true)) return trigger;
			}
			return null;
		},
		reveal: true,
		onePerVisit: true,
		when: () => calm() && ui.tab === 'moves' && ownOpen(),
		doneWhen: () => ui.sheet === 'itemGeneration'
	},
	{
		id: 'add-move',
		title: 'tips.addMoveTitle',
		body: () => 'tips.addMoveBody',
		anchor: () => first('#customization-panel [data-tip-anchor="add-move"]'),
		// Below: above it would cover the panel's tabs.
		onePerVisit: true,
		when: () => calm() && ui.tab === 'moves' && ownOpen(),
		doneOn: '[data-tip-anchor="add-move"]'
	},
	{
		id: 'add-state',
		title: 'tips.addStateTitle',
		body: () => 'tips.addStateBody',
		anchor: () => first('#customization-panel [data-tip-anchor="add-state"]'),
		// Below: above it would cover the panel's tabs.
		onePerVisit: true,
		when: () => calm() && ui.tab === 'states' && ownOpen(),
		doneOn: '[data-tip-anchor="add-state"]'
	}
];
