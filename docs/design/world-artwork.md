# Production world artwork

These are byte-for-byte copies of the approved Obsidian / Porcelain Bronze
environment plates from the October 2026 PixelDoll design work:

- `obsidian-stage.png`: `docs/design/2026-10-22-redesign/round-5-mockups/assets/obsidian-stage.png`
- `porcelain-stage.png`: `docs/design/2026-10-22-redesign/round-5-mockups/assets/porcelain-stage.png`

The original environment art was generated separately from character artwork.
The approved round-six playable prototype reused these two plates for selection,
creation and Preview, and sampled their material for continuous live floors.
No character pixels are included in these backgrounds. No images were generated
or altered for production integration.

The user-authorized production integration promotes these copies to application
source assets. They belong in Git; the ignored design/evidence originals remain
historical local media. They ship with this MIT-licensed PixelDoll project.

SHA-256:

| File | Hash |
| --- | --- |
| `obsidian-stage.png` | `a71e0f7e87219deb2b461c789fef2021c69f54188dfc73dcbde614fb554aed3b` |
| `porcelain-stage.png` | `b29c7c4457cdfbb744251a45a2449ba13e92c9d8aa03829721db7c1d270f09ae` |

Rendering provenance: `app/src/studio/experience/ground.ts` translates the
shader, mirrored 256px material patch and perspective projection directly from
`docs/design/2026-10-22-redesign/round-6-prototype/world.js`.
`config.ts` preserves its `config.js` and `theme.mjs` scene colors, material
sampling, horizon crops, motion constants and code-only reflection defaults.
UI appearance tokens continue to belong to Bronze UI.
