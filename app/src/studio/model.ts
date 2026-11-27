// Studio model helpers (pure, node-runnable): item thumbnails, base prompts, wording for
// QA and costs. Frame placement lives in lib/rig/normalize.ts (one rule for M2/M3/Studio).
import { makeImg, type Img } from '../lib/image/png.ts';
import { composeCell, layerFrame, unionFrame } from '../lib/compose/compose.ts';
import type {
	DirectionName,
	Item,
	ItemQa,
	Manifest,
	Project,
	QaSummary,
	UnfitNote
} from '../lib/store/manifest.ts';
import { GATES, isAction, ITEM_GRID_REGISTRATION_NOTICE, SLOTS } from '../lib/items/items.ts';
import { coverageGaps, missingFrames } from '../lib/dress/dress.ts';
import { DEFAULT_MOVE, DIRECTIONS, type Rig, type RigAnimation } from '../lib/rig/rig.ts';
import { moveExportId } from '../lib/store/identity.ts';
import { stateClipName } from '../lib/rig/poses.ts';
import { clipKind } from '../lib/runtime/timeline.js';
import { editedCount } from '../lib/frames/history.ts';
import { message, type Message } from '../lib/message.ts';
import type { Translate, WhisperKey, WhisperVars } from 'svelte-whisper';

/** A body-QA note with a readable clip and direction prefix ("walk/west: ..." -> "Walk west: ..."). */
export function bodyQualityNote(
	warning: string,
	translate?: Translate,
	displayDirection: (direction: DirectionName) => string = (direction) => direction
): string {
	// The item-review note of a new move (create.ts): checked first, since an item name may contain a slash.
	const review = /^(.+): item quality checks need review\. No paid retry was started\.$/.exec(
		warning
	);
	if (review) return copy(translate)(warning, 'studioModel.itemQualityReview', { name: review[1] });
	const scoped = /^([^/]+)\/([^:]+): ([\s\S]*)$/.exec(warning);
	if (!scoped) return warning;
	const [, clip, rawDirection, reason] = scoped;
	const move = clip[0].toUpperCase() + clip.slice(1);
	const knownDirection = DIRECTIONS.find((direction) => direction === rawDirection);
	const direction = knownDirection ? displayDirection(knownDirection) : rawDirection;
	return copy(translate)(`${move} ${direction}: ${reason}`, 'studioModel.bodyQuality', {
		move,
		direction,
		reason: bodyReason(reason, translate)
	});
}
/** Body-check reasons the app words itself (create.ts) in the active language; measured observations stay as written. */
function bodyReason(reason: string, translate?: Translate): string {
	const bridged = /^joints of motion frame (\d+) of (\d+) were inferred from its neighbors$/.exec(
		reason
	);
	if (bridged)
		return copy(translate)(reason, 'studioModel.bridgedJoints', {
			frame: Number(bridged[1]),
			total: Number(bridged[2])
		});
	const short =
		/^PixelLab sent (\d+) frames instead of (\d+), so the first or last frame may differ$/.exec(
			reason
		);
	if (short)
		return copy(translate)(reason, 'studioModel.shortFrames', {
			count: Number(short[1]),
			expected: Number(short[2])
		});
	return reason;
}

/** A rig setup warning (lib/rig/setup.ts) in the active language; clip-scoped observations read like body quality notes. */
export function setupWarningNote(
	warning: string,
	translate?: Translate,
	displayDirection: (direction: DirectionName) => string = (direction) => direction,
	displayMoveName: (move: string) => string = (move) => move
): string {
	const headroom =
		/^(\S+) leaves (\d+) px above the head; tall hair or hats may need a larger frame\.$/.exec(
			warning
		);
	const known = headroom && DIRECTIONS.find((direction) => direction === headroom[1]);
	if (headroom && known)
		return copy(translate)(warning, 'setup.warnings.headroom', {
			direction: displayDirection(known),
			count: Number(headroom[2])
		});
	const kept =
		/^(.+) keeps its existing frames\. Make it again after setup to animate it onto future moves\.$/.exec(
			warning
		);
	if (kept) return copy(translate)(warning, 'setup.warnings.keptFrames', { name: kept[1] });
	const skipped =
		/^(.+) was skipped: PixelLab could not find valid joints on one of its frames\. Make it again to animate items on it\.$/.exec(
			warning
		);
	if (skipped)
		return copy(translate)(warning, 'setup.warnings.moveSkipped', {
			move: displayMoveName(skipped[1])
		});
	const empty =
		/^(.+) was skipped: one of its frames is empty\. Fix that frame or make the move again to animate items on it\.$/.exec(
			warning
		);
	if (empty)
		return copy(translate)(warning, 'setup.warnings.moveSkippedEmpty', {
			move: displayMoveName(empty[1])
		});
	return bodyQualityNote(warning, translate, displayDirection);
}

