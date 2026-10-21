# Proper Paperdolling in PixelLab for Android

## Executive summary

For the Android app **PixelLab – Text on pictures** by App Holdings / originally Imagin Studio, the most reliable paperdoll workflow is to treat PixelLab as a **layered compositor and alignment tool**, not as a full Photoshop-style asset-management system. The current Google Play release is version 2.1.9, updated January 19, 2026; the official listing confirms image import, multiple overlay objects, project saving, background removal, transparent-capable export, perspective editing, and links to the developer's original tutorial playlist. citeturn5view2turn5view3

The single most important rule is:

> **Every exported body/equipment PNG should normally have exactly the same canvas dimensions and use the same character anchor. Do not crop transparent margins independently.**

That convention solves most alignment problems. A helmet, shirt, sword, hair layer, boots, and body can all be drawn on a 1024×1024 master, for example, exported as separate 1024×1024 transparent PNGs, and then rendered at the same position. The empty transparent pixels become your implicit positioning metadata.

PixelLab can reorder, hide, lock, and merge objects/layers according to community documentation, and it has a grid tool and position/relative-position controls. However, its stock Android workflow is considerably weaker than Photoshop, Photopea, ibisPaint, or Krita for **true folders/groups, nondestructive layer masks, sophisticated snapping/guides, layer naming, and automated layer-by-layer export**. Recent PixelLab users are still explicitly requesting true layer grouping and improved grid snapping, which is strong evidence that these are not mature native capabilities in the current release. citeturn1search6turn5view3turn10search2

For serious production, I recommend a **PixelLab-first / standardized-PNG workflow**:

1. Establish one master canvas and one permanent anchor coordinate.
2. Keep every equipment object aligned in that master.
3. Use full-canvas transparent PNGs as the exchange format.
4. Lock reference/body objects before fitting equipment.
5. Simulate folders using contiguous layer blocks and numeric slot prefixes.
6. Never merge the only editable copy.
7. Save versioned `.plp` masters.
8. Export equipment by hiding all other layers and exporting the full transparent canvas.
9. For dozens or hundreds of assets, hand the export stage to ibisPaint or Photopea rather than attempting to turn PixelLab into a batch-production system. ibisPaint explicitly supports **Save Layer as Transparent PNG**, while Photopea supports folders, masks, guides/snapping, scripting, artboards, and **File → Export Layers** workflows. citeturn9search9turn8search0turn8search3turn2search20

One important research caveat: **pixellab.ai is not the Android PixelLab discussed here**. It is a separate AI pixel-art/game-asset service with Aseprite/Pixelorama-oriented documentation. I excluded its documentation from PixelLab-Android feature claims. citeturn10search1turn5view2


## PixelLab capabilities and the production model

### What PixelLab is good at

The Android app is unusually convenient for a paperdoll compositor because imported images remain independent objects that can be positioned, resized, rotated, reordered, hidden, and edited. The official Play listing specifically advertises importing images for compositing, adding many text/sticker objects, project saving, transparent-background creation, and image export at selectable resolution. citeturn5view2

Community training material describes a Layers panel with **lock, hide, delete, edit, merge, and layer-position controls**, while the object's toolset includes **Position, Relative Position, opacity, rotation, erase, color filters, and mask-related operations**. It also documents a Grid control intended to make placement easier. citeturn1search6turn10search2

This makes PixelLab quite effective for:

- fitting armor onto a body;
- stacking clothing in a deterministic draw order;
- maintaining transparent components;
- making quick color or shape variants;
- testing complete character combinations;
- and exporting game-ready raster layers.

### What it does not do like Photoshop

The biggest mistake is designing the workflow around features that PixelLab does not clearly provide.

**True layer folders/groups:** I found no evidence that stock PixelLab 2.1.9 has conventional persistent folders comparable to Photoshop, Photopea, ibisPaint, or Krita. A very recent August 2026 PixelLab review specifically requests a Group Layers function, while community videos offer various "group without merging" tricks rather than demonstrating a normal folder hierarchy. Treat such tricks as convenience hacks, not as the foundation of your file format. citeturn5view3turn1search10

