// In-page helpers (evaluated in the agent dev server page). Production modules imported by their Vite URLs.
window.__xv = (() => {
	const M = {};
	const load = async () => {
		if (M.I) return M;
		M.I = await import('/src/lib/items/items.ts');
		M.RUN = await import('/src/lib/items/run.ts');
		M.ROUTE = await import('/src/studio/itemRoute.ts');
		M.MODEL = await import('/src/studio/model.ts');
		M.PNG = await import('/src/lib/image/pngraw.ts');
		M.IMG = await import('/src/lib/image/png.ts');
		M.RIG = await import('/src/lib/rig/rig.ts');
		M.PO = await import('/src/lib/rig/poses.ts');
		M.Q = await import('/src/lib/pixellab/queue.ts');
		M.DB = await import('/src/lib/store/db.ts');
		M.APP = await import('/src/lib/app.svelte.ts');
		M.CL = await import('/src/lib/pixellab/client.ts');
		M.jobs = [];
		M.Q.queue.subscribe((s) => (M.jobs = s.jobs));
		return M;
	};
	const b64 = (u8) => {
		let s = '';
		for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
		return btoa(s);
	};
	const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
	const cell = (M, sheet, C, row, col) => {
		const o = M.IMG.makeImg(C, C);
		for (let y = 0; y < C; y++)
			o.data.set(sheet.data.subarray(((row * C + y) * sheet.w + col * C) * 4, ((row * C + y) * sheet.w + col * C + C) * 4), y * C * 4);
		return o;
	};
	const ctxs = {};
	async function ctxOf(body) {
		const M = await load();
		if (ctxs[body]) return ctxs[body];
		const b = await (await fetch(`/test/fixtures/bench/body${body}.json`)).json();
		const sheet = await M.PNG.decodePngBytes(new Uint8Array(await (await fetch(`/test/fixtures/bench/body${body}.png`)).arrayBuffer()));
		const rig = structuredClone(b.rig), N = rig.cell.w, dirs = b.rows;
		const images = new Map(), skeletons = {}, cellsMap = { default: {} };
		const rest = (d) => cell(M, sheet, N, b.rows.indexOf(d), b.cols.indexOf('rest'));
		for (const d of Object.keys(rig.rest)) {
			if (!dirs.includes(d)) { delete rig.rest[d]; continue; }
			const im = rest(d), h = await M.RIG.cellHash(im);
			images.set(h, im);
			rig.rest[d].image = h;
		}
		// Studio's Default move: one imported-rest cell per drawn view (as every created character has). Walk dropped: the
		// standing coverage plans dress calls only.
		rig.animations = [{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }],
			sources: Object.fromEntries(dirs.map((d) => [d, { route: 'v3', reference: rig.rest[d].image, keypoints: [rig.rest[d].keypoints], measured: [rig.rest[d].keypoints], motion: 'imported-rest', provenance: [] }])) }];
		for (const d of dirs) {
			cellsMap.default[d] = [rig.rest[d].image];
			skeletons[`default/${d}/0`] = M.PO.fromApi(rig.rest[d].keypoints, rig.cell);
		}
		rig.baseItem = rig.baseItem ?? 'base';
		const manifest = { format: 'pixeldoll/1', app: 'test', name: `bench${body}`, rig, materials: [], slots: [M.I.slotOf('body')], presets: [],
			items: [{ id: rig.baseItem, name: 'Body', slot: 'body', status: 'accepted', mirror: 'generate', materials: [], prompt: '', baseHash: rig.baseHash, provenance: [], layers: [{ id: 'main', role: 'fg', z: 10, cells: cellsMap }] }] };
		const ctx = { rec: { id: `xv-body${body}`, savedAt: '', manifest, skeletons }, project: { manifest, images } };
		ctxs[body] = { ctx, dirs, rest };
		return ctxs[body];
	}
	async function plan(body, slot, prompt) {
		const M = await load(), { ctx } = await ctxOf(body);
		const input = { name: M.MODEL.itemNameFrom(prompt) || 'New item', slot, prompt };
		const p = M.ROUTE.itemRoute.plan(ctx.rec.manifest.rig, ctx, input);
		const d = M.ROUTE.itemRoute.draft(ctx, input, []);
		return { p, key: d.spec.key, method: d.spec.method, anims: d.spec.anims, calls: d.calls.map((c) => ({ kind: c.kind, cells: c.cells })) };
	}
	async function bodyRests(body) {
		const M = await load(), { dirs, rest } = await ctxOf(body);
		const out = {};
		for (const d of dirs) out[d] = b64(await M.PNG.encodePngBytes(rest(d)));
		return out;
	}
	async function balance() {
		const M = await load();
		if (!M.APP.app.key) return null;
		const r = await M.CL.api(M.APP.app.key, 'GET', '/balance');
		return { usd: r.credits?.usd, gens: r.subscription?.generations, total: r.subscription?.total, plan: r.subscription?.plan };
	}
	const hasKey = async () => !!(await load()).APP.app.key;
	async function run(job) {
		const M = await load(), { ctx } = await ctxOf(job.body);
		const input = { name: M.MODEL.itemNameFrom(job.prompt) || 'New item', slot: job.slot, prompt: job.prompt };
		const d = M.ROUTE.itemRoute.draft(ctx, input, []);
		if (d.calls.some((c) => c.kind !== 'dress')) throw new Error('plan has non-dress calls: refusing');
		d.calls.forEach((c, i) => (c.seed = job.seed + i));
		let res = null, err = null;
		try {
			res = await M.ROUTE.itemRoute.run(d, ctx, {});
		} catch (e) {
			err = String(e?.message ?? e);
		}
		const recs = d.calls.map((c) => M.jobs.find((j) => j.id === c.recId));
		const raws = [];
		const rig = ctx.rec.manifest.rig, slot = M.I.slotOf(d.spec.slot), pad = M.I.padOf(d.spec.slot, d.spec.method, rig.cell);
		const H = rig.cell.h + 2 * pad;
		const layers = {}, areas = {};
		for (const [k, c] of d.calls.entries()) {
			const r = recs[k];
			if (r?.state !== 'done') continue;
			const outs = [...(r.jobs[0]?.results ?? [])].sort((a, b) => Number(a.label.split('/').at(-1)) - Number(b.label.split('/').at(-1)));
			const offset = M.I.anchored(k, c.kind) ? 1 : 0;
			for (const [i, o] of outs.entries()) {
				const bytes = new Uint8Array(await (await M.DB.getBlob(o.sha)).arrayBuffer());
				const cellKey = i >= offset ? c.cells[i - offset] : undefined;
				raws.push({ call: k, i, label: o.label, sha: o.sha, cell: cellKey ?? null, png: b64(bytes) });
				if (!cellKey) continue;
				// production keyframe extraction, exactly as evaluateItem's ex(o, undefined, restView = true)
				const dir = cellKey.split('/')[1];
				const out = M.IMG.binaryAlpha(await M.PNG.decodePngBytes(bytes));
				const skel = M.PO.fromApi(rig.rest[dir].keypoints, rig.cell);
				const maxY = M.I.cutRows(d.spec.slot, skel, rig.cell.h);
				const x = M.I.extractCell({ key: cellKey, call: k, base: M.I.padImg(M.RUN.baseCell(ctx, cellKey, true), pad), out, route: d.spec.key,
					band: M.I.bandOf(d.spec.slot, pad ? undefined : skel, H), posed: false, clip: slot.band, held: slot.class === 'held', pad,
					...(maxY != null ? { cut: { maxY } } : {}) });
				layers[dir] = b64(await M.PNG.encodePngBytes(x.layer));
				areas[dir] = x.area;
			}
		}
		const gates = res && {
			g1: [...res.g1.entries()],
			status: res.qa?.qa.status ?? null,
			fails: res.qa ? [...res.qa.failCalls.entries()] : [],
			warnings: res.qa?.warnings ?? [],
			clean: M.RUN.isClean(res),
			retryKey: res.retryKey ?? null
		};
		return {
			spec: { id: d.spec.id, name: d.spec.name, slot: d.spec.slot, prompt: d.spec.prompt, key: d.spec.key, method: d.spec.method, anims: d.spec.anims, dirs: d.spec.dirs },
			calls: d.calls.map((c, k) => ({ kind: c.kind, cells: c.cells, seed: c.seed, recId: c.recId ?? null, state: recs[k]?.state ?? 'not submitted', error: recs[k]?.error ?? null, gens: recs[k]?.gens ?? null, usd: recs[k]?.usd ?? null, requestHash: recs[k]?.requestHash ?? null })),
			log: d.log, err, raws, layers, areas, gates
		};
	}
	return { plan, run, balance, hasKey, bodyRests };
})();