/** A character's shape at a glance: "64 px · 4 directions · 2 moves · 6 items". */
export const pixelSize = ({ w, h }: { w: number; h: number }) => `${w}×${h} px`;
export function characterFacts(m: Manifest): { frame: string; counts: Message[] } {
	const states = m.rig.animations.filter((clip) => clipKind(clip) === 'state').length;
	return {
		frame: pixelSize(m.rig.cell),
		counts: [
			message('export.count.directions', { count: m.rig.directions.length }),
			...(states ? [message('import.count.states', { count: states })] : []),
			message('export.count.moves', { count: m.rig.animations.length - states }),
			message('export.count.items', {
				count: m.items.filter((item) => item.id !== m.rig.baseItem).length
			})
		]
	};
}
/** One item alone in canonical draw order in one cell; mirrored directions flip their source. Oversize layers (v1.3.1,
 * e.g. 96 px held items) line up by pivot on the union of the item's layer frames. */
export function itemCell(
	p: Project,
	it: Item,
	anim: string,
	dir: DirectionName,
	cell: number
): Img {
	const rig = p.manifest.rig,
		frame = unionFrame(it.layers.map((l) => layerFrame(rig, l)));
	return composeCell(
		{ ...p, manifest: { ...p.manifest, items: [it] } },
		{ [it.slot]: it.id },
		anim,
		dir,
		cell,
		frame
	);
}

/** The item's first frame, the one its thumbnail shows (south first): the reference for a copy of it drawn to fit another
 *  body. Undefined when it has no art yet. */
export function itemReferenceFrame(p: Project, it: Item): Img | undefined {
	for (const { anim, dir, cell } of thumbCells(p.manifest, it))
		return itemCell(p, it, anim, dir, cell);
}

/** Cells with stored item art in thumbnail order (south first), with the images each needs. */
export function* thumbCells(
	m: Manifest,
	it: Item
): Generator<{ anim: string; dir: DirectionName; cell: number; hashes: string[] }> {
	const dirs = [...m.rig.directions].sort(
		(a, b) => Number(b.id === 'south') - Number(a.id === 'south')
	);
	for (const a of m.rig.animations)
		for (const d of dirs)
			for (const f of a.frames) {
				const hashes = it.layers.flatMap(
					(l) => (l.cells?.[a.id]?.[d.id] ?? l.cells?.[a.id]?.[d.mirrorOf ?? d.id])?.[f.cell] ?? []
				);
				if (hashes.length) yield { anim: a.id, dir: d.id, cell: f.cell, hashes };
			}
}

/** Stable item-only thumbnail, independent of playback. Prefer south and use another landed frame when needed. */
export function thumbCell(p: Project, it: Item): Img | null {
	if (!it.layers.length) return null;
	// Sparse drafts can contain many pending cells: only cells with references allocate a composed frame.
	for (const c of thumbCells(p.manifest, it)) {
		const im = itemCell(p, it, c.anim, c.dir, c.cell);
		if (im.data.some((v, i) => i % 4 === 3 && v)) return im;
	}
	return null;
}

/** Opaque bounding box crop (null when empty). */
export function crop(im: Img): Img | null {
	let x0 = im.w,
		y0 = im.h,
		x1 = -1,
		y1 = -1;
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++)
			if (im.data[(y * im.w + x) * 4 + 3]) {
				x0 = Math.min(x0, x);
				x1 = Math.max(x1, x);
				y0 = Math.min(y0, y);
				y1 = y;
			}
	if (x1 < 0) return null;
	if (x0 === 0 && y0 === 0 && x1 === im.w - 1 && y1 === im.h - 1) return im;
	const o = makeImg(x1 - x0 + 1, y1 - y0 + 1);
	for (let y = 0; y < o.h; y++)
		o.data.set(
			im.data.subarray(((y0 + y) * im.w + x0) * 4, ((y0 + y) * im.w + x1 + 1) * 4),
			y * o.w * 4
		);
	return o;
}

/** Crop several same-size images to the union of their opaque boxes (keeps them aligned). */
export function cropAll(ims: Img[]): Img[] {
	let x0 = 1e9,
		y0 = 1e9,
		x1 = -1,
		y1 = -1;
	for (const im of ims)
		for (let y = 0; y < im.h; y++)
			for (let x = 0; x < im.w; x++)
				if (im.data[(y * im.w + x) * 4 + 3]) {
					x0 = Math.min(x0, x);
					x1 = Math.max(x1, x);
					y0 = Math.min(y0, y);
					y1 = Math.max(y1, y);
				}
	if (x1 < 0) return ims;
	return ims.map((im) => {
		const o = makeImg(x1 - x0 + 1, y1 - y0 + 1);
		for (let y = 0; y < o.h; y++)
			o.data.set(
				im.data.subarray(((y0 + y) * im.w + x0) * 4, ((y0 + y) * im.w + x1 + 1) * 4),
				y * o.w * 4
			);
		return o;
	});
}

/** One crop for the entire clip, so animated item previews keep their scale, alignment and layout bounds. */
export function itemPreviewFrames(p: Project, it: Item, anim: string): Img[][] {
	const clip = p.manifest.rig.animations.find((a) => a.id === anim);
	if (!clip) return [];
	const dirs = p.manifest.rig.directions;
	const cropped = cropAll(
		clip.frames.flatMap((f) => dirs.map((d) => itemCell(p, it, anim, d.id, f.cell)))
	);
	return clip.frames.map((_, i) => cropped.slice(i * dirs.length, (i + 1) * dirs.length));
}

