// Agent tools for moves. add_move builds its request with the Add move sheet's own form plan (moveForm.ts) and queues it
// through the Studio move queue, so ids, models, frame counts, hard stops, preflight warnings, price and the review before publishing
// are the sheet's. What the sheet offers beyond this (uploaded start or end frames, starting from a saved frame,
// checkpoint retries) stays in the sheet.
import { app, getKeyRevision } from '../../lib/app.svelte.ts';
import { LocalizedError } from '../../lib/message.ts';
import { timeoutFor } from '../../lib/pixellab/client.ts';
import { routes } from '../../lib/pixellab/routes.ts';
import {
	agentMoveQuoteChanged,
	moveMinimumTier,
	movePreflightWarnings,
	moveRigReady,
	resolveMoveMotionSource,
	type MoveSpec
} from '../create.ts';
import { moveEstimate } from '../movePricing.ts';
import { moveTemplatePrompt } from '../moveAnimationOptions.ts';
import { moveModels, openingCreationSettings } from '../creationSettings.ts';
import { promptSuggestionDefaults } from '../promptSuggestionDefaults.ts';
import { promptSuggestions } from '../promptSuggestions.svelte.ts';
import { moveRigVersion } from '../replaceMove.ts';
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
	readCharacterMetadata,
	refreshMoveReviews,
	saveReviewedMove
} from '../state.svelte.ts';
import { AgentError, checkAbort, type Tool } from './contract.ts';
import { budget, rateUsd, withReservation } from './budget.ts';
import { fingerprintOf, receipts, startView } from './receipts.ts';
import { jobError } from './jobError.ts';
import {
	forgetReceipt,
	loadReceipts,
	paidPreflight,
	readSavedCharacter,
	ready,
	recordReceipt,
	requestIdArg,
	str
} from './toolSupport.ts';

const ACTIONS = promptSuggestionDefaults.move.flatMap(({ action }) => (action ? [action] : []));
const BUSY_KEYS = new Set(['moveSheet.alreadyQueued', 'moveSheet.checkpoint.ready']);
const refusal = (issue: LocalizedError) =>
	new AgentError(issue.message, BUSY_KEYS.has(issue.translation.key) ? 'busy' : 'invalid');

async function moveCharacter(characterId: unknown) {
	await ready();
	const projectId = typeof characterId === 'string' && characterId ? characterId : doc.id;
	if (!projectId) throw new AgentError('No character is open.', 'not_ready');
	if (projectId.startsWith('fixture:'))
		throw new AgentError('The demo is read-only. Call copy_demo_character first.', 'unsupported');
	const { project, record } = await readSavedCharacter(projectId);
	if (!record) throw new AgentError('This character is not saved.', 'not_found');
	return { projectId, project, record };
}

export const addMoveTool: Tool = {
	name: 'add_move',
	title: 'Add move',
	description:
		'Paid. Add a move (animation) to the base body of an editable character, as Add move does: a template action, a described move, or a redraw of chosen directions of a saved move. A new move covers every drawn direction; equipment is not posed on it here. dryRun true returns the plan, warnings and price only. The move runs in the background. Follow the receipt with wait_for_activity, then review it before calling accept_move or discard_move.',
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
		const { projectId, project: p, record: rec } = await moveCharacter(args.characterId);
		const fingerprint = fingerprintOf({ ...args, characterId: projectId });
		if (!args.dryRun && args.requestId) await loadReceipts();
		const earlier = args.dryRun ? undefined : receipts.repeat('move', args.requestId, fingerprint);
		if (earlier) return { data: startView(earlier, budget(), true) };
		const m = p.manifest;
		const rigVersion = moveRigVersion(rec);
		if (!moveRigReady(rec))
			throw new AgentError(
				'This character is not set up for moves. Ask the user to open Add move in the Studio once.',
				'needs_user'
			);
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
			choices.text = loopedText(choices.text, choices.action, was, args.loop);
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
			return { data: { started: false, ...plan } };
		const pending = await pendingBodyMoveName(projectId, form.id);
		const latest = await readCharacterMetadata(projectId);
		const quoteChanged = () => new AgentError(agentMoveQuoteChanged().message, 'busy');
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
		const receipt = await withReservation(
			`move ${form.id}`,
			generations,
			signal,
			async (check, id, finish, stillApproved) => {
				const r = await recordReceipt({
					kind: 'move',
					id,
					characterId: projectId,
					moveId: form.id,
					name: form.id,
					requestId: args.requestId as string | undefined,
					fingerprint,
					generations,
					price: plan,
					startedAt: new Date().toISOString(),
					outcome: 'queued'
				});
				try {
					const accepted = queueAgentMove(
						projectId,
						{ ...spec, activityScope: id },
						check,
						() => {
							stillApproved();
							if (getKeyRevision() !== credential || !app.key || app.keyRejected)
								throw agentMoveQuoteChanged();
						},
						(next, error) => {
							receipts.settle(r, next, jobError(error) ?? undefined);
							if (next !== 'running') finish();
							void recordReceipt(r).catch(() => console.error('Could not save the move receipt'));
						}
					);
					if (!accepted) throw quoteChanged();
					return r;
				} catch (error) {
					await forgetReceipt(r);
					throw error;
				}
			}
		);
		return { data: startView(receipt, budget()) };
	}
};

export const moveReviewTools: Tool[] = [true, false].map((accept): Tool => ({
	name: accept ? 'accept_move' : 'discard_move',
	title: accept ? 'Accept move review' : 'Discard move review',
	description: accept
		? 'Save a finished body move review to its character. Equipment posing is a separate step.'
		: 'Discard a finished body move review. Generations already used stay spent.',
	inputSchema: {
		type: 'object',
		properties: {
			characterId: str('Character id from the activity receipt. Omit for the open character.'),
			moveId: str('The move id reported by add_move.', 60)
		},
		required: ['moveId']
	},
	consequential: true,
	async run(args, signal) {
		const { projectId, record } = await moveCharacter(args.characterId);
		const moveId = String(args.moveId);
		const candidate = Object.hasOwn(record.moveReviews ?? {}, moveId)
			? record.moveReviews![moveId]
			: undefined;
		if (!candidate) throw new AgentError('No finished review for this move.', 'not_found');
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
		return { data: { characterId: projectId, moveId, outcome: accept ? 'saved' : 'discarded' } };
	}
}));
