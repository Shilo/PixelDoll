// Generic export (manifest-spec §3, §5, §6.6): validation, the exported manifest.json, _stripN strips, baked composites,
import type { Img } from '../image/png.ts';
import { DIRECTIONS, exportUnit, validateRig } from '../rig/rig.ts';
import { centeredMirrorFrame } from '../rig/mirror.ts';
import type { Engine, Item, Manifest, Preset, Project } from '../store/manifest.ts';
import { mountSeatOffset, reviewedSeatPoint, riderSeatOffset } from '../rig/riderSeat.ts';
import { CURRENT_FORMAT } from '../store/manifest.ts';
import { behaviorOf, SLOTS } from '../items/slots.ts';
import { bakedSheet, layerSheet, sheetPath, sheetRow } from './sheets.ts';
import { moveDirs, recolor, storeVariants, variantOf, variantRampOf } from '../dress/dress.ts';
import { bakedFrame, layerFrame, tuckedId, variantCovers } from '../compose/compose.ts';
import { validFrameEdits, validPaletteRepairs } from '../dress/item-palette.ts';
import { resolvePreset } from '../runtime/paperdoll.js';
import { bakedSheetPath, portablePathId } from './paths.ts';
import { message, type Message } from '../message.ts';

export type OutFile = { name: string; data: string | Img | Uint8Array };
const nativeDepth = (z: number) => Number.isInteger(z) && z >= -2147483648 && z <= 2147483647;
const SLOT_CLASSES = new Set(['base', 'rigid', 'held', 'worn']);
const SLOT_ANCHORS = new Set(['head', 'neck', 'hip', 'hand_l', 'hand_r', 'foot_l', 'foot_r']);

/** Invariants checked before export (spec §3); export refuses on any error. Stale items are warnings, not errors. */
/** baseCut: known moves and generated directions, one entry per cell, null or strictly increasing rig-cell indices. */
const validCut = (m: Manifest, cut: NonNullable<Item['baseCut']>) =>
	typeof cut === 'object' &&
	cut !== null &&
	Object.entries(cut).every(([anim, dirs]) => {
		const a = m.rig.animations.find((x) => x.id === anim),
			n = m.rig.cell.w * m.rig.cell.h;
		return (
			!!a &&
			typeof dirs === 'object' &&
			dirs !== null &&
			Object.entries(dirs).every(
				([d, cells]) =>
					m.rig.directions.some((x) => x.id === d && !x.mirrorOf) &&
					Array.isArray(cells) &&
					cells.length === a.cells &&
					cells.every(
						(c) =>
							c === null ||
							(Array.isArray(c) &&
								c.length <= n &&
								c.every((p, i) => Number.isInteger(p) && p >= 0 && p < n && (!i || p > c[i - 1])))
					)
			)
		);
	});
