// Whether Cloud Save needs the user (sign in again, a conflict, a full or missing cloud folder, a failure). The sync
// client sets it through studioHooks once it has loaded, so the Settings opener can show a quiet cue without importing it.
import { studioHooks } from '../lib/sync/connection.ts';

let needed = $state(false);
export const cloudNeedsAttention = () => needed;
studioHooks.attention = (value) => (needed = value);
