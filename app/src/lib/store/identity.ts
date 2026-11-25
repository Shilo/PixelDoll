import { reservedPathSegment } from '../export/paths.ts';
import { LocalizedError } from '../message.ts';
import { DEFAULT_MOVE, retainPlaybackChoices, type Rig, type RigAnimation } from '../rig/rig.ts';
import { playbackClips } from '../runtime/timeline.js';
import type { Item, Manifest, Preset } from './manifest.ts';

export const MAX_EXPORT_ID_LENGTH = 40;
/** The export's live look (export/build.ts); a saved outfit never takes it. */
export const CURRENT_OUTFIT_ID = 'current';
export const validExportId = (id: string) =>
	id.length <= MAX_EXPORT_ID_LENGTH && /^[a-z0-9][a-z0-9_-]*$/.test(id) && !reservedPathSegment(id);

export function defaultCharacterExportId(recordId: string, name = 'character') {
	const label = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 27);
	return `${label || 'character'}_${recordId.replace(/[^a-z0-9]/g, '').slice(-12)}`;
}

export const itemExportId = (item: Pick<Item, 'id' | 'exportId'>) => item.exportId ?? item.id;

export function itemExportIdTaken(items: readonly Item[], itemId: string, exportId: string) {
	return items.some(
		(item) => !item.variantOf && item.id !== itemId && itemExportId(item) === exportId
	);
}

/** Moves keep their internal `id` (frames, jobs, drafts and recovery use it); games see this one. */
type MoveIdentity = Pick<RigAnimation, 'id' | 'kind' | 'exportId'>;
export const moveExportId = (move: MoveIdentity, clips: readonly MoveIdentity[] = [move]) =>
	playbackClips(clips).find(({ key }) => key === move.id)?.id ?? move.id;

export const reservedMoveExportId = (id: string) => id === DEFAULT_MOVE || id === 'standing';

export function clearsStandingAlias(moves: readonly MoveIdentity[], moveId: string, id: string) {
	return id === 'standing' && moveId === id && !moves.some((move) => move.id === DEFAULT_MOVE);
}

export function moveExportIdTaken(
	moves: readonly RigAnimation[],
	moveId: string,
	exportId: string
) {
	return playbackClips(moves).some(({ key, id }) => key !== moveId && id === exportId);
}

export const outfitExportIdTaken = (
	outfits: readonly Preset[],
	outfitId: string,
	exportId: string
) => outfits.some((outfit) => outfit.id !== outfitId && outfit.id === exportId);

export function checkExportIdentity(manifest: Manifest) {
	const aliases = new Set<string>();
	if (manifest.exportId !== undefined) checkId(manifest.exportId);
	for (const item of manifest.items) {
		if (item.variantOf) continue;
		if (item.exportId !== undefined) checkId(item.exportId);
		const id = itemExportId(item);
		if (aliases.has(id)) throw duplicateExportId();
		aliases.add(id);
	}
	const moves = new Set<string>();
	for (const { clip: move, id } of playbackClips(manifest.rig.animations)) {
		if (move.name !== undefined) checkName(move.name);
		if (move.exportId !== undefined) checkMoveExportId(move.id, move.exportId);
		if (moves.has(id)) throw duplicateMoveExportId();
		moves.add(id);
	}
}

function checkId(id: string) {
	if (typeof id !== 'string' || !validExportId(id))
		throw new LocalizedError('Invalid export ID.', 'renameSheet.invalidExportId');
}

/** Standing has a fixed ID for game playback. */
function checkMoveExportId(moveId: string, exportId: string) {
	if (moveId === DEFAULT_MOVE)
		throw new LocalizedError(
			'The Standing move always uses the export ID standing.',
			'renameSheet.defaultMoveExportId'
		);
	checkId(exportId);
	if (reservedMoveExportId(exportId))
		throw new LocalizedError('Invalid export ID.', 'renameSheet.invalidExportId');
}

function checkName(name: unknown) {
	if (typeof name !== 'string' || !name.trim() || name.trim().length > 60)
		throw new LocalizedError('Enter a name of 1–60 characters.', 'renameSheet.invalidName');
}

export const duplicateExportId = () =>
	new LocalizedError('Another item uses this export ID.', 'renameSheet.duplicateExportId');
const duplicateMoveExportId = () =>
	new LocalizedError('Another move uses this export ID.', 'renameSheet.duplicateMoveExportId');

/** `stem` with the first free `_2`, `_3`… suffix that fits the length limit. */
function suffixedExportId(stem: string, taken: (id: string) => boolean): string {
	for (let index = 2; ; index++) {
		const suffix = `_${index}`;
		const candidate = `${stem.slice(0, MAX_EXPORT_ID_LENGTH - suffix.length)}${suffix}`;
		if (!taken(candidate)) return candidate;
	}
}