/** Nude opt-in prompt: the user's words + a bare paper-doll body, so no garment shows through the items' gaps (round 5: the former
 * t-shirt showed in necklines, armholes and open fronts). The shortest wording that drew no garment on a man and a woman over
 * four seeds; without "everywhere" or "nothing worn" men get briefs or a loincloth. "nude" and "underwear" are avoided. See
 * docs/research/bare-skin-base-wording-2026-10-25.md. */
export const BASE_CLOTHES = 'with plain bare skin everywhere, nothing worn';
export const BASE_BODY = `plain bald paperdoll base body, ${BASE_CLOTHES}, barefoot, no hair, no accessories, neutral standing pose with arms slightly away from the torso`;
export const UNDERWEAR_CLOTHES = 'wearing a plain white underwear set';
export const UNDERWEAR_BODY = BASE_BODY.replace(BASE_CLOTHES, UNDERWEAR_CLOTHES);
export const isBaseBody = (line: string) =>
	line.trim() === BASE_BODY || line.trim() === UNDERWEAR_BODY;
export const withoutBaseBody = (text: string) =>
	text.replace(UNDERWEAR_BODY, '').replace(BASE_BODY, '');
/** The clothes of the base body line in a prompt, or undefined when the prompt has none. */
export const baseClothesIn = (text: string) =>
	text.includes(UNDERWEAR_BODY)
		? UNDERWEAR_CLOTHES
		: text.includes(BASE_BODY)
			? BASE_CLOTHES
			: undefined;
export const basePrompt = (desc: string) =>
	`${desc.trim().replace(/[.\s]+$/, '')}, ${UNDERWEAR_BODY}`;
/** What the base LOOKS like (raw skeleton-v3 `description`, S3): no pose words, empty hands. `clothes` null: the description
 * says what the body wears (an exact prompt without a base body line), so no base clothes are added on top of it. */
export const looksOf = (desc: string, clothes: string | null = UNDERWEAR_CLOTHES) =>
	`${desc.trim().replace(/[.\s]+$/, '')}, ${clothes == null ? '' : `bald, ${clothes}, barefoot, `}empty hands, no weapon`;

export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
/** Readable move names keep their stored IDs; colliding labels expose the IDs so every move remains selectable. */
/** A move by internal ID, or the rig's move with the name and export ID the user gave it. */
export type MoveRef = string | Pick<RigAnimation, 'id' | 'name' | 'exportId'>;
const moveNameKeys: Readonly<Record<string, WhisperKey>> = {
	default: 'moveNames.default',
	idle: 'moveNames.idle',
	walk: 'moveNames.walk',
	run: 'moveNames.run',
	'getting-up': 'moveNames.gettingUp',
	'scary-walk': 'moveNames.scaryWalk',
	'running-jump': 'moveNames.runningJump'
};
/** The move's name as words for a Message: a built-in move's catalog name, else its label (a name the user gave it stays as
 *  typed). Free of the i18n runtime, so flows can name a move in an error that follows a language switch. */
export function moveName(id: string, moves: readonly MoveRef[] = []): Message | string {
	const label = moveLabel(id, moves);
	const named = moves.some(
		(move) => typeof move !== 'string' && move.id === id && move.name !== undefined
	);
	return !named && Object.hasOwn(moveNameKeys, id) && label === moveLabel(id)
		? message(moveNameKeys[id])
		: label;
}
export function moveLabel(id: string, moves: readonly MoveRef[] = []): string {
	const readable = (value: string) => {
		const text = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
		return text ? text[0].toUpperCase() + text.slice(1) : '';
	};
	const refs = moves.map((move) => (typeof move === 'string' ? { id: move } : move));
	const labelOf = (move: Exclude<MoveRef, string>) =>
		move.name ?? stateClipName(move.id) ?? readable(move.id);
	const self = refs.find((move) => move.id === id) ?? { id };
	const label = labelOf(self);
	// Valid export IDs contain only lowercase letters, digits, underscores and hyphens, never parentheses.
	return refs.some((other) => other.id !== id && labelOf(other) === label)
		? `${label} (${moveExportId(self, refs)})`
		: label;
}

/** A move job's name. Items-only jobs for one move queue one per item, so each names its items to stay distinct. */
export function displayMoveJob(
	move: string,
	spec: { readonly items: readonly string[]; readonly itemsOnly?: boolean },
	items: readonly { readonly id: string; readonly name: string }[] = []
): string {
	if (!spec.itemsOnly) return move;
	const names = spec.items.flatMap((id) => items.find((item) => item.id === id)?.name ?? []);
	return names.length ? `${move} · ${names.join(', ')}` : move;
}
/** The noun of the description's first phrase: "a sturdy young dwarf with a friendly face" -> "Dwarf". */
// ponytail: last word before with/who/in/wearing/comma; a rename field is the real fix.
export function nameFrom(desc: string): string {
	const head = desc.trim().split(/\s+(?:with|who|in|wearing|from|and)\s+|[,.;]/i)[0];
	const w = head.split(/\s+/).filter(Boolean).at(-1) ?? '';
	return w ? w[0].toUpperCase() + w.slice(1) : 'My character';
}

