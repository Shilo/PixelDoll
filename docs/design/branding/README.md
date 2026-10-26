# PixelDoll brand exploration

Exploratory logo mockups for review, not production assets. The [body-shape study source](p-body-shapes.mjs) is the current round. Earlier generators preserve the [open-right P](p-open-right.mjs), [connected P and negative figure](p-dual-construction.mjs), [P silhouette](p-person-silhouette.mjs), [two-color cutout](p-cutout-shapes.mjs), [six P and human variations](p-person.mjs), and [third-round concepts](round-three.mjs). The [icon reference search](icon-reference-research.md) records sources and risks. No app UI or favicon has been changed.

Run a generator from the repository root with `node docs/design/branding/<name>.mjs` to create its SVG review board in this folder. Generated SVG and PNG previews stay local and are ignored by Git; the generator and design notes are the versioned source. Early hand-drawn concept, icon-family, and second-round boards are summarized below but kept local only.

## Product promise

PixelDoll makes traditional paper dolling practical for generated 2D characters: a frozen base, separately swappable equipment, frame alignment through animations, exact recoloring, and layered exports. The logo should suggest **one character, multiple fitted layers**. It should work beside the immersive character scene without competing with the actual sprite art.

## P + human exploration

The [current body-shape generator](p-body-shapes.mjs) writes two boards that hold the P cap and head counter fixed while varying the negative character's shoulders, arms, waist and torso. Each card shows the actual one-color mark and an adjacent cutout-shape diagram, which makes the full silhouette visible without adding a second element to the logo. All 16 actual marks are distinct at rendered 16 px and remain connected. No P pixels appear to the right of the open body; no variant adds feet.

The preceding [open-right generator](p-open-right.mjs) follows the owner's fourth silhouette sketch. A square head occupies the P counter. Broad shoulders begin below the bowl, and a straight torso continues to the bottom without legs or feet. The positive P is connected, and there are no P pixels to the right of the shoulder/torso opening. The generator checks that topology at 32 px; all 16 rendered dark samples were also checked to remain connected at 16 px. A consequence of the open right side is that the torso's right boundary merges into the background in the actual one-color mark. These variants therefore show the requested construction but do not yet resolve the person reading at favicon size.

The preceding [dual-construction generator](p-dual-construction.mjs) tests a P foreground wrapped closely around a negative pixel character and a P exterior following a character contour. Each mark uses one foreground and a transparent character/background. The generator checks that every positive P is one four-connected component on its 24 px grid; the rendered 16 px dark samples were also checked for connectivity. There is no separate person emblem or isolated P fragment. Those studies still enclosed the lower body with P pixels on the right, which the latest sketch rules out.

The preceding [silhouette generator](p-person-silhouette.mjs) responds to three small pixel sketches supplied by the owner. The head is transparent inside the P's upper counter. The shoulder opening sits beneath it, and a narrower torso opens through the bottom of the P bowl. Eight variants change the outer P; eight refine the human cutout. All 16 marks use one foreground color and transparent negative space, shown at large size and 16/32 px on Bronze UI dark and light surfaces. Angled Shoulders and Soft Figure best preserve the person cue at large size; the 16 px samples remain the deciding test for a production favicon.

The earlier [cutout generator](p-cutout-shapes.mjs) removes the bronze corner from the preferred Version 03 and explores eight outer P silhouettes and enclosed human openings, plus eight ways for a filled head and torso to occupy the P counter while the torso joins its lower bowl. Each actual mark has one foreground color and transparent negative space; dark and light samples invert that foreground against the respective Bronze UI surface. Both boards include native 16 px samples. The cutout family has the clearer favicon read; the integrated-body family is a more experimental interpretation of the requested shape.

The [six-variation generator](p-person.mjs) combines Folded P and Cutout Sheet into six P marks whose counters contain a human figure or human-shaped cutout. It compares large marks, dark and light 16 px samples, dark and one-color 32 px samples, and wordmark lockups. Portrait P and Soft Portrait preserve the clearest person-inside-P read at favicon size; Cutout P is the strongest literal paper cutout. These are candidates for review, not a selected production identity.

## Third-round exploration

The [reference search](icon-reference-research.md) found many ready-made clothing, wardrobe, paper, layers and pixel icons, but few direct paper-doll symbols. It points to two more specific visual ideas: physical fold-over tabs and a fitted, frame-aligned layer. The [third-round generator](round-three.mjs) sketches five ways to express them at 16 px: Notched D, Folded P, Cutout Sheet, Fold Tabs and Keyed Fit. It also shows light, dark and one-color cuts. These are still exploratory; no direction has been selected.

## Second-round direction: Tab Doll (unselected)

**Tab Doll** starts on a 16×16 grid. A square head, broad bronze tunic and separated legs say “doll with wearable equipment” using two foreground colors and shapes at least two source pixels wide. This is more robust at favicon size than the earlier Fitted Layers proposal: its 3-unit corners on a 64-unit grid can shrink below one raster pixel. The second round was not selected; the figure-based marks were too similar. The [reference search](icon-reference-research.md) broadens the third round to paper tabs, fitted shapes, and custom initials.

