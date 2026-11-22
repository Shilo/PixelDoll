// The Add move form's decisions, shared by MoveSheet and the add_move agent tool so both build the same request: the move
// id, animation model, frame count, start frame, hard stops and the queued spec. Pure: no Svelte state, storage or
// transport; callers pass in what they read from the Studio.
import type { DirectionName, Manifest } from '../lib/store/manifest.ts';
import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
import { playbackClips } from '../lib/runtime/timeline.js';
import { LocalizedError } from '../lib/message.ts';
import { clipNameId, sameClipName } from './clipName.ts';
import { stateAttempts } from './stateRecovery.ts';
import {
	moveFrameCounts,
	moveTemplatePrompt,
	templateLoops,
	type MoveAnimationModel,
	type MoveAnimationOptions,
	type MoveFrameReferences
} from './moveAnimationOptions.ts';
import { moveModels, resolveMoveFramePreference } from './creationSettings.ts';
import { isAuthoredAction, moveFrames } from './movePricing.ts';
import {
	resolveMoveSource,
	savedReplacementSource,
	type MoveSourceSelection
} from './moveSource.ts';
import { promptSuggestionDefaults } from './promptSuggestionDefaults.ts';
import { bodyMoveIssue, partialMoveFrameIssue, reservedMove, type MoveSpec } from './create.ts';

type FrameImage = { width: number; height: number; base64: string };

/** What the person (or agent) chose in the form. */
export interface MoveFormChoices<Image extends FrameImage = FrameImage> {
	/** The template action ('' for a described move). */
	action: string;
	text: string;
	/** Redraw the saved move named by `action`. */
	replaceSelected: boolean;
	/** The template was picked, so the move keeps its id even with customized text. */
	templatePicked: boolean;
	loop?: boolean;
	model?: MoveAnimationModel;
	/** A chosen frame count; null is Default. */
	frames?: number | null;
	/** The frame count saved in Settings, used while a new described move has no choice of its own. */
	savedFrames?: number;
	/** The model a new move uses unless one is chosen (Settings, else the default). */
	preferredModel: MoveAnimationModel;
	/** Views to redraw (a replacement only; a new move covers every drawn direction). */
	dirs: readonly DirectionName[];
	source?: MoveSourceSelection;
	references: MoveFrameReferences<Image>;
	/** An id this form keeps (a regenerated review whose description is unchanged). */
	keepId?: string;
	/** A skeleton checkpoint retry, which never resolves a managed motion source. */
	skeletonRetry?: boolean;
}

/** What else the character already has or is making, which the move id must not reuse. */
export interface MoveFormContext {
	manifest: Manifest | undefined;
	/** The PixelLab character id saved with the character (its managed skeleton source). */
	characterId?: string;
	pending: readonly string[];
	reviews: Readonly<Record<string, unknown>>;
}

/** The character's saved moves and States by playback key. */
export function moveClipIds(m: Manifest | undefined) {
	const clips = playbackClips(m?.rig.animations ?? []);
	return {
		clips,
		moves: new Set(clips.filter((a) => a.kind === 'move').map((a) => a.key)),
		states: new Set(clips.filter((a) => a.kind === 'state').map((a) => a.key))
	};
}

/** Template actions a new move can still use. Default is the standing views themselves: nothing to generate or replace. */
export function newMoveActions(m: Manifest | undefined): string[] {
	const { moves, states } = moveClipIds(m);
	return promptSuggestionDefaults.move.flatMap(({ action }) =>
		action && !states.has(action) && !moves.has(action) && !reservedMove(action) ? [action] : []
	);
}

/** The views a redraw starts on: those that failed their checks, or every view when none did. */
export function redrawDirections(
	rigQa: unknown,
	available: readonly DirectionName[],
	clip: string
): DirectionName[] {
	const clips = (rigQa as { clips?: Record<string, { fails?: unknown[] }> } | undefined)?.clips;
	const flagged = available.filter((d) => clips?.[`${clip}/${d}`]?.fails?.length);
	return flagged.length ? flagged : [...available];
}

/** The text the form opens on for an action: a redrawn move's own description (`saved`, when it was described), else
 *  the template text with the saved clip's loop. */
