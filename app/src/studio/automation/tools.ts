// PixelDoll's automation core: application-level operations for AI agents, independent of how an agent connects (WebMCP,
// page script, or a future adapter). Every tool calls the same Studio functions the buttons use, so validation, pricing,
// the job queue's unknown-outcome rules, persistence and undo apply unchanged. Agents never get raw storage or the token.
import { t } from 'svelte-whisper';
import { PreflightWarning } from '../../lib/message.ts';
import { app } from '../../lib/app.svelte.ts';
import { queue } from '../../lib/pixellab/queue.ts';
import { accountTier, tierDecision } from '../../lib/pixellab/plans.ts';
import { makeImg, type Img } from '../../lib/image/png.ts';
import {
	bakedFrame,
	cellImg,
	composeCell,
	layerFrame,
	over,
	rigFrame,
	type Frame
} from '../../lib/compose/compose.ts';
import { missingAt, missingFrames } from '../../lib/dress/dress.ts';
import type { Item, Preset, Project } from '../../lib/store/manifest.ts';
import type { StoredProject } from '../../lib/store/project.ts';
import { generationDetails } from '../../lib/store/generation.ts';
import * as db from '../../lib/store/db.ts';
import { DEFAULT_MOVE, type DirectionName } from '../../lib/rig/rig.ts';
import type { RigCtx } from '../../lib/items/run.ts';
import {
	DEMO,
	acceptGen,
	clearSlots,
	copyDemo,
	creates,
	discardGen,
	doc,
	genProgress,
	gens,
	moving,
	openProject,
	refreshProjects,
	setVariant,
	startCreate,
	startItem,
	store,
	studioStartupState,
	view,
	wear,
	wearDraft,
	type Gen
} from '../state.svelte.ts';
import {
	PRESETS,
	TRAITS,
	TRAIT_KEYS,
	BODY_SIZES,
	draftErrors,
	draftSpec,
	freshSeed,
	newCharacterDraft,
	setPreset,
	writeDetails,
	writeNudeBase,
	writeTrait,
	type Trait
} from '../characterConfig.ts';
import { estimate } from '../movePricing.ts';
import { categories } from '../slots.ts';
import { healthOf } from '../model.ts';
import { itemRoute } from '../itemRoute.ts';
import { downloadCharacterZip } from '../download.svelte.ts';
import {
	planEvidence,
	renderSheet,
	type EvidenceBackground,
	type SheetCell,
	type SheetSpec
} from './evidence.ts';
import { detachedPixels } from './defects.ts';
import { AgentError, validate, type Json, type JsonSchema, type Tool } from './contract.ts';
export { AgentError } from './contract.ts';
export type { Json, Tool, ToolResult } from './contract.ts';
import { budget, release, requestBudget, reserve, rateUsd } from './budget.ts';
import { MAX_BUDGET } from './contract.ts';

// ---------- shared reads ----------
const str = (description: string, maxLength = 200): JsonSchema => ({
	type: 'string',
	description,
	maxLength
});
const characterArg = str(
	'Character id from list_characters. Omit for the character open in the Studio. A different id opens that character.'
);
const imageDataArg: JsonSchema = {
	type: 'boolean',
	description:
		'Also return the sheets as base64 PNG. Only for clients that show such images to the model; otherwise screenshot the page, where they are shown.'
};
const scaleArg: JsonSchema = {
	type: 'integer',
	minimum: 1,
	maximum: 16,
	description:
		'Whole-pixel enlargement of each frame (default 4). Lowered automatically to keep a sheet within 1568 px.'
};

async function ready() {
	for (let i = 0; i < 100 && (studioStartupState() === 'loading' || doc.loading); i++)
		await new Promise((r) => setTimeout(r, 100));
	if (studioStartupState() === 'failed')
		throw new AgentError('PixelDoll could not load saved work in this tab.', 'not_ready');
	if (studioStartupState() === 'loading' || doc.loading)
		throw new AgentError('PixelDoll is still loading. Try again shortly.', 'not_ready');
}

/** The character the tool works on, opened in the Studio so the person sees what the agent does. */
async function character(id: unknown): Promise<Project> {
	await ready();
	if (typeof id === 'string' && id && id !== doc.id) {
		await refreshProjects();
		if (!store.projects.some((p) => p.id === id))
			throw new AgentError(`No character "${id}". Call list_characters.`, 'not_found');
		await openProject(id);
		await ready();
		if (doc.id !== id || doc.error)
			throw new AgentError(
				`Character "${id}" could not be opened: ${doc.error || 'unknown'}`,
				'not_ready'
			);
	}
	const p = view.project;
	if (!p) throw new AgentError('No character is open.', 'not_ready');
	return p;
}

