// Shared setup for the Export and Project folder specs: a small saved character opened in Export, and a browser-private
// folder standing in for a picked game folder.
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { openStudio } from './immersive-helpers.ts';

/** A saved two-clip character opened in Export. Returns its project id. */
export async function savedExport(page: Page, dev: string) {
	await page.setViewportSize({ width: 800, height: 600 }); // Eight parallel settings runs do not need eight full-size animated worlds.
	await page.addInitScript(() => {
		localStorage.setItem('pixeldoll.agentKey', 'off');
		localStorage.setItem(
			'pixeldoll.tips',
			'["add-item","add-move","add-state","customize","export","gear","generate-items","new-character","pixellab"]'
		);
		localStorage.setItem('pixeldoll.visited', '1');
	});
	await page.route('https://*.pixellab.ai/**', (route) => route.abort());
	await openStudio(page, dev);
	const id: string = await page.evaluate(async () => {
		const statePath = '/src/studio/state.svelte.ts',
			createPath = '/src/studio/create.ts',
			rigPath = '/src/lib/rig/rig.ts';
		const state = await import(statePath),
			{ saveCopy } = await import(createPath),
			{ baseHashOf } = await import(rigPath);
		const source = state.store.project,
			manifest = structuredClone(source.manifest);
		const body = manifest.items.find((item: { id: string }) => item.id === manifest.rig.baseItem);
		// The real demo is covered by the existing export tests. Settings need only two small clips and saved outfits.
		manifest.items = [body];
		manifest.slots = manifest.slots.filter((slot: { id: string }) => slot.id === body.slot);
		manifest.materials = manifest.materials.filter(
			(material: { owner: string }) => material.owner === body.id
		);
		manifest.presets = manifest.presets.map((preset: object) => ({
			...preset,
			items: { body: body.id },
			variants: {}
		}));
		manifest.rig.directions = [{ id: 'south' }];
		delete manifest.rig.rest;
		delete manifest.rig.anchors;
		const hashes: Record<string, string> = {},
			used = new Set<string>();
		for (const animation of manifest.rig.animations) {
			animation.cells = 2;
			animation.loop = true;
			animation.frames = [
				{ cell: 0, ms: 100 },
				{ cell: 1, ms: 100 }
			];
			delete animation.sources;
			for (const layer of body.layers) {
				layer.cells[animation.id] = { south: layer.cells[animation.id].south.slice(0, 2) };
				layer.cells[animation.id].south.forEach((hash: string, index: number) => {
					used.add(hash);
					hashes[`${animation.id}/south/${index}`] = hash;
				});
			}
		}
		manifest.rig.baseHash = await baseHashOf(manifest.rig, hashes);
		body.baseHash = manifest.rig.baseHash;
		const images = new Map([...source.images].filter(([hash]) => used.has(hash)));
		const id = await saveCopy({ manifest, images }, 'Export settings test');
		await state.refreshProjects();
		await state.openProject(id);
		return id;
	});
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(
		page.getByRole('dialog').getByRole('radio', { name: 'Godot', exact: true })
	).toBeEnabled();
	return id;
}

/** A browser-private (OPFS) folder stands in for the picked game folder, with a switchable write permission. */
export async function fakeProjectFolder(target: Page | BrowserContext) {
	await target.addInitScript(() => {
		const w = window as unknown as Record<string, unknown>;
		w.__folderPermission = 'granted';
		FileSystemHandle.prototype.queryPermission = async () =>
			w.__folderPermission as PermissionState;
		FileSystemHandle.prototype.requestPermission = async () => {
			w.__folderPermission = 'granted';
			return 'granted';
		};
		w.showDirectoryPicker = async () =>
			(await navigator.storage.getDirectory()).getDirectoryHandle('game', { create: true });
	});
}

export const folderText = (page: Page, path: string) =>
	page.evaluate(async (path) => {
		const parts = path.split('/');
		try {
			let dir = await navigator.storage.getDirectory();
			for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
			return await (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).text();
		} catch {
			return null;
		}
	}, path);

/** Writes, removes or replaces with a folder a path in the browser-private stand-in folder. */
export const changeFolder = (
	page: Page,
	path: string,
	change: { text?: string; remove?: boolean; folder?: boolean }
) =>
	page.evaluate(
		async ({ path, change }) => {
			const parts = path.split('/');
			let dir = await navigator.storage.getDirectory();
			for (const part of parts.slice(0, -1))
				dir = await dir.getDirectoryHandle(part, { create: true });
			const name = parts.at(-1)!;
			if (change.remove || change.folder) await dir.removeEntry(name).catch(() => {});
			if (change.folder) return void (await dir.getDirectoryHandle(name, { create: true }));
			if (change.remove) return;
			const out = await (await dir.getFileHandle(name, { create: true })).createWritable();
			await out.write(change.text!);
			await out.close();
		},
		{ path, change }
	);
