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
  manifest that names every path, frame, pivot and draw order. Engines: generic, Godot, Unity, Phaser, GDevelop,
  Aseprite.
- PNG sheets at the root and no manifest.json: an RPG Maker sheet export. Rows are down, left, right, up and the
  columns are that maker version's steps. See docs/rpgmaker.md or docs/rpgmakerxp.md.

## Read in this order

1. README.txt: what is in this folder and a quick start.
2. docs/<engine>.md: the entry file, the smallest working code, and where the long guide lives.
3. <engine>/README.txt: the complete integration guide and runtime API for that engine.
4. manifest.json: the only source of truth for paths, frame counts, pivots and draw order.
5. project.json and cells/ are PixelDoll's editable copy for importing back into the app. A game never needs them.

## Rules that keep the art aligned

- Every layer shares the body cell: draw it at the same position, pivoted at rig.pivot. A layer with its own cell and
  pivot in manifest.json overrides both; use the values it declares.
- A sheet's rows follow rig.directions and its columns are frames. Play rig.animations[].frames in order, each entry
  for its own milliseconds, repeated cell indices included. Repeat only when that move's loop is true.
- Draw layers in manifest order: items[].layers[].z, with the slot's z overrides where they apply. Never sort by name.
- Palette swaps are exact RGB replacements from materials[].ramp and materials[].variants. Replace those pixels; never
  scale, rotate, blur or resample the art.
- Nearest-neighbor filtering and whole-pixel positions. No atlas packing, rotation or trimming.
- The base body is always worn. A layer that a move or an item does not provide is simply absent.
- Mirroring is already baked into the exported views; do not flip a sheet that manifest.json lists on its own.

## Do not

- Guess a frame count, path or pivot: read manifest.json.
- Rename exported files or edit the paths in manifest.json; they are already portable for Windows and macOS.
- Reimplement an engine folder's runtime from scratch; its controller and README are the intended integration.
`;

const CLAUDE = `# Agent entry point

Read AGENTS.md in this folder before writing integration code, then docs/<engine>.md for your engine and
<engine>/README.txt for the complete runtime API.

This is a paper-doll character exported by PixelDoll: one PNG layer per item, frame-aligned on every direction and move.
manifest.json is the source of truth for paths, frame counts, pivots and draw order; never guess them.
`;

const PHASER = `# Phaser 3.80+ / 4

Entry: phaser/PaperdollContainer.js, an ES module; phaser/types.d.ts types it for checked JavaScript.
Full guide: phaser/README.txt. Data: manifest.json and the TexturePacker atlases in phaser/.

    import { loadPaperdoll, Paperdoll } from './assets/<character>/phaser/PaperdollContainer.js'
    const model = await loadPaperdoll(this, 'assets/<character>/')   // the folder with manifest.json
    const doll = new Paperdoll(this, 200, 150, model)
    doll.play('walk', 'south')

Use pixelArt: true and roundPixels: true and serve the folder over http: the module fetches manifest.json.
doll.applyPreset(outfitId) switches outfits, doll.setVariants({ materialId: 'variantId' }) recolors, and
doll.playAction(move, direction) plays a one-shot action. Call doll.destroy() when removing the character.
The atlas file names and frame names are generated; read them from manifest.json instead of building your own.
`;

const GODOT = `# Godot 4

Entry: godot/Paperdoll.tscn (instance it) and godot/paperdoll.gd. Resources: godot/<item>_<layer>.tres and
godot/library.tres, which retains the manifest and every equipment resource.
Full guide: godot/README.txt.

    var doll = preload("res://characters/<character>/godot/Paperdoll.tscn").instantiate()
    add_child(doll)
    doll.play_anim("walk", "south")
    doll.equip("main_hand", "sword")     # "" empties a slot
    doll.set_preset("outfit_id")

Set Rendering > Textures > Default Texture Filter to Nearest and 2D > Snap 2D Transforms To Pixel on.
Manifest depths become native z_index ranks; keep the root's z_index to place the character among scene objects.
`;

const UNITY = `# Unity 2022.3 / Unity 6

Entry: unity/Runtime/Paperdoll.cs. The importer unity/Editor/PixelDollImporter.cs reads unity/pixeldoll_unity.json and
builds sliced sheets, clips, the controller and the prefab in unity/Generated/.
Full guide: unity/README.txt.

Copy the whole folder under Assets/, install com.unity.2d.sprite, and let the scripts compile. If no prefab appears,
run Tools > PixelDoll > <export id> > Import. Then in play mode:

    doll.Play("walk", "south");
    doll.Equip("main_hand", "sword");     // null or "" empties a slot
    doll.ApplyPreset("outfit_id");

The namespace is PixelDoll.<export id>. Use a Pixel Perfect Camera, and keep the source sheets unpacked.
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

const API: Record<Engine, string> = {
	phaser: PHASER,
	godot: GODOT,
	unity: UNITY,
	gdevelop: GDEVELOP,
	aseprite: ASEPRITE,
	generic: GENERIC,
	rpgmaker: RPGMAKER,
	rpgmakerxp: RPGMAKERXP
};

/** The root agent files plus one engine reference per requested engine, in one fixed order. */
export function agentFiles(engines: readonly Engine[]): OutFile[] {
	const files: OutFile[] = [
		{ name: 'AGENTS.md', data: AGENTS },
		{ name: 'CLAUDE.md', data: CLAUDE }
	];
	for (const engine of new Set(engines))
		files.push({ name: `docs/${engine}.md`, data: API[engine] });
	return files;
}
