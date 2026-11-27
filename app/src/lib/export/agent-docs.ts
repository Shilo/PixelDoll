// Static docs shipped with every export so an agent can integrate the ZIP without PixelDoll's source. They are the same
// for every character on purpose: no name, prompt, key or artwork detail may reach them, so one export never reveals
// another's data. Each engine's own README.txt keeps the full guide; these files only map the folder and start the work.
import type { Engine } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';

const AGENTS = `# PixelDoll paper-doll export

This folder is a 2D pixel-art character with swappable equipment, already aligned on every frame and direction. Read
this file first, then the doc for your engine in docs/, then that engine's README.txt for its full runtime API.

## Which kind of export this is

- manifest.json and layers/ present: the layered export. One PNG sheet per item layer, move and direction, plus one
  manifest that names every path, frame, pivot and draw order. Engines: generic, Godot, Unity, Phaser, Phaser AE,
  GDevelop, Aseprite.
- PNG sheets at the root and no manifest.json: an RPG Maker sheet export. Rows are down, left, right, up and the
  columns are that maker version's steps. See docs/rpg-maker.md or docs/rpg-maker-xp.md.

## Read in this order

1. README.txt: what is in this folder and a quick start.
2. docs/<engine>.md: the entry file, the smallest working code, and where the long guide lives.
3. <engine>/README.txt: the complete integration guide and runtime API for that engine.
4. manifest.json: the source of truth for layer paths, frame counts, pivots and draw order. Each engine's README defines
   the file names that engine's exporter generates next to it.
5. project.json and cells/ are PixelDoll's editable copy for importing back into the app. A game never needs them.

## Rules that keep the art aligned

- Every layer shares the body cell: draw it at the same position, pivoted at rig.pivot. The pivot is a pixel-edge
  point: the cell boundary at rig.pivot (usually the feet) sits on the object's x, y. A layer with its own cell and
  pivot in manifest.json overrides both; use the values it declares.
- A sheet's rows follow rig.directions and its columns are frames. Play rig.animations[].frames in order, each entry
  for its own milliseconds, repeated cell indices included. Repeat only when that move's loop is true.
- Draw layers by their z (items[].layers[].z). A slot's zOverrides then win in this order: per cell, then per move, then
  per direction, the last matching entry winning. Equal z breaks by slot order in manifest.json, back layer before front
  layer, then item id. Never sort by name instead of z.
- Palette swaps are exact RGB replacements from materials[].ramp and materials[].variants. Replace those pixels; never
  scale, rotate, blur or resample the art. A ramp is the item's source palette, an array of #rrggbb colors; a variant maps
  a name to a replacement ramp, applied entry by entry, so keep it as long as ramp (a shorter one recolors only its first
  entries). Only entries listed under variants can be selected, and an unknown
  variant applies no swap. Each engine reference says whether that call also throws, warns or clears other selections.
  When materials is empty, or the
  material you want lists no variants, this character ships nothing to recolor: skip the recolor step instead of calling
  it with invented ids. Supplying your own ramp is not part of this export's API. Variants are the ones saved in PixelDoll
  before the export.
- An item id containing "~" is a baked tuck variant: an item redrawn to sit under the items named after the ~, joined
  with ~ when several cover it. The runtime swaps it in by itself when those covering items are worn. Never equip it:
  the equipment API refuses variant items (each engine reference says whether that throws or returns an error).
- Nearest-neighbor filtering and whole-pixel positions. No atlas packing, rotation or trimming.
- The base body is always worn. A layer that a move or an item does not provide is simply absent.
- With moving attack layers enabled, turning the gait away during a layered action holds the last gait cell in the
  action's facing. Turning back resumes drawing the current gait cell. Both clocks keep running. An unsupported
  outfit can downgrade the action to full for the rest of that action.
- Mirroring is already baked into the exported views; do not flip a sheet that manifest.json lists on its own.
- Sheet paths in manifest.json are relative to the folder that holds it, and each engine folder's files point back at
  layers/: keep the folder together when you copy it into a project.

## Do not

- Guess a frame count, path or pivot: read manifest.json.
- Rename exported files or edit the paths in manifest.json; they are already portable for Windows and macOS.
- Reimplement an engine folder's runtime from scratch; its controller and README are the intended integration.
`;