export function validate(p: Project): string[] {
	const m = p.manifest,
		e = validateRig(m.rig);
	if (m.format !== CURRENT_FORMAT) e.push(`unsupported manifest format: ${m.format}`);
	for (const preset of m.presets) {
		try {
			resolvePreset(m, preset);
		} catch (error) {
			e.push(
				`${preset.id}: ${String(error instanceof Error ? error.message : error).replace(/^PixelDoll: /, '')}`
			);
		}
	}
	// IDs become archive paths and engine resource names; validate them before producing either.
	const id = /^[a-z0-9][a-z0-9_-]*$/;
	const slotIds = new Set<string>();
	for (const [kind, rows] of [
		['slot', m.slots],
		['material', m.materials],
		['preset', m.presets]
	] as const) {
		const ids = new Set<string>();
		for (const row of rows) {
			if (!row || typeof row !== 'object' || typeof row.id !== 'string') {
				e.push(`${kind} entry has no id`);
				continue;
			}
			if (!id.test(row.id)) e.push(`${kind} id "${row.id}" is invalid`);
			else if (kind === 'slot') slotIds.add(row.id);
			if (ids.has(row.id)) e.push(`duplicate ${kind} id ${row.id}`);
			ids.add(row.id);
		}
	}
	// Built-in keys are valid hide/clip targets even when a project has no item for them yet.
	for (const builtin of SLOTS) slotIds.add(builtin.id);
	const itemIds = new Set<string>();
	for (const it of m.items) {
		const covers = Array.isArray(it.underAll) ? it.underAll : it.under ? [it.under] : [];
		const combined = it.underAll !== undefined;
		const variant =
			it.variantOf &&
			id.test(it.variantOf) &&
			covers.length > 0 &&
			covers.every((cover) => typeof cover === 'string' && id.test(cover)) &&
			(!combined ||
				(it.slot === 'body' &&
					!it.under &&
					covers.length >= 2 &&
					new Set(covers).size === covers.length &&
					covers.join('~') === [...covers].sort().join('~'))) &&
			it.id === tuckedId(it.variantOf, covers);
		if (!id.test(it.id) && !variant) e.push(`item id "${it.id}" is invalid`);
		if ((it.underAll !== undefined || it.under !== undefined) && !variant)
			e.push(`${it.id}: invalid covering equipment requirements`);
		if (itemIds.has(it.id)) e.push(`duplicate item id ${it.id}`);
		itemIds.add(it.id);
		if (new Set(it.layers.map((l) => l.id)).size !== it.layers.length)
			e.push(`${it.id}: duplicate layer id`);
		if (
			it.designWarnings !== undefined &&
			(!Array.isArray(it.designWarnings) ||
				it.designWarnings.length > 100 ||
				it.designWarnings.some(
					(why) => typeof why !== 'string' || !why.trim() || why.length > 2000
				))
		)
			e.push(`${it.id}: invalid accepted appearance warnings`);
		if (it.paletteRepairs !== undefined && !validPaletteRepairs(it.paletteRepairs))
			e.push(`${it.id}: invalid local palette repair history`);
		if (it.frameEdits !== undefined && !validFrameEdits(it.frameEdits))
			e.push(`${it.id}: invalid local frame edit history`);
		if (it.baseCut !== undefined && !validCut(m, it.baseCut))
			e.push(`${it.id}: invalid hidden body pixels (baseCut)`);
	}
	for (const a of m.rig.animations) {
		if (!Number.isInteger(a.cells)) e.push(`${a.id}: cell count must be an integer`);
		for (const f of a.frames)
			if (!Number.isInteger(f.cell)) e.push(`${a.id}: frame cell ${f.cell} must be an integer`);
	}
	const bodies = m.items.filter((i) => i.slot === 'body' && !i.variantOf);
	if (bodies.length !== 1 || bodies[0].id !== m.rig.baseItem)
		e.push('exactly one item in slot "body" must be rig.baseItem');
	for (const variant of m.items.filter((i) => i.slot === 'body' && i.variantOf)) {
		const required = Array.isArray(variant.underAll)
			? variantCovers(variant)
			: variant.under
				? [variant.under]
				: [];
		const covers = required.map((id) => m.items.find((item) => item.id === id));
		if (
			variant.variantOf !== m.rig.baseItem ||
			variant.id !== tuckedId(m.rig.baseItem, required) ||
			!required.length ||
			covers.some(
				(cover) =>
					!cover ||
					cover.variantOf ||
					cover.slot === 'body' ||
					cover.baseHash !== m.rig.baseHash ||
					!(cover.baseCut || m.slots.find((s) => s.id === cover.slot)?.clips?.includes('body'))
			) ||
			new Set(covers.map((cover) => cover?.slot)).size !== covers.length ||
			variant.baseHash !== m.rig.baseHash
		)
			e.push(`${variant.id}: invalid clipped body variant`);
	}
	for (const slot of m.slots) {
		if (!slot || typeof slot !== 'object' || typeof slot.id !== 'string') continue; // reported above
		if (!nativeDepth(slot.z))
			e.push(`${slot.id}: slot depth must be a finite integer in the signed 32-bit range`);
		if (slot.bgZ !== undefined && !nativeDepth(slot.bgZ))
			e.push(`${slot.id}: background depth must be a finite integer in the signed 32-bit range`);
		if (!SLOT_CLASSES.has(slot.class))
			e.push(`${slot.id}: class must be base, rigid, held or worn`);
		if (slot.required !== undefined && typeof slot.required !== 'boolean')
			e.push(`${slot.id}: required must be true or false`);
		if (slot.band !== undefined && typeof slot.band !== 'boolean')
			e.push(`${slot.id}: band must be true or false`);
		if (slot.anchor !== undefined && !SLOT_ANCHORS.has(slot.anchor))
			e.push(`${slot.id}: anchor ${JSON.stringify(slot.anchor)} is not a supported anchor`);
		if (slot.zOverrides !== undefined) {
			if (!Array.isArray(slot.zOverrides)) e.push(`${slot.id}: zOverrides must be a list`);
			else
				for (const [index, override] of slot.zOverrides.entries()) {
					if (!override || typeof override !== 'object') {
						e.push(`${slot.id}: zOverrides[${index}] must be an object`);
						continue;
					}
					if (override.layer !== 'fg' && override.layer !== 'bg')
						e.push(`${slot.id}: zOverrides[${index}] layer must be fg or bg`);
					if (!nativeDepth(override.z))
						e.push(
							`${slot.id}: zOverrides[${index}] depth must be a finite integer in the signed 32-bit range`
						);
					if (override.dir !== undefined && !DIRECTIONS.includes(override.dir))
						e.push(
							`${slot.id}: zOverrides[${index}] has unknown direction ${String(override.dir)}`
						);
					if (
						override.anim !== undefined &&
						!m.rig.animations.some((animation) => animation.id === override.anim)
					)
						e.push(`${slot.id}: zOverrides[${index}] has unknown move ${String(override.anim)}`);
					if (
						override.cell !== undefined &&
						(!Number.isInteger(override.cell) || override.cell < 0)
					)
						e.push(`${slot.id}: zOverrides[${index}] cell must be a non-negative integer`);
				}
		}
		for (const [field, keys] of [
			['hides', slot.hides],
			['clips', slot.clips]
		] as const) {
			if (keys === undefined) continue;
			if (!Array.isArray(keys)) {
				e.push(`${slot.id}: ${field} must be a list`);
				continue;
			}
			const seen = new Set<string>();
			for (const key of keys) {
				if (typeof key !== 'string' || !slotIds.has(key))
					e.push(`${slot.id}: ${field} names unknown slot ${String(key)}`);
				if (seen.has(key)) e.push(`${slot.id}: duplicate ${field} entry ${key}`);
				seen.add(key);
			}
		}
		if (slot.label !== undefined && typeof slot.label !== 'string')
			e.push(`${slot.id}: label must be text`);
		if (slot.origin !== undefined) {
			if (typeof slot.origin !== 'string' || !SLOTS.some((builtin) => builtin.id === slot.origin))
				e.push(`${slot.id}: origin must name a supported built-in slot profile`);
			else if (slot.id !== 'body' && slot.origin === 'body')
				e.push(`${slot.id}: only the Base slot can originate from body`);
		}
		if (slot.profile !== undefined) {
			if (typeof slot.profile !== 'string') e.push(`${slot.id}: profile must be text`);
			else {
				try {
					const resolved = behaviorOf(slot);
					if (resolved !== 'accessory' && !SLOTS.some((builtin) => builtin.id === resolved))
						throw new Error('unsupported');
				} catch {
					e.push(
						`${slot.id}: behavior profile "${slot.profile}" is not supported; choose a built-in slot profile`
					);
				}
				if (slot.profile === 'body' && slot.id !== 'body')
					e.push(`${slot.id}: profile body is reserved for the Base slot`);
			}
		} else
			try {
				const resolved = behaviorOf(slot);
				if (resolved !== 'accessory' && !SLOTS.some((builtin) => builtin.id === resolved))
					throw new Error('unsupported');
			} catch {
				e.push(
					`${slot.id}: behavior profile is missing; choose a built-in slot profile for a custom slot`
				);
			}
		if (
			slot.wardrobeOrder !== undefined &&
			(!Number.isInteger(slot.wardrobeOrder) || slot.wardrobeOrder < 0)
		)
			e.push(`${slot.id}: wardrobeOrder must be a non-negative integer`);
		if (slot.wardrobeHidden !== undefined && typeof slot.wardrobeHidden !== 'boolean')
			e.push(`${slot.id}: wardrobeHidden must be true or false`);
		if (slot.promptTemplate !== undefined && typeof slot.promptTemplate !== 'string')
			e.push(`${slot.id}: promptTemplate must be text`);
		if (slot.icon !== undefined && typeof slot.icon !== 'string')
			e.push(`${slot.id}: icon must be text`);
	}
	const seen = new Map<string, string>(),
		ids = new Set<string>();
	for (const mat of m.materials) {
		if (ids.has(mat.id)) e.push(`duplicate material ${mat.id}`);
		ids.add(mat.id);
		if (!m.items.some((it) => it.id === mat.owner))
			e.push(`${mat.id}: unknown material owner ${mat.owner}`);
		for (const c of mat.ramp) {
			if (typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)) {
				e.push(`${mat.id}: ramp colors must be six-digit #RRGGBB values`);
				continue;
			}
			const key = `${mat.owner}:${c.toLowerCase()}`;
			seen.has(key)
				? e.push(`color ${c} in ramps ${seen.get(key)} and ${mat.id}`)
				: seen.set(key, mat.id);
		}
		for (const [v, r] of Object.entries(mat.variants)) {
			if (r.length !== mat.ramp.length)
				e.push(`${mat.id}.${v}: ${r.length} colors for a ${mat.ramp.length}-color ramp`);
			if (r.some((c) => typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)))
				e.push(`${mat.id}.${v}: variant colors must be six-digit #RRGGBB values`);
		}
		if (
			mat.defaultVariant &&
			mat.ramp.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) &&
			!variantRampOf(mat, mat.defaultVariant)
		)
			e.push(`${mat.id}: invalid default colorway`);
	}
	for (const mat of m.materials)
		if (mat.linkTo && !ids.has(mat.linkTo))
			e.push(`${mat.id}: unknown linked material ${mat.linkTo}`);
	const mirrored = m.rig.directions.some((d) => d.mirrorOf);
	for (const it of m.items) {
		const single =
			it.layers.length === 1 && it.layers[0].id === 'main' && it.layers[0].role === 'fg';
		const split =
			it.layers.length === 2 &&
			it.layers.some((l) => l.id === 'fg' && l.role === 'fg') &&
			it.layers.some((l) => l.id === 'bg' && l.role === 'bg');
		if (!single && !split)
			e.push(`${it.id}: layers must be one main foreground layer or an fg/background bg pair`);
		for (const id of it.materials) {
			const mat = m.materials.find((x) => x.id === id);
			if (!mat || (mat.owner !== it.id && mat.owner !== it.variantOf))
				e.push(`${it.id}: missing or foreign material ${id}`);
		}
		if (!m.slots.some((s) => s.id === it.slot)) e.push(`${it.id}: unknown slot ${it.slot}`);
		for (const l of it.layers) {
			if (!nativeDepth(l.z))
				e.push(`${it.id}.${l.id}: layer depth must be a finite integer in the signed 32-bit range`);
			const f = layerFrame(m.rig, l);
			if (!['main', 'fg', 'bg'].includes(l.id) || !['fg', 'bg'].includes(l.role))
				e.push(`${it.id}: invalid layer id or role`);
			if (
				![f.w, f.h, f.x, f.y].every(Number.isInteger) ||
				f.w < 1 ||
				f.h < 1 ||
				f.w > 256 ||
				f.h > 256 ||
				f.x < 0 ||
				f.x > f.w ||
				f.y < 0 ||
				f.y > f.h
			)
				e.push(
					`${it.id}.${l.id}: cell ${f.w}x${f.h} must be 1–256 px with an integer pivot inside the cell`
				);
			// a mirrored row is a flip of the whole layer cell: only correct if that cell is centered on the rig cell
			if (mirrored && !centeredMirrorFrame(m.rig, f))
				e.push(
					`${it.id}.${l.id}: cell ${f.w} with pivot x ${f.x} is not centered on the rig cell (mirrored directions flip it)`
				);
			for (const [anim, dirs] of Object.entries(l.cells ?? {})) {
				const a = m.rig.animations.find((x) => x.id === anim);
				if (!a) {
					e.push(`${it.id}.${l.id}: unknown animation ${anim}`);
					continue;
				}
				for (const [dir, cells] of Object.entries(dirs ?? {})) {
					if (!cells) continue; // an empty row: this layer draws nothing in that direction (manifestShape allows it)
					if (cells.length !== a.cells)
						e.push(`${it.id}.${l.id} ${anim}/${dir}: ${cells.length} cells, rig has ${a.cells}`);
					for (const h of cells) {
						const im = h && p.images.get(h);
						if (h && !im)
							e.push(`${it.id}.${l.id} ${anim}/${dir}: image ${h.slice(0, 15)} missing`);
						else if (im && (im.w !== f.w || im.h !== f.h))
							e.push(
								`${it.id}.${l.id} ${anim}/${dir}: cell ${im.w}x${im.h}, layer cell ${f.w}x${f.h}`
							);
					}
				}
			}
		}
	}
	return e;
}