export function actionPrompt(m: Manifest | undefined, id: string, replace: boolean) {
	const clip = m?.rig.animations.find((entry) => entry.id === id);
	const saved =
		replace && clip?.sources
			? Object.values(clip.sources)
					.map((source) => source?.motion?.match(/^(?:v3|pixminimax):(.+)$/s)?.[1])
					.find((prompt) => prompt && prompt !== id)
			: undefined;
	return { saved, prompt: saved || moveTemplatePrompt(id, clip?.moveLoop ?? clip?.loop) };
}

/** Template text follows a Loop change; a typed description stays as typed. `template` is the text the template opens
 *  on, which Settings may have customized: it gains or loses the looping wording the way the built-in text does. */
export function loopedText(
	text: string,
	action: string,
	was: boolean,
	now: boolean,
	template = moveTemplatePrompt(action)
) {
	if (text === moveTemplatePrompt(action, was)) return moveTemplatePrompt(action, now);
	const plain = moveTemplatePrompt(action, false),
		tail = moveTemplatePrompt(action, true).slice(plain.length);
	const base = tail && template.endsWith(tail) ? template.slice(0, -tail.length) : template;
	const worded = (loop: boolean) => (loop ? base + tail : base);
	return text === template || text === worded(was) ? worded(now) : text;
}

