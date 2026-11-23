// Paid setup is explicit, resumable through the same queue as creation, and commits only when every measurement exists.
import {
	FINDING_JOINTS,
	b64,
	joints,
	latestOutcome,
	provOf,
	run,
	type Progress
} from './create.ts';
import { attachImportedRig, rigReady, setupPlan, type SetupPlan } from '../lib/rig/setup.ts';
import { DEFAULT_MOVE, DIRECTIONS, cellHash, type Keypoint, type Sha256 } from '../lib/rig/rig.ts';
import { retainMoveChoices } from '../lib/store/identity.ts';
import { skeletonInput } from '../lib/rig/estimate.ts';
import { png, routes } from '../lib/pixellab/routes.ts';
import { PLAN_JOB_LIMITS } from '../lib/pixellab/plans.ts';
import { queue, requestIdentity } from '../lib/pixellab/queue.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import type { Provenance } from '../lib/store/manifest.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import * as db from '../lib/store/db.ts';
import { LocalizedError, message } from '../lib/message.ts';
import { moveName, type MoveRef } from './model.ts';
import { EST } from './movePricing.ts';

/** Move names in the user's words for setup's messages. */
const moveWordsOf = (project: { manifest: { rig: { animations: MoveRef[] } } }) => (id: string) =>
	moveName(id, project.manifest.rig.animations);
/** Setup's plan for a saved character. A rig that already holds its poses is only connected again: measuring it anew would
 *  replace the exact poses its moves were made from, and the anchors and skeletons its items fit, with estimates. */
export const savedSetupPlan = (
	{ rec, project }: Awaited<ReturnType<typeof loadProject>>,
	restAnim?: string
) => setupPlan(project, restAnim, moveWordsOf(project), rigReady(rec, false));

export interface SetupSpec {
	projectId: string;
	baseHash: string;
	restAnim: string;
	looks: string;
	seed: number;
	activityScope?: string;
}
export const SETUP_STEPS = [
	{ id: 'joints', label: message('setup.steps.joints') },
	{ id: 'register', label: message('setup.steps.register') },
	{ id: 'check', label: message('setup.steps.check') }
];

/** The managed registration of the standing views. Its seed is the only input a new registration changes: the paid joint
 *  checks are unseeded and stay reused. */
async function registration(
	project: Awaited<ReturnType<typeof loadProject>>['project'],
	plan: SetupPlan,
	spec: SetupSpec
) {
	const directions =
		plan.registrationDirections === 8 ? DIRECTIONS : (['south', 'east', 'north', 'west'] as const);
	const direction_images = Object.fromEntries(
		await Promise.all(
			directions.filter((d) => d !== 'south').map(async (d) => [d, png(await b64(plan.rest[d]!))])
		)
	);
	return routes.createCharacterV3({
		description: spec.looks.trim(),
		reference_image: png(await b64(plan.rest.south!)),
		direction_images,
		n_directions: plan.registrationDirections,
		view: project.manifest.rig.view,
		template_id: 'mannequin',
		no_background: true,
		seed: spec.seed
	});
}
/** Request hashes the queue already completed: a setup reuses them instead of buying them again. */
const completed = () =>
	new Set(
		queue
			.snapshot()
			.jobs.filter((job) => job.state === 'done')
			.map((job) => job.requestHash)
	);
/** Joint checks `plan` still buys: one for each frame with no completed check. */
async function jointCheckGens(plan: SetupPlan, done: Set<string>): Promise<number> {
	let gens = 0;
	for (const image of plan.frames.values()) {
		const check = routes.estimateSkeleton(png(await b64(skeletonInput(image).image)));
		if (!done.has((await requestIdentity(check)).requestHash)) gens += EST;
	}
	return gens;
}
/** API-free: what resuming this stopped setup still buys, priced from the request cache: a joint check for each frame with
 *  no completed check, and the registration when it has none. Completed requests are reused, never bought again. */
export async function setupResumeGens(spec: SetupSpec): Promise<number> {
	const saved = await loadProject(spec.projectId),
		{ project } = saved;
	const plan = await savedSetupPlan(saved, spec.restAnim),
		done = completed();
	let gens = await jointCheckGens(plan, done);
	if (!done.has((await requestIdentity(await registration(project, plan, spec))).requestHash))
		gens += 0.25;
	return +gens.toFixed(2);
}
/** API-free: true when this setup's registration already finished without a usable character (or stopped), so retrying the
 *  same seed would only replay it. A new seed then buys one new registration (0.25 gen); every joint check is reused. */