**Advanced snapping:** PixelLab has a grid, but a July 2026 feature request asks for improved object alignment including grid snapping and relative alignment. Consequently, assume the grid is primarily a visual aid rather than Photoshop-style magnetic snapping unless your particular build proves otherwise. citeturn5view3turn10search2

**Photoshop-style nondestructive layer masks:** PixelLab exposes "Mask" functionality, particularly in its text/object editing tools, and masking tutorials exist, but I found no evidence of a universal raster-mask object attached nondestructively to each arbitrary layer in the same sense as Photopea or Krita. Photopea, by comparison, explicitly documents per-layer raster/vector masks and even masks on folders. citeturn5view2turn1search6turn2search20

**Native batch export of independent layers:** PixelLab's official material discusses exporting the image/document, not "Export Layers." I found no verifiable native multi-layer PNG batch exporter in version 2.1.9. This is the principal bottleneck for large equipment libraries. citeturn5view2turn5view3

### The architecture you should use instead

Think of a paperdoll as a **fixed coordinate system containing independently replaceable images**:

```text
                 SAME CANVAS FOR EVERY FILE
        ┌─────────────────────────────────────────┐
        │                 x = W/2                 │
        │                    │                    │
        │                    │                    │
        │                  HEAD                   │
        │                    │                    │
        │                SHOULDERS                │
        │                    │                    │
        │                 WAIST                   │
        │                    │                    │
        │                  FEET  ← anchor         │
        │                    ●                    │
        └─────────────────────────────────────────┘
                            ↑
                    same point in BODY,
                    HAIR, SHIRT, ARMOR,
                    BOOTS, SWORD, etc.
```

If every file has the same width, height, and transparent padding, the game or downstream compositor can simply draw every selected image at the same `(x,y)` location. There is no need to rediscover offsets every time.

That is far more robust than allowing PixelLab—or a gallery/file converter—to crop each equipment piece to its visible bounds.


## Canvas, files, anchors, and naming

### File format

Use **PNG with alpha transparency** for all runtime paperdoll components. PNG is lossless and supports per-pixel alpha; the current W3C specification describes PNG as a lossless raster format with an optional alpha channel. JPEG does not provide the equivalent transparent-layer workflow and should be reserved for flattened previews, not wearable assets. citeturn7search13turn7search4

Recommended production files:

| Purpose | Format | Recommendation |
|---|---|---|
| Editable PixelLab master | `.plp` | Save versions frequently |
| Body/equipment runtime asset | `.png` | 8-bit RGBA / transparency |
| Preview/contact sheet | `.png` or `.jpg` | Flattened only |
| Alignment reference | `.png` | Transparent guide image |
| Asset metadata | `.csv`, `.json`, or text | Store slot/order/pivot if needed |

PixelLab's current release explicitly mentions fixing `.plp` project-saving issues, confirming PLP remains part of its project workflow. citeturn5view2turn5view3

### Choosing resolution

There is no universally correct paperdoll size, so the correct answer to "what canvas size?" is:

> **Choose the smallest master resolution that contains the highest detail you genuinely need, then keep that exact resolution for every compatible layer.**

Do not arbitrarily choose 4096×4096 merely because PixelLab can export large images. Android's common `ARGB_8888` bitmap representation consumes four bytes per pixel in memory. Android's documentation gives the same calculation and warns that large bitmaps can exhaust an application's memory budget. citeturn7search0turn7search15

Approximate decoded memory per full-canvas layer is therefore:

| Resolution | Raw RGBA memory per layer | Eight layers |
|---|---:|---:|
| 512×512 | ~1 MiB | ~8 MiB |
| 1024×1024 | ~4 MiB | ~32 MiB |
| 2048×2048 | ~16 MiB | ~128 MiB |
| 4096×4096 | ~64 MiB | ~512 MiB |

Those are **decoded working-memory figures**, not PNG file sizes. PNG compression may make the files far smaller on disk, particularly when much of the canvas is transparent, but the editor still needs working bitmap memory when manipulating them. Android explicitly notes that a compressed image can occupy far more memory once decoded. citeturn7search0turn7search15

For that reason, my practical starting points are:

**Small sprites / deliberately pixel-art-like characters:** 128–512 px maximum dimension.

**Normal 2D game character paperdolls:** roughly 512–2048 px maximum dimension, depending on on-screen size.

