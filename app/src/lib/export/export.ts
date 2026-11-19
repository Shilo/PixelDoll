// Project -> export zip entries (manifest-spec §5 layout). Pure; runs in the browser and in node (scripts/export-fixture.ts).
import type { Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import type { Engine, Project } from '../store/manifest.ts';
import { fitsEditableZip, MAX_ZIP_BYTES, zip, type ZipEntry } from '../store/zip.ts';
import {
	bodyCutVariantCount,
	bodyCutVariantLimit,
	cellImg,
	MAX_BODY_CUT_VARIANTS,
	withTuckVariants
} from '../compose/compose.ts';
import { asepriteFiles } from './aseprite.ts';
import { coreFiles, exportManifest, genericFiles, validate, type OutFile } from './generic.ts';
import { godotFiles } from './godot.ts';
import { phaserFiles } from './phaser.ts';
import { unityFiles } from './unity.ts';
import { gdevelopFiles } from './gdevelop.ts';
import { rpgMakerFiles } from './rpgmaker.ts';
import { checkArchivePixels, projectEntries, type ImportedCharacter } from '../store/import.ts';
import { reservedPathSegment } from './paths.ts';

export interface ExportOptions {
	engines: Engine[];
	baked: boolean;
	pixelsPerUnit?: number;
	exportedAt?: string;
	projectData?: ImportedCharacter['extra'];
}
export interface ExportResult {
	entries: ZipEntry[];
	warnings: string[];
	errors: string[];
	problem?: string;
}

export async function exportFiles(src: Project, o: ExportOptions): Promise<ExportResult> {
	const invalid = validate(src);
	if (o.pixelsPerUnit !== undefined && (!Number.isFinite(o.pixelsPerUnit) || o.pixelsPerUnit <= 0))
		invalid.push('Pixels per unit must be a positive finite number.');
	const bodyVariants = bodyCutVariantCount(src.manifest);
	if (bodyVariants > MAX_BODY_CUT_VARIANTS) invalid.push(bodyCutVariantLimit(bodyVariants));
	// Body variants include combined covers. Other clipped slots still support one covering slot.
	const source = src.manifest;
	const populated = new Set(
		source.items
			.filter((it) => !it.variantOf && it.baseHash === source.rig.baseHash)
			.map((it) => it.slot)
	);
	for (const target of source.slots.filter((s) => s.id !== 'body' && populated.has(s.id))) {
		const covers = source.slots.filter(
			(s) =>
				s.id !== target.id &&
				s.clips?.includes(target.id) &&
				source.items.some(
					(it) =>
						it.slot === s.id &&
						!it.variantOf &&
						it.baseHash === source.rig.baseHash &&
						!(it.hides ?? s.hides ?? []).includes(target.id)
				)
		);
		if (new Set(covers.map((s) => s.id)).size > 1)
			invalid.push(
				`${target.id}: export supports one populated clipping slot; ${covers.map((s) => s.id).join(', ')} can cover it together. Remove the overlapping clips rules before exporting.`
			);
	}
	if (invalid.length) return { entries: [], warnings: [], errors: invalid };
	const base = src.manifest.items.find((it) => it.id === src.manifest.rig.baseItem);
	if (base && base.baseHash !== src.manifest.rig.baseHash)
		return {
			entries: [],
			warnings: [],
			errors: ['The base body is stale; freeze a matching base before exporting.'],
			problem: 'The body frames no longer match this character.'
		};
	const p = await withTuckVariants(src); // B14: hair under a helmet ships as a baked "<hair>~<helmet>" item; engines swap to it
	const errors = validate(p);
	if (errors.length) return { entries: [], warnings: [], errors };
	if (
		!base?.layers.some((l) =>
			p.manifest.rig.animations.some((a) =>
				p.manifest.rig.directions.some((d) =>
					Array.from({ length: a.cells }, (_, i) => cellImg(p, l, a.id, d.id, i)).some((im) =>
						im?.data.some((v, i) => i % 4 === 3 && v)
					)
				)
			)
		)
	) {
		return {
			entries: [],
			warnings: [],
			errors: ['The base body has no visible animation frames to export.'],
			problem: 'The body has no visible frames.'
		};
	}
	const { manifest: m, warnings } = exportManifest(p, o);
	// RPG Maker uses no layers, manifest or generic README: its zip holds only its sheets, README and the editable copy
	const rpg = o.engines.includes('rpgmaker')
		? 'vx'
		: o.engines.includes('rpgmakerxp')
			? 'xp'
			: null;
	if (rpg && o.engines.length > 1)
		return {
			entries: [],
			warnings,
			errors: ['RPG Maker sheets export on their own; choose one format.']
		};
	const files: OutFile[] = rpg ? [] : coreFiles(p, m);
	const sheets = new Map(
		files.flatMap((f) =>
			typeof f.data === 'object' && 'w' in f.data ? [[f.name, f.data] as [string, Img]] : []
		)
	);
	if (!rpg)
		files.push(
			...genericFiles(p, m, sheets, { strips: o.engines.includes('generic'), baked: o.baked })
		);
	if (o.engines.includes('godot')) {
		try {
			files.push(...godotFiles(m));
		} catch (error) {
			if (!(error instanceof Error) || !error.message.startsWith('Godot: ')) throw error;
			return {
				entries: [],
				warnings,
				errors: [error.message],
				problem: 'Godot could not use these sprite sheets.'
			};
		}
	}
	if (o.engines.includes('phaser')) files.push(...phaserFiles(m));
	if (o.engines.includes('unity')) files.push(...unityFiles(m));
	if (o.engines.includes('gdevelop')) {
		try {
			files.push(...gdevelopFiles(m, sheets));
		} catch (error) {
			if (!(error instanceof Error) || !error.message.startsWith('GDevelop: ')) throw error;
			return {
				entries: [],
				warnings,
				errors: [error.message],
				problem: 'GDevelop could not use these sprite sheets.'
			};
		}
	}
	if (rpg) {
		try {
			const r = rpgMakerFiles(p, m, rpg);
			files.push(...r.files);
			warnings.push(...r.warnings);
		} catch (error) {
			if (!(error instanceof Error) || !error.message.startsWith('RPG Maker: ')) throw error;
			return {
				entries: [],
				warnings,
				errors: [error.message],
				problem: 'RPG Maker needs front, side and back views.'
			};
		}
	}
	if (o.engines.includes('aseprite')) {
		try {
			files.push(...(await asepriteFiles(m, sheets)));
		} catch (error) {
			if (!(error instanceof Error) || !error.message.startsWith('Aseprite ')) throw error;
			return {
				entries: [],
				warnings,
				errors: [error.message],
				problem: 'The animation does not fit the Aseprite format.'
			};
		}
	}
	const projectFiles = await projectEntries(src, o.projectData);
	const names = new Set<string>();
	for (const { name } of [...files, ...projectFiles]) {
		if (name.split('/').some(reservedPathSegment))
			errors.push(`Reserved Windows export path: ${name}. This export cannot be packaged safely.`);
		if (
			!name ||
			/[\\:\u0000-\u001f]/.test(name) ||
			name.split('/').some((part) => !part || part === '.' || part === '..')
		)
			errors.push(`Unsafe export path: ${name}`);
		if (names.has(name)) errors.push(`Duplicate export path: ${name}`);
		names.add(name);
	}
	if (errors.length)
		return { entries: [], warnings, errors, problem: 'Some file names cannot be packaged safely.' };
	const enc = new TextEncoder();
	const entries = await Promise.all(
		files.map(async (f: OutFile) => ({
			name: f.name,
			data:
				typeof f.data === 'string'
					? enc.encode(f.data)
					: f.data instanceof Uint8Array
						? f.data
						: await encodePngBytes(f.data)
		}))
	);
	entries.push(...projectFiles);
	return { entries, warnings, errors };
}

export async function exportZip(p: Project, o: ExportOptions, notes?: string[]) {
	const r = await exportFiles(p, o);
	if (r.errors.length) return { ...r, zip: null };
	const warnings = [...new Set([...(notes ?? []), ...r.warnings])];
	if (notes && warnings.length)
		r.entries.push({
			name: 'Export notes.txt',
			data: new TextEncoder().encode(warnings.join('\n'))
		});
	const oversized = () => ({
		entries: [],
		warnings,
		zip: null,
		problem: 'This export is too large.',
		errors: ['The archive exceeds PixelDoll’s size limits.']
	});
	if (!fitsEditableZip(r.entries)) return oversized();
	try {
		checkArchivePixels(
			r.entries.filter(({ name }) => name.startsWith('cells/')).map(({ data }) => data)
		);
	} catch {
		return oversized();
	}
	let bytes: Uint8Array;
	try {
		bytes = await zip(r.entries, { deflate: true });
	} catch (error) {
		console.warn('Could not compress export; saving without ZIP compression', error);
		bytes = await zip(r.entries);
	}
	return bytes.length <= MAX_ZIP_BYTES ? { ...r, warnings, zip: bytes } : oversized();
}
