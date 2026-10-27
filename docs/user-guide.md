# PixelDoll user guide

PixelDoll makes a pixel-art character you can dress up. Every hat, top or weapon is its own layer, so your game can swap
them at runtime. The pictures are drawn by [PixelLab](https://pixellab.ai) using your PixelLab account.

## Try the demo

The app opens to **Characters**, including the bundled demo and characters saved on this device. Choose **Customize** to dress the selected character. Clicking an already-selected character also opens customization. The demo needs no account: you can dress it, recolor it, save outfits and export it. Creating characters and items requires a PixelLab key.

In customization, **Preview** provides animation playback and facing controls. **Top-down** and **Side-scroller** provide continuous movement with a following camera. Focus the world and use WASD/arrows, or drag the world on touch screens. Equipment and outfits remain available in every view. **Inspect** opens the original precise frame/direction viewer. Click the character name to switch characters or manage imports and setup.

Desktop customization controls sit together on the right. On phones, expand or collapse the bottom equipment area. **Wardrobe**, **Colors**, **Outfits** and **Moves** reuse the same saved character; Moves is available in Preview. **More** lists additional equipment categories. **More options → Light mode / Dark mode** changes the environment and UI, never the character's source colors.

## Connect your PixelLab key

Open **More options → Connect PixelLab**, or the account entry in the character-name menu. Paste your key
(**Get a key** opens your PixelLab account page), then press **Connect**.

- The key is only sent to PixelLab.
- Each tab keeps its own key in memory. Closing that tab forgets it unless you check **Remember on this device**.
  **Forget key** clears the key in open PixelDoll tabs and removes the saved key.
- Remembered keys are shared with PixelLab Backpack on the same website. Open or reload either app to use the saved key;
  **Forget key** removes the shared saved key for both apps.
- The account and Activity views show your balance and usage.

## What "gens" cost

A gen is one PixelLab generation from your account's monthly allowance. Creation and item actions show an estimated price beside or inside their button. Enhance uses about 0.05 gens per request. Typical prices:

| Action | About |
|---|---|
| Create a character (its standing **Default** pose) | about 2–5 gens |
| **Add idle + walk**, default **Top-down 8** (5 drawn views, west mirrored) | about 55 gens, plus your items' poses |
| **Top-down 4** / **Diagonal 4** / **Side-scroller 2** | about 33 / 22 / 11 gens |
| **Unique 8** (every view drawn independently) | about 88 gens |
| Make an item | about 10 gens on the Default pose alone; about 25 once idle and walk exist (Top-down 8); held items cost about twice that |
| Add a move | depends on the move, views and selected items; shown before spending |
| Try again on an item | shown on the button |
| Dress up, recolor, outfits, export | free |

The price is an estimate. Empty body output or a wrong frame count may retry once. Body pose estimates, silhouette movement, color differences and border contact are review notes and do not trigger paid redraws. Equipment fitting keeps its separate automatic checks and retry budget.
PixelLab may bill some calls in dollars. Automatic quality retries and fallbacks cost extra; queue and generation time vary.
**Activity** shows reported job usage in gens and dollars, plus your balance. Usage can arrive after a job finishes; an unknown
request may still have run or charged. Estimates are not spending caps.

## Inspect API calls

Press the **code brackets** icon beside a PixelLab action to peek at its requests without running it. Before generation,
the list shows estimated costs and the fields already known; dependent images and poses become available when prepared.
Expand a call for readable fields, with nested objects and lists you can open individually.

The **API calls** action in **More options** shows recorded calls, including automatic generation and quality repairs. Each call shows
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
3. Choose a **Body size** preset (48, 64, 96 or 128 px), or type 32–256 pixels in 4px increments. This is V3's source canvas,
   not a guaranteed opaque body height. **Frame → Auto** adds padding; type a larger frame for more room, up to 256 px.
   Neither padding nor export rescale the artwork. Above an 80 px frame, a note warns that items cost more.
4. Choose **Directions**: Top-down 8 (default), Top-down 4, Diagonal 4, Side-scroller 2 or Unique 8. Individual arrows
   toggle retained views. Attached mirror buttons derive that view from its horizontal partner. Select the opposite
   mirror button to reverse the source. Removing a source makes its remaining partner independent. **Unique 8** has no mirrors.
5. Check **Camera** and leave **Seed** blank for a fresh variation, or enter a non-negative whole seed. The seed affects
   the drawing rather than one appearance trait, and moves added later pick their own seeds; reuse can give similar
   results but does not guarantee identical pixels.
6. Press **Create character**. It draws your character standing in the selected directions, its **Default** pose, in a
   few minutes. Idle, walk and other moves come afterward.

Hover a title on desktop, or tap it on mobile, for help. **Enhance** uses the V3 prompt endpoint with the current body size
and camera; the same button becomes **Undo**. It never runs automatically during creation. A failed or stale response keeps
your text, and no enhancement is automatically retried.

V3 always creates all eight original views. PixelDoll pads and registers them, keeps the selected views and derives the
selected mirrors. The standing views appear in the creator as soon as they are drawn; they all arrive together. Asymmetric details change sides in a mirrored view; use an independent view
when that matters. A result that does not fit the chosen frame stops with a size error instead of silently cropping it.

New characters have plain bare skin with nothing worn, so every item you add sits directly on the body.

Keep this tab open while PixelLab responds; you can keep dressing existing characters. After reopening, PixelDoll can resume requests with a
known job ID and reuse saved results. If a submitted request has an unknown outcome, generation stops for review in
**Activity**; it is never automatically sent again. **Try again** starts a new paid attempt and may incur additional charges.
When creation is done, press **Add idle + walk** to queue both moves (the button shows the price) or **Start dressing up**
to dress the Default pose first. **Moves → Add idle + walk** offers the same later.
**Default** is every character's standing pose: one still frame per direction, listed first in Moves and Share and
exported like any move. Characters saved before it existed (including imported ones, whose standing pose was called
Rest) gain it for free the next time they are opened. "Default" can't be used as the name of another move.

## Share equipment designs between characters

Select an accepted equipment item and press **Save as shared design**. Check the current colors in the preview and name the design. This saves an independent local snapshot of its artwork and references.

On another character, choose **New item → Saved designs**:

- **Review free copy** reuses frames whose frozen body pixels and geometry match. If only some frames match, **Review available copy · Free** shows the available coverage and its gaps. Copying uses no PixelLab generations.
- **View fit** checks whether a different body can use a reference fit. The initial paid trial supports single-material headwear on known 64 px low top-down humanoid rigs with complete standing references. Other slots and multi-material designs still support compatible free copies.
- Paid fitting has separate prices and reviews: preview the standing fit first, then approve animation. Inspect every direction and move before **Keep and wear** or **Keep in wardrobe**. Failed attempts can still be billed; retries require a separate priced action. PixelLab may report charges in generations or dollars. The displayed generation estimate is not a dollar spending cap; reported charges remain visible after failures and retries.

Each kept copy has its own wardrobe entry, colors and outfit choices. Changing the source or removing its library entry leaves existing copies intact. **Export** on a design card downloads a portable `.pixeldoll-design.zip`; **Import design** restores it. Character exports also keep their accepted copies and pinned references.

When you add a move, shared equipment gets a separate review for its missing frames. Matching frames copy for free; approved standing references can be reused without another standing-fit charge. Unaccepted or failed drafts do not replace wardrobe artwork. An export can therefore contain the new body move while warning that an item has no equipment frames for it.

Paid fitting is experimental: a successful standing fit does not guarantee every move will preserve the design. Visible deformation blocks keeping the result; an occlusion warning still needs visual review. Broader item classes and recovery of missing old equipment references remain on the [shared equipment backlog](https://github.com/users/Shilo/projects/7).

The library lives in this browser's storage, with no account sync. Download design and character ZIPs to keep backups or move them to another device. A design ZIP contains equipment references; use a character ZIP to preserve the whole editable character.

## Import an existing character

Press **Import** on the Characters screen or choose the character menu → **Import character…**. Importing is free and saves a new copy on this device.

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

Leave **Set up the pose rig next** checked to prepare imported artwork for the same equipment and move pipeline used by created characters. You can also choose character menu → **Set up character…** later. Review the existing appearance and standing reference, then check the estimated price before starting. Setup finds joints on every unique body frame (0.1 gen each) and connects the supplied standing views to your current PixelLab account (0.25 gen). It keeps existing pixels, layers, colors and outfits intact. Saved standing views stay fixed to preserve existing equipment alignment.

Each character has its own fitted equipment layers. Imported and created characters use the same tools to make those layers, including the [shared design library](#share-equipment-designs-between-characters) within its current compatibility and experimental fitting limits.

Setup supports square 32–256 px humanoid frames with all four cardinal views or saved original views for reconnection. Missing views and empty frames are reported before spending. Little space above the head produces a warning about tall hair or hats, without rejecting a contained body. Imported clothes and hair remain part of the base, and must be described as such. After setup, new equipment uses the shared chroma-key, skeleton posing, quality checks and oversize weapon pipeline; new moves use the existing appearance and camera view. Original clips retain their measured joints; pose adherence is unavailable because those frames have no original requested pose to compare against.

New PixelDoll exports include an editable copy with their original rig, equipment keyframes, layers, colors and outfits. Older exports restore their sheets and outfits; setup can recover the body pose rig, but equipment without its original dressed reference must be made again before it can follow future moves. Unknown or failed setup requests stop for review in **Activity** instead of being sent again after reload.

## Delete a character

Open the character, then character menu → **Delete character…**. The confirmation names the local character and offers **Export a copy** before deletion. Deletion removes its local items, outfits and changes permanently; its PixelLab original remains in your account. Pending generation work must finish or be dismissed first. The demo cannot be deleted.

## Add items

In **Wardrobe**, pick a category (Head, Hair, Body, or **More** for Face, Legs, Feet, Back and Held item), then press
**New <category> item**, or **Use a saved design** to fit a shared design.

1. **Where does it go?** Pick the group. **Details** lets you choose the exact slot (a beard goes under Hair, a shield in the
   off hand).
2. **What is it?** Describe the item, for example "leather hat", or tap an idea.
3. Add an optional **Color hint**, then press **Make**.

Items are drawn for your own character. On the demo, use **Copy the demo body** to get an editable copy first.

### While it generates

The item's card fills in as PixelLab answers: first the standing views, then each direction's moves, with a spinner on the
views still loading. Tap the item's tile in the wardrobe (or **Wear** on its card) to wear it while it loads; Preview,
Top-down and Side-scroller say "<item> loading — <directions>" until the rest arrives. A worn draft is only shown: it is not
saved, undone, put in outfits or exported until it becomes an item. Wearing another item or **None** in that slot takes it off.

### Review: Clean or Needs a look

Review is optional. A **Clean** item saves itself when it finishes ("<name> saved"); if you were wearing it, it stays on.
An item that **Needs a look** stays a draft with a badge until you decide. Use **Preview move** to inspect every generated
move and direction, including frame edges and the grip of held items.

- **Clean**: the generated coverage passed PixelDoll's automatic checks. This is not a guarantee of correct artwork.
- **Needs a look**: a check flagged something. The reason is listed, for example "The item touches the frame edge (may be
  cut off)", "The grip side is unclear; check the intended hand" or "Some body pixels were changed by the model". Play each move and inspect the
  flagged frames before deciding. Missing or malformed frame batches cannot be kept; complete artwork with appearance
  warnings can be kept explicitly, and those warnings remain visible on the saved item.

Then choose **Keep it**, **Try again** (starts another paid attempt, in gens or dollars) or **Discard**. These stay
available on any draft that has not saved itself.

## Dress up

- Tap an item in the wardrobe to wear it. One item per slot: wearing a new hat takes the old one off. Tap **None** to empty
  a slot.
- **Random look** (shuffle icon) picks a random outfit.
- The **details** button beside the selected item opens the **Item** sheet. You can change its layer order, choose which items it hides when worn
  ("When worn, hide"), take it off, or remove it for good.
- **Undo** and **Redo** are in the toolbar (Ctrl+Z, Ctrl+Shift+Z).
- **Outfits**: press **Save current look** and give it a name. Outfits are exported too, so your game can switch between them.

Changes save automatically in this browser on this device. If storage fails, follow the visible error and retry. Export
a copy for backup; clearing browser data removes local projects.

## Recolor

Open the **Colors** tab. Pick a swatch for each color of the item (or of **Character colors**), or **Pick any color**.
A bare body has **Skin**. Older characters that were drawn in a gray shirt and shorts also have **Shirt** and **Shorts**
(PixelDoll splits a single shared gray into the two the next time you open them; nothing is regenerated).
**Original** restores one color and **Reset** restores them all. Recoloring swaps exact colors,
so pixel art stays crisp, and it is free.

If a saved item's new frames contain nearby steel shades outside its existing palette, the **Item** sheet may offer
**Match item colors · Free**. Select the move and facing view first, then review the displayed pixel and frame counts.
It matches only small, unambiguous neutral color differences to that item's existing palette. Other views and moves,
body pixels, existing palette colors, material ramps, saved recolors and quality warnings stay intact. Larger or ambiguous differences
remain unchanged. This runs locally and makes no PixelLab call; export a backup before editing artwork.

## Add a move

Open the **Moves** tab → **Add a move**. Pick **Idle**, **Walk**, **Slash**, **Cast**, **Hurt** or **Death**, or describe your own under **Or
describe it**, for example "jumping in place". Items you check under **Animate these items too** are made for the new move.
Items you leave out stay hidden in that move until you make them. A worn item without frames for the current move shows
a note on the stage with **Make it** and its price.

New characters start with only **Default**; **Add idle + walk** in **Moves** adds both in one tap. Moves run one at a time:
a move you add while another is running waits as **Queued**. If a move fails, the queue waits: **Try again** continues
with the queued moves, **Start over** drops them.

Moves are added to your own characters (not the demo), using their existing direction policy. Older mirrored characters
stay mirrored; the new-character setting does not rebuild their frozen artwork.

To repair an existing move, choose it again in **Add a move**, then check the views to replace. Views with failed body
checks are selected initially. Other directions and moves keep their existing pixels. Selected equipment is re-posed
only for the replaced views; other equipment stays hidden there until **Make it** fills the missing views. A replacement
that still fails body checks keeps the previous artwork.

For an accepted item that has bad frames, select the move and facing direction in the preview, then use **Try new item
frames** in the Item sheet. This redraws that item's frames on the frozen body, preserving its saved design and the other
views and moves. Review the displayed estimate before starting. Failed quality checks keep the previous item frames;
successful generation still needs a visual check for grip, missing parts and extra blades. Grid estimates include
protected design references and the actual submitted canvas size; large 96px grids can cost more than small 64px grids.

If a body render finished but its joint measurements failed, the failed move may offer **Retry joint checks**. This
reuses the exact completed body images and runs only unfinished measurements, sequentially. Review the count and cost:
an unknown earlier request may already have charged. Each click records a separate explicit recovery attempt; reloading
does not grant another retry of an unknown result. **Generate new frames** instead starts a new body attempt.

A failed repair with otherwise valid poses may offer **Match body colors**. It reuses completed renders and makes only
small, unambiguous changes to nearby colors from the standing reference. It preserves shapes, leaves larger or
different-hue changes alone, and measures changed images again. The displayed cost includes those measurements and
selected equipment posing. The previous body remains if any quality check still fails.

## Export

Press **Export** (toolbar), choose an **Export format**, and download the zip. **Engines and frameworks** lists Godot, Unity,
Phaser and GDevelop; **Assets** lists Aseprite and PNG + JSON. Export is
free and runs on your device. Check **Also export finished characters** to also get one ready-made sheet per outfit.

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
- Failed character creation, moves and setup stay stopped after reload. Open their progress sheet to review the error;
  use the explicit retry/resume action or dismiss it. Reloading does not retry a recorded failure.
- With PixelDoll open in two tabs, one tab runs the jobs (the other shows "Other tab" beside Activity). Keys are not passed between tabs.
  Connect in the active queue tab, or close it to let this tab take over. A blocked generation action opens **Activity**
  with this guidance and keeps the form draft.
- Parallel jobs use maintained plan defaults: Free/Trial 1, Tier 1 8, Tier 2 10, and Tier 3+ 20. Unknown plans use a
  fallback of 3. Activity shows a short “jobs at once” footnote; there is no setting to change.
  If PixelLab is busy with work from its website, Aseprite or another app, your requests stay queued and retry after a
  wait. Accepted generations keep running; unknown outcomes are not automatically resent, to avoid duplicate charges.
- A Free/Trial key is valid. Connect warns that skeleton animation and inpainting need Tier 1 or higher; you can continue
  using available tools and all local dressing, recoloring and export features. Restricted workflows wait before their
  first paid request, so creating a base cannot spend generations before a required animation is blocked.
- Keys: Space play/pause · 1–4 face south/east/north/west (1–8 on 8-direction characters, in the order of the direction
  buttons) · 0 all directions · , and . step one frame.
- **Offline?** The offline banner pauses new submissions and polling until the connection returns. Requests already sent
  to PixelLab may finish and charge while you are offline. Known jobs can resume; unknown paid outcomes stop for review
  rather than being sent again. Dressing up, recoloring, outfits and export work with locally saved artwork while the
  app is open. Offline reload/install support is not implemented yet.
- PixelLab may decline some descriptions. Try different words.