**Illustrated HD avatars:** 2048 px may be justified, but test memory with your actual layer count before committing.

These are workflow recommendations, not PixelLab limits.

### Anchor convention

Choose one permanent logical anchor.

For a standing front-view character, a useful convention is:

```text
anchor_x = canvas_width / 2
anchor_y = foot baseline
```

For example, on an assumed **1024×1024 tutorial canvas**:

```text
canvas            = 1024 × 1024
centerline        = x 512
foot anchor       = (512, 920)      ← example only
normalized anchor = (0.500, 0.898)
```

The exact Y coordinate is arbitrary. What matters is that you never change it for compatible equipment.

A transparent full-canvas sword might occupy only 250×600 visible pixels, but its actual PNG should remain 1024×1024. A helmet may occupy only 300×240 pixels, but it is still exported as 1024×1024.

### When tight cropping is required

Full-canvas PNGs are operationally simplest but can waste disk/storage bandwidth. When an engine or asset pipeline requires tight crops, record the crop offset.

Suppose your global anchor is:

```text
A = (anchor_x, anchor_y)
```

and a trimmed item's rectangle begins at:

```text
T = (crop_left, crop_top)
```

then the anchor measured inside the trimmed sprite is:

```text
trimmed_pivot_x = anchor_x - crop_left
trimmed_pivot_y = anchor_y - crop_top
```

Store that in a manifest rather than trying to infer it later.

Example:

```csv
asset,slot,z,pivot_x,pivot_y,revision
knight_armor_iron_a.png,torso,50,412,744,3
knight_sword_iron_front.png,weapon_front,90,173,801,2
```

### Naming convention

Because conventional editable layer naming is not well documented for stock PixelLab, make the **file name** the canonical asset identity. Where a PixelLab build does let you rename an object, mirror the same name there.

A robust pattern is:

```text
<character>_<slot>_<item>_<variant>_<renderpart>_r<revision>.png
```

Examples:

```text
knight_body_base_default_main_r03.png
knight_hair_bob_black_back_r02.png
knight_hair_bob_black_front_r02.png
knight_clothes_tunic_blue_main_r04.png
knight_armor_plate_iron_main_r03.png
knight_feet_boots_leather_main_r01.png
knight_accessory_necklace_gold_main_r02.png
knight_weapon_longsword_iron_back_r01.png
knight_weapon_longsword_iron_front_r01.png
```

The `back/front` suffix is extremely useful. A **logical equipment item does not always equal one render layer**. A sword passing behind the torso but in front of one hand may need `weapon_back` and `weapon_front` images. Likewise, long hair, capes, wings, shields, and large helmets often require multiple render pieces.

For strict sorting, prepend a z-order number:

```text
010_hair_back_bob_black_r02.png
020_body_base_r03.png
030_clothes_tunic_blue_r04.png
050_armor_plate_iron_r03.png
070_accessory_necklace_gold_r02.png
080_hair_front_bob_black_r02.png
090_weapon_front_longsword_iron_r01.png
```

### Suggested project directory

```text
paperdoll_knight/
│
├── master/
│   ├── knight_master_r001.plp
│   ├── knight_master_r002.plp
│   └── knight_master_r003.plp
│
├── reference/
│   ├── knight_anchor_grid_1024.png
│   ├── knight_base_reference.png
│   └── knight_alignment_notes.txt
│
├── source/
│   ├── hair/
│   ├── clothes/
│   ├── armor/
│   ├── footwear/
│   ├── accessories/
│   └── weapons/
│
├── export/
│   ├── body/
│   ├── hair/
│   ├── clothes/
│   ├── armor/
│   ├── footwear/
│   ├── accessories/
│   └── weapons/
│
├── previews/
│   └── knight_full_iron_set_r003.png
│
└── manifest/
    └── knight_equipment.csv
```

This compensates for PixelLab's weaker internal organizational tools by making the filesystem itself the authoritative asset database.


## Practical PixelLab workflow

### Build a permanent alignment reference

Create one image called something like:

```text
knight_anchor_grid_1024.png
```

It can contain:

```text
       │ centerline
───────┼────── eye line
       │
───────┼────── shoulder line
       │
───────┼────── waist
       │
───────●────── foot / global anchor
```

