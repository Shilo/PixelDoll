// Local-only import: decode and validate everything before writing a new project. Never runs a generation.
import { decodePng, makeImg, pngSize, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { cellImg, layerFrame } from '../compose/compose.ts';
import { validate } from '../export/generic.ts';
import { baseHashOf, cellHash, DEFAULT_MOVE, DIRECTIONS, playlist, type DirectionName, type Sha256 } from '../rig/rig.ts';
import { normalize, opaqueBox, pivotOf } from '../rig/normalize.ts';
import type { Manifest, Project } from './manifest.ts';
import { CURRENT_FORMAT, supportedFormat } from './manifest.ts';
import type { StoredProject } from './project.ts';
import { unzip, type ZipEntry } from './zip.ts';
import * as db from './db.ts';

export interface ImportedCharacter { project: Project; extra: Pick<StoredProject, 'character' | 'skeletons' | 'rigQa'>; warnings: string[]; states?: { id: string; name: string }[]; stateId?: string }
export class CharacterImportError extends Error {
  constructor(message: string, public states: { id: string; name: string }[] = [], public stateId?: string) { super(message); }
}
const text = new TextDecoder();
const hashPattern = /^sha256:[0-9a-f]{64}$/;
const required = (files: Map<string, Uint8Array>, path: string) => { const b = files.get(path); if (!b) throw new Error(`Missing file: ${path}`); return b; };
const json = (files: Map<string, Uint8Array>, path: string): unknown => {
  try { return JSON.parse(text.decode(required(files, path))); } catch { throw new Error(`Could not read ${path}.`); }
};
async function image(bytes: Uint8Array): Promise<Img> {
  const size = pngSize(bytes);
  if (!size || size.w < 1 || size.h < 1 || size.w > 8192 || size.h > 8192 || size.w * size.h > 8_388_608) throw new Error('An image is not a PNG or exceeds the import size limit.');
  return decodePng(bytes);
}
const hasPixels = (im: Img) => !!opaqueBox(im);
const slice = (im: Img, x: number, y: number, w: number, h: number): Img => {
  const out = makeImg(w, h);
  for (let r = 0; r < h; r++) out.data.set(im.data.subarray(((y + r) * im.w + x) * 4, ((y + r) * im.w + x + w) * 4), r * w * 4);
  return out;
};
function manifestShape(m: Manifest) {
  if (!supportedFormat(m?.format) || !m.name?.trim() || !m.rig || !Array.isArray(m.items) || !Array.isArray(m.slots) || !Array.isArray(m.materials) || !Array.isArray(m.presets)) throw new Error('This is not a supported PixelDoll character export.');
  if (!Array.isArray(m.rig.directions) || !Array.isArray(m.rig.animations) || m.rig.directions.length > 8 || m.rig.animations.length > 100 || m.items.length > 500) throw new Error('The character has an invalid or oversized rig.');
  for (const a of m.rig.animations) if (!Number.isInteger(a.cells) || a.cells < 1 || a.cells > 120 || !Array.isArray(a.frames) || a.frames.length > 1000) throw new Error('The character has an invalid frame count.');
  if (new Set(m.items.map((i) => i.id)).size !== m.items.length) throw new Error('The character has duplicate item IDs.');
  // Count logical cells, including repeated sheet/hash references: a tiny archive can otherwise request gigabytes of copies.
  let pixels = 0;
  for (const item of m.items) for (const layer of item.layers) {
    const f = layerFrame(m.rig, layer);
    if (![f.w, f.h].every((n) => Number.isInteger(n) && n >= 1 && n <= 256)) throw new Error('The export has an invalid layer size.');
    const cells = Object.values(layer.cells ?? {}).reduce((n, dirs) => n + Object.values(dirs).reduce((k, rows) => { if (rows != null && !Array.isArray(rows)) throw new Error('The character has an invalid layer frame list.'); return k + (rows?.length ?? 0); }, 0), 0);
    const sheets = Object.keys(layer.sourceSheets ?? layer.sheets ?? {}).reduce((n, id) => n + (m.rig.animations.find((a) => a.id === id)?.cells ?? 0) * m.rig.directions.length, 0);
    pixels += (cells + sheets) * f.w * f.h;
    if (!Number.isSafeInteger(pixels) || pixels > 64 * 1024 * 1024) throw new Error('This character contains too many image pixels, including repeated frame references. Export fewer items or moves.');
  }

}

/** Editable data travels alongside engine files; includes original cells, rest views and rig metadata. */
export async function projectEntries(p: Project, extra: ImportedCharacter['extra'] = {}): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [{ name: 'project.json', data: new TextEncoder().encode(JSON.stringify({ format: 'pixeldoll-project/1', manifest: p.manifest, ...extra })) }];
  for (const [h, im] of p.images) entries.push({ name: `cells/${h.slice(7)}.png`, data: await encodePngBytes(im) });
  return entries;
}