/** A description without its leading article and count ("a pair of leather boots" -> "leather boots"). */
const stripCount = (desc: string) =>
	desc.trim().replace(/^(?:(?:a|an|the|some|two)\s+)?(?:(?:pairs?|sets?|couple)\s+of\s+)?/i, '');
/** The head phrase of an item description: article and count removed, then cut at prepositions and attachment words ("iron
 * lantern hanging from a short chain" -> "iron lantern"). "of" stays: it names the item ("cloak of shadows"); a head longer
 * than four words is cut there ("sword of a thousand truths"). */
const itemHead = (desc: string) => {
	const head = stripCount(desc).split(
		/\s+(?:with|that|which|for|made|in|on|and|from|by|at|to|under|over|around|hanging|holding|held|carrying|dangling|attached|wrapped|covered|trimmed|decorated|lined|studded)\s+|[,.;:]/i
	)[0];
	return head.split(/\s+/).length > 4 ? head.split(/\s+of\s+/i)[0] : head;
};
/** Held items PixelLab draws in the left hand: bows (archery prior; round 2 arm B: main hand got the right hand on 1/3 seeds,
 * off hand 3/3) and shields (the main-hand wording forbids a shield). Crossbows stay in the main hand. */
// (?!-): "shield-breaker axe" and "bow-staff" name the main-hand weapon. "aegis" is left out: it names engravings and crests too.
const OFF_HAND =
	/\b(?:long|short|recurve|hunting|war|great|flat)?bows?\b(?!-)|\b(?:shield|buckler|targe|pavise|scutum)s?\b(?!-)/i;
// The item's subject decides: "a steel sword with a scutum emblem" is a sword (2026-11-07 counter-review R6). The cut is at
// attachment and decoration clauses only, so color pairs and adjective lists stay ("a black and gold kite shield").
const SUBJECT_END =
	/\s+(?:with|that|which|bearing|featuring|showing|depicting|decorated|engraved|emblazoned|etched|painted|carved|inlaid|of|from|on|in|for|by|at|to|under|over|around|hanging|holding|held|carrying|dangling|attached|wrapped|covered|trimmed|lined|studded|made)\s+/i;
/** A hint only: the description names a shield or bow, which belongs in the off hand. The user's group choice stands. */
export const namesOffHandItem = (prompt: string) =>
	OFF_HAND.test(stripCount(prompt).split(SUBJECT_END)[0]);
/** Item name from its description, sentence case like the demo: "a straw farmer hat, frayed" -> "Straw farmer hat" (T1 P2-15). */
export function itemNameFrom(desc: string): string {
	const head = itemHead(desc);
	const w = head.split(/\s+/).filter(Boolean).slice(-4).join(' ');
	return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
}

/** Whether the free Accept as is and Keep without moves of an item wait for other work: a move or setup still running on
 *  its character, or a stopped move whose review involves the item. A move stopped elsewhere or for other items never
 *  blocks them (acceptItemReview still refuses a change that happened meanwhile). */
export function itemAcceptWaits(
	item: string,
	character: string,
	move: {
		spec: { items: readonly string[] } | null;
		projectId: string;
		done: boolean;
		error: unknown;
	},
	setup: { spec: { projectId: string } | null; done: boolean; error: unknown }
): boolean {
	const moveHere = !!move.spec && !move.done && move.projectId === character;
	return (
		(moveHere && (!move.error || move.spec!.items.includes(item))) ||
		(!!setup.spec && !setup.done && !setup.error && setup.spec.projectId === character)
	);
}

export type Health = 'clean' | 'accepted' | 'look' | 'unfitted' | 'stale' | 'demo' | 'edited';
export function healthOf(m: Manifest, it: Item): Health {
	if (it.baseHash !== m.rig.baseHash) return 'stale';
	// A copy worn as drawn for another body, or a free re-fit with frames to check, whatever its source's checks said.
	if (it.unfitted) return 'unfitted';
	if (it.refit?.length) return 'look';
	if (it.qa?.status === 'fail' || it.qa?.status === 'warn') return 'look';
	if (it.designWarnings?.length || it.qa?.status === 'accepted') return 'accepted';
	// Checks never measured frames the user replaced (Fix frames), so they cannot claim a pass.
	if (editedCount(m, it)) return 'edited';
	if (!it.qa) return 'demo';
	return it.qa.status === 'pass' ? 'clean' : 'look';
}
export const HEALTH_LABEL: Record<Health, Message> = {
	clean: message('studioModel.health.clean'),
	accepted: message('studioModel.health.accepted'),
	look: message('studioModel.health.look'),
	unfitted: message('studioModel.health.unfitted'),
	stale: message('studioModel.health.stale'),
	demo: message('studioModel.health.demo'),
	edited: message('studioModel.health.edited')
};

/** Frames an item lacks in moves its body has (dress.ts coverageGaps), where it would vanish: a short warning for its
 * tile and menu. Details names the exact directions. */