export async function setupRegistrationStuck(spec: SetupSpec): Promise<boolean> {
	const saved = await loadProject(spec.projectId),
		{ project } = saved;
	if (project.manifest.rig.baseHash !== spec.baseHash || !spec.looks.trim()) return false;
	const latest = await latestOutcome(
		await registration(project, await savedSetupPlan(saved, spec.restAnim), spec)
	);
	return (
		!!latest &&
		(latest.state !== 'done' ||
			!(latest.response as { character_id?: string } | undefined)?.character_id)
	);
}

/** API-free: what a new setup would charge now. Completed joint checks are reused; the registration always sends, as a new
 *  setup has a new seed. */
export async function setupGens(plan: SetupPlan): Promise<number> {
	return +((await jointCheckGens(plan, completed())) + 0.25).toFixed(2);
}

/** New moves describe the character with this text and never use the registration, so changing it is free. `check` may
 *  refuse the saved text it replaces. Returns that text. */
export async function saveLooks(
	projectId: string,
	looks: string,
	check?: (saved: string) => void
): Promise<string> {
	let previous = '';
	await db.update<StoredProject>('projects', projectId, (rec) => {
		if (!rec?.character)
			throw new LocalizedError(
				'This saved character is no longer available.',
				'directionsSheet.characterUnavailable'
			);
		check?.(rec.character.looks);
		previous = rec.character.looks;
		rec.character = { ...rec.character, looks: looks.trim() };
		return rec;
	});
	return previous;
}

/** Registers the standing views as a managed PixelLab character: its ID and the provenance of the purchase. */
async function register(
	{ rec, project }: Awaited<ReturnType<typeof loadProject>>,
	plan: SetupPlan,
	spec: SetupSpec,
	progress: (p: Progress) => void
): Promise<{ id: string; record: Provenance }> {
	progress({ step: 'register', done: 0, total: 1, recIds: [] });
	const managed = await run(
		await registration(project, plan, spec),
		{
			text: `${rec.manifest.name} · rig setup`,
			title: message('activity.titleSetup', { name: rec.manifest.name })
		},
		'studio-setup',
		false,
		true,
		undefined,
		spec.activityScope
	);
	const id = (managed.response as { character_id?: string })?.character_id;
	if (!id)
		throw new LocalizedError(
			'PixelLab did not return a managed character ID. Existing artwork is unchanged.',
			'setup.errors.noCharacterId'
		);
	return { id, record: provOf(managed) };
}

/** Setup of a rig that already holds its poses: only the registration changes. Every pose, anchor, skeleton and QA result
 *  stays, since the artwork they describe is unchanged. The registration now holds the standing views as saved, so managed
 *  motion needs no Adjust frame offset any more. */
async function reconnect(
	saved: Awaited<ReturnType<typeof loadProject>>,
	plan: SetupPlan,
	spec: SetupSpec,
	progress: (p: Progress) => void
): Promise<void> {
	const { id, record } = await register(saved, plan, spec, progress);
	progress({ step: 'check', done: 0, total: 1, recIds: [] });
	await db.updateCharacter(spec.projectId, new Map(), (current: StoredProject | undefined) => {
		if (!current || current.manifest.rig.baseHash !== spec.baseHash)
			throw new LocalizedError(
				'The character changed during setup. Its current work has been kept.',
				'setup.errors.characterChanged'
			);
		const rig = current.manifest.rig;
		rig.template = 'mannequin';
		delete rig.artOffset;
		current.manifest.items.find((i) => i.id === rig.baseItem)!.provenance.push(record);
		current.character = { id, looks: spec.looks.trim() };
		current.savedAt = new Date().toISOString();
		return current;
	});
}

