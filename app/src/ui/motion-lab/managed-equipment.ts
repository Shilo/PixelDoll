// One reviewed, frozen-frame diagnostic. This is not a production fitting route.
import type { InpaintV3 } from '../../lib/pixellab/routes.ts';
import { base64ToBytes, pngSize } from '../../lib/image/png.ts';
import { decodePngBytes } from '../../lib/image/pngraw.ts';
import { toChroma } from '../../lib/image/chroma.ts';
import { padImg } from '../../lib/items/items.ts';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import { readPilot } from './pilot.ts';
import { labQueue } from './run.ts';
import { dispatchFixedInpaint, exportFixedInpaint, readFixedInpaint } from './fixed-inpaint.ts';
export interface ManagedEquipmentProbe {
	version: 1;
	kind: 'managed-equipment-probe';
	characterId: string;
	animationGroupId: string;
	direction: 'east';
	cell: 144;
	cols: 3;
	indices: number[];
	frames: { index: number; sha256: string }[];
	request: InpaintV3;
	[key: string]: unknown;
}
const KEY = 'pixeldoll.motionPilot.equipment.2026-11-01',
	indices = [1, 3, 4, 6];
// Binds the reviewed prompt, mask, references and provenance, not just a mutable file's dimensions.
export const MANAGED_PROBE_SHA256 =
	'3c20bfe77c4198521731c283082a00d6445e92beaf8d01298cc7db69c04aa43f';
export const ARMED_COMPLETION_SHA256 =
	'2b468a4513c58953fcb1688e9988d4a1de618cba1c2bc4a80397358d5191f52e';
const COMPLETION_KEY = 'pixeldoll.motionPilot.armedCompletion.2026-11-02',
	completionIndices = [0, 2, 5, 7];
const profileOf = (p: ManagedEquipmentProbe) =>
	p.request.seed === 734
		? {
				key: COMPLETION_KEY,
				sha: ARMED_COMPLETION_SHA256,
				label: 'Complete weapon-aware source, east frames 0/2/5/7'
			}
		: {
				key: KEY,
				sha: MANAGED_PROBE_SHA256,
				label: 'Frozen managed east sword diagnostic, frames 1/3/4/6'
			};
