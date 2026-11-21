import { specSlot } from '../lib/items/slots.ts';
// Offline explanations only. These never encode images, submit work or invent dependent payloads.
import { routes, type Req } from '../lib/pixellab/routes.ts';
import {
	type CreateSpec,
	type MoveSpec,
	bodyAction,
	bodyMoveIssue,
	partialMoveFrameIssue,
	creationLooks,
	drawRequest,
	estimate,
	isAuthoredAction,
	moveDirections,
	moveFrames,
	moveAnimationModel,
	moveMotionFrames,
	moveMotionGens,
	moveMotionRequest,
	nativeMoveGens,
	nativeMoveRequest,
	PRO_RECEIPTS,
	proDrawGens
} from './create.ts';
import { poseBatches, poseCallGens } from '../lib/rig/clips.ts';
import {
	gridEstimate,
	repairGridLayout,
	repairGridPlan,
	frozenGrid,
	planItem,
	planAnchoredMove,
	itemPrompt,
	planGens,
	padOf,
	dressItem,
	type ItemSpec
} from '../lib/items/items.ts';
import type { Draft, RigCtx } from '../lib/items/run.ts';
import { itemMethod, newItemSpec, type NewItemInput } from './itemRoute.ts';
import type { StoredProject } from '../lib/store/project.ts';
import type { SetupPlan } from '../lib/rig/setup.ts';
import type { JobRec } from '../lib/pixellab/queue.ts';
import { characterId } from '../lib/pixellab/library.ts';
import { hasCompleteCells } from '../lib/dress/dress.ts';
import type { DirectionName } from '../lib/rig/rig.ts';
import type { Translate } from 'svelte-whisper';

export interface PeekCall {
	method: Req['method'];
	path: string;
	body?: unknown;
	label?: string;
	background?: boolean;
	generations?: number;
	note?: string;
}
export interface PlanDisplayContext {
	t: Translate;
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
	displayDirection: (direction: DirectionName) => string;
}

/**
 * Display-only translations for a planned call. The call's own `label` and `note`
 * stay the exact English text that the copied JSON carries, so showing a plan in
 * another language never changes what a person copies.
 */
type PlanFormatter = (context: PlanDisplayContext) => string;
type PlanText = { label?: PlanFormatter; note?: PlanFormatter };
const planTexts = new WeakMap<PeekCall, PlanText>();
function shown<T extends PeekCall>(call: T, label?: PlanFormatter, note?: PlanFormatter): T {
	if (label || note) planTexts.set(call, { label, note });
	return call;
}
export const planDisplay = (call: PeekCall): PlanText | undefined => planTexts.get(call);

const dependent =
	'Payload unavailable until the preceding result is ready. Actual sent data is shown when available.';
const selectedSeed = 'A fresh seed is selected when you run this action.';
const dependentText = (t: Translate) => t('apiPeek.plan.dependent');
const selectedSeedText = (t: Translate) => t('apiPeek.plan.selectedSeed');
const knownSelectedSeedText = (t: Translate) =>
	t('apiPeek.plan.knownSelectedSeed', { seed: selectedSeedText(t) });