const moveOf = (p: Project, id: unknown) => {
	const moves = p.manifest.rig.animations;
	const move = moves.find((m) => m.id === (id ?? DEFAULT_MOVE)) ?? (id ? undefined : moves[0]);
	if (!move)
		throw new AgentError(
			`No move "${String(id)}". Moves: ${moves.map((m) => m.id).join(', ')}.`,
			'not_found'
		);
	return move;
};

const dirsOf = (p: Project, wanted: unknown): DirectionName[] => {
	const all = p.manifest.rig.directions.map((d) => d.id);
	if (!Array.isArray(wanted) || !wanted.length) return all;
	for (const d of wanted)
		if (!all.includes(d))
			throw new AgentError(`No direction "${d}". Directions: ${all.join(', ')}.`, 'not_found');
	return all.filter((d) => wanted.includes(d));
};

/** One item's layers alone, in the shared frame so they line up with composites. */
function itemOnly(
	p: Project,
	it: Item,
	anim: string,
	dir: DirectionName,
	cell: number,
	frame: Frame
) {
	const out = makeImg(frame.w, frame.h);
	let any = false;
	const layers = [...it.layers].sort(
		(a, b) => Number(a.role === 'fg') - Number(b.role === 'fg') || a.z - b.z
	);
	for (const layer of layers) {
		const im = cellImg(p, layer, anim, dir, cell);
		if (!im) continue;
		const f = layerFrame(p.manifest.rig, layer);
		over(out, im, frame.x - f.x, frame.y - f.y);
		any = true;
	}
	return any ? out : null;
}

interface RenderOptions {
	move: string;
	dirs: DirectionName[];
	frames?: number[];
	scale: number;
	background?: EvidenceBackground;
	views: {
		label: string;
		kind: Exclude<SheetSpec['kind'], 'source'>;
		outfit: Preset['items'];
		only?: Item;
	}[];
	source?: Item;
}
const evidenceBackground = {
	type: 'string',
	enum: ['neutral', 'light', 'dark'],
	description: 'Contact sheet background (default neutral).'
} satisfies JsonSchema;

async function frameSheet(p: Project, o: RenderOptions) {
	const m = p.manifest;
	const anim = moveOf(p, o.move),
		frame = bakedFrame(m);
	const cells = o.frames?.length ? o.frames : [...Array(anim.cells).keys()];
	for (const cell of cells)
		if (!Number.isInteger(cell) || cell < 0 || cell >= anim.cells)
			throw new AgentError(`Frame ${cell} is outside ${anim.id} (0 to ${anim.cells - 1}).`);
	if (!cells.length) throw new AgentError(`Move "${anim.id}" has no frames.`, 'not_ready');
	const base = m.items.find((it) => it.id === m.rig.baseItem);
	const defects: ({
		direction: DirectionName;
		frame: number;
	} & NonNullable<ReturnType<typeof detachedPixels>>)[] = [];
	const pivot = { x: frame.x, y: frame.y };
	const specs: SheetSpec[] = o.views.map(({ label, kind, only, outfit }, index) => {
		const rows = o.dirs.map((dir) => {
			const relevant = only
				? [only]
				: [...(base ? [base] : []), ...missingAt(m, outfit, anim.id, dir)];
			const missing = new Set(relevant.flatMap((it) => missingFrames(m, it, anim.id, dir)));
			return {
				label: dir,
				cells: cells.map((cell): SheetCell => {
					const covered = (only || base) != null && !missing.has(cell);
					const image = only
						? itemOnly(p, only, anim.id, dir, cell, frame)
						: composeCell(p, outfit, anim.id, dir, cell, frame);
					if (index === 0 && image && covered) {
						const detached = detachedPixels(image);
						if (detached) defects.push({ direction: dir, frame: cell, ...detached });
					}
					return { image, covered };
				})
			};
		});
		// A single frame compares all views side by side.
		return cells.length === 1
			? {
					label,
					kind,
					pivot,
					columns: o.dirs,
					rows: [{ label: String(cells[0]), cells: rows.map((row) => row.cells[0]) }]
				}
			: { label, kind, pivot, columns: cells.map(String), rows };
	});
	const source = o.source;
	if (source && Object.values(source.dressed ?? {}).some(Boolean)) {
		const rig = rigFrame(m.rig);
		const nativeFrames = [rig, ...source.layers.map((l) => layerFrame(m.rig, l))];
		specs.push({
			label: `${source.name} · ${t('stateCapture.source')}`,
			kind: 'source',
			columns: o.dirs,
			rows: [
				{
					label: '',
					cells: o.dirs.map((dir) => {
						const hash = source.dressed?.[dir];
						const image = (hash && p.images.get(hash)) || null;
						if (!image) return { image, covered: false };
						const native = nativeFrames.find(({ w, h }) => w === image.w && h === image.h) ?? rig;
						return {
							image,
							covered: true,
							offset: { x: frame.x - native.x, y: frame.y - native.y }
						};
					})
				}
			]
		});
	}
	const pages = planEvidence(specs, frame, o.scale, o.background);
	// Encode pages sequentially so a large selection does not allocate all canvases at once.
	const images = [];
	for (const { spec } of pages) images.push(await renderSheet(spec));
	return { images, evidence: pages.map(({ meta }) => meta), defects };
}

