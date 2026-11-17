# Modular visual slots: proposed contract

**Status:** design proposal, November 16, 2026. Prototype approval is not implementation approval. The existing production schema and runtime remain authoritative until a scoped implementation lands.

## 1. What a slot means

A slot is an independently swappable visual asset category for one frozen character. One selected asset can depict two gloves or two boots and can contain several rendering layers. A slot is not a stat inventory position, a skeleton joint, a single PNG layer or a physical object count.

The base body is a required system layer. Pets, mounts and independently animated companions are separate entities, not equipment slots. A decorative animal painted into an equipment sheet is still ordinary artwork.

Use 64 px as a discussion baseline and check 48, 64, 96 and 128 px before making production promises. No measured pixel-width threshold currently justifies automatically excluding jewelry or combining limbs.

### Inclusion rule

- **Shown built-in:** recognizable independent dressing choice, useful without setup, with a qualified generation and rendering profile.
- **Hidden built-in:** equally supported behavior, narrower need. Hiding is not permission to ship an unsupported profile.
- **Custom:** project-specific independent separation using supported behavior. A label cannot invent joints, animation, canvas space or clipping semantics.
- **Outside scope:** invisible stat inventory and separate entities. A visibly oversized ring is valid artwork, but that alone does not justify a permanent Ring preset.

Do not claim these rules establish which categories are statistically most common. No usage census was performed.

## 2. Built-in catalog and prototype defaults

Keep current readable keys while presenting clear labels. Cosmetic cleanup does not justify rekeying exports. `arms` means Hands in the UI; `torso_inner` now means Body. Call the frozen character Base in user-facing equipment discussion to distinguish it from the Body slot. Existing values below come from `app/src/lib/items/items.ts` SLOTS and slotLadder. Underwear is a new prototype proposal, not an existing qualified production profile.

| Label       | Permanent key | Initially | Class | Authoring anchor | Foreground z | Background z |
| ----------- | ------------- | --------- | ----- | ---------------- | ------------ | ------------ |
| Head        | `head`        | Shown     | rigid | head             | 130          | none         |
| Hair        | `hair`        | Shown     | rigid | head             | 110          | 5 effective  |
| Face        | `face_acc`    | Shown     | rigid | head             | 120          | none         |
| Body        | `torso_inner` | Shown     | worn  | neck             | 40           | none         |
| Hands       | `arms`        | Shown     | worn  | hand_r           | 70           | none         |
| Legs        | `legs`        | Shown     | worn  | hip              | 30           | none         |
| Feet        | `feet`        | Shown     | worn  | foot_r           | 20           | none         |
| Back        | `back`        | Shown     | worn  | neck             | 90           | 4            |
| Main hand   | `main_hand`   | Shown     | held  | hand_r           | 150          | 1 baseline   |
| Off hand    | `off_hand`    | Shown     | held  | hand_l           | 140          | 2 baseline   |
| Facial hair | `facial_hair` | Hidden    | rigid | head             | 100          | none         |
| Outerwear   | `torso_outer` | Hidden    | worn  | neck             | 60           | none         |
| Waist       | `waist`       | Hidden    | worn  | hip              | 50           | none         |
| Neck        | `neck`        | Hidden    | rigid | neck             | 80           | none         |
| Shoulders   | `shoulders`   | Hidden    | worn  | neck             | 65           | none         |
| Underwear   | `underwear`   | Hidden    | worn  | hip              | 15 proposed  | none         |

The body is z10. Hair declares bg3 in SLOTS but the current unconditional ladder override resolves it to 5. Both held background layers become z5 for south, southeast, east, west and southwest. For original non-mirrored west, southwest and northwest, off-hand foreground becomes z155; its background is ordered above the main-hand background (6 for west/southwest and 2 for northwest). Preserve source-facing and mirroring semantics rather than flattening these into one depth.

Head clips Hair; Head and Face have band behavior. Other band, cut, hide, tuck and QA behavior is currently distributed across code keyed by built-in ID. The table is not a complete reusable profile implementation.

Anchors available today: `head`, `neck`, `hip`, `hand_l`, `hand_r`, `foot_l`, `foot_r`. Hands and Feet anchors do not mean the paired asset contains only the right limb. The current worn pipeline handles the full frame. Validate asymmetrical custom cases before promising arbitrary anchor combinations.

### Scope and clothing ownership

