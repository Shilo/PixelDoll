// Delete local work: the saved characters, outfits, drafts and Activity history on this device. The stores also hold data
// this must keep (export settings, archived data from earlier versions, Motion Lab and item-trial records, keys an unknown
// feature saved), so it deletes only the record kinds it knows, never whole stores.
import { ITEM_TRIAL_TAG, MOTION_LAB_TAG } from '../pixellab/queue.ts';
import { LocalizedError } from '../message.ts';
import { deleteStoredWork, generationWork, runningFlow, type StoredWork } from './db.ts';
import { CREATE_DRAFT_PREFIX, incompatibleKind } from './incompatible.ts';

const WORK_KEYS = new Set(['studio-drafts', 'm3-drafts', 'studio-move', 'studio-setup']);
/** Characters, the demo's and other saved outfits, item drafts, unfinished creations, moves and setup. */
const workKey = (key: string) =>
	key.startsWith('rig-') ||
	key.startsWith('dress-') ||
	key.startsWith(CREATE_DRAFT_PREFIX) ||
	WORK_KEYS.has(key);
/** Research pages keep their own ledgers and budgets beside the Studio's. */
const studioJob = (job: { tag?: unknown }) =>
	job?.tag !== MOTION_LAB_TAG && job?.tag !== ITEM_TRIAL_TAG;

/** What Delete local work removes from `stored`, or why it must not run. Archived records from earlier versions are kept:
 *  they are downloadable data, not work. Blobs are swept by what is left (deleteStoredWork). */
export function selectLocalWork({ projects, jobs }: StoredWork) {
	const ledger = [...jobs.values()] as { tag?: unknown; state?: unknown }[];
	if (generationWork([...projects.values()], ledger, runningFlow))
		throw new LocalizedError(
			'Finish or dismiss pending generation work before deleting local work. Nothing was deleted.',
			'librarySettings.deleteWork.generating'
		);
	// A lost call may have been charged; its record is the only evidence on this device.
	if (ledger.some((job) => studioJob(job) && job.state === 'lost'))
		throw new LocalizedError(
			'Some PixelLab calls may have been charged without a result. Review and clear them in Activity first. Nothing was deleted.',
			'librarySettings.deleteWork.uncertain'
		);
	return {
		projects: [...projects]
			.filter(([key, value]) => workKey(key) && !incompatibleKind(value))
			.map(([key]) => key),
		jobs: [...jobs].filter(([, job]) => studioJob(job as { tag?: unknown })).map(([key]) => key)
	};
}

export const deleteLocalWork = () => deleteStoredWork(selectLocalWork);
