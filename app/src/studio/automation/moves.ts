// Agent tools for moves. add_move builds its request with the Add move sheet's own form plan (moveForm.ts) and queues it
// through the Studio move queue, so ids, models, frame counts, hard stops, preflight warnings, price and the review before publishing
// are the sheet's. What the sheet offers beyond this (uploaded start or end frames, starting from a saved frame,
// checkpoint retries) stays in the sheet.
import { app, getKeyRevision } from '../../lib/app.svelte.ts';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import { setupPlan } from '../../lib/rig/setup.ts';
import type { Project } from '../../lib/store/manifest.ts';
import type { StoredProject } from '../../lib/store/project.ts';
import { LocalizedError } from '../../lib/message.ts';
import { timeoutFor } from '../../lib/pixellab/client.ts';
import { routes } from '../../lib/pixellab/routes.ts';
import {
	agentMoveQuoteChanged,
	itemMoveOffer,
	missingItemMoves,
	reviewedMoveEquipment,
	moveMinimumTier,
	movePreflightWarnings,
	moveRigReady,
	readMoveCandidateImages,
	resolveMoveMotionSource,
	type MoveSpec
} from '../create.ts';
import { moveEstimate } from '../movePricing.ts';
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
	moveTemplateText,
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
	readCharacterMetadata,
	refreshMoveReviews,
	saveReviewedMove
} from '../state.svelte.ts';
import { AgentError, checkAbort, type Tool } from './contract.ts';
import { budget, rateUsd, withReservation } from './budget.ts';
import { fingerprintOf, receipts, startView, type MoveAdmission } from './receipts.ts';
import {
	paidPreflight,
	readSavedCharacter,
	ready,
	replayStart,
	requestIdArg,
	str
} from './toolSupport.ts';

const ACTIONS = promptSuggestionDefaults.move.flatMap(({ action }) => (action ? [action] : []));
const BUSY_KEYS = new Set([
	'moveSheet.alreadyQueued',
	'moveSheet.checkpoint.changed',
	'directionsSheet.waitForGeneration',
	'state.manageMovesInOtherTab'
]);
// Agents read canonical English, whatever language the person uses.
const refusal = (issue: LocalizedError) => {
	const { key } = issue.translation;
	return new AgentError(issue.message, BUSY_KEYS.has(key) ? 'busy' : 'invalid');
};

const DEMO_MOVE_REASON =
	'The demo is read-only, and copies of it cannot get moves. Use a character made with create_character.';
const quoteChanged = () => new AgentError(agentMoveQuoteChanged().message, 'busy');
const waitingReview = (id: string) =>
	new AgentError(
		`A review of "${id}" is waiting. Use render_frames with review true, then accept_move or discard_move first.`
	);

async function startPaidMove(
	projectId: string,
	spec: MoveSpec & { agentQuote: NonNullable<MoveSpec['agentQuote']> },
	kind: 'move' | 'equipment',
	price: NonNullable<MoveAdmission['price']>,
	args: Record<string, unknown>,
	credential: number,
	signal: AbortSignal
) {
	const { generations } = spec.agentQuote;
	const fingerprint = await fingerprintOf({ ...args, characterId: projectId });
	const receipt = await withReservation(
		`${kind} ${spec.id}`,
		generations,
		signal,
		async (check, id, finish, stillApproved) => {
			const r: MoveAdmission = {
				kind,
				id,
				characterId: projectId,
				moveId: spec.id,
				name: spec.id,
				targetId: spec.itemsOnly ? spec.items[0] : undefined,
				directions: spec.itemsOnly ? spec.dirs : undefined,
				requestId: args.requestId as string | undefined,
				fingerprint,
				generations,
				price,
				startedAt: new Date().toISOString(),
				outcome: 'queued'
			};
			const accepted = await queueAgentMove(
				projectId,
				{ ...spec, activityScope: id, agentAdmission: r },
				check,
				() => {
					stillApproved();
					if (getKeyRevision() !== credential || !app.key || app.keyRejected)
						throw agentMoveQuoteChanged();
				},
				finish
			);
			if (!accepted) throw quoteChanged();
			return receipts.add(r);
		}
	);
	return { data: startView(receipt, budget()) };
}