Body and Legs are separate slots and separate layers, both shown by default. Body accepts upper-body clothing, including sleeves, or a complete outfit. Legs accepts independently swappable lower clothing. Body always draws above Legs in the default clothing profile, so a long shirt overlaps pants. Equipping either never clears the other. Full-body artwork can cover a Legs selection without deleting it; pants wider than the covering garment may remain visible. This is a composition limit, not a reason to remove Legs or create a replacement system.

Hands includes gloves, gauntlets and their forearm extent. Pants and shoes remain independently swappable as Legs and Feet. A custom Sleeves slot is legitimate if a project actually swaps sleeves separately. Outerwear accepts a jacket, robe or full outer costume in one selected asset. Underwear accepts a top, bottom or combined set in one selected asset. Additional independent outer/under tops or bottoms require custom slots, not more hidden built-ins. No automatic clearing or multi-selection cells are proposed.

Back covers capes, backpacks and quivers as item types. Create another Back-like slot only when simultaneous independent equipment is wanted. No generic Accessory built-in: an accessory still needs a behavior and location.

No dedicated built-ins initially: Ring/Finger, Earrings, Wrists/Bracelet, Hair accessory, separate Eyes, separate Bag/Quiver/Cape, Tabard, Sleeves, Outerwear top/bottom, Underwear top/bottom, Tail and Wings. Glasses already fit Face; bags, quivers and capes already fit Back. Use custom slots only when separate independent selection is needed. Full outfits belong in Body; a separate custom costume slot remains possible if independently needed. Custom does not certify assets: wings may exceed the canvas, tails may need foreground/background parts, and full outfits can cross current clipping bands. Broader padding, articulation or multi-region extraction requires real work, not merely a renamed profile.

No built-in stat-only Ammo, Trinket, Relic, Pocket, Soul crystal, Ability or Totem. A visible charm, pouch or lantern can use a custom visual slot. Two-handed is behavior, not another equipment category.

### Underwear and universal coverage

The corrected baseline is ten shown and six hidden, including one combined Underwear slot. Earlier council proposals to remove Legs, add two selection cells per category or split underwear by default do not describe the user's design and are rejected for this prototype.

Underwear uses `underwear`, worn, hip, provisional z15, no background. Body and Outerwear keep neck as their existing authoring anchor, not a literal new chest bone. The hip/pelvis starting anchor does not confine Underwear to the lower body or prove a combined set will generate correctly. All three clothing profiles need coverage-aware offline extraction checks before production supports arbitrary full-body art. Prompt templates are a design tool, not a substitute for those checks.

Default clothing depth, back to front: Base z10, Underwear z15, Legs z30, Body z40, Outerwear z60. Other slots retain the table's positions. Nude bases make removable underwear useful. On a clothed Base, the slot remains usable but cannot remove baked clothing. Pajamas, swimwear and undershirts may be main clothing or underclothing depending on the intended independent selection. The category does not prescribe the garment's style or gender.

### Accessory as a custom-slot starting option

**User-approved direction after Sol and Opus review:** keep quick custom-slot creation. The name field has the placeholder **Accessory** and is optional. Leaving it blank creates **Accessory**, then **Accessory 2**, **Accessory 3**, using the next available name under the character's case-insensitive naming rules. Suggest a unique readable key once, such as `accessory` or `accessory_2`. This is not an eleventh shown built-in or another hidden preset. Once created, it appears as a shown custom slot. The starting catalog remains ten shown and six hidden.

Do not require a region picker or template choice before creation. The generic starting behavior is worn clothing using Body's authoring anchor, with a distinct default drawing position **above Body and Legs, below Outerwear, Hair and held items**. Describe it as **Over basic clothing**. It does not share Body's exact depth and does not draw above everything. Keep drawing order adjustable. Exact numeric depth and deterministic ties must be resolved during profile implementation, independently of Wardrobe order.

Optional copying from another slot can still supply its supported settings. Hands means worn glove/wrist behavior, not a held weapon; Back includes its background split. A name alone never selects different behavior. For example, typing Wings does not automatically change the drawing position or supply wing animation. Do not add specialized suggestion chips or additional built-ins for this decision.

A brooch may belong above clothing, a ribbon below a hat, and a bracelet below a sleeve. The default is a starting point, not a promise of correct overlap. Outerwear can cover an accessory; the prototype should explain that through the layer setting and preview rather than silently moving it above everything. Advanced depth changes cannot repair missing front/back artwork or every directional overlap. Artwork may extend beyond its authoring region, but unrestricted generation coverage is not yet proven.

