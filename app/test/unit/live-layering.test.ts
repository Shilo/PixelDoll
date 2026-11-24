import { expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exportFiles } from '../../src/lib/export/export.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import {
	actionHip,
	actionPairFallback,
	actionWaist,
	composeLayeredAction,
	exportedActionDraws,
	layerOffset,
	splitLower,
	splitUpper
} from '../../src/lib/runtime/paperdoll.js';
import { CURRENT_FORMAT, type Item, type Project } from '../../src/lib/store/manifest.ts';

function pixels(left: number, top: number, width: number, height: number, red: number) {
	const image = makeImg(64, 64);
	for (let x = left; x < left + width; x++)
		for (let y = top; y < top + height; y++) image.data.set([red, 0, 0, 255], (y * 64 + x) * 4);
	return image;
}

async function fixture(): Promise<Project> {
	const body = pixels(26, 14, 12, 37, 70);
	const boot = pixels(26, 46, 12, 5, 20);
	const weapon = pixels(38, 35, 12, 2, 200);
	const wrongBoot = pixels(26, 46, 12, 5, 100);
	const walkWeapon = pixels(8, 34, 5, 3, 190);
	const [baseHash, bootHash, weaponHash, otherBoot, walkWeaponHash] = await Promise.all(
		[body, boot, weapon, wrongBoot, walkWeapon].map(cellHash)
	);
	const item = (id: string, slot: string, walk = baseHash, attack = walk): Item => ({
		id,
		name: id,
		slot,
		baseHash,
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		prompt: '',
		provenance: [],
		layers: [
			{
				id: 'main',
				role: 'fg',
				z: slot === 'body' ? 10 : 20,
				cells: { walk: { south: [walk] }, slash: { south: [attack] } }
			}
		]
	});
	return {
		images: new Map([
			[baseHash, body],
			[bootHash, boot],
			[weaponHash, weapon],
			[otherBoot, wrongBoot],
			[walkWeaponHash, walkWeapon]
		]),
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Layered fixture',
			app: 'test',
			materials: [],
			presets: [],
			rig: {
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 51 },
				baseItem: 'base',
				baseHash,
				directions: [{ id: 'south' }],
				animations: ['walk', 'slash'].map((id) => ({
					id,
					cells: 1,
					loop: id === 'walk',
					frames: [{ cell: 0, ms: 100 }]
				})),
				anchors: { hip: { walk: { south: [[32, 32]] }, slash: { south: [[32, 32]] } } }
			},
			slots: [
				{ id: 'body', class: 'base', z: 10 },
				{ id: 'feet', class: 'worn', z: 20 },
				{ id: 'main_hand', class: 'held', z: 25 }
			],
			items: [
				item('base', 'body'),
				item('boots', 'feet', bootHash, otherBoot),
				item('sword', 'main_hand', walkWeaponHash, weaponHash)
			]
		}
	};
}

test('registration triggers a fit even for a one-pixel shift from an infinite seam', () => {
	const image = pixels(26, 14, 12, 37, 70);
	const geometry = { hip: { x: 32, y: 32 }, feet: [], source: 'anchor' } as const;
	const lower = splitLower(image, { ...geometry, feet: [] });
	const upper = splitUpper(image, { ...geometry, feet: [] });
	upper.hip = { x: 32, y: 33 };
	expect(layerOffset(lower, upper)).toEqual({ x: 0, y: 0, seam: 0, source: 'fit' });
	expect(actionPairFallback(Infinity, 0)).toBe('seam');
	expect(actionPairFallback(2, 0)).toBe('seam');
	expect(actionPairFallback(1, 1)).toBe('gear-loss');
	expect(actionPairFallback(1, 0)).toBeNull();
	expect(actionWaist(-14)).toBe(-4);
	expect(actionWaist(14)).toBe(4);
});

test('Live shares shaped body trimming and keeps the attack sword and walk boots', async () => {
	const project = await fixture();
	const frame = { w: 64, h: 64, x: 32, y: 51 };
	const walk = { clip: 'walk', direction: 'south', cell: 0 } as const;
	const attack = { ...walk, clip: 'slash' };
	const items = { feet: 'boots', main_hand: 'sword' };
	expect(actionHip(project.manifest.rig, 'walk', 'south', 0)?.source).toBe('anchor');
	const render = () => composeLayeredAction(project, items, walk, attack, 0, frame);
	const first = render();
	expect(first.fallback).toBeNull();
	expect(first.image?.data[(50 * 64 + 30) * 4]).toBe(20);
	expect(first.image?.data[(35 * 64 + 45) * 4]).toBe(200);
	expect(first.image?.data[(35 * 64 + 9) * 4 + 3]).toBe(0);
	expect(render()).toEqual(first);
	expect(
		composeLayeredAction(project, items, walk, { ...attack, direction: 'east' }, 0, frame).fallback
	).toBe('direction');
});