export function readManagedEquipment() {
	return readFixedInpaint<ManagedEquipmentProbe>(KEY);
}
export function parseManagedEquipment(value: unknown): ManagedEquipmentProbe {
	const p = value as ManagedEquipmentProbe;
	const selectedIndices = p?.request?.seed === 734 ? completionIndices : indices;
	if (
		p?.version !== 1 ||
		p.kind !== 'managed-equipment-probe' ||
		p.direction !== 'east' ||
		p.cell !== 144 ||
		p.cols !== 3 ||
		typeof p.characterId !== 'string' ||
		typeof p.animationGroupId !== 'string' ||
		JSON.stringify(p.indices) !== JSON.stringify(selectedIndices) ||
		!Array.isArray(p.frames) ||
		p.frames.length !== 4 ||
		p.frames.some((f, i) => f.index !== selectedIndices[i] || !/^[a-f0-9]{64}$/.test(f.sha256))
	)
		throw new Error('Expected the reviewed four-frame east managed equipment diagnostic.');
	if (
		typeof p.request?.description !== 'string' ||
		!p.request.description.trim() ||
		p.request.description.length > 10000 ||
		![731, 734].includes(p.request.seed ?? 0) ||
		p.request.no_background !== true
	)
		throw new Error('The diagnostic prompt, seed or transparency contract is invalid.');
	for (const image of [p.request.inpainting_image, p.request.mask_image]) {
		if (
			image?.image?.type !== 'base64' ||
			typeof image.image.base64 !== 'string' ||
			image.image.base64.length > 2_000_000 ||
			image.size?.width !== 432 ||
			image.size.height !== 288
		)
			throw new Error('The diagnostic needs two bounded 432 by 288 PNG grids.');
		const size = pngSize(base64ToBytes(image.image.base64));
		if (size?.w !== 432 || size.h !== 288)
			throw new Error('Diagnostic PNG dimensions do not match their declared grid.');
	}
	return p;
}
async function verifyFrozenFrames(packet: ManagedEquipmentProbe) {
	const pilot = readPilot();
	if (
		pilot?.characterId !== packet.characterId ||
		pilot.verification?.length !== 4 ||
		pilot.verification.some((v) => v.changedPixels)
	)
		throw new Error('This probe does not belong to the verified exact-artwork pilot.');
	const character = pilot.character as {
		animations?: {
			animation_group_id: string;
			directions: { direction: string; frames: string[] }[];
		}[];
	};
	const direction = character?.animations
		?.find((a) => a.animation_group_id === packet.animationGroupId)
		?.directions.find((d) => d.direction === 'east');
	if (direction?.frames.length !== 8)
		throw new Error(
			'The completed managed east clip is missing. Refresh its existing receipt first.'
		);
	const grid = await decodePngBytes(base64ToBytes(packet.request.inpainting_image.image.base64)),
		mask = await decodePngBytes(base64ToBytes(packet.request.mask_image.image.base64));
	let editable = 0;
	for (let y = 0; y < 288; y++)
		for (let x = 0; x < 432; x++) {
			const i = (y * 432 + x) * 4,
				v = mask.data[i],
				cell = Math.floor(y / 144) * 3 + Math.floor(x / 144);
			if (
				mask.data[i + 3] !== 255 ||
				![0, 255].includes(v) ||
				mask.data[i + 1] !== v ||
				mask.data[i + 2] !== v
			)
				throw new Error('The diagnostic requires an opaque binary hard mask.');
			if (v === 255) {
				if (cell >= 4) throw new Error('The sword reference cells must remain fully protected.');
				editable++;
			}
		}
	if (!editable || editable > (432 * 288) / 2)
		throw new Error('The diagnostic edit region is empty or exceeds its reviewed scope.');
	for (const [cell, frame] of packet.frames.entries()) {
		const url = direction.frames[frame.index];
		if (!url?.startsWith('https://backblaze.pixellab.ai/'))
			throw new Error('Unexpected managed asset origin.');
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Frozen-frame verification failed (${response.status}).`);
		const bytes = new Uint8Array(await response.arrayBuffer());
		if ((await sha256(bytes)) !== frame.sha256)
			throw new Error('A managed frame differs from the reviewed frozen input.');
		const native = await decodePngBytes(bytes);
		if (native.w !== 112 || native.h !== 112)
			throw new Error('The managed diagnostic needs the original 112 px canvas.');
		const image = padImg(toChroma(native, 'green'), 16);
		for (let y = 0; y < 144; y++)
			for (let x = 0; x < 144; x++) {
				const source = (y * 144 + x) * 4,
					target = ((Math.floor(cell / 3) * 144 + y) * 432 + (cell % 3) * 144 + x) * 4;
				if (
					(image.data[source + 3] || grid.data[target + 3]) &&
					image.data.subarray(source, source + 4).some((v, k) => v !== grid.data[target + k])
				)
					throw new Error('The diagnostic grid differs from the exact frozen body chroma copy.');
			}
	}
}
export async function submitManagedEquipment(value: unknown) {
	if (!labQueue.key) throw new Error('Connect the localhost agent session first.');
	const packet = parseManagedEquipment(value),
		profile = profileOf(packet);
	if ((await sha256(stableStringify(packet))) !== profile.sha)
		throw new Error(
			'This file differs from the one reviewed equipment diagnostic. No request was submitted.'
		);
	await verifyFrozenFrames(packet);
	return dispatchFixedInpaint(
		{ key: profile.key, label: profile.label, units: 25 },
		packet,
		packet.request
	);
}
export async function exportManagedEquipment() {
	return exportFixedInpaint<ManagedEquipmentProbe>(KEY);
}
export const readArmedCompletion = () => readFixedInpaint<ManagedEquipmentProbe>(COMPLETION_KEY);
export const exportArmedCompletion = () =>
	exportFixedInpaint<ManagedEquipmentProbe>(COMPLETION_KEY);
