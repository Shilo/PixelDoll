// One source-bound swap diagnostic. Its pin records a limited review, not a global equipment pass.
import { base64ToBytes } from '../../lib/image/png.ts';
import { decodePngBytes } from '../../lib/image/pngraw.ts';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import { cutGrid } from '../../lib/items/items.ts';
import type { Img } from '../../lib/image/png.ts';
import type { InpaintV3 } from '../../lib/pixellab/routes.ts';
import type { JobRec } from '../../lib/pixellab/queue.ts';
import * as db from '../../lib/store/db.ts';
import {
	DISARM_PACKET_SHA256,
	COMPLETION_DISARM_PACKET_SHA256,
	exportDisarm,
	exportCompletionDisarm,
	maskBits,
	verifiedOriginalSourceFrames
} from './weapon-aware.ts';
import { dispatchFixedInpaint, exportFixedInpaint, readFixedInpaint } from './fixed-inpaint.ts';
import {
	AXIS_REPAIR_KEY,
	AXIS_REPAIR_PACKET_SHA256,
	axisRepairPermission,
	type AxisGuide,
	type AxisHeadGuide
} from './weapon-axis-repair.ts';
export const SWAP_KEY = 'pixeldoll.motionPilot.weaponSwap.2026-11-02';
export const SWAP_PACKET_SHA256 =
	'287f215152db5ea978fd4319b1c3025344a9046a6c28b665f7e44402d261a56b';
export const COMPLETION_SWAP_KEY = 'pixeldoll.motionPilot.completionSwap.2026-11-02';
export const COMPLETION_SWAP_PACKET_SHA256 =
	'8fb5ba7f0464f71ebb622d704490d4b223eea09bdc43d1c2ee24ddda310ba9ce';
export const BODY_STAR_RECIPE_SHA256 =
	'4458544f88245b1a96db2c1781f857a2f306271014009574bf0ac11de5fb8fd8';
interface FrameImage {
	png: string;
	sha256: string;
	rgbaSha256: string;
}
interface BodyRecipeFrame extends FrameImage {
	index: number;
	handEnvelope: string;
	handEnvelopeSha256: string;
	actualPng: string;
	actualSha256: string;
	originalPng: string;
	originalSha256: string;
	sourceArmedPng: string;
	sourceArmedSha256: string;
	sourceProtectedKeyMask: string;
	sourceWeaponMask: string;
	sourceUnknownMask: string;
	oldGrip: { x: number; y: number };
	newGrip: { x: number; y: number };
	handRadius: number;
	actualProviderJobId: string;
	sourcePacketCanonicalHash: string;
	delta: { x: number; y: number; from: number[]; to: number[] }[];
}
interface BodyRecipe {
	version: 2;
	kind: 'body-family-hand-conservation';
	cell: 144;
	indices: number[];
	canonicalHash: string;
	completionSourceCanonicalHash: string;
	providerBareResultHashes: string[];
	frames: BodyRecipeFrame[];
	authoredExportContract: unknown;
}
interface SwapFrame {
	index: number;
	png: string;
	sha256: string;
	rgbaSha256: string;
	weaponMask: string;
	bodyMask: string;
	unknownMask: string;
	editMask: string;
	grip: { x: number; y: number };
	frozenBase: FrameImage;
	actualDisarmBase?: FrameImage;
	authoredBodyRecipeFrameSha256?: string;
	guidePermissionMask?: string;
	guidePermissionMaskSha256?: string;
	geometry?: AxisGuide;
}
interface DesignSource {
	jobId: string;
	requestHash: string;
	resultSha256: string;
	sourcePacketCanonicalHash: string;
}
interface DesignReference extends FrameImage {
	index: number;
	sourceCell: number;
	gridCell: number;
	width: 144;
	height: 144;
	designSourceIndex?: number;
}
export interface SwapPacket {
	version: 1;
	kind: 'weapon-aware-swap';
	cell: 144;
	cols: 2 | 3;
	indices: number[];
	frames: SwapFrame[];
	sourceDisarmJobId: string;
	sourceDisarmResultSha: string;
	sourceDisarmCallId: string;
	sourceArmedPacketCanonicalHash: string;
	gridSha256: string;
	maskSha256: string;
	canonicalHash: string;
	request: InpaintV3;
	profile?: string;
	bodySource?: string;
	sourceBodyRecipeCanonicalHash?: string;
	bodyRecipe?: BodyRecipe;
	heldWindow?: { x: number; y: number; w: number; h: number };
	sourceFirstWeaponJobId?: string;
	authoredExportContract?: unknown;
	designSource?: DesignSource;
	designSources?: DesignSource[];
	references?: DesignReference[];
	authoringControl?: { headGuide: AxisHeadGuide };
	[key: string]: unknown;
}
const indices = [1, 3, 4, 6];
const completionIndices = [0, 2, 5, 7];
const profileOf = (p: SwapPacket) =>
	p.request.seed === 737
		? {
				key: AXIS_REPAIR_KEY,
				sha: AXIS_REPAIR_PACKET_SHA256,
				sourceSha: DISARM_PACKET_SHA256,
				label: 'Calibrated two-frame hatchet axis repair',
				exportSource: exportDisarm
			}
		: p.request.seed === 736
			? {
					key: COMPLETION_SWAP_KEY,
					sha: COMPLETION_SWAP_PACKET_SHA256,
					sourceSha: COMPLETION_DISARM_PACKET_SHA256,
					label: 'Authored completion body, one-handed hatchet swap',
					exportSource: exportCompletionDisarm
				}
			: {
					key: SWAP_KEY,
					sha: SWAP_PACKET_SHA256,
					sourceSha: DISARM_PACKET_SHA256,
					label: 'Frozen weapon-aware body, one-handed hatchet swap',
					exportSource: exportDisarm
				};
