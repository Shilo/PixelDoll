// Agent tools for moves. add_move builds its request with the Add move sheet's own form plan (moveForm.ts) and queues it
// with queueMoves, so ids, models, frame counts, hard stops, preflight warnings, price and the review before publishing
// are the sheet's. What the sheet offers beyond this (uploaded start or end frames, starting from a saved frame,
// checkpoint retries) stays in the sheet.
import { app } from '../../lib/app.svelte.ts';
import { LocalizedError } from '../../lib/message.ts';
import type { Project } from '../../lib/store/manifest.ts';
import type { StoredProject } from '../../lib/store/project.ts';
import * as db from '../../lib/store/db.ts';
import {
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
import { doc, moving, pendingMoves, queueMoves, settingUp, store } from '../state.svelte.ts';
import { AgentError, type JsonSchema, type Tool } from './contract.ts';
import { budget, rateUsd, release } from './budget.ts';

/** The shared steps of every tool, owned by tools.ts. */
export interface MoveToolHelpers {
	/** Opens (if needed) and returns the character the tool works on. */
	character(id: unknown): Promise<Project>;
	/** Refuses a paid start without a connection, in a follower tab, or below the plan tier. */
	paidPreflight(minimumTier: number): void;
	/** Reserves generations from the approved budget or refuses with code budget. */
	reserveOrRefuse(what: string, generations: number): void;
}

const ACTIONS = promptSuggestionDefaults.move.flatMap(({ action }) => (action ? [action] : []));
const BUSY_KEYS = new Set(['moveSheet.alreadyQueued', 'moveSheet.checkpoint.ready']);
const refusal = (issue: LocalizedError) =>
	new AgentError(issue.message, BUSY_KEYS.has(issue.translation.key) ? 'busy' : 'invalid');
const str = (description: string, maxLength = 200): JsonSchema => ({
	type: 'string',
	description,
	maxLength
});

export function moveTools(h: MoveToolHelpers): Tool[] {
	return [
		{
			name: 'add_move',
			title: 'Add move',
			description:
				'Paid. Add a move (animation) to the base body of an editable character, as Add move does: a template action, a described move, or a redraw of chosen directions of a saved move. A new move covers every drawn direction; equipment is not posed on it here. dryRun true returns the plan, warnings and price only. The move runs in the background (get_activity "move") and then waits in move review, where the user accepts it in the Studio.',
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
						description:
							'Generate past preflight warnings a dry run returned (the user should agree).'
					},
					dryRun: { type: 'boolean' }
				}
			},
			consequential: true,
			async run(args, signal) {
				const p = await h.character(args.characterId);
				if (doc.id.startsWith('fixture:'))
					throw new AgentError(
						'The demo is read-only. Call copy_demo_character first.',
						'unsupported'
					);
				const projectId = doc.id,
					m = p.manifest;
				const rec = await db.get<StoredProject>('projects', projectId);
				if (!rec) throw new AgentError('This character is not saved.', 'not_found');
				if (!moveRigReady({ ...rec, manifest: m }))
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
					reviews: store.moveReviews
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
				let source: MoveSpec['motionSource'] = 'standalone';
				if (form.managedId && app.key && !app.keyRejected)
					try {
						source = await resolveMoveMotionSource(app.key, form.managedId, signal);
					} catch (error) {
						throw new AgentError(
							`PixelLab could not be checked for this character's skeleton: ${error instanceof Error ? error.message : String(error)}`,
							'not_ready'
						);
					}
				const motion = moveFormMotion(form, source);
				const name = (id: string) => id;
				const issue = moveFormIssue(form, motion, {
					manifest: m,
					record: rec,
					replaceSelected: choices.replaceSelected,
					templatePicked: choices.templatePicked,
					reviews: store.moveReviews,
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
				if (settingUp.spec && !settingUp.done)
					throw new AgentError(
						'Rig setup is running for a character. Wait for it to finish.',
						'busy'
					);
				if (moving.repairReview)
					throw new AgentError(
						'A move repair is waiting for review in the Add move sheet. Ask the user to finish it first.',
						'needs_user'
					);
				h.paidPreflight(minimumTier);
				const what = `move ${form.id}`;
				h.reserveOrRefuse(what, generations);
				const spec = moveRequestSpec(form, motion, {
					seed: moveSeed(),
					acceptedWarnings: preflight.map((w) => w.id)
				});
				const ours = (s: MoveSpec | null) => !!s && s.id === spec.id && s.seed === spec.seed;
				try {
					// queueMoves runs a started move to its end; its refusals are synchronous toasts, seen by the check below.
					const run = queueMoves(projectId, [spec]);
					await Promise.race([run, new Promise((resolve) => setTimeout(resolve, 0))]);
				} catch (error) {
					if (!pendingMoves(projectId).some(ours)) release(what, generations);
					throw error;
				}
				if (!pendingMoves(projectId).some(ours)) {
					release(what, generations);
					throw new AgentError('The move did not start. Check get_activity.', 'busy');
				}
				return {
					data: {
						started: true,
						status: ours(moving.spec) ? 'running' : 'queued',
						heldByFailedMove: !ours(moving.spec) && !!moving.error,
						next: 'Follow it with get_activity (move). When it finishes it waits in move review for the user to accept in the Studio.',
						...plan,
						budget: budget()
					}
				};
			}
		}
	];
}
