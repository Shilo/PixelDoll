// Item drafts persisted at projects/m3-drafts (no `manifest`, so rig listings ignore it). Apart from run.ts so the Studio's
// startup cleanup can read them without loading the item pipeline.
import * as db from '../store/db.ts';
import type { Draft } from './run.ts';

const DRAFTS = 'm3-drafts';
export const loadDrafts = async () => (await db.get<{ drafts: Draft[] }>('projects', DRAFTS))?.drafts ?? [];
export const saveDrafts = (drafts: Draft[]) => db.put('projects', DRAFTS, { id: DRAFTS, drafts });