function qaOf(it: Item) {
	const q = it.qa;
	if (!q) return null;
	const { cells, clips, ...summary } = q;
	return {
		...summary,
		measuredFrames: Object.keys(cells).length,
		moves: Object.fromEntries(
			Object.entries(clips).map(([clip, c]) => [
				clip,
				{
					status: c.status,
					strayPx: c.strayPx ?? 0,
					shiftedFrames: c.shiftedFrames ?? 0,
					hand: c.hand ?? null
				}
			])
		)
	};
}

function itemSummary(p: Project, it: Item) {
	const m = p.manifest,
		cost = generationDetails(m, it).cost;
	return {
		id: it.id,
		name: it.name,
		slot: it.slot,
		status: it.status,
		health: healthOf(m, it),
		worn: (doc.items[it.slot] ?? null) === it.id,
		moves: Object.keys(it.layers[0]?.cells ?? {}),
		qaStatus: it.qa?.status ?? null,
		cost: { generations: cost.generations, usd: cost.usd, unknownCalls: cost.unknown ?? 0 }
	};
}

function draftSummary(g: Gen) {
	const result = store.results[g.draft.spec.id];
	return {
		id: g.draft.spec.id,
		characterId: g.draft.rigId,
		name: g.input.name,
		slot: g.input.slot,
		prompt: g.input.prompt,
		phase: g.phase,
		percent: genProgress(g, queue.snapshot().jobs).pct,
		status: g.status,
		error: g.error ?? null,
		worn: doc.drafts[g.draft.spec.slot] === g.draft.spec.id,
		qaWarnings: result?.qa?.warnings ?? [],
		failedCalls: result?.qa ? [...result.qa.failCalls.values()].flat() : []
	};
}

function activity() {
	const s = queue.snapshot();
	return {
		tabRole: s.role,
		paused: s.paused,
		jobs: s.counts,
		session: { generations: s.sessionGens, usd: s.sessionUsd, unpricedCalls: s.sessionUnknown },
		itemDrafts: gens.map(draftSummary),
		characterCreations: creates.map((c) => ({
			id: c.id,
			name: c.spec.name,
			running: c.running,
			step: c.progress?.step ?? null,
			characterId: c.projectId || null,
			error: c.error ? (typeof c.error === 'string' ? c.error : c.error.message) : null
		})),
		move: moving.spec
			? {
					characterId: moving.projectId,
					move: moving.spec.id,
					done: moving.done,
					step: moving.progress?.step ?? null,
					error: moving.error ? String(moving.error) : null,
					queued: moving.queued.length
				}
			: null,
		budget: budget()
	};
}

function connection() {
	return {
		connected: !!app.key && !app.keyRejected,
		tier: accountTier(app.balance),
		agentCanConnect: false
	};
}

/** Paid starts need a connected account, the job-running tab, the plan tier and an approved budget. */
function paidPreflight(minimumTier: number) {
	if (!app.key || app.keyRejected)
		throw new AgentError(
			'PixelLab is not connected. Ask the user to connect their PixelLab account in PixelDoll. Never ask for the token.',
			'needs_user'
		);
	if (queue.role === 'follower')
		throw new AgentError(
			'Another PixelDoll tab runs generation jobs. Use that tab, or ask the user to close the other one.',
			'busy'
		);
	if (tierDecision(app.balance, { required: minimumTier }).kind === 'required')
		throw new AgentError(`This needs PixelLab plan tier ${minimumTier} or higher.`, 'needs_user');
}
function reserveOrRefuse(what: string, generations: number) {
	if (!reserve(what, generations))
		throw new AgentError(
			`This can cost up to ${generations} generations but only ${budget().remaining} remain in the approved budget. Call request_budget first.`,
			'budget'
		);
}

