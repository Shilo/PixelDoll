# Palette studies with the actual demo character

**Decision:** Obsidian / Porcelain Bronze was selected after reviewing these studies. [Current design record](../current-design.md). Frost and Sage remain comparison history.

2026-10-23. Focused raster comparisons, not full-screen mockups or an interactive prototype. The same UI content and source character are shown in all six appearances. The three families are alternatives to choose between, not a proposed six-theme feature.

## Lead recommendation

**Obsidian / Porcelain Bronze** retains the strongest connection to the preferred Holodeck. Warm accents are restrained, the red cape remains prominent, and the light counterpart looks like the same product. Keep world seams quieter than selection marks. **Graphite / Frost** is the strongest cooler alternative; **Basalt / Sage** is softer but pushes the environment toward a green cast and needs care around success-state meaning.

### Bronze

![Bronze dark and light palette study](bronze-palette.png)

### Frost

![Frost dark and light palette study](frost-palette.png)

### Sage

![Sage dark and light palette study](sage-palette.png)

## What the colors mean

- World: the background-art color family, not a flat required fill across the whole scene.
- UI backing: local gradients and reading surfaces, also used as stronger menu/form backings.
- Text and Secondary: primary and secondary interface information.
- Selection: selected tabs/items and a principal action. Check marks and outlines preserve non-color state cues.
- Equipment palettes remain independent content and are not altered by appearance.

Generated environment art approximates these colors; the labeled swatches and UI colors use the exact values. Environment geometry/horizon differs slightly between generated variants. These images compare palette and readability, not pixel-identical architectural relighting or final perspective approval. The generous UI backings deliberately demonstrate dependable reading surfaces; full-screen composition remains the prior immersive direction.

## Exact sprite provenance and checks

The source is `app/public/fixtures/s2/fixture.json`, Adventurer preset, Walk / South / frame index 0. `loadFixture`, `composeCell` and `bakedFrame` from the current app assemble the actual stored body and equipment. Transparent padding is cropped; visible pixels are enlarged exactly 5× with nearest-neighbor sampling. Headwear thumbnails also come from the actual stored fixture. No character generation, enhancement, tint, filtering, added shadow, reflection or lighting was applied.

The renderer checked the center of each enlarged opaque source pixel against source RGBA in each of the six appearances: **1,029 opaque pixels matched per appearance**. This verifies the no-tint invariant, not a general accessibility or gameplay test. Sprite PNG SHA-256: `cb7376b2d6917e8a4467d6c3b492f8cb4868e755b2f4a50d1560d7bdc6356a99`. See `verification.json` and `render-palettes.mjs` for reproducibility.

The sample has existing painted shading in its source pixels. Unlit means preserving those pixels, not repainting the source to remove that artwork. The character can perceptually look different against a light background despite identical RGB; the checks distinguish that from actual theme recoloring.

## Generation and local files

Empty environment images were generated with built-in ImageGen. [Exact prompts](prompts.md). The sprite and exact UI were added deterministically with an offline Canvas raster renderer. No HTML interface file was delivered and no app route was created. Playwright was used only to run the offline canvas and export PNGs; no app server or network requests were used.

| Palette | Original built-in output basename | Local empty world | Final study |
| --- | --- | --- | --- |
| Bronze | `exec-c67ce43d-0b66-4a8b-9384-810e2518a405.png` | `bronze-world.png` | `bronze-palette.png` |
| Frost | `exec-b4aac27e-fed2-4d76-b17a-5c6a972912dc.png` | `frost-world.png` | `frost-palette.png` |
| Sage | `exec-e48c070b-789f-42ca-8e6c-0603a991a861.png` | `sage-world.png` | `sage-palette.png` |

Original output directory: `C:/Users/shilo/.codex/generated_images/01a16655-bf05-7102-b188-187f49a2fe6f/`. Originals were retained and selected art copied into this project folder. PNG media remain local under the repository ignore policy. The renderer was run as an offline artifact tool using the available Node 25 runtime; no production checks were run or claimed under that runtime.

Visual review found no overlapping text, missing thumbnails or altered hero pixels. Actual full-screen/mobile layout, moving-scene contrast, dark/white outfits, touch controls and reflections remain work for the agreed later design/prototype stages.
