# Research Spike: Ultima Online Paperdolling Architecture & Workflow

## Purpose

This research investigated how **Ultima Online's Classic Client handles wearable equipment and paperdolling**, from both an art-production and engine perspective.

The main questions were:

- How are wearable sprites authored?
- How are paperdoll graphics related to world graphics?
- How does the engine know where and how to draw equipment?
- How are equipment layers ordered and hidden?
- How does animation synchronization work?
- What information does the server send?
- Is Ultima Online doing anything fundamentally different from traditional sprite paperdolling?
- What lessons are useful for implementing a modern equivalent?

The investigation used the official Ultima Online documentation, ClassicUO source code, ServUO documentation/community research, UOFiddler behavior, and modern examples of layered sprite-character systems.

---

# 1. Overall conclusion

Ultima Online uses a **traditional layered sprite paperdoll system**.

A character is constructed from a base body plus separate equipment sprites drawn over it.

The unusual part is not the core rendering technique. What makes UO interesting is the infrastructure around it:

- Separate static paperdoll and animated world representations.
- ID-based relationships between items, paperdoll images and animations.
- Explicit equipment layers.
- Custom visual ordering instead of simple numeric slot order.
- Explicit clothing-coverage rules.
- Client-side visual assembly from server equipment state.
- Asset-remapping files that allow graphics and animations to be substituted.

So UO is best described as:

> **Traditional sprite paperdolling backed by a relatively sophisticated asset-ID and compatibility system.**

---

# 2. Two separate visual systems

An equipped item can have two completely different visual representations.

## Paperdoll UI

The character window uses **static artwork**.

The client draws:

1. Static character body.
2. Shirt.
3. Pants.
4. Armor.
5. Cloak.
6. Hair.
7. Helmet.
8. Other equipment.

Each piece is a transparent image aligned to the same character template.

The official UO documentation confirms that this paperdoll is an interactive representation of the character used for equipping and removing items through drag-and-drop.

## In-world character

The character seen walking around the game world uses a separate set of **animated equipment sprites**.

For example, a robe requires images corresponding to the body's:

- standing frames
- walking frames
- attacking frames
- casting frames
- directional views
- other supported actions

The world robe animation must visually match the naked body's animation.

The paperdoll image does **not** become the world sprite.

This distinction is one of the most important architectural findings.

---

# 3. Required artwork for a traditional UO wearable

A completely new wearable historically requires several assets.

### Inventory/world item artwork

A static representation used when the object exists:

- on the ground
- inside a backpack
- inside containers

This is associated with the item's **ItemID**.

### Paperdoll artwork

A static transparent image showing how the item looks when worn.

Traditionally there are separate ranges for:

- male paperdoll equipment
- female paperdoll equipment

### Animated wearable artwork

A sprite animation set used when the character is visible in the game world.

Community UOFiddler workflows explicitly connect:

- `art.mul`
- `tiledata.mul`
- `gumpart.mul`
- `anim.mul`

when constructing custom wearable equipment.

This means a fully original wearable can be substantially more expensive to produce than its single paperdoll image would suggest.

---

# 4. Paperdoll positioning

UO's paperdoll does **not** use:

- bones
- attachment points
- skeletal transforms
- runtime deformation
- procedural garment placement

Instead, positioning is baked directly into the artwork.

Every wearable image is authored against the same paperdoll body template.

Conceptually:

```text
body.png
shirt.png
pants.png
armor.png
cloak.png
helmet.png
```

All images share a common coordinate space.

The engine can therefore draw them at effectively the same origin.

The transparent pixels surrounding the garment preserve its correct position relative to the body.

This is traditional sprite paperdolling.

### Implication for artists

An equipment sprite should not simply be tightly cropped around the visible garment unless the asset system separately stores the crop offset.

The positioning information is effectively part of the image.

---

# 5. ItemID versus AnimID

One of the most important pieces of UO's asset architecture is the distinction between the object's **ItemID** and its wearable **AnimID**.

## ItemID

Represents the actual item graphic used for the world/container object.

Example:

```text
ItemID -> sword sitting on ground
```

## AnimID

Represents the appearance associated with the item when it is equipped.

Conceptually:

```text
ItemID
   ↓
tiledata
   ↓
AnimID
   ├── animated equipment
   └── paperdoll equipment
```

This allows gameplay objects and wearable visual appearances to remain separate.

---

# 6. Paperdoll gump ID convention

Classic UO historically uses predictable ID ranges for wearable paperdoll images.

The relationship is:

```text
Male paperdoll graphic
= AnimID + 50000

Female paperdoll graphic
= AnimID + 60000
```

