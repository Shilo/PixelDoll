# Brief: review external sprite tools for ideas (2026-10-28)

A task brief for a new session (board card "Research and test external sprite tools for PixelDoll ideas"). Nothing here
is done yet. Tools are numbered in the order they were added.

## Goal

The same goal as the 2026-10-25 to 10-27 optimization work: make PixelDoll better at what it is for. That means
accurate, consistent, high-quality paper-doll layers from PixelLab, generated faster and cheaper, with features and a
design that casual users understand. Review, research, test, compare and challenge each tool below against PixelDoll.
Take inspiration and ideas only (no code or assets), and turn the worthwhile ones into concrete improvements or fixes.

## Tools

| # | Tool | Link | What it is (as of 2026-10-28) | Why it matters to us |
|---|---|---|---|---|
| 1 | AutoSprite Wardrobe (video) | https://youtu.be/eSbOuJe7J-E | "Create New Outfits, Poses & Animations with AutoSprite's Wardrobe Feature". A commercial AI sprite tool's outfit feature. | A direct competitor to PixelDoll's dressing: compare how outfits, poses and animations stay consistent, whether items are layers or baked, cost, speed and UX. |
| 2 | Consistency characters workflow (Civitai) | https://civitai.com/models/2047895/sonsistency-characters-or-generate-characters-only-by-image-and-prompt-without-characters-lora-or-ilnoobai-edit | A node workflow by Slavikson (Illustrious / NoobAI base, v0.4 adds ControlNet OpenPose and Depth) that recreates a character from one reference image and a prompt, without a character LoRA. | Design consistency from a reference image is our core problem (one design across frames, directions and bodies; concept-image items; shared equipment). |
| 3 | PixelSprite FX, 3D to pixel art (itch.io) | https://pixelspritefx.itch.io/3d-to-pixel-art | Free, in-browser, local. Takes GLB, GLTF, FBX or OBJ (Mixamo clips). Camera presets including isometric; 1, 4 or 8 directions; every frame in the same box (no jitter); toon shading, 1 to 2 px outlines, PICO-8 / DB32 / Endesga palettes, dithering. Exports PNG sheets, a JSON atlas (Phaser, TexturePacker), GIF and frames at x1 to x8. | 3D motion as the skeleton's motion source (research §12.3, §15), stable framing, palette and outline post-processing, export formats. |
| 4 | Fantasy Character Generator (itch.io) | https://toshaangel.itch.io/fantasy-character-generator | Windows app, $24.99 (free demo). A modular paper doll rendered from Blender: 76 items, 4 bodies, up to 3 color zones per item, 40 animations x 8 directions, weapons held or stowed on hip or back, batches of random NPCs. Exports sheets, strips or frames, separate item layers, and JSON with frame size, row order, fps and feet position. | The closest paper-doll competitor: slots (cloak, travel pack and quiver together), color zones versus our ramps, stowed weapons, body variants, the animation list, export JSON (anchors), presets and random NPCs. |
| 5 | ComfyUI 2D character pipeline (GitHub) | https://github.com/mor-o/comfyui-2d-character-pipeline | Already reviewed on 2026-10-27: [paperdoll-repos-review-2026-10-27.md](paperdoll-repos-review-2026-10-27.md). | Build on that review, do not repeat it. Look for anything it missed, and test its two remaining ideas with PixelLab-allowed tools: the tight second-pass inpaint mask and a loop-seam check. |
| 6 | Skeleton Tool (satoshi-tools on lysle.net) | https://lysle.net/satoshi/skeleton, videos https://www.youtube.com/watch?v=Xdz77-Ynddw ("Generate An Entire Spritesheet from a single sprite with this Tool") and https://www.youtube.com/watch?v=PV-oXn8_EzM ("How to make a 100 pose spritesheet in under an hour") | A browser tool that rigs a single sprite with a skeleton and poses it into a whole sprite sheet. Toolbar: New, Save/Load JSON, Import/Export PNG, Export Frame, Samples. Its code is a plain ES module loaded by the page (`/satoshi/scripts/skeleton/Main.js`), so it can be read; no license is shown. | Free, deterministic posing of one drawn sprite: compare with skeleton-v3 (paid, redraws every frame), our round 8 2D cut-out retarget (`spikes/api/mocap/retarget2.mts`) and the "shift rigid items along the head track" idea. Could it pose items or bodies without paid calls, or prepare pose references for PixelLab? |
| 7 | Ultima Online paperdoll drawer (GitHub) | https://github.com/ppardalj/ultima-paperdoll-drawer-php | Already reviewed on 2026-10-27 (same review doc as tool 5): a small 2017 PHP renderer with UO layers, hue tables and race/gender art, GPL-3.0+ (ideas only). | Build on that review: its open ideas were split slots (cloak and backpack, inner and outer legs), a dye mode that keeps each material's lightness, an index sheet plus palette texture for runtime dye, and per-item draw-order exceptions. |

## Read first

- `AGENTS.md`: the constraints (client-only, only the listed PixelLab models, credits are real money, no backward
  compatibility, board rules).
- [generation-pipeline-review-2026-10-25.md](generation-pipeline-review-2026-10-25.md) §16 to §18: the item routes,
  measured fit numbers, open concerns and decisions waiting on the owner.
- [paperdoll-repos-review-2026-10-27.md](paperdoll-repos-review-2026-10-27.md): the last review, with the method to repeat
  and the open flaws and features.
- [visuals/three-ways-to-draw-an-item.html](visuals/three-ways-to-draw-an-item.html) (open in a browser): today's item
  route versus create state and edit image, step by step.
