// Agent tools for moves. add_move builds its request with the Add move sheet's own form plan (moveForm.ts) and queues it
// through the Studio move queue, so ids, models, frame counts, hard stops, preflight warnings, price and the review before publishing
// are the sheet's. What the sheet offers beyond this (uploaded start or end frames, starting from a saved frame,
// checkpoint retries) stays in the sheet.
import { app, getKeyRevision } from '../../lib/app.svelte.ts';
import { displayMessage } from '../../lib/i18n.ts';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import { setupPlan } from '../../lib/rig/setup.ts';
import type { Project } from '../../lib/store/manifest.ts';
import type { StoredProject } from '../../lib/store/project.ts';
import { LocalizedError, message } from '../../lib/message.ts';
import { timeoutFor } from '../../lib/pixellab/client.ts';
import { queue } from '../../lib/pixellab/queue.ts';
import { routes } from '../../lib/pixellab/routes.ts';
import {
	agentMoveQuoteChanged,
	missingItemMoves,
	moveMinimumTier,
	movePreflightWarnings,
	moveRigReady,
	readMoveCandidateImages,
	resolveMoveMotionSource,
	type MoveSpec
} from '../create.ts';
import { moveEstimate } from '../movePricing.ts';
import { moveTemplatePrompt } from '../moveAnimationOptions.ts';
import { moveModels, openingCreationSettings } from '../creationSettings.ts';
import { promptSuggestionDefaults } from '../promptSuggestionDefaults.ts';
import { promptSuggestions } from '../promptSuggestions.svelte.ts';
import {
	moveCandidateHasStructuralFailure,
	moveRigVersion,
	type MoveCandidate
} from '../replaceMove.ts';
import {
	actionPrompt,
	loopedText,
	moveClipIds,
	moveFormIssue,
	moveFormMotion,
	moveFormSpec,
	moveFormStop,
	moveRequestSpec,
	moveSeed,
	newMoveActions,
	planMoveForm,
	redrawDirections,
	type MoveFormChoices
} from '../moveForm.ts';
import {
	doc,
	openProject,
	pendingBodyMoveName,
	pendingMoves,
	queueAgentMove,
	refreshMoveReviews,
	saveReviewedMove
} from '../state.svelte.ts';
import { AgentError, checkAbort, type Tool } from './contract.ts';
import { budget, rateUsd, withReservation } from './budget.ts';
import { fingerprintOf, receipts, receiptView, type Outcome, type Receipt } from './receipts.ts';
import { jobError } from './jobError.ts';
import { paidPreflight, readSavedCharacter, ready, requestIdArg, str } from './toolSupport.ts';

const ACTIONS = promptSuggestionDefaults.move.flatMap(({ action }) => (action ? [action] : []));
const BUSY_KEYS = new Set([
	'moveSheet.alreadyQueued',
	'moveSheet.checkpoint.ready',
	'moveSheet.checkpoint.changed',
	'directionsSheet.waitForGeneration',
	'state.manageMovesInOtherTab'
]);
// Agents read canonical English, whatever language the person uses.
const refusal = (issue: LocalizedError) =>
	new AgentError(issue.message, BUSY_KEYS.has(issue.translation.key) ? 'busy' : 'invalid');

/** The character a move tool works on: the given id, else the open one. */
async function moveTarget(characterId: unknown) {
	await ready();
	const projectId = typeof characterId === 'string' && characterId ? characterId : doc.id;
	if (!projectId) throw new AgentError('No character is open.', 'not_ready');
	if (projectId.startsWith('fixture:'))
		throw new AgentError(
			'The demo is read-only, and copies of it cannot get moves. Use a character made with create_character.',
			'unsupported'
		);
	return projectId;
}

async function moveCharacter(projectId: string) {
	const { project, record } = await readSavedCharacter(projectId);
	if (!record) throw new AgentError('This character is not saved.', 'not_found');
	return { project, record };
}

export type MoveReadiness = {
	canAdd: boolean;
	/** Why not: needs_user when the person can fix it in the Studio, unsupported when nothing can. */
	code: 'needs_user' | 'unsupported' | null;
	reason: string | null;
};

