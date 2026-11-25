# PixelLab public features: paperdolling, equipment slots, batch item generation

Accessed 2026-11-24. Public sources only. No PixelLab calls, no token use, no app changes.
Every claim below is first-party public unless marked otherwise. "Not publicly documented" means I found no public statement, not that the capability is absent.

Hypothesis under test (owner's, secondhand): PixelLab publicly documents a paperdoll system that batch-generates several items for a specific animation, with items on separate slots/positions, and warns that overlapping items can be drawn wrong.

Verdict: **the hypothesis is not supported by any public source I could find.** PixelLab publicly documents per-item _workflows_ (edit/inpaint one item at a time), outfit transfer onto one animation, character "states", and multi-object candidate sheets. It does not document equipment slots, per-animation item layers, or overlap warnings for equipment.

## 1. Is there a public paperdoll / slot / equipment system?

**No. Not publicly documented.** There is no paperdoll, equipment-slot, wardrobe, or layered-character feature in any of:

- `https://www.pixellab.ai/llms.txt` (generated from the live API; 0 hits for paperdoll/paper doll/equipment/layer; outfit appears only as "transfer outfit")
- `https://api.pixellab.ai/v2/openapi.json` (140 paths; `paperdoll` 0, `paper doll` 0, `equipment` 1, and that one hit is the Transfer Outfit "use cases" list)
- the docs nav (`https://www.pixellab.ai/docs`): 60 doc links, none for outfits, equipment, layers, wardrobe or slots. There is one "Transfer outfit (Pro)" page, one "Try on" page, one "Multi image" page.
- `https://api.pixellab.ai/mcp/docs`: 0 hits for paperdoll/paper doll/equipment/wardrobe/costume; `clothing` 1 hit, `armor` 8, all in prompt/reference examples.

Concrete evidence that "slots" in PixelLab's public language mean something else:

| Public phrase                                          | Source                                                            | What it actually means                 |
| ------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------- |
| "the reference uses one slot"                          | `openapi.json`, `/transfer-outfit-v2`                             | one cell of a packed generation grid   |
| "wooden inventory slot with metal corners"             | `openapi.json`, `/generate-ui-v2`                                 | a UI element to draw                   |
| "1 frees you to fill a slot the moment one opens"      | `https://api.pixellab.ai/mcp/docs`, `wait_for_jobs`               | a GPU concurrency slot                 |
| "every direction in its own slot"                      | `https://www.youtube.com/watch?v=OND5ExBdajQ` description         | one animation job per facing direction |
| "the remaining slots are generated from `description`" | `openapi.json`, `Create1DirectionObjectRequest.item_descriptions` | cells of a multi-object candidate grid |

Does it generate per animation? Only as a **flat reskin of that animation**, via Transfer Outfit:

> "The Transfer Outfit tool applies an outfit from a reference image to all frames of an animation. Use it to change a character's clothing across an entire animation sequence."
> `https://www.pixellab.ai/docs/tools/transfer-outfit-pro`

Limits on the same page: "Minimum 2 animation frames required", "Available in Aseprite and Pixelorama extensions only", and a frame/price table (32-64px: up to 15 frames, 10 generations; 81-128px: up to 3 frames, 10; 129-170px: 15; 171-256px: 25). The API version says "Supports 2-16 frames per request" and lists "Apply armor/clothing to walking animation", "Transfer weapon or equipment to action sequence" (`openapi.json`, `/transfer-outfit-v2`). The output is one composited image per frame. Nothing separates the outfit into layers.

Does it warn about overlaps? **Not for equipment.** See section 4 for the two public statements that come closest, both in marketing Shorts, not in docs.

## 2. Is there public batch generation of multiple items in one call?

Partly, but not as layers for one character. Three distinct public meanings of "batch":

**(a) Many frames or directions per call, one price.** Transfer Outfit, Edit Animation (Pro), Edit Image (Pro), animate-with-text-v3, UI Pro grids. The public unit is frames/directions, priced by the whole packed grid, not the count:

> "Reskin an existing animation with the outfit from a reference image (pro). Cost: billed by the whole grid, not the frame count – 2 frames cost the same as 15 at 64x64, so batch them."
> `https://api.pixellab.ai/mcp/docs` (`transfer_outfit`)

> "Cost: by the whole grid, not the frame count – 2 frames cost the same as 16 at 64x64, so batch them. ... Frames per call: 16 up to 64px, 9 up to 80, 4 above."
> `https://api.pixellab.ai/mcp/docs` (`edit_animation`)

Directions are separate jobs, not one batch:

> "**v3** (default when no template): ... One job per direction, directions independent"
> `openapi.json`, `/characters/animations`

**(b) Several distinct objects in one object-creation call.** This is the closest public thing to "generate several items in one call":

> "Produces one or more single-direction object(s). When `size` results in more than one candidate (see the `size` parameter), the object enters `review` status and you must pick which candidates to keep..."
> `openapi.json`, `/create-1-direction-object`

> "`size`: ... The effective size also determines how many candidate objects the generator produces in one shot (≤42→64, ≤85→16, ≤170→4, else 1)."
> `openapi.json`, `Create1DirectionObjectRequest.size`

> "`item_descriptions`: Per-object descriptions when the effective size produces multiple objects. ... the remaining slots are generated from `description` instead, so they come back as extra objects in the same style rather than as variations of the items you listed."
> `openapi.json`, `Create1DirectionObjectRequest.item_descriptions`

> "Create single direction objects ... Generate multiple objects in a similar style"
> `https://www.pixellab.ai/pixellab-api`

Price is flat per call, not per object: "Object generation uses the Pro Tools and costs **10–25 generations** per call on a subscription (depending on the resulting image size)" (`openapi.json`); MCP gives the ladder "10 for 16-32; 15 for 33-42; 10 for 43-64; 15 for 65-85; 10 for 86-128; 15 for 129-170; 10 for 171-256 ... The receipt reports what was actually charged." The unit is a candidate sheet of **separate objects**, not layers of one body, and the result needs a review selection step.

**(c) Every UI element in every state, one generation.**

> "One generation draws every element in every state on one labelled grid, so a set stays consistent. Priced by that grid's side (each element plus an 18 px margin, a 24 px label per state): 10 generations up to 256 px, 15 up to 341, 25 above."
> `openapi.json`, `/ui-assets/states`

That is the only public "several items with variants in one generation" feature. It is for UI panels, not characters.

**Not publicly documented:** a single call or single queued job that returns N _transparent equipment layers_ for one character animation.

## 3. Closest public feature to the owner's description

Ranked by closeness:

1. **The 2026-11-11 "What's New" video's "every direction in its own slot"** (`https://www.youtube.com/watch?v=OND5ExBdajQ`, published 2026-11-11T07:00:31-08:00). Full description line: "Custom animation for any move you can describe, with Enhance, a starting pose, and every direction in its own slot." Chapter 1:40 "Custom animation with Enhance". The API confirms the meaning: "One job per direction, directions independent". This is a per-direction animation workflow, not equipment slots; if the owner's source was this line, it does not describe items.

2. **Transfer Outfit (Pro)** (`https://www.pixellab.ai/docs/tools/transfer-outfit-pro`). Closest on "for a specific animation": it applies a reference outfit to 2-16 frames of one clip in one call. It does not produce layers, does not take multiple items, and warns the reference should be the same character ("A different character as reference is unreliable – it can freeze the motion or barely change anything", MCP docs, `transfer_outfit`).

3. **Create Character State** (`openapi.json`, `/create-character-state`; `https://www.pixellab.ai/pixellab-api`). Publicly described as "Create a new state (outfit, pose, or variation) of an existing character"; "The same edit is applied consistently across all 4 or 8 directions." Example edit in MCP: `'wearing red armor'`. Cost: "ONE charge for the whole state — every rotation the source has, 4 or 8, is redrawn and billed together, so there is no per-direction price". Covers rotations only, no animation frames, and returns a _new character in a group_, not a layer.

4. **VFX effect layers behind/in front** (`openapi.json`, `/vfx`; MCP `vfx_workbench`; video `OND5ExBdajQ` chapter 4:47 "Effect layers: solid glow, behind or in front"). The video description says: "put each layer behind or in front of your character, and export it for your game engine." This is the only public feature with character-relative layer ordering, and it is for effects only.

5. **Pro Flash "New layer with changes"** (enum in `InpaintImageProFlashRequest.output_method`, `openapi.json`; explained at `https://www.pixellab.ai/docs/options/general`: "New layer with changes: The output is added to a new layer"). This is an editor output mode in the Aseprite plugin: the inpainted result lands on a new editor layer instead of being merged. It is not an equipment slot and carries no alignment metadata.

6. **1-direction object `item_descriptions` batches** (`openapi.json`, `/create-1-direction-object`). Several separately described objects in one cheap call, with a review step. They are unrelated objects on a candidate sheet, not worn layers.

7. **UI split template + states** (`openapi.json`, `/ui-assets/{ui_asset_id}/split` and `/ui-assets/states`). One labelled generation for every element in every state, with a ZIP that keeps elements and states in separate files. Structurally the most "slots + batch" thing PixelLab ships, but it is UI art.

## 4. Public caveats about overlap, occlusion, back layers, hiding the body

No documentation page, API description, or MCP tool text mentions equipment occlusion, draw order, back layers, or hiding the body. `openapi.json` has 0 hits for `occlu`, `overlap`, `silhouette`, `underneath`, `z-order`, `stack`.

Two first-party marketing Shorts do address it, as workflow advice:

**"Building modular clothes with PixelLab!"** (Short, published 2026-01-13, `https://www.youtube.com/shorts/1EDq2xHQcJ8`). The description publishes the exact prompt used:

> "Edit the image as a clothing overlay layer, not a character. Completely remove the character while keeping only the visible clothing pixels that exist on the outer silhouette. Do not reconstruct, infer, or complete any hidden or occluded parts of the outfit. Any area where a head, face, neck, or body would exist must be left fully empty and transparent, even if that means a hard cut-out. ... If a clothing part would normally be hidden behind the head or body, it must be omitted, not filled in. No mannequins, no ghost bodies, no implied forms, no fabric reconstruction, only the original outer clothing pixels preserved, with clean empty cut-outs where the character was."

This is the strongest public acknowledgment of the occlusion problem I found (inferred: it is a prompt in a Short, not product guidance), and PixelLab's answer there is a prompt-level rule plus manual layer extraction, not a slot system. Note it also tells the model _not_ to reconstruct hidden parts, which matches PixelDoll's independent conclusion (`docs/known-issues.md:114` on the hand covering the grip; two layers at the grip).

**"Give Your Pixel Art Character New Hair & Clothes with PixelLab!"** (Short, published 2026-10-10, `https://www.youtube.com/shorts/oVoH58n1sUA`):

> "Customize your pixel art character with PixelLab's Pro Flash inpainting tool in Aseprite. Create hair, shirts, and pants on separate layers—then clean them up and edit each piece independently."

That is the public recommended route: separate layers made by hand with inpainting, then cleaned up. No slot metadata, no per-animation batch, no automatic alignment.

**"Change your characters' outfits with PixelLab!"** (Short, published 2025-12-30, `https://www.youtube.com/shorts/XF3VEbLnWCw`) has no description beyond links; "Change Pixel Art Outfits & Poses with PixelLab" (2026-10-09, `https://www.youtube.com/shorts/VuEt8YIg43o`) says only "This tutorial shows how to change outfits, create poses, and fix character direction using Pro Flash in PixelLab." Neither adds a layer claim.

Related caveat, from a third party: "Its limits appear when a game needs category rules that the service cannot express. Exact paper-doll registration, private asset libraries, and unusual export contracts still need another layer." (`https://www.slashskill.com/ai-pixel-art-generators-compared/`, prices checked 2026-09-21, accessed 2026-11-24). Third-party opinion, consistent with the absent first-party feature.

## 5. Public statements about exporting layers separately

| Export                 | Public behavior                                                                                                                   | Source                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Character ZIP          | `rotations/`, `animations/{type}/{direction}/frame_NNN.png`, `metadata.json` with keypoints. No layer folders.                    | `openapi.json`, `/characters/{character_id}/zip`                                                  |
| Character spritesheet  | one PNG grid + layout JSON, one row per animation-direction. No layers.                                                           | `openapi.json`, `/characters/{character_id}/spritesheet`                                          |
| Character Aseprite     | "a single layer with every image as a frame, a `rotations` tag ... and one tag per animation direction"                           | `openapi.json`, `/characters/{character_id}/aseprite`                                             |
| Object ZIP / Aseprite  | same model: rotation and animation frame PNGs, one layer in Aseprite                                                              | `openapi.json`, `/objects/{object_id}/zip`, `/objects/{object_id}/aseprite`                       |
| UI asset ZIP           | keeps elements and states as separate files: `<name>/elements/<element>/<state>.png` + `metadata.json`                            | `openapi.json`, `/ui-assets/{ui_asset_id}/zip`                                                    |
| VFX game pack          | "one spritesheet per piece (the whole effect, behind and in front of the sprite, each part) + manifest.json with where each goes" | `openapi.json`, `/vfx` (`game_pack`); MCP `vfx_workbench` "--game-pack adds a ZIP of every piece" |
| Aseprite plugin output | "New layer with changes: The output is added to a new layer."                                                                     | `https://www.pixellab.ai/docs/options/general`                                                    |

So the only public exports that preserve separate named pieces are UI assets and VFX game packs. Characters and objects export as one layer, or as separate files per state, never per equipment piece.

## 6. Sources that failed or do not exist

- `https://www.pixellab.ai/llms-full.txt`: HTTP 404 on 2026-11-24.
- `https://www.pixellab.ai/changelog`, `/blog`, `/pricing`: HTTP 404. No public changelog, blog, or pricing page exists at those paths; `https://www.pixellab.ai/sitemap.xml` lists 33 URLs and none of them is a changelog, blog or pricing page. Per-endpoint prices are published on `https://www.pixellab.ai/pixellab-api`.
- YouTube caption tracks: the signed `timedtext` URLs returned HTTP 200 with a 0-byte body for `OND5ExBdajQ` (2026-11-11 video), so no transcripts were read. Titles, descriptions, chapters and publish dates were readable.
- X / `@PixelLabAI`: not retrievable without an authenticated session; searches for `site:x.com` posts returned nothing usable. Nothing from X is cited here.
- Discord announcements: not indexed by the search tools used; no public announcement text found or cited.
- `https://www.pixellab.ai/docs` has no page for outfits, equipment, states, layers or slots; any such feature would have to be undocumented.

Search methods used: direct fetch of docs, llms.txt, OpenAPI JSON, MCP docs, sitemap and marketing pages; full-text scans of the OpenAPI JSON and MCP docs for paperdoll/equipment/layer/batch/slot/occlusion terms; the channel's public videos, shorts and in-channel search; web searches for third-party 2026 writeups and X/Discord mentions.

## 7. What this means for PixelDoll

**We can claim:**

- PixelLab publicly documents the per-item, manual route: inpaint or edit one garment at a time with Pro Flash, keep hair, shirt and pants on separate layers, clean each piece up by hand (`oVoH58n1sUA`), and use a published "clothing overlay layer" prompt that explicitly forbids reconstructing occluded clothing (`1EDq2xHQcJ8`). PixelDoll automates exactly that gap.
- PixelLab publicly documents per-animation outfit replacement (Transfer Outfit, 2-16 frames, one call) and per-character outfit/pose variants (Create Character State, one charge for all 4 or 8 rotations). Both return composites or new characters, not layers.
- PixelLab's public batching is frames, directions, object candidates or UI states, priced by the packed grid rather than by count. Nothing public offers several equipment layers for one move in one job.
- PixelDoll's independent conclusions about occlusion (the frozen body's hand stays over the grip, so a held item is two layers at the grip, `docs/known-issues.md:114`) match the only first-party public acknowledgment of the problem I found, which is a prompt in a marketing Short rather than a product guarantee.

**We cannot claim:**

- That PixelLab "has a paperdoll system", "equipment slots", "layers per slot", or that it batch-generates items for a specific animation. Those are not publicly documented.
- That PixelLab warns users that overlapping equipment can be drawn wrong. No docs or API text says this; the closest evidence is a Short's prompt telling the model to omit occluded parts.
- That PixelLab exports separate equipment layers for characters. Its character exports are explicitly single-layer (Aseprite) or per-state directories (ZIP).
- Any pricing or behavior of a private/beta feature. If the owner's secondhand source saw such a thing behind sign-in, it is not public and should not be cited as public capability.

**Falsification note for the brief's question 3/4:** since no public multi-item-per-animation call exists, a paid test cannot be designed against a documented endpoint. The cheapest public probe would be a single Transfer Outfit or Create Character State call on stored frames, not a paperdoll batch endpoint.