export async function readCharacterZip(bytes: Uint8Array, stateId?: string): Promise<ImportedCharacter> {
  let files = await unzip(bytes);
  // Downloads often wrap the character in one enclosing folder.
  if (!['project.json', 'manifest.json', 'metadata.json'].some((p) => files.has(p))) {
    const roots = [...files.keys()].filter((p) => /\/(project|manifest|metadata)\.json$/.test(p));
    const prefixes = new Set(roots.map((p) => p.slice(0, p.lastIndexOf('/') + 1)));
    if (prefixes.size > 1) throw new Error('This ZIP contains multiple character folders. Choose a ZIP containing one character folder; PixelLab states within one metadata.json are supported.');
    if (prefixes.size === 1) { const prefix = [...prefixes][0]; files = new Map([...files].filter(([p]) => p.startsWith(prefix)).map(([p, b]) => [p.slice(prefix.length), b])); }
  }
  let result: ImportedCharacter;
  let decodedPixels = 0;
  for (const [path, bytes] of files) if (path.toLowerCase().endsWith('.png')) {
    const size = pngSize(bytes);
    if (size) decodedPixels += size.w * size.h;
    if (decodedPixels > 64 * 1024 * 1024) throw new Error('This archive contains too many image pixels. Export a smaller character or fewer moves.');
  }
  if (files.has('project.json')) result = await editable(files);
  else if (files.has('manifest.json')) result = await sheets(files);
  else if (files.has('metadata.json')) {
    const meta = json(files, 'metadata.json') as { states?: { character: { id: string; name: string } }[] };
    try { result = await pixelLab(files, stateId); }
    catch (e) { throw new CharacterImportError((e as Error).message, meta.states?.map((s) => ({ id: s.character.id, name: s.character.name })), stateId ?? meta.states?.[0]?.character.id); }
  }
  else throw new Error('This ZIP needs PixelLab metadata.json or a PixelDoll project.json/manifest.json. Arbitrary PNG folders and spritesheet ZIPs need a direction and frame layout; they are not supported yet.');
  const errors = validate(result.project);
  if (errors.length) throw new Error(`The character is not compatible: ${errors.slice(0, 3).join('; ')}`);
  const { manifest: m } = result.project;
  const base = m.items.find((i) => i.id === m.rig.baseItem)!;
  if (!m.rig.animations.some((a) => m.rig.directions.some((d) => Array.from({ length: a.cells }, (_, c) => cellImg(result.project, base.layers[0], a.id, d.id, c)).some((im) => im && hasPixels(im))))) throw new Error('The character has no visible base frames.');
  return result;
}