export interface ManifestOptions {
	engines: Engine[];
	baked: boolean;
	pixelsPerUnit?: number;
	exportedAt?: string;
}

/** project manifest -> exported manifest.json: cells dropped, sheet paths added, stale items excluded. */
export function exportManifest(
	p: Project,
	o: ManifestOptions
): { manifest: Manifest; warnings: string[]; warningMessages: Map<string, Message> } {
	const src = p.manifest,
		warnings: string[] = [],
		warningMessages = new Map<string, Message>();
	const note = (text: string, display: Message) => {
		warnings.push(text);
		warningMessages.set(text, display);
	};
	const items = src.items.filter((it) => {
		const ok = it.baseHash === src.rig.baseHash;
		if (!ok)
			note(
				`${it.name}: Left out because it no longer matches the body.`,
				message('export.warnings.staleItem', { item: it.name })
			);
		else if (it.unfitted)
			note(
				`${it.name}: worn as drawn for another body, not fitted to this character.`,
				message('export.warnings.unfittedItem', { item: it.name })
			);
		return ok;
	});
	const ids = new Set(items.map((i) => i.id));
	const slots: Manifest['slots'] = src.slots.map((slot) => {
		const exported: Manifest['slots'][number] = { id: slot.id, z: slot.z, class: slot.class };
		if (slot.bgZ !== undefined) exported.bgZ = slot.bgZ;
		if (slot.anchor !== undefined) exported.anchor = slot.anchor;
		if (slot.required !== undefined) exported.required = slot.required;
		if (slot.hides !== undefined) exported.hides = [...slot.hides];
		if (slot.clips !== undefined) exported.clips = [...slot.clips];
		if (slot.zOverrides !== undefined) exported.zOverrides = structuredClone(slot.zOverrides);
		if (slot.band !== undefined) exported.band = slot.band;
		if (slot.label !== undefined) exported.label = slot.label;
		return exported;
	});
	const m: Manifest = structuredClone({ ...src, items, slots, export: undefined });
	if (src.rig.mountSeatOffsets) {
		const offsets = Object.fromEntries(
			DIRECTIONS.flatMap((id) => {
				const offset = mountSeatOffset(src.rig, id);
				return offset.x || offset.y ? [[id, offset] as const] : [];
			})
		);
		if (Object.keys(offsets).length) m.rig.mountSeatOffsets = offsets;
		else delete m.rig.mountSeatOffsets;
	}
	// Export is also a public API: do not depend on the Studio having materialized procedural swatches first.
	storeVariants(m, {}, ...m.presets.map((pr) => pr.variants));
	// A palette link can target a stale item. Freeze its resolved selections before dropping the excluded owner's metadata.
	const detached = m.materials
		.filter(
			(mat) =>
				ids.has(mat.owner) &&
				mat.linkTo &&
				!ids.has(m.materials.find((other) => other.id === mat.linkTo)?.owner ?? '')
		)
		.map((mat) => ({
			mat,
			baseline: variantOf(m, {}, mat.id),
			selections: m.presets.map((pr) => variantOf(m, pr.variants, mat.id))
		}));
	for (const { mat, baseline, selections } of detached) {
		delete mat.linkTo;
		delete mat.defaultVariant;
		if (baseline) mat.defaultVariant = baseline;
		m.presets.forEach((pr, i) => {
			if (selections[i]) pr.variants[mat.id] = selections[i];
			else delete pr.variants[mat.id];
		});
	}
	const materialIds = new Set(m.items.flatMap((it) => it.materials));
	for (const id of materialIds) {
		const linked = m.materials.find((mat) => mat.id === id)?.linkTo;
		if (linked) materialIds.add(linked);
	}
	m.materials = m.materials.filter((mat) => ids.has(mat.owner) && materialIds.has(mat.id));
	for (const pr of m.presets)
		for (const id of Object.keys(pr.variants))
			if (!m.materials.some((mat) => mat.id === id)) delete pr.variants[id];
	for (const it of m.items)
		for (const l of it.layers) {
			const f = layerFrame(m.rig, l);
			delete l.cells;
			l.sheets = Object.fromEntries(m.rig.animations.map((a) => [a.id, sheetPath(it, l, a.id)]));
			if (it.materials.some((id) => variantOf(m, {}, id)))
				l.sourceSheets = Object.fromEntries(
					m.rig.animations.map((a) => [a.id, `sources/${sheetPath(it, l, a.id)}`])
				);
			else delete l.sourceSheets;
			Object.assign(l, { cell: { w: f.w, h: f.h }, pivot: { x: f.x, y: f.y } }); // explicit in manifest.json: readers never default
		}
	for (const pr of m.presets)
		for (const s in pr.items) if (pr.items[s] && !ids.has(pr.items[s]!)) pr.items[s] = null;
	// B10: the views each move has (the base has frames there); the other rows of its sheets are empty
	for (const [index, a] of m.rig.animations.entries()) {
		const directions = moveDirs(src, a.id);
		Object.assign(a, { directions });
		const sourceClip = src.rig.animations[index];
		const contacts: NonNullable<typeof a.riderSeat> = {};
		for (const facing of directions) {
			const point = reviewedSeatPoint(src, sourceClip, facing);
			if (point && p.images.has(point.body))
				contacts[facing] = riderSeatOffset(point, src.rig.pivot);
		}
		delete a.seatPoints;
		delete a.riderSeat;
		if (Object.keys(contacts).length) a.riderSeat = contacts;
		if (!directions.length) {
			const move = a.id.replace(/[_-]/g, ' ');
			note(
				`${move}: No body frames to play.`,
				message('export.warnings.noBodyFrames', { move: { move: a.id } })
			);
		}
	}
	m.export = {
		exportedAt: o.exportedAt ?? new Date().toISOString(),
		layout: 'pixeldoll-sheets/1',
		engines: o.engines,
		pixelsPerUnit: o.pixelsPerUnit ?? exportUnit(m.rig),
		...(o.baked
			? (({ w, h, x, y }) => ({
					baked: m.presets.map((x) => x.id),
					bakedCell: { w, h },
					bakedPivot: { x, y }
				}))(bakedFrame(m))
			: {})
	};
	return { manifest: m, warnings, warningMessages };
}

