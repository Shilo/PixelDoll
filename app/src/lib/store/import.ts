// Local-only import: decode and validate everything before writing a new project. Never runs a generation.
import { decodePng, makeImg, pngSize, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { detectUpscale } from '../image/upscale.ts';
import { ALPHA_THRESHOLD, detectCompressedPalette } from '../image/resampling.ts';
import { cellImg, layerFrame } from '../compose/compose.ts';
import { validate } from '../export/generic.ts';
import {
	baseHashOf,
	cellHash,
	DEFAULT_MOVE,
	DIRECTIONS,
	pinnedArtwork,
	playlist,
	type DirectionName,
	type Sha256
} from '../rig/rig.ts';
import { normalize, opaqueBox, pivotOf } from '../rig/normalize.ts';
import { stateClipId, stateClipName } from '../rig/poses.ts';
import { roomFrame, standingRoom } from '../rig/reframe.ts';
import type { Manifest, Project } from './manifest.ts';
import { CURRENT_FORMAT, supportedFormat } from './manifest.ts';
import type { StoredProject } from './project.ts';
import { checkExportIdentity, defaultCharacterExportId } from './identity.ts';
import { unzip, type ZipEntry } from './zip.ts';
import { pruneHistory } from './workspace.ts';
import * as db from './db.ts';
import type { WhisperKey, WhisperVars } from 'svelte-whisper';
import { LocalizedError, errorMessage, errorText, message, type Message } from '../message.ts';

export interface CharacterImportState {
	id: string;
	name: string;
	animations: number | null;
	poseCompatible?: boolean;
}
type PoseSelection = readonly string[] | { exclude: readonly string[] };
export interface ImportedCharacter {
	format?: 'pixellab';
	project: Project;
	extra: Pick<StoredProject, 'character' | 'skeletons' | 'rigQa'>;
	warnings: string[];
	/** Localized counterparts aligned with `warnings`; an empty slot keeps the English text. */
	warningKeys?: (Message | undefined)[];
	states?: CharacterImportState[];
	stateId?: string;
}
export class CharacterImportError extends LocalizedError {
	constructor(
		english: string,
		key: WhisperKey,
		vars?: WhisperVars,
		public states: CharacterImportState[] = [],
		public stateId?: string
	) {
		super(english, key, vars);
	}
}
const text = new TextDecoder();
export const hashPattern = /^sha256:[0-9a-f]{64}$/;
const required = (files: Map<string, Uint8Array>, path: string) => {
	const b = files.get(path);
	if (!b) throw new LocalizedError(`Missing file: ${path}`, 'import.error.missingFile', { path });
	return b;
};
const json = (files: Map<string, Uint8Array>, path: string): unknown => {
	try {
		return JSON.parse(text.decode(required(files, path)));
	} catch {
		throw new LocalizedError(`Could not read ${path}.`, 'import.error.unreadableFile', { path });
	}
};
export const fitsEditableImage = ({ w, h }: { w: number; h: number }) =>
	w >= 1 && h >= 1 && w <= 8192 && h <= 8192 && w * h <= 8_388_608;

async function image(bytes: Uint8Array): Promise<Img> {
	const size = pngSize(bytes);
	if (!size || !fitsEditableImage(size))
		throw new LocalizedError(
			'An image is not a PNG or exceeds the import size limit.',
			'import.error.imageUnsupported'
		);
	return decodePng(bytes);
}
const hasPixels = (im: Img) => !!opaqueBox(im);
export function manifestShape(m: Manifest) {
	if (
		!supportedFormat(m?.format) ||
		typeof m.name !== 'string' ||
		!m.name.trim() ||
		!m.rig ||
		!Array.isArray(m.items) ||
		!Array.isArray(m.slots) ||
		!Array.isArray(m.materials) ||
		!Array.isArray(m.presets)
	)
		throw new LocalizedError(
			'This is not a supported PixelDoll character export.',
			'import.error.unsupportedExport'
		);
	if (
		!Array.isArray(m.rig.directions) ||
		!Array.isArray(m.rig.animations) ||
		m.rig.directions.length > 8 ||
		m.rig.animations.length > 100 ||
		m.items.length > 500
	)
		throw new LocalizedError(
			'The character has an invalid or oversized rig.',
			'import.error.invalidRig'
		);
	for (const a of m.rig.animations)
		if (
			!a ||
			!Number.isInteger(a.cells) ||
			a.cells < 1 ||
			a.cells > 120 ||
			!Array.isArray(a.frames) ||
			a.frames.length < 1 ||
			a.frames.length > 1000
		)
			throw new LocalizedError(
				'The character has an invalid frame count.',
				'import.error.invalidFrameCount'
			);
	if (
		m.items.some(
			(item) =>
				!item ||
				typeof item.id !== 'string' ||
				!Array.isArray(item.layers) ||
				item.layers.some((layer) => !layer)
		)
	)
		throw new LocalizedError(
			'The character has an invalid item or layer.',
			'import.error.invalidItem'
		);
	if (new Set(m.items.map((i) => i.id)).size !== m.items.length)
		throw new LocalizedError(
			'The character has duplicate item IDs.',
			'import.error.duplicateItems'
		);
	checkExportIdentity(m);
	// Count logical cells, including repeated hash references: a tiny archive can otherwise request gigabytes of copies.
	let pixels = 0;
	for (const item of m.items)
		for (const layer of item.layers) {
			const f = layerFrame(m.rig, layer);
			if (![f.w, f.h].every((n) => Number.isInteger(n) && n >= 1 && n <= 256))
				throw new LocalizedError(
					'The export has an invalid layer size.',
					'import.error.invalidLayerSize'
				);
			const cells = Object.values(layer.cells ?? {}).reduce(
				(n, dirs) =>
					n +
					Object.values(dirs).reduce((k, rows) => {
						if (rows != null && !Array.isArray(rows))
							throw new LocalizedError(
								'The character has an invalid layer frame list.',
								'import.error.invalidFrameList'
							);
						return k + (rows?.length ?? 0);
					}, 0),
				0
			);
			pixels += cells * f.w * f.h;
			if (!Number.isSafeInteger(pixels) || pixels > 64 * 1024 * 1024)
				throw new LocalizedError(
					'This character contains too many image pixels, including repeated frame references. Export fewer items or moves.',
					'import.error.tooManyPixels'
				);
		}
}

/** Editable data travels alongside engine files; includes original cells, rest views and rig metadata. */
export async function projectEntries(
	p: Project,
	extra: ImportedCharacter['extra'] = {}
): Promise<ZipEntry[]> {
	const entries: ZipEntry[] = [
		{
			name: 'project.json',
			data: new TextEncoder().encode(
				JSON.stringify({ format: 'pixeldoll-project/1', manifest: p.manifest, ...extra })
			)
		}
	];
	for (const [h, im] of p.images)
		entries.push({ name: `cells/${h.slice(7)}.png`, data: await encodePngBytes(im) });
	return entries;
}

export async function readCharacterZip(
	bytes: Uint8Array,
	stateId?: string,
	animationStateIds?: readonly string[] | 'all',
	poseStateIds: PoseSelection = []
): Promise<ImportedCharacter> {
	let files = await unzip(bytes);
	// Downloads often wrap the character in one enclosing folder.
	if (!['project.json', 'metadata.json'].some((p) => files.has(p))) {
		const roots = [...files.keys()].filter((p) => /\/(project|metadata)\.json$/.test(p));
		const prefixes = new Set(roots.map((p) => p.slice(0, p.lastIndexOf('/') + 1)));
		if (prefixes.size > 1)
			throw new LocalizedError(
				'This ZIP contains multiple character folders. Choose a ZIP containing one character folder; PixelLab states within one metadata.json are supported.',
				'import.error.multipleFolders'
			);
		if (prefixes.size === 1) {
			const prefix = [...prefixes][0];
			files = new Map(
				[...files]
					.filter(([p]) => p.startsWith(prefix))
					.map(([p, b]) => [p.slice(prefix.length), b])
			);
		}
	}
	let result: ImportedCharacter;
	if (files.has('project.json')) result = await editable(files);
	else if (files.has('metadata.json')) {
		checkArchivePixels(files.values());
		result = await pixelLab(files, stateId, animationStateIds, poseStateIds);
	} else
		throw new LocalizedError(
			'This ZIP needs PixelLab metadata.json or a PixelDoll project.json. Arbitrary PNG folders and spritesheet ZIPs need a direction and frame layout; they are not supported yet.',
			'import.error.unsupportedArchive'
		);
	const errors = validate(result.project);
	if (errors.length)
		throw new LocalizedError(
			`The character is not compatible: ${errors.slice(0, 3).join('; ')}`,
			'import.error.incompatible',
			{ details: errors.slice(0, 3).join('; ') }
		);
	if (!hasVisibleBase(result.project))
		throw new LocalizedError(
			'The character has no visible base frames.',
			'import.error.noVisibleBase'
		);
	// An editable ZIP carries only shown artwork (a loaded project holds no history images), so its valid Undo history may
	// name images it lacks: the copy keeps only what Undo and Adjust frame can read.
	const { images } = result.project;
	pruneHistory(result.project.manifest, (hex) => images.has(`sha256:${hex}`));
	return result;
}

export function checkArchivePixels(files: Iterable<Uint8Array>) {
	let decodedPixels = 0;
	for (const bytes of files) {
		const size = pngSize(bytes);
		if (size) decodedPixels += size.w * size.h;
		if (decodedPixels > 64 * 1024 * 1024)
			throw new LocalizedError(
				'This archive contains too many image pixels. Export a smaller character or fewer moves.',
				'import.error.archivePixels'
			);
	}
}

export function hasVisibleBase(project: Project) {
	const { manifest: m } = project;
	const base = m.items.find((i) => i.id === m.rig.baseItem);
	return !!base?.layers.some((layer) =>
		m.rig.animations.some((a) =>
			m.rig.directions.some((d) =>
				Array.from({ length: a.cells }, (_, c) => cellImg(project, layer, a.id, d.id, c)).some(
					(im) => im && hasPixels(im)
				)
			)
		)
	);
}

const plainObject = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);
const keypoint = (value: unknown) =>
	plainObject(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
/** The saved details an editable project carries, keeping only the ones shaped as the Studio reads them: a hand-edited file
 *  imports without them instead of failing later (Frame size reads every skeleton point). */
function savedDetails(data: Record<string, unknown>): {
	extra: ImportedCharacter['extra'];
	dropped: boolean;
} {
	const extra: ImportedCharacter['extra'] = {};
	let dropped = false;
	const { character, skeletons, rigQa } = data;
	if (character !== undefined) {
		if (
			plainObject(character) &&
			typeof character.id === 'string' &&
			typeof character.looks === 'string'
		)
			extra.character = { id: character.id, looks: character.looks };
		else dropped = true;
	}
	if (skeletons !== undefined) {
		if (
			plainObject(skeletons) &&
			Object.values(skeletons).every(
				(points) => plainObject(points) && Object.values(points).every(keypoint)
			)
		)
			extra.skeletons = skeletons as NonNullable<ImportedCharacter['extra']['skeletons']>;
		else dropped = true;
	}
	if (rigQa !== undefined) extra.rigQa = rigQa; // its readers check its shape themselves
	return { extra, dropped };
}

async function editable(files: Map<string, Uint8Array>): Promise<ImportedCharacter> {
	const data = json(files, 'project.json') as unknown;
	if (!plainObject(data) || data.format !== 'pixeldoll-project/1')
		throw new LocalizedError(
			'This PixelDoll project version is not supported.',
			'import.error.unsupportedProject'
		);
	const m = data.manifest as Manifest;
	manifestShape(m);
	const refs = new Set<string>();
	for (const it of m.items) {
		for (const h of Object.values(it.dressed ?? {})) if (h) refs.add(h);
		for (const l of it.layers)
			for (const dirs of Object.values(l.cells ?? {}))
				for (const cells of Object.values(dirs)) for (const h of cells ?? []) if (h) refs.add(h);
	}
	for (const r of Object.values(m.rig.rest ?? {})) if (r) refs.add(r.image);
	for (const hash of pinnedArtwork(m.rig)) refs.add(hash);
	const cells = new Map<string, Uint8Array>();
	for (const h of refs) {
		if (!hashPattern.test(h))
			throw new LocalizedError(
				'The project contains an invalid image hash.',
				'import.error.invalidHash'
			);
		cells.set(h, required(files, `cells/${h.slice(7)}.png`));
	}
	checkArchivePixels(cells.values());
	const images = new Map<string, Img>();
	for (const [h, bytes] of cells) {
		const im = await image(bytes);
		if ((await cellHash(im)) !== h)
			throw new LocalizedError(
				'A project image does not match its stored hash.',
				'import.error.hashMismatch'
			);
		images.set(h, im);
	}
	const { extra, dropped } = savedDetails(data);
	return {
		project: { manifest: m, images },
		extra,
		warnings: dropped
			? [
					'Some saved character details were damaged and were left out. Set up its pose rig again if needed.'
				]
			: [],
		...(dropped ? { warningKeys: [message('import.warning.detailsDropped')] } : {})
	};
}

interface PixelLabCharacter {
	id?: string;
	name?: string;
	prompt?: string;
	view?: Manifest['rig']['view'];
	template_id?: string;
	size?: { width: number; height: number };
}
interface PixelLabState {
	character: PixelLabCharacter & { id: string; name: string };
	folder?: string;
	frames?: { rotations?: unknown; animations?: unknown };
}
interface PixelLabMove {
	name: string;
	state?: string;
	sibling: boolean;
	dirs: Map<DirectionName, { index: number; path: string }[]>;
}
const object = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
function pixelLabGeometry(character: PixelLabCharacter) {
	if (character.view != null && !['low top-down', 'high top-down', 'side'].includes(character.view))
		throw new LocalizedError(
			'The character has an unsupported camera view.',
			'import.error.cameraView'
		);
	const size = character.size;
	if (
		size != null &&
		(!object(size) ||
			!Number.isInteger(size.width) ||
			!Number.isInteger(size.height) ||
			size.width < 1 ||
			size.height < 1)
	)
		throw new LocalizedError(
			'The character size must contain positive whole-pixel width and height.',
			'import.error.characterSize'
		);
}
function pixelLabInfo(character: PixelLabCharacter) {
	for (const field of ['name', 'prompt', 'template_id'] as const)
		if (character[field] != null && typeof character[field] !== 'string')
			throw new LocalizedError(
				`The character ${field.replace('_id', '')} must be text.`,
				'import.error.fieldText',
				{ field: field.replace('_id', '') }
			);
	pixelLabGeometry(character);
}

async function pixelLab(
	files: Map<string, Uint8Array>,
	stateId?: string,
	animationStateIds?: readonly string[] | 'all',
	poseStateIds: PoseSelection = []
): Promise<ImportedCharacter> {
	const metadata = json(files, 'metadata.json');
	if (!object(metadata))
		throw new LocalizedError(
			'The PixelLab metadata must describe a character.',
			'import.error.metadataShape'
		);
	let meta = metadata as PixelLabCharacter & {
		character?: PixelLabCharacter;
		states?: PixelLabState[];
	};
	let states: CharacterImportState[] | undefined;
	const rotations: { dir: DirectionName; path: string }[] = [],
		source: PixelLabMove[] = [];
	const poses: { name: string; rotations: typeof rotations }[] = [];
	let projectName: string | undefined;
	const warnings: string[] = [],
		warningKeys: Message[] = [];
	// A bad animation or direction is left out with a warning instead of failing the whole character. Standing art, archive
	// bounds, decoding and clipping stay hard. Each warning is listed once.
	const leaveOut = (move: string, direction?: string, standing = false) => {
		const text = !direction
			? `“${move}” was left out: its animation frames could not be read. Export it again with individual numbered frames.`
			: standing
				? `“${move}” facing ${direction} was left out: the character has no standing view facing that way.`
				: `“${move}” facing ${direction} was left out: its frames are empty, missing or out of order.`;
		if (warnings.includes(text)) return;
		warnings.push(text);
		warningKeys.push(
			!direction
				? message('import.warning.skippedMove', { move })
				: message(standing ? 'import.warning.skippedStanding' : 'import.warning.skippedDirection', {
						move,
						direction
					})
		);
	};
	const frameSize = (path: string) => {
		const size = pngSize(required(files, path));
		if (!size || !fitsEditableImage(size))
			throw new LocalizedError(
				`${path} is not a PNG or exceeds the import size limit.`,
				'import.error.frameImage',
				{ path }
			);
		return size;
	};
	try {
		if (meta.states !== undefined) {
			if (
				!Array.isArray(meta.states) ||
				!meta.states.length ||
				meta.states.length > 100 ||
				meta.states.some(
					(s) =>
						!object(s) ||
						!object(s.character) ||
						typeof s.character.id !== 'string' ||
						!s.character.id ||
						typeof s.character.name !== 'string'
				)
			)
				throw new LocalizedError(
					'The PixelLab export has an invalid character state list.',
					'import.error.stateList'
				);
			if (new Set(meta.states.map((s) => s.character.id)).size !== meta.states.length)
				throw new LocalizedError(
					'The PixelLab export has duplicate character state IDs.',
					'import.error.stateIds'
				);
			const declared = new Set<string>(),
				owners = new Map<string, Set<string>>();
			const parsed = meta.states.map((state) => {
				const moves: { name: string; dirs: Record<string, string[]> }[] = [];
				const unreadable: { move: string; direction?: string }[] = [];
				let error: Error | undefined;
				const own = (prefix: string) => {
					const ids = owners.get(prefix) ?? new Set<string>();
					ids.add(state.character.id);
					owners.set(prefix, ids);
				};
				if (typeof state.folder === 'string') {
					const folder = state.folder.replace(/\/$/, '');
					own(`${folder ? `${folder}/` : ''}animations/`);
				}
				if (object(state.frames?.rotations))
					for (const path of Object.values(state.frames.rotations))
						if (typeof path === 'string') {
							declared.add(path);
							const root = /^(.*\/)?rotations\/[^/]+$/i.exec(path);
							if (root) own(`${root[1] ?? ''}animations/`);
						}
				// Keep every declared reference in the inventory, including valid paths in an unreadable sibling.
				if (object(state.frames?.animations))
					for (const dirs of Object.values(state.frames.animations))
						if (object(dirs))
							for (const frames of Object.values(dirs))
								if (Array.isArray(frames))
									for (const path of frames) if (typeof path === 'string') declared.add(path);
				try {
					if (!object(state.frames))
						throw new LocalizedError(
							`The “${state.character.name}” state has an invalid frame layout.`,
							'import.error.stateFrames',
							{ state: state.character.name }
						);
					if (state.frames.animations !== undefined) {
						if (!object(state.frames.animations))
							throw new LocalizedError(
								`The “${state.character.name}” state has an invalid animation list.`,
								'import.error.stateAnimations',
								{ state: state.character.name }
							);
						for (const [name, dirs] of Object.entries(state.frames.animations)) {
							if (!object(dirs) || !Object.keys(dirs).length) {
								unreadable.push({ move: name });
								continue;
							}
							const kept: Record<string, string[]> = {};
							for (const [dir, frames] of Object.entries(dirs)) {
								if (
									!DIRECTIONS.includes(dir as DirectionName) ||
									!Array.isArray(frames) ||
									!frames.length ||
									frames.length > 120 ||
									frames.some((path) => typeof path !== 'string')
								)
									unreadable.push({ move: name, direction: dir });
								else kept[dir] = frames as string[];
							}
							if (Object.keys(kept).length) moves.push({ name, dirs: kept });
						}
					}
				} catch (failure) {
					error = failure instanceof Error ? failure : new Error(errorText(failure));
				} // An unreadable sibling can still be excluded while retaining the valid state.
				return { state, moves, unreadable, error };
			});
			let orphan: string | undefined;
			for (const [path, bytes] of files) {
				if (declared.has(path) || (!/\.png$/i.test(path) && !pngSize(bytes))) continue;
				const namespace = /(^|\/)animations\//i.exec(path);
				if (!namespace) continue;
				let ids: Set<string> | undefined,
					longest = 0;
				for (const [prefix, candidate] of owners) {
					const root = prefix.slice(0, -'animations/'.length);
					if (
						prefix.length > longest &&
						path.startsWith(root) &&
						/^animations\//i.test(path.slice(root.length))
					) {
						ids = candidate;
						longest = prefix.length;
					}
				}
				if (!ids || ids.size !== 1) {
					orphan ??= path;
					continue;
				}
				const owner = parsed.find((entry) => ids.has(entry.state.character.id))!;
				owner.error ??= new LocalizedError(
					`The “${owner.state.character.name}” state contains an animation file missing from its metadata: ${path}.`,
					'import.error.undeclaredAnimation',
					{ state: owner.state.character.name, path }
				);
			}
			states = parsed.map(({ state, moves, error }) => ({
				id: state.character.id,
				name: state.character.name,
				animations: error ? null : moves.length
			}));
			const selected = stateId
				? meta.states.find((s) => s.character.id === stateId)
				: meta.states[0];
			if (!selected)
				throw new LocalizedError(
					'This PixelLab export does not include the selected character state.',
					'import.error.selectedState'
				);
			stateId = selected.character.id;
			try {
				pixelLabInfo(selected.character);
			} catch (failure) {
				throw new LocalizedError(
					`${(failure as Error).message} Choose another standing pose or export its ZIP again.`,
					'import.error.stateInfo',
					{ detail: errorMessage(failure) }
				);
			}
			const groupName = meta.name ?? meta.character?.name;
			pixelLabInfo({ name: groupName });
			const prompt = meta.states[0].character.prompt;
			const sharedPrompt =
				typeof prompt === 'string' &&
				prompt.trim() &&
				meta.states.every(
					(state) =>
						typeof state.character.prompt === 'string' &&
						state.character.prompt.trim() === prompt.trim()
				)
					? prompt
					: undefined;
			projectName = (groupName?.trim() || sharedPrompt || 'Imported character')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 60)
				.trim();
			if (!object(selected.frames?.rotations))
				throw new LocalizedError(
					'This PixelLab export does not include the selected character state rotations.',
					'import.error.selectedRotations'
				);
			for (const [dir, path] of Object.entries(selected.frames.rotations)) {
				if (!DIRECTIONS.includes(dir as DirectionName) || typeof path !== 'string')
					throw new LocalizedError(
						'The selected character state has an invalid rotation path or direction.',
						'import.error.rotationPath'
					);
				rotations.push({ dir: dir as DirectionName, path });
			}
			const standingSizes = new Map(rotations.map(({ path }) => [path, frameSize(path)]));
			const requested =
				animationStateIds === undefined
					? [selected.character.id]
					: animationStateIds === 'all'
						? states.filter((s) => s.animations !== 0).map((s) => s.id)
						: animationStateIds;
			const poseViews = (sibling: PixelLabState | undefined) => {
				const siblingRotations = sibling?.frames?.rotations;
				const incompatible = () =>
					new LocalizedError(
						'This state has different artwork dimensions, facings, or camera settings. Import it as a separate character.',
						'import.poseMismatch'
					);
				if (
					!sibling ||
					!object(siblingRotations) ||
					Object.keys(siblingRotations).length !== rotations.length ||
					sibling.character.view !== selected.character.view ||
					sibling.character.template_id !== selected.character.template_id
				)
					throw incompatible();
				return rotations.map(({ dir, path }) => {
					const alternate = siblingRotations[dir];
					if (typeof alternate !== 'string') throw incompatible();
					const baseSize = standingSizes.get(path)!;
					const poseBytes = files.get(alternate);
					const poseSize = poseBytes && pngSize(poseBytes);
					if (!poseSize || baseSize.w !== poseSize.w || baseSize.h !== poseSize.h)
						throw incompatible();
					return { dir, path: alternate };
				});
			};
			if ('exclude' in poseStateIds) {
				for (const [index, sibling] of meta.states.entries()) {
					const state = states[index];
					if (state.id === stateId) continue;
					let views: typeof rotations;
					try {
						views = poseViews(sibling);
					} catch (error) {
						if (
							!(error instanceof LocalizedError) ||
							error.translation.key !== 'import.poseMismatch'
						)
							throw error;
						state.poseCompatible = false;
						continue;
					}
					state.poseCompatible = true;
					if (!poseStateIds.exclude.includes(state.id))
						poses.push({ name: state.name, rotations: views });
				}
			} else {
				for (const id of new Set(poseStateIds)) {
					if (id === stateId) continue;
					const sibling = meta.states.find((state) => state.character.id === id);
					poses.push({ name: sibling?.character.name ?? 'state', rotations: poseViews(sibling) });
				}
			}
			for (const id of requested)
				if (!meta.states.some((s) => s.character.id === id))
					throw new LocalizedError(
						'This PixelLab export does not include one of the selected move states.',
						'import.error.selectedMoves'
					);
			const included = [selected, ...meta.states.filter((s) => s !== selected)].filter((state) =>
				requested.includes(state.character.id)
			);
			for (const state of included) {
				const sibling = state !== selected,
					character = state.character,
					own = selected.character;
				const entry = parsed.find((entry) => entry.state === state)!;
				if (entry.error)
					throw new LocalizedError(
						`${entry.error.message} Uncheck that state’s moves to continue, or export its ZIP again.`,
						'import.error.fixState',
						{ detail: errorMessage(entry.error) }
					);
				for (const { move, direction } of entry.unreadable) leaveOut(move, direction);
				if (sibling && !entry.moves.length) continue;
				if (sibling) {
					try {
						pixelLabGeometry(character);
					} catch (failure) {
						throw new LocalizedError(
							`Moves from “${character.name}” have invalid size or camera metadata: ${(failure as Error).message} Uncheck that state’s moves to continue.`,
							'import.error.stateMetadata',
							{ state: character.name, detail: errorMessage(failure) }
						);
					}
				}
				if (
					sibling &&
					((character.view && own.view && character.view !== own.view) ||
						(character.size &&
							own.size &&
							(character.size.width !== own.size.width ||
								character.size.height !== own.size.height)))
				)
					throw new LocalizedError(
						`Moves from “${character.name}” use a different character size or camera view. Uncheck that state to continue.`,
						'import.error.stateMismatch',
						{ state: character.name }
					);
				for (const { name, dirs: directions } of entry.moves) {
					const dirs: PixelLabMove['dirs'] = new Map();
					for (const [dir, frames] of Object.entries(directions)) {
						if (!rotations.some((r) => r.dir === dir)) {
							leaveOut(name, dir, true);
							continue;
						}
						dirs.set(
							dir as DirectionName,
							frames.map((path, index) => ({ index, path }))
						);
					}
					if (dirs.size) source.push({ name, state: character.name, sibling, dirs });
					if (source.length > 99)
						throw new LocalizedError(
							'This character contains too many moves. Select fewer states or export fewer animations (up to 99 plus Standing).',
							'import.error.tooManyMoves'
						);
				}
			}
			if (
				orphan &&
				(animationStateIds === undefined || animationStateIds === 'all' || animationStateIds.length)
			)
				throw new LocalizedError(
					`This ZIP contains an animation file without an unambiguous state layout: ${orphan}. Export a new character ZIP with individual frames.`,
					'import.error.orphanFile',
					{ path: orphan }
				);
			meta = { character: selected.character };
		} else {
			pixelLabInfo({
				name: meta.name ?? meta.character?.name,
				prompt: meta.prompt ?? meta.character?.prompt,
				template_id: meta.template_id ?? meta.character?.template_id,
				view: meta.view ?? meta.character?.view,
				size: meta.size ?? meta.character?.size
			});
			const unreadable = new Set<string>();
			for (const [path, bytes] of files) {
				const png = /\.png$/i.test(path) || !!pngSize(bytes);
				const rotation = /^rotations\/([a-z-]+)\.png$/.exec(path);
				if (rotation && DIRECTIONS.includes(rotation[1] as DirectionName))
					rotations.push({ dir: rotation[1] as DirectionName, path });
				else if (png && /^rotations\//i.test(path))
					throw new LocalizedError(
						`Unsupported rotation image path: ${path}. Export a character ZIP with named direction PNGs.`,
						'import.error.rotationPathName',
						{ path }
					);
				const animation = /^animations\/([^/]+)\/([a-z-]+)\/frame_(\d+)\.png$/.exec(path);
				// A frame whose place in its move is unknown leaves that whole move out: its order cannot be proven.
				const owner = /^animations\/([^/]+)\//i.exec(path)?.[1];
				if (!animation && png && /^animations\//i.test(path)) {
					if (!owner)
						throw new LocalizedError(
							`Unsupported animation frame path: ${path}. Export a character ZIP with individual numbered frames.`,
							'import.error.animationPath',
							{ path }
						);
					unreadable.add(owner);
					continue;
				}
				if (!animation) continue;
				const [, name, dir, index] = animation;
				if (!Number.isSafeInteger(+index)) {
					unreadable.add(name);
					continue;
				}
				if (!DIRECTIONS.includes(dir as DirectionName)) {
					leaveOut(name, dir);
					continue;
				}
				let move = source.find((s) => s.name === name);
				if (!move) {
					move = { name, sibling: false, dirs: new Map() };
					source.push(move);
				}
				move.dirs.set(dir as DirectionName, [
					...(move.dirs.get(dir as DirectionName) ?? []),
					{ index: +index, path }
				]);
			}
			for (const name of unreadable) {
				leaveOut(name);
				const at = source.findIndex((move) => move.name === name);
				if (at >= 0) source.splice(at, 1);
			}
		}
		if (!rotations.length)
			throw new LocalizedError(
				'This PixelLab ZIP has no supported rotation images. Export a single character with rotations/ and animations/ folders.',
				'import.error.noRotations'
			);
		const directions = DIRECTIONS.filter((d) => rotations.some((r) => r.dir === d));
		const groups = source.flatMap((move) => {
			// Each direction is its own row, so leaving one out keeps the other directions' frame indexes.
			for (const [dir, frames] of move.dirs) {
				frames.sort((a, b) => a.index - b.index);
				const standing = !directions.includes(dir);
				if (
					standing ||
					!frames.length ||
					frames.length > 120 ||
					frames.some((f, i) => f.index !== frames[0].index + i) ||
					// A declared frame missing from the archive: checked before sizing reads it.
					frames.some((f) => !files.has(f.path))
				) {
					leaveOut(move.name, dir, standing);
					move.dirs.delete(dir);
				}
			}
			const counts = new Set([...move.dirs.values()].map((frames) => frames.length));
			if (counts.size > 1) {
				warnings.push(
					`“${move.name}” has different frame counts by direction. Its directions were imported as separate moves to keep every original frame and direction length.`
				);
				warningKeys.push(message('import.warning.frameCounts', { move: move.name }));
			}
			return [...counts].map((count) => {
				const dirs = new Map([...move.dirs].filter(([, frames]) => frames.length === count));
				return {
					...move,
					dirs,
					name: counts.size > 1 ? `${move.name}-${[...dirs.keys()].join('-')}` : move.name,
					count
				};
			});
		});
		if (groups.length + poses.length > 99)
			throw new LocalizedError(
				'This character contains too many moves. Select fewer states or export fewer animations (up to 99 plus Standing).',
				'import.error.tooManyMoves'
			);
		const paths = [
			...rotations.map((r) => r.path),
			...poses.flatMap((pose) => pose.rotations.map(({ path }) => path)),
			...groups.flatMap((move) =>
				[...move.dirs.values()].flatMap((frames) => frames.map((f) => f.path))
			)
		];
		const dimensions = paths.map((path) => {
			const size = frameSize(path);
			return Math.max(size.w, size.h);
		});
		// A common canvas preserves the source origin across padded frames. Small exports retain the existing floor margin.
		const char = Math.min(
			256,
			dimensions.reduce((max, size) => Math.max(max, size), 0)
		);
		const fits = (size: number) => paths.length * size * size <= 64 * 1024 * 1024;
		let frame = Math.max(64, char);
		if (!fits(frame))
			throw new LocalizedError(
				'This character contains too many image pixels, including repeated frame references. Select fewer states or export fewer moves.',
				'import.error.tooManyPixelsStates'
			);
		const decoded = new Map<string, Promise<Img>>(),
			decode = (path: string) => {
				let work = decoded.get(path);
				if (!work) decoded.set(path, (work = image(required(files, path))));
				return work;
			};
		// An integer upscale shows in the standing rotations, which are the base cells every direction shares; animation and
		// pose cells would only repeat the same warning, so the detector runs on the standing cells only. Compression is
		// judged over every direction: a clean upscale repeats its palette and never trips it, while a damaged direction
		// still does.
		const standingCells = await Promise.all(rotations.map((r) => decode(r.path)));
		const upscale = standingCells.reduce((max, im) => Math.max(max, detectUpscale(im)), 1);
		if (upscale >= 2) {
			warnings.push(
				`The standing artwork looks like a ${upscale}x upscale. It is kept as it is: items made from it cost more pixels, mix pixel sizes and recolor less cleanly. Import the original 1x art if you can.`
			);
			warningKeys.push(message('import.warning.upscaledBase', { scale: upscale }));
		}
		// The compression check judges each standing cell on its own palette: pooling would let one clean direction hide
		// a damaged one. Editable project imports are not checked here; they carry PixelDoll's hashed cells, and this
		// warning targets externally produced PixelLab art.
		if (standingCells.some(detectCompressedPalette)) {
			warnings.push(
				'The standing artwork looks compressed or resampled: many of its colors appear only once. It is kept as it is: items made from it are harder to cut out, recolor and line up. Import the original art if you can.'
			);
			warningKeys.push(message('import.warning.compressedBase'));
		}
		// PixelLab draws standing feet about 1 px above its canvas edge and a walk steps lower, so the frame adds room for moves
		// (lib/rig/reframe.ts roomFrame), centered as PixelLab centers its own larger animation canvases.
		const room = standingRoom(
				standingCells.map((im) => normalize(im, char, char, ALPHA_THRESHOLD, char).img),
				char
			),
			roomy = room ? roomFrame(char, room) : char,
			centered = roomy > frame && fits(roomy);
		if (centered) frame = roomy;
		else if (roomy > frame) {
			warnings.push(
				'Room for moves was not added because this character has too many image pixels. Use Frame size after importing to add it.'
			);
			warningKeys.push(message('import.warning.noRoom'));
		}
		const images = new Map<string, Img>(),
			importedPaths = new Map<string, Sha256>(),
			cells: NonNullable<Manifest['items'][number]['layers'][number]['cells']> = {};
		let semi = 0;
		/** Null for an empty animation frame, which leaves its direction out; an empty standing view stops the import. */
		const put = async (path: string, animation = false) => {
			const cached = importedPaths.get(path);
			if (cached) return cached;
			const im = await decode(path),
				n = normalize(im, frame, frame, ALPHA_THRESHOLD, centered ? frame : char);
			decoded.delete(path); // importedPaths keeps the result; the source need not stay in memory
			if (n.cutPx)
				throw new LocalizedError(
					`${path} would lose ${n.cutPx} visible pixels in a ${frame} px cell. Import a smaller character; artwork is never rescaled.`,
					'import.error.cutPixels',
					{ path, cut: n.cutPx, frame }
				);
			if (!hasPixels(n.img)) {
				if (animation) return null;
				throw new LocalizedError(`${path} is an empty frame.`, 'import.error.emptyFrame', { path });
			}
			semi += n.semiAlpha;
			const h = await cellHash(n.img);
			images.set(h, n.img);
			importedPaths.set(path, h);
			return h;
		};
		const name = projectName ?? meta.name ?? meta.character?.name ?? 'Imported character',
			prompt = meta.prompt ?? meta.character?.prompt ?? name;
		const standing = async (path: string) => (await put(path))!;
		const restId = DEFAULT_MOVE;
		cells[restId] = {};
		for (const r of rotations) cells[restId][r.dir] = [await standing(r.path)];
		const animations: Manifest['rig']['animations'] = [
			{ id: restId, cells: 1, loop: true, frames: playlist(1, 150) }
		];
		const slug = (value: string) =>
			value
				.toLowerCase()
				.replace(/[^a-z0-9_-]+/g, '-')
				.replace(/^[^a-z0-9]+|[-_]+$/g, '') || 'move';
		for (const move of groups) {
			let id = slug(move.name);
			if (move.sibling && animations.some((a) => a.id === id))
				id = `${slug(move.state ?? 'state')}-${id}`;
			while (animations.some((a) => a.id === id)) id += '-copy';
			cells[id] = {};
			for (const [dir, frames] of move.dirs) {
				const row: Sha256[] = [];
				for (const source of frames) {
					const hash = await put(source.path, true);
					if (!hash) break;
					row.push(hash);
				}
				if (row.length === frames.length) cells[id][dir] = row;
				else leaveOut(move.name, dir);
			}
			if (!Object.keys(cells[id]).length) {
				delete cells[id];
				continue;
			}
			animations.push({ id, cells: move.count, loop: true, frames: playlist(move.count, 100) });
		}
		for (const pose of poses) {
			let id = stateClipId(slug(pose.name).slice(0, 45));
			const name = stateClipName(id);
			while (animations.some((animation) => animation.id === id)) id += '-copy';
			cells[id] = {};
			for (const { dir, path } of pose.rotations) cells[id][dir] = [await standing(path)];
			animations.push({
				id,
				kind: 'state',
				cells: 1,
				loop: false,
				frames: playlist(1, 150),
				...(name && { name })
			});
		}
		const rest = images.get(cells[restId][directions[0]]![0]!)!;
		const view = meta.view ?? meta.character?.view ?? 'low top-down',
			template = meta.template_id ?? meta.character?.template_id ?? 'mannequin';
		const rig: Manifest['rig'] = {
			cell: { w: frame, h: frame },
			pivot: pivotOf(rest),
			directions: directions.map((id) => ({ id })),
			animations,
			baseItem: 'base',
			baseHash: 'sha256:' as Sha256,
			view,
			template
		};
		const hashes: Record<string, Sha256> = {};
		const empty = await cellHash(makeImg(frame, frame));
		for (const a of animations)
			for (const d of directions)
				for (let i = 0; i < a.cells; i++)
					hashes[`${a.id}/${d}/${i}`] = cells[a.id][d]?.[i] ?? empty;
		rig.baseHash = await baseHashOf(rig, hashes);
		const manifest: Manifest = {
			format: CURRENT_FORMAT,
			app: 'PixelDoll 0.1.0',
			name,
			rig,
			materials: [],
			slots: [{ id: 'body', z: 10, class: 'base', required: true }],
			items: [
				{
					id: 'base',
					name: 'Base body',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					materials: [],
					prompt,
					baseHash: rig.baseHash,
					layers: [{ id: 'main', role: 'fg', z: 10, cells }],
					provenance: []
				}
			],
			presets: [{ id: 'default', name: 'Base', items: { body: 'base' }, variants: {} }]
		};
		return {
			format: 'pixellab',
			project: { manifest, images },
			extra: {},
			states,
			stateId,
			warnings: [
				'Set up the pose rig to fit items and add new moves.',
				...warnings,
				...(semi ? ['Partially transparent edges were converted to pixel-art transparency.'] : [])
			],
			warningKeys: [
				message('import.warning.fixedBase'),
				...warningKeys,
				...(semi ? [message('import.warning.semiAlpha')] : [])
			]
		};
	} catch (error) {
		const english = (error as Error).message;
		const translation =
			error instanceof LocalizedError
				? error.translation
				: message('import.error.detail', { detail: english });
		throw new CharacterImportError(
			english,
			translation.key,
			translation.vars,
			states,
			stateId ?? states?.[0]?.id
		);
	}
}
export async function saveImportedCharacter(
	imported: ImportedCharacter,
	name: string
): Promise<string> {
	if (!name.trim() || name.trim().length > 60)
		throw new LocalizedError(
			'Enter a character name of 1–60 characters.',
			'import.error.nameLength'
		);
	const manifest = structuredClone(imported.project.manifest);
	manifest.name = name.trim();
	const id = `rig-${crypto.randomUUID()}`; // Always a new copy; never overwrite another character with the same body.
	manifest.exportId ??= defaultCharacterExportId(id, manifest.name);
	const blobs = new Map<string, Blob>();
	for (const [h, im] of imported.project.images)
		blobs.set(
			h.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	const rec: StoredProject = {
		id,
		savedAt: new Date().toISOString(),
		manifest,
		...imported.extra,
		origin: 'studio'
	};
	await db.putCharacter(id, rec, blobs);
	db.askPersist();
	return id;
}
