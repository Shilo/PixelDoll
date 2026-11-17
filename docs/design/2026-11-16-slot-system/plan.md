# Modular visual slots: implementation contract

**Status:** implementation authorized November 16, 2026, following the workshop. The production work is on `feat/modular-equipment-slots`. The validation record distinguishes implemented behavior from unverified generation quality.

## Production implementation scope

The user approved implementation on a dedicated branch after reviewing the workshop. Work on `feat/modular-equipment-slots`, with regular focused commits and independent Opus 5.5 medium, Sol 6.1 medium and DeepSeek V4.1 Flash low reviews. Preserve the current Studio and Bronze appearance. The prototype's policy switches, raw JSON editors and developer badges are not production controls.

Use the conservative baseline: fixed built-ins, custom copies with permanent readable keys and editable labels, only-empty hiding, per-character organization, and a separate drawing order. Accessory creation accepts a blank name without a mandatory template picker. Combine showing an existing category and creating a custom one in the same Add slot flow. Use Not shown or Show in Wardrobe for organization so it is not confused with artwork covered by another item.

Implement and validate profiles before exposing custom generation. Lock attachment/behavior changes while a slot has items or pending work; renaming and Wardrobe moves never regenerate artwork. Keep creative instructions optional and separate from protected extraction wording. Built-in defaults remain resettable only through their supported organization controls; users customize behavior through a separate custom slot. Existing populated categories remain reachable regardless of initial hidden defaults.

Work in separately verifiable stages: profile/data foundation, generation and export integration, then management UI and drag/keyboard interaction. Required proof includes rename reference stability, independent Wardrobe/drawing order, empty checks covering drafts/jobs, copied left-hand behavior, universal clothing bands, and canonical/native export agreement. Test the rendered interface with representative desktop and phone workflows in both themes. Offline checks come first. Ask the user before any necessary paid generation; neither a prototype nor a successful unit test establishes production art quality. Record unavailable visual checks and physical-touch limits honestly rather than promising zero issues.

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

## 2. Built-in catalog and production defaults

Keep current readable keys while presenting clear labels. Cosmetic cleanup does not justify rekeying exports. `arms` means Hands in the UI; `torso_inner` now means Body. Call the frozen character Base in user-facing equipment discussion to distinguish it from the Body slot. The catalog and behavior resolver now live in `app/src/lib/items/slots.ts`, re-exported by `items.ts`. Underwear is implemented as a new profile, but new AI-generated underwear quality remains unqualified.

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

Do not require a region picker or template choice before creation. The generic starting behavior is worn clothing using Body's authoring anchor, with a distinct default drawing position **above Body and Legs, below Outerwear, Hair and held items**. Describe it as **Over basic clothing**. Its depth is z55, above Waist z50 and below Outerwear z60. Equal depths use manifest slot order, never Wardrobe browsing order. Keep drawing order adjustable through Draws above, without exposing numeric depths.

Optional copying from another slot can still supply its supported settings. Hands means worn glove/wrist behavior, not a held weapon; Back includes its background split. A name alone never selects different behavior. For example, typing Wings does not automatically change the drawing position or supply wing animation. Do not add specialized suggestion chips or additional built-ins for this decision.

A brooch may belong above clothing, a ribbon below a hat, and a bracelet below a sleeve. The default is a starting point, not a promise of correct overlap. Outerwear can cover an accessory; the prototype should explain that through the layer setting and preview rather than silently moving it above everything. Advanced depth changes cannot repair missing front/back artwork or every directional overlap. Artwork may extend beyond its authoring region, but unrestricted generation coverage is not yet proven.

One slot still selects one item. A ribbon and bracelet need separate custom slots to swap independently, or one coordinated asset. The name does not supply attachment behavior. Under the readable-key recommendation, renaming Accessory to Brooch changes its label, not `equip('accessory', item)` or the `items/accessory/` folder. Drawing rules go in the existing export manifest, not a layer suffix. Another custom slot needs a different key.

Accessory is a general fallback, not a claim about the most-common missing category. Sol favored Hair accessory as a specific independent addition; Opus noted that Head already covers it unless it must swap separately alongside headgear. Both favored Accessory for unnamed creation and a position over basic clothing rather than the highest layer. Neither established category frequency. Wings remains custom, not a hidden built-in.