const CLAUDE = `# Agent entry point

Read AGENTS.md in this folder before writing integration code, then docs/<engine>.md for your engine and
<engine>/README.txt for the complete runtime API.

This is a paper-doll character exported by PixelDoll: one PNG layer per item, frame-aligned on every direction and move.
manifest.json is the source of truth for layer paths, frame counts, pivots and draw order; never guess them. Each
engine folder has its own README for the file names and runtime API it provides.
`;

const phaser = (runtimePath?: string) => `# Phaser 3.80+ / 4

Entry: ${runtimePath ?? 'phaser/PaperdollContainer.js'}, an ES module; ${runtimePath ? '../pixeldoll-phaser/types.d.ts' : 'phaser/types.d.ts'} types the exported data, not the runtime class.
Full guide: phaser/README.txt. Data: manifest.json and the TexturePacker atlas JSON in phaser/.
The JSON files in phaser/ are atlas metadata only: their meta.image points at ../layers/<slot>/<item>/<layer>/<move>.png, so
the exported folder has to stay together.

    import { loadPaperdoll, Paperdoll } from './${runtimePath ? '<folder>/pixeldoll-phaser/PaperdollContainer.js' : 'assets/<character>/phaser/PaperdollContainer.js'}'
    const model = await loadPaperdoll(this, '${runtimePath ? '<folder>' : 'assets'}/<character>/')   // the folder with manifest.json
    const doll = new Paperdoll(this, 200, 150, model)                // 200,150 is the pivot: the feet
    doll.play('walk', 'south')
    doll.applyPreset(model.presets[0].id)                            // items and colors together; it also replaces setVariants choices
    doll.equip('torso_inner', 'vest_leather')                        // after a preset; null empties a slot
    doll.setVariants({ '<material-id>': '<variant-id>' })             // only ids listed in manifest.json

setVariants replaces the whole selection map, so passing only one material clears the others' choices; pass every material
you want recolored. An unknown id applies no swap. Order: play, then applyPreset, then setVariants; applyPreset swaps
items and colors without calling play, so the active move keeps running.
A complete game config:
    new Phaser.Game({ type: Phaser.AUTO, width: 400, height: 300, pixelArt: true, roundPixels: true, scene: [HeroScene] })
Use pixelArt: true and roundPixels: true and serve the folder over http: the module fetches manifest.json.
The path you pass is relative to the document's base URL (document.baseURI), not to PaperdollContainer.js.
This export does not bundle Phaser. Load Phaser 3.80+ or 4 yourself: a script tag that exposes the global Phaser, or your
bundler with an explicit import (import Phaser from 'phaser'); then import ${runtimePath ?? 'phaser/PaperdollContainer.js'} as an ES module.
Phaser does not await an async create(): nothing may use the doll until loadPaperdoll resolves, so guard update() on
this.doll or create it in a scene that starts after loading. loadPaperdoll caches per game, so one scene may load it and
another may create the doll.
doll.playAction(move, direction) plays a one-shot action and doll.setDirection(dir) turns the active move.
A move's loop flag from manifest.json decides whether play repeats it; a move with loop false stops on its last frame.
An unknown move, direction, slot, item or outfit throws before changing anything; an unknown material or variant id
in setVariants selects nothing, so check manifest.json's materials before relying on a recolor.
The constructor starts in model.presets[0], the first outfit in manifest.json.
Call doll.destroy() when removing the character, including when the scene shuts down:
this.events.once('shutdown', () => doll.destroy()).
With the Canvas renderer, keep integer positions and call scene.cameras.main.setRoundPixels(false) for exact pixels;
WebGL does not need that. Atlas files are phaser/<length>-<item>_<length>-<layer>_<length>-<move>.json
with frames named <move>_<direction>_<frame>: each atlas JSON lists the frames it holds, and phaser/README.txt states the
naming pattern.
baked/<outfit>/<move>.png holds the same grid flattened for engines that draw one sprite: rows are directions, columns
are frames, on export.bakedCell and export.bakedPivot from manifest.json. Nothing else in this folder depends on it.
`;