export function missingFramesNote(m: Manifest, it: Item): Message | '' {
	const moves = missingMoves(m, it);
	if (!moves.length) return '';
	if (moves.length > 1)
		return message('studioModel.coverage.severalMoves', { count: moves.length });
	// No frame at all in that move (kept without it, or made before it existed) is not "some" frames missing.
	const none = !it.layers.some((layer) =>
		Object.values(layer.cells?.[moves[0]] ?? {}).some((frames) => frames?.some(Boolean))
	);
	return message(none ? 'studioModel.coverage.notMade' : 'studioModel.coverage.oneMove', {
		move: moveLabel(moves[0], m.rig.animations)
	});
}
/** No view of `anim` has every frame of the item, so the stage shows none of it there (an incomplete view is hidden whole). */
export const notShownIn = (m: Manifest, it: Item, anim: string): boolean =>
	m.rig.directions.every((d) => missingFrames(m, it, anim, d.id).length > 0);
/** Where Preview goes when the item is put on while `anim` does not show it: Standing, else the first move or State that
 *  shows it. Undefined when `anim` shows it or nothing does. */
export function wearClip(m: Manifest, it: Item, anim: string): string | undefined {
	if (!notShownIn(m, it, anim)) return;
	const shows = (id: string) => id !== anim && !notShownIn(m, it, id);
	return m.rig.animations.some((a) => a.id === DEFAULT_MOVE) && shows(DEFAULT_MOVE)
		? DEFAULT_MOVE
		: m.rig.animations.find((a) => shows(a.id))?.id;
}
/** Those moves by name, for a message with room to list them. */
export function missingMoves(m: Manifest, it: Item): string[] {
	return [...new Set(coverageGaps(m, it).map((g) => g.split('/')[0]))];
}