One slot still selects one item. A ribbon and bracelet need separate custom slots to swap independently, or one coordinated asset. The name does not supply attachment behavior. Under the readable-key recommendation, renaming Accessory to Brooch changes its label, not `equip('accessory', item)` or the `items/accessory/` folder. Drawing rules go in the existing export manifest, not a layer suffix. Another custom slot needs a different key.

Accessory is a general fallback, not a claim about the most-common missing category. Sol favored Hair accessory as a specific independent addition; Opus noted that Head already covers it unless it must swap separately alongside headgear. Both favored Accessory for unnamed creation and a position over basic clothing rather than the highest layer. Neither established category frequency. Wings remains custom, not a hidden built-in.

This approves the design direction, not production implementation or new rendering capability. Custom profiles must first work consistently across generation, quality checks and exports. The workshop's Add slot and Start with controls only approximate this flow; blank-name fallback and the revised default depth have not been implemented or tested. Leave the current demo unchanged for this documentation-only update.

## 3. Identity without opaque IDs

**Recommended:** each character has a unique, permanent, readable key plus an editable display label. Built-in identity is its existing key. Custom creation suggests a lowercase key once, such as `quiver` or `neck_custom`, then freezes it. No UUID or extra identity database is required.

The API stays simple: `equip('quiver', itemId)`. Renaming Quiver to Arrows changes only the label; game code, outfit references and paths stay valid. The readable key is a stable ID in plain language. Avoid describing it as extra machinery when references already require identity.

Name-only references remove one field but add transactional rename work across items, outfits, jobs, mappings and exports. External game calls and old file paths cannot be repaired by the app. Case-insensitivity solves only spelling collisions, not identity. The prototype rewrites its own references to illustrate the problem; it cannot update a shipped game.

### Collision policy to test

Keys must be unique across all slots, including hidden built-ins. Hiding never frees identity. Custom keys cannot take `neck` while the Neck definition exists.

The recommended simple production rule is unique case-insensitive trimmed display labels per character, with an offer to Show or Customize existing Neck. The prototype also allows a custom Neck label beside a hidden built-in under another key, then permits showing both with key badges. This intentionally more permissive comparison tests the user's exact replacement scenario. It is not the settled naming policy. Duplicate labels complicate menus, exports and assistive announcements even if keys are technically sound. The prototype suggests numeric suffixes such as `neck_2`; `neck_custom` is another valid user choice, not a second required naming convention.

Deleting and recreating a key deliberately rebinds that API name to a new category; the prototype allows this and reports only whether the slot key exists, not whether an old item call remains compatible. Production deletion must disclose that consequence. Permanent means unchanged during the slot's lifetime, not a claim of eternal tombstone reservation. Tombstones are not proposed for v1.

Normalize and validate portable keys, reject path traversal, separators, reserved Windows device names and case collisions. Do not derive paths from arbitrary labels. The demo's limited key validator is not production path-hardening. Reuse actual repository key validation where appropriate and add only missing portability rules. Names remain ordinary text, never executable prompts or markup.

## 4. Built-ins, custom slots and modularity

Separate immutable factory definitions from per-character slot configuration, items and Wardrobe organization. Built-ins cannot be deleted; custom slots can. Reset restores a factory configuration without deleting generated items or silently changing selections. Restore organization separately from restoring behavior so users know what changes.

Two approaches are deliberately available:

1. **Fixed built-ins, copy to customize:** smaller supported surface and consistent named presets. Copies need their own keys, and copy settings only, not generated items. The user must understand why there are two similar categories.
2. **Customize in place + Reset:** avoids replacement copies and naming conflicts. Store a resolved per-character copy; a future factory update must not silently alter existing art. Built-in identity stays fixed, but its label/profile can differ. More support and validation cost.

Start production conservatively with fixed built-ins unless user testing shows copy friction outweighs the benefit. The workshop exposes advanced settings on custom slots and optionally built-ins because the user asked to test that depth. Do not implement a live `like` reference that silently changes every copy when its source changes. Store origin for provenance/reset and resolved behavior for predictability.

**Required refactor before production custom slots:** route every slot-ID-specific generation, anchor, hand, band, clipping, QA and runtime decision through explicit supported profile fields. Current `handOf`, held attachment, bandOf and special prompt checks do not magically work for a new ID. Copying Off hand today can incorrectly fall into right-hand logic. Test canonical and native exports together. Modular means one behavior resolver shared by consumers, not an abstract plugin framework or unbounded arbitrary bones.

