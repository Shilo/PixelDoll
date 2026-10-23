// Paid setup is explicit, resumable through the same queue as creation, and commits only when every measurement exists.
import { b64, joints, provOf, run, type Progress } from './create.ts';
import { attachImportedRig, setupPlan } from '../lib/rig/setup.ts';
import { cellHash, type Keypoint } from '../lib/rig/rig.ts';
import { png, routes } from '../lib/pixellab/routes.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import type { Provenance } from '../lib/store/manifest.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import * as db from '../lib/store/db.ts';

export interface SetupSpec { projectId: string; baseHash: string; restAnim: string; looks: string; seed: number; activityScope?: string }
export const SETUP_STEPS = [
  { id: 'joints', label: 'Finding joints on every frame' },
  { id: 'register', label: 'Connecting the standing views' },
  { id: 'check', label: 'Checking alignment and saving' },
];

export async function setupCharacter(spec: SetupSpec, progress: (p: Progress) => void): Promise<void> {
  const { rec, project } = await loadProject(spec.projectId);
  if (rec.manifest.rig.baseHash !== spec.baseHash) throw new Error('The body changed since setup started. Start setup again for the current frames.');
  if (!spec.looks.trim()) throw new Error('Describe the character’s existing appearance first.');
  const plan = await setupPlan(project, spec.restAnim), measured = new Map<string, Keypoint[]>(), provenance: Provenance[] = [];
  let done = 0;
  progress({ step: 'joints', done, total: plan.frames.size, recIds: [] });
  // Sequential estimates keep the UI responsive and fail before registering a character if a frame cannot be rigged.
  for (const [hash, im] of plan.frames) {
    const k = await joints(im, true, spec.activityScope);
    if (!k) throw new Error('PixelLab could not find all 18 valid joints on a body frame. Existing artwork is unchanged; reconnect or choose a clearer standing reference and resume.');
    measured.set(hash, k);
    const request = routes.estimateSkeleton(png(await b64(im)));
    provenance.push(provOf(await run(request, 'Finding joints', 'm2-skel', true, true, spec.activityScope)));
    progress({ step: 'joints', done: ++done, total: plan.frames.size, recIds: [] });
  }
  progress({ step: 'register', done: 0, total: 1, recIds: [] });
  const directions = project.manifest.rig.directions;
  const direction_images = Object.fromEntries(await Promise.all(directions.filter((d) => d.id !== 'south').map(async (d) => [d.id, png(await b64(plan.rest[d.id]!))])));
  const managed = await run(routes.createCharacterV3({ description: spec.looks.trim(), reference_image: png(await b64(plan.rest.south!)), direction_images, n_directions: directions.length === 8 ? 8 : 4, view: project.manifest.rig.view ?? 'low top-down', template_id: 'mannequin', no_background: true, seed: spec.seed }), `${rec.manifest.name} · rig setup`, 'studio-setup', false, true, spec.activityScope);
  const id = (managed.response as { character_id?: string })?.character_id;
  if (!id) throw new Error('PixelLab did not return a managed character ID. Existing artwork is unchanged.');
  provenance.push(provOf(managed));
  progress({ step: 'check', done: 0, total: 1, recIds: [] });
  const result = await attachImportedRig(project, plan, measured, provenance);
  // Persist the actual registration profile used above. Legacy ZIPs lack these fields; future fitting must distinguish
  // a successfully set-up low top-down mannequin from artwork whose camera/template are still unknown.
  result.manifest.rig.view = project.manifest.rig.view ?? 'low top-down';
  result.manifest.rig.template = 'mannequin';
  // A single transaction publishes new rest blobs and metadata together; current outfits/items are retained.
  const blobs = new Map<string, Blob>();
  for (const rest of Object.values(result.manifest.rig.rest ?? {})) if (rest) {
    const im = result.images.get(rest.image)!;
    if (await cellHash(im) !== rest.image) throw new Error('A standing reference changed during setup.');
    blobs.set(rest.image.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  }
  await db.updateCharacter(spec.projectId, blobs, (current: StoredProject | undefined) => {
    if (!current || current.manifest.rig.baseHash !== spec.baseHash) throw new Error('The character changed during setup. Its current work has been kept.');
    current.manifest.rig = result.manifest.rig;
    current.manifest.items.find((i) => i.id === current.manifest.rig.baseItem)!.provenance = result.manifest.items.find((i) => i.id === result.manifest.rig.baseItem)!.provenance;
    current.character = { id, looks: spec.looks.trim() };
    current.skeletons = result.skeletons;
    current.rigQa = result.rigQa;
    current.savedAt = new Date().toISOString();
    return current;
  });
}