ServUO/UOFiddler documentation confirms these equipment ranges and their connection to `AnimID`.

This is an example of UO's unusually rigid **ID-driven asset pipeline**.

Rather than every item storing arbitrary paths such as:

```text
shirt_male.png
shirt_female.png
```

the appropriate graphics can often be derived from numeric IDs.

---

# 7. TileData as the connection layer

`tiledata.mul` contains metadata associated with item graphics.

For wearable equipment, important information includes concepts such as:

```text
ItemID
Layer
AnimID
Wearable
PartialHue
```

### Layer

Determines the logical equipment slot.

Examples include:

- shirt
- pants
- shoes
- helmet
- gloves
- cloak
- robe
- arms
- torso
- necklace
- bracelet
- earrings
- hair
- beard
- backpack

### AnimID

Connects the item to its wearable visual representation.

### Wearable

Indicates that the item can participate in the equipment system.

### PartialHue

Determines how hue recoloring interacts with the artwork.

UOFiddler exposes these relationships when editing custom equipment.

---

# 8. Equipment slots are not the same as rendering order

A particularly important discovery is that UO does **not** simply draw equipment according to its numeric equipment-layer value.

There are two separate ideas:

```text
Equipment slot
≠
Visual rendering order
```

The equipment slot answers:

> Where is this item logically equipped?

The rendering system answers:

> Which sprite must appear in front of which other sprite?

These do not always match.

Examples include interactions between:

- shoes and pants
- robes and torso equipment
- tunics and belts
- necklaces and robes
- helmets and neck equipment
- cloaks and other garments

ClassicUO therefore contains explicit paperdoll ordering logic rather than relying solely on the slot enumeration.

This is an important lesson for designing a modern paperdoll engine.

---

# 9. Clothing coverage and occlusion

Layer ordering by itself is not always sufficient.

Imagine:

```text
undershirt
armor
full robe
```

Even if the robe renders last, parts of the armor sprite might extend outside the robe and remain visible.

UO therefore also uses **coverage logic**.

Conceptually:

```text
if robe covers torso:
    don't render torso garment
```

rather than:

```text
draw torso
draw robe over torso
```

This prevents hidden garments from leaking outside the silhouette of outer clothing.

A modern equivalent could represent this explicitly:

```text
robe:
    covers:
        - shirt
        - torso_armor
        - waist
```

This is one of the more sophisticated parts of UO's paperdoll implementation.

---

# 10. World sprite paperdolling

The in-world system follows the same overall paperdoll concept, but every layer is animated.

Conceptually:

```text
body[action][direction][frame]

shirt[action][direction][frame]

armor[action][direction][frame]

weapon[action][direction][frame]
```

At runtime:

```text
draw body frame 4
draw shirt frame 4
draw armor frame 4
draw weapon frame 4
```

All components must use the same:

- animation/action
- direction
- frame index

This is the key requirement that keeps all clothing synchronized.

Modern sprite paperdoll systems use essentially the same technique.

---

# 11. Directional rendering

UO characters use directional sprite animation.

Rather than store completely unrelated animation logic for every piece of equipment, equipment uses the same character state as the body.

For example:

```text
Body:
walk east
frame 3

Armor:
walk east
frame 3

Sword:
walk east
frame 3

Hair:
walk east
frame 3
```

Some opposite directions can be obtained by mirroring stored sprites rather than storing every compass direction independently.

This reduces artwork somewhat, but each wearable still needs a substantial number of frames.

---

# 12. Direction-dependent layer ordering

Layer order can change depending on which direction the character faces.

A cloak is a good example.

When the character faces toward the camera, part of the cloak may logically appear behind the body.

When facing away, the cloak may need to appear over more of the body.

Therefore:

```text
render order(direction)
```

can differ.

This is more advanced than a simple system where every equipment slot always has one fixed `z_index`.

A modern paperdoll engine should allow direction-dependent ordering if characters use strongly directional top-down or isometric artwork.

---

# 13. Frame origins and alignment

Animated sprite frames may have different dimensions.

Therefore the system needs an origin or center reference so that changing frames does not make equipment jump around.

The basic requirement is:

```text
body frame origin
equipment frame origin
```

must refer to the same character-space location.

UOFiddler's animation tooling also preserves centering information when extracting and importing frames, illustrating how important stable animation alignment is to UO assets.

This is effectively the animated equivalent of using a shared canvas origin for static paperdoll art.

---

# 14. Sitting and unusual poses

Complex poses expose the biggest weakness of traditional sprite paperdolling.

