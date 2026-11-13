// Advanced creation options (model, outline, detail, item method) and the generation details read from provenance.
import { expect, test } from 'vitest';
import { createCharacter, drawRequest, estimate } from '../../src/studio/create.ts';
import { createPlan, itemPlan } from '../../src/studio/apiPlans.ts';
import { itemRoute } from '../../src/studio/itemRoute.ts';
import { styleOf } from '../../src/studio/characterConfig.ts';
import {
	costText,
	generationDetails,
	recordedCost,
	requestPromptOf,
	seedOf,
	toolOf
} from '../../src/lib/store/generation.ts';
import { creditsCsv } from '../../src/lib/export/generic.ts';
import type { Item, Manifest, Provenance } from '../../src/lib/store/manifest.ts';
import type { RigCtx } from '../../src/lib/items/run.ts';
import { equipmentFixture } from './equipment-fixture.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';

const four = (['south', 'east', 'north', 'west'] as const).map((id) => ({ id }));
const spec = { description: 'farmer', name: 'F', size: 48, seed: 7, directions: four };

test('a default creation sends the same V3 body as before Advanced existed', () => {
	expect(drawRequest({ ...spec, exactPrompt: true }, 7)).toEqual({
		method: 'POST',
		path: '/create-character-v3',
		body: {
			description: 'farmer',
			image_size: { width: 48, height: 48 },
			view: 'low top-down',
			template_id: 'mannequin',
			seed: 7,
			no_background: true
		}
	});
	expect(styleOf({})).toEqual({});
	expect(styleOf({ model: 'v3', outline: '', detail: '' })).toEqual({});
});

test('V3 style hints reach the request; Pro Flash drops them and no_background', () => {
	const v3 = drawRequest(
		{ ...spec, exactPrompt: true, outline: 'lineless', detail: 'highly detailed' },
		7
	);
	expect(v3.body).toMatchObject({ outline: 'lineless', detail: 'highly detailed' });
	const flash = drawRequest({ ...spec, exactPrompt: true, model: 'pro-flash' }, 7);
	expect(flash.path).toBe('/create-character-pro-flash');
	expect(flash.body).toEqual({
		description: 'farmer',
		image_size: { width: 48, height: 48 },
		view: 'low top-down',
		template_id: 'mannequin',
		seed: 7
	});
	// The form never sends hints with Pro Flash.
	expect(styleOf({ model: 'pro-flash', outline: 'lineless', detail: 'low detail' })).toEqual({
		model: 'pro-flash'
	});
});

test('Pro Flash estimates follow the measured /pro-flash/cost table', () => {
	const flash = (size: number) => estimate({ directions: four, size, model: 'pro-flash' }).gens;
	expect(flash(48)).toBe(6.25); // billed 6 + 0.25 registration live (2026-11-12)
	expect(flash(96)).toBe(7.25);
	expect(flash(128)).toBe(8.25);
	expect(flash(200)).toBe(11.25);
	expect(flash(256)).toBe(17.25);
	expect(estimate({ directions: four, size: 48 }).gens).toBe(2.25);
	// The preview's first call is the draw at the same price.
	const plan = createPlan({ ...spec, model: 'pro-flash' });
	expect(plan[0].path).toBe('/create-character-pro-flash');
	expect(plan[0].generations).toBe(6);
});

test('creation refuses unknown models, hints and hints combined with Pro Flash before spending', async () => {
	const bad = async (extra: Record<string, unknown>) =>
		createCharacter({ ...spec, ...extra } as Parameters<typeof createCharacter>[0]).catch(
			(e: Error) => e.message
		);
	expect(await bad({ model: 'pro' })).toContain('Invalid model.');
	expect(await bad({ outline: 'thick' })).toContain('Invalid outline.');
	expect(await bad({ detail: 'ultra' })).toContain('Invalid detail.');
	expect(await bad({ model: 'pro-flash', outline: 'lineless' })).toContain(
		'Outline and detail apply to Character V3 only.'
	);
});

async function posableCtx(): Promise<RigCtx> {
	const project = await equipmentFixture(),
		rec = { id: 'fixture', savedAt: '', origin: 'studio' as const, manifest: project.manifest };
	const points = LABELS.map((label) => ({ label, x: 0.5, y: 0.5 })),
		reference = project.manifest.items[0].layers[0].cells!.rest!.south![0]!;
	project.manifest.rig.rest = { south: { image: reference, keypoints: points } };
	project.manifest.rig.animations[0].sources = {
		south: { route: 'skeleton-v3', reference, keypoints: [points], provenance: [] }
	};
	return { rec, project };
}

test('the item animation method is honored, previewed and never silently replaced', async () => {
	const ctx = await posableCtx(),
		rig = ctx.rec.manifest.rig,
		input = { name: 'Hood', slot: 'head', prompt: 'brown hood' };
	expect(itemRoute.draft(ctx, input, []).spec.method).toBe('skel');
	expect(itemRoute.draft(ctx, { ...input, method: 'anchor' }, []).spec.method).toBe('anchor');
	expect(itemPlan(ctx, { ...input, method: 'anchor' }).map((c) => c.path)).toContain(
		'/edit-animation-v2'
	);
	// A rig without stored joints cannot pose: an explicit request fails before any plan or spend.
	ctx.rec.manifest.rig.rest = {};
	expect(() => itemRoute.plan(rig, ctx, { ...input, method: 'skel' })).toThrow(
		'Skeleton posing is not available'
	);
	expect(itemRoute.draft(ctx, input, []).spec.method).toBe('anchor');
});

