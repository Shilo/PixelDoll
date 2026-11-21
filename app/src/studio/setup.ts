// Paid setup is explicit, resumable through the same queue as creation, and commits only when every measurement exists.
import { b64, joints, latestOutcome, provOf, run, type Progress } from './create.ts';
import { attachImportedRig, setupPlan, type SetupPlan } from '../lib/rig/setup.ts';
import { DIRECTIONS, cellHash, retainPlaybackChoices, type Keypoint } from '../lib/rig/rig.ts';
import { skeletonInput } from '../lib/rig/estimate.ts';
import { png, routes } from '../lib/pixellab/routes.ts';
import { PLAN_JOB_LIMITS } from '../lib/pixellab/plans.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import type { Provenance } from '../lib/store/manifest.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import * as db from '../lib/store/db.ts';
import { LocalizedError, message } from '../lib/message.ts';

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
/** API-free: true when this setup's registration already finished without a usable character (or stopped), so retrying the
 *  same seed would only replay it. A new seed then buys one new registration (0.25 gen); every joint check is reused. */
export async function setupRegistrationStuck(spec: SetupSpec): Promise<boolean> {
	const { project } = await loadProject(spec.projectId);
	if (project.manifest.rig.baseHash !== spec.baseHash || !spec.looks.trim()) return false;
	const latest = await latestOutcome(
		await registration(project, await setupPlan(project, spec.restAnim), spec)
	);
	return (
		!!latest &&
		(latest.state !== 'done' ||
			!(latest.response as { character_id?: string } | undefined)?.character_id)
	);
}

export async function setupCharacter(
	spec: SetupSpec,
	progress: (p: Progress) => void
): Promise<void> {
	const { rec, project } = await loadProject(spec.projectId);
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
	const plan = await setupPlan(project, spec.restAnim),
		measured = new Map<string, Keypoint[]>(),
		provenance: Provenance[] = [];
	if (!plan.frames.size)
		throw new LocalizedError(
			'No body frames are available for rig setup. Existing artwork is unchanged.',
			'setup.errors.noFrames'
		);
	let done = 0;
	progress({ step: 'joints', done, total: plan.frames.size, recIds: [] });
	const frames = [...plan.frames],
		observations: Provenance[] = new Array(frames.length);
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
						if (!k)
							throw new LocalizedError(
								'PixelLab could not find all 18 valid joints on a body frame. Existing artwork is unchanged; reconnect or choose a clearer standing reference and resume.',
								'setup.errors.jointsMissing'
							);
						if (failure) return;
						const request = routes.estimateSkeleton(png(await b64(skeletonInput(im).image)));
						if (failure) return;
						observations[index] = provOf(
							await run(
								request,
								'Finding joints',
								'm2-skel',
								true,
								true,
								undefined,
								spec.activityScope
							)
						);
						if (failure) return;
						measured.set(hash, k);
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
	progress({ step: 'register', done: 0, total: 1, recIds: [] });
	const managed = await run(
		await registration(project, plan, spec),
		`${rec.manifest.name} · rig setup`,
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
	provenance.push(provOf(managed));
	progress({ step: 'check', done: 0, total: 1, recIds: [] });
	const result = await attachImportedRig(project, plan, measured, provenance);
	// Persist the registration template used above: future fitting must distinguish a set-up mannequin from artwork whose
	// template is still unknown.
	result.manifest.rig.template = 'mannequin';
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
		retainPlaybackChoices(result.manifest.rig, current.manifest.rig);
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