const phaserAe = (runtimePath?: string) => `# Phaser AE

Phaser AE is the Phaser Game Agent's engine, built with the phaser-ae CLI; it is not Phaser 3 or 4.
Entry: ${runtimePath ?? 'phaser-ae/paperdoll.js'}, an ES module, typed by ${runtimePath ? '../pixeldoll-phaser-ae/paperdoll.d.ts' : 'phaser-ae/paperdoll.d.ts'}. Full guide: phaser-ae/README.txt.

${
	runtimePath
		? `Keep the runtime in the game's game/ folder. Add the sheets from phaser-ae/assets.json to the "assets" list in
game/manifest.json with their paths relative to game/. Set "pixelArt": true in the manifest's "screen".`
		: `This is a local integration. Copy manifest.json, phaser-ae/ and the files listed in phaser-ae/assets.json into the game as
game/pixeldoll/<character>/ (not project.json, cells/ or baked/), and add every path in phaser-ae/assets.json to the
"assets" list in game/manifest.json (not to game/assets.json): the build copies those files next to the game. Phaser's
hosted route for a person's files is the Pro "upload" command; this export does not use it. Set "pixelArt": true in the
manifest's "screen".`
}

    // hero.ts: loaded once, before await game.start() (main.ts imports it)
    import { game } from './engine.js'
    import { loadPaperdoll } from './${runtimePath ? '<folder>/pixeldoll-phaser-ae/paperdoll.js' : 'pixeldoll/<character>/phaser-ae/paperdoll.js'}'
    import heroData from './${runtimePath ? '<folder>' : 'pixeldoll'}/<character>/manifest.json'
    export const hero = await loadPaperdoll(game, '${runtimePath ? '<folder>' : 'pixeldoll'}/<character>/', { manifest: heroData })

    // in a scene's enter(), synchronously:
    const doll = new Paperdoll(game, 360, 640, hero)          // 360,640 is the pivot: the feet
    doll.play('<move-id>', '<direction>')
    doll.applyPreset(hero.presets[0].id)                      // items and colors together
    doll.equip('<slot-id>', '<item-id>')                      // after a preset; null empties a slot
    doll.setVariants({ '<material-id>': '<variant-id>' })     // only ids listed in manifest.json
    game.rig.follow(doll.actor)                               // the doll as one game object

doll.actor is the game's own Sprite: it owns the doll's position, scale, rotation, alpha, tint and visibility, so
collision, tweens and verbs act on it, and it draws every layer itself so they move and sort together. doll.x and
doll.y are the pivot, read from and written to the actor. Type a stored doll as Paperdoll<typeof game> so doll.actor
keeps the game's Sprite type. The doll's clock is a step of the scene that created it, so
create the doll in the scene that shows it; leaving that scene removes it. setVariants replaces the whole selection
map, as in Phaser 3 and 4.
`;

const godot = (runtimePath?: string) => `# Godot 4

Entry: godot/Paperdoll.tscn (instance it) and ${runtimePath ?? 'godot/paperdoll.gd'}. Resources: godot/<item>_<layer>.tres and
godot/library.tres, which retains the manifest and every equipment resource.
Full guide: godot/README.txt.

    var doll = preload("res://characters/<character>/godot/Paperdoll.tscn").instantiate()
    add_child(doll)
    doll.play_anim("walk", "south")
    doll.set_preset("outfit_id")        # items and colors together; it replaces earlier selections
    doll.equip("main_hand", "sword")    # after a preset; "" empties a slot

