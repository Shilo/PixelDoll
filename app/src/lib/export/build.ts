// What the Export sheet and the ⋮ menus' Download ZIP export: a character with its current look and saved outfits, or
// a single item on the base body. Pure; the Studio supplies the project, look and settings.
import { CURRENT_OUTFIT_ID } from '../store/identity.ts';
import { playbackClips } from '../runtime/timeline.js';
import type { ActionSheetOptions } from './sheets.ts';
import { exportZip, type ExportResult, type NoteTerm } from './export.ts';
import { errorTranslation, message, type Message } from '../message.ts';
import { storeVariants, variantOf } from '../dress/dress.ts';
import { itemHashes } from '../equipment/copy.ts';
import { SLOTS } from '../items/slots.ts';
import { retainMoves } from '../rig/moves.ts';
import { cellHash, DEFAULT_MOVE, pinnedArtwork } from '../rig/rig.ts';
import { validEquipment } from '../runtime/paperdoll.js';
import { leaveEmptyFrames, recoverArtwork } from './recovery.ts';
import { applyExportSettings, type ExportSettings } from '../store/export-settings.ts';
import {
	fitsEditableImage,
	hashPattern,
	hasVisibleBase,
	manifestShape,
	type ImportedCharacter
} from '../store/import.ts';
import type { Engine, Item, Manifest, Preset, Project } from '../store/manifest.ts';

export type Look = Pick<Preset, 'items' | 'variants'> & Partial<Pick<Preset, 'id' | 'name'>>;

export async function moveProject(project: Project, moveId: string): Promise<Project> {
	if (!project.manifest.rig.animations.some((move) => move.id === moveId))
		throw new Error('This move is no longer available.');
	const ids = new Set([DEFAULT_MOVE, moveId]);
	for (const item of project.manifest.items) {
		if (item.standing) ids.add(item.standing);
		if (item.route === 'ea2-anchor' && item.anchorCell) ids.add(item.anchorCell.split('/')[0]);
	}
	const manifest = await retainMoves(project.manifest, ids);
	const scoped = new Map(
		playbackClips(manifest.rig.animations).map(({ key, clip, id }) => [key, { clip, id }])
	);
	for (const { key, id } of playbackClips(project.manifest.rig.animations)) {
		const entry = scoped.get(key);
		if (entry && entry.id !== id) entry.clip.exportId = id;
	}
	return { ...project, manifest };
}

export function outfitProject(
	project: Project,
	outfitId: string
): { project: Project; look: Look } {
	const outfit = project.manifest.presets.find((preset) => preset.id === outfitId);
	if (!outfit) throw new Error('This outfit is no longer available.');
	const saved = structuredClone(outfit);
	const selected = lookProject(
		project,
		saved,
		new Set([
			project.manifest.rig.baseItem,
			...Object.values(saved.items).filter((id): id is string => !!id)
		])
	);
	return { ...selected, look: { ...saved, ...selected.look } };
}