Import this into every master or leave it permanently in the paperdoll PLP project. PixelLab has a grid tool, but an explicit guide image gives you predictable custom landmarks that survive between sessions. Community documentation confirms the built-in grid and layer locking functions; using both together is safer than relying on freehand placement. citeturn1search6turn10search2

Keep the guide locked and hidden during final exports.

### Establish the base body first

Import the final naked/base body as your permanent geometry reference.

Do not start fitting clothes until the base body has its final:

- size;
- rotation;
- position;
- limb proportions;
- head position;
- and canvas anchor.

Once those change, every equipment layer becomes suspect.

Use PixelLab's **Relative Position** tools whenever possible to center the body predictably instead of eyeballing a finger drag. Community PixelLab documentation describes both Position and Relative Position controls and indicates the latter provides directional/centering alignment controls. citeturn1search6

Lock the base when alignment is complete.

### Import equipment at final scale whenever possible

PixelLab can resize imported objects, but repeated raster rescaling is undesirable. Raster editors must recalculate pixels during transforms; Photopea's documentation illustrates the general problem by noting that repeatedly shrinking and enlarging an ordinary raster layer loses image information, whereas a smart object retains its source. PixelLab does not advertise an equivalent nondestructive Smart Object system, so minimize repeated resizing. citeturn8search8

Best practice:

```text
Source equipment
      ↓
resize once to master scale
      ↓
import into PixelLab
      ↓
position
      ↓
avoid further scale changes
```

If every incoming PNG is already full-canvas and correctly aligned, importing becomes dramatically easier: import → center → verify.

### Use contiguous blocks instead of folders

Since true folders/groups are not a dependable PixelLab feature, simulate them through layer order:

```text
TOP / FOREGROUND
┌─────────────────────────────────┐
│ 090 weapon_front               │
│ 085 hand_front                  │
│ 080 hair_front                  │
│ 075 accessory_front             │
│ 060 armor                       │
│ 050 clothing                    │
│ 040 body                        │
│ 030 hair_back                   │
│ 020 cape_back                   │
│ 010 weapon_back                 │
│ 000 GUIDE — LOCKED / NO EXPORT  │
└─────────────────────────────────┘
BOTTOM / BACKGROUND
```

PixelLab's layer interface supports ordering and locking according to the available community guide. citeturn1search6

Reserve wide numeric gaps—10, 20, 30 rather than 1, 2, 3—so you can later insert intermediate slots without renumbering everything.

### Treat merge as destructive

PixelLab supports merging according to community documentation and there are dedicated tutorials for it, but once logically separate paperdoll elements have been rasterized together, recovering them individually may be impractical. citeturn4search4turn1search6

Therefore:

```text
GOOD:
master_r007.plp       ← intact independent objects
export_temp_r007.plp  ← temporary copy for flattening/experiments

BAD:
master.plp            ← merge body + armor + hair here
```

Never merge the only master.

### Masking and cutouts

For fitting clothes around arms, PixelLab's erase/mask tools can be useful, and both community material and tutorials demonstrate PixelLab masking/erasing workflows. citeturn1search6turn4search0

However, for paperdolls it is often more robust to use **layer ordering and asset splitting** instead of destructive masking.

Example: instead of erasing a sword to make it appear partly behind the body:

```text
sword_back.png  → blade / handle portions behind torso
BODY
sword_front.png → handguard / blade portions above torso
```

This makes the equipment reusable and prevents arm/weapon intersections from depending on a permanent erase.

### Pixel-perfect placement

PixelLab is not a dedicated pixel-art editor. Its grid helps visually, but the most deterministic strategy is to eliminate manual positioning wherever possible.

For each imported full-canvas equipment PNG:

1. Confirm the imported image has the same W×H as the project.
2. Keep scale at exactly 100% if the source is already correct.
3. Use the centering/relative-position controls rather than dragging.
4. Lock it once aligned.
5. Toggle visibility rapidly against the body to check for drift.
6. Temporarily reduce the equipment opacity to 40–60% to compare landmarks.
7. Check at high zoom around eyes, shoulders, wrists, waist, knees, and feet.
8. Restore 100% opacity before saving.

PixelLab community documentation describes opacity, zoom, grid, locking, Position, and Relative Position controls, supporting this workflow. citeturn1search6