const ENGINE_START: Record<string, string> = {
	godot:
		'Godot 4: copy this folder into your project and instance godot/Paperdoll.tscn (see godot/README.txt).',
	unity:
		'Unity 6: copy this folder under Assets/; the importer builds a prefab in unity/Generated/ (see unity/README.txt).',
	phaser:
		'Phaser 3.80+ / 4: copy this folder into your assets and use phaser/PaperdollContainer.js (see phaser/README.txt).',
	'phaser-ae':
		'Phaser AE: copy this folder into the game folder and use phaser-ae/paperdoll.js (see phaser-ae/README.txt).',
	gdevelop:
		'GDevelop: open gdevelop/game.json for an editable Sprite project with a paperdoll controller (see gdevelop/README.txt).',
	aseprite:
		'Aseprite 1.3+ / zero code: open aseprite/<name>.aseprite, one layer per item (see aseprite/README.txt).',
	generic:
		'Any engine: one PNG strip per layer, move and direction in generic/ (see generic/README.txt).'
};

/** Root README.txt: what is in the folder and how to start (T1 P2-6). */
export function readme(m: Manifest, runtimePath?: string): string {
	const moves = m.rig.animations.map((a) => {
		const d = (a as { directions?: string[] }).directions;
		return `${a.id} (${a.cells} frames${d && d.length < m.rig.directions.length ? `, ${d.join(' + ')} only` : ''})`;
	});
	return `${m.name}: a paperdoll character exported by PixelDoll (${m.format}).

Quick start
${
	runtimePath
		? `  Follow ${m.export!.engines[0]}/README.txt to add the character to your game.
  The runtime is at ${runtimePath}. When copying this character, copy _PixelDoll too
  and keep them in the same parent folder.`
		: (m.export?.engines ?? []).map((e) => `  ${ENGINE_START[e] ?? e}`).join('\n')
}

What is inside
  manifest.json   rig (cell ${m.rig.cell.w}x${m.rig.cell.h}, pivot ${m.rig.pivot.x},${m.rig.pivot.y}), moves, slots, items, materials and outfits
  layers/         one sheet per item layer and move: layers/<slot>/<item>/<layer>/<move>.png
                  rows = directions (${m.rig.directions.map((d) => d.id).join(', ')}), columns = frames${
										m.export?.baked
											? `
  baked/          the finished character per outfit: baked/<outfit>/<move>.png`
											: ''
									}
  project.json    editable character for importing back into PixelDoll
  cells/          original frame and rest images for the editable copy

Path segments derived from IDs prefix Windows device names (con, prn, aux, nul, com0-com9,
lpt0-lpt9) with an underscore, case-insensitively. IDs in manifest.json stay unchanged.
For example, outfit aux and move con use baked/_aux/_con.png. Layer sheets have explicit manifest paths.

${
	m.materials.length && m.materials.some((mat) => Object.keys(mat.variants ?? {}).length)
		? `Outfit colors are exact palette swaps (materials[].ramp and variants, presets[].variants); the runtimes swap them
while the character plays, so a game can change them.`
		: `This character ships no named color variants, so every sheet already carries its final colors and there is nothing
to recolor at runtime. Do not call the recolor API with invented material or variant ids.`
}

Moves: ${moves.join(', ')}.
Outfits: ${m.presets
		.map((p, i) => `${p.name} (${p.id})${i === 0 ? ' starts the character' : ''}`)
		.join(', ')}.
An item id containing ~ is a baked tuck variant (for example hair under a hat): the runtime applies it automatically when
the covering item is worn, and the equipment API refuses it if you equip it yourself (each engine reference says whether
that throws or returns an error).
A move lists the directions it has in rig.animations[].directions; its other sheet rows are empty.
Pixel art: use nearest-neighbor filtering and whole-pixel positions.
`;
}

