# PixelDoll user guide

PixelDoll makes a pixel-art character you can dress up. Every hat, top or weapon is its own layer, so your game can swap
them at runtime. The pictures are drawn by [PixelLab](https://pixellab.ai) using your PixelLab account.

## Try the demo

On the welcome screen, press **Try the demo**. The demo character is free and needs no account. You can dress it up, recolour
it, save outfits and export it. To make your own character and items, you need a PixelLab key.

## Connect your PixelLab key

Open **Connect PixelLab…** from the character menu (top left), or press the gens counter in the toolbar. Paste your key
(**Get a key** opens your PixelLab account page), then press **Connect**.

- The key is only sent to PixelLab.
- It is forgotten when you close PixelDoll, unless you tick **Remember on this device**. **Forget key** removes it.
- Remembered keys are shared with PixelLab Backpack on the same website. Open or reload either app to use the saved key;
  **Forget key** removes the shared saved key for both apps.
- The toolbar then shows how many **gens** you have left.

## What "gens" cost

A gen is one PixelLab generation from your account's monthly allowance. Creation and item actions show an estimated price beside or inside their button. Enhance uses about 0.05 gens per request. Typical prices:

| Action | About |
|---|---|
| Create a character (idle + walk, 4 directions) | 35–50 gens, about 12 minutes |
| Create a character with 8 directions | 57–75 gens, about 18 minutes |
| Make an item | about 28 gens |
| Add a move | 30–40 gens |
| Try again on an item | shown on the button |
| Dress up, recolour, outfits, export | free |

The price is an estimate. Empty body output or a wrong frame count may retry once. Body pose estimates, silhouette movement, colour differences and border contact are review notes and do not trigger paid redraws. Equipment fitting keeps its separate automatic checks and retry budget.
**Activity** shows each job's real cost and your balance. Some calls are billed in dollars instead of gens; your balance is the
real total.

## Inspect API calls

Press the **code brackets** icon beside a PixelLab action to peek at its requests without running it. Before generation,
the list shows estimated costs and the fields already known; dependent images and poses become available when prepared.
Expand a call for readable fields, with nested objects and lists you can open individually.

The toolbar's code brackets icon shows recorded calls, including automatic generation and quality repairs. Each call shows
its cost, with a total below. Pending or unreported charges are marked explicitly; dollar charges stay separate from gens.
The list-plus icon reveals background checks, polling and image downloads. **Copy all calls** copies structured JSON,
including hidden background calls and full available request images; authentication credentials are excluded. If copying
is unavailable, PixelDoll downloads the JSON instead.

On phones the same peek fits the screen and closes back to your unchanged form. Recorded history is local to this tab;
the latest 500 foreground and 2,000 background calls are retained. A notice identifies omitted older calls. After a reload,
saved queue submissions can be reconstructed, but earlier attempts and background history are not a complete archive.

## Create a character

Character menu → **New character…**

1. Enter a **Name** in the title bar for your library and exports. It is not sent as part of the prompt.
2. In **Appearance**, add **Details** and choose Kind, Build, Proportions or Skin. **Not set** adds no extra hint.
   Switch to **Prompt** to edit the exact V3 text. Complete lines such as `Kind: Elf` update the matching control; other
   prose stays in Details. The muted preview and Copy button always use the complete prompt.
3. Choose a **Body size** preset (48, 64, 96 or 128 px), or type 32–256 whole pixels. This is V3's source canvas,
   not a guaranteed opaque body height. **Frame → Auto** adds padding; type a larger frame for more room, up to 256 px.
   Neither padding nor export rescale the artwork.
4. Choose **Directions**: Top-down 8 (default), Top-down 4, Diagonal 4, Side-scroller 2 or Unique 8. Individual arrows
   toggle retained views. Attached mirror buttons derive that view from its horizontal partner. Select the opposite
   mirror button to reverse the source. Removing a source makes its remaining partner independent. **Unique 8** has no mirrors.
5. Check **Camera** and leave **Seed** blank for a fresh variation, or enter a non-negative whole seed. The seed affects
   generation and animations rather than one appearance trait; reuse can give similar results but does not guarantee identical pixels.
6. Press **Create character** for idle and walk in the selected directions. The muted cost includes the whole pipeline.

Hover a title on desktop, or tap it on mobile, for help. **Enhance** uses the V3 prompt endpoint with the current body size
and camera; the same button becomes **Undo**. It never runs automatically during creation. A failed or stale response keeps
your text, and no enhancement is automatically retried.

V3 always creates all eight original views. PixelDoll pads and registers them, animates only the selected independent
sources, then derives the selected mirrors. Asymmetric details change sides in a mirrored view; use an independent view
when that matters. A result that does not fit the chosen frame stops with a size error instead of silently cropping it.

New characters wear a light grey shirt and dark grey shorts, so you can tell them apart and recolour them separately.

You can keep working or close the tab while it runs. It picks up where it left off. When it is done, press
**Start dressing up**.

## Share equipment designs between characters

Select an accepted equipment item and press **Save as shared design**. Check the current colours in the preview and name the design. This saves an independent local snapshot of its artwork and references.

On another character, choose **New item → Saved designs**:

- **Review free copy** reuses frames whose frozen body pixels and geometry match. If only some frames match, **Review available copy · Free** shows the available coverage and its gaps. Copying uses no PixelLab generations.
- **View fit** checks whether a different body can use a reference fit. The initial paid trial supports single-material headwear on known 64 px low top-down humanoid rigs with complete standing references. Other slots and multi-material designs still support compatible free copies.
- Paid fitting has separate prices and reviews: preview the standing fit first, then approve animation. Inspect every direction and move before **Keep and wear** or **Keep in wardrobe**. A failed attempt still costs generations; retries require a separate priced action.

Each kept copy has its own wardrobe entry, colours and outfit choices. Changing the source or removing its library entry leaves existing copies intact. **Export** on a design card downloads a portable `.pixeldoll-design.zip`; **Import design** restores it. Character exports also keep their accepted copies and pinned references.

The library lives in this browser's storage. Download design and character ZIPs to keep backups or move them to another device.

## Import an existing character

Choose **Import an existing character** on the welcome screen or character menu → **Import character…**. Importing is free and saves a new copy on this device.

- **From this device:** choose a PixelLab character ZIP (individual rotation and animation frames) or a PixelDoll export ZIP, up to 64 MB. If a PixelLab archive has several states, choose the one to import. Preview it, give it a name, then press **Import character**.
- **From PixelLab:** connect your account to browse the characters returned by its library API, 20 per page. Use **Next** and **Previous** to reach the full account list; this is not a public catalog of everybody's characters. You can also paste a character ID or creator link without connecting. Select a character, review its preview, then import. This reads existing artwork; it does not generate or change anything in PixelLab.

Supported ZIP layouts:

| Layout | What it needs |
|---|---|
| Current PixelLab export | `metadata.json` with its state/frame paths, plus those PNGs. State folders and frame filenames can vary because the metadata maps them. |
| Older PixelLab frame export | `metadata.json`, `rotations/<direction>.png`, and optional `animations/<move>/<direction>/frame_<number>.png`. |
| Current PixelDoll export | Editable `project.json` and original `cells/` images, alongside any engine files. This is PixelDoll's documented open format. |
| Older PixelDoll engine export | PixelDoll `manifest.json` and its referenced spritesheets. An arbitrary game-engine ZIP without that manifest is not supported. |

These layouts may sit inside enclosing folders. Several candidate enclosing character folders are refused rather than guessed; PixelLab's multiple states within one metadata file have a state chooser. Arbitrary PNG folders, unrelated JSON formats, standalone spritesheets and custom frame naming without compatible metadata are not supported. They would need an explicit frame-layout mapper so directions, pivots and animation order cannot be guessed incorrectly.

**Cancel** closes the import before saving, including while a ZIP downloads or is being prepared. Pending reads are aborted where possible; late results cannot open a preview. Once **Import character** starts saving the local copy, Cancel is visibly disabled until that save finishes.

Artwork keeps its original pixels and directions. Existing clothes and hair in a PixelLab character are part of its base and cannot be removed as separate items. Frames that would crop visible pixels in PixelDoll’s 64 px cell are refused. Standalone PNGs are not supported because they do not describe the direction and animation layout.

Leave **Set up the pose rig next** checked to prepare imported artwork for the same equipment and move pipeline used by created characters. You can also choose character menu → **Set up character…** later. Review the existing appearance and standing reference, then check the estimated price before starting. Setup finds joints on every unique body frame (0.1 gen each) and connects the supplied standing views to your current PixelLab account (0.25 gen). It keeps existing pixels, layers, colours and outfits intact. Saved standing views stay fixed to preserve existing equipment alignment.

Each character has its own fitted equipment layers. Imported and created characters use the same tools to make those layers; sharing an equipment design between different bodies is a future feature.

Setup supports square 32–256 px humanoid frames with all four cardinal views or saved original views for reconnection. Missing views and empty frames are reported before spending. Little space above the head produces a warning about tall hair or hats, without rejecting a contained body. Imported clothes and hair remain part of the base, and must be described as such. After setup, new equipment uses the shared chroma-key, skeleton posing, quality checks and oversize weapon pipeline; new moves use the existing appearance and camera view. Original clips retain their measured joints; pose adherence is unavailable because those frames have no original requested pose to compare against.

New PixelDoll exports include an editable copy with their original rig, equipment keyframes, layers, colours and outfits. Older exports restore their sheets and outfits; setup can recover the body pose rig, but equipment without its original dressed reference must be made again before it can follow future moves. Unknown or failed setup requests stop for review in **Jobs** instead of being sent again after reload.

## Delete a character

Open the character, then character menu → **Delete character…**. The confirmation names the local character and offers **Export a copy** before deletion. Deletion removes its local items, outfits and changes permanently; its PixelLab original remains in your account. Pending generation work must finish or be dismissed first. The demo cannot be deleted.

## Add items

In the wardrobe, press **+** next to a slot group (Head, Hair, Face, Body, Legs, Feet, Back, Hands), or **New**.

1. **What is it?** Describe the item, for example "leather hat", or tap an idea.
2. **Where does it go?** Pick the group. **Details** lets you choose the exact slot (a beard goes under Hair, a shield in the
   off hand).
3. Add an optional **Colour hint**, then press **Make**.

Items are drawn for your own character. On the demo, use **Copy the demo body** to get an editable copy first.

### Review: Clean or Needs a look

When an item is done, it appears on your character for review in every direction.

- **Clean**: every frame passed PixelDoll's checks.
- **Needs a look**: a check flagged something. The reason is listed, for example "The item touches the frame edge (may be
  cut off)", "The item switches hands" or "Some body pixels were changed by the model". It is often still fine. Play it, look
  at each direction, then decide.