For genuine 1-pixel art, a purpose-built pixel editor such as Pixel Studio is safer because Pixel Studio explicitly targets pixel art, layers, and animation, whereas PixelLab's official description positions it as a general photo/text/compositing editor. citeturn3search0turn5view2


## Sample tutorial with multiple equipment layers

This example assumes a **1024×1024 canvas only for demonstration**. It is not a universal recommendation.

We will create:

```text
Body
Hair Back
Blue Tunic
Iron Chest Armor
Leather Boots
Gold Necklace
Hair Front
Iron Sword Back
Iron Sword Front
```

That gives seven logical equipment items and nine render images including split components.

### Prepare the master

Create a new 1024×1024 project.

Set the background to transparent. Community PixelLab documentation describes a Transparent background option and PNG/JPG export options, while the official listing confirms PixelLab can remove backgrounds and export the result. citeturn1search6turn5view2

Import:

```text
000_GUIDE.png
```

Assume the guide has:

```text
center = x512
feet   = y920
```

Lock it.

### Import the body

Import:

```text
040_body_base_default_main_r03.png
```

Center it using Relative Position.

Verify:

```text
head center      = guide centerline
shoulders        = guide shoulder line
pelvis           = guide centerline
feet             = y920
```

Lock the body.

### Add hair behind the body

Import:

```text
030_hair_bob_black_back_r02.png
```

Move it beneath Body.

Long hair behind the shoulders belongs here.

Layer stack:

```text
040 BODY
030 HAIR BACK
000 GUIDE
```

### Add the tunic

Import:

```text
050_clothes_tunic_blue_main_r04.png
```

Place it above Body.

Temporarily set opacity around 50% and inspect:

```text
neck opening
shoulder seams
waist
arm openings
```

Do not resize independently once aligned unless the design is actually incorrect.

### Add chest armor

Import:

```text
060_armor_plate_iron_main_r03.png
```

Place it above the tunic.

Check that the armor's neck opening and armholes correspond to the body, not merely to the tunic. This prevents later clothing variants from changing the armor's fundamental fit.

### Add boots

Import:

```text
065_feet_boots_leather_main_r01.png
```

The boot sole should meet the same foot baseline used by the body.

If one boot appears to float by a few pixels, correct the equipment layer rather than moving the global body.

### Add necklace

Import:

```text
070_accessory_necklace_gold_main_r02.png
```

Place it above armor if it should visibly sit on top of the chestplate, or below the armor if only part should emerge.

This is why a slot-based z-order is preferable to arbitrary import order.

### Add the sword

A sword crosses the character's silhouette, so split it:

```text
010_weapon_longsword_iron_back_r01.png
090_weapon_longsword_iron_front_r01.png
```

Place:

```text
090 SWORD FRONT
...
040 BODY
...
010 SWORD BACK
```

The back image can contain the blade section traveling behind the body; the front image contains the sections that should cover the hand/torso.

Both images retain the same 1024×1024 canvas and same anchor.

### Add front hair

Import:

```text
080_hair_bob_black_front_r02.png
```

Place it above the body/head and usually above most helmet-independent clothing.

Final example stack:

```text
FRONT
│
├── 090 weapon_longsword_iron_front
├── 080 hair_bob_black_front
├── 070 accessory_necklace_gold
├── 065 feet_boots_leather
├── 060 armor_plate_iron
├── 050 clothes_tunic_blue
├── 040 body_base
├── 030 hair_bob_black_back
├── 010 weapon_longsword_iron_back
└── 000 GUIDE [LOCKED, HIDE ON EXPORT]
│
BACK
```

### Perform an alignment audit

Before export:

```text
✓ guide hidden?
✓ all equipment exactly 1024×1024?
✓ no accidental scaling?
✓ body still on original anchor?
✓ hair front/back line up?
✓ sword front/back overlap seamlessly?
✓ feet hit baseline?
✓ transparent edges clean?
✓ exported preview matches PixelLab view?
```

Save:

```text
knight_master_r008.plp
```

PixelLab's official listing confirms projects are intended to be saved and reopened, and the current release specifically references PLP saving. citeturn5view2turn5view3


## Exporting, variants, performance, and troubleshooting