/** Layer sheets (all engines need them) + README + manifest. */
export function coreFiles(p: Project, m: Manifest, runtimePath?: string): OutFile[] {
	const files: OutFile[] = [
		{ name: 'README.txt', data: readme(m, runtimePath) },
		{ name: 'manifest.json', data: JSON.stringify(m, null, 2) + '\n' }
	];
	const byId = new Map(p.manifest.items.map((i) => [i.id, i]));
	const defaults = recolor(p, {});
	for (const it of m.items)
		for (const l of it.layers) {
			const srcLayer = byId.get(it.id)!.layers.find((x) => x.id === l.id)!;
			for (const a of m.rig.animations) {
				files.push({
					name: l.sheets![a.id],
					data: layerSheet(l.sourceSheets ? defaults : p, srcLayer, a.id)
				});
				if (l.sourceSheets?.[a.id])
					files.push({ name: l.sourceSheets[a.id], data: layerSheet(p, srcLayer, a.id) });
			}
		}
	return files;
}

/** generic/<item>_<layer>/<anim>_<dir>_strip<N>.png and baked/<preset>/<anim>.png (reuses the layer sheets already built).
 * Canonical layer sheets render approved defaults; sourceSheets retain source ramps. Baked sheets apply each preset. */
export function genericFiles(
	p: Project,
	m: Manifest,
	sheets: Map<string, Img>,
	o: { strips: boolean; baked: boolean }
): OutFile[] {
	const files: OutFile[] = [];
	const { rig } = m;
	if (o.strips)
		for (const it of m.items)
			for (const l of it.layers)
				for (const a of rig.animations)
					rig.directions.forEach((d, r) => {
						const strip = sheetRow(sheets.get(l.sheets![a.id])!, r, layerFrame(rig, l).h);
						if (strip.data.some((v, i) => i % 4 === 3 && v))
							files.push({
								name: `generic/${portablePathId(`${it.id}_${l.id}`)}/${a.id}_${d.id}_strip${a.cells}.png`,
								data: strip
							}); // no empty strips
					});
	if (o.strips)
		files.push({
			name: 'generic/README.txt',
			data: `One PNG strip per item layer, move and direction: <item>_<layer>/<move>_<direction>_strip<frames>.png.
Frames sit left to right, each one cell of the layer (manifest.json items[].layers[].cell); columns are zero-based source cell indices.
Play rig.animations[].frames in order: use each entry's cell column for ms milliseconds, including repeated indices. Repeat only when loop is true.
The _stripN suffix lets GameMaker split the image on import; it does not encode the playlist, frame durations or origin.
Place every layer at character position minus layers[].pivot; oversize layers have their own cell and pivot.
The base is always worn. Resolve slot hiding, tucked variants (variantOf/under) and z order (layers[].z, slots[].zOverrides) from manifest.json.
A strip a move does not have (rig.animations[].directions) or an item has no frames for is left out. Mirrored rows are already flipped.
These strips and layers/ render approved default colorways. To recolor, start from sourceSheets when present (otherwise sheets),
replace each item's material ramp by the selected variant ramp, and follow linkTo/defaultVariant. All outfit ramps are stored in materials[].variants.
Baked sheets in baked/ apply the outfit's colors and layer visibility; their cell and pivot are export.bakedCell and export.bakedPivot.
Use nearest-neighbor filtering, whole-pixel positions and straight RGBA alpha. This is a PNG + JSON interchange format; engine playback needs integration.
`
		});
	const bf = bakedFrame(m);
	if (o.baked)
		for (const pr of m.presets)
			for (const a of rig.animations)
				files.push({
					name: bakedSheetPath(pr.id, a.id),
					data: bakedSheet(outfitProject(p, m, pr), pr.items, a.id, bf)
				});
	return files;
}