/** Everything the form derives from its choices, before the motion source is known. */
export function planMoveForm<Image extends FrameImage>(
	c: MoveFormChoices<Image>,
	ctx: MoveFormContext
) {
	const m = ctx.manifest,
		{ action, text } = c;
	const { moves: have, states: stateIds } = moveClipIds(m);
	const replacing = c.replaceSelected && have.has(action);
	const savedMove = m?.rig.animations.find((a) => a.id === action);
	const looping =
		c.loop ??
		(replacing ? (savedMove?.moveLoop ?? savedMove?.loop) : undefined) ??
		templateLoops(action);
	// Ids allow only a-z, 0-9, - and _ (rig.ts): a description in another script gets the first free "move-N".
	const freeMoveId = () => {
		if (c.keepId) return c.keepId;
		let n = 1;
		while (
			have.has(`move-${n}`) ||
			stateIds.has(`move-${n}`) ||
			ctx.pending.includes(`move-${n}`) ||
			Object.hasOwn(ctx.reviews, `move-${n}`)
		)
			n++;
		return `move-${n}`;
	};
	const id =
		((c.replaceSelected ||
			c.templatePicked ||
			text.trim() === moveTemplatePrompt(action, looping)) &&
			action) ||
		(text.trim() &&
			(clipNameId(text.trim().split(/[,.]/)[0].split(/\s+/).slice(0, 2).join(' ')).slice(0, 24) ||
				freeMoveId()));
	const availableDirs = m?.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id) ?? [];
	const targetDirs = replacing ? availableDirs.filter((d) => c.dirs.includes(d)) : availableDirs;
	const explicitFrame = !!c.source && c.source.clip !== DEFAULT_MOVE;
	const startFrom =
		m && explicitFrame && c.source
			? resolveMoveSource(m, c.source, targetDirs)
			: m && !c.source && replacing
				? savedReplacementSource(m, action, targetDirs)
				: undefined;
	const describing = !action || text.trim() !== moveTemplatePrompt(action, looping);
	const canvas = m?.rig.cell.w ?? 0;
	// The frame count the core falls back to: a replaced clip's cells, otherwise PixelDoll's 8-frame preset.
	const baseFrames = replacing ? (savedMove?.cells ?? 8) : 8;
	// A partial replacement must keep the saved clip's cell count so redrawn views line up with the kept ones.
	const keptFrames =
		replacing && targetDirs.length !== availableDirs.length ? savedMove?.cells : undefined;
	const fitsKept = (option: MoveAnimationModel) =>
		keptFrames === undefined || moveFrameCounts(option, canvas).includes(keptFrames);
	const fitsSource = (option: MoveAnimationModel) =>
		option !== 'skeleton-v3' || !startFrom || (!describing && isAuthoredAction(action));
	const model = ((): MoveAnimationModel => {
		if (c.model && fitsKept(c.model)) return c.model;
		if (!replacing) return c.preferredModel;
		const preferred =
			keptFrames ??
			(m && moveFrames(m, { action: describing ? undefined : action, frames: baseFrames }));
		const fitsPreferred = (option: MoveAnimationModel) =>
			preferred !== undefined && moveFrameCounts(option, canvas).includes(preferred);
		for (const dir of targetDirs) {
			const route = savedMove?.sources?.[dir]?.route;
			if (route && route !== 'import' && fitsSource(route) && fitsPreferred(route)) return route;
		}
		return fitsSource('skeleton-v3') && fitsPreferred('skeleton-v3')
			? 'skeleton-v3'
			: (moveModels.find((option) => fitsSource(option) && fitsPreferred(option)) ?? 'pixminimax');
	})();
	// Model-valid counts for this character's actual canvas; the same object prices and submits the move.
	const frameCounts = moveFrameCounts(model, canvas);
	const usesSavedFrames = !replacing && describing && c.frames === undefined;
	const userFrameCount =
		keptFrames === undefined
			? resolveMoveFramePreference(
					model,
					(usesSavedFrames ? c.savedFrames : c.frames) ?? 'auto',
					canvas
				)
			: undefined;
	const frameFallback =
		usesSavedFrames && c.savedFrames !== undefined && userFrameCount === undefined;
	const chosenFrameCount =
		keptFrames !== undefined && frameCounts.includes(keptFrames) ? keptFrames : userFrameCount;
	const compact = (reference: Image) => ({
		width: reference.width,
		height: reference.height,
		base64: reference.base64
	});
	const animation: MoveAnimationOptions = {
		model,
		loop: looping,
		...(chosenFrameCount === undefined ? {} : { frameCount: chosenFrameCount }),
		...(Object.keys(c.references).length
			? {
					references: Object.fromEntries(
						targetDirs.flatMap((direction) => {
							const value = c.references[direction];
							if (!value) return [];
							return [
								[
									direction,
									{
										...(value.start ? { start: compact(value.start) } : {}),
										...(model !== 'skeleton-v3' && value.end !== undefined
											? { end: value.end ? compact(value.end) : null }
											: {})
									}
								]
							];
						})
					)
				}
			: {})
	};
	// What the core resolves with no explicit count, so the Default label matches the price and the request.
	const defaultFrames = m
		? moveFrames(m, {
				action: describing ? undefined : action,
				frames: baseFrames,
				animation: { model }
			})
		: baseFrames;
	// A described skeleton move draws its motion on the character's PixelLab skeleton when PixelLab still has it.
	const managedId =
		model === 'skeleton-v3' &&
		(describing || !isAuthoredAction(action)) &&
		!startFrom &&
		!c.skeletonRetry &&
		!targetDirs.some((direction) => c.references[direction]?.start)
			? ctx.characterId
			: undefined;
	return {
		action,
		text,
		replacing,
		savedMove,
		looping,
		id,
		availableDirs,
		targetDirs,
		explicitFrame,
		startFrom,
		describing,
		canvas,
		baseFrames,
		keptFrames,
		fitsKept,
		model,
		frameCounts,
		userFrameCount,
		frameFallback,
		animation,
		defaultFrames,
		shownFrames: userFrameCount ?? defaultFrames,
		managedId
	};
}
/** A Loop confirmation remains valid across replans with the same ordered directions. */
export const sameMoveDirections = (a: readonly DirectionName[], b: readonly DirectionName[]) =>
	a.length === b.length && a.every((direction, index) => direction === b[index]);

export type MoveFormPlan = ReturnType<typeof planMoveForm>;

/** The motion request, once the managed motion source is resolved ('standalone' without one). */
export const moveFormMotion = (f: MoveFormPlan, motionSource: MoveSpec['motionSource']) => ({
	id: f.id,
	motionSource,
	action: f.describing ? undefined : f.action,
	text: f.text.trim(),
	frames: f.baseFrames,
	replace: f.replacing,
	animation: f.animation,
	startFrom: f.startFrom
});
export type MoveFormMotion = ReturnType<typeof moveFormMotion>;

/** The spec the form checks and prices: its tier, preflight warnings and estimate. */
export const moveFormSpec = (f: MoveFormPlan, motion: MoveFormMotion): MoveSpec => ({
	...motion,
	items: [],
	poseStyle: 'visible-side-v1',
	seed: 0,
	...(f.replacing ? { dirs: [...f.targetDirs] } : {})
});