### Transparent PNG export

For each runtime item:

1. Open the PixelLab master.
2. Set the project background to Transparent.
3. Hide the guide.
4. Hide the body unless the body itself is being exported.
5. Hide every equipment layer except the required one.
6. Use Export Image / Save as Image.
7. Select PNG.
8. Set the output dimensions to exactly the master dimensions.
9. Save.
10. Verify transparency against both a dark and light background.

PixelLab's official listing confirms export at user-selected resolution and background removal/transparency support, while community material describes a Transparent background selector and PNG export. citeturn5view2turn1search6

PNG is well suited because it stores alpha transparency losslessly. citeturn7search4turn7search13

### PixelLab-only pseudo-batch export

There is no verified stock PixelLab 2.1.9 equivalent to "Export All Layers as PNG." Therefore the safest PixelLab-only method is repetitive visibility isolation:

```text
HIDE ALL
   ↓
SHOW armor_iron
   ↓
EXPORT PNG
   ↓
HIDE armor_iron
SHOW armor_gold
   ↓
EXPORT PNG
   ↓
...
```

Use a written checklist so nothing is omitted:

```text
[✓] body_base
[✓] hair_black_back
[✓] hair_black_front
[✓] tunic_blue
[✓] armor_iron
[ ] armor_gold
[ ] boots_leather
[ ] necklace_gold
[ ] sword_back
[ ] sword_front
```

This is tedious but deterministic.

### Faster mobile export with ibisPaint

ibisPaint is particularly attractive as an export helper because its official manual has a literal **"Save Layer as Transparent PNG"** command. It also supports named layers, layer folders, folder transforms, clipping, and transparent-canvas saving. citeturn9search0turn2search15turn2search18turn9search9

A hybrid workflow is:

```text
PixelLab
 design / composite / fit
        ↓
transparent aligned PNGs
        ↓
ibisPaint layered master
        ↓
Save Layer as Transparent PNG
```

For dozens of assets, that is generally more pleasant than repeatedly changing every PixelLab layer's visibility.

### True batch-oriented workflow with Photopea

Photopea is the strongest browser-based mobile companion. It has conventional folders, layer naming, layer locks, raster/vector masks, guides/snapping, artboards, scripting, and explicit Export Layers functionality. Its official NFT workflow demonstrates **File → Export Layers** creating a ZIP of generated layer combinations, while artboards can also be batch exported into a ZIP. citeturn8search0turn8search3turn2search20turn8search4turn2search26

A production team with hundreds of combinations could therefore use:

```text
PixelLab mobile authoring
       ↓
PNG assets
       ↓
Photopea PSD master
       ↓
folders by equipment slot
       ↓
File → Export Layers / combinations
       ↓
ZIP
```

Photopea's combination exporter is almost conceptually identical to paperdoll equipment generation: its own example describes multiple bodies, hats, and glasses being turned into every combination. citeturn8search0

### Variant naming

Never encode variant meaning only as "copy 1", "copy 2".

Prefer:

```text
armor_plate_iron_a_r01.png
armor_plate_iron_b_r01.png
armor_plate_gold_a_r01.png
armor_plate_mithril_a_r02.png

hair_bob_black_r01.png
hair_bob_brown_r02.png
hair_bob_blonde_r01.png
```

Separate these concepts:

```text
item     = plate
material = iron
style    = a
revision = r03
```

`revision` means the file changed.

`variant` means the game offers a different item/appearance.

Do not confuse them.

### Revision strategy

Use monotonically increasing master versions:

```text
knight_master_r001.plp
knight_master_r002.plp
knight_master_r003.plp
```

Do **not** use:

```text
final.plp
final2.plp
final_really_final.plp
```

Keep export revisions synchronized when geometry changes. For example, if the body's shoulders move in `master_r012`, every shoulder-dependent shirt and armor should be considered potentially stale.

### Performance and file-size tradeoffs

Full-canvas transparent PNGs trade storage efficiency for exceptional simplicity.

**Advantages:**

- zero alignment metadata;
- identical pivots;
- easy PixelLab import;
- easy game-engine composition;
- very low chance of one asset drifting relative to another.

**Disadvantages:**