Production implementation was subsequently authorized on November 16, 2026. Blank-name creation, numbered repeats and this depth default are now implemented in Studio, not just the workshop. The workshop remains a historical comparison tool. See the validation record for completed checks and remaining quality limits.

## 3. Identity without opaque IDs

**Recommended:** each character has a unique, permanent, readable key plus an editable display label. Built-in identity is its existing key. Custom creation suggests a lowercase key once, such as `quiver` or `neck_custom`, then freezes it. No UUID or extra identity database is required.

The API stays simple: `equip('quiver', itemId)`. Renaming Quiver to Arrows changes only the label; game code, outfit references and paths stay valid. The readable key is a stable ID in plain language. Avoid describing it as extra machinery when references already require identity.

Name-only references remove one field but add transactional rename work across items, outfits, jobs, mappings and exports. External game calls and old file paths cannot be repaired by the app. Case-insensitivity solves only spelling collisions, not identity. The prototype rewrites its own references to illustrate the problem; it cannot update a shipped game.

### Collision policy to test

Keys must be unique across all slots, including hidden built-ins. Hiding never frees identity. Custom keys cannot take `neck` while the Neck definition exists.

Production uses unique case-insensitive trimmed display labels per character. Typing the name of a not-shown built-in offers Show instead of creating a duplicate. The prototype's hidden-label duplicate experiment is not the production policy. Duplicate labels complicate menus, exports and assistive announcements even when keys differ. Custom names produce portable readable keys once; a name without usable ASCII characters falls back to `slot`, then `slot_2`.

Deleting and recreating a key deliberately rebinds that API name to a new category; the prototype allows this and reports only whether the slot key exists, not whether an old item call remains compatible. Production deletion must disclose that consequence. Permanent means unchanged during the slot's lifetime, not a claim of eternal tombstone reservation. Tombstones are not proposed for v1.

Normalize and validate portable keys, reject path traversal, separators, reserved Windows device names and case collisions. Do not derive paths from arbitrary labels. The demo's limited key validator is not production path-hardening. Reuse actual repository key validation where appropriate and add only missing portability rules. Names remain ordinary text, never executable prompts or markup.

## 4. Built-ins, custom slots and modularity

Separate immutable factory definitions from per-character slot configuration, items and Wardrobe organization. Built-ins cannot be deleted; custom slots can. Reset restores a factory configuration without deleting generated items or silently changing selections. Restore organization separately from restoring behavior so users know what changes.

The workshop compared two approaches:

1. **Fixed built-ins, copy to customize:** smaller supported surface and consistent named presets. Copies need their own keys, and copy settings only, not generated items. The user must understand why there are two similar categories.
2. **Customize in place + Reset:** avoids replacement copies and naming conflicts. Store a resolved per-character copy; a future factory update must not silently alter existing art. Built-in identity stays fixed, but its label/profile can differ. More support and validation cost.

Production selects fixed built-ins with Make a custom copy. The workshop's in-place editing comparison is not included. Copies keep resolved settings rather than a live reference that changes when the source changes. Store origin for provenance and a separate supported behavior profile for generation.

**Implemented foundation:** generation, anchor, hand, band, clipping, QA and material defaults resolve the slot's supported profile rather than guessing behavior from a custom key. A copied Off hand retains left-hand behavior. Canonical and native exports use the resolved runtime fields, not the profile name. Modular means one behavior resolver shared by consumers, not an abstract plugin framework or unbounded arbitrary bones.

## 5. Settings and their consequences

| Setting                     | Ordinary or advanced       | Effect                                                                                                 |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Label                       | Ordinary, custom initially | UI label only; key and pixels unchanged                                                                |
| Wardrobe order              | Ordinary                   | Browsing only, never rendering or equal-z tie order                                                    |
| Shown/hidden                | Ordinary                   | Organization only; no unequipping or export loss                                                       |
| Start with profile          | Creation                   | Copy supported resolved defaults, no item duplication                                                  |
| Works like and Hand         | Custom settings            | Copies a supported profile; locked while items or attempts exist                                       |
| Creative hint               | Custom settings            | Optional plain sentence for future generation; no required placeholders or extraction instructions     |
| Draws above                 | Custom settings            | Moves foreground drawing order, including directional front offsets; background parts stay behind Base |
| Direction/context overrides | Stored profile data        | Preserved in generation/export; raw JSON is not a production control                                   |
| Delete                      | Custom only                | Confirm the count; remove category, items, colors and outfit entries together, or remove nothing       |