export function newItemExportId(items: readonly Item[], itemId: string): string | undefined {
	if (validExportId(itemId) && !itemExportIdTaken(items, itemId, itemId)) return undefined;
	const stem =
		itemId
			.replace(/[^a-z0-9_-]/g, '_')
			.replace(/^[^a-z0-9]+/, '')
			.slice(0, MAX_EXPORT_ID_LENGTH) || 'item';
	if (validExportId(stem) && !itemExportIdTaken(items, itemId, stem)) return stem;
	return suffixedExportId(stem, (id) => itemExportIdTaken(items, itemId, id));
}

/** Publish `next` over the current record's rig: keep its playback choices, move names and export IDs. A new move whose
 *  ID another move already exports as gets the first free suffixed export ID, so exports never hold two moves with one ID. */
export function retainMoveChoices(next: Rig, current: Rig): void {
	retainPlaybackChoices(next, current);
	const added: RigAnimation[] = [];
	for (const move of next.animations) {
		const saved = current.animations.find((entry) => entry.id === move.id);
		if (saved?.seatPoints) move.seatPoints = structuredClone(saved.seatPoints);
		else delete move.seatPoints;
		if (!saved) added.push(move);
		for (const key of ['name', 'exportId'] as const)
			if (saved?.[key] === undefined) delete move[key];
			else move[key] = saved[key];
	}
	for (const move of added) assignNewClipExportId(move, next.animations);
}

export function assignNewClipExportId(clip: RigAnimation, clips: readonly RigAnimation[]): void {
	if (clip.id === DEFAULT_MOVE) return;
	const candidates = clips.includes(clip) ? clips : [...clips, clip];
	const occupied = new Set(
		playbackClips(clips.filter((entry) => entry !== clip)).map(({ id }) => id)
	);
	if (occupied.has(moveExportId(clip, candidates)))
		clip.exportId = suffixedExportId(clip.id, (id) => occupied.has(id));
}

export function itemContent({ name: _name, exportId: _exportId, ...content }: Item) {
	return content;
}

export function editIdentity(
	manifest: Manifest,
	projectId: string,
	itemId: string | undefined,
	name: string | undefined,
	exportId?: string
) {
	if (name !== undefined) checkName(name);
	const target = itemId
		? manifest.items.find((item) => item.id === itemId && !item.variantOf)
		: manifest;
	if (!target) throw new LocalizedError('The item no longer exists.', 'renameSheet.itemMissing');
	if (exportId !== undefined) {
		checkId(exportId);
		if (itemId && itemExportIdTaken(manifest.items, itemId, exportId)) throw duplicateExportId();
		target.exportId = exportId;
	} else if (!itemId) manifest.exportId ??= defaultCharacterExportId(projectId);
	if (name !== undefined) target.name = name.trim();
	return { name: target.name, exportId: target.exportId };
}

/** An export ID equal to the internal ID is stored as no override. */
export function editMoveIdentity(
	manifest: Manifest,
	moveId: string,
	name: string | undefined,
	exportId?: string
) {
	if (name !== undefined) checkName(name);
	const move = manifest.rig.animations.find((entry) => entry.id === moveId);
	if (!move) throw new LocalizedError('The move no longer exists.', 'renameSheet.moveMissing');
	if (exportId !== undefined) {
		if (!clearsStandingAlias(manifest.rig.animations, moveId, exportId))
			checkMoveExportId(moveId, exportId);
		if (moveExportIdTaken(manifest.rig.animations, moveId, exportId)) throw duplicateMoveExportId();
		if (exportId === moveId) delete move.exportId;
		else move.exportId = exportId;
	}
	if (name !== undefined) move.name = name.trim();
}

/** An outfit's ID is its export ID: nothing else stores it. */
export function editOutfitIdentity(
	outfits: Preset[],
	outfitId: string,
	name: string | undefined,
	exportId?: string
) {
	if (name !== undefined) checkName(name);
	const outfit = outfits.find((entry) => entry.id === outfitId);
	if (!outfit)
		throw new LocalizedError('The outfit no longer exists.', 'renameSheet.outfitMissing');
	if (exportId !== undefined) {
		checkId(exportId);
		if (exportId === CURRENT_OUTFIT_ID)
			throw new LocalizedError('Invalid export ID.', 'renameSheet.invalidExportId');
		if (outfitExportIdTaken(outfits, outfitId, exportId))
			throw new LocalizedError(
				'Another outfit uses this export ID.',
				'renameSheet.duplicateOutfitExportId'
			);
		outfit.id = exportId;
	}
	if (name !== undefined) outfit.name = name.trim();
}
