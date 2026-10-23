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
import { projectEntries, type ImportedCharacter } from '../store/import.ts';

export interface ExportOptions { engines: Engine[]; baked: boolean; pixelsPerUnit?: number; exportedAt?: string; projectData?: ImportedCharacter['extra'] }
export interface ExportResult { entries: ZipEntry[]; warnings: string[]; errors: string[] }

export async function exportFiles(src: Project, o: ExportOptions): Promise<ExportResult> {
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
  const files = coreFiles(p, m);
  const sheets = new Map(files.flatMap((f) => (typeof f.data === 'object' && 'w' in f.data ? [[f.name, f.data] as [string, Img]] : [])));
  files.push(...genericFiles(p, m, sheets, { strips: o.engines.includes('generic'), baked: o.baked }));
  if (o.engines.includes('godot')) files.push(...godotFiles(m));
  if (o.engines.includes('phaser')) files.push(...phaserFiles(m));
  if (o.engines.includes('unity')) files.push(...unityFiles(m));
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