async function requestedExport(
	p: Project,
	o: {
		engine: Engine;
		baked: boolean;
		look: Look;
		settings: ExportSettings;
		projectData?: ImportedCharacter['extra'];
		rpgWalk?: string;
		actionLayering?: ActionSheetOptions;
		/** A fixed manifest timestamp, so a project folder republish of an unchanged character writes identical files. */
		exportedAt?: string;
		filesOnly?: boolean;
	}
): Promise<ExportResult & { zip: Uint8Array | null }> {
	const current: Preset = {
		id: o.look.id ?? CURRENT_OUTFIT_ID,
		name: o.look.name ?? 'Current look',
		items: o.look.items,
		variants: o.look.variants
	};
	const presets: Preset[] = [
		current,
		...p.manifest.presets.filter((x) => x.id !== CURRENT_OUTFIT_ID && x.id !== current.id)
	];
	const manifest = structuredClone({ ...p.manifest, presets }) as Manifest;
	const warnings = new Set<string>(),
		warningMessages = new Map<string, Message>();
	const note = (text: string, display: Message) => {
		warnings.add(text);
		warningMessages.set(text, display);
	};
	for (const preset of manifest.presets) {
		const omitted: string[] = [],
			omittedSlots: NoteTerm[] = [];
		for (const [slot, item] of Object.entries(preset.items)) {
			if (slot === 'body' || validEquipment(manifest, slot, item)) continue;
			delete preset.items[slot];
			if (item != null) {
				omitted.push(
					manifest.slots.find((entry) => entry.id === slot)?.label ??
						SLOTS.find((entry) => entry.id === slot)?.label ??
						slot.replace(/[_-]/g, ' ')
				);
				omittedSlots.push({ slot });
			}
		}
		if (omitted.length)
			note(
				`${preset.name}: Missing equipment was left out (${omitted.join(', ')}).`,
				message('export.warnings.missingEquipment', {
					outfit:
						preset.id === current.id && o.look.name === undefined
							? message('export.outfits.current')
							: preset.name,
					slots: omittedSlots
				})
			);
	}
	applyExportSettings(manifest, o.settings);
	storeVariants(manifest, ...presets.map((x) => x.variants));
	for (const warning of leaveEmptyFrames({ manifest, images: p.images }, warningMessages))
		warnings.add(warning);
	const blocked = (problem: string, problemMessage: Message, error?: unknown) => ({
		zip: null,
		entries: [],
		warnings: [...warnings],
		warningMessages,
		errors: error === undefined ? [] : [String(error)],
		errorMessages: error === undefined ? [] : [errorTranslation(error)],
		problem,
		problemMessage
	});
	try {
		manifestShape(manifest);
	} catch (error) {
		return blocked(
			'This character does not fit the export limits.',
			message('export.problem.characterLimits'),
			error
		);
	}
	if (!hasVisibleBase({ manifest, images: p.images }))
		return blocked('The body has no visible frames.', message('export.problem.noVisibleFrames'));
	const images: Project['images'] = new Map();
	const missing = new Set<string>();
	async function include(hash: string) {
		if (images.has(hash)) return true;
		if (missing.has(hash)) return false;
		const image = p.images.get(hash);
		if (
			!image ||
			!hashPattern.test(hash) ||
			!fitsEditableImage(image) ||
			(await cellHash(image)) !== hash
		) {
			missing.add(hash);
			return false;
		}
		images.set(hash, image);
		return true;
	}
	for (const view of Object.keys(manifest.rig.rest ?? {}) as (keyof NonNullable<
		Manifest['rig']['rest']
	>)[]) {
		const rest = manifest.rig.rest?.[view];
		if (rest && !(await include(rest.image))) {
			delete manifest.rig.rest![view];
			note(
				'Missing body reference images were left out of the editable copy.',
				message('export.warnings.bodyReferences')
			);
		}
	}
	// A move started from another move's frame keeps that frame even when the other move is left out or changed.
	for (const source of manifest.rig.animations.flatMap((a) => Object.values(a.sources ?? {})))
		if (source?.referenceKeypoints && !(await include(source.reference))) {
			delete source.referenceKeypoints;
			note(
				'Missing body reference images were left out of the editable copy.',
				message('export.warnings.bodyReferences')
			);
		}
	for (const item of manifest.items) {
		for (const facing of Object.keys(item.dressed ?? {}) as (keyof NonNullable<
			Item['dressed']
		>)[]) {
			const hash = item.dressed?.[facing];
			if (hash && !(await include(hash))) {
				delete item.dressed![facing];
				note(
					`${item.name}: Missing reference images were left out of the editable copy.`,
					message('export.warnings.itemReferences', { item: item.name })
				);
			}
		}
		for (const hash of itemHashes(item))
			if (!(await include(hash)))
				return blocked('Some saved images are damaged.', message('export.problem.damagedImages'));
	}
	return exportZip(
		{ manifest, images },
		{
			engines: [o.engine],
			baked: o.baked,
			projectData: o.projectData,
			rpgWalk: o.rpgWalk,
			actionLayering: o.actionLayering,
			exportedAt: o.exportedAt,
			filesOnly: o.filesOnly
		},
		[...warnings],
		warningMessages
	);
}

const SKIPPED_SOURCES = 'Some source images could not be included.';