/** The character a move tool works on: the given id, else the open one. */
async function moveTarget(characterId: unknown) {
	await ready();
	const projectId = typeof characterId === 'string' && characterId ? characterId : doc.id;
	if (!projectId) throw new AgentError('No character is open.', 'not_ready');
	if (projectId.startsWith('fixture:')) throw new AgentError(DEMO_MOVE_REASON, 'unsupported');
	return projectId;
}

async function moveCharacter(projectId: string) {
	const { project, record } = await readSavedCharacter(projectId);
	if (!record) throw new AgentError('This character is not saved.', 'not_found');
	return { project, record };
}

type MoveReadiness = {
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
	if (demo) return { canAdd: false, code: 'unsupported', reason: DEMO_MOVE_REASON };
	if (moveRigReady(record)) return { canAdd: true, code: null, reason: null };
	let why: string | undefined;
	for (const reference of [undefined, ...project.manifest.rig.animations.map(({ id }) => id)]) {
		try {
			const { gens } = await setupPlan(project, reference);
			return {
				canAdd: false,
				code: 'needs_user',
				reason: `This character needs a one-time rig setup before it can get moves: about ${gens} generations (about $${rateUsd(gens).toFixed(2)}). Ask the user to open Add move and run Rig setup${reference ? `, selecting "${reference}" as the standing reference` : ''}. The Studio asks them to describe the character.`
			};
		} catch (error) {
			why ??= error instanceof Error ? error.message : 'Its body frames cannot be set up.';
		}
	}
	return {
		canAdd: false,
		code: 'unsupported',
		reason: `This character cannot get moves: ${why} Use a character made with create_character.`
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
export function reviewFacts(candidate: MoveCandidate) {
	return {
		moveId: candidate.spec.id,
		redraw: !!candidate.spec.replace,
		directions: candidate.dirs,
		frames: candidate.animation.cells,
		playback: candidate.animation.frames,
		loop: candidate.animation.loop,
		loopIntent: candidate.animation.moveLoop ?? null,
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

export async function reviewOf(candidate: MoveCandidate) {
	return { ...reviewFacts(candidate), candidateId: await candidateIdOf(candidate) };
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
		'Paid. Add a move (animation) to the base body of an editable character, as Add move does: a template action, a described move, or a redraw of chosen directions of a saved move. The character must be ready for moves (inspect_character addMove). A new move covers every drawn direction; equipment is not posed on it here. dryRun true returns the plan, warnings and price only. Follow the receipt with get_activity, look at it with render_frames review true, then call accept_move or discard_move with its candidateId.',
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
					'With redraw: the views to redraw (omit or use [] for those failing checks, else all). Mirrored directions follow their source.'
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
		const replay = await replayStart('move', args);
		if (replay) return replay;
		const projectId = await moveTarget(args.characterId);
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
		if (wanted?.length && !redraw && !drawn.every((d) => wanted.includes(d)))
			throw new AgentError(
				'A new move covers every drawn direction; directions applies only with redraw.',
				'unsupported'
			);

		// The form as the sheet opens on this choice: a picked template keeps its (Settings-customized) text.
		const offered = newMoveActions(m);
		const suggested = promptSuggestions('move').filter(
			(entry) => !entry.action || offered.includes(entry.action)
		);
		const templateText = (name: string) => moveTemplateText(name, suggested);
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
				? wanted?.length
					? (wanted as MoveFormChoices['dirs'])
					: redrawDirections(rec.rigQa, drawn, redraw)
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
		if (Object.hasOwn(context.reviews, form.id)) throw waitingReview(form.id);
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
					'PixelLab could not check this character’s skeleton. Try again shortly.',
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
			return {
				data: {
					started: false,
					...plan,
					...(preflight.length && !args.acceptWarnings ? { needs: 'acceptWarnings' } : {})
				}
			};
		const pending = await pendingBodyMoveName(projectId, form.id);
		const latest = await readCharacterMetadata(projectId);
		if (
			!latest ||
			moveRigVersion(latest) !== rigVersion ||
			Object.hasOwn(latest.moveReviews ?? {}, form.id) ||
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
		return startPaidMove(projectId, spec, 'move', plan, args, credential, signal);
	}
};

export const poseEquipmentTool: Tool = {
	name: 'pose_equipment',
	title: 'Pose equipment',
	description:
		'Paid. Fill missing frames for one saved item on a saved body move using the Studio equipment offer. Use dryRun for the estimate and get_activity to follow the start.',
	inputSchema: {
		type: 'object',
		properties: {
			characterId: str('Saved character id. Omit for the open character.'),
			itemId: str('Saved item id from inspect_character or accept_move.'),
			moveId: str('Saved move id from inspect_character.', 60),
			requestId: requestIdArg,
			dryRun: { type: 'boolean' }
		},
		required: ['itemId', 'moveId']
	},
	consequential: true,
	untrusted: true,
	async run(args, signal) {
		const replay = await replayStart('equipment', args);
		if (replay) return replay;
		const projectId = await moveTarget(args.characterId);
		const credential = getKeyRevision();
		const { record } = await moveCharacter(projectId);
		const { manifest } = record;
		const itemId = String(args.itemId),
			moveId = String(args.moveId);
		const item = manifest.items.find((item) => item.id === itemId);
		if (!item) throw new AgentError('No saved item with that id.', 'not_found');
		if (!manifest.rig.animations.some((move) => move.id === moveId))
			throw new AgentError('No saved move with that id.', 'not_found');
		const missing = missingItemMoves(manifest, itemId).find((move) => move.id === moveId);
		const dirs = missing?.dirs?.filter((dir) => item.dressed?.[dir]);
		if (!missing || !dirs?.length)
			throw new AgentError(
				'The Studio has no missing frames it can pose for this item and move.',
				'unsupported'
			);
		const { specs, gens } = itemMoveOffer(manifest, [{ ...missing, dirs }]);
		if (gens === null)
			throw new AgentError(
				'The Studio could not price this equipment pose. Review the item in the Studio.',
				'unsupported'
			);
		const spec = specs[0];
		const generations = Math.ceil(gens);
		const minimumTier = moveMinimumTier(manifest, spec);
		const plan = {
			itemId,
			moveId,
			directions: spec.dirs ?? [],
			generations,
			minimumTier,
			approxUsd: Math.round(rateUsd(generations) * 100) / 100
		};
		if (args.dryRun) return { data: { started: false, ...plan } };
		if (Object.hasOwn(record.moveReviews ?? {}, moveId)) throw waitingReview(moveId);
		if (await pendingBodyMoveName(projectId, moveId)) throw quoteChanged();
		paidPreflight(minimumTier);
		return startPaidMove(
			projectId,
			{ ...spec, agentQuote: { rigVersion: moveRigVersion(record), generations } },
			'equipment',
			plan,
			args,
			credential,
			signal
		);
	}
};

export const moveReviewTools: Tool[] = [true, false].map((accept): Tool => ({
	name: accept ? 'accept_move' : 'discard_move',
	title: accept ? 'Accept move review' : 'Discard move review',
	description: accept
		? 'Save the move review you looked at (render_frames review true) to its character. equipmentToPose lists items the Studio can pose on the new move, also available through pose_equipment.'
		: 'Discard the move review you looked at. Generations already used stay spent.',
	inputSchema: {
		type: 'object',
		properties: {
			characterId: str('Character id from the activity receipt. Omit for the open character.'),
			moveId: str('The move id reported by add_move.', 60),
			candidateId: str('The candidateId from render_frames (review true).', 40)
		},
		required: ['moveId', 'candidateId']
	},
	consequential: true,
	untrusted: true,
	async run(args, signal) {
		const projectId = await moveTarget(args.characterId);
		const { record } = await moveCharacter(projectId);
		const moveId = String(args.moveId);
		const candidate = reviewFor(record, moveId);
		const { candidateId } = await reviewOf(candidate);
		if (candidateId !== args.candidateId)
			throw new AgentError(
				`The review of "${moveId}" changed. Look at it with render_frames review true first.`,
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
		const equipmentToPose = reviewedMoveEquipment(project.manifest, candidate).flatMap(
			({ item, offer }) => (offer?.specs.length ? [item.id] : [])
		);
		return { data: { ...data, outcome: 'saved', equipmentToPose } };
	}
}));