- more transparent pixels stored;
- larger PNGs than tight crops in many cases;
- larger decoded bitmap dimensions;
- greater editor memory consumption.

PNG compression reduces on-disk cost, but Android still normally decodes `ARGB_8888` images to four bytes per pixel in memory. citeturn7search15turn7search3

For a small project, choose full-canvas exports.

For hundreds/thousands of game assets, consider trimming them in a downstream build process **after** authoring, while generating an offset/pivot manifest automatically.

That gives you both:

```text
AUTHORING:
simple full-canvas files

RUNTIME:
trimmed / packed / optimized sprites
```

### Common failures and fixes

| Problem | Likely cause | Fix |
|---|---|---|
| Helmet shifts between variants | Each PNG cropped differently | Export every variant at same canvas size |
| Sword cannot pass behind and in front | Single render image | Split into `weapon_back` and `weapon_front` |
| Clothing slowly drifts | Finger repositioning | Center with Relative Position; lock after alignment |
| Equipment gets blurry | Repeated scaling | Resize once; avoid shrink/enlarge cycles |
| White/black box around item | Background was not transparent | Set transparent canvas and export PNG |
| Color fringe around transparent edge | Imperfect background removal | Clean edge/mask; inspect on dark **and** light backgrounds |
| Guide appears in game | Guide left visible during export | Mark `NO_EXPORT` and hide before every export |
| Can't organize 50+ objects | PixelLab lacks robust folder hierarchy | Numeric slot ordering; split project; or move master to ibisPaint/Photopea |
| Can't recover separated equipment | Layers were merged | Reopen versioned pre-merge PLP |
| Export looks softer than editor | Output resolution changed | Explicitly export at master W×H in PNG |
| App becomes unstable on huge project | Too many large decoded bitmaps | Reduce canvas size / split masters / export slot families separately |

The memory explanation is particularly important: Android explicitly warns that bitmaps can exhaust an app's memory budget, and a 4-byte-per-pixel representation means a handful of 4K layers can consume hundreds of megabytes before app overhead is considered. citeturn7search0turn7search15

There are also recent anecdotal PixelLab reviews reporting degraded-looking output on some devices. That is not sufficient evidence of a general export bug, but it reinforces the need to verify exported dimensions and inspect actual PNGs rather than assuming the gallery preview is correct. citeturn5view3


## Alternative mobile workflows and source guide

### Mobile app comparison

| Workflow | Paperdoll advantages | Disadvantages | Best use |
|---|---|---|---|
| **PixelLab Android** | Fast imports, easy compositing, position/relative position, locking, simple transparency, PLP projects | Weak grouping; limited advanced snapping; no verified batch layer export; masks less sophisticated | Fast Android-first paperdoll authoring |
| **ibisPaint** | Real layer folders, naming, folder transforms, clipping, grid, **Save Layer as Transparent PNG** | More painting-oriented UI; individual-layer export still involves selecting layers | Best PixelLab companion for clean layer management/export |
| **Photopea in browser** | PSD structure, nested folders, masks, guides/snapping, Smart Objects, scripts, Export Layers, artboards, ZIP exports | Desktop-like UI can feel cramped on a phone; browser workflow | Best for batch/export automation and large libraries |
| **Krita Android** | Professional groups, masks, transforms, robust layer system, open `.kra` master | Android version remains beta and is aimed at tablets/Chromebooks, not phones; heavier resource requirements | Best on Android tablet for serious asset production |
| **Pixel Studio** | Purpose-built pixel-art editor, layers, animation, sprite-oriented tools | Less suited to high-resolution illustration/photo compositing; layer batch export is not its strongest point | Best when "paperdoll" literally means pixel-art sprites |

ibisPaint's advantages above are directly documented in its official tutorials: folders, folder transforms, layer naming, clipping, grids, and transparent layer export are all supported. citeturn2search15turn2search18turn9search0turn2search0turn9search9

Photopea's documentation explicitly supports folders, masks, locking, PSD preservation, scripting and batch-like layer/artboard exports. citeturn8search3turn2search20turn8search1turn8search0turn8search4

Krita has a full professional layer/mask architecture and current Android builds, but Krita's July 2026 release notes still label Android **beta, tablets only**; its download page recommends at least 4 GB RAM. citeturn2search1turn2search7turn12search6turn12search0