/** Whether add_move can run on a character, and if not, why and what would fix it. Offline: rig setup is planned from the
 *  saved frames, as the Studio's Rig setup does before it offers to run, and nothing is requested. */
export async function moveReadiness(
	project: Project,
	record: Pick<StoredProject, 'manifest' | 'character'> | undefined,
	demo = false
): Promise<MoveReadiness> {
	if (!demo && moveRigReady(record)) return { canAdd: true, code: null, reason: null };
	let gens: number;
	try {
		gens = (await setupPlan(project)).gens;
	} catch (error) {
		const why = error instanceof Error ? error.message : 'Its body frames cannot be set up.';
		return {
			canAdd: false,
			code: 'unsupported',
			reason: `${demo ? 'The demo is read-only, and copies of it cannot get moves' : 'This character cannot get moves'}: ${why} Use a character made with create_character.`
		};
	}
	if (demo)
		return {
			canAdd: false,
			code: 'unsupported',
			reason:
				'The demo is read-only. A copy from copy_demo_character needs rig setup in the Studio before it can get moves.'
		};
	return {
		canAdd: false,
		code: 'needs_user',
		reason: `This character needs a one-time rig setup before it can get moves: about ${gens} generations (about $${(Math.round(rateUsd(gens) * 100) / 100).toFixed(2)}). Ask the user to open Add move in the Studio and run Rig setup; it asks them to describe the character. Agents cannot start it.`
	};
}

/** What identifies the artwork of a move review: its run, seed and frames. A new run or a redraw of the review changes it,
 *  so a decision binds to the candidate the agent looked at. */
async function candidateIdOf(candidate: MoveCandidate) {
	const { seed, activityScope } = candidate.spec;
	const hash = await sha256(stableStringify({ seed, activityScope, cells: candidate.cells }));
	return hash.slice(0, 16);
}

/** A move review waiting for a decision, as agents see it. */
export async function reviewOf(candidate: MoveCandidate) {
	return {
		moveId: candidate.spec.id,
		candidateId: await candidateIdOf(candidate),
		redraw: !!candidate.spec.replace,
		directions: candidate.dirs,
		frames: candidate.animation.cells,
		canAccept: !moveCandidateHasStructuralFailure(candidate),
		warnings: candidate.warnings,
		checks: Object.fromEntries(
			Object.entries(candidate.checks).map(([clip, qa]) => [
				clip,
				{
					fails: qa.fails,
					warnings: qa.warnings,
					strayPx: qa.stray,
					disconnectedPixels: qa.disconnectedPixels
				}
			])
		)
	};
}

/** The character's move review, or a refusal naming the ones that wait. */
export function reviewFor(record: Pick<StoredProject, 'moveReviews'> | undefined, moveId: string) {
	const reviews = record?.moveReviews ?? {};
	if (Object.hasOwn(reviews, moveId)) return reviews[moveId];
	throw new AgentError(
		`No move review for "${moveId}". Waiting: ${Object.keys(reviews).join(', ') || 'none'}.`,
		'not_found'
	);
}

/** The project with a review's frames in place of the saved move, to draw them before anyone decides. */
export async function withReview(project: Project, candidate: MoveCandidate): Promise<Project> {
	const manifest = structuredClone(project.manifest),
		rig = manifest.rig,
		id = candidate.spec.id;
	const at = rig.animations.findIndex((move) => move.id === id);
	if (at >= 0) rig.animations[at] = candidate.animation;
	else rig.animations.push(candidate.animation);
	const base = manifest.items.find((item) => item.id === rig.baseItem);
	if (base?.layers[0]) (base.layers[0].cells ??= {})[id] = candidate.cells;
	let frames;
	try {
		frames = await readMoveCandidateImages(candidate);
	} catch (error) {
		throw error instanceof LocalizedError ? refusal(error) : error;
	}
	return { ...project, manifest, images: new Map([...project.images, ...frames]) };
}