Then choose **Keep it**, **Try again** (spends gens again) or **Discard**.

## Dress up

- Tap an item in the wardrobe to wear it. One item per slot: wearing a new hat takes the old one off. Tap **None** to empty
  a slot.
- **Random look** (shuffle icon) picks a random outfit.
- The inspector (right side) shows the selected item. You can change its layer order, choose which items it hides when worn
  ("When worn, hide"), take it off, or remove it for good.
- **Undo** and **Redo** are in the toolbar (Ctrl+Z, Ctrl+Shift+Z).
- **Outfits**: press **Save current look** and give it a name. Outfits are exported too, so your game can switch between them.

Everything saves on this device automatically.

## Recolour

Open the **Colours** tab. Pick a swatch for each colour of the item (or of **Everything you wear**), or **Pick any colour**.
The body has three: **Shirt**, **Shorts** and **Skin** (characters made before this came with one shared grey; PixelDoll
splits it into shirt and shorts the next time you open them, nothing is regenerated).
**Original** restores one colour and **Reset** restores them all. Recolouring swaps exact colours,
so pixel art stays crisp, and it is free.

## Add a move

Open the **Moves** tab → **Add a move**. Pick **Idle**, **Walk**, **Slash**, **Cast**, **Hurt** or **Death**, or describe your own under **Or
describe it**, for example "jumping in place". Items you tick under **Animate these items too** are made for the new move.
Items you leave out stay hidden in that move until you make them. A worn item without frames for the current move shows
a note on the stage with **Make it** and its price.