const proPriceNote = (size: number) => {
	const { lo, hi } = proDrawGens(size);
	const receipts = PRO_RECEIPTS.map((r) => `${r.gens} gens at ${r.size} px`).join(' and ');
	const [first, second] = PRO_RECEIPTS;
	const text = `Pro has no price quote: about ${lo === hi ? lo : `${lo}–${hi}`} gens at ${size} px, estimated from receipts of ${receipts}.`;
	const display: PlanFormatter = ({ t, formatNumber }) =>
		t('apiPeek.plan.proPrice', {
			range: lo === hi ? formatNumber(lo) : `${formatNumber(lo)}–${formatNumber(hi)}`,
			size: formatNumber(size),
			firstGens: formatNumber(first.gens),
			firstSize: formatNumber(first.size),
			secondGens: formatNumber(second.gens),
			secondSize: formatNumber(second.size)
		});
	return { text, display };
};
const lifecycle = (): PeekCall[] => [
	shown(
		{
			method: 'GET',
			path: '/background-jobs/{job_id}',
			label: 'Check generation progress',
			background: true,
			note: 'Repeated for each returned job ID; no generation is submitted by polling.'
		},
		({ t }) => t('apiPeek.plan.checkProgress'),
		({ t }) => t('apiPeek.plan.checkProgressNote')
	),
	shown(
		{
			method: 'GET',
			path: '{result image URL}',
			label: 'Download result images',
			background: true,
			note: 'Only when PixelLab returns image URLs. No account token is sent to artwork URLs.'
		},
		({ t }) => t('apiPeek.plan.downloadResults'),
		({ t }) => t('apiPeek.plan.downloadResultsNote')
	),
	shown(
		{
			method: 'GET',
			path: '/balance',
			label: 'Update account balance',
			background: true,
			note: 'Runs after jobs settle.'
		},
		({ t }) => t('apiPeek.plan.updateBalance'),
		({ t }) => t('apiPeek.plan.updateBalanceNote')
	)
];
export const balancePlan = (): PeekCall[] => [
	shown(
		{
			method: 'GET',
			path: '/balance',
			label: 'Read account balance',
			note: 'No generation request. Your key is sent as authorization and is never included in this view.'
		},
		({ t }) => t('apiPeek.plan.readBalance'),
		({ t }) => t('apiPeek.plan.readBalanceNote')
	)
];
export const libraryPlan = (offset = 0): PeekCall[] => [
	shown(
		{
			method: 'GET',
			path: `/characters?limit=20&offset=${offset}`,
			label: 'List your characters',
			note: 'Account-authorized read; no generations. Preview thumbnails may also download from returned artwork URLs without your token.'
		},
		({ t }) => t('apiPeek.plan.listCharacters'),
		({ t }) => t('apiPeek.plan.listCharactersNote')
	)
];
export function characterZipPlan(value: string): PeekCall[] {
	let id = '';
	try {
		id = characterId(value);
	} catch {
		/* Invalid input cannot send a request. Show the route pattern. */
	}
	return [
		shown(
			{
				method: 'GET',
				path: id ? `/characters/${id}/zip` : '/characters/{character_id}/zip',
				label: 'Download character ZIP',
				note: 'Requires a valid character UUID or PixelLab creator link. Public download without an account token; no generations. The ZIP is inspected and saved locally.'
			},
			({ t }) => t('apiPeek.plan.downloadZip'),
			({ t }) => t('apiPeek.plan.downloadZipNote')
		)
	];
}

export function createPlan(spec: CreateSpec, freshSeed = false): PeekCall[] {
	const seed = freshSeed ? undefined : spec.seed;
	const view = spec.view ?? 'low top-down',
		looks = creationLooks(spec),
		pro = spec.model === 'pro' ? proPriceNote(spec.size) : undefined,
		frame = spec.frame ?? 64;
	const calls: PeekCall[] = [
		shown(
			{
				...drawRequest(
					spec.reference
						? { ...spec, reference: { ...spec.reference, base64: '[uploaded artwork]' } }
						: spec,
					seed
				),
				label: 'Create base character',
				generations: +(estimate(spec).gens - 0.25).toFixed(2),
				...(freshSeed || pro
					? {
							note: [freshSeed ? `Known fields only. ${selectedSeed}` : '', pro?.text ?? '']
								.filter(Boolean)
								.join(' ')
						}
					: {})
			},
			({ t }) => t('apiPeek.plan.createBase'),
			freshSeed || pro
				? (context) =>
						[freshSeed ? knownSelectedSeedText(context.t) : '', pro?.display(context) ?? '']
							.filter(Boolean)
							.join(' ')
				: undefined
		),
		shown(
			{
				method: 'POST',
				path: '/create-character-v3',
				label: 'Register padded standing views',
				generations: 0.25,
				body: {
					description: looks,
					n_directions: 8,
					view,
					template_id: 'mannequin',
					...(seed === undefined ? {} : { seed }),
					no_background: true
				},
				note: `Known fields only. ${dependent} Adds all eight original standing views as reference_image and direction_images, padded to ${frame} px without rescaling.`
			},
			({ t }) => t('apiPeek.plan.registerPadded'),
			({ t, formatNumber }) =>
				t('apiPeek.plan.registerPaddedNote', {
					dependent: dependentText(t),
					frame: formatNumber(frame)
				})
		),
		shown(
			{
				method: 'GET',
				path: '/characters/{character_id}',
				label: 'Read standing skeletons',
				note: 'Character ID comes from registration. Cached when available. Missing standing joints conditionally add POST /estimate-skeleton at 0.1 gen per uncached standing image. Idle, walk and other moves are added later from Moves.'
			},
			({ t }) => t('apiPeek.plan.readSkeletons'),
			({ t }) => t('apiPeek.plan.readSkeletonsNote')
		)
	];
	return [...calls, ...lifecycle()];
}