async function editable(files: Map<string, Uint8Array>): Promise<ImportedCharacter> {
  const data = json(files, 'project.json') as { format: string; manifest: Manifest } & ImportedCharacter['extra'];
  if (data.format !== 'pixeldoll-project/1') throw new Error('This PixelDoll project version is not supported.');
  const m = data.manifest;
  manifestShape(m);
  const refs = new Set<string>();
  for (const it of m.items) {
    for (const h of it.design?.snapshot.imageHashes ?? []) refs.add(h);
    for (const h of Object.values(it.dressed ?? {})) if (h) refs.add(h);
    for (const l of it.layers) for (const dirs of Object.values(l.cells ?? {})) for (const cells of Object.values(dirs)) for (const h of cells ?? []) if (h) refs.add(h);
  }
  for (const r of Object.values(m.rig.rest ?? {})) if (r) refs.add(r.image);
  const images = new Map<string, Img>();
  for (const h of refs) {
    if (!hashPattern.test(h)) throw new Error('The project contains an invalid image hash.');
    const im = await image(required(files, `cells/${h.slice(7)}.png`));
    if (await cellHash(im) !== h) throw new Error('A project image does not match its stored hash.');
    images.set(h, im);
  }
  return { project: { manifest: m, images }, extra: { character: data.character, skeletons: data.skeletons, rigQa: data.rigQa }, warnings: [] };
}

async function sheets(files: Map<string, Uint8Array>): Promise<ImportedCharacter> {
  const m = json(files, 'manifest.json') as Manifest;
  manifestShape(m);
  const images = new Map<string, Img>();
  // Baked tuck variants are engine artifacts. Restore the editable originals so a later export creates them exactly once.
  const originals = new Map(m.items.filter((it) => it.variantOf && m.items.some((x) => x.id === it.variantOf)).map((it) => [it.id, it.variantOf!]));
  for (const preset of m.presets) for (const [slot, id] of Object.entries(preset.items)) if (id && originals.has(id)) preset.items[slot] = originals.get(id)!;
  m.items = m.items.filter((it) => !originals.has(it.id));
  for (const it of m.items) {
    // Engine-only archives do not include the dressed reference images needed for future posing.
    delete it.dressed;
    if (it.route === 'skeleton-pose') delete it.route;
  }
  for (const it of m.items) for (const l of it.layers) {
    const f = layerFrame(m.rig, l);
    if (![f.w, f.h].every((n) => Number.isInteger(n) && n > 0 && n <= 256)) throw new Error('The export has an invalid layer size.');
    l.cells = {};
    for (const [anim, path] of Object.entries(l.sourceSheets ?? l.sheets ?? {})) {
      const a = m.rig.animations.find((a) => a.id === anim);
      if (!a) throw new Error(`Unknown move: ${anim}`);
      const sheet = await image(required(files, path));
      if (sheet.w !== a.cells * f.w || sheet.h !== m.rig.directions.length * f.h) throw new Error(`${path} does not match its frame layout.`);
      l.cells[anim] = {};
      for (const [r, d] of m.rig.directions.entries()) {
        // Export rows are already mirrored; make them independent to preserve exactly what was shipped.
        l.cells[anim][d.id] = await Promise.all(Array.from({ length: a.cells }, async (_, c) => {
          const im = slice(sheet, c * f.w, r * f.h, f.w, f.h);
          if (!hasPixels(im)) return null;
          const h = await cellHash(im); images.set(h, im); return h;
        }));
      }
    }
    delete l.sheets;
    delete l.sourceSheets;
  }
  let removedDesignLinks = false;
  for (const item of m.items) if (item.design) {
    const refs: unknown = item.design.snapshot?.imageHashes;
    if (!Array.isArray(refs) || refs.length > 5000 || refs.some((h) => typeof h !== 'string' || !hashPattern.test(h) || (!images.has(h) && !files.has(`cells/${h.slice(7)}.png`)))) {
      delete item.design;
      removedDesignLinks = true;
      continue;
    }
    // Engine sheets can restore the visible raster without the original design's standing/source images.
    // Keep reusable lineage only when every referenced image is available and verified for a later save/load.
    for (const h of refs as string[]) if (!images.has(h)) {
      const im = await image(required(files, `cells/${h.slice(7)}.png`));
      if (await cellHash(im) !== h) throw new Error('A saved-design source image does not match its stored hash.');
      images.set(h, im);
    }
  }
  for (const d of m.rig.directions) delete d.mirrorOf;
  // Old engine ZIPs do not carry the referenced rest PNGs or a managed character record.
  delete m.rig.rest;
  for (const a of m.rig.animations) delete a.sources;
  delete m.export;
  return { project: { manifest: m, images }, extra: {}, warnings: ['This older export restores layers, moves, colors and outfits. Set up its pose rig to add new moves. Existing equipment keeps its original frames.', ...(removedDesignLinks ? ['Original saved-design reference images were not included, so unavailable reusable-design links were removed. Existing equipment frames and colors are preserved.'] : [])] };
}