- Later cards that these tools may inform: "Make items global or per character (body templates and shared designs)",
  "Read hand, head and foot positions in engine exports", "Add more equipment slots", "Dress characters larger than
  80 px", "Replace skeleton-v3 animation for natural motion", "Make idle visibly breathe and caption idle item poses",
  "Concept-image items".

## How to work (the method that worked on 2026-10-27)

1. **One research agent per tool**, run in parallel, plus one adversarial reviewer that challenges PixelDoll itself in
   light of what the others find. Each must:
   - describe exactly what the tool does, with sources;
   - list its flaws;
   - rank what PixelDoll could adopt (where it lands in our code, feasibility within our constraints, effort, and
     whether it needs paid generations);
   - name the gaps it exposes in PixelDoll (cite file:line);
   - list what looks attractive but is wrong for us;
   - mark every claim as verified or inferred.
2. **Challenge every finding** before accepting it: check claims about our code yourself, and look for the reason a
   behavior may be deliberate (tests, comments, recent commits by other sessions).
3. **Test, do not only read.**
   - Re-implement a tool's key algorithm as a small script, and run it on PixelDoll's stored PixelLab frames
     (`spikes/api/out/x26`, `x28`) and the demo project (`app/public/fixtures/s2/`), next to our own modules. This is free.
   - Reproduce PixelDoll flaws with temporary tests.
   - PixelLab tests only with the owner's approval and a gens cap, on the agent dev server.
4. **Safety.** Never download or run the itch.io apps, the Civitai workflow or other untrusted files yourself. Browser
   tools that run fully in the page (PixelSprite FX) may be tried in Claude Browser; ask the owner before uploading any
   file to them. Civitai blocks automated fetching (HTTP 403); use the browser or its API
   (`https://civitai.com/api/v1/models/2047895`).
5. **Results go in the repo**, not on claude.ai: `docs/research/tool-review-<date>.md`, plus a visual page under
   `docs/research/visuals/` if it helps. Fix trivial, decision-free flaws with tests; propose Later cards for the rest;
   end with a short summary for the owner.

## Per tool

1. **AutoSprite video.**
   - Get the description and the full transcript: YouTube's transcript panel in Claude Browser, or the owner if neither
     loads.
   - From those, identify every tool, model and setting it uses, then research AutoSprite itself (site, docs, pricing,
     output format).
   - Compare its wardrobe workflow step by step with ours: how an outfit is made, how it stays on model across poses and
     animations, layered or baked output, recolor, cost and time per outfit, and what the user does.
2. **Consistency workflow.**
   - Read the workflow page and its v0.4 notes; ask the owner to download the zip if the node graph is needed.
   - We cannot run Illustrious models, so take the ideas: how a reference image plus OpenPose and Depth hold identity.
   - Compare with our reference dressing (`edit-animation-v2` with an anchor, `transfer-outfit-v2`, create-character-state
     as a dresser) and with the "Concept-image items" plan.
3. **PixelSprite FX.**
   - Try it in Claude Browser with a CC0 model: the Quaternius `UAL1.glb` from round 8, whose local path is in
     `spikes/api/mocap/mocap.mts` (`UAL1_GLB`). Ask the owner before uploading.
   - Measure its framing (does the box stay fixed?), its outlines, palettes and dithering, and its JSON atlas against our
     exports.
   - Judge whether its frames could feed PixelLab as motion or pose references (research §12.3).
4. **Fantasy Character Generator.**
   - The owner tests it (demo or paid). Give the owner a checklist:
     - items and slots worn together;
     - how the color zones work;
     - how stowed weapons look;
     - body variants;
     - the export folder (send the JSON and a few sheets);
     - speed;
     - anything that feels better than PixelDoll.
   - Then compare with our slots, ramps, held-item layers, body templates and export manifest.
5. **ComfyUI pipeline.**
   - Start from the 2026-10-27 review.
   - Design a free offline test of a tighter inpaint-v3 repair mask (the failed layer grown 1 to 2 px) and of a
     loop-seam score on stored clips.
   - Propose a small paid A/B only if the offline numbers justify it.
6. **Skeleton Tool.**
   - Watch both videos (transcripts and descriptions, as for the AutoSprite video) and try the tool in Claude Browser
     with its Samples and with a PixelDoll standing view exported from the demo project.
   - Read its JavaScript (`Main.js` and the modules it imports) to learn how it binds pixels to bones, how it deforms or
     rotates parts (rigid cut-out, mesh, or per-pixel), how it keeps pixel art crisp, and its JSON format. No license is
     shown: learn from it, do not copy code; ask the owner before contacting the author.
   - Test the idea offline: pose a stored PixelDoll item layer (for example the helmet or the cape in
     `spikes/api/out/x26`, `x28`) with a small re-implementation, and measure it against the PixelLab-posed frames
     (fit to the body, pixel quality, flicker).
   - Decide where it could fit: free poses for rigid items, a pose editor, cheap previews before paid generation, or
     pose references for `animate-with-skeleton-v3` (see the Later card "Build the skeleton pose lab").
7. **Ultima paperdoll drawer.**
   - Start from the 2026-10-27 review; check whether the new tools (especially Fantasy Character Generator's slots and
     color zones) change its recommendations.
   - Test the open ideas offline against the demo project: per-item draw-order exceptions, lightness-keeping dye, and
     what an index sheet plus palette texture would cost in export size and engine code.

## Owner actions this task needs

- Download and try the Fantasy Character Generator demo and report back using the checklist (send exported files).
- Download the Civitai workflow zip if the node graph is needed.
- Approve any PixelLab spend, with a cap.
- Provide the video transcript if it cannot be fetched.