/** QA gate messages in plain words (D1 §5.5). */
function describeReason(s: string): { text: string; translation: Message | string } {
	const say = (text: string, key: WhisperKey, vars?: WhisperVars) => ({
		text,
		translation: message(key, vars)
	});
	// Per-move checks prefix a whole-item message with its move ("default/east: G8 ..."): translate the message itself.
	const scoped = /^[^ :/]+\/[^ :/]+: ([A-Z]\d+ .*)$/.exec(s);
	if (scoped) return describeReason(scoped[1]);
	if (s === ITEM_GRID_REGISTRATION_NOTICE) return say(s, 'studioModel.qa.registrationShift');
	const joints = /^([^/ ]+)\/([^ ]+) frame (\d+): suspicious estimated joints/.exec(s);
	if (joints) {
		const move = joints[1].replaceAll('-', ' '),
			direction = joints[2].replaceAll('-', ' '),
			frame = Number(joints[3]);
		return say(
			`The joints look unusual in ${move} ${direction} frame ${frame}, so the item may not fit there. Check the grip or alignment.`,
			'studioModel.qa.suspiciousJoints',
			{ move, direction, frame }
		);
	}
	if (s.startsWith('D2 '))
		return say(
			'The requested waist band differs between standing views',
			'studioModel.qa.standingWaist'
		);
	if (s === 'J1 joint review')
		return say(
			'Some frames were fitted on joints that look unusual. Check the grip or alignment.',
			'studioModel.qa.jointReview'
		);
	if (s.startsWith('G13 '))
		return say(
			'The waist band differs from the standing design; inspect the clothing',
			'studioModel.qa.waist'
		);
	if (s.startsWith('G14 '))
		return say(
			'Some frames resemble the opposite view; inspect the torso',
			'studioModel.qa.facing'
		);
	if (s.startsWith('G15 '))
		return say(
			'A detail of the design is missing or recolored in some frames',
			'studioModel.qa.detail'
		);
	if (s.startsWith('G16'))
		return say("Check the item's size and angle as it moves", 'studioModel.qa.motion');
	if (s.startsWith('G17'))
		return say(
			'The item is hollow in some frames, with only its outline left; inspect its shape',
			'studioModel.qa.fill'
		);
	if (s.startsWith('G11 '))
		return say(
			'Some lower clothing is missing compared with the standing design',
			'studioModel.qa.lowerClothing'
		);
	if (s.startsWith('G12 '))
		return say(
			'Footwear differs from the standing design; inspect the feet',
			'studioModel.qa.footwear'
		);
	if (s.startsWith('G2') && s.includes('not measurable'))
		return say(
			'The item covers almost all of the body, so it could not be checked; make sure it is not a redrawn body',
			'studioModel.qa.bodyUnmeasured'
		);
	if (s.startsWith('G2') || s.startsWith('G3'))
		return say('Some body pixels were changed by the model', 'studioModel.qa.bodyPixels');
	if (s.startsWith('G4'))
		return say('The item is missing in some frames', 'studioModel.qa.missing');
	if (s.startsWith('G5')) return say('The item changes size between frames', 'studioModel.qa.size');
	if (s.startsWith('G6')) return say('Colors drift between directions', 'studioModel.qa.colors');
	if (s.startsWith('G7'))
		return say('The item touches the frame edge (may be cut off)', 'studioModel.qa.edge');
	if (s.startsWith('G8')) {
		const clip = /^G8 ([^ :]+\/[^ :]+):/.exec(s)?.[1];
		const where = clip ? ` (${clip.replaceAll('/', ', ').replaceAll('-', ' ')})` : '';
		if (s.includes('hand positions are missing'))
			return say(
				`Hand positions are unavailable; set up the pose rig and check this view${where}`,
				'studioModel.qa.handPositions',
				{ where }
			);
		if (s.includes('handedness not checked'))
			return say(
				`Handedness could not be confirmed; inspect the intended hand${where}`,
				'studioModel.qa.handUnknown',
				{ where }
			);
		if (s.includes('grip side is unclear'))
			return say(
				`The grip side is unclear; check the intended hand${where}`,
				'studioModel.qa.gripSide',
				{ where }
			);
		if (s.includes('from both hands') || s.includes('grip contact not confirmed'))
			return say(
				`The grip could not be confirmed; inspect the item at the hand${where}`,
				'studioModel.qa.gripUnknown',
				{ where }
			);
		if (s.includes('other clips') || s === 'G8')
			return say(
				`The item may change hands between views; check the intended hand${where}`,
				'studioModel.qa.handSwitches',
				{ where }
			);
		const expects = /slot (\S+) expects hand_([lr])$/.exec(s);
		if (expects) {
			const slot =
				SLOTS.find((slot) => slot.id === expects[1])?.label ?? expects[1].replaceAll('_', ' ');
			const right = expects[2] === 'r';
			return say(
				`The item may be held in the wrong hand; ${slot} expects the ${right ? 'right' : 'left'} hand${where}`,
				right ? 'studioModel.qa.wrongRightHand' : 'studioModel.qa.wrongLeftHand',
				{ slot, where }
			);
		}
		return say(
			`The item may be held in the wrong hand; check the intended hand${where}`,
			'studioModel.qa.wrongHand',
			{ where }
		);
	}
	const key =
		/^K1 keyframe [^:]+: \d+ % of the item's colors lean toward the (.+) background, so parts may be missing$/.exec(
			s
		);
	if (key)
		return say(
			`Some of the item's colors are close to the ${key[1]} background, so parts may be missing`,
			'studioModel.qa.keyColor',
			{ color: key[1] }
		);
	if (s.startsWith('G9') && s.includes('keeps its own angle'))
		return say(
			'The held item hangs or sways instead of turning with the hand; check that it should',
			'studioModel.qa.heldHang'
		);
	if (s.startsWith('G1'))
		return say('PixelLab returned an unexpected image', 'studioModel.qa.unexpectedImage');
	if (s.startsWith('H4'))
		return say(
			'Some frames do not look like the design (e.g. a cape wrapped around an arm)',
			'studioModel.qa.design'
		);
	if (s.startsWith('D1') && s.includes('dark patch'))
		return say(
			'A dark patch is not seen in the other views; check that it is part of the design',
			'studioModel.qa.darkPatch'
		);
	if (s.startsWith('D1')) return say('The design has gray smudges', 'studioModel.qa.smudges');
	const pasted = /^R1 ([^/]+)\/([^:]+): dressed item pasted on (\d+)/.exec(s);
	if (pasted) {
		const move = pasted[1].replaceAll('-', ' '),
			direction = pasted[2].replaceAll('-', ' ');
		return say(
			`Held item pasted on ${pasted[3]} ${move} ${pasted[3] === '1' ? 'frame' : 'frames'} (${direction}); check that it moves`,
			'studioModel.qa.heldPasted',
			{ count: Number(pasted[3]), move, direction }
		);
	}
	const noGrid =
		/^([^/]+)\/([^:]+): no inpaint-v3 repair grid \((.+)\); kept the best pose roll/.exec(s);
	if (noGrid) {
		const move = noGrid[1].replaceAll('-', ' '),
			direction = noGrid[2].replaceAll('-', ' '),
			reason = noGrid[3];
		return say(
			`No repair grid for ${move} (${direction}): ${reason}; the best try was kept`,
			'studioModel.qa.noRepairGrid',
			{ move, direction, reason }
		);
	}
	if (s === 'The held item changes shape or angle when a move loops')
		return say(s, 'studioModel.qa.heldLoop');
	if (s === 'The held item hangs or sways instead of turning with the hand; check that it should')
		return say(s, 'studioModel.qa.heldHang');
	return { text: s, translation: s };
}

export const plainReason = (raw: string): string => describeReason(raw).text;
export const plainReasonMessage = (raw: string): Message | string =>
	describeReason(raw).translation;

const copy = (translate?: Translate) => (text: string, key: WhisperKey, vars?: WhisperVars) =>
	translate ? translate(key, vars) : text;

/**
 * Review reasons for a saved item. Saved QA keeps numbers, not messages, so numeric gates are named only for parts that did
 * not pass, at the limit that part was gated with: posed frames and a skeleton item's standing views allow more key outside
 * the body than other dressed views (a skeleton item's move drawn on its own frames is gated as dressed), and actions skip
 * the size check. A passing part never lists a reason. `skeleton` is a skeleton-pose item: only its standing clip can show
 * that it was drawn as one, and one without a standing clip was posed on every move.
 */