const prov = (p: Partial<Provenance>): Provenance => ({
	endpoint: '/edit-animation-v2',
	params: {},
	seed: 1,
	requestHash: 'sha256:x',
	createdAt: '2026-11-12T10:00:00.000Z',
	produced: [],
	...p
});

test('generation details summarize tools, prompts, settings and recorded cost from provenance', async () => {
	const { manifest } = await equipmentFixture();
	const base = manifest.items.find((i) => i.id === manifest.rig.baseItem)!;
	base.prompt = 'farmer';
	base.provenance = [
		prov({
			endpoint: '/create-character-v3',
			params: {
				description: 'farmer, guidance',
				image_size: { width: 48, height: 48 },
				seed: 9,
				outline: 'lineless',
				detail: 'highly detailed'
			},
			seed: 9,
			usage: { generations: 2 },
			createdAt: '2026-11-12T10:05:00.000Z'
		}),
		prov({
			endpoint: '/create-character-v3',
			params: { description: 'farmer', reference_image: { sha256: 'a' } },
			createdAt: '2026-11-12T10:01:00.000Z'
		}),
		prov({
			endpoint: '/characters/animations',
			params: { mode: 'skeleton-v3' },
			usage: { generations: 3 }
		})
	];
	const g = generationDetails(manifest, base);
	expect(g.prompt).toBe('farmer');
	expect(g.requestPrompts).toEqual(['farmer, guidance', 'farmer']);
	expect(g.tools).toEqual([
		{ name: 'Character V3', calls: 2 },
		{ name: 'Character animation (Skeleton V3)', calls: 1 }
	]);
	const settings = Object.fromEntries(g.settings.map((s) => [s.label, s.value]));
	expect(settings).toMatchObject({ Body: '48 px', Outline: 'None', Detail: 'High', Seed: '9' });
	expect(g.cost).toEqual({ generations: 5, usd: 0, unknown: 1, calls: 3, replaced: 0 });
	expect(g.createdAt).toBe('2026-11-12T10:00:00.000Z');
	// An item made before details existed, with nothing recorded, shows nothing rather than failing.
	const bare = { ...base, id: 'x', provenance: [] } as Item;
	expect(generationDetails(manifest, bare)).toMatchObject({
		requestPrompts: [],
		tools: [],
		cost: { calls: 0 }
	});
	expect(generationDetails(manifest, bare).createdAt).toBeUndefined();
});

test('re-rolled attempts count toward the recorded cost and are marked in credits', async () => {
	const { manifest } = await equipmentFixture();
	const item = manifest.items.find((i) => i.id !== manifest.rig.baseItem)!;
	item.provenance = [
		prov({ params: { description: 'hood, on green key' }, usage: { generations: 4 }, jobId: 'a' }),
		prov({ usage: { generations: 4, usd: 0.01 }, replaced: true, jobId: 'b' })
	];
	const cost = recordedCost(item.provenance);
	expect(cost).toEqual({ generations: 8, usd: 0.01, unknown: 0, calls: 2, replaced: 1 });
	expect(costText(cost)).toBe('8 gens · $0.010');
	expect(toolOf(item.provenance[0])).toBe('Edit animation V2');
	expect(requestPromptOf(item.provenance[0])).toBe('hood, on green key');
	const csv = creditsCsv(manifest as Manifest)
		.trim()
		.split('\n');
	const header = csv[0].split(','),
		rows = csv.filter((r) => r.startsWith(`"${item.id}"`));
	expect(header).toEqual(
		[
			'item',
			'name',
			'slot',
			'sheets',
			'endpoint',
			'tool',
			'jobId',
			'seed',
			'createdAt',
			'prompt',
			'requestPrompt',
			'generations',
			'usd',
			'replaced',
			'source'
		].map((c) => `"${c}"`)
	);
	expect(rows).toHaveLength(2);
	expect(rows[0]).toContain('"Edit animation V2","a"');
	expect(rows[0]).toContain('"hood, on green key","4","",""');
	expect(rows[1]).toContain('"4","0.01","yes"');
});

test('details never invent a seed, a date or a cost', () => {
	const est = prov({ endpoint: '/estimate-skeleton', params: {}, seed: 0 });
	expect(seedOf(est)).toBeUndefined();
	expect(seedOf(prov({ params: { seed: 0 } }))).toBe(0);
	expect(toolOf(prov({ endpoint: '/characters/abc' }))).toBe('Character read');
	// Reported zero cost is free; absent usage is unknown; malformed usage adds nothing.
	expect(costText(recordedCost([prov({ usage: { generations: 0, usd: 0 } })]))).toBe('Free');
	expect(costText(recordedCost([]))).toBe('');
	expect(
		recordedCost([prov({ usage: { generations: 'x' as unknown as number, usd: 0.0004 } })])
	).toMatchObject({ generations: 0, usd: 0.0004 });
	expect(costText(recordedCost([prov({ usage: { usd: 0.0004 } })]))).toBe('$0.0004');
});

test('the earliest call is the creation date whatever the order or offset', async () => {
	const { manifest } = await equipmentFixture();
	const item = manifest.items.find((i) => i.id !== manifest.rig.baseItem)!;
	item.provenance = [
		prov({ createdAt: '2026-11-12T10:00:00+02:00' }),
		prov({ createdAt: '2026-11-12T09:00:00.000Z' }),
		prov({ createdAt: 'not a date' })
	];
	expect(generationDetails(manifest, item).createdAt).toBe('2026-11-12T08:00:00.000Z');
});
