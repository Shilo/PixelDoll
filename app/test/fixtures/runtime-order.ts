import { drawList, composeCell } from '../../src/lib/runtime/paperdoll.js';
import { PAPERDOLL_JS } from '../../src/lib/export/phaser.ts';
import { GDEVELOP_RUNTIME } from '../../src/lib/export/gdevelop.ts';
import { asepriteFile, readAseprite } from '../../src/lib/export/aseprite.ts';
import { CURRENT_FORMAT, type Item, type Project } from '../../src/lib/store/manifest.ts';

export async function orderingProbe() {
	const item = (id: string, slot: string, depth: number): Item => ({
		id,
		slot,
		name: id,
		status: 'accepted',
		baseHash: 'sha256:base',
		mirror: 'flip',
		materials: [],
		prompt: '',
		provenance: [],
		layers: [
			{
				id: 'main',
				role: 'fg',
				z: depth,
				cells: { walk: { south: [`sha256:${id}`] } },
				sheets: { walk: `${id}.png` }
			}
		]
	});
	const manifest: Project['manifest'] = {
		format: CURRENT_FORMAT,
		name: 'Order',
		app: 'test',
		rig: {
			baseItem: 'base',
			baseHash: 'sha256:base',
			cell: { w: 1, h: 1 },
			pivot: { x: 0, y: 0 },
			directions: [{ id: 'south' }],
			animations: [{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
		},
		slots: [
			{ id: 'body', class: 'base', z: 0 },
			{ id: 'aaa', class: 'worn', z: 1 },
			{ id: 'zzz', class: 'worn', z: 1 }
		],
		items: [item('base', 'body', 0), item('A', 'aaa', 1), item('Z', 'zzz', 1)],
		materials: [],
		presets: [{ id: 'look', name: 'Look', items: { aaa: 'A', zzz: 'Z' }, variants: {} }]
	};
	const images = new Map(
		manifest.items.map((entry, index) => [
			`sha256:${entry.id}`,
			{ w: 1, h: 1, data: new Uint8ClampedArray([index + 1, 0, 0, 255]) }
		])
	);
	const sheets = new Map(
		manifest.items.map((entry) => [`${entry.id}.png`, images.get(`sha256:${entry.id}`)!])
	);
	const equipment = manifest.presets[0].items;
	const { Paperdoll } = await import(
		`data:text/javascript;base64,${Buffer.from(PAPERDOLL_JS).toString('base64')}`
	);
	const doll = Object.create(Paperdoll.prototype);
	Object.assign(doll, {
		m: manifest,
		equipped: equipment,
		anim: 'walk',
		dir: 'south',
		body: { anims: { currentFrame: { textureFrame: 'south_0' } } },
		texture: (entry: Item) => entry.id,
		nodes: manifest.slots.map((slot, index) => ({
			slot,
			role: 'fg',
			sprite: {
				pdOrder: index,
				key: '',
				visible: false,
				setVisible(value: boolean) {
					this.visible = value;
				},
				setTexture(key: string) {
					this.key = key;
				}
			}
		}))
	});
	doll.container = {
		sort(_field: string, compare: (left: unknown, right: unknown) => number) {
			doll.nodes.sort((left: { sprite: unknown }, right: { sprite: unknown }) =>
				compare(left.sprite, right.sprite)
			);
		}
	};
	doll.sync();
	const create = new Function(`${GDEVELOP_RUNTIME}\nreturn createPixelDoll;`)();
	const nodes: { name: string; z: number; hidden: boolean }[] = [];
	const scene = {
		createObject(name: string) {
			const node = {
				name,
				z: 0,
				hidden: false,
				hide(value = true) {
					this.hidden = value;
				},
				setLayer() {},
				setAnimationName() {},
				setAnimationFrame() {},
				pauseAnimation() {},
				setPosition() {},
				updatePreRender() {},
				getRendererObject: () => ({}),
				setZOrder(depth: number) {
					this.z = depth;
				}
			};
			nodes.push(node);
			return node;
		},
		getGame: () => ({ getImageManager: () => ({ getPIXITexture: () => ({}) }) })
	};
	create(
		scene,
		manifest,
		Object.fromEntries(manifest.items.map((entry) => [entry.id, { main: entry.id }]))
	);
	const aseprite = await readAseprite(await asepriteFile(manifest, sheets));
	return {
		canonical: drawList(manifest, equipment, 'walk', 'south', 0).map((draw) => draw.item.id),
		pixel: [...composeCell({ manifest, images }, equipment, 'walk', 'south', 0).data],
		phaser: doll.nodes
			.filter((node: { sprite: { visible: boolean } }) => node.sprite.visible)
			.map((node: { sprite: { key: string } }) => node.sprite.key),
		gdevelop: nodes
			.filter((node) => !node.hidden)
			.sort((left, right) => left.z - right.z)
			.map((node) => node.name),
		aseprite: aseprite.frames[0].cels
			.filter((cel) => aseprite.layers[cel.layer].visible)
			.sort((left, right) => left.layer + left.z - right.layer - right.z)
			.map((cel) => aseprite.layers[cel.layer].name.split('.')[1])
	};
}