The prototype's unrestricted settings do not prove every combination can generate. Production locks Works like and Hand while the category contains items or attempts. A paid call is never implied by moving, renaming, hiding or editing a category. Populated deletion cannot be undone; empty deletion and ordinary organization can. There is no item reassignment or automatic refit in this release.

No arbitrary new skeleton bones in v1. New joints require tracks across moves and directions; a string is not animation data. Baked exports do not need authoring anchor names to animate equipment, but they still require pivots and offsets. A future skeletal runtime would have a different explicit contract.

## 6. Organization, hiding and input

Visibility and order persist per character, including project save/share as appropriate; they are not runtime equipment state. Do not impose one app-wide custom-slot list on unrelated characters.

Baseline: only empty slots can hide. Empty means no existing, draft, generating or uncertain-result item on this character. Unequipped is not empty. Saved outfits and pending jobs must not become unreachable. Unfitted shared library items do not count. Explain why hiding is blocked and provide the item count. Do not force users to delete valuable art merely to tidy a sidebar; test alternatives first.

Approved inline interaction supersedes the separate organizer list. The header's entire flexible label area, excluding Random and New item buttons, is a menu trigger and drag source. A click or tap opens contextual Move up/down, Hide, and custom Edit or built-in Make a custom copy actions. Keep the navigation rail and existing dressing actions. Built-in names, generation behavior and drawing settings stay fixed; organization remains editable.

An always-reachable **Add slot** action at the bottom of the navigation rail opens a small sheet. Slot name, Works like and Create slot form one top group, followed by a divider and unused built-in slots. Its name is Add slot, not Add category. Blank custom names remain Accessory without explanatory placeholder instructions. The separate organizer list and its duplicate reorder controls are removed; custom settings and deletion confirmations remain contextual sheets.

The Wardrobe ends with one full-width collapsed **Not shown (N)** disclosure. Its compact full-row actions use an eye icon, an accessible Show name and the same Bronze hover feedback as slot headers. Show appends the slot. A row may also be dragged out into a chosen shown-list position, revealing and positioning it as one undo step. The disclosure is not a drop-to-hide target: a shown slot dragged to the end stays shown, and release over the not-shown group cancels rather than hiding it. Shared-only sections are not editable categories of this character.

Mouse/pen presses become drags after 6 CSS px. Touch holds arm after 300 ms while stationary; movement exceeding 8 px before arming cancels and remains ordinary scrolling. Once armed, cancel native scrolling from the first move, even below the drag threshold; movement of 8 px begins dragging. Holding without dragging never reorders. These are initial tuning values, not user settings or proof of physical-device usability. Do not change touch-action after a touch starts or disable scrolling across the whole header.

Use natural section positions, not sticky header screen positions, for insertion geometry. Show insertion feedback without collapsing or translating complete item grids. Edge autoscroll runs continuously. Escape, capture loss, cancellation, multitouch and teardown cancel without changes; successful drag release suppresses its synthetic click. The same actions work by menu and keyboard, with focus recovery and position announcements. Browsing-only changes are undoable and never spend credits.

A floating slot label follows the pointer above the touch contact, without intercepting input. Reordering, adding and showing preserve the list's pixel scroll offset, including the offset reached by intentional edge autoscroll. The rail reports the slot actually visible after layout, not the moved slot or the previous numeric index. Focus stays on the moved header when visible, otherwise on the current visible header. New slots append with feedback rather than forcing navigation to the bottom. Natural scroll-range clamping still applies if content becomes shorter. Explicit rail navigation and item review continue to reveal their requested destinations.

Add slot and Not shown remain reachable when every slot is hidden. Hide never becomes renderer visibility or export exclusion. Importing/fitting into a hidden slot auto-shows it with feedback; jobs reserve visibility before generation begins. Physical-touch behavior remains a separately disclosed verification limit until tested on hardware.

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