const GUIDE = `PixelDoll makes frame-aligned paper-doll sprites: one frozen base body plus a transparent layer per item (hair, clothes,
weapons) that lines up on every frame. Characters have directions (south, east, ...) and moves (animations; "default" is the
standing pose). Each item covers moves and directions.

Workflow:
1. pixeldoll_overview, then list_characters. The demo "${DEMO}" is read-only; copy_demo_character makes an editable copy free.
2. inspect_character shows rig facts, moves, items and outfit; set images true to see the standing views.
3. Paid work (create_character, create_item) spends the user's PixelLab generations. Call it with dryRun true for the price,
   then request_budget once for the whole task; the user approves in the page. Never exceed it; never retry a paid call
   whose outcome is unknown: check get_activity instead.
4. Paid starts return at once. Use wait_for_activity (up to 110 s per call) or get_activity to follow them.
5. A finished item draft is in phase "review": inspect_item with its draft id shows QA and frames. accept_draft saves it,
   discard_draft throws it away (its generations stay spent).
6. inspect_character, inspect_item and render_frames make labeled contact sheets of real frames (rows = directions,
   columns = frames) at whole-pixel scale and show them over the page: take a screenshot to see them. imageData true also
   returns them as base64 PNG, for clients that show those to the model.
7. set_outfit, set_color and accept_draft are undoable in the Studio (Undo). export_character downloads a ZIP for the user.
Moves cannot be added by tools yet: ask the user to use Add move.`;