Sitting, for example, may substantially change:

- leg position
- robe silhouette
- cloak position
- torso overlap
- chair occlusion

Long garments are particularly difficult.

UO contains special handling for some unusual animation and orientation cases because a single generic layer order cannot correctly solve every pose.

This is one reason large traditional paperdoll systems tend to accumulate visual exceptions over time.

---

# 15. Hue and recoloring

UO supports color variation without requiring completely separate artwork for every color.

Items include a hue value.

The client applies that hue while rendering.

The system can also distinguish artwork intended for full or partial hue treatment.

This allows one garment asset to produce many color variants.

Conceptually:

```text
robe sprite
+
hue 42
=
blue robe
```

rather than maintaining dozens of separately colored robe sprite sheets.

This is directly relevant to modern grayscale/tint-mask workflows.

---

# 16. Server versus client responsibility

The server does **not** need to transmit finished character images.

Instead, it transmits equipment state.

A UO equipment packet identifies information such as:

- item
- graphic
- equipment layer
- wearer
- hue

The UO protocol's `0x2E` packet is the server equipment-item packet.

The client then resolves the appropriate local artwork.

Conceptually:

```text
SERVER

player
  helmet = item 123
  shirt = item 456
  hue = 31

        ↓ network

CLIENT

ItemID
  ↓
TileData
  ↓
AnimID
  ↓
paperdoll / animation assets
  ↓
render
```

This is a clean separation.

### Server responsibilities

The server handles:

- what is equipped
- which equipment slot it occupies
- equipment validity
- ownership
- item properties
- hue/state replication

### Client responsibilities

The client handles:

- visual asset lookup
- animation lookup
- paperdoll composition
- layer ordering
- occlusion
- hue rendering

This architecture also means customized shards historically needed players to have compatible client assets.

---

# 17. Paperdoll interactivity

The paperdoll is not merely a preview image.

Individual visual equipment pieces remain associated with their actual item objects.

This allows interaction such as:

- dragging equipment off the body
- dropping equipment onto the body
- examining properties
- selecting items
- double-clicking items

Official documentation describes drag-and-drop dressing and undressing directly through the paperdoll.

Small accessories such as rings are difficult to select directly on the character, so UO also provides dedicated equipment-slot UI areas.

ClassicUO similarly contains explicit interactive equipment-slot controls.

---

# 18. Asset remapping

UO includes definition files capable of redirecting asset IDs.

Important examples include:

```text
Body.def
Bodyconv.def
Equipconv.def
gump.def
```

These allow existing graphics or animations to be reused instead of requiring entirely new animation sets.

This is useful for custom shards.

For example:

```text
new sword ItemID
    ↓
custom paperdoll image
    ↓
reuse existing sword animation
```

rather than redrawing every sword movement frame.

UOFiddler itself understands files including `body.def`, `bodyconv.def`, `equipconv.def`, and `gump.def`.

---

# 19. Traditional custom-wearable workflow

A typical historical UO custom wearable workflow looks approximately like this:

### Step 1 — Choose a new ItemID

Allocate an unused object graphic ID.

### Step 2 — Add inventory artwork

Create the static appearance used on the ground and in containers.

### Step 3 — Choose an AnimID

Allocate or reuse an equipment animation identity.

### Step 4 — Create paperdoll artwork

Create equipment images aligned to the paperdoll body.

Traditionally:

```text
male = AnimID + 50000
female = AnimID + 60000
```

### Step 5 — Create or reuse animation

Either:

- import a completely new equipment animation

or:

- redirect the new wearable to an existing animation.

### Step 6 — Configure TileData

Assign:

```text
Layer
AnimID
Wearable flags
Hue-related behavior
```

### Step 7 — Create the server item

Define the actual gameplay object and its equipment restrictions.

### Step 8 — Deploy assets

Clients need the required artwork locally.

Community UOFiddler guides describe essentially this workflow.

---

# 20. MUL versus UOP assets

Older UO tooling commonly discusses files such as:

```text
art.mul
artidx.mul
gumpart.mul
gumpidx.mul
anim.mul
tiledata.mul
```

Newer clients may instead package equivalent resources inside UOP archives.

UOFiddler recognizes both older MUL assets and newer resources such as:

```text
artLegacyMUL.uop
gumpartLegacyMUL.uop
animationframe*.uop
```

The storage format changed, but the underlying conceptual relationships remain similar.

---

# 21. What was actually nontraditional?

The rendering technique itself is traditional.

The noteworthy engineering around it includes:

### ID arithmetic

Paperdoll artwork can be derived automatically from equipment animation IDs.