function qaReasonCodes(
	q: ItemQa,
	held: boolean,
	skeleton: false | Pick<Item, 'standing'>,
	rig?: Rig
): string[] {
	const r: string[] = [];
	if (q.missingLowerFrames) r.push('G11 lower-garment coverage');
	if (q.footwearReviewFrames) r.push('G12 footwear coverage');
	if (q.waistReviewFrames) r.push('G13 waist-band consistency');
	if (q.facingReviewFrames) r.push('G14 torso consistency');
	if (q.jointReviewFrames) r.push('J1 joint review');
	if (q.detailReviewFrames) r.push('G15 design detail');
	if (q.heldLoopReviewClips) r.push('The held item changes shape or angle when a move loops');
	if (q.heldHangReviewClips)
		r.push('The held item hangs or sways instead of turning with the hand; check that it should');
	if (q.motionReviewClips) r.push('G16');
	if (q.fillReviewClips) r.push('G17');
	if (q.unmeasured) return r;
	// The skeleton draft gates its standing views at the posed limit (run.ts kOut); every other clip by its own cells' route.
	const posed = (clip: string | null) =>
		(!!skeleton &&
			(!skeleton.standing || clip === null || clip.startsWith(`${skeleton.standing}/`))) ||
		Object.entries(q.cells).some(
			([k, c]) => (clip === null || k.startsWith(`${clip}/`)) && c.route === 'posed'
		);
	const parts: [string | null, QaSummary][] = [
		...Object.entries(q.clips),
		...(q.inherited?.summary ? [[null, q.inherited.summary] as [null, QaSummary]] : [])
	];
	for (const [clip, p] of parts) {
		if (p.status === 'pass') continue;
		if (p.minKeyKept < GATES.keyKept) r.push('G2');
		if (p.maxKeyOutside > (posed(clip) ? GATES.keyOutsidePosed : GATES.keyOutside)) r.push('G3');
		if (p.minAreaRatio < GATES.areaRatio) r.push('G4');
		if (p.maxAreaCV > GATES.areaCV && !(clip && isAction(clip, rig))) r.push('G5');
		if (p.maxPaletteDist > GATES.paletteDist) r.push('G6');
		if (p.clipPx) r.push('G7');
		if (p.handedness === 'switched') r.push('G8');
	}
	if (q.handedness === 'switched') r.push('G8');
	if (held) {
		for (const [clip, part] of Object.entries(q.clips)) {
			if (!part.hand) r.push(`G8 ${clip}: handedness not checked`);
			else if (part.hand === '?' && (!part.grip || part.grip.R + part.grip.L + part.grip.amb > 0))
				r.push(`G8 ${clip}: grip side is unclear`);
		}
		if (q.grip?.none) r.push('G8 grip contact not confirmed');
		if (!Object.keys(q.clips).length && !q.handedness) r.push('G8 handedness not checked');
	}
	return r;
}

export function qaReasons(
	q: ItemQa,
	held: boolean,
	skeleton: false | Pick<Item, 'standing'>,
	rig?: Rig
): string[] {
	return [...new Set(qaReasonCodes(q, held, skeleton, rig).map(plainReason))];
}

export function qaReasonMessages(
	q: ItemQa,
	held: boolean,
	skeleton: false | Pick<Item, 'standing'>,
	rig?: Rig
) {
	return uniqueBy(
		qaReasonCodes(q, held, skeleton, rig).map(describeReason),
		(reason) => reason.text
	).map((reason) => reason.translation);
}

/** Why an item worn as drawn for another body may not line up here, in one plain sentence. `from` names that character and
 *  `notes` say what was approximated (an unfitted item's own notes, or a shared entry's plan). */
export function unfitText(
	m: Manifest,
	from: string,
	notes: unknown,
	translate?: Translate
): string {
	// A copy saved by the release before notes were recorded holds `true`: it reads as one without notes.
	const list: readonly UnfitNote[] = Array.isArray(notes) ? notes : [],
		move = (id = '') => moveLabel(id, m.rig.animations),
		say = copy(translate);
	const parts = list.map((note, index) => {
		const target = move(note.anim);
		if (note.how === 'retimed')
			return say(`${target} spread from ${note.from} frames`, 'studioModel.unfit.retimed', {
				move: target,
				count: Number(note.from)
			});
		if (note.how === 'similar' || note.how === 'standing') {
			const source = move(note.from);
			return note.how === 'similar'
				? say(`${target} uses ${source}`, 'studioModel.unfit.similar', { move: target, source })
				: say(`${target} uses the first ${source} frame`, 'studioModel.unfit.standing', {
						move: target,
						source
					});
		}
		return index === 0
			? say(`Drawn at ${note.from} px`, 'studioModel.unfit.sizeFirst', { size: note.from })
			: say(`drawn at ${note.from} px`, 'studioModel.unfit.size', { size: note.from });
	});
	const lead = say(
		`Drawn for ${from}’s body, so it may float, clip or leave gaps.`,
		'studioModel.unfit.lead',
		{ from }
	);
	if (!parts.length) return lead;
	const details = parts.join('; ');
	return say(
		`${lead} ${details.replace(/^./, (char) => char.toUpperCase())}.`,
		'studioModel.unfit.withDetails',
		{ lead, details }
	);
}

/** Where to look at a free re-fit of another character's item, in plain words: one line per move and direction whose
 *  frames failed a check, with its first such frame to show, and one per view whose source design has a finding. */