export const addMoveTool: Tool = {
	name: 'add_move',
	title: 'Add move',
	description:
		'Paid. Add a move (animation) to the base body of an editable character, as Add move does: a template action, a described move, or a redraw of chosen directions of a saved move. The character must be ready for moves (inspect_character addMove). A new move covers every drawn direction; equipment is not posed on it here. dryRun true returns the plan, warnings and price only. The move runs in the background. Follow the receipt with wait_for_activity, look at it with render_frames review true, then call accept_move or discard_move with its candidateId.',
	inputSchema: {
		type: 'object',
		properties: {
			characterId: str(
				'Character id from list_characters. Omit for the character open in the Studio.'
			),
			action: {
				type: 'string',
				enum: ACTIONS,
				description:
					'Template action for a new move. The character must not have it yet; to redraw one it has, use redraw.'
			},
			prompt: str(
				'What the move does. Alone: a described new move, named from its first words. With action or redraw: replaces the template or saved text.',
				500
			),
			redraw: str('Id of a saved move to redraw (inspect_character moves).', 60),
			directions: {
				type: 'array',
				items: str('Direction id', 20),
				maxItems: 8,
				description:
					'With redraw: the views to redraw (default: those failing checks, else all). Mirrored directions follow their source.'
			},
			loop: { type: 'boolean', description: 'Loops (default: from the action).' },
			model: {
				type: 'string',
				enum: [...moveModels],
				description: "Animation model (default: the user's Settings, else skeleton-v3)."
			},
			frames: {
				type: 'integer',
				minimum: 1,
				maximum: 40,
				description: 'Frame count; must suit the model and frame size (a dry run lists them).'
			},
			acceptWarnings: {
				type: 'boolean',
				description: 'Generate past preflight warnings a dry run returned (the user should agree).'
			},
			requestId: requestIdArg,
			dryRun: { type: 'boolean' }
		}
	},
	consequential: true,
	untrusted: true,
	async run(args, signal) {
		const projectId = await moveTarget(args.characterId);
		// A repeated request answers from its receipt, whatever the character looks like now.
		const fingerprint = fingerprintOf({ ...args, characterId: projectId });
		const earlier = args.dryRun ? undefined : receipts.repeat('move', args.requestId, fingerprint);
		if (earlier)
			return {
				data: {
					repeated: true,
					started: true,
					activityId: earlier.id,
					status: earlier.outcome,
					...receiptView(earlier)
				}
			};
		const { project: p, record: rec } = await moveCharacter(projectId);
		const m = p.manifest;
		const rigVersion = moveRigVersion(rec);
		const readiness = await moveReadiness(p, rec);
		if (!readiness.canAdd) throw new AgentError(readiness.reason!, readiness.code!);
		const action = args.action as string | undefined,
			redraw = args.redraw as string | undefined,
			prompt = (args.prompt as string | undefined)?.trim(),
			wanted = args.directions as string[] | undefined;
		const { moves } = moveClipIds(m);
		if (action && redraw) throw new AgentError('Give action or redraw, not both.');
		if (!action && !redraw && !prompt)
			throw new AgentError('Give an action, a prompt, or a move to redraw.');
		if (action && !newMoveActions(m).includes(action))
			throw new AgentError(
				moves.has(action)
					? `"${action}" is already a move. Use redraw to draw it again.`
					: `"${action}" cannot be added as a new move here.`
			);
		if (redraw && !moves.has(redraw))
			throw new AgentError(
				`No saved move "${redraw}". Moves: ${[...moves].join(', ') || 'none'}.`,
				'not_found'
			);
		const drawn = m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
		for (const d of wanted ?? [])
			if (!drawn.some((id) => id === d))
				throw new AgentError(
					`"${d}" is not a drawn direction. Drawn: ${drawn.join(', ')}.`,
					'not_found'
				);
		if (wanted && !redraw && !drawn.every((d) => wanted.includes(d)))
			throw new AgentError(
				'A new move covers every drawn direction; directions applies only with redraw.',
				'unsupported'
			);

		// The form as the sheet opens on this choice: a picked template keeps its (Settings-customized) text.
		const offered = newMoveActions(m);
		const suggested = promptSuggestions('move').filter(
			(entry) => !entry.action || offered.includes(entry.action)
		);
		const templateText = (name: string) =>
			suggested.find((entry) => entry.action === name)?.prompt ?? moveTemplatePrompt(name);
		const preferences = openingCreationSettings('moves');
		const choices: MoveFormChoices = {
			action: redraw ?? action ?? '',
			text: redraw
				? actionPrompt(m, redraw, true).prompt
				: action
					? templateText(action)
					: (prompt ?? ''),
			replaceSelected: !!redraw,
			templatePicked: !!(redraw ?? action),
			model: args.model as MoveFormChoices['model'],
			frames: args.frames as number | undefined,
			savedFrames: typeof preferences.frames === 'number' ? preferences.frames : undefined,
			preferredModel: preferences.model,
			dirs: redraw
				? ((wanted as MoveFormChoices['dirs'] | undefined) ??
					redrawDirections(rec.rigQa, drawn, redraw))
				: drawn,
			references: {}
		};
		const context = {
			manifest: m,
			characterId: rec.character?.id,
			pending: pendingMoves(projectId).map((s) => s.id),
			reviews: rec.moveReviews ?? {}
		};
		if (typeof args.loop === 'boolean') {
			const was = planMoveForm(choices, context).looping;
			choices.text = loopedText(
				choices.text,
				choices.action,
				was,
				args.loop,
				templateText(choices.action)
			);
			choices.loop = args.loop;
		}
		if (prompt && choices.action) choices.text = prompt;
		const form = planMoveForm(choices, context);
		if (choices.model && form.model !== choices.model)
			throw new AgentError(
				`${choices.model} cannot keep this move's ${form.keptFrames} frames for a partial redraw.`
			);
		const frames = args.frames as number | undefined;
		if (
			frames !== undefined &&
			(form.keptFrames !== undefined
				? frames !== form.keptFrames
				: !form.frameCounts.includes(frames))
		)
			throw new AgentError(
				form.keptFrames !== undefined
					? `A partial redraw keeps ${form.keptFrames} frames.`
					: `frames must be one of ${form.frameCounts.join(', ')} for ${form.model} at this frame size.`
			);

		// A described skeleton move uses the character's PixelLab skeleton when PixelLab still has it (a free read).
		const credential = getKeyRevision();
		let source: MoveSpec['motionSource'] = 'standalone';
		if (form.managedId && app.key && !app.keyRejected) {
			const path = routes.getCharacter(form.managedId).path;
			const probe = AbortSignal.any([signal, AbortSignal.timeout(timeoutFor('GET', path))]);
			try {
				source = await resolveMoveMotionSource(app.key, form.managedId, probe);
			} catch {
				checkAbort(signal);
				throw new AgentError(
					displayMessage(message('agentMoves.skeletonCheckFailed')),
					'not_ready'
				);
			}
		}
		checkAbort(signal);
		const motion = moveFormMotion(form, source);
		const name = (id: string) => id;
		const issue = moveFormIssue(form, motion, {
			manifest: m,
			record: rec,
			replaceSelected: choices.replaceSelected,
			templatePicked: choices.templatePicked,
			reviews: rec.moveReviews ?? {},
			regenerating: false,
			offered: suggested.flatMap((entry) => (entry.action ? [entry.action] : [])),
			retryChanged: () => false,
			name
		});
		const stop = moveFormStop(form, issue, context.pending, name);
		if (stop) throw refusal(stop);
		const checked = moveFormSpec(form, motion);
		const preflight = movePreflightWarnings(p, checked);
		let estimate, minimumTier;
		try {
			estimate = moveEstimate(m, checked);
			minimumTier = moveMinimumTier(m, checked);
		} catch (error) {
			throw error instanceof LocalizedError ? refusal(error) : error;
		}
		const generations = Math.ceil(estimate.gens);
		const plan = {
			moveId: form.id,
			redraw: form.replacing,
			directions: form.targetDirs,
			model: form.model,
			frames: estimate.frames,
			frameChoices: form.keptFrames === undefined ? form.frameCounts : [form.keptFrames],
			loop: form.looping,
			prompt: motion.text,
			generations,
			approxUsd: Math.round(rateUsd(generations) * 100) / 100,
			minutes: estimate.minutes,
			minimumTier,
			warnings: preflight.map((w) => ({ id: w.id, text: w.message }))
		};
		if (args.dryRun || (preflight.length && !args.acceptWarnings))
			return { data: { started: false, ...plan } };
		const pending = await pendingBodyMoveName(projectId, form.id);
		const latest = await readSavedCharacter(projectId);
		const quoteChanged = () => new AgentError(agentMoveQuoteChanged().message, 'busy');
		if (
			!latest.record ||
			moveRigVersion(latest.record) !== rigVersion ||
			Object.hasOwn(latest.record.moveReviews ?? {}, form.id) ||
			pending ||
			getKeyRevision() !== credential
		)
			throw quoteChanged();
		paidPreflight(minimumTier);
		const spec = {
			...moveRequestSpec(form, motion, {
				seed: moveSeed(),
				acceptedWarnings: preflight.map((w) => w.id)
			}),
			agentQuote: { rigVersion, generations }
		};
		let outcome: Outcome = 'queued';
		let receipt: Receipt | undefined;
		let failure: string | undefined;
		const start = await withReservation(`move ${form.id}`, generations, signal, (check) => {
			const accepted = queueAgentMove(
				projectId,
				spec,
				check,
				() => {
					if (
						getKeyRevision() !== credential ||
						!app.key ||
						app.keyRejected ||
						queue.role === 'follower'
					)
						throw agentMoveQuoteChanged();
				},
				(next, error) => {
					outcome = next;
					failure = jobError(error) ?? undefined;
					if (receipt) receipts.settle(receipt, next, failure);
				}
			);
			if (!accepted) throw quoteChanged();
			return accepted;
		});
		receipt = receipts.add({
			kind: 'move',
			id: start.id,
			characterId: projectId,
			moveId: form.id,
			name: form.id,
			...(typeof args.requestId === 'string' ? { requestId: args.requestId } : {}),
			fingerprint,
			generations,
			startedAt: new Date().toISOString(),
			outcome,
			...(failure ? { error: failure } : {})
		});
		return {
			data: {
				started: true,
				activityId: receipt.id,
				characterId: projectId,
				status: receipt.outcome,
				...plan,
				budget: budget()
			}
		};
	}
};