/** The exported items in one outfit's colors, for baked composites. */
export function outfitProject(p: Project, m: Manifest, preset: Preset): Project {
	const ids = new Set(m.items.map((it) => it.id));
	return recolor(
		{
			...p,
			manifest: {
				...p.manifest,
				materials: m.materials,
				items: p.manifest.items.filter((it) => ids.has(it.id))
			}
		},
		preset.variants
	);
}

export function selfTest() {
	const hash = 'sha256:' + '0'.repeat(64);
	const p = {
		images: new Map(),
		manifest: {
			format: CURRENT_FORMAT,
			name: 't',
			app: 'x',
			materials: [
				{
					id: 'a',
					label: 'a',
					owner: 'base',
					ramp: ['#000000'],
					variants: { v: ['#111111', '#222222'] }
				}
			],
			rig: {
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 60 },
				directions: [{ id: 'south' }],
				animations: [
					{
						id: 'walk',
						cells: 2,
						loop: true,
						frames: [
							{ cell: 0, ms: 100 },
							{ cell: 1, ms: 100 }
						]
					}
				],
				baseItem: 'base',
				baseHash: hash
			},
			slots: [
				{ id: 'body', z: 10, class: 'base' },
				{ id: 'head', z: 130, class: 'rigid' }
			],
			items: [
				{
					id: 'base',
					name: 'Base',
					slot: 'body',
					status: 'accepted',
					mirror: 'flip',
					materials: [],
					prompt: 'p, "q"',
					baseHash: hash,
					provenance: [],
					layers: [{ id: 'main', role: 'fg', z: 10, cells: { walk: { south: [null, null] } } }]
				},
				{
					id: 'old',
					name: 'Old',
					slot: 'head',
					status: 'stale',
					mirror: 'flip',
					materials: [],
					prompt: '',
					baseHash: 'sha256:1',
					provenance: [],
					layers: [{ id: 'main', role: 'fg', z: 130 }]
				}
			],
			presets: [{ id: 'default', name: 'D', items: { body: 'base', head: 'old' }, variants: {} }]
		}
	} as unknown as Project;
	const errs = validate(p);
	console.assert(
		errs.length === 1 && errs[0].includes('a.v'),
		`validate: variant length only (${errs.join('; ')})`
	);
	const { manifest: m, warnings } = exportManifest(p, {
		engines: ['generic'],
		baked: true,
		exportedAt: 'T'
	});
	console.assert(
		warnings.some((warning) =>
			warning.includes('Left out because it no longer matches the body.')
		) &&
			m.items.length === 1 &&
			m.presets[0].items.head === null,
		'stale item excluded and unequipped'
	);
	console.assert(
		!m.items[0].layers[0].cells &&
			m.items[0].layers[0].sheets!.walk === 'layers/body/base/main/walk.png',
		'cells -> sheets'
	);
	console.assert(
		m.export!.pixelsPerUnit === 64 &&
			m.export!.baked![0] === 'default' &&
			!!p.manifest.items[0].layers[0].cells,
		'export info, source untouched'
	);
	console.assert(
		(m.rig.animations[0] as { directions?: string[] }).directions!.length === 0 &&
			readme(m).includes('Quick start'),
		'move directions (empty base = none) + README'
	);
	console.assert(
		m.items[0].layers[0].cell!.w === 64 &&
			m.items[0].layers[0].pivot!.y === 60 &&
			m.export!.bakedCell!.w === 64,
		'cell/pivot explicit per layer, baked cell'
	);

	// oversize layer (S5 held item): 96 cell, pivot = rig pivot + 16
	const L96 = {
		id: 'main',
		role: 'fg',
		z: 130,
		cell: { w: 96, h: 96 },
		pivot: { x: 48, y: 76 },
		cells: { walk: { south: ['sha256:96', null] } }
	};
	p.manifest.items.push({
		id: 'sw',
		name: 'Sword',
		slot: 'head',
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		prompt: '',
		baseHash: hash,
		provenance: [],
		layers: [L96]
	} as never);
	p.manifest.materials[0].variants = {};
	const img = (n: number) =>
		p.images.set('sha256:96', { w: n, h: n, data: new Uint8ClampedArray(n * n * 4) });
	img(96);
	console.assert(
		validate(p).length === 0,
		`oversize: 96 cell accepted (${validate(p).join('; ')})`
	);
	img(64);
	console.assert(
		validate(p).some((x) => x.includes('layer cell 96x96')),
		'oversize: image must match the layer cell'
	);
	img(96);
	p.manifest.rig.directions.push({ id: 'west', mirrorOf: 'south' });
	L96.pivot.x = 40;
	console.assert(
		validate(p).some((x) => x.includes('not centered')),
		'oversize: off-center cell rejected when mirrored'
	);
	L96.pivot.x = 48;
	const m2 = exportManifest(p, { engines: ['generic'], baked: true }).manifest;
	console.assert(
		m2.export!.bakedCell!.w === 96 &&
			m2.export!.bakedPivot!.y === 76 &&
			m2.items[1].layers[0].cell!.h === 96,
		'oversize: baked cell = union of layers'
	);
}