The scene starts playing the first move facing the first direction from its own _ready, so nothing has to start it; call
play_anim to change move or direction. The API is safe once the node is in the tree (add_child); before that the scene has
no manifest, so calls fail. The scene starts in manifest.presets[0].
${runtimePath ? 'Keep the character and shared runtime under res://; a scene outside the character folder references' : 'Copy the whole export folder anywhere under res:// and keep it together; a scene outside it references'}
godot/Paperdoll.tscn with a res:// path. The scene root is a Node2D running paperdoll.gd, and it exposes manifest and
equipped as properties, so no other wiring is needed. Read doll.manifest.materials[].variants (or manifest.json) to see
which variants exist; there is no query API. This targets Godot 4 with format=3 scenes.
set_preset swaps items and colors without calling play_anim, so the active move keeps running. A later equip changes only
that slot and leaves the preset's color variants in place. Each move loops only when its loop flag in manifest.json is
true.
set_variant returns true for a known material even when the variant name is unknown; the unknown name replaces that
material's selection and applies no swap. An unknown material warns, returns false and changes nothing. equip on a
variant item warns and returns false.
Set Rendering > Textures > Default Texture Filter to Nearest and 2D > Snap 2D Transforms To Pixel on.
Manifest depths become native z_index ranks; keep the root's z_index to place the character among scene objects.
`;

const unity = (runtimePath?: string) => `# Unity 2022.3 / Unity 6

Entry: ${runtimePath ?? 'unity/Runtime/Paperdoll.cs'}. The importer ${runtimePath ? '../pixeldoll-unity/Editor/PixelDollImporter.cs' : 'unity/Editor/PixelDollImporter.cs'} reads unity/pixeldoll_unity.json and
builds sliced sheets, clips, the controller and the prefab in unity/Generated/.
Full guide: unity/README.txt.

${
	runtimePath
		? `Use one export destination under Assets/, install com.unity.2d.sprite, and let the scripts compile. Unity imports the
character automatically when it imports the JSON or reloads scripts. Then in play mode:`
		: `Copy the whole folder under Assets/, install com.unity.2d.sprite, and let the scripts compile. If no prefab appears,
run Tools > PixelDoll > <export id> > Import. Then in play mode:`
}

    doll.Play("walk", "south");
    doll.Equip("main_hand", "sword");     // null or "" empties a slot
    doll.ApplyPreset("outfit_id");

The namespace is ${runtimePath ? 'PixelDoll' : 'PixelDoll.<export id>'}. Use a Pixel Perfect Camera, and keep the source sheets unpacked.
The importer takes pixels per unit from export.pixelsPerUnit in manifest.json, or from the rig size when that is absent,
and keeps it across oversize layers so their world scale matches the body.
`;

const GDEVELOP = `# GDevelop 5.6.285+

Entry: gdevelop/game.json (open it, then Preview) and gdevelop/Paperdoll.js, a readable copy of the JavaScript event
already embedded in the project. Every item layer is a native Sprite object with registered frames and a shared pivot.
Full guide: gdevelop/README.txt.

In a later JavaScript event:

    const library = runtimeScene[/* the namespace declared in Paperdoll.js */];
    const doll = library.dolls[0];
    doll.x = 320; doll.y = 240;            // the shared pivot
    doll.play('walk', 'south');
    doll.equip('main_hand', 'sword');      // null empties a slot
    doll.applyPreset('outfit_id');

library.create(x, y) adds an independently equipped doll. The embedded event already updates every doll once per scene
frame; do not call update again.
`;

const ASEPRITE = `# Aseprite

Entry: aseprite/<name>.aseprite, one layer per item and one tag per move and direction, plus a "pivot" slice marking
the feet. Full guide: aseprite/README.txt.

No code is needed: open the file in Aseprite 1.3+ and show or hide layers to dress the character. Visible layers and
colors match the first outfit in manifest.json; frame durations and tags are the exported moves.

Godot's Aseprite Wizard: turn on "Only visible layers", turn off "Round fps", and with Centered off set Offset to the
negated pivot slice position.
`;

const GENERIC = `# Any engine: PNG + JSON

Entry: generic/<item>_<layer>/<move>_<direction>_strip<frames>.png, with manifest.json and layers/ describing every
frame. Full guide: generic/README.txt.

    for each layer of each worn item, in manifest draw order (items[].layers[].z):
      place the strip so the layer's pivot (layers[].pivot, else rig.pivot) sits at the character position
      draw the column the current animation frame points at