// ---------- tools ----------
export const TOOLS: Tool[] = [
	{
		name: 'pixeldoll_overview',
		title: 'PixelDoll overview',
		description:
			'Start here. How PixelDoll works, the workflow for agents, connection state, the open character, approved budget and running work.',
		inputSchema: { type: 'object', properties: {} },
		readOnly: true,
		async run() {
			await ready();
			return {
				data: {
					app: 'PixelDoll',
					version: __APP_VERSION__,
					guide: GUIDE,
					connection: connection(),
					openCharacter: doc.id ? { id: doc.id, name: view.project?.manifest.name ?? '' } : null,
					activity: activity(),
					tools: TOOLS.map((t) => ({
						name: t.name,
						readOnly: !!t.readOnly,
						consequential: !!t.consequential
					}))
				}
			};
		}
	},
	{
		name: 'list_characters',
		title: 'List characters',
		description: 'Every character in this browser, newest first, with size and direction facts.',
		inputSchema: { type: 'object', properties: {} },
		readOnly: true,
		async run() {
			await ready();
			await refreshProjects();
			return {
				data: {
					open: doc.id,
					characters: store.projects.map((p) => ({
						id: p.id,
						name: p.name,
						demo: p.demo,
						savedAt: p.savedAt,
						facts: (p.facts ?? null) as Json
					}))
				}
			};
		}
	},
	{
		name: 'inspect_character',
		title: 'Inspect character',
		description:
			'Rig facts, directions, moves, slots, items with quality and cost, colors, outfits and drafts of one character. With images, a sheet of the current outfit in every direction.',
		inputSchema: {
			type: 'object',
			properties: {
				characterId: characterArg,
				images: {
					type: 'boolean',
					description: 'Include a sheet of the current outfit (default true).'
				},
				move: str('Move for the sheet (default "default", the standing pose).'),
				scale: scaleArg,
				background: evidenceBackground,
				imageData: imageDataArg
			}
		},
		readOnly: true,
		async run(args) {
			const p = await character(args.characterId),
				m = p.manifest;
			const data = {
				id: doc.id,
				name: m.name,
				editable: !doc.id.startsWith('fixture:'),
				frame: m.rig.cell,
				view: m.rig.view ?? null,
				directions: m.rig.directions.map((d) => ({ id: d.id, mirrorOf: d.mirrorOf ?? null })),
				moves: m.rig.animations.map((a) => ({
					id: a.id,
					name: a.name ?? a.id,
					frames: a.cells,
					loop: a.loop
				})),
				categories: categories(m).map((c) => ({
					slot: c.key,
					label: c.label,
					hidden: c.hidden,
					worn: doc.items[c.key] ?? null
				})),
				items: m.items.filter((it) => it.id !== m.rig.baseItem).map((it) => itemSummary(p, it)),
				colors: m.materials.map((mat) => ({
					material: mat.id,
					label: mat.label,
					variants: Object.keys(mat.variants),
					current: doc.variants[mat.id] ?? null
				})),
				outfits: m.presets.map((o) => ({ id: o.id, name: o.name })),
				drafts: gens.filter((g) => g.draft.rigId === doc.id).map(draftSummary)
			};
			if (args.images === false) return { data };
			const move = moveOf(p, args.move);
			const { images, evidence, defects } = await frameSheet(p, {
				move: move.id,
				dirs: dirsOf(p, undefined),
				scale: Number(args.scale ?? 4),
				background: args.background as EvidenceBackground | undefined,
				views: [
					{
						label: `${m.name}: ${move.id}, current outfit`,
						kind: 'frames',
						outfit: view.items
					}
				]
			});
			return { data: { ...data, evidence, defects }, images };
		}
	},
	{
		name: 'inspect_item',
		title: 'Inspect item or draft',
		description:
			'Quality checks, cost, and frame evidence for one item or draft: item alone, worn on the base body, and original dressed views when saved. Detached-pixel coordinates use the shared uncropped frame.',
		inputSchema: {
			type: 'object',
			required: ['itemId'],
			properties: {
				characterId: characterArg,
				itemId: str('Item id (inspect_character) or draft id (get_activity).'),
				move: str('Move to show (default "default").'),
				directions: { type: 'array', items: str('Direction id', 20), maxItems: 8 },
				frames: {
					type: 'array',
					items: { type: 'integer', minimum: 0, maximum: 63 },
					maxItems: 64
				},
				scale: scaleArg,
				background: evidenceBackground,
				imageData: imageDataArg
			}
		},
		readOnly: true,
		async run(args) {
			const draft = gens.find((g) => g.draft.spec.id === args.itemId);
			const p0 = await character(draft ? draft.draft.rigId : args.characterId);
			const preview = draft ? store.results[draft.draft.spec.id]?.preview : null;
			const p = preview ?? p0,
				m = p.manifest;
			const it = m.items.find((x) => x.id === args.itemId);
			if (!it)
				throw new AgentError(
					draft
						? `Draft "${String(args.itemId)}" has no frames yet (phase ${draft.phase}).`
						: `No item "${String(args.itemId)}" on this character.`,
					'not_found'
				);
			const move = moveOf(p, args.move),
				dirs = dirsOf(p, args.directions),
				frames = args.frames as number[] | undefined,
				scale = Number(args.scale ?? 4);
			const base = { [m.slots.find((s) => s.class === 'base')?.id ?? 'body']: m.rig.baseItem };
			const { images, evidence, defects } = await frameSheet(p, {
				move: move.id,
				dirs,
				frames,
				scale,
				background: args.background as EvidenceBackground | undefined,
				views: [
					{ label: `${it.name} alone: ${move.id}`, kind: 'item', outfit: {}, only: it },
					{
						label: `${it.name} on the base body: ${move.id}`,
						kind: 'worn',
						outfit: { ...base, [it.slot]: it.id }
					}
				],
				source: it
			});
			return {
				data: {
					...(draft ? draftSummary(draft) : itemSummary(p, it)),
					prompt: it.prompt,
					route: it.route ?? null,
					qa: qaOf(it) as Json,
					designWarnings: it.designWarnings ?? [],
					frameEdits: it.frameEdits?.length ?? 0,
					evidence,
					defects
				},
				images
			};
		}
	},
	{
		name: 'render_frames',
		title: 'Render frames',
		description:
			'Any outfit on any move: a labeled sheet of composed frames (rows = directions, columns = frames) at whole-pixel scale. Omit outfit for what the Studio shows now.',
		inputSchema: {
			type: 'object',
			required: ['move'],
			properties: {
				characterId: characterArg,
				move: str('Move id.'),
				directions: { type: 'array', items: str('Direction id', 20), maxItems: 8 },
				frames: {
					type: 'array',
					items: { type: 'integer', minimum: 0, maximum: 63 },
					maxItems: 64
				},
				outfit: {
					type: 'object',
					description:
						'Slot -> item id (or null for nothing). Unlisted slots keep what is worn now.',
					additionalProperties: true
				},
				scale: scaleArg,
				background: evidenceBackground,
				imageData: imageDataArg
			}
		},
		readOnly: true,
		async run(args) {
			const p = await character(args.characterId);
			const outfit = { ...view.items } as Preset['items'];
			for (const [slot, id] of Object.entries((args.outfit ?? {}) as Record<string, unknown>)) {
				if (id !== null && !p.manifest.items.some((it) => it.id === id && it.slot === slot))
					throw new AgentError(`No item "${String(id)}" in slot "${slot}".`, 'not_found');
				outfit[slot] = id as string | null;
			}
			const move = moveOf(p, args.move);
			const { images, evidence, defects } = await frameSheet(p, {
				move: move.id,
				dirs: dirsOf(p, args.directions),
				frames: args.frames as number[] | undefined,
				scale: Number(args.scale ?? 4),
				background: args.background as EvidenceBackground | undefined,
				views: [{ label: `${p.manifest.name}: ${move.id}`, kind: 'frames', outfit }]
			});
			return {
				data: { move: move.id, outfit: outfit as Json, evidence, defects },
				images
			};
		}
	},
	{
		name: 'get_activity',
		title: 'Get activity',
		description:
			'Running and finished generation work in this browser: item drafts with progress and QA, character creations, moves, job counts, session spend and the approved budget.',
		inputSchema: { type: 'object', properties: {} },
		readOnly: true,
		async run() {
			await ready();
			return { data: activity() };
		}
	},
	{
		name: 'wait_for_activity',
		title: 'Wait for activity',
		description:
			'Wait until the listed drafts or creations stop running (or until the timeout), then return get_activity. Safe to call again.',
		inputSchema: {
			type: 'object',
			properties: {
				ids: { type: 'array', items: str('Draft or creation id'), maxItems: 20 },
				timeoutSeconds: { type: 'integer', minimum: 1, maximum: 110 }
			}
		},
		readOnly: true,
		async run(args, signal) {
			await ready();
			const ids = (args.ids as string[] | undefined) ?? [];
			const busy = () =>
				gens.some((g) => g.phase === 'running' && (!ids.length || ids.includes(g.draft.spec.id))) ||
				creates.some((c) => c.running && (!ids.length || ids.includes(c.id)));
			const until = Date.now() + 1000 * Number(args.timeoutSeconds ?? 60);
			while (busy() && Date.now() < until && !signal.aborted)
				await new Promise((r) => setTimeout(r, 1000));
			return { data: { stillRunning: busy(), ...activity() } };
		}
	},
	{
		name: 'open_character',
		title: 'Open character',
		description: 'Open a character in the Studio so the user sees it.',
		inputSchema: {
			type: 'object',
			required: ['characterId'],
			properties: { characterId: characterArg }
		},
		async run(args) {
			const p = await character(args.characterId);
			return { data: { id: doc.id, name: p.manifest.name } };
		}
	},
	{
		name: 'copy_demo_character',
		title: 'Copy the demo character',
		description:
			'Free: save an editable copy of the demo Adventurer (with its walk) and open it. Good for trying tools without generating.',
		inputSchema: { type: 'object', properties: {} },
		async run() {
			await character(DEMO);
			const id = await copyDemo();
			return { data: { characterId: id } };
		}
	},
	{
		name: 'set_outfit',
		title: 'Set outfit',
		description:
			'Put items or drafts on, or take slots off, on the open character. Undoable in the Studio. Item ids come from inspect_character, draft ids from get_activity.',
		inputSchema: {
			type: 'object',
			properties: {
				characterId: characterArg,
				wear: { type: 'array', items: str('Item or draft id'), maxItems: 30 },
				takeOff: { type: 'array', items: str('Slot id', 60), maxItems: 30 }
			}
		},
		async run(args) {
			const p = await character(args.characterId);
			for (const slot of (args.takeOff as string[] | undefined) ?? [])
				if (!p.manifest.slots.some((s) => s.id === slot))
					throw new AgentError(`No slot "${slot}".`, 'not_found');
			clearSlots((args.takeOff as string[] | undefined) ?? []);
			for (const id of (args.wear as string[] | undefined) ?? []) {
				const draft = gens.find((g) => g.draft.spec.id === id && g.draft.rigId === doc.id);
				if (draft) {
					if (doc.drafts[draft.draft.spec.slot] !== id) wearDraft(id);
					continue;
				}
				const it = store.project?.manifest.items.find((x) => x.id === id);
				if (!it) throw new AgentError(`No item or draft "${id}".`, 'not_found');
				if (doc.items[it.slot] !== id || doc.drafts[it.slot]) wear(id, true);
			}
			return { data: { worn: { ...view.items } as Json } };
		}
	},
	{
		name: 'set_color',
		title: 'Set color',
		description:
			'Recolor a material of the open character by exact palette ramp: a variant name from inspect_character, "#rrggbb", or null for the original. Undoable.',
		inputSchema: {
			type: 'object',
			required: ['material'],
			properties: {
				characterId: characterArg,
				material: str('Material id from inspect_character colors.'),
				variant: {
					type: 'string',
					maxLength: 40,
					description: 'Variant name or #rrggbb; omit for the original.'
				}
			}
		},
		async run(args) {
			const p = await character(args.characterId);
			const mat = p.manifest.materials.find((x) => x.id === args.material);
			if (!mat) throw new AgentError(`No material "${String(args.material)}".`, 'not_found');
			const v = args.variant as string | undefined;
			if (v !== undefined && !(v in mat.variants) && !/^#[0-9a-f]{6}$/i.test(v))
				throw new AgentError(
					`Variant must be one of ${Object.keys(mat.variants).join(', ')} or #rrggbb.`,
					'invalid'
				);
			setVariant(mat.id, v ?? null);
			return { data: { material: mat.id, variant: v ?? null } };
		}
	},
	{
		name: 'request_budget',
		title: 'Request a generation budget',
		description:
			'Ask the user, in the page, to approve PixelLab generations for the whole task. Paid tools reserve their full estimate from it; nothing paid runs without it. Resolves when the user answers.',
		inputSchema: {
			type: 'object',
			required: ['generations', 'purpose'],
			properties: {
				generations: { type: 'number', minimum: 0.01, maximum: MAX_BUDGET },
				purpose: str('One sentence the user sees: what the generations are for.', 300)
			}
		},
		consequential: true,
		async run(args) {
			await ready();
			const allowed = await requestBudget(Number(args.generations), String(args.purpose));
			return {
				data: {
					allowed,
					approxUsd: Math.round(rateUsd(Number(args.generations)) * 100) / 100,
					budget: budget()
				}
			};
		}
	},
	{
		name: 'create_character',
		title: 'Create character',
		description:
			'Paid. Draw a new base body (Character V3) and register it in the chosen directions. dryRun true returns the estimate and validation only. Returns at once with a creation id; follow it with wait_for_activity.',
		inputSchema: {
			type: 'object',
			required: ['details'],
			properties: {
				details: str(
					'Appearance of the base body (face, hair, build). Clothes and gear are items, added later.',
					2000
				),
				name: str('Character name.', 80),
				directions: {
					type: 'string',
					enum: PRESETS.map((p) => p.id),
					description:
						'eight (default), four, diagonal, side (side-scroller 2) or unique (8 drawn, none mirrored).'
				},
				bodySize: {
					type: 'integer',
					enum: [...BODY_SIZES],
					description: 'Body height in px (default 64).'
				},
				underwear: { type: 'boolean', description: 'Plain underwear on the base (default true).' },
				traits: {
					type: 'object',
					description: `Optional: ${TRAIT_KEYS.map((k) => `${k} (${TRAITS[k].options.join(', ')})`).join('; ')}.`,
					additionalProperties: { type: 'string', maxLength: 40 }
				},
				acceptWarnings: {
					type: 'boolean',
					description: 'Generate past fit warnings returned by a dry run (the user should agree).'
				},
				dryRun: { type: 'boolean' }
			}
		},
		consequential: true,
		async run(args) {
			await ready();
			const d = newCharacterDraft();
			setPreset(d, String(args.directions ?? 'eight'));
			if (args.bodySize) d.body = Number(args.bodySize);
			if (args.underwear === false) writeNudeBase(d, true);
			for (const [k, v] of Object.entries((args.traits ?? {}) as Record<string, string>)) {
				if (!(TRAIT_KEYS as string[]).includes(k)) throw new AgentError(`Unknown trait "${k}".`);
				const option = TRAITS[k as Trait].options.find((o) => o.toLowerCase() === v.toLowerCase());
				if (!option)
					throw new AgentError(`${k} must be one of ${TRAITS[k as Trait].options.join(', ')}.`);
				writeTrait(d, k as Trait, option);
			}
			writeDetails(d, String(args.details));
			if (args.name) d.name = String(args.name);
			const issues = draftErrors(d),
				errors = issues.filter((e) => !(e instanceof PreflightWarning)).map((e) => e.message),
				warnings = issues.flatMap((e) =>
					e instanceof PreflightWarning ? [{ id: e.id, text: e.message }] : []
				);
			const spec = {
				...draftSpec(d),
				seed: freshSeed(),
				...(args.acceptWarnings && warnings.length
					? { acceptedWarnings: warnings.map((w) => w.id) }
					: {})
			};
			const est = estimate(spec);
			const price = {
				generations: est.gens,
				maxGenerations: est.maxGens,
				approxMaxUsd: Math.round(rateUsd(est.maxGens) * 100) / 100,
				minutes: est.minutes
			};
			if (args.dryRun || errors.length || (warnings.length && !args.acceptWarnings))
				return { data: { started: false, errors, warnings, prompt: spec.description, ...price } };
			paidPreflight(0);
			const what = `create character ${spec.name}`;
			reserveOrRefuse(what, est.maxGens);
			const before = new Set(creates.map((c) => c.id));
			await startCreate(spec, false);
			const started = creates.find((c) => !before.has(c.id));
			if (!started) {
				release(what, est.maxGens);
				throw new AgentError('The creation did not start. Check get_activity.', 'busy');
			}
			return { data: { creationId: started.id, ...price, budget: budget() } };
		}
	},
	{
		name: 'create_item',
		title: 'Create item',
		description:
			'Paid. Generate an equipment layer (hair, headwear, clothing, boots, cape, weapon, ...) fitted to every move and direction of an editable character. dryRun true returns the plan and price only. Returns a draft id; the draft reaches phase "review" when done.',
		inputSchema: {
			type: 'object',
			required: ['slot', 'prompt'],
			properties: {
				characterId: characterArg,
				slot: str('Category slot id from inspect_character categories.', 60),
				prompt: str('What the item looks like, including colors.', 1000),
				name: str('Item name (default: from the prompt).', 80),
				dryRun: { type: 'boolean' }
			}
		},
		consequential: true,
		async run(args) {
			const p = await character(args.characterId);
			if (doc.id.startsWith('fixture:'))
				throw new AgentError(
					'The demo is read-only. Call copy_demo_character first.',
					'unsupported'
				);
			if (!categories(p.manifest).some((c) => c.key === args.slot))
				throw new AgentError(
					`No category "${String(args.slot)}". See inspect_character categories.`,
					'not_found'
				);
			const rec = await db.get<StoredProject>('projects', doc.id);
			if (!rec) throw new AgentError('This character is not saved.', 'not_found');
			const manifest = store.project!.manifest;
			const ctx = { rec: { ...rec, manifest }, project: store.project! } as RigCtx;
			const prompt = String(args.prompt).trim();
			const input = {
				name: String(args.name ?? '').trim() || prompt.split(/[,.]/)[0].slice(0, 40),
				slot: String(args.slot),
				prompt
			};
			let plan;
			try {
				plan = itemRoute.plan(manifest.rig, ctx, input);
			} catch (e) {
				throw new AgentError(e instanceof Error ? e.message : String(e), 'unsupported');
			}
			const price = {
				calls: plan.calls,
				frames: plan.cells,
				generations: plan.gens,
				approxUsd: Math.round(rateUsd(plan.gens) * 100) / 100,
				minutes: plan.minutes,
				minimumTier: plan.minimumTier
			};
			if (args.dryRun) return { data: { dryRun: true, ...price } };
			paidPreflight(plan.minimumTier);
			const what = `item ${input.name}`;
			reserveOrRefuse(what, plan.gens);
			const before = new Set(gens.map((g) => g.draft.spec.id));
			await startItem(input, {
				projectId: doc.id,
				gens: plan.gens,
				rig: JSON.stringify(manifest.rig)
			});
			const started = gens.find((g) => !before.has(g.draft.spec.id));
			if (!started) {
				release(what, plan.gens);
				throw new AgentError(
					'The item did not start (the character or price changed). Check get_activity.',
					'busy'
				);
			}
			return { data: { draftId: started.draft.spec.id, ...price, budget: budget() } };
		}
	},
	{
		name: 'accept_draft',
		title: 'Accept item draft',
		description:
			'Save a finished item draft (phase "review") to its character and wear it. Undoable as a deletion.',
		inputSchema: {
			type: 'object',
			required: ['draftId'],
			properties: { draftId: str('Draft id.') }
		},
		async run(args) {
			await ready();
			const g = gens.find((x) => x.draft.spec.id === args.draftId);
			if (!g) throw new AgentError(`No draft "${String(args.draftId)}".`, 'not_found');
			if (g.phase !== 'review')
				throw new AgentError(
					`Draft is ${g.phase}; only a draft in review can be saved.`,
					'invalid'
				);
			await character(g.draft.rigId);
			const saved = await acceptGen(g);
			if (!saved)
				throw new AgentError(
					'The draft was not saved (another tab runs the jobs, or it is already settling).',
					'busy'
				);
			return { data: { saved: true, itemId: g.draft.spec.id } };
		}
	},
	{
		name: 'discard_draft',
		title: 'Discard item draft',
		description:
			'Throw away an item draft that is not running. Its generations stay spent and cannot be recovered.',
		inputSchema: {
			type: 'object',
			required: ['draftId'],
			properties: { draftId: str('Draft id.') }
		},
		consequential: true,
		async run(args) {
			await ready();
			const g = gens.find((x) => x.draft.spec.id === args.draftId);
			if (!g) throw new AgentError(`No draft "${String(args.draftId)}".`, 'not_found');
			if (g.phase === 'running') throw new AgentError('The draft is still running.', 'busy');
			if (!(await discardGen(g))) throw new AgentError('The draft was not discarded.', 'busy');
			return { data: { discarded: true } };
		}
	},
	{
		name: 'export_character',
		title: 'Export character',
		description:
			'Download the character as a ZIP for the user, with the engine and options chosen in Export settings. The file goes to the user, not the agent.',
		inputSchema: { type: 'object', properties: { characterId: characterArg } },
		async run(args) {
			await character(args.characterId);
			await downloadCharacterZip(doc.id);
			return { data: { downloaded: true, characterId: doc.id } };
		}
	}
];

/** Run one tool by name with validated input. Errors the agent can act on come back as AgentError. */
export async function callTool(name: string, args: unknown, signal = new AbortController().signal) {
	const tool = TOOLS.find((t) => t.name === name);
	if (!tool)
		throw new AgentError(`No tool "${name}". Call pixeldoll_overview for the list.`, 'not_found');
	const input = (args ?? {}) as Record<string, unknown>;
	validate(tool.inputSchema, input);
	return tool.run(input, signal);
}