## 5. Settings and their consequences

| Setting                     | Ordinary or advanced       | Effect                                                                                                   |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| Label                       | Ordinary, custom initially | UI label only; key and pixels unchanged                                                                  |
| Wardrobe order              | Ordinary                   | Browsing only, never rendering or equal-z tie order                                                      |
| Shown/hidden                | Ordinary                   | Organization only; no unequipping or export loss                                                         |
| Start with profile          | Creation                   | Copy supported resolved defaults, no item duplication                                                    |
| Behavior: worn/rigid/held   | Advanced experiment        | Generation/extraction topology; existing items require refit/reprocess, not relabel                      |
| Authoring anchor            | Advanced experiment        | Future generation/positioning hint; existing baked frames do not retarget                                |
| Creative prompt template    | Advanced experiment        | Future generation only; insert `{{description}}`; protected extraction/hold wording stays app-controlled |
| Foreground/background depth | Advanced                   | Changes compositing of existing layers; preview, cancel and undo required                                |
| Direction/context overrides | Advanced prototype data    | Needed for full overlap fidelity; raw JSON is a comparison instrument, not final casual-user UX          |
| Delete                      | Custom only                | Confirm affected assets/outfits/jobs; offer reassign or safe removal, never silent loss                  |

The prototype stores editable settings but does not prove every combination can generate. Anchor and behavior changes on populated slots are deliberately visible experiments; production must either lock them until empty or require explicit refit with affected-item count and paid-cost disclosure if applicable. A paid call must never be implied by moving, renaming or hiding a slot.

No arbitrary new skeleton bones in v1. New joints require tracks across moves and directions; a string is not animation data. Baked exports do not need authoring anchor names to animate equipment, but they still require pivots and offsets. A future skeletal runtime would have a different explicit contract.

## 6. Organization, hiding and input

Visibility and order persist per character, including project save/share as appropriate; they are not runtime equipment state. Do not impose one app-wide custom-slot list on unrelated characters.

Baseline: only empty slots can hide. Empty means no existing, draft, generating or uncertain-result item on this character. Unequipped is not empty. Saved outfits and pending jobs must not become unreachable. Unfitted shared library items do not count. Explain why hiding is blocked and provide the item count. Do not force users to delete valuable art merely to tidy a sidebar; test alternatives first.

Alternatives preserve all selections and exports:

- **Collapsed bottom:** populated hidden categories move below visible categories, collapsed. Risk: many collapsed groups create another long list and obscure the order users set.
- **One hidden group:** bottom entry shows category and equipped counts and allows restore. Stronger decluttering but lower explicitness. Equipped summary remains visible so hidden does not mean unworn.

The manager always exposes all built-ins and custom slots, even when every Wardrobe category is hidden. Hide never becomes renderer visibility or export exclusion. For only-empty hiding, importing/fitting into a hidden category must auto-show it with feedback; jobs reserve visibility before generation begins.

Use dedicated handles, not draggable expand headers. Prototype thresholds: 6 CSS px mouse, 8 touch, provisional not validated constants. Only handles suppress touch scrolling; ordinary rows remain scrollable. Pointer cancellation and Escape cancel, Move up/down gives a keyboard/non-drag path, and focus must follow the moved row. Edge autoscroll needs a continuous loop, not merely pointer-move events, in production. Touch long-press delay is unresolved; do not claim desktop emulation validates physical touch behavior.

Render order is independent: canonical depths plus overrides and deterministic tie order retained in rendering data. Do not use current Wardrobe array position or locale-dependent name sorting as the production tiebreak. The demo retains a creation ordinal independent of key, label and browsing order for its illustrative foreground preview. Its body participates at z10.

## 7. Export contract

**Choose one `manifest.json` as the source of runtime truth**, using the existing PixelDoll manifest architecture and canonical export generators, not a second slot-only runtime schema. Read `docs/architecture/javascript-runtime.md` before implementation. Do not infer the full runtime schema from this design's table or sample download.

Proposed structure, filenames illustrative:

```text
character/
  manifest.json
  body/...png
  layers/
    head/helmet_steel/...png
    quiver/leather_quiver/...png
  project.json                 # only in editable-project delivery, proposed split
  Godot-or-Phaser-or-Unity files generated by the chosen export
```

Use stable slot keys as folder segments, readable immutable item keys as the next segment, and manifest-declared asset paths. Labels do not rename folders. Actual current engine archive layouts remain unchanged until separately implemented. Authoring `project.json` is a proposed separation, not an assertion that current exports already strip prompts. Avoid adding it if the existing project format already carries the necessary fields cleanly.

