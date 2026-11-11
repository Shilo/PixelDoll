// Local-only import: decode and validate everything before writing a new project. Never runs a generation.
import { decodePng, makeImg, pngSize, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { cellImg, layerFrame } from '../compose/compose.ts';
import { validate } from '../export/generic.ts';
import {
	baseHashOf,
	cellHash,
	DEFAULT_MOVE,
	DIRECTIONS,
	playlist,
	type DirectionName,
	type Sha256
} from '../rig/rig.ts';
import { normalize, opaqueBox, pivotOf } from '../rig/normalize.ts';
import type { Manifest, Project } from './manifest.ts';
import { CURRENT_FORMAT, supportedFormat } from './manifest.ts';
import type { StoredProject } from './project.ts';
import { unzip, type ZipEntry } from './zip.ts';
import * as db from './db.ts';

export interface CharacterImportState {
	id: string;
	name: string;
	animations: number | null;
}
export interface ImportedCharacter {
	project: Project;
	extra: Pick<StoredProject, 'character' | 'skeletons' | 'rigQa'>;
	warnings: string[];
	states?: CharacterImportState[];
	stateId?: string;
}
export class CharacterImportError extends Error {
	constructor(
		message: string,
		public states: CharacterImportState[] = [],
		public stateId?: string
	) {
		super(message);
	}
}
const text = new TextDecoder();
const hashPattern = /^sha256:[0-9a-f]{64}$/;
const required = (files: Map<string, Uint8Array>, path: string) => {
	const b = files.get(path);
	if (!b) throw new Error(`Missing file: ${path}`);
	return b;
};
const json = (files: Map<string, Uint8Array>, path: string): unknown => {
	try {
		return JSON.parse(text.decode(required(files, path)));
	} catch {
		throw new Error(`Could not read ${path}.`);
	}
};
async function image(bytes: Uint8Array): Promise<Img> {
	const size = pngSize(bytes);
	if (
		!size ||
		size.w < 1 ||
		size.h < 1 ||
		size.w > 8192 ||
		size.h > 8192 ||
		size.w * size.h > 8_388_608
	)
		throw new Error('An image is not a PNG or exceeds the import size limit.');
	return decodePng(bytes);
}
const hasPixels = (im: Img) => !!opaqueBox(im);
function manifestShape(m: Manifest) {
	if (
		!supportedFormat(m?.format) ||
		!m.name?.trim() ||
		!m.rig ||
		!Array.isArray(m.items) ||
		!Array.isArray(m.slots) ||
		!Array.isArray(m.materials) ||
		!Array.isArray(m.presets)
	)
		throw new Error('This is not a supported PixelDoll character export.');
	if (
		!Array.isArray(m.rig.directions) ||
		!Array.isArray(m.rig.animations) ||
		m.rig.directions.length > 8 ||
		m.rig.animations.length > 100 ||
		m.items.length > 500
	)
		throw new Error('The character has an invalid or oversized rig.');
	for (const a of m.rig.animations)
		if (
			!Number.isInteger(a.cells) ||
			a.cells < 1 ||
			a.cells > 120 ||
			!Array.isArray(a.frames) ||
			a.frames.length > 1000
		)
			throw new Error('The character has an invalid frame count.');
	if (new Set(m.items.map((i) => i.id)).size !== m.items.length)
		throw new Error('The character has duplicate item IDs.');
	// Count logical cells, including repeated hash references: a tiny archive can otherwise request gigabytes of copies.
	let pixels = 0;
	for (const item of m.items)
		for (const layer of item.layers) {
			const f = layerFrame(m.rig, layer);
			if (![f.w, f.h].every((n) => Number.isInteger(n) && n >= 1 && n <= 256))
				throw new Error('The export has an invalid layer size.');
			const cells = Object.values(layer.cells ?? {}).reduce(
				(n, dirs) =>
					n +
					Object.values(dirs).reduce((k, rows) => {
						if (rows != null && !Array.isArray(rows))
							throw new Error('The character has an invalid layer frame list.');
						return k + (rows?.length ?? 0);
					}, 0),
				0
			);
			pixels += cells * f.w * f.h;
			if (!Number.isSafeInteger(pixels) || pixels > 64 * 1024 * 1024)
				throw new Error(
					'This character contains too many image pixels, including repeated frame references. Export fewer items or moves.'
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
	animationStateIds?: readonly string[] | 'all'
): Promise<ImportedCharacter> {
	let files = await unzip(bytes);
	// Downloads often wrap the character in one enclosing folder.
	if (!['project.json', 'metadata.json'].some((p) => files.has(p))) {
		const roots = [...files.keys()].filter((p) => /\/(project|metadata)\.json$/.test(p));
		const prefixes = new Set(roots.map((p) => p.slice(0, p.lastIndexOf('/') + 1)));
		if (prefixes.size > 1)
			throw new Error(
				'This ZIP contains multiple character folders. Choose a ZIP containing one character folder; PixelLab states within one metadata.json are supported.'
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
	let decodedPixels = 0;
	for (const bytes of files.values()) {
		const size = pngSize(bytes);
		if (size) decodedPixels += size.w * size.h;
		if (decodedPixels > 64 * 1024 * 1024)
			throw new Error(
				'This archive contains too many image pixels. Export a smaller character or fewer moves.'
			);
	}
	if (files.has('project.json')) result = await editable(files);
	else if (files.has('metadata.json')) result = await pixelLab(files, stateId, animationStateIds);
	else
		throw new Error(
			'This ZIP needs PixelLab metadata.json or a PixelDoll project.json. Arbitrary PNG folders and spritesheet ZIPs need a direction and frame layout; they are not supported yet.'
		);
	const errors = validate(result.project);
	if (errors.length)
		throw new Error(`The character is not compatible: ${errors.slice(0, 3).join('; ')}`);
	const { manifest: m } = result.project;
	const base = m.items.find((i) => i.id === m.rig.baseItem)!;
	if (
		!m.rig.animations.some((a) =>
			m.rig.directions.some((d) =>
				Array.from({ length: a.cells }, (_, c) =>
					cellImg(result.project, base.layers[0], a.id, d.id, c)
				).some((im) => im && hasPixels(im))
			)
		)
	)
		throw new Error('The character has no visible base frames.');
	return result;
}

async function editable(files: Map<string, Uint8Array>): Promise<ImportedCharacter> {
	const data = json(files, 'project.json') as {
		format: string;
		manifest: Manifest;
	} & ImportedCharacter['extra'];
	if (data.format !== 'pixeldoll-project/1')
		throw new Error('This PixelDoll project version is not supported.');
	const m = data.manifest;
	manifestShape(m);
	const refs = new Set<string>();
	for (const it of m.items) {
		for (const h of Object.values(it.dressed ?? {})) if (h) refs.add(h);
		for (const l of it.layers)
			for (const dirs of Object.values(l.cells ?? {}))
				for (const cells of Object.values(dirs)) for (const h of cells ?? []) if (h) refs.add(h);
	}
	for (const r of Object.values(m.rig.rest ?? {})) if (r) refs.add(r.image);
	const images = new Map<string, Img>();
	for (const h of refs) {
		if (!hashPattern.test(h)) throw new Error('The project contains an invalid image hash.');
		const im = await image(required(files, `cells/${h.slice(7)}.png`));
		if ((await cellHash(im)) !== h)
			throw new Error('A project image does not match its stored hash.');
		images.set(h, im);
	}
	return {
		project: { manifest: m, images },
		extra: { character: data.character, skeletons: data.skeletons, rigQa: data.rigQa },
		warnings: []
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
		throw new Error('The character has an unsupported camera view.');
	const size = character.size;
	if (
		size != null &&
		(!object(size) ||
			!Number.isInteger(size.width) ||
			!Number.isInteger(size.height) ||
			size.width < 1 ||
			size.height < 1)
	)
		throw new Error('The character size must contain positive whole-pixel width and height.');
}
function pixelLabInfo(character: PixelLabCharacter) {
	for (const field of ['name', 'prompt', 'template_id'] as const)
		if (character[field] != null && typeof character[field] !== 'string')
			throw new Error(`The character ${field.replace('_id', '')} must be text.`);
	pixelLabGeometry(character);
}

async function pixelLab(
	files: Map<string, Uint8Array>,
	stateId?: string,
	animationStateIds?: readonly string[] | 'all'
): Promise<ImportedCharacter> {
	const metadata = json(files, 'metadata.json');
	if (!object(metadata)) throw new Error('The PixelLab metadata must describe a character.');
	let meta = metadata as PixelLabCharacter & {
		character?: PixelLabCharacter;
		states?: PixelLabState[];
	};
	let states: CharacterImportState[] | undefined;
	const rotations: { dir: DirectionName; path: string }[] = [],
		source: PixelLabMove[] = [];
	let projectName: string | undefined;
	const warnings: string[] = [];
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
				throw new Error('The PixelLab export has an invalid character state list.');
			if (new Set(meta.states.map((s) => s.character.id)).size !== meta.states.length)
				throw new Error('The PixelLab export has duplicate character state IDs.');
			const declared = new Set<string>(),
				owners = new Map<string, Set<string>>();
			const parsed = meta.states.map((state) => {
				const moves: { name: string; dirs: Record<string, string[]> }[] = [];
				let error: string | undefined;
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
						throw new Error(`The “${state.character.name}” state has an invalid frame layout.`);
					if (state.frames.animations !== undefined) {
						if (!object(state.frames.animations))
							throw new Error(`The “${state.character.name}” state has an invalid animation list.`);
						for (const [name, dirs] of Object.entries(state.frames.animations)) {
							if (!object(dirs) || !Object.keys(dirs).length)
								throw new Error(`The ${name} move has no animation directions.`);
							for (const [dir, frames] of Object.entries(dirs)) {
								if (!DIRECTIONS.includes(dir as DirectionName))
									throw new Error(`The ${name}/${dir} animation has an unsupported direction.`);
								if (
									!Array.isArray(frames) ||
									!frames.length ||
									frames.length > 120 ||
									frames.some((path) => typeof path !== 'string')
								)
									throw new Error(`The ${name}/${dir} animation must contain 1–120 frame paths.`);
							}
							moves.push({ name, dirs: dirs as Record<string, string[]> });
						}
					}
				} catch (failure) {
					error = (failure as Error).message;
				} // An unreadable sibling can still be excluded while retaining the valid state.
				return { state, moves, error };
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
				owner.error ??= `The “${owner.state.character.name}” state contains an animation file missing from its metadata: ${path}.`;
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
				throw new Error('This PixelLab export does not include the selected character state.');
			stateId = selected.character.id;
			try {
				pixelLabInfo(selected.character);
			} catch (failure) {
				throw new Error(
					`${(failure as Error).message} Choose another standing pose or export its ZIP again.`
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
				throw new Error(
					'This PixelLab export does not include the selected character state rotations.'
				);
			for (const [dir, path] of Object.entries(selected.frames.rotations)) {
				if (!DIRECTIONS.includes(dir as DirectionName) || typeof path !== 'string')
					throw new Error(
						'The selected character state has an invalid rotation path or direction.'
					);
				rotations.push({ dir: dir as DirectionName, path });
			}
			const requested =
				animationStateIds === undefined
					? [selected.character.id]
					: animationStateIds === 'all'
						? states.filter((s) => s.animations !== 0).map((s) => s.id)
						: animationStateIds;
			for (const id of requested)
				if (!meta.states.some((s) => s.character.id === id))
					throw new Error('This PixelLab export does not include one of the selected move states.');
			const included = [selected, ...meta.states.filter((s) => s !== selected)].filter((state) =>
				requested.includes(state.character.id)
			);
			for (const state of included) {
				const sibling = state !== selected,
					character = state.character,
					own = selected.character;
				const entry = parsed.find((entry) => entry.state === state)!;
				if (entry.error)
					throw new Error(
						`${entry.error} Uncheck that state’s moves to continue, or export its ZIP again.`
					);
				if (sibling && !entry.moves.length) continue;
				if (sibling) {
					try {
						pixelLabGeometry(character);
					} catch (failure) {
						throw new Error(
							`Moves from “${character.name}” have invalid size or camera metadata: ${(failure as Error).message} Uncheck that state’s moves to continue.`
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
					throw new Error(
						`Moves from “${character.name}” use a different character size or camera view. Uncheck that state to continue.`
					);
				for (const { name, dirs: directions } of entry.moves) {
					const dirs: PixelLabMove['dirs'] = new Map();
					for (const [dir, frames] of Object.entries(directions)) {
						if (!rotations.some((r) => r.dir === dir))
							throw new Error(
								`The ${name}/${dir} animation has no matching standing view in the selected state.`
							);
						dirs.set(
							dir as DirectionName,
							frames.map((path, index) => ({ index, path }))
						);
					}
					source.push({ name, state: character.name, sibling, dirs });
					if (source.length > 99)
						throw new Error(
							'This character contains too many moves. Select fewer states or export fewer animations (up to 99 plus Default).'
						);
				}
			}
			if (
				orphan &&
				(animationStateIds === undefined || animationStateIds === 'all' || animationStateIds.length)
			)
				throw new Error(
					`This ZIP contains an animation file without an unambiguous state layout: ${orphan}. Export a new character ZIP with individual frames.`
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
			for (const [path, bytes] of files) {
				const png = /\.png$/i.test(path) || !!pngSize(bytes);
				const rotation = /^rotations\/([a-z-]+)\.png$/.exec(path);
				if (rotation && DIRECTIONS.includes(rotation[1] as DirectionName))
					rotations.push({ dir: rotation[1] as DirectionName, path });
				else if (png && /^rotations\//i.test(path))
					throw new Error(
						`Unsupported rotation image path: ${path}. Export a character ZIP with named direction PNGs.`
					);
				const animation = /^animations\/([^/]+)\/([a-z-]+)\/frame_(\d+)\.png$/.exec(path);
				if (!animation && png && /^animations\//i.test(path))
					throw new Error(
						`Unsupported animation frame path: ${path}. Export a character ZIP with individual numbered frames.`
					);
				if (!animation) continue;
				const [, name, dir, index] = animation;
				if (!Number.isSafeInteger(+index))
					throw new Error(`${path} has an invalid animation frame number.`);
				if (!DIRECTIONS.includes(dir as DirectionName))
					throw new Error(`The ${name} animation has an unsupported direction: ${dir}.`);
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
		}
		if (!rotations.length)
			throw new Error(
				'This PixelLab ZIP has no supported rotation images. Export a single character with rotations/ and animations/ folders.'
			);
		const directions = DIRECTIONS.filter((d) => rotations.some((r) => r.dir === d));
		const groups = source.flatMap((move) => {
			const counts = new Set([...move.dirs.values()].map((frames) => frames.length));
			for (const [dir, frames] of move.dirs) {
				if (!directions.includes(dir))
					throw new Error(`The ${dir} animation has no matching rotation.`);
				if (!frames.length || frames.length > 120)
					throw new Error(`${move.name}/${dir} must contain 1–120 frames.`);
				frames.sort((a, b) => a.index - b.index);
				if (frames.some((f, i) => f.index !== frames[0].index + i))
					throw new Error(`${move.name}/${dir} is missing animation frames.`);
			}
			if (counts.size > 1)
				warnings.push(
					`“${move.name}” has different frame counts by direction. Its directions were imported as separate moves to keep every original frame and direction length.`
				);
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
		if (groups.length > 99)
			throw new Error(
				'This character contains too many moves. Select fewer states or export fewer animations (up to 99 plus Default).'
			);
		const paths = [
			...rotations.map((r) => r.path),
			...groups.flatMap((move) =>
				[...move.dirs.values()].flatMap((frames) => frames.map((f) => f.path))
			)
		];
		const dimensions = paths.map((path) => {
			const size = pngSize(required(files, path));
			if (
				!size ||
				size.w < 1 ||
				size.h < 1 ||
				size.w > 8192 ||
				size.h > 8192 ||
				size.w * size.h > 8_388_608
			)
				throw new Error(`${path} is not a PNG or exceeds the import size limit.`);
			return Math.max(size.w, size.h);
		});
		// A common canvas preserves the source origin across padded frames. Small exports retain the existing floor margin.
		const char = Math.min(
				256,
				dimensions.reduce((max, size) => Math.max(max, size), 0)
			),
			frame = Math.max(64, char);
		if (paths.length * frame * frame > 64 * 1024 * 1024)
			throw new Error(
				'This character contains too many image pixels, including repeated frame references. Select fewer states or export fewer moves.'
			);
		const images = new Map<string, Img>(),
			importedPaths = new Map<string, Sha256>(),
			cells: NonNullable<Manifest['items'][number]['layers'][number]['cells']> = {};
		let semi = 0;
		const put = async (path: string) => {
			const cached = importedPaths.get(path);
			if (cached) return cached;
			const im = await image(required(files, path)),
				n = normalize(im, frame, frame, 128, char);
			if (n.cutPx)
				throw new Error(
					`${path} would lose ${n.cutPx} visible pixels in a ${frame} px cell. Import a smaller character; artwork is never rescaled.`
				);
			if (!hasPixels(n.img)) throw new Error(`${path} is an empty frame.`);
			semi += n.semiAlpha;
			const h = await cellHash(n.img);
			images.set(h, n.img);
			importedPaths.set(path, h);
			return h;
		};
		const name = projectName ?? meta.name ?? meta.character?.name ?? 'Imported character',
			prompt = meta.prompt ?? meta.character?.prompt ?? name;
		const restId = DEFAULT_MOVE;
		cells[restId] = {};
		for (const r of rotations) cells[restId][r.dir] = [await put(r.path)];
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
				cells[id][dir] = [];
				for (const source of frames) cells[id][dir]!.push(await put(source.path));
			}
			animations.push({ id, cells: move.count, loop: true, frames: playlist(move.count, 100) });
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
			project: { manifest, images },
			extra: {},
			states,
			stateId,
			warnings: [
				'Imported artwork is the fixed base: existing clothes and hair cannot be removed. Set up its pose rig to use skeleton-posed equipment and add new moves.',
				...warnings,
				...(semi ? ['Partially transparent edges were converted to pixel-art transparency.'] : [])
			]
		};
	} catch (error) {
		throw new CharacterImportError((error as Error).message, states, stateId ?? states?.[0]?.id);
	}
}
export async function saveImportedCharacter(
	imported: ImportedCharacter,
	name: string
): Promise<string> {
	if (!name.trim() || name.trim().length > 60)
		throw new Error('Enter a character name of 1–60 characters.');
	const manifest = structuredClone(imported.project.manifest);
	manifest.name = name.trim();
	const id = `rig-${crypto.randomUUID()}`; // Always a new copy; never overwrite another character with the same body.
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