**Armor Tile** was the strongest alternate in that round. Its broad garment reads clearly at 16 px, but needs the PixelDoll wordmark to communicate the character side of the product. The other proposals were Cape Doll (memorable but item-specific), Split Doll (may look like lighting), Frame Doll (alignment symbol adds complexity), and PD Block (a compact initialism with little dress-up meaning).

Keep one chosen mark across favicon, in-app identity, social avatar and future installed icon. Pair it with a plain `PixelDoll` wordmark. Keep Lucide for functional UI icons.

**Slogan:** Make every frame wearable.

**Short description:** Create pixel characters, dress them in swappable gear, and export frame-aligned layers to your game engine.

**Full description:** PixelDoll turns PixelLab-generated 2D characters into frame-based paper dolls. Build a frozen character, add separate equipment that follows every move, recolor exact palettes, and export layered spritesheets for your game engine.

The current homepage headline and metadata already explain the product well. The slogan is intended for marketing and social graphics, not every screen.

## Earlier directions

| Direction | Idea | Strength | Tradeoff |
| --- | --- | --- | --- |
| A — Fitted layers | Doll + wearable overlay + registration frame | Direct expression of the name and product at large size | Frame strokes are too thin for a dependable 16 px favicon |
| B — Layer stack | Three offset sprite cells with a bronze front layer | Immediately signals compositing and export | Resembles a generic layers tool; weak “doll” signal |
| C — PD tiles | Geometric P and D built from square cells | Compact and distinctive as a monogram | Does not explain dress-up without the wordmark |

## Color and usage

These mockups use Bronze UI 0.2.2 tokens directly: dark canvas `#111317`, surface `#202329`, text `#f2eee6`, accent `#c9a66b`; light canvas `#eeeae2`, surface `#faf7f0`, text `#25282d`, accent `#76562f`. The bronze is a restrained selection color, not a metallic gradient. Avoid purple, blue, or another brand accent; equipment artwork retains its own palette and should not be theme tinted.

The production wordmark can use the UI's Segoe UI/system sans. The mark carries the pixel reference; a pixel font would add noise beside Bronze UI and harm small-screen legibility. Use a monochrome variant when the mark is tiny or printing in one color. Decorative brand icons may use the same square-grid language; controls stay Lucide so users can distinguish identity from actions.

## Colorfetti structure applied to PixelDoll

[Colorfetti's brand guide](https://github.com/Shilo/colorfetti/blob/main/docs/research/2026-10-13-colorfetti-identity.md) and [asset generator](https://github.com/Shilo/colorfetti/blob/main/build/brand-assets.mjs) establish the production pattern: one tight grid master; pixel-snapped PNG/ICO exports; explicit transparent light/dark browser variants; opaque, padded installed icons; a separate maskable export inside its safe circle; monochrome and Safari pinned-tab versions; and a `--check` mode that catches stale files. Colorfetti uses a 30×30 master with thick strokes and consistent gaps. PixelDoll's Tab Doll uses its own 16×16 geometry and Bronze palette, not Colorfetti's mark or colors.

| Surface | Proposed PixelDoll assets after approval | Behavior |
| --- | --- | --- |
| Browser tab | Adaptive SVG fallback; explicit light/dark SVG, PNG at 16/32/48, ICO with 16/32/48 frames | Transparent mark; browser color preference selects the contrast variant, independently of the saved app theme |
| PWA and desktop | Opaque PNG at 192/512 | One stable porcelain tile and padded mark across device themes |
| Maskable PWA | Separate opaque PNG at 192/512 | More inset; verify every foreground pixel lies inside the centered 40% radius safe circle |
| Apple touch | Opaque PNG at 152/167/180 | Same fixed tile and mark; OS supplies corner treatment |
| Monochrome and pinned tab | 192 PNG and one-color SVG | Silhouette stays readable with one platform-selected tint |
| In-app and social | Shared SVG component; large social preview derived from the same mark | Wordmark and description may accompany the mark, without drawing a different logo |

The early local-only icon-family mockup showed these roles for Tab Doll. The current [PWA plan](../../../PLAN.md) remains deferred, so the mockup does not enable installation or add a manifest. Once a direction is approved, make one deterministic production generator and validate export dimensions, alpha, palette, small-feature survival, ICO frames, maskable containment and light/dark selection. Check actual launcher rendering on devices separately.

## Existing mismatch to resolve if A is approved

- `app/public/favicon.svg` is a purple abstract mark unrelated to the product or Bronze UI.
- `app/src/studio/Welcome.svelte` has a tiny block figure in an accent tile.
- `app/src/studio/Toolbar.svelte` uses Lucide `PersonStanding` beside the name.
- `app/src/ui/TopBar.svelte` is a developer-only text header.

Implement the selected mark as one shared production asset/component and derive size variants from that source. Check 16/24/32 px on both themes and a one-color rendering before replacing the favicon and header marks.