### Runtime vs authoring vs organization

| Data                                                                             | Engine-ready runtime                           | Editable project |
| -------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------- |
| Slot/item keys, item selection/outfits as supported                              | Yes                                            | Yes              |
| Sheet paths, layer cells, dimensions and padding, body-relative pivots/offsets   | Yes                                            | Yes              |
| Directions, mirrored-source semantics, animation names, frames, timing and loops | Yes                                            | Yes              |
| Foreground/background depths and contextual overrides, deterministic tie order   | Yes                                            | Yes              |
| Existing hide, cut, tuck and material/palette data needed by renderer            | Yes                                            | Yes              |
| Label                                                                            | Optional display metadata, not identity        | Yes              |
| Generation template and authoring anchor                                         | Not required for baked playback                | Yes              |
| Wardrobe order, hidden state, factory provenance/reset data                      | No rendering effect; omit from minimal runtime | Yes              |
| Tokens or credentials                                                            | Never                                          | Never            |

Export should include every generated item promised by that export, regardless of category organization. Selection controls what is equipped, not whether hidden categories' assets disappear. Preview and exports must resolve the same canonical rendering rules.

### Why not `back__z90/`?

A numeric suffix can describe one baseline, not background splits, directional held-item overlap, mirrored source, pivots, masks or timing. Changing depth renames paths and creates name parsing rules. It also conflates human organization with compositing. It is acceptable as a debug label or consumer-authored convention, not PixelDoll's authoritative contract.

### Can metadata be optional?

- **Raw PNG export:** descriptor can be omitted only with an explicit loss-of-contract warning. The consumer supplies ordering, pivots, timing and everything else. Never rely on filesystem enumeration. This is loose artwork, not guaranteed runtime parity.
- **PNG + JSON:** manifest required for the promised interoperable playback behavior.
- **Godot, Phaser, Unity:** generated assets/runtime must include the same resolved data, whether a JSON manifest is loaded or equivalent constants are embedded. Engine import order is not a fallback renderer.
- **Aseprite:** document layer order can represent a particular flattened view; animation tags and ordering must be generated explicitly. A layer list alone cannot promise all dynamic per-facing runtime behavior. Use canonical resolved frames when needed and preserve a descriptor for reconstructable paper-doll data.

Existing `pixeldoll/3` is not automatically extensible by adding unrecognized runtime semantics. Reuse optional supported fields for harmless display metadata; introduce an explicit version/capability decision when render meaning changes. Reject unsupported formats clearly. No compatibility shim or migration is requested. Do not add a generic arbitrary `metadata` bag without an actual consumer; future fields can be documented when needed.

## 8. Delivery phases after prototype review

1. **Approve policies:** inventory, label collisions, fixed vs editable built-ins, hiding and Underwear. Record dissent and explicitly selected scope.
2. **Profile resolver and proof:** inventory ID switches; centralize only necessary behavior, preserve built-in output; offline fixture tests for copied off-hand, paired limbs, multi-region garments, cape plus quiver and tie ordering.
3. **Project model and manager:** persistent per-character keys, labels, order and visibility; atomic rename/delete/job checks; keyboard and pointer interactions; no generation changes yet.
4. **Generation integration:** protect extraction prompts, define supported anchors/classes and edit/refit rules; verify offline first; propose any necessary paid A/B separately.
5. **Runtime/export integration:** one canonical data resolver across browser and native exports; generated artifact parity checks, portable paths and clear raw-PNG limitations.

Prove identity rename with a unit test: item/outfit references and export keys unchanged. Prove wardrobe reorder leaves a resolved draw-order snapshot unchanged. Prove empty semantics across jobs/drafts/outfits, duplicate keys/labels and populated deletion recovery. Extend relevant existing UI specs for controls, then full required checks once production behavior is complete. This docs/static-prototype package does not warrant running the production app suite.

## 9. Questions to discuss after trying it

Does the frozen key feel simpler than repairing names everywhere? Is a second Neck label worth ambiguity, or is customizing Neck in place clearer? Are advanced controls empowering or mostly a way to request unsupported art? Does empty-only hiding make users delete work just to organize? Does the universal Body/Outerwear/Underwear description make the separate Legs choice clear? Should Outerwear/Waist remain immediately discoverable because they are reachable in today's grouped Chest interface?

These are real disagreements, not council consensus disguised as implementation requirements.
