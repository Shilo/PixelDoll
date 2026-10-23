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
- Each tab keeps its own key in memory. Closing that tab forgets it unless you tick **Remember on this device**.
  **Forget key** clears the key in open PixelDoll tabs and removes the saved key.
- Remembered keys are shared with PixelLab Backpack on the same website. Open or reload either app to use the saved key;
  **Forget key** removes the shared saved key for both apps.
- The toolbar then shows how many **gens** you have left.

## What "gens" cost

A gen is one PixelLab generation from your account's monthly allowance. Before you spend anything, every button that spends
shows an estimate, for example **Create 46–80 gens** or **Make · Est. 34 gens**. Typical estimates:

| Action | About |
|---|---|
| Create a character (idle + walk, 4 independent directions) | 46–80 gens |
| Create a character with 8 independent directions | 90–150 gens |
| Mirrored economy mode (4 / 8 directions) | 35–60 / 57–95 gens |
| Make an item | about 34 gens for a new 4-view idle/walk rig; varies with coverage |
| Add a move | depends on the move, views and selected items; shown before spending |
| Try again on an item | shown on the button |
| Dress up, recolour, outfits, export | free |

PixelLab may bill some calls in dollars. Automatic quality retries and fallbacks cost extra; queue and generation time vary.
**Activity** shows reported job usage in gens and dollars, plus your balance. Usage can arrive after a job finishes; an unknown
request may still have run or charged. Estimates are not spending caps.

## Create a character

Character menu → **New character…**

1. Describe the body under **Who is it?**, for example "a stocky dwarf with a friendly face". Describe only
   the body. Hair, clothes and gear come later as separate items.
2. Pick **Skin** and **Build** (slim, average, stocky) if you like.
3. Press **Create**. You get idle and walk, facing south, east, north and west, as 64 × 64 pixel sprites. Each direction
   has its own artwork by default, avoiding automatic left/right hand swaps. Generated artwork can still get hands or
   poses wrong, so inspect every view and move before relying on it.

**More options** (folded away; the defaults suit most games):

- **Directions**: **4** (default) or **8**, including diagonals. The estimate updates with the number of independently drawn views.
- **Mirror left-facing views to save credits**: optional economy mode. Western views flip their eastern counterparts, so
  held items switch hands. Older saved creation drafts retain this behavior; changing the setting does not alter existing characters.
- **Body size**: **48 px** (default) or **56 px** tall inside the same 64 × 64 sprite. 56 px gives a bigger figure but less room
  above the head for tall hats. If a 56 px character comes out too tall to leave 6 px above its head, PixelDoll stops after the
  first drawing and asks you to try again with 48 px or another seed.
- **Name** and **Seed**. A matching completed request can be reused; new PixelLab generations may differ even with the same seed.

New characters wear a light grey shirt and dark grey shorts, so you can tell them apart and recolour them separately.

Keep this tab open while PixelLab responds; you can keep dressing existing characters. After reopening, PixelDoll can resume requests with a
known job ID and reuse saved results. If a submitted request has an unknown outcome, generation stops for review in
**Activity**; it is never automatically sent again. **Try again** starts a new paid attempt and may incur additional charges.
When creation is done, press **Start dressing up**.

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

Setup supports 64 × 64 humanoid bodies with all four cardinal views or all eight views, and the same headroom needed by created characters. Missing views, empty frames and insufficient headroom are reported before spending. Imported clothes and hair remain part of the base, and must be described as such. After setup, new equipment uses the shared chroma-key, skeleton posing, quality checks and oversize weapon pipeline; new moves use the existing appearance and camera view. Original clips retain their real measured joints; pose adherence is unavailable because those frames have no original requested pose to compare against.

New PixelDoll exports include an editable copy with their original rig, equipment keyframes, layers, colours and outfits. Older exports restore their sheets and outfits; setup can recover the body pose rig, but equipment without its original dressed reference must be made again before it can follow future moves. Unknown or failed setup requests stop for review in **Activity** instead of being sent again after reload.

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

When an item is done, review it on your character. Use **Preview move** to inspect every generated move and direction,
including frame edges and the grip of held items.

