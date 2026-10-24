# Artwork provenance

Date: 2026-10-22. Concept studies only.

The two environment plates were generated with the built-in image generation tool, then copied into this workspace. They are original scene studies, not screenshots or copied art from the researched games. The interface, typography and controls are real local HTML/CSS; the game sprites are existing PixelDoll demo fixture layers, reused to show six illustrative outfit variants. No new PixelLab characters were generated and no PixelLab credits were used.

- `moonlit-camp.png`: original image generation output, dark forest clearing.
- `lantern-atelier.png`: original image generation output, warm tailor's room.
- Quiet Stage: code-rendered neutral background; no raster asset.
- `data.js`: seven existing fixture sheets embedded for offline use, plus icon SVG data extracted from the already installed `@lucide/svelte` package. Lucide is ISC-licensed; see `lucide-LICENSE`.
- Sprite source: `app/public/fixtures/s2/layers/`, with body, vest, cape, hair, helmet, wizard hat and sword. Original frame alignment is retained in character previews. Item thumbnails crop their transparent padding for legibility only.

The six names are mock content. Their visual similarity reflects reuse of the same fixture base, not a claim that six unique bodies were generated. The creation guide is explicitly an example, not a prediction of the prompt. Prototype recolouring uses an illustrative deterministic mapping, not the app's production material-ramp implementation.

The environment plates are intentionally richer than the recommended final backdrops. Simplify their texture and test contrast against many sprites before production. Neither background is part of exported character artwork.

## Exact generation prompts

### Moonlit Camp

Use case: stylized-concept. Asset type: original background plate for PixelDoll full-screen pixel-art character creator UI; no interface in this image. A deeply atmospheric moonlit forest campsite, restrained premium indie RPG pixel art, widescreen 16:9. Low straight-on camera looking into a clearing: enormous dark pines framing left and right edge, layers of blue-green distant forest, a soft moon shaft, tiny warm lantern at far left, a small extinguished fire and folded cloak near far lower right. Wide clear horizontal mossy stone ground across the middle-lower area for a roster of standing characters. MOST IMPORTANT: centre 65% is open quiet negative space, no people, no text, no UI, no frames, no symbols, no clutter, no big foreground objects. Ground plane visible around 70% of image height, natural plausible scale for 64px game sprites displayed large. Elegant limited teal/ink/sage palette, dappled softly muted texture. Pixel-art scene, sharply clustered painted pixels, never photographic or 3D. Edges dark enough for cream UI text; center visually understated to support vivid character silhouettes.

### Lantern Atelier

Use case: stylized-concept. Original background plate for full-screen PixelDoll character creator, 16:9 pixel art. An elegant quiet fantasy tailor's atelier at night with simple oak beams, tall curtained arched window at centre-back looking toward deep indigo mountains, warm lantern light, sage teal plaster and pale weathered stone floor. Subtle folded fabrics and clothing rail only at far left edge; a small oak worktable far right edge. Huge EMPTY central 65% floor area and subdued rear wall, suitable for showing a small game sprite in front and understated interface overlays near edges. Straight-on low camera, no isometric view; ground floor horizon at lower 65%. Atmospheric upscale indie RPG pixel art with crisp pixel clusters and restrained details. Warm muted amber and deep ink blue with cream light, cinematic but simple. NO people, no characters, no mannequins, no text, no lettering, no UI, no border, no emblems. Centre must remain open with no furniture in it. The hero will be added later.
