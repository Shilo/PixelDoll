// Project -> export zip entries (manifest-spec §5 layout). Pure; runs in the browser and in node (scripts/export-fixture.ts).
import type { Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import type { Engine, Project } from '../store/manifest.ts';
import { zip, type ZipEntry } from '../store/zip.ts';
import { withTuckVariants } from '../compose/compose.ts';
import { asepriteFiles } from './aseprite.ts';
import { coreFiles, exportManifest, genericFiles, validate, type OutFile } from './generic.ts';
import { godotFiles } from './godot.ts';
import { phaserFiles } from './phaser.ts';
import { unityFiles } from './unity.ts';
import { projectEntries, type ImportedCharacter } from '../store/import.ts';

export interface ExportOptions { engines: Engine[]; baked: boolean; pixelsPerUnit?: number; exportedAt?: string; projectData?: ImportedCharacter['extra'] }
export interface ExportResult { entries: ZipEntry[]; warnings: string[]; errors: string[] }

export async function exportFiles(src: Project, o: ExportOptions): Promise<ExportResult> {
  const p = await withTuckVariants(src); // B14: hair under a helmet ships as a baked "<hair>~<helmet>" item; engines swap to it
  const errors = validate(p);
  if (errors.length) return { entries: [], warnings: [], errors };
  const { manifest: m, warnings } = exportManifest(p, o);
  const files = coreFiles(p, m);
  const sheets = new Map(files.flatMap((f) => (typeof f.data === 'object' && 'w' in f.data ? [[f.name, f.data] as [string, Img]] : [])));
  files.push(...genericFiles(p, m, sheets, { strips: o.engines.includes('generic'), baked: o.baked }));
  if (o.engines.includes('godot')) files.push(...godotFiles(m));
  if (o.engines.includes('phaser')) files.push(...phaserFiles(m));
  if (o.engines.includes('unity')) files.push(...unityFiles(m));
  if (o.engines.includes('aseprite')) files.push(...await asepriteFiles(m, sheets));
  const enc = new TextEncoder();
  const entries = await Promise.all(files.map(async (f: OutFile) => ({
    name: f.name,
    data: typeof f.data === 'string' ? enc.encode(f.data) : f.data instanceof Uint8Array ? f.data : await encodePngBytes(f.data),
  })));
  entries.push(...await projectEntries(src, o.projectData));
  return { entries, warnings, errors };
}

export async function exportZip(p: Project, o: ExportOptions) {
  const r = await exportFiles(p, o);
  return { ...r, zip: r.errors.length ? null : await zip(r.entries, { deflate: true }) };
}