- **Clean**: the generated coverage passed PixelDoll's automatic checks. This is not a guarantee of correct artwork.
- **Needs a look**: a check flagged something. The reason is listed, for example "The item touches the frame edge (may be
  cut off)", "The grip side is unclear; check the intended hand" or "Some body pixels were changed by the model". Play each move and inspect the
  flagged frames before deciding. Missing or malformed frame batches cannot be kept; complete artwork with appearance
  warnings can be kept explicitly, and those warnings remain visible on the saved item.

Then choose **Keep it**, **Try again** (starts another paid attempt, in gens or dollars) or **Discard**.

## Dress up

- Tap an item in the wardrobe to wear it. One item per slot: wearing a new hat takes the old one off. Tap **None** to empty
  a slot.
- **Random look** (shuffle icon) picks a random outfit.
- The inspector (right side) shows the selected item. You can change its layer order, choose which items it hides when worn
  ("When worn, hide"), take it off, or remove it for good.
- **Undo** and **Redo** are in the toolbar (Ctrl+Z, Ctrl+Shift+Z).
- **Outfits**: press **Save current look** and give it a name. Outfits are exported too, so your game can switch between them.

Changes save automatically in this browser on this device. If storage fails, follow the visible error and retry. Export
a copy for backup; clearing browser data removes local projects.

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

Moves are added to your own characters (not the demo), using their existing direction policy. Older mirrored characters
stay mirrored; the new-character setting does not rebuild their frozen artwork.

To repair an existing move, choose it again in **Add a move**, then tick the views to replace. Views with failed body
checks are selected initially. Other directions and moves keep their existing pixels. Selected equipment is re-posed
only for the replaced views; other equipment stays hidden there until **Make it** fills the missing views. A replacement
that still fails body checks keeps the previous artwork.

For an accepted item that has bad frames, select the move and facing direction in the preview, then use **Try new item
frames** in the Item tab. This redraws that item's frames on the frozen body, preserving its saved design and the other
views and moves. Review the displayed estimate before starting. Failed quality checks keep the previous item frames;
successful generation still needs a visual check for grip, missing parts and extra blades.

If a body render finished but its joint measurements failed, the failed move may offer **Retry joint checks**. This
reuses the exact completed body images and runs only unfinished measurements, sequentially. Review the count and cost:
an unknown earlier request may already have charged. Each click records a separate explicit recovery attempt; reloading
does not grant another retry of an unknown result. **Generate new frames** instead starts a new body attempt.

## Export

Press **Export** (toolbar), choose **For which engine?**: Godot, Unity, Phaser, Aseprite or PNG + JSON, and download the zip. Export is
free and runs on your device. Tick **Also export finished characters** to also get one ready-made sheet per outfit.

Each zip has a `README.txt` with a quick start for that engine. Copy the whole folder into your project.

Exported outfits keep their selected colours on separate item layer copies, including skin, shirts and shorts. Matching
colour combinations share a copy. Original source-colour layers stay available, and importing the ZIP back into PixelDoll
restores the original editable colours and outfits. In engine assets, a coloured body layer follows a hidden original
body that provides the shared animation clock.

## Good to know

- **Activity** (toolbar) lists running jobs with **Stop** and **Cancel**, and your balance.
- Failed character creation, moves and setup stay stopped after reload. Open their progress sheet to review the error;
  use the explicit retry/resume action or dismiss it. Reloading does not retry a recorded failure.
- With PixelDoll open in two tabs, one tab runs the jobs ("Working in another tab"). Keys are not passed between tabs.
  Connect in the active queue tab, or close it to let this tab take over. A blocked generation action opens **Activity**
  with this guidance and keeps the form draft.
- Keys: Space play/pause · 1–4 face south/east/north/west (1–8 on 8-direction characters, in the order of the direction
  buttons) · 0 all directions · , and . step one frame.
- **Offline?** The offline banner pauses new submissions and polling until the connection returns. Requests already sent
  to PixelLab may finish and charge while you are offline. Known jobs can resume; unknown paid outcomes stop for review
  rather than being sent again. Dressing up, recolouring, outfits and export work with locally saved artwork while the
  app is open. Offline reload/install support is not implemented yet.
- PixelLab may decline some descriptions. Try different words.
