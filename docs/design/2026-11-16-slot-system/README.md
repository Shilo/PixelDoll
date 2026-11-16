# Slot system workshop

November 16, 2026. **Proposal awaiting interactive review, not an approved implementation.** No production slot, runtime, export, or generation behavior changes in this package.

- [Design and implementation plan](plan.md): slot inventory, identity, settings, anchors, layers, export contract, phased delivery and acceptance checks.
- [Research spike](research.md): what the sources establish, what the MMO inventory survey does not establish, and remaining evidence gaps.
- [Validation and council review](validation.md): checks, limitations, dissent and decisions to discuss after trying the workshop.
- [Interactive workshop](prototype/index.html): sample-only Wardrobe, slot manager, settings and export comparison. Uses existing fixture artwork and Bronze UI. No PixelLab calls or real character storage.

## Starting recommendation

Show Head, Hair, Face, Chest, Hands, Legs, Feet, Back, Main hand and Off hand. Keep Facial hair, Outerwear, Waist, Neck and Shoulders built in but initially hidden. This is a defensible starting design, not a measured ranking of popularity.

Use readable permanent keys, not opaque IDs and not mutable names. Keep one existing runtime manifest rather than encoding rendering in folder suffixes. Start the workshop with fixed built-ins, copy-to-customize and only-empty hiding, matching the user's conservative preference. Compare more permissive alternatives before choosing production scope.

Underwear is deliberately unresolved: the council disagrees about whether a combined hidden built-in is useful when standard bases already have baked underwear. Try none, combined and split. The demo does not generate or remove any base clothing.

## Run locally

From the repository root:

```powershell
python -m http.server 5198 --bind 127.0.0.1
```

Open `http://localhost:5198/docs/design/2026-11-16-slot-system/prototype/`. Dependencies already installed in `app/node_modules` supply the real Bronze UI styles; do not install another UI kit. For a portable, self-contained version, run `node docs/design/2026-11-16-slot-system/prototype/bundle.mjs` and open the generated `workshop.html`. The bundle embeds the same styles and sample PNGs and makes no network requests.

`review-frame.html` is the generated conversation-frame edition, with transparent outer background and fixed dialog bounds for a content-sized host. It follows the host color preference rather than offering a separate theme toggle. Regenerate both HTML files whenever the source changes; do not hand-edit the bundles.

## Try these scenarios

1. Add a custom Quiver starting with Back. Edit the creative template, anchor and depths. These settings are stored in the example, but only baseline foreground depth affects its illustrative preview. Add a sample record, equip it, rename it and inspect Export lab. New records have no generated art.
2. In Export lab, remember a game call. Rename its slot using editable built-ins or a custom slot. Compare readable-key mode with name-reference mode. Local references can be rewritten; already shipped game calls cannot.
3. Hide an empty Face slot. Try hiding a populated Head. Compare blocking, collapsed categories and the hidden group. Equipment remains unchanged in every policy. Delete sample items in Wardrobe to test becoming empty, then Undo.
4. Hide Neck if necessary and create custom Neck with a different key. Try showing both. Does the key disambiguation feel understandable, or should the product forbid duplicate display labels?
5. Move rows using handles and Move up/down. Verify that the character does not change. Try a phone-sized viewport and keyboard controls. Physical touch thresholds still need device testing.
6. Compare fixed built-ins with customize-in-place and Reset. Try changing an anchor on a populated slot: existing art does not retarget. Is that limitation clear enough?
7. Switch Underwear to one or two hidden slots. Decide whether this earns permanent catalog and prompt maintenance rather than being a custom use case.
8. Compare manifest, folder-depth suffix and loose PNG exports. Download the clearly marked example JSON. It is intentionally partial and cannot be loaded as a production PixelDoll export.

## Boundaries

This is a workflow prototype, not generation evidence or canonical renderer parity. Its stage paints existing foreground sheets in baseline depth order only. It does not simulate background splits, hair tucking, directional overrides, held padding, masks, rig changes or advanced generation. No paid tests are necessary to discuss the design, but supported production behavior must later pass offline fixture and cross-engine tests.

Changes elsewhere in the working tree belong to other work and are not part of this package.