function itemCalls(
	spec: Pick<ItemSpec, 'prompt' | 'key' | 'slot' | 'slotConfig' | 'method'>,
	calls: { kind?: string; cells: string[]; seed?: number; concept?: boolean }[],
	cell?: { w: number; h: number }
): PeekCall[] {
	const pad = padOf(specSlot(spec), spec.method, cell);
	return calls.map((call, index) => {
		if (call.kind === 'grid') {
			return shown(
				{
					method: 'POST',
					path: '/inpaint-v3',
					label: `Dress frozen frames · ${call.cells.length} frames`,
					...(cell
						? {
								generations: gridEstimate(
									{ w: cell.w + 2 * pad, h: cell.h + 2 * pad },
									call.cells.length,
									1
								).gens
							}
						: {}),
					note: 'Automatic alternative to suspicious imported joints. Sends frozen body frames, editable garment masks and one protected matching-view standing reference. Each planned batch runs once. Quality checks never request a paid retry or repair without your action.'
				},
				({ t }) => t('apiPeek.plan.dressFrozen', { count: call.cells.length }),
				({ t }) => t('apiPeek.plan.dressFrozenNote')
			);
		}
		const pose = call.kind === 'pose',
			anchor = index > 0 && !pose ? calls[0].cells[0] : undefined,
			action = pose
				? 'Pose equipment'
				: call.kind === 'dress'
					? 'Dress standing views'
					: 'Edit packed frames',
			actionText = (t: Translate) =>
				t(
					pose
						? 'apiPeek.plan.poseEquipment'
						: call.kind === 'dress'
							? 'apiPeek.plan.dressStanding'
							: 'apiPeek.plan.editPacked'
				);
		return shown(
			{
				method: 'POST',
				path: pose ? '/animate-with-skeleton-v3' : '/edit-animation-v2',
				label: `${action} · ${call.cells.length} frames`,
				...(pose
					? {}
					: {
							body: {
								description: itemPrompt(
									dressItem(spec),
									spec.key,
									call.cells,
									anchor,
									call.concept
								),
								...(call.seed === undefined ? {} : { seed: call.seed }),
								...(cell
									? { image_size: { width: cell.w + 2 * pad, height: cell.h + 2 * pad } }
									: {}),
								no_background: true
							}
						}),
				generations: planGens(
					[{ kind: pose ? 'pose' : 'edit', cells: call.cells }],
					cell && { w: cell.w + 2 * pad, h: cell.h + 2 * pad }
				),
				note: `Known fields only. ${pose ? 'Sends the dressed reference image, exact stored poses, appearance, action, direction and seed.' : 'Frames and image_size are prepared on submission.'} ${call.concept ? 'The uploaded artwork goes first, before the character frames. Its output is not used.' : !pose && !anchor && call.cells.length === 1 ? 'The single input is duplicated for the two-frame API minimum; only the first returned frame is used.' : ''} ${call.seed === undefined ? selectedSeed : ''} Coverage: ${call.cells.join(', ')}.`
			},
			({ t }) =>
				t('apiPeek.plan.actionFrames', { action: actionText(t), count: call.cells.length }),
			({ t }) =>
				[
					t(pose ? 'apiPeek.plan.itemPoseNote' : 'apiPeek.plan.itemEditNote'),
					call.concept
						? t('apiPeek.plan.conceptNote')
						: !pose && !anchor && call.cells.length === 1
							? t('apiPeek.plan.singleInput')
							: '',
					call.seed === undefined ? selectedSeedText(t) : '',
					t('apiPeek.plan.coverage', { cells: call.cells.join(', ') })
				]
					.filter(Boolean)
					.join(' ')
		);
	});
}
export function itemPlan(ctx: RigCtx | null, input: NewItemInput): PeekCall[] {
	if (!ctx) return [];
	try {
		const spec = newItemSpec(ctx, input);
		const method = itemMethod(ctx, spec);
		const calls = planItem(ctx.rec.manifest.rig, { ...spec, method });
		return [
			...itemCalls(
				{ ...spec, method },
				calls.map((call, index) => ({ ...call, concept: index === 0 && !!spec.reference })),
				ctx.rec.manifest.rig.cell
			),
			...lifecycle()
		];
	} catch {
		return [];
	}
}
export const draftPlan = (draft: Draft): PeekCall[] => [
	...itemCalls(
		draft.spec,
		draft.calls.map((call) => ({ ...call, seed: undefined }))
	),
	...lifecycle()
];
export const draftQueueIds = (draft: Draft): string[] =>
	draft.calls.flatMap((call) => [...(call.recId ? [call.recId] : []), ...call.old]);