### Asset indirection

Gameplay ItemIDs and wearable AnimIDs are separate.

### Explicit occlusion

Outer garments can suppress underlying sprite layers.

### Direction-sensitive ordering

Some equipment changes depth depending on character orientation.

### Asset remapping

New equipment can reuse existing animation resources.

### Network separation

The server transmits equipment state while the client constructs the visual character.

These are refinements to traditional paperdolling rather than a fundamentally different character-rendering technique.

---

# 22. Biggest weaknesses of the UO approach

## Art workload

Completely original animated equipment can require a large number of frames.

The multiplication is roughly:

```text
equipment
× actions
× directions
× animation frames
```

A large wardrobe therefore becomes expensive.

## Strict alignment

Every layer must align precisely with the base body animation.

One incorrectly positioned frame produces visible jitter.

## Clothing conflicts

Garments overlapping other garments require explicit rules.

## Special poses

Sitting and unusual animations create many exceptions.

## Legacy asset complexity

Numeric IDs, remapping files and fixed ranges make the pipeline harder to understand than a modern resource-based system.

---

# 23. Strengths of the architecture

Despite its age, several ideas remain very good.

### Equipment state is independent of appearance

The game can change visual assets without redesigning gameplay equipment logic.

### Layers are modular

Individual pieces can be replaced independently.

### Network traffic remains small

Equipment IDs are transmitted rather than rendered images.

### Hue reuse reduces artwork

One garment can support many colors.

### Animation synchronization is conceptually simple

All visible layers share:

```text
action
direction
frame
```

### Asset reuse is possible

New items can reuse an existing wearable animation.

---

# 24. Modern equivalent architecture

A modern implementation should preserve the useful concepts while avoiding UO's legacy numeric conventions.

For example:

```text
WearableDefinition

slot
paperdoll_sprite
world_animation
hue_mode
covered_slots
draw_order
body_compatibility
```

Paperdoll rendering:

```text
draw body

for item in visual_order:
    if item.slot is covered:
        continue

    draw item.paperdoll_sprite
```

World rendering:

```text
draw body[action][direction][frame]

for item in visual_order(direction):
    if item.slot is covered:
        continue

    draw item[action][direction][frame]
```

The engine therefore only needs one authoritative character state:

```text
action
direction
frame
equipment
```

Every visual layer follows it.

---

# 25. Modern sprite-paperdoll examples

Modern engines still use essentially the same technique.

## Godot

Richard Gameworks' modular Godot character system uses multiple `AnimatedSprite2D` layers and synchronized animation state for character parts such as armor, weapons and hair. Its repository explicitly describes a **multi-layered sprite system with synchronized animations**.

This is conceptually very close to UO's world-character paperdolling, only implemented using modern engine resources instead of UO's legacy asset IDs.

## Unity

DirePixel's Paper Doll for Unity is designed for characters composed of multiple sprite layers such as:

- skin
- hair
- eyes
- clothing

and supports swapping compatible sprite sheets while retaining shared animation behavior.

The accompanying tutorial is also a useful visual demonstration of traditional sprite paperdolling:

**Paper Doll for Unity | How to Use — DirePixel**.

---

# 26. Recommended lessons to take from UO

For a new system, retain:

```text
equipment state
    separate from
visual representation
```

Use synchronized layered sprites:

```text
body
hair
shirt
pants
armor
weapon
```

with one shared:

```text
animation
direction
frame
```

Also support:

```text
slot
visual order
covers_slots
tint mode
```

as separate concepts.

Avoid reproducing UO's reliance on arbitrary numeric offsets and long lists of graphic-specific exceptions unless compatibility with old UO assets is required.

A resource-driven modern implementation is significantly easier to maintain.

---

# Final conclusion

Ultima Online did not invent a fundamentally different form of paperdolling.

At the visual level, it is the classic technique:

```text
base body
+ transparent equipment layers
+ synchronized animation frames
```

What made UO's implementation sophisticated was everything surrounding that basic idea:

```text
ItemID
→ metadata
→ equipment slot
→ AnimID
→ paperdoll art
→ animation art
→ hue
→ ordering
→ coverage rules
```

Its strongest architectural idea is the separation between **gameplay equipment state** and **client-side visual composition**.

Its biggest cost is the traditional weakness of sprite paperdolling: every truly unique animated wearable has to remain aligned with a large set of body animation frames.

For a modern game, the best approach is therefore to copy UO's **data separation, synchronized animation and explicit coverage/order concepts**, while replacing its legacy ID conventions with straightforward resource definitions.
