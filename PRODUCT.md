# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Indie game developers, preferably ones who already use PixelLab (https://pixellab.ai), the AI pixel-art generator for game assets. They are solo developers or small teams making 2D games who need animated characters whose equipment can be swapped in-engine: hair, headgear, clothing, boots, capes and held weapons on one base body. They use game engines and asset tools such as Godot, Phaser, Unity, GDevelop, RPG Maker, Aseprite or raw PNG and JSON, and pay for PixelLab generations with their own account.

PixelLab is the preferred entry point, not a requirement for local use: the bundled demo, dressing, previewing, recoloring and exporting work without a key. PixelDoll is a tool for game developers, not a dress-up toy for casual players.

## Product Purpose

PixelDoll makes traditional frame-based paper dolling practical for AI-generated 2D characters. A user creates or imports one frozen base body (two-direction side-scroller, four- or eight-direction presets, several moves), adds each item as its own transparent layer that lines up on every frame, recolors items by exact palette ramps, previews the result in a live world, and exports it.

Layer-aware exports (Godot, Phaser, Unity, GDevelop, Aseprite, PNG + JSON) keep each equipment layer separate with a manifest. RPG Maker exports are baked walking sheets rather than runtime-swappable layers.

Success means a developer gets accurate, consistent, engine-ready layers without understanding skeletons, chroma extraction or API payloads, and without wasting paid generations.

## Positioning

PixelLab returns one composited image per call and has no layers. PixelDoll turns that output into true paper-doll layers: a frozen base plus one transparent layer per item on the same grid and pivot, checked by quality gates (alignment, frame and direction consistency, grip side, stray pixels) and exported per layer to game engines and asset tools. It is free, open source (MIT), fully client-side and uses the developer's own PixelLab token.

## Operating Context

- Hosted on GitHub Pages at https://pixeldoll.app/ and installable as a PWA. The browser calls the PixelLab REST v2 API directly; there is no backend.
- Core journey: choose a character (or the bundled demo), customize it (Preview, Top-down and Side-scroller views), dress and recolor in the Wardrobe, add moves, review item quality, then Export or Share.
- Generations cost the user real PixelLab credits. Costs, retries and fallbacks are disclosed at the point of decision and paid requests are never resent automatically.
- Users take the output into their own engine; exports must render pixel-identical to PixelDoll's compositor (verified in Godot, Phaser and Aseprite).
- Used with keyboard, mouse and touch on desktop, tablet and phone, in portrait and landscape.

## Capabilities and Constraints

- Pipeline: create-character-v3 base, skeleton-v3 rig with stored keypoints, items dressed on a chroma-keyed copy of the base with Pro edit-animation-v2, posed per move with animate-with-skeleton-v3, extracted by color key, with Pro inpaint-v3 as the per-clip fallback. Held weapons use a padded layer sharing the body pivot.
- Only the PixelLab models listed in AGENTS.md are allowed; Pro is for editing only.
- Sprites export at native size and are never rescaled for an engine.
- Data is saved locally and automatically. The app is in preview: no backward compatibility for older saved data, but old data must never brick it.
- Remembered credentials live in optional plaintext `localStorage['pixellabApiKey']`, shared across apps on the origin, by design.
- Terminology in use: Characters, Customize, Preview, Top-down, Side-scroller, Wardrobe, Colors, Outfits, Moves, Inspect, Activity, Export, Share, "gens" for generation cost.
- Open decisions are tracked on the PixelDoll board (https://github.com/users/Shilo/projects/7), including the logo, onboarding, non-humanoid and left-handed characters, and more equipment slots.

## Brand Commitments

- Name: PixelDoll, written as one word with a capital D.
- Tagline: "Dress up your 2D game characters with pixel-perfect paper dolling."
- Slogan candidate: "Make every frame wearable." Short description: "Create pixel characters, dress them in swappable gear, and export frame-aligned layers to your game engine." (docs/design/branding/README.md)
- `@shilo/bronze-ui` is the owner's theme and the only UI kit; shared appearance is fixed there, not locally.
- Dark by default with a persisted light switch; Lucide icons for functional UI; no pixel fonts or pixel icons in the UI (PLAN.md D9).
- The character's source pixels stay legible and central; world lighting, tint or filtering never touches actor pixels.
- The logo is unresolved: exploratory marks live in docs/design/branding/ and none is selected.
- Copy uses American English, concise familiar labels and no em dashes.

## Evidence on Hand

- Bundled demo character built from the team's own PixelLab outputs: app/public/fixtures/s2/.
- Screenshots: docs/media/studio-dark.png, docs/media/outfit-slash-sheet.png, docs/media/godot-render-slash.png (a Godot 4 render pixel-identical to the compositor).
- Verification reports under docs/testing/ (engine exports, shields, shared equipment, professional audit).
- User guide: docs/user-guide.md.
- No verified testimonials, customer logos, user counts or usage metrics are on hand; do not fabricate them. Unity import compiles but is not yet verified live.

## Product Principles

1. Quality over volume: accurate, consistent, frame-aligned layers through proper PixelLab tooling, rigging and quality gates, with honest warnings when output needs a look.
2. Simplicity first: strong defaults and progressive disclosure so dressing, previewing and exporting work without pipeline knowledge (docs/usability-principles.md).
3. Respect the user's money: paid generations are explicit, disclosed and never silently retried; prefer free offline work.
4. The character is the hero: the interface frames the sprite art and never competes with or alters it.
5. Open and client-only: no backend, the user's own token, MIT source and engine-neutral exports.

## Accessibility & Inclusion

- Design target: WCAG 2.2 Level AA, already the reference in earlier design research (docs/design/2026-10-22-redesign/). It is a target, not an audited or certified conformance claim.
- Keyboard, touch and mouse access; visible focus; accessible names that match visible labels; reduced motion; no hover-only actions.
- Touch targets aim for about 44 CSS px on primary controls (WCAG's 24 px minimum is the floor).
- Support desktop, tablet and phone in portrait and landscape. Historical checks include 320×568 and 844×390; the 2026-11-09 visual captures cover 1440×900 and 390×844 in both themes. These checks are not exhaustive device or accessibility-conformance verification.
- Inclusive generation: quality checks must be fair across skin tones (open board cards cover the rim guard and absorbOutline).