export const moveReviewTools: Tool[] = [true, false].map((accept): Tool => ({
	name: accept ? 'accept_move' : 'discard_move',
	title: accept ? 'Accept move review' : 'Discard move review',
	description: accept
		? 'Save the move review you looked at (render_frames review true) to its character. equipmentToPose lists items without frames on the new move: the user poses them from each item in the Studio.'
		: 'Discard the move review you looked at. Generations already used stay spent.',
	inputSchema: {
		type: 'object',
		properties: {
			characterId: str('Character id from the activity receipt. Omit for the open character.'),
			moveId: str('The move id reported by add_move.', 60),
			candidateId: str(
				'The candidateId render_frames (review true) or inspect_character reported for the review you looked at.',
				40
			)
		},
		required: ['moveId', 'candidateId']
	},
	consequential: true,
	async run(args, signal) {
		const projectId = await moveTarget(args.characterId);
		const { record } = await moveCharacter(projectId);
		const moveId = String(args.moveId);
		const candidate = reviewFor(record, moveId);
		const { candidateId } = await reviewOf(candidate);
		if (candidateId !== args.candidateId)
			throw new AgentError(
				`The review of "${moveId}" is now candidate ${candidateId}, not the one you looked at. Look at it with render_frames review true first.`,
				'busy'
			);
		checkAbort(signal);
		try {
			await saveReviewedMove(projectId, candidate, accept);
		} catch (error) {
			throw error instanceof LocalizedError ? refusal(error) : error;
		}
		if (doc.id === projectId) {
			if (accept) await openProject(projectId, { quiet: true, stay: true });
			else await refreshMoveReviews(projectId);
		}
		const data = { characterId: projectId, moveId, candidateId };
		if (!accept) return { data: { ...data, outcome: 'discarded' } };
		// Items the Studio can pose onto the new move: the person does that from each item (its missing moves).
		const { project } = await moveCharacter(projectId);
		const m = project.manifest;
		const equipmentToPose = m.items
			.filter(
				(item) =>
					item.id !== m.rig.baseItem &&
					missingItemMoves(m, item.id, 0).some((move) => move.id === moveId)
			)
			.map((item) => item.id);
		return { data: { ...data, outcome: 'saved', equipmentToPose } };
	}
}));