export function movePlan(
	rec: Pick<StoredProject, 'manifest' | 'character'> | null,
	spec: Omit<MoveSpec, 'seed'> & { seed?: number }
): PeekCall[] {
	if (!rec || spec.reuseItemFrames) return [];
	const m = rec.manifest,
		bodyNeeded =
			spec.itemMethod !== 'grid' &&
			(spec.replace || !m.rig.animations.some((a) => a.id === spec.id)),
		calls: PeekCall[] = [],
		frames = moveFrames(m, spec),
		model = moveAnimationModel(spec),
		poseRig = bodyNeeded
			? { ...m.rig, animations: m.rig.animations.filter((animation) => animation.id !== spec.id) }
			: m.rig;
	const generatedDirections = moveDirections(m, spec.dirs);
	if (bodyNeeded) {
		if (bodyMoveIssue(m, spec) || partialMoveFrameIssue(m, spec, generatedDirections.length))
			return [];
		const authored = isAuthoredAction(spec.action);
		for (const direction of generatedDirections) {
			if (model !== 'skeleton-v3' || !authored) {
				const native = model !== 'skeleton-v3';
				calls.push(
					shown(
						{
							...(native
								? nativeMoveRequest(
										rec,
										spec,
										direction,
										model,
										spec.startFrom
											? `[${spec.startFrom.clip}${spec.startFrom.cell === undefined ? '' : `, frame ${spec.startFrom.cell + 1}`} artwork]`
											: '[standing artwork]'
									)
								: moveMotionRequest(rec, spec, direction)),
							label: `Create motion · ${direction}`,
							generations: native
								? nativeMoveGens(model, m.rig.cell, frames)
								: moveMotionGens(m, spec),
							note: spec.seed === undefined ? `Known fields only. ${selectedSeed}` : undefined
						},
						({ t, displayDirection }) =>
							t('apiPeek.plan.createMotion', { direction: displayDirection(direction) }),
						spec.seed === undefined ? ({ t }) => knownSelectedSeedText(t) : undefined
					)
				);
				for (let frame = 0; !native && frame < moveMotionFrames(m, spec); frame++)
					calls.push(
						shown(
							{
								method: 'POST',
								path: '/estimate-skeleton',
								label: `${spec.id} ${direction} · motion frame ${frame + 1}`,
								generations: 0.1,
								note: 'Sends the generated motion frame as image (base64 PNG), unless already measured.'
							},
							({ t, formatNumber, displayDirection }) =>
								t('apiPeek.plan.motionFrame', {
									move: spec.id,
									direction: displayDirection(direction),
									frame: formatNumber(frame + 1)
								}),
							({ t }) => t('apiPeek.plan.measureMotionNote')
						)
					);
			}
			if (model === 'skeleton-v3')
				calls.push(
					shown(
						{
							method: 'POST',
							path: '/animate-with-skeleton-v3',
							label: `${spec.id} ${direction} · render body`,
							generations: poseCallGens(frames),
							body: {
								description: rec.character?.looks,
								action: bodyAction(spec),
								direction,
								view: m.rig.view ?? 'low top-down',
								...(spec.seed === undefined ? {} : { seed: spec.seed + 101 }),
								no_background: true
							},
							note: `Known fields only. Adds ${spec.startFrom ? 'the selected starting frame as' : 'Standing as'} first_frame, first_frame_keypoints and ${authored ? 'locally authored' : 'generated motion'} keypoints. One render is submitted. Empty or malformed output stops for review without another paid attempt.`
						},
						({ t, displayDirection }) =>
							t('apiPeek.plan.renderBody', {
								move: spec.id,
								direction: displayDirection(direction)
							}),
						({ t }) =>
							`${t('moveSheet.startFrom.label')}: ${
								spec.startFrom?.replacement
									? t('moveSheet.startFrom.savedSource')
									: spec.startFrom
										? spec.startFrom.clip +
											(spec.startFrom.cell === undefined
												? ''
												: ` (${t('moveSheet.startFrom.frame', { number: spec.startFrom.cell + 1 })})`)
										: t('moveNames.default')
							}. ${t('apiPeek.plan.renderBodyNote', {
								source: t(
									authored ? 'apiPeek.plan.locallyAuthored' : 'apiPeek.plan.generatedMotion'
								)
							})}`
					)
				);
			for (let frame = 0; frame < frames; frame++)
				calls.push(
					shown(
						{
							method: 'POST',
							path: '/estimate-skeleton',
							label: `${spec.id} ${direction} · check frame ${frame + 1}`,
							generations: 0.1,
							note: 'Sends the rendered body frame as image (base64 PNG), unless already measured.'
						},
						({ t, formatNumber, displayDirection }) =>
							t('apiPeek.plan.checkFrame', {
								move: spec.id,
								direction: displayDirection(direction),
								frame: formatNumber(frame + 1)
							}),
						({ t }) => t('apiPeek.plan.measureBodyNote')
					)
				);
		}
	}
	for (const item of m.items.filter((item) => spec.items.includes(item.id))) {
		const missingDirs = generatedDirections.filter(
			(d) =>
				item.dressed?.[d] &&
				(spec.replace || spec.itemMethod === 'grid' || !hasCompleteCells(m, item, spec.id, d))
		);
		if (spec.itemMethod === 'anchor') {
			for (const call of planAnchoredMove(m.rig, item, spec.id, missingDirs))
				calls.push(
					shown(
						{
							method: 'POST',
							path: '/edit-animation-v2',
							label: `${item.name} · ${call.cells.join(', ')}`,
							generations: planGens([call], m.rig.cell),
							note: `Edits only frozen equipment frames, with the saved standing design as the first reference frame. Its returned reference is discarded. Coverage: ${call.cells.join(', ')}. No body or skeleton requests. Each planned batch runs once; paid retries need another request.`
						},
						({ t }) =>
							t('apiPeek.plan.itemCells', { item: item.name, cells: call.cells.join(', ') }),
						({ t }) => t('apiPeek.plan.anchorNote', { cells: call.cells.join(', ') })
					)
				);
			continue;
		}
		for (const direction of missingDirs) {
			if (spec.itemMethod === 'grid') {
				for (const batch of repairGridPlan(
					item.layers[0]?.cell ?? m.rig.cell,
					frames,
					spec.preferTierOneRepair,
					spec.redrawItem
				))
					calls.push(
						shown(
							{
								method: 'POST',
								path: spec.redrawItem ? '/edit-images-v2' : '/inpaint-v3',
								label: `${item.name} ${direction} · ${spec.redrawItem ? 'redraw' : 'repair'} equipment`,
								generations: batch.gens,
								note: `${batch.w}×${batch.h}, frames ${batch.start + 1}–${batch.start + batch.count}. ${spec.redrawItem ? `Sends an unmasked sheet with a matching reference. PixelDoll limits what it keeps and always asks before replacing your frames. PixelDoll requires Tier 1. If billed in dollars, the minimum is ${batch.gens === 10 ? '$0.080' : batch.gens === 15 ? '$0.115' : '$0.150'}; the actual charge may be higher.` : 'Uses one protected matching-direction reference. The body remains unchanged. Complete repairs with blocking visual issues are held for your review.'}`
							},
							({ t, displayDirection }) =>
								t(
									spec.redrawItem ? 'apiPeek.plan.redrawEquipment' : 'apiPeek.plan.repairEquipment',
									{ item: item.name, direction: displayDirection(direction) }
								),
							({ t, formatNumber }) => {
								const range = {
									width: formatNumber(batch.w),
									height: formatNumber(batch.h),
									from: formatNumber(batch.start + 1),
									to: formatNumber(batch.start + batch.count)
								};
								return spec.redrawItem
									? t('apiPeek.plan.redrawEquipmentNote', {
											...range,
											minimum: formatNumber(
												batch.gens === 10 ? 0.08 : batch.gens === 15 ? 0.115 : 0.15,
												{
													style: 'currency',
													currency: 'USD',
													minimumFractionDigits: 3,
													maximumFractionDigits: 3,
													useGrouping: false
												}
											)
										})
									: t('apiPeek.plan.gridRepairNote', range);
							}
						)
					);
			} else
				for (const batch of poseBatches(frames)) {
					const cells = Array.from(
						{ length: batch.count },
						(_, i) => `${spec.id}/${direction}/${batch.start + i}`
					);
					const grid = frozenGrid(poseRig, item, cells);
					calls.push(
						shown(
							{
								method: 'POST',
								path: grid ? '/inpaint-v3' : '/animate-with-skeleton-v3',
								label: `${item.name} ${direction} · frames ${batch.start + 1}–${batch.start + batch.count}`,
								generations: grid
									? repairGridLayout(item.layers[0]?.cell ?? m.rig.cell, batch.count, 1).gens
									: planGens([{ kind: 'pose', cells }]),
								note: grid
									? 'Dresses the frozen body frames instead of following suspicious imported joints. Protected standing references and garment masks preserve the design. One attempt per planned batch; any paid retry requires your action.'
									: 'Sends this item’s dressed reference, stored base rest keypoints and selected move poses, appearance, action, direction and seed. One attempt per planned batch; any paid retry or repair requires your action.'
							},
							({ t, formatNumber, displayDirection }) =>
								t('apiPeek.plan.framesRange', {
									item: item.name,
									direction: displayDirection(direction),
									from: formatNumber(batch.start + 1),
									to: formatNumber(batch.start + batch.count)
								}),
							({ t }) => t(grid ? 'apiPeek.plan.gridBatchNote' : 'apiPeek.plan.poseBatchNote')
						)
					);
				}
		}
	}
	return [...calls, ...lifecycle()];
}
export function setupPeekPlan(plan: SetupPlan | null, looks: string): PeekCall[] {
	if (!plan) return [];
	return [
		...[...plan.frames.keys()].map((hash, index): PeekCall =>
			shown(
				{
					method: 'POST',
					path: '/estimate-skeleton',
					label: `Measure body frame ${index + 1} of ${plan.frames.size}`,
					generations: 0.1,
					note: `Sends existing frame ${hash} as image (base64 PNG). Matching saved measurements are reused.`
				},
				({ t, formatNumber }) =>
					t('apiPeek.plan.measureBodyFrame', {
						frame: formatNumber(index + 1),
						total: formatNumber(plan.frames.size)
					}),
				({ t }) => t('apiPeek.plan.measureFrameNote', { hash })
			)
		),
		shown(
			{
				method: 'POST',
				path: '/create-character-v3',
				label: 'Register existing standing views',
				generations: 0.25,
				body: {
					description: looks.trim(),
					n_directions: plan.registrationDirections,
					template_id: 'mannequin',
					no_background: true
				},
				note: `Known fields only. Existing standing reference images and camera view are added on submission. ${selectedSeed} Existing artwork is preserved.`
			},
			({ t }) => t('apiPeek.plan.registerExisting'),
			({ t }) => t('apiPeek.plan.registerExistingNote', { seed: selectedSeedText(t) })
		),
		...lifecycle()
	];
}
export function cancelPlan(job: JobRec): PeekCall[] {
	if (job.state !== 'running') return [];
	return job.jobs
		.filter((s) => !s.done && !s.remoteDone)
		.map((s) =>
			shown(
				{
					method: 'DELETE',
					path: `/background-jobs/${encodeURIComponent(s.id)}`,
					label: 'Stop submitted generation',
					note: 'Cancellation can fail if the job has already finished; charges may already apply.'
				},
				({ t }) => t('apiPeek.plan.stopSubmitted'),
				({ t }) => t('apiPeek.plan.stopSubmittedNote')
			)
		);
}
export const queuedPlan = (jobs: JobRec[]): PeekCall[] =>
	jobs
		.filter((job) => job.state === 'queued' || job.state === 'running')
		.flatMap<PeekCall>((job) =>
			job.state === 'queued'
				? [
						shown(
							{
								method: job.method,
								path: job.endpoint,
								body: job.params,
								label: job.label,
								note: 'Resuming permits this waiting request to submit when eligible. Image references shown here are stored locally; the original image data is sent.'
							},
							undefined,
							({ t }) => t('apiPeek.plan.resumeNote')
						)
					]
				: job.jobs
						.filter((sub) => !sub.done)
						.map((sub) =>
							shown(
								{
									method: 'GET' as const,
									path: `/background-jobs/${encodeURIComponent(sub.id)}`,
									label: job.label,
									background: true,
									note: 'Continues checking this submitted job.'
								},
								undefined,
								({ t }) => t('apiPeek.plan.pollNote')
							)
						)
		);