test('exports ship precut source layers and exact integer hip registration only when enabled', async () => {
	const p = await fixture();
	const opts = { engines: ['phaser', 'gdevelop', 'godot', 'unity'] as const, baked: false };
	const off = await exportFiles(p, { ...opts, engines: ['phaser'] });
	expect(off.entries.some((f) => f.name.startsWith('action/'))).toBe(false);
	const on = await exportFiles(p, {
		...opts,
		engines: [...opts.engines],
		actionLayering: { waist: 0, walk: ['walk'], attacks: ['slash'] }
	});
	expect(on.errors).toEqual([]);
	const text = (name: string) =>
		new TextDecoder().decode(on.entries.find((f) => f.name === name)?.data);
	const m = JSON.parse(text('manifest.json')) as Project['manifest'];
	expect(m.actionLayers?.planes[0].anchors[0].cells).toEqual([[32, 32]]);
	expect(m.actionLayers?.pairs[0].cells).toEqual([{ x: 0, y: 0, blocked: [] }]);
	const upper = on.entries.find((f) => f.name === 'action/upper/layers/body/base/main/slash.png');
	expect(upper).toBeDefined();
	const image = await decodePngBytes(upper!.data);
	expect(image.data[(40 * 64 + 32) * 4 + 3]).toBe(0);
	const walk = { clip: 'walk', direction: 'south', cell: 0 } as const;
	const attack = { ...walk, clip: 'slash' };
	const draws = exportedActionDraws(m, { feet: 'boots', main_hand: 'sword' }, attack, walk, true);
	expect(draws.filter((d) => d.item.id === 'boots').map((d) => d.part)).toEqual(['lower']);
	expect(draws.filter((d) => d.item.id === 'sword').map((d) => d.part)).toEqual(['upper']);
	expect(draws.filter((d) => d.item.id === 'base').map((d) => d.part)).toEqual(['lower', 'upper']);
	expect(text('godot/paperdoll.gd')).toContain('func can_layer_action');
	expect(text('unity/Runtime/Paperdoll.cs')).toContain('public string PlayAction');
	expect(text('gdevelop/game.json')).toContain('upper_PD_');
});

test.skipIf(!process.env.GODOT_BIN)(
	'Godot draws the precut stacks while the native walk clock stays active',
	async () => {
		const p = await fixture();
		const exported = await exportFiles(p, {
			engines: ['godot'],
			baked: false,
			actionLayering: { waist: 0, walk: ['walk'], attacks: ['slash'] }
		});
		expect(exported.errors).toEqual([]);
		const folder = mkdtempSync(join(tmpdir(), 'pixeldoll-action-godot-'));
		const godot = (...args: string[]) =>
			spawnSync(process.env.GODOT_BIN!, ['--headless', '--path', folder, ...args], {
				encoding: 'utf8',
				timeout: 40000,
				windowsHide: true
			});
		try {
			for (const { name, data } of exported.entries) {
				const path = join(folder, name);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, data);
			}
			writeFileSync(
				join(folder, 'project.godot'),
				'config_version=5\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n'
			);
			writeFileSync(
				join(folder, 'verify.gd'),
				`extends SceneTree
func _initialize():
	call_deferred("verify")
func verify():
	var doll = load("res://godot/Paperdoll.tscn").instantiate()
	root.add_child(doll)
	var ok = doll.play_anim("walk", "south") and doll.can_layer_action("slash", "south")
	ok = ok and doll.play_action("slash", "south") == "full" and doll.is_action_playing()
	ok = ok and doll.body.animation == "walk_south" and doll.body.is_playing()
	doll.set_action_layering(true)
	ok = ok and doll.play_action("slash", "south") == "layered"
	ok = ok and doll._action_nodes.size() >= 2
	ok = ok and doll._action_nodes[0].texture.atlas.resource_path.contains("/action/lower/")
	ok = ok and doll._action_nodes[1].texture.atlas.resource_path.contains("/action/upper/")
	ok = ok and doll.play_action("missing", "south") == "" and doll.is_action_playing()
	doll._process(0.11)
	ok = ok and not doll.is_action_playing() and doll.body.is_visible() and doll.body.is_playing()
	ok = ok and doll.play_action("slash", "south") == "layered"
	doll.play_anim("walk", "south")
	ok = ok and not doll.is_action_playing()
	print("ACTION_GODOT_PASS" if ok else "ACTION_GODOT_FAIL")
	quit(0 if ok else 1)
`
			);
			const imported = godot('--editor', '--import');
			expect(imported.status, imported.stdout + imported.stderr).toBe(0);
			const result = godot('--script', 'verify.gd');
			expect(result.status, result.stdout + result.stderr).toBe(0);
			expect(result.stdout).toContain('ACTION_GODOT_PASS');
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	},
	90000
);