layers/ holds the same art as full sheets, one row per direction and one column per frame. Recolor by replacing the
colors of materials[].ramp with the selected variant's ramp; preset colors are already applied in baked/.
`;

const RPGMAKER = `# RPG Maker MZ, MV, VX Ace, VX

Sheets sit at the root of this ZIP, one per outfit. Full guide: README.txt.

Copy the PNGs into img/characters (MZ, MV) or Graphics/Characters (VX Ace, VX) and pick one as an actor or event image.
The "$" prefix tells the engine the image holds a single character. Rows are down, left, right, up; the middle column
is standing and the outer columns are the walk steps. MZ and MV use 48 px tiles and VX Ace and VX 32 px tiles.

This export has no manifest.json, layers/ or project.json purpose in a game: RPG Maker takes one flat sheet. Diagonal
views, idle and action moves have no place in this format.
`;

const RPGMAKERXP = `# RPG Maker XP / Pokemon Essentials

Sheets sit at the root of this ZIP, one per outfit. Full guide: README.txt.

Copy the PNGs into Graphics/Characters and pick one as an actor or event image. Rows are down, left, right, up; the
first column is standing, then step, passing, other step. XP uses 32 px tiles.

This export has no manifest.json or layers/: RPG Maker takes one flat sheet. Diagonal views, idle and action moves have
no place in this format.
`;

const API: Record<Engine, string | ((runtimePath?: string) => string)> = {
	phaser,
	'phaser-ae': phaserAe,
	godot,
	unity,
	gdevelop: GDEVELOP,
	aseprite: ASEPRITE,
	generic: GENERIC,
	'rpg-maker': RPGMAKER,
	'rpg-maker-xp': RPGMAKERXP
};

const RUNTIME_NAMES: Record<string, string> = {
	godot: 'Godot',
	phaser: 'Phaser',
	'phaser-ae': 'Phaser AE',
	unity: 'Unity'
};

/** The agent files of a project folder's shared runtime folder (pixeldoll-<engine>/): what it is and how to treat it.
 *  The same for every character, so every character's publish writes the same bytes. */
export function runtimeAgentFiles(engine: string, entry: string): { name: string; data: string }[] {
	const name = RUNTIME_NAMES[engine] ?? engine;
	const agents = `# PixelDoll ${name} runtime

PixelDoll manages this folder. It holds the ${name} runtime (${entry}) that every PixelDoll character folder beside it
uses. Each character folder has its own manifest.json, AGENTS.md and ${engine}/README.txt with the runtime API.

- Integrate through a character folder: start with its AGENTS.md.
- Do not edit or delete files here. PixelDoll replaces them when it updates the runtime, and a changed or missing file
  pauses updates for every character in this folder until it is restored or kept.
- When copying a character to another project, copy this folder too and keep them in the same parent folder.
`;
	return [
		{ name: 'AGENTS.md', data: agents },
		{
			name: 'CLAUDE.md',
			data: `# Agent entry point

Read AGENTS.md in this folder: it says what this PixelDoll runtime folder is and how to use it.
`
		}
	];
}

/** The root agent files plus one engine reference per requested engine, in one fixed order. */
export function agentFiles(engines: readonly Engine[], runtimePath?: string): OutFile[] {
	const runtimeNote = runtimePath
		? `\nThe shared runtime is at ${runtimePath}. When copying this character, copy ${runtimePath.split('/')[1]} too
and keep them in the same parent folder.\n`
		: '';
	const files: OutFile[] = [
		{ name: 'AGENTS.md', data: AGENTS + runtimeNote },
		{ name: 'CLAUDE.md', data: CLAUDE + runtimeNote }
	];
	for (const engine of new Set(engines)) {
		const guide = API[engine];
		files.push({
			name: `docs/${engine}.md`,
			data: typeof guide === 'string' ? guide : guide(runtimePath) + runtimeNote
		});
	}
	return files;
}