Moves are added to your own characters (not the demo).

## Export

Press **Export** (toolbar), choose an **Export format**, and download the zip. **Engines & frameworks** lists Godot, Unity,
Phaser and GDevelop; **Asset formats** lists Aseprite and PNG + JSON. Export is
free and runs on your device. Tick **Also export finished characters** to also get one ready-made sheet per outfit.

Each zip has a `README.txt` with a quick start for that engine. Copy the whole folder into your project.

Godot includes a native scene, animation resources and an equipment runtime. Unity includes an Editor importer that creates
a layered prefab, sliced sprites and animation assets; follow its package requirements before importing. Phaser includes
native atlas data and a Container runtime. GDevelop includes an editable project with registered Sprite frames and an embedded
controller event: open `gdevelop/game.json` and Preview, or follow its README to copy the objects and event into your project.
These integrations keep the layers synchronized and expose equipment and outfit controls.

The selected format's description stays visible; hover a card for more detail. Arrow keys move between native radio choices.
GameMaker is deferred until native runtime verification is available. Unreal is not currently an export option.

Use Aseprite for an editable layered animation, or PNG + JSON for other engines and custom runtimes such as MonoGame.
The JSON records each layer's size and pivot, frame timing, direction order and equipment rules. Your integration must read
those rules to preserve the paperdoll; importing images alone does not reproduce equipment behavior. Finished character
sheets are useful when your game does not need to swap equipment. See the [2026 target review](research/export-targets-2026-10-23.md)
for why there are dedicated exports for these engines and when more would be useful.

## Good to know

- **Activity** (toolbar) lists running jobs with **Stop** and **Cancel**, and your balance.
- Parallel jobs use maintained plan defaults: Free/Trial 1, Tier 1 8, Tier 2 10, and Tier 3+ 20. Unknown plans use a
  fallback of 3. Activity shows a short “jobs at once” footnote; there is no setting to change.
  If PixelLab is busy with work from its website, Aseprite or another app, your requests stay queued and retry after a
  wait. Accepted generations keep running; unknown outcomes are not automatically resent, to avoid duplicate charges.
- A Free/Trial key is valid. Connect warns that skeleton animation and inpainting need Tier 1 or higher; you can continue
  using available tools and all local dressing, recolouring and export features. Restricted workflows wait before their
  first paid request, so creating a base cannot spend generations before a required animation is blocked.
- With PixelDoll open in two tabs, one tab runs the jobs ("Working in another tab"). Keep it open.
- Keys: Space play/pause · 1–4 face south/east/north/west (1–8 on 8-direction characters, in the order of the direction
  buttons) · 0 all directions · , and . step one frame.
- **Offline?** A small banner says "You're offline — generation paused; everything else works". Running and queued jobs wait
  (nothing is sent, so no gens are spent on a dead connection) and continue by themselves when you are back online.
  Dressing up, recolouring, outfits and export keep working.
- PixelLab may decline some descriptions. Try different words.