export function parseSwapPacket(value: unknown): SwapPacket {
	const p = value as SwapPacket;
	const completion = p?.request?.seed === 736,
		repair = p?.request?.seed === 737,
		selected = repair ? [3, 4] : completion ? completionIndices : indices,
		width = completion ? 432 : 288;
	if (
		p?.version !== 1 ||
		p.kind !== 'weapon-aware-swap' ||
		p.cell !== 144 ||
		p.cols !== (completion ? 3 : 2) ||
		JSON.stringify(p.indices) !== JSON.stringify(selected) ||
		!Array.isArray(p.frames) ||
		p.frames.length !== selected.length ||
		p.frames.some(
			(f, i) =>
				f.index !== selected[i] ||
				!f.frozenBase ||
				!Number.isFinite(f.grip?.x) ||
				!Number.isFinite(f.grip?.y)
		)
	)
		throw new Error(
			repair
				? 'Expected the fixed two-frame weapon axis repair packet.'
				: 'Expected the fixed four-frame weapon swap packet.'
		);
	if (
		![733, 736, 737].includes(p.request?.seed ?? 0) ||
		p.request.no_background !== true ||
		typeof p.request.description !== 'string' ||
		!p.request.description.trim()
	)
		throw new Error('Invalid swap prompt or fixed seed.');
	for (const image of [p.request.inpainting_image, p.request.mask_image])
		if (
			image?.image?.type !== 'base64' ||
			typeof image.image.base64 !== 'string' ||
			image.image.base64.length > 2_000_000 ||
			image.size?.width !== width ||
			image.size.height !== 288
		)
			throw new Error(`The swap requires two bounded ${width} by 288 PNG grids.`);
	return p;
}
async function checkedRecipe(packet: SwapPacket) {
	const r = packet.bodyRecipe;
	if (
		packet.profile !==
			(packet.request.seed === 737
				? 'east-axis-repair-body-star-v2-3-4'
				: 'east-completion-body-star-v2-0-2-5-7') ||
		packet.bodySource !== 'authored-reference-family-v2' ||
		packet.sourceBodyRecipeCanonicalHash !== BODY_STAR_RECIPE_SHA256 ||
		r?.canonicalHash !== BODY_STAR_RECIPE_SHA256 ||
		r.version !== 2 ||
		r.kind !== 'body-family-hand-conservation' ||
		r.cell !== 144 ||
		JSON.stringify(r.indices) !== '[0,1,2,3,4,5,6,7]' ||
		r.frames.length !== 8 ||
		r.frames.some((f, i) => f.index !== i) ||
		r.completionSourceCanonicalHash !== COMPLETION_DISARM_PACKET_SHA256 ||
		!r.providerBareResultHashes.includes(packet.sourceDisarmResultSha) ||
		stableStringify(packet.heldWindow) !== stableStringify({ x: 16, y: 16, w: 112, h: 112 }) ||
		stableStringify(r.authoredExportContract) !== stableStringify(packet.authoredExportContract) ||
		(await sha256(stableStringify({ ...r, canonicalHash: undefined }))) !== BODY_STAR_RECIPE_SHA256
	)
		throw new Error(
			'The authored body recipe, ancestry or held window differs from the reviewed contract.'
		);
	return r;
}
export async function verifyAuthoredBody(
	packet: SwapPacket,
	frame: SwapFrame,
	recipe: BodyRecipeFrame,
	actual: Img,
	original: Img,
	source: Img,
	known: Uint8Array,
	weapon: Uint8Array,
	unknown: Uint8Array,
	frozen: Img,
	expectedSourcePin: typeof DISARM_PACKET_SHA256 | typeof COMPLETION_DISARM_PACKET_SHA256
) {
	if (
		recipe.actualProviderJobId !== packet.sourceDisarmJobId ||
		recipe.sourcePacketCanonicalHash !== expectedSourcePin ||
		frame.authoredBodyRecipeFrameSha256 !== recipe.sha256 ||
		frame.frozenBase.sha256 !== recipe.sha256 ||
		recipe.handRadius !== 8 ||
		recipe.newGrip.x !== frame.grip.x ||
		recipe.newGrip.y !== frame.grip.y ||
		![recipe.oldGrip.x, recipe.oldGrip.y, recipe.newGrip.x, recipe.newGrip.y].every(
			Number.isFinite
		) ||
		!frame.actualDisarmBase
	)
		throw new Error('The authored body frame or reviewed hand observation changed.');
	for (const [encoded, hash, expected] of [
		[recipe.actualPng, recipe.actualSha256, actual],
		[recipe.originalPng, recipe.originalSha256, original],
		[recipe.sourceArmedPng, recipe.sourceArmedSha256, source],
		[recipe.png, recipe.sha256, frozen],
		[frame.actualDisarmBase.png, frame.actualDisarmBase.sha256, actual]
	] as const) {
		const bytes = base64ToBytes(encoded),
			image = await decodePngBytes(bytes);
		if (
			image.w !== 144 ||
			image.h !== 144 ||
			(await sha256(bytes)) !== hash ||
			image.data.some((v, p) => v !== expected.data[p])
		)
			throw new Error('The authored body recipe differs from actual source pixels.');
	}
	if (
		(await sha256(new Uint8Array(frozen.data))) !== recipe.rgbaSha256 ||
		(await sha256(new Uint8Array(actual.data))) !== frame.actualDisarmBase.rgbaSha256 ||
		(await sha256(base64ToBytes(recipe.handEnvelope))) !== recipe.handEnvelopeSha256
	)
		throw new Error('The authored body or hand envelope hash changed.');
	const [hand, key, w, u] = await Promise.all(
			[
				recipe.handEnvelope,
				recipe.sourceProtectedKeyMask,
				recipe.sourceWeaponMask,
				recipe.sourceUnknownMask
			].map((s) => maskBits(s, 144))
		),
		deltas = new Map<number, BodyRecipeFrame['delta'][number]>();
	for (const delta of recipe.delta) {
		const p = delta.y * 144 + delta.x;
		if (
			!Number.isInteger(delta.x) ||
			!Number.isInteger(delta.y) ||
			delta.x < 0 ||
			delta.y < 0 ||
			delta.x >= 144 ||
			delta.y >= 144 ||
			deltas.has(p)
		)
			throw new Error('The authored body delta ledger is invalid.');
		deltas.set(p, delta);
	}
	let changed = 0;
	for (let p = 0; p < 144 * 144; p++) {
		const x = (p % 144) + 0.5,
			y = Math.floor(p / 144) + 0.5,
			inside = Number(
				Math.hypot(x - recipe.oldGrip.x, y - recipe.oldGrip.y) <= 8 ||
					Math.hypot(x - recipe.newGrip.x, y - recipe.newGrip.y) <= 8
			),
			q = p * 4;
		if (
			hand[p] !== inside ||
			key[p] !== known[p] ||
			w[p] !== weapon[p] ||
			u[p] !== unknown[p] ||
			(known[p] && actual.data.subarray(q, q + 4).some((v, k) => v !== source.data[q + k]))
		)
			throw new Error(
				'The authored body hand envelope or protected source classification changed.'
			);
		const expected = known[p] || hand[p] ? actual : original;
		if (frozen.data.subarray(q, q + 4).some((v, k) => v !== expected.data[q + k]))
			throw new Error(
				'The frozen authored body does not follow the reviewed K/hand/original selector.'
			);
		const different = actual.data.subarray(q, q + 4).some((v, k) => v !== frozen.data[q + k]),
			delta = deltas.get(p);
		if (different) {
			changed++;
			if (
				!delta ||
				stableStringify(delta.from) !==
					stableStringify(Array.from(actual.data.subarray(q, q + 4))) ||
				stableStringify(delta.to) !== stableStringify(Array.from(frozen.data.subarray(q, q + 4)))
			)
				throw new Error('The authored body delta ledger differs from actual pixel changes.');
		} else if (delta)
			throw new Error('The authored body delta ledger includes an unchanged pixel.');
	}
	if (changed !== deltas.size) throw new Error('The authored body delta ledger is incomplete.');
}
async function verifyDesignReferences(packet: SwapPacket, cells: Img[], mask: Uint8Array) {
	const repair = packet.request.seed === 737,
		sources = repair ? packet.designSources : [packet.designSource],
		refs = packet.references;
	if (
		!sources ||
		sources.length !== (repair ? 2 : 1) ||
		sources.some(
			(s, i) =>
				!s ||
				s.sourcePacketCanonicalHash !==
					(repair && i === 0 ? COMPLETION_SWAP_PACKET_SHA256 : SWAP_PACKET_SHA256)
		) ||
		!refs ||
		refs.length !== 2 ||
		refs.some(
			(r, i) =>
				r.index !== (repair ? [5, 6] : [1, 6])[i] ||
				r.sourceCell !== (repair ? [2, 3] : [0, 3])[i] ||
				r.gridCell !== i + (repair ? 2 : 4) ||
				r.width !== 144 ||
				r.height !== 144 ||
				(repair && r.designSourceIndex !== i)
		)
	)
		throw new Error('The swap needs the two reviewed actual hatchet design references.');
	for (const ref of refs) {
		const source = sources[repair ? ref.designSourceIndex! : 0]!,
			job = await db.get<JobRec>('jobs', source.jobId),
			results = job?.jobs.flatMap((j) => j.results);
		if (
			job?.state !== 'done' ||
			job.requestHash !== source.requestHash ||
			results?.length !== 1 ||
			results[0].sha !== source.resultSha256
		)
			throw new Error('The exact completed hatchet design receipt is required.');
		const blob = await db.getBlob(source.resultSha256);
		if (!blob) throw new Error('The actual hatchet design result is missing.');
		const bytes = new Uint8Array(await blob.arrayBuffer());
		if ((await sha256(bytes)) !== source.resultSha256)
			throw new Error('The actual hatchet design PNG changed.');
		const image = await decodePngBytes(bytes),
			cols = repair && ref.designSourceIndex === 0 ? 3 : 2;
		if (image.w !== cols * 144 || image.h !== 288)
			throw new Error('The hatchet design result has a different canvas.');
		const actual = cutGrid(image, cols * 2, 144, 144, cols);
		const refBytes = base64ToBytes(ref.png),
			decoded = await decodePngBytes(refBytes),
			target = cells[ref.gridCell];
		if (
			decoded.w !== 144 ||
			decoded.h !== 144 ||
			(await sha256(refBytes)) !== ref.sha256 ||
			(await sha256(new Uint8Array(decoded.data))) !== ref.rgbaSha256 ||
			decoded.data.some((v, p) => v !== actual[ref.sourceCell].data[p] || v !== target.data[p])
		)
			throw new Error('A hatchet reference differs from its actual raw design pixels.');
		for (let p = 0; p < 144 * 144; p++) {
			const global =
				(Math.floor(ref.gridCell / packet.cols) * 144 + Math.floor(p / 144)) * packet.cols * 144 +
				(ref.gridCell % packet.cols) * 144 +
				(p % 144);
			if (mask[global]) throw new Error('Hatchet design reference cells must remain protected.');
		}
	}
}
export async function submitSwap(value: unknown) {
	const packet = parseSwapPacket(value),
		profile = profileOf(packet),
		completion = packet.request.seed === 736,
		repair = packet.request.seed === 737,
		authored = completion || repair;
	if (
		packet.canonicalHash !== profile.sha ||
		(await sha256(stableStringify({ ...packet, canonicalHash: undefined }))) !== profile.sha
	)
		throw new Error('The swap file differs from the reviewed source-bound diagnostic.');
	const recipe = authored ? await checkedRecipe(packet) : undefined,
		prior = await profile.exportSource();
	if (
		prior.probe?.callId !== packet.sourceDisarmCallId ||
		prior.probe.jobId !== packet.sourceDisarmJobId ||
		prior.probe.packet.canonicalHash !== profile.sourceSha ||
		packet.sourceArmedPacketCanonicalHash !== profile.sourceSha ||
		prior.job?.state !== 'done' ||
		prior.job.id !== packet.sourceDisarmJobId ||
		prior.images.length !== 1 ||
		prior.images[0].sha !== packet.sourceDisarmResultSha
	)
		throw new Error('The exact reviewed completed disarm receipt is required for this swap.');
	if (
		(await sha256(stableStringify({ ...prior.probe.packet, canonicalHash: undefined }))) !==
			profile.sourceSha ||
		(!authored && packet.gridSha256 !== prior.probe.packet.gridSha256)
	)
		throw new Error('The reviewed armed source packet or original input identity changed.');
	const bareBytes = base64ToBytes(prior.images[0].png),
		inputBytes = base64ToBytes(packet.request.inpainting_image.image.base64),
		maskBytes = base64ToBytes(packet.request.mask_image.image.base64);
	if (
		(await sha256(bareBytes)) !== packet.sourceDisarmResultSha ||
		(await sha256(inputBytes)) !== packet.gridSha256 ||
		(await sha256(maskBytes)) !== packet.maskSha256 ||
		!prior.job.inputs.includes(authored ? prior.probe.packet.gridSha256 : packet.gridSha256)
	)
		throw new Error('The frozen disarm result or original armed input hash changed.');
	const bare = await decodePngBytes(bareBytes),
		input = await decodePngBytes(inputBytes);
	if (bare.w !== 288 || bare.h !== 288 || input.w !== (completion ? 432 : 288) || input.h !== 288)
		throw new Error('The swap source has a different canvas.');
	const bodies = cutGrid(bare, 4, 144, 144, 2),
		armed = cutGrid(input, completion ? 6 : 4, 144, 144, packet.cols),
		mask = await maskBits(packet.request.mask_image.image.base64, input.w, input.h);
	const sourcePositions = authored
		? packet.indices.map((index) => prior.probe!.packet.indices.indexOf(index))
		: packet.indices.map((_, i) => i);
	if (sourcePositions.some((p) => p < 0))
		throw new Error('The selected targets are missing from their pinned source sequence.');
	let originals: Img[] | undefined;
	if (authored) {
		const source = prior.probe.packet,
			sourceJob = await db.get<JobRec>('jobs', source.sourceJobId),
			results = sourceJob?.jobs.flatMap((j) => j.results),
			sourceBytes = base64ToBytes(source.request.inpainting_image.image.base64),
			sourceGrid = await decodePngBytes(sourceBytes);
		if (
			packet.sourceFirstWeaponJobId !== source.sourceJobId ||
			sourceJob?.state !== 'done' ||
			sourceJob.requestHash !== source.sourceRequestHash ||
			results?.length !== 1 ||
			results[0].sha !== source.sourceGridSha256 ||
			(await sha256(sourceBytes)) !== source.gridSha256 ||
			sourceGrid.w !== 288 ||
			sourceGrid.h !== 288
		)
			throw new Error('The original armed source ancestry changed.');
		const sourceFrames = cutGrid(sourceGrid, 4, 144, 144, 2);
		if (
			sourcePositions.some((position, i) =>
				sourceFrames[position].data.some((v, p) => v !== armed[i].data[p])
			)
		)
			throw new Error('A target differs from its actual reviewed C-prime input.');
		originals = await verifiedOriginalSourceFrames(sourceJob);
		await verifyDesignReferences(packet, armed, mask);
	}
	for (const [i, frame] of packet.frames.entries()) {
		const position = sourcePositions[i],
			image = armed[i],
			body = bodies[position],
			frozenBytes = base64ToBytes(frame.frozenBase.png),
			frozen = await decodePngBytes(frozenBytes),
			sourceBytes = base64ToBytes(frame.png),
			source = await decodePngBytes(sourceBytes);
		if (
			source.w !== 144 ||
			source.h !== 144 ||
			frozen.w !== 144 ||
			frozen.h !== 144 ||
			(await sha256(sourceBytes)) !== frame.sha256 ||
			(await sha256(new Uint8Array(source.data))) !== frame.rgbaSha256 ||
			(await sha256(new Uint8Array(image.data))) !== frame.rgbaSha256 ||
			(await sha256(frozenBytes)) !== frame.frozenBase.sha256 ||
			(await sha256(new Uint8Array(frozen.data))) !== frame.frozenBase.rgbaSha256 ||
			(!authored && (await sha256(new Uint8Array(body.data))) !== frame.frozenBase.rgbaSha256)
		)
			throw new Error('A swap frame differs from its frozen source pixels.');
		const original = prior.probe.packet.frames[position];
		if (frame.grip.x !== original.grip?.x || frame.grip.y !== original.grip?.y)
			throw new Error('A swap grip differs from its reviewed source observation.');
		const [weapon, known, unknown, edit, oldWeapon, oldKnown, oldUnknown] = await Promise.all(
			[
				frame.weaponMask,
				frame.bodyMask,
				frame.unknownMask,
				frame.editMask,
				original.weaponMask,
				original.bodyMask,
				original.unknownMask
			].map((s) => maskBits(s, 144))
		);
		if (recipe)
			await verifyAuthoredBody(
				packet,
				frame,
				recipe.frames[frame.index],
				body,
				originals![position],
				image,
				oldKnown,
				oldWeapon,
				oldUnknown,
				frozen,
				profile.sourceSha as typeof DISARM_PACKET_SHA256 | typeof COMPLETION_DISARM_PACKET_SHA256
			);
		const guide = repair ? await axisRepairPermission(packet, frame) : undefined;
		for (let p = 0; p < 144 * 144; p++) {
			const alpha = image.data[p * 4 + 3],
				x = p % 144,
				y = Math.floor(p / 144),
				global = (Math.floor(i / packet.cols) * 144 + y) * input.w + (i % packet.cols) * 144 + x;
			if (
				![0, 255].includes(alpha) ||
				weapon[p] !== oldWeapon[p] ||
				known[p] !== oldKnown[p] ||
				unknown[p] !== oldUnknown[p] ||
				weapon[p] + known[p] + unknown[p] !== Number(alpha > 0) ||
				edit[p] !== mask[global] ||
				((known[p] || unknown[p]) && edit[p]) ||
				(weapon[p] && !edit[p]) ||
				(!alpha && edit[p] && Math.hypot(x + 0.5 - frame.grip.x, y + 0.5 - frame.grip.y) > 40)
			)
				throw new Error(
					'The swap edit exceeds its reviewed weapon/transparent envelope, changes source labels or exposes visible fingers.'
				);
			if (authored) {
				const inside = x >= 16 && y >= 16 && x < 128 && y < 128,
					radius = Math.hypot(x + 0.5 - frame.grip.x, y + 0.5 - frame.grip.y),
					allowed = Number(!!weapon[p] || (!alpha && (guide ? guide[p] : inside && radius <= 40)));
				if ((weapon[p] && (!inside || (repair && radius > 40))) || edit[p] !== allowed)
					throw new Error(
						'The swap mask differs from its reviewed held-window and weapon envelope.'
					);
			}
		}
	}
	return dispatchFixedInpaint(
		{ key: profile.key, label: profile.label, units: 25 },
		packet,
		packet.request
	);
}
export const readSwap = () => readFixedInpaint<SwapPacket>(SWAP_KEY);
export const exportSwap = () => exportFixedInpaint<SwapPacket>(SWAP_KEY);
export const readCompletionSwap = () => readFixedInpaint<SwapPacket>(COMPLETION_SWAP_KEY);
export const exportCompletionSwap = () => exportFixedInpaint<SwapPacket>(COMPLETION_SWAP_KEY);
