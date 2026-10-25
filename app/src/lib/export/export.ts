// Project -> export zip entries (manifest-spec §5 layout). Pure; runs in the browser and in node (scripts/export-fixture.ts).
import type { Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import type { Engine, Project } from '../store/manifest.ts';
import { zip, type ZipEntry } from '../store/zip.ts';
import { cellImg, withTuckVariants } from '../compose/compose.ts';
import { asepriteFiles } from './aseprite.ts';
import { coreFiles, exportManifest, genericFiles, validate, type OutFile } from './generic.ts';
import { godotFiles } from './godot.ts';
import { phaserFiles } from './phaser.ts';
import { unityFiles } from './unity.ts';
import { gdevelopFiles } from './gdevelop.ts';
import { projectEntries, type ImportedCharacter } from '../store/import.ts';

export interface ExportOptions { engines: Engine[]; baked: boolean; pixelsPerUnit?: number; exportedAt?: string; projectData?: ImportedCharacter['extra'] }
export interface ExportResult { entries: ZipEntry[]; warnings: string[]; errors: string[] }

export async function exportFiles(src: Project, o: ExportOptions): Promise<ExportResult> {
  const invalid = validate(src);
  if (o.pixelsPerUnit !== undefined && (!Number.isFinite(o.pixelsPerUnit) || o.pixelsPerUnit <= 0)) invalid.push('Pixels per unit must be a positive finite number.');
  // Baked variants represent one covering item. Two independently equipped covering slots need a combined mask.
  const source = src.manifest;
  const populated = new Set(source.items.filter((it) => !it.variantOf && it.baseHash === source.rig.baseHash).map((it) => it.slot));
  for (const target of source.slots.filter((s) => populated.has(s.id))) {
    const covers = source.slots.filter((s) => s.id !== target.id && s.clips?.includes(target.id) && source.items.some((it) =>
      it.slot === s.id && !it.variantOf && it.baseHash === source.rig.baseHash && !(it.hides ?? s.hides ?? []).includes(target.id)));
    if (new Set(covers.map((s) => s.id)).size > 1) invalid.push(`${target.id}: export supports one populated clipping slot; ${covers.map((s) => s.id).join(', ')} can cover it together. Remove the overlapping clips rules before exporting.`);
  }
  if (invalid.length) return { entries: [], warnings: [], errors: invalid };
  const base = src.manifest.items.find((it) => it.id === src.manifest.rig.baseItem);
  if (base && base.baseHash !== src.manifest.rig.baseHash) return { entries: [], warnings: [], errors: ['The base body is stale; freeze a matching base before exporting.'] };
  const p = await withTuckVariants(src); // B14: hair under a helmet ships as a baked "<hair>~<helmet>" item; engines swap to it
  const errors = validate(p);
  if (errors.length) return { entries: [], warnings: [], errors };
  if (!base?.layers.some((l) => p.manifest.rig.animations.some((a) => p.manifest.rig.directions.some((d) =>
    Array.from({ length: a.cells }, (_, i) => cellImg(p, l, a.id, d.id, i)).some((im) => im?.data.some((v, i) => i % 4 === 3 && v)))))) {
    return { entries: [], warnings: [], errors: ['The base body has no visible animation frames to export.'] };
  }
  const { manifest: m, warnings } = exportManifest(p, o);
  // round 3 baseCut: engines swap to one "<base>~<item>" sheet; the Studio hides the union when two such items are worn
  const cutSlots = [...new Set(src.manifest.items.filter((it) => it.baseCut && !it.variantOf && it.baseHash === src.manifest.rig.baseHash).map((it) => it.slot))];
  if (cutSlots.length > 1) warnings.push(`Items in ${cutSlots.join(', ')} each hide body pixels (ears under a hood). Worn together, game engines hide only one item's pixels; the Studio preview hides both.`);
  const files = coreFiles(p, m);
  const sheets = new Map(files.flatMap((f) => (typeof f.data === 'object' && 'w' in f.data ? [[f.name, f.data] as [string, Img]] : [])));
  files.push(...genericFiles(p, m, sheets, { strips: o.engines.includes('generic'), baked: o.baked }));
  if (o.engines.includes('godot')) {
    try { files.push(...godotFiles(m)); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Godot: ')) throw error;
      return { entries: [], warnings, errors: [error.message] };
    }
  }
  if (o.engines.includes('phaser')) files.push(...phaserFiles(m));
  if (o.engines.includes('unity')) files.push(...unityFiles(m));
  if (o.engines.includes('gdevelop')) {
    try { files.push(...gdevelopFiles(m, sheets)); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('GDevelop: ')) throw error;
      return { entries: [], warnings, errors: [error.message] };
    }
  }
  if (o.engines.includes('aseprite')) {
    try { files.push(...await asepriteFiles(m, sheets)); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Aseprite ')) throw error;
      return { entries: [], warnings, errors: [error.message] };
    }
  }
  const projectFiles = await projectEntries(src, o.projectData);
  const names = new Set<string>();
  for (const { name } of [...files, ...projectFiles]) {
    if (!name || /[\\:\u0000-\u001f]/.test(name) || name.split('/').some((part) => !part || part === '.' || part === '..')) errors.push(`Unsafe export path: ${name}`);
    if (names.has(name)) errors.push(`Duplicate export path: ${name}`);
    names.add(name);
  }
  if (errors.length) return { entries: [], warnings, errors };
  const enc = new TextEncoder();
  const entries = await Promise.all(files.map(async (f: OutFile) => ({
    name: f.name,
    data: typeof f.data === 'string' ? enc.encode(f.data) : f.data instanceof Uint8Array ? f.data : await encodePngBytes(f.data),
  })));
  entries.push(...projectFiles);
  return { entries, warnings, errors };
}

export async function exportZip(p: Project, o: ExportOptions) {
  const r = await exportFiles(p, o);
  return { ...r, zip: r.errors.length ? null : await zip(r.entries, { deflate: true }) };
}