Pixel Studio is specifically marketed as a pixel-art editor with layer and animation support, making it more appropriate than PixelLab when nearest-pixel editing is the core requirement. citeturn3search0turn3search8

### Recommended workflow by project size

For **roughly 5–30 equipment assets**, PixelLab alone is reasonable:

```text
PixelLab PLP master
       ↓
visibility-isolated PNG export
       ↓
game/app
```

For **roughly 30–200 assets**, I would use:

```text
PixelLab for creation
       ↓
ibisPaint for structured layer export
       ↓
game/app
```

For **large combinatorial libraries**, use:

```text
PixelLab or ibisPaint creation
           ↓
Photopea PSD master
           ↓
folders:
body/
hair/
clothes/
armor/
weapon/
accessory/
           ↓
Export Layers / scripted combinations
           ↓
ZIP + manifest
```

Photopea's own Export Layers example is especially relevant because it automatically combines slot folders such as bodies, hats, and glasses—essentially the same combinatorial problem as a game paperdoll. citeturn8search0

### Key sources

The most useful PixelLab-specific sources I found are:

- [PixelLab – Text on pictures, official Google Play listing](https://play.google.com/store/apps/details?id=com.imaginstudio.imagetools.pixellab) — current Android application, capabilities, developer support, official tutorial link. citeturn5view2
- [Official PixelLab tutorial playlist linked by the developer](https://www.youtube.com/playlist?list=PLj6ns9dBMhBL3jmB27sNEd5nTpDkWoEET) — original Imagin Studio tutorials. citeturn5view0turn5view2
- [PixelLab current version / recent community feedback on AppBrain](https://www.appbrain.com/app/pixellab-text-on-pictures/com.imaginstudio.imagetools.pixellab) — verifies 2.1.9 and contains recent requests for grouping and better snapping. citeturn5view3
- [PixelLab grid-tool tutorial](https://www.youtube.com/watch?v=jummNCGt-FE) — practical community explanation of the grid. citeturn10search2
- [PixelLab multiple-layer editing tutorial](https://www.youtube.com/watch?v=7FsU0ka9S2U) — community material about working with multiple layers without simply flattening them. citeturn0search27
- [PixelLab layer-merging tutorial](https://www.youtube.com/watch?v=hWjYy5XRxSg) — useful mainly for understanding what **not** to do to the only paperdoll master. citeturn4search4

For the recommended companion workflows:

- [ibisPaint: Save Layer as Transparent PNG](https://ibispaint.com/lecture/index.jsp?lang=en&no=32) — unusually well matched to equipment-layer export. citeturn9search9
- [ibisPaint: Layer Folders](https://ibispaint.com/lecture/index.jsp?lang=en&no=135) — proper hierarchy unavailable in the same form in PixelLab. citeturn2search15
- [Photopea: Layers and folders](https://www.photopea.com/learn/layers) — nested folders, locks, visibility, names, and positioning. citeturn8search3
- [Photopea: Export Layers / combinations](https://www.photopea.com/tuts/generate-nft-combinations-online/) — directly applicable to paperdoll asset combinations. citeturn8search0
- [Photopea: Masks](https://www.photopea.com/learn/masks) — true nondestructive raster/vector layer masks. citeturn2search20
- [Krita Android download/status](https://krita.org/en/download/) — current Android availability and resource expectations. citeturn12search0
- [Android Developers: bitmap memory](https://developer.android.com/develop/ui/views/graphics) — explains why very large multi-layer PixelLab documents can become expensive in RAM. citeturn7search0
- [W3C PNG specification](https://www.w3.org/TR/png-3/) — authoritative basis for using PNG as the transparent lossless interchange format. citeturn7search13

The resulting production rule is straightforward: **author every wearable in one coordinate system, preserve that coordinate system through full-canvas transparent PNGs, treat layer order as explicit data, split equipment whenever occlusion requires front/back rendering, save immutable PLP revisions, and move the final batch-export stage outside PixelLab once the asset library becomes large.** That approach works around PixelLab's organizational limitations while retaining the parts of the Android app that are genuinely strong: fast compositing, convenient positioning, transparent raster assets, and lightweight mobile editing. citeturn5view2turn1search6turn9search9turn8search0