export const moveSeed = () => 1 + Math.floor(Math.random() * 1_000_000);

/** The move Add move queues: reviewed before it is published, with the warnings the person chose to generate past. */
export const moveRequestSpec = (
	f: MoveFormPlan,
	motion: MoveFormMotion,
	o: { seed: number; regeneration?: MoveSpec['reviewRegeneration']; acceptedWarnings: string[] }
): MoveSpec => ({
	...motion,
	items: [],
	reviewBeforePublish: true,
	reviewRegeneration: o.regeneration,
	poseStyle: 'visible-side-v1',
	seed: o.seed,
	...(f.replacing ? { dirs: [...f.targetDirs] } : { approvedDirs: [...f.targetDirs] }),
	...(o.acceptedWarnings.length ? { acceptedWarnings: o.acceptedWarnings } : {})
});

/** Why the form cannot ask for this move as chosen ('' when it can). */
export function moveFormIssue(
	f: MoveFormPlan,
	motion: MoveFormMotion,
	o: {
		manifest: Manifest | undefined;
		record: Parameters<typeof stateAttempts>[0];
		replaceSelected: boolean;
		templatePicked: boolean;
		reviews: Readonly<Record<string, unknown>>;
		/** The form regenerates the review saved under this id. */
		regenerating: boolean;
		/** Template actions the form offers. */
		offered: readonly string[];
		/** A skeleton checkpoint retry no longer matches its review. */
		retryChanged: () => boolean;
		name: (id: string) => string;
	}
): LocalizedError | '' {
	const { moves: have, states: stateIds } = moveClipIds(o.manifest);
	const { action, id } = f;
	const duplicate = () =>
		new LocalizedError(
			`${o.name(id)} is already a move option. Start the description with different words.`,
			'moveSheet.duplicateOption',
			{ move: o.name(id) }
		);
	if (action && o.replaceSelected !== have.has(action))
		return new LocalizedError(
			'This move changed while you were editing. Select it again to continue.',
			'moveSheet.changedDuringEdit'
		);
	if (Object.hasOwn(o.reviews, id) && !o.regenerating)
		return new LocalizedError(`${o.name(id)} is ready to review.`, 'moveSheet.checkpoint.ready', {
			move: o.name(id)
		});
	if (f.describing && !o.templatePicked && !f.replacing && id && o.offered.includes(id))
		return duplicate();
	const m = o.manifest;
	if (!m || !id) return '';
	if (
		(!f.replacing && have.has(id)) ||
		(!have.has(id) &&
			([...stateIds].some((stateId) => sameClipName(stateId, id)) ||
				stateAttempts(o.record).some((attempt) => sameClipName(attempt.id, id))))
	)
		return duplicate();
	if (f.explicitFrame && !f.startFrom)
		return new LocalizedError(
			'This frame needs body artwork and measured joints for every selected facing.',
			'moveSheet.startFrom.unavailable'
		);
	if (o.retryChanged())
		return new LocalizedError(
			'The character or move changed. Reopen the review before continuing.',
			'moveSheet.checkpoint.changed'
		);
	return (
		bodyMoveIssue(m, motion) ||
		(f.replacing && f.targetDirs.length
			? partialMoveFrameIssue(m, motion, f.targetDirs.length)
			: undefined) ||
		''
	);
}

/** The first reason the form has no price ('' when it can be priced): the id, directions, a reserved name, an issue, or
 *  the same move already waiting. */
export function moveFormStop(
	f: MoveFormPlan,
	issue: LocalizedError | '',
	pending: readonly string[],
	name: (id: string) => string
): LocalizedError | '' {
	if (!f.id)
		return new LocalizedError(
			'Describe this move before generating it.',
			'create.errors.describeMove'
		);
	if (!f.targetDirs.length)
		return new LocalizedError(
			'Choose one or more independently drawn directions for this move.',
			'create.errors.chooseOneMoreIndependently'
		);
	return (
		reservedMove(f.id, f.replacing) ||
		issue ||
		(pending.includes(f.id)
			? new LocalizedError(`${name(f.id)} is already queued.`, 'moveSheet.alreadyQueued', {
					move: name(f.id)
				})
			: '')
	);
}