export function refitNotes(
	m: Manifest,
	it: Item,
	translate?: Translate,
	format?: {
		direction: (id: DirectionName) => string;
		list: (parts: (string | number)[]) => string;
	}
): { text: string; anim: string; dir: DirectionName; frame: number }[] {
	const say = copy(translate),
		from = it.copiedFrom?.name ?? say('another character', 'studioModel.anotherCharacter'),
		ids = m.rig.animations;
	const check = {
		angle: say(`the forearm points another way than on ${from}`, 'studioModel.refit.angle', {
			from
		}),
		body: say('the grip may float off the body', 'studioModel.refit.body'),
		hidden: say(`${from}’s body hid part of the item there`, 'studioModel.refit.hidden', { from }),
		smudge: say(`${from}’s design has gray smudges in this view`, 'studioModel.refit.smudge', {
			from
		}),
		dark: say(`${from}’s design has a dark patch the other views lack`, 'studioModel.refit.dark', {
			from
		})
	};
	const list =
		format?.list ??
		((parts: (string | number)[]) =>
			parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : `${parts[0]}`);
	return (it.refit ?? []).map((n) => {
		const direction = format?.direction(n.dir) ?? n.dir.replaceAll('-', ' '),
			move = moveLabel(n.anim, ids);
		// A design finding covers its whole view; a one-frame move has no frame to name.
		let where: string;
		if (n.checks.every((c) => c === 'smudge' || c === 'dark'))
			where = say(`Facing ${direction}`, 'studioModel.refit.view', { direction });
		else if (m.rig.animations.find((a) => a.id === n.anim)?.cells === 1)
			where = say(`${move} facing ${direction}`, 'export.notes.rigIssue', { move, direction });
		else {
			const count = n.frames.length,
				frames = list(n.frames.map((f) => f + 1));
			where = say(
				`${move} facing ${direction}, ${count > 1 ? 'frames' : 'frame'} ${frames}`,
				'studioModel.refit.frames',
				{ move, direction, count, n: frames }
			);
		}
		const reasons = list(n.checks.map((c) => check[c]));
		return {
			text: say(`${where}: ${reasons}.`, 'studioModel.refit.note', { where, reasons }),
			anim: n.anim,
			dir: n.dir,
			frame: Math.min(...n.frames)
		};
	});
}

/** A mirrored view flips its drawn view's pixels, so a Main hand item shows in the left hand there. */
export const HANDS_SWAP = 'so hands swap there';
export const KEEP_EACH_HAND = 'Characters made with Unique 8 keep each hand.';
/** One line for the hand groups when the character has mirrored views, naming them in plain words; '' when it has none. */
export function mirroredHandsNote(
	rig: Pick<Rig, 'directions'>,
	translate?: Translate,
	direction = (id: DirectionName) => id.replaceAll('-', ' '),
	formatList = (parts: string[]) =>
		parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
): string {
	const views = rig.directions.filter((d) => d.mirrorOf).map((d) => d.id);
	if (!views.length) return '';
	const say = copy(translate);
	const side = views.find((d) => !d.includes('-'));
	const words =
		side && views.length === 3 && views.every((d) => d.endsWith(side))
			? say(`${side} and the ${side} diagonals`, 'studioModel.mirror.diagonals', {
					side: direction(side)
				})
			: formatList(views.map(direction));
	return say(
		`Facing ${words}, this character is mirrored, ${HANDS_SWAP}. ${KEEP_EACH_HAND}`,
		'studioModel.mirror.hands',
		{ directions: words }
	);
}

export const fmtGens = (n: number) => `${Math.round(n * 10) / 10} gens`;
/** Appended to a reported spend: calls PixelLab did not price are unknown, never $0. */
export const unknownCostText = (calls = 0) => (calls ? ` + ${calls} unknown` : '');
export const fmtTime = (s: number) =>
	s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(5, Math.round(s / 5) * 5)} s`;

/** First entry per key, order kept (drafts by spec.id: a list persisted twice heals on read). */
export const uniqueBy = <T>(xs: T[], key: (x: T) => string): T[] => {
	const seen = new Set<string>();
	return xs.filter((x) => !seen.has(key(x)) && !!seen.add(key(x)));
};

export function selfTest() {
	const ids = uniqueBy(
		[{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'b' }, { id: 'c' }],
		(x) => x.id
	)
		.map((x) => x.id)
		.join();
	console.assert(ids === 'a,b,c', `uniqueBy keeps one entry per id (${ids})`);
	const s = makeImg(48, 48);
	s.data.set([9, 9, 9, 255], 0);
	console.assert(
		nameFrom('a stocky dwarf, tan skin') === 'Dwarf' &&
			nameFrom('a sturdy young dwarf with a friendly face') === 'Dwarf' &&
			nameFrom('') === 'My character',
		'nameFrom'
	);
	console.assert(
		itemNameFrom('a straw farmer hat') === 'Straw farmer hat' &&
			itemNameFrom('Iron Knight Helmet with a red plume') === 'Iron knight helmet' &&
			itemNameFrom('') === '',
		`itemNameFrom ${itemNameFrom('a straw farmer hat')}`
	);
	console.assert(crop(s)!.w === 1 && crop(makeImg(2, 2)) === null, 'crop');
	console.assert(plainReason('G4 walk/south: item missing').includes('missing'), 'plainReason');
}
