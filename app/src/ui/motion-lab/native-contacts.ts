import { sha256, stableStringify } from '../../lib/image/hash.ts';
import type { Img } from '../../lib/image/png.ts';
import { cellHash } from '../../lib/rig/rig.ts';

export interface NativeContactBinding { id: string; hashes: string[]; cell: { w: number; h: number }; direction: string; durations: number[]; loop: boolean }
export interface NativeContactMark { frame: number; track: 'A' | 'B'; landmark: 'heel' | 'toe'; stance: string; x: number; y: number }
export interface NativeContactDraft { version: 1; kind: 'pixeldoll-native-contact-review'; qualified: false; binding: NativeContactBinding; speed: { x: number | null; y: number | null }; marks: NativeContactMark[]; notes: string }
function checkedBinding(binding: NativeContactBinding) {
  if (!binding || typeof binding.id !== 'string' || !binding.id.trim() || typeof binding.direction !== 'string' || !binding.direction.trim() || typeof binding.loop !== 'boolean' || !binding.cell || ![binding.cell.w, binding.cell.h].every(n => Number.isSafeInteger(n) && n > 0) || !Array.isArray(binding.hashes) || !binding.hashes.length || binding.hashes.some(h => !/^sha256:[a-f0-9]{64}$/.test(h)) || !Array.isArray(binding.durations) || binding.durations.length !== binding.hashes.length || binding.durations.some(ms => !Number.isFinite(ms) || ms <= 0)) throw new Error('Native foot review needs exact frame hashes, native canvas and positive playback durations.');
}
export function createNativeContactDraft(binding: NativeContactBinding): NativeContactDraft {
  checkedBinding(binding); return { version: 1, kind: 'pixeldoll-native-contact-review', qualified: false, binding: structuredClone(binding), speed: { x: null, y: null }, marks: [], notes: '' };
}
function checkedDraft(value: unknown, binding: NativeContactBinding): NativeContactDraft {
  checkedBinding(binding); const draft = value as NativeContactDraft;
  if (draft?.version !== 1 || draft.kind !== 'pixeldoll-native-contact-review' || draft.qualified !== false || stableStringify(draft.binding) !== stableStringify(binding) || !draft.speed || ![draft.speed.x, draft.speed.y].every(v => v === null || typeof v === 'number' && Number.isFinite(v)) || !Array.isArray(draft.marks) || typeof draft.notes !== 'string') throw new Error('Native foot review must match these exact frames, direction, canvas and playback durations; speed must be finite or unset.');
  const identities = new Set<string>();
  for (const mark of draft.marks) {
    if (!mark || !Number.isSafeInteger(mark.frame) || mark.frame < 0 || mark.frame >= binding.hashes.length || !['A', 'B'].includes(mark.track) || !['heel', 'toe'].includes(mark.landmark) || typeof mark.stance !== 'string' || !mark.stance.trim() || ![mark.x, mark.y].every(Number.isSafeInteger) || mark.x < 0 || mark.y < 0 || mark.x >= binding.cell.w || mark.y >= binding.cell.h) throw new Error('Mark a visible native pixel with a foot track, heel/toe landmark and explicit stance label.');
    const key = `${mark.frame}:${mark.track}:${mark.stance}`;
    if (identities.has(key)) throw new Error('Each foot track and stance can have only one landmark per frame.'); identities.add(key);
  }
  return draft;
}
/** Import/save verification includes actual frozen pixels, not only caller-provided hash strings. */
export async function validateNativeContacts(value: unknown, binding: NativeContactBinding, images: readonly Img[]): Promise<NativeContactDraft> {
  const draft = structuredClone(checkedDraft(value, binding)), expected = draft.binding;
  if (images.length !== expected.hashes.length) throw new Error('Native foot review images are incomplete.');
  const frozen = images.map(image => {
    if (!image || image.w !== expected.cell.w || image.h !== expected.cell.h || !(image.data instanceof Uint8ClampedArray) || image.data.length !== image.w * image.h * 4) throw new Error('Native foot review pixels differ from their frozen frame binding.');
    return { w: image.w, h: image.h, data: new Uint8ClampedArray(image.data) };
  });
  for (const [i, image] of frozen.entries()) if (await cellHash(image) !== expected.hashes[i]) throw new Error('Native foot review pixels differ from their frozen frame binding.');
  for (const mark of draft.marks) if (frozen[mark.frame].data[(mark.y * expected.cell.w + mark.x) * 4 + 3] !== 255) throw new Error('Foot marks must be on opaque native pixels. Leave hidden or ambiguous feet unmarked.');
  return draft;
}
export async function nativeContactKey(binding: NativeContactBinding): Promise<string> { checkedBinding(binding); return `pixeldoll.nativeContacts.${await sha256(stableStringify(binding))}`; }
/** Descriptive frame-boundary samples only. No anatomical side, camera, root trajectory or continuous plant is inferred. */
export function measureNativeContacts(value: NativeContactDraft) {
  const draft = checkedDraft(value, value.binding), knownSpeed = draft.speed.x !== null && draft.speed.y !== null;
  const times: number[] = []; let time = 0;
  for (const ms of draft.binding.durations) { times.push(time); time += ms / 1000; }
  const groups = new Map<string, NativeContactMark[]>();
  for (const mark of draft.marks) { const key = stableStringify([mark.track, mark.stance]); groups.set(key, [...groups.get(key) ?? [], mark]); }
  const stances = [...groups.values()].map(marks => {
    const consistent = new Set(marks.map(m => m.landmark)).size === 1, enough = new Set(marks.map(m => m.frame)).size >= 2;
    const reason = !knownSpeed ? 'Both 2D speed components are unset or incomplete.' : !consistent ? 'Mixed heel/toe landmarks.' : !enough ? 'At least two distinct marked frames are required.' : null;
    let span = 0;
    if (!reason) for (const a of marks) for (const b of marks) span = Math.max(span, Math.hypot(a.x - b.x + draft.speed.x! * (times[a.frame] - times[b.frame]), a.y - b.y + draft.speed.y! * (times[a.frame] - times[b.frame])));
    return { track: marks[0].track, stance: marks[0].stance, samples: marks.length, landmark: consistent ? marks[0].landmark : null, boundarySpanPx: reason ? null : span, reason };
  });
  const intervalHolds = knownSpeed ? draft.binding.durations.map((ms, frame) => ({ frame, displacementPx: Math.hypot(draft.speed.x!, draft.speed.y!) * ms / 1000 })) : [];
  // Coverage is bookkeeping only: hidden feet may intentionally remain unmarked. This is not a contact-window model.
  const coverageComplete = draft.binding.hashes.every((_, frame) => ['A', 'B'].every(track => draft.marks.some(m => m.frame === frame && m.track === track)));
  return { qualified: false as const, partial: !coverageComplete || !stances.length || stances.some(s => s.reason !== null), coverageComplete, stances, intervalHolds };
}
export async function nativeContactExport(draft: NativeContactDraft, binding: NativeContactBinding, images: readonly Img[]) {
  const checked = await validateNativeContacts(draft, binding, images);
  return { ...checked, measurements: measureNativeContacts(checked), interpretation: 'Manual visible-foot tracks A/B, not anatomical sides. Native pixels; positive x right and y down. Boundary samples and held-frame displacement are separate, not continuous foot planting. No automatic body correction or quality certification.' };
}