export async function buildExport(
	project: Project,
	options: Parameters<typeof requestedExport>[1]
) {
	let problem = 'Could not build this export.';
	let problemMessage = message('export.problem.buildFailed');
	let errors: string[] = [];
	let errorMessages: ExportResult['errorMessages'];
	let requestedWarnings: string[] = [];
	let requestedWarningMessages: ExportResult['warningMessages'];
	let retryable = false;
	try {
		const result = await requestedExport(project, options);
		if (result.zip) return { ...result, kind: 'requested' as const };
		problem = result.problem ?? problem;
		problemMessage = result.problemMessage ?? problemMessage;
		errors = result.errors;
		errorMessages = result.errorMessages;
		requestedWarnings = result.warnings;
		requestedWarningMessages = result.warningMessages;
	} catch (error) {
		console.error('Could not build export', error);
		retryable = true;
	}
	try {
		const recovery = await recoverArtwork(project, problem);
		if (recovery)
			return {
				kind: 'recovery' as const,
				...recovery,
				problem,
				problemMessage,
				errors,
				errorMessages,
				requestedWarnings,
				requestedWarningMessages,
				warnings: recovery.skipped ? [SKIPPED_SOURCES] : [],
				warningMessages: new Map([[SKIPPED_SOURCES, message('export.warnings.skippedSources')]])
			};
		return {
			kind: 'failed' as const,
			zip: null,
			entries: [],
			problem,
			problemMessage,
			errors,
			errorMessages,
			warnings: [],
			retryable
		};
	} catch (error) {
		console.error('Could not build recovery ZIP', error);
		return {
			kind: 'failed' as const,
			zip: null,
			entries: [],
			problem: 'The artwork ZIP could not be prepared.',
			problemMessage: message('export.problem.artworkFailed'),
			errors,
			errorMessages,
			warnings: [],
			retryable: true
		};
	}
}

const covers = (it: Item) =>
	Array.isArray(it.underAll) ? it.underAll : it.under ? [it.under] : [];

/** Only the base body and one item (with its own tucked variants), worn in the given colors and without saved outfits:
 *  the item's frames line up with the body they were fitted to, and the export still imports back as a character. */
export function itemProject(
	p: Project,
	itemId: string,
	look: Look
): { project: Project; look: Look } {
	const m = p.manifest,
		it = m.items.find((i) => i.id === itemId && !i.variantOf);
	if (!it || it.id === m.rig.baseItem) throw new Error('That item is no longer on this character.');
	const kept = new Set([m.rig.baseItem, it.id]);
	return lookProject(
		p,
		{ items: { body: m.rig.baseItem, [it.slot]: it.id }, variants: look.variants },
		kept
	);
}

function lookProject(
	p: Project,
	look: Look,
	kept: ReadonlySet<string>
): { project: Project; look: Look } {
	const m = p.manifest;
	const items = structuredClone(
		m.items.filter(
			(i) =>
				kept.has(i.id) ||
				(!!i.variantOf && kept.has(i.variantOf) && covers(i).every((c) => kept.has(c)))
		)
	);
	const owners = new Set(items.map((i) => i.id));
	const materials = structuredClone(m.materials.filter((mat) => owners.has(mat.owner)));
	const variants: Preset['variants'] = {};
	for (const mat of materials) {
		const chosen = variantOf(m, look.variants, mat.id);
		// A color that follows a left-out item's color keeps today's result, as when that item is removed.
		if (mat.linkTo && !materials.some((x) => x.id === mat.linkTo)) {
			delete mat.linkTo;
			delete mat.defaultVariant;
		}
		if (chosen && !mat.linkTo) variants[mat.id] = chosen;
	}
	const hashes = new Set<string>(items.flatMap(itemHashes));
	for (const view of Object.values(m.rig.rest ?? {})) if (view?.image) hashes.add(view.image);
	for (const hash of pinnedArtwork(m.rig)) hashes.add(hash);
	return {
		project: {
			manifest: { ...m, items, materials, presets: [] },
			images: new Map([...p.images].filter(([h]) => hashes.has(h)))
		},
		look: { items: { ...look.items, body: m.rig.baseItem }, variants }
	};
}