export async function setupCharacter(
	spec: SetupSpec,
	progress: (p: Progress) => void
): Promise<void> {
	const saved = await loadProject(spec.projectId),
		{ rec, project } = saved;
	if (rec.manifest.rig.baseHash !== spec.baseHash)
		throw new LocalizedError(
			'The body changed since setup started. Start setup again for the current frames.',
			'setup.errors.bodyChanged'
		);
	if (!spec.looks.trim())
		throw new LocalizedError(
			'Describe the character’s existing appearance first.',
			'setup.errors.looksRequired'
		);
	const plan = await savedSetupPlan(saved, spec.restAnim);
	if (plan.reconnect) return reconnect(saved, plan, spec, progress);
	const measured = new Map<string, Keypoint[]>(),
		provenance: Provenance[] = [];
	if (!plan.frames.size)
		throw new LocalizedError(
			'No body frames are available for rig setup. Existing artwork is unchanged.',
			'setup.errors.noFrames'
		);
	let done = 0;
	progress({ step: 'joints', done, total: plan.frames.size, recIds: [] });
	const frames = [...plan.frames],
		observations: Provenance[] = new Array(frames.length),
		// A frame of a standing view, the standing move or Default without joints stops setup; any other frame only skips its
		// move (attachImportedRig).
		standingViews = new Set(Object.values(plan.rest)),
		layer = project.manifest.items.find((i) => i.id === project.manifest.rig.baseItem)?.layers[0],
		standingHashes = new Set<string>([
			...(await Promise.all(Object.values(plan.rest).map((im) => cellHash(im!)))),
			...[plan.restAnim, DEFAULT_MOVE].flatMap((move) =>
				Object.values(layer?.cells?.[move] ?? {}).flatMap((cells) =>
					(cells ?? []).filter((hash): hash is Sha256 => !!hash)
				)
			)
		]);
	let next = 0,
		failure: { error: unknown } | undefined;
	// Bound prepared work by the largest supported plan; the shared queue applies the actual account and busy-account limits.
	// On failure, admitted checks can still finish and be cached. Drain them without creating canceled records that block resume.
	await Promise.allSettled(
		Array.from(
			{ length: Math.min(frames.length, Math.max(...Object.values(PLAN_JOB_LIMITS))) },
			async () => {
				while (!failure && next < frames.length) {
					const index = next++,
						[hash, im] = frames[index];
					try {
						const k = await joints(im, true, undefined, spec.activityScope);
						if (!k && (standingViews.has(im) || standingHashes.has(hash)))
							throw new LocalizedError(
								'PixelLab could not find all 18 valid joints on a standing frame. Existing artwork is unchanged; redraw that frame in Fix frames or choose a clearer standing view, then resume setup.',
								'setup.errors.jointsMissing'
							);
						if (failure) return;
						const request = routes.estimateSkeleton(png(await b64(skeletonInput(im).image)));
						if (failure) return;
						observations[index] = provOf(
							await run(
								request,
								FINDING_JOINTS,
								'm2-skel',
								true,
								true,
								undefined,
								spec.activityScope
							)
						);
						if (failure) return;
						if (k) measured.set(hash, k);
						progress({ step: 'joints', done: ++done, total: plan.frames.size, recIds: [] });
					} catch (error) {
						failure ??= { error };
						throw error;
					}
				}
			}
		)
	);
	if (failure) throw failure.error;
	provenance.push(...observations);
	const { id, record } = await register(saved, plan, spec, progress);
	provenance.push(record);
	progress({ step: 'check', done: 0, total: 1, recIds: [] });
	const result = await attachImportedRig(project, plan, measured, provenance);
	// Persist the registration template used above: future fitting must distinguish a set-up mannequin from artwork whose
	// template is still unknown.
	result.manifest.rig.template = 'mannequin';
	// PixelLab now holds exactly these standing views: managed motion needs no Adjust frame offset any more.
	delete result.manifest.rig.artOffset;
	// A single transaction publishes new rest blobs and metadata together; current outfits/items are retained.
	const blobs = new Map<string, Blob>();
	for (const rest of Object.values(result.manifest.rig.rest ?? {}))
		if (rest) {
			const im = result.images.get(rest.image)!;
			if ((await cellHash(im)) !== rest.image)
				throw new LocalizedError(
					'A standing reference changed during setup.',
					'setup.errors.referenceChanged'
				);
			blobs.set(
				rest.image.slice(7),
				new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
			);
		}
	await db.updateCharacter(spec.projectId, blobs, (current: StoredProject | undefined) => {
		if (!current || current.manifest.rig.baseHash !== spec.baseHash)
			throw new LocalizedError(
				'The character changed during setup. Its current work has been kept.',
				'setup.errors.characterChanged'
			);
		retainMoveChoices(result.manifest.rig, current.manifest.rig);
		current.manifest.rig = result.manifest.rig;
		current.manifest.items.find((i) => i.id === current.manifest.rig.baseItem)!.provenance =
			result.manifest.items.find((i) => i.id === result.manifest.rig.baseItem)!.provenance;
		for (const item of current.manifest.items) {
			const prepared = result.manifest.items.find((i) => i.id === item.id);
			if (
				prepared?.route === 'skeleton-pose' &&
				item.route === 'ea2-anchor' &&
				item.standing === prepared.standing &&
				JSON.stringify(item.dressed) === JSON.stringify(prepared.dressed)
			)
				item.route = prepared.route;
		}
		current.character = { id, looks: spec.looks.trim() };
		current.skeletons = result.skeletons;
		current.rigQa = result.rigQa;
		current.savedAt = new Date().toISOString();
		return current;
	});
}