async function pixelLab(files: Map<string, Uint8Array>, stateId?: string): Promise<ImportedCharacter> {
  interface Character { id?: string; name?: string; prompt?: string; view?: Manifest['rig']['view']; template_id?: string }
  interface State { character: Character & { id: string; name: string }; frames: { rotations: Record<string, string>; animations: Record<string, Record<string, string[]>> } }
  let meta = json(files, 'metadata.json') as Character & { character?: Character; states?: State[] };
  const states = meta.states?.map((s) => ({ id: s.character.id, name: s.character.name }));
  if (meta.states) {
    const selected = stateId ? meta.states.find((s) => s.character.id === stateId) : meta.states[0];
    if (!selected?.frames?.rotations) throw new Error('This PixelLab export does not include the selected character state.');
    const mapped = new Map<string, Uint8Array>();
    for (const [dir, path] of Object.entries(selected.frames.rotations)) mapped.set(`rotations/${dir}.png`, required(files, path));
    for (const [anim, dirs] of Object.entries(selected.frames.animations ?? {})) for (const [dir, frames] of Object.entries(dirs)) frames.forEach((path, i) => mapped.set(`animations/${anim}/${dir}/frame_${i}.png`, required(files, path)));
    stateId = selected.character.id;
    meta = { character: selected.character };
    files = mapped;
  }
  const name = meta.name ?? meta.character?.name ?? 'Imported character', prompt = meta.prompt ?? meta.character?.prompt ?? name;
  const rotations = [...files.keys()].flatMap((p) => { const match = /^rotations\/([a-z-]+)\.png$/.exec(p); return match && DIRECTIONS.includes(match[1] as DirectionName) ? [{ dir: match[1] as DirectionName, path: p }] : []; });
  if (!rotations.length) throw new Error('This PixelLab ZIP has no supported rotation images. Export a single character with rotations/ and animations/ folders.');
  const directions = DIRECTIONS.filter((d) => rotations.some((r) => r.dir === d));
  const source = new Map<string, Map<DirectionName, { index: number; path: string }[]>>();
  for (const p of files.keys()) {
    const m = /^animations\/([^/]+)\/([a-z-]+)\/frame_(\d+)\.png$/.exec(p);
    if (!m) continue;
    const dir = m[2] as DirectionName;
    if (!directions.includes(dir)) throw new Error(`The ${dir} animation has no matching rotation.`);
    const dirs = source.get(m[1]) ?? new Map(); source.set(m[1], dirs);
    dirs.set(dir, [...(dirs.get(dir) ?? []), { index: +m[3], path: p }]);
  }
  const images = new Map<string, Img>(), cells: NonNullable<Manifest['items'][number]['layers'][number]['cells']> = {};
  let semi = 0;
  const first = await image(required(files, rotations[0].path)), char = Math.min(first.w, 64);
  const put = async (path: string) => {
    const im = await image(required(files, path)), n = normalize(im, 64, 64, 128, char);
    if (n.cutPx) throw new Error(`${path} would lose ${n.cutPx} visible pixels in a 64 px cell. Import a smaller character; artwork is never rescaled.`);
    if (!hasPixels(n.img)) throw new Error(`${path} is an empty frame.`);
    semi += n.semiAlpha;
    const h = await cellHash(n.img); images.set(h, n.img); return h;
  };
  // The rotations are the Default move (its id is reserved: a supplied animation of that name takes a -copy suffix below).
  const restId = DEFAULT_MOVE;
  cells[restId] = {};
  for (const r of rotations) cells[restId][r.dir] = [await put(r.path)];
  const animations: Manifest['rig']['animations'] = [{ id: restId, cells: 1, loop: true, frames: playlist(1, 150) }];
  for (const [rawId, dirs] of source) {
    let id = rawId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'move';
    while (animations.some((a) => a.id === id)) id += '-copy';
    const counts = [...dirs.values()].map((frames) => frames.length), n = counts[0];
    if (!n || n > 120 || counts.some((c) => c !== n)) throw new Error(`${rawId} has inconsistent frame counts between directions.`);
    cells[id] = {};
    for (const [dir, frames] of dirs) {
      frames.sort((a, b) => a.index - b.index);
      if (frames.some((f, i) => f.index !== frames[0].index + i)) throw new Error(`${rawId}/${dir} is missing animation frames.`);
      cells[id][dir] = [];
      for (const frame of frames) cells[id][dir]!.push(await put(frame.path));
    }
    animations.push({ id, cells: n, loop: true, frames: playlist(n, 100) });
  }
  const rest = images.get(cells[restId][directions[0]]![0]!)!;
  const view = meta.view ?? meta.character?.view ?? 'low top-down', template = meta.template_id ?? meta.character?.template_id ?? 'mannequin';
  if (!['low top-down', 'high top-down', 'side'].includes(view)) throw new Error('The character has an unsupported camera view.');
  const rig: Manifest['rig'] = { cell: { w: 64, h: 64 }, pivot: pivotOf(rest), directions: directions.map((id) => ({ id })), animations, baseItem: 'base', baseHash: 'sha256:' as Sha256, view, template };
  const hashes: Record<string, Sha256> = {};
  const empty = await cellHash(makeImg(64, 64));
  for (const a of animations) for (const d of directions) for (let i = 0; i < a.cells; i++) hashes[`${a.id}/${d}/${i}`] = cells[a.id][d]?.[i] ?? empty;
  rig.baseHash = await baseHashOf(rig, hashes);
  const manifest: Manifest = { format: 'pixeldoll/1', app: 'PixelDoll 0.1.0', name, rig, materials: [], slots: [{ id: 'body', z: 10, class: 'base', required: true }], items: [{ id: 'base', name: 'Base body', slot: 'body', status: 'accepted', mirror: 'generate', materials: [], prompt, baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: 10, cells }], provenance: [] }], presets: [{ id: 'default', name: 'Base', items: { body: 'base' }, variants: {} }] };
  return { project: { manifest, images }, extra: {}, states, stateId, warnings: ['Imported artwork is the fixed base: existing clothes and hair cannot be removed. Set up its pose rig to use skeleton-posed equipment and add new moves.', ...(semi ? ['Partially transparent edges were converted to pixel-art transparency.'] : [])] };
}

export async function saveImportedCharacter(imported: ImportedCharacter, name: string): Promise<string> {
  if (!name.trim() || name.trim().length > 60) throw new Error('Enter a character name of 1–60 characters.');
  const manifest = structuredClone(imported.project.manifest);
  manifest.name = name.trim();
  const id = `rig-${crypto.randomUUID()}`; // Always a new copy; never overwrite another character with the same body.
  const blobs = new Map<string, Blob>();
  for (const [h, im] of imported.project.images) blobs.set(h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  const rec: StoredProject = { id, savedAt: new Date().toISOString(), manifest, ...imported.extra, origin: 'studio' };
  await db.putCharacter(id, rec, blobs);
  db.askPersist();
  return id;
}
