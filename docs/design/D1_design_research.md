# PixelDoll design research (D1)

Author: D1 (design research) · Date: 2026-10-20 · Phase 6 input (TODO "Design & MVP"). Docs only, no app code changed.
Inputs: AGENTS.md, PLAN.md, TODO.md, [architecture v1.2](../architecture.md), [tools survey R5](../research/tools/paperdoll_tools_survey.md),
mockups `app/src/ui/` (M1, M2, M5), Apple HIG (fetched 2026-10-20), and the GlassKit source review
([`glasskit_review.md`](glasskit_review.md)).

## TL;DR

- **Product shape:** one main screen, the **Studio**. The character is always center stage, the **Wardrobe** (slots → items)
  is on the left, and an **Inspector** for the selection is on the right. Three tasks open as sheets: **create character**,
  **new item** and **export**. Everything technical (rig freeze, QA gates, key color, seeds, routes, concurrency, ledger) is
  automatic and sits behind "Details" disclosures or a Developer setting.
- **Happy path:** *Create character → Add items → Dress up → Export.* There are 4 user decisions and every one has a default.
  No API key is needed until the first generation: a bundled **demo character** (the S1 fixture) lets people dress up and
  export first.
- **Ranked directions:**
  1. **A Native minimal**, with **E pixel accents** as the brand layer.
  2. E on its own.
  3. D Soft playful.
  4. C Pro dark. Its dark palette and density become A's dark mode and "compact" option.
  5. B Liquid Glass (GlassKit). Mockup only.
- **Stack:**
  - Svelte 5 (runes) without SvelteKit.
  - **Vite 8 now.** Vite+ 1.x is stable and MIT, but it is optional: trial it with `vp migrate` on a branch later.
  - TypeScript.
  - **Plain CSS custom properties** with `light-dark()`: one `tokens.css`, one `base.css`, and Svelte scoped styles.
  - Native `<dialog>`, `popover` and `<details>`.
  - About 25 inline Lucide SVGs.
  - No UI kit, no Tailwind, no GlassKit in the MVP.

---

## 1. What the workflow really is (from the code and the architecture)

| Stage | Under the hood (arch v1.2) | Time / cost | What a casual user should see |
|---|---|---|---|
| Connect | Key in memory, opt-in localStorage. `/balance`. CSP limited to pixellab hosts. | – | "Connect PixelLab" sheet, shown the first time a generation needs it. |
| Base | `create-character-v3` at 48 px padded to 64. Templates idle (4) + walk (8) × S/E/N. West mirrored. | ≈ 12 gens; ~4–5 min base + 1–2.5 min per template batch | "Describe your character" → one progress card → animated review → "Looks good". |
| Freeze (M2) | Normalize, pivot, headroom, `estimate-skeleton` (0.1 gen per cell), anchors, `baseHash`. | 3.6 gens, ~1 min | Nothing. It runs automatically as part of "Looks good". Plain-language warnings only (e.g. "Little room above the head — tall hats may be cut off"). |
| Item (M3) | Chroma mannequin + `edit-animation-v2` ≤ 16 cells per call. Design call, then anchor-cell calls. `chromaLayer`. G1–G8 gates. Up to 2 automatic re-rolls. Optional rigid budget mode. | 30 gens per item (10 in budget mode); ~2–3 min per call | Pick slot → "What is it?" → card with live preview → badge "Clean" / "Needs a look". |
| Dress-up (M4) | z ladder, fg/bg split, overrides, hides, material ramps, recolor. | free, instant | Tap items to wear, tap swatches to recolor, play animations, turn the character around. |
| Export (M5) | Manifest + per-layer sheets + baked composites + Godot/Phaser/Unity glue → zip. | free, < 1 s | "Export for… Godot / Unity / Phaser / PNG" → Download. |

Current mockups are developer test benches: a nav of M1–M5 links, a raw ledger table, checkboxes for overlays, a 4× canvas with
a CSS checkerboard. They prove the pipeline but expose all of it. The MVP's job is to **hide the pipeline and keep its
honesty**: costs, times and failures stay visible, and the internals don't.

**Two user types, one UI:**

- **Casual creator** (target). Wants a character for a jam or hobby game, doesn't know what a rig is, and is cost-sensitive.
- **Game dev / technical artist.** Wants export details, layer order, pivots and QA, and will open "Details" and the
  Developer setting.

## 2. Apple design principles distilled for PixelDoll

| Principle (source) | Apple says | PixelDoll rule |
|---|---|---|
| Hierarchy: content vs controls ([Liquid Glass overview](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)) | Controls and navigation form a distinct functional layer above the content. | The **sprite is the content**. Chrome is quiet and monochrome, and color lives in the art. |
| Glass only on the control layer ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)) | Never use Liquid Glass in the content layer. Use it sparingly. Use clear glass only over visually rich media, with a ~35 % dimmer under bright content. | If glass is used at all: toolbar, tab bar, sheets, popovers. **Never** over the canvas, the swatches or the item thumbnails. |
| Sidebars ([HIG Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)) | Top-level navigation, **≤ 2 levels**. Collapse automatically when the window narrows. Don't hide by default. Don't put critical actions at the bottom. | Wardrobe = slot groups (level 1) → items (level 2). It auto-collapses below 1024 px. "New item" sits at the top of each slot, never at the bottom of the sidebar. |
| Split views + inspector ([HIG Split views](https://developer.apple.com/design/human-interface-guidelines/split-views), [Adopting](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)) | Sidebar + content + trailing inspector. Let people hide the inspector, with several ways to reveal it (button, menu, shortcut). Avoid multi-pane layouts on iPhone. | Three panes from 1024 px up, two on tablets, one plus sheets on phones. Inspector toggle via button and `⌘/Ctrl+Alt+I`. |
| Toolbars ([HIG Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)) | Leading / center / trailing zones, ≤ 3 groups, symbols over text, **one prominent primary action on the trailing side**, monochrome labels. Not for switching app areas. | Leading: sidebar toggle + project name menu. Center: undo/redo group. Trailing: activity + **Export** (the one primary). Areas switch in the sidebar (desktop) or the tab bar (phone). |
| Tab bars ([HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)) | Navigation, not actions. ≤ 5 tabs, single-word labels. Never hide or disable tabs: explain empty sections instead. iOS 26 has a floating bar with an **accessory** (MiniPlayer) above it. | Phone: 3 tabs (**Wardrobe · Colors · Moves**). Job progress lives in the **accessory capsule**. Empty tabs show an empty state. |
| Sheets ([HIG Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)) | For a short, self-contained task. One sheet at a time. Medium detent for progressive disclosure. Grabber on resizable sheets. Cancel leading, Done trailing. Confirm before discarding edits. | New item, Export, Connect key and Activity are sheets: centered on desktop, bottom sheets with medium/large detents on phones. |
| Onboarding ([HIG Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)) | Teach by doing, keep it optional and brief, use sensible defaults, ask for permissions **in context**, and don't make people wait (bundle content). | **Demo character first.** The key is asked for at the first generation. No tutorial carousel: inline tips appear once and can be dismissed. |
| Progress ([HIG Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators), [Loading](https://developer.apple.com/design/human-interface-guidelines/loading)) | Prefer determinate. Report accurately, never fast-then-stalled. Explain stalls. Short, specific labels (not "Loading"). Consistent location. Let people keep working. Offer cancel. | Each job shows a step label ("Animating walk"), an honest time estimate from measured durations, and a consistent location (item card + activity). The UI is never blocked. |
| Undo ([HIG Undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo)) | Unlimited undo, descriptive labels ("Undo Color Change"), show the result, batch related changes, standard shortcuts. | Command history over the project store. Slider drags batch into one entry. Toast "Removed Iron helmet · Undo". |
| Color and accessibility ([Adopting](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)) | Light, dark and increased-contrast variant for every custom color. Accessibility label for every icon. Test with Reduce Transparency and Reduce Motion. | Tokens defined in light, dark and `prefers-contrast: more` variants. `aria-label` on every icon button. Reduced-motion and reduced-transparency paths. |
| Concentric shapes ([Adopting](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)) | Nested radii are concentric with their container. | `inner radius = outer radius − padding`, encoded as tokens. |

Context: Apple's own glass needed a legibility retreat. iOS 26.1 added a **Clear/Tinted** Liquid Glass setting after legibility
complaints, and Reduce Transparency is still the stronger option ([TidBITS](https://tidbits.com/2025/10/21/ios-26-1-to-add-optional-opacity-to-liquid-glass/),
[Six Colors](https://sixcolors.com/post/2025/11/soaping-up-liquid-glass-less-transparency-more-contrast/)). A web app can't
read the user's iOS glass preference, and `prefers-reduced-transparency` works only in Chromium
([caniuse](https://caniuse.com/wf-prefers-reduced-transparency)). Solid must therefore be the safe default.

---

## 3. Theme / design directions

All five share the same IA (§4), the same component set and the same **pixel-canvas rules** (§3.6). They differ only in
tokens, type, iconography and motion. That keeps the Phase 6 mockups cheap: one Svelte component set plus a
`data-look="native|glass|pro|soft|pixel"` attribute that swaps token blocks.

### 3.1 A: Native minimal (macOS / iPadOS look on the web)

The feel is Finder, Notes or Pixelmator Pro: a quiet sidebar, a white or graphite canvas area, an inspector, and system type.

| Token | Light | Dark |
|---|---|---|
| `--bg` (window) | `#ffffff` | `#1e1e1f` |
| `--bg-side` (sidebar, inspector) | `#f5f5f7` | `#262628` |
| `--bg-raised` (cards, sheets) | `#ffffff` + shadow | `#2c2c2e` |
| `--stage` (canvas surround) | `#ececee` | `#161617` |
| `--text` / `--text-2` / `--text-3` | `#1d1d1f` / `#58585d` / `#6e6e73` | `#f5f5f7` / `#c7c7cc` / `#8e8e93` |
| `--line` | `rgb(0 0 0 / .10)` | `rgb(255 255 255 / .12)` |
| `--accent` | `#0071e3` | `#0a84ff` |
| `--ok` / `--warn` / `--bad` | `#1a7f37` / `#b25000` / `#d70015` | `#30d158` / `#ff9f0a` / `#ff453a` |

Contrast was checked with the WCAG formula for A's text and status colors on `--bg`, and for the accent and ink pairs in C,
D and E. All are at least 4.5:1. The dark accent `#0a84ff` on `#1e1e1f` only just passes at 4.57:1. Two pairs fail on `--bg-side`:
the light accent (4.31:1) and the dark `--bad` (4.43:1). So add an `--accent-text` token (`#0066cc` light, 5.1:1) and use
`--bad` `#ff6961` in dark (5.4:1) for small text in the sidebar and inspector.

- **Type:** `system-ui, -apple-system, "Segoe UI Variable", "Segoe UI", Roboto, sans-serif`, which gives SF Pro on Apple
  devices and Segoe on Windows with no font download. Don't self-host SF Pro: its license is tied to Apple platforms.
  - Desktop: 13 px body, 11 px captions, 15 px panel titles, 22 px page titles; weights 400/510/600.
  - Touch (`pointer: coarse`): 15–17 px body.
  - Numbers use `font-variant-numeric: tabular-nums`.
  - Mono `ui-monospace, "Cascadia Mono", Menlo, monospace` for ids in Details only.
- **Spacing:** 4 px grid (4, 8, 12, 16, 20, 24, 32, 48).
- **Control heights:** 28 px on desktop, 44 px on touch.
- **Sidebar and inspector widths:** 240 px and 280 px, resizable between 200 and 360.
- **Radius:** controls 6, cards 10, sheets 14, popovers 10. Concentric rule: inner = outer − padding.
- **Icons:** Lucide (ISC) at a 16 px grid, 1.5 stroke, `currentColor`, monochrome. Color only for status (QA, errors).
  Suggested about 25 icons, inlined: `panel-left`, `panel-right`, `undo-2`, `redo-2`, `play`, `pause`, `step-forward`,
  `download`, `plus`, `x`, `check`, `triangle-alert`, `loader-circle`, `sparkles`, `palette`, `shirt`, `crown`, `glasses`,
  `footprints`, `sword`, `shield`, `backpack`, `scissors` (hair), `layers`, `key-round`, `coins`, `settings`, `rotate-cw`
  (turn), `grid-2x2` (all directions).
- **Motion:**
  - 120 ms hover and press, 200 ms panels, 280 ms sheets on `cubic-bezier(.2, .8, .2, 1)`.
  - Under `prefers-reduced-motion: reduce`, durations go to 0 and sprite playback is kept (the user controls it).
- **Canvas:** sits on `--stage`, a flat neutral gray. The checker is two near-equal neutral grays. The selected item gets a
  1 px accent outline drawn *outside* the sprite pixels.
- **Pros:** most familiar and accessible, cheapest to build (no fonts, no libraries), color-neutral for recoloring, and it
  scales to "pro" with a density switch. Dark mode is solid.
- **Cons:** generic, with no brand memory. It risks looking like "another settings app" unless E's accents are added.

### 3.2 B: Liquid Glass (GlassKit)

The feel is iOS 26 / visionOS: floating, translucent chrome, pill shapes and the droplet selection.

| Token (GlassKit) | Light | Dark |
|---|---|---|
| `--gl-color-primary` / `-dark` | `#0a84ff` / `#0060df` (rebranded) | same |
| `--gl-surface-1…5` | white .50–.85 | white .08–.22 |
| `--gl-color-bg-mid` | `#f0f4f8` | `#1a3d4e`. Replace with neutral `#1c1c1e`: the default teal bg tints sprites. |
| `--gl-blur` / `-heavy` | 24 / 40 px. Cap at 20 px for bars (perf). | same |
| Radius | card 24, button 16, input 14 | same |
| Controls | 52–56 px (`compact` 40 px) | same |

- **Type:** the GlassKit stack (`-apple-system`, SF Pro Display…, Segoe UI) at 15 px base.
- **Icons:** Lucide at 20–22 px. Tab icons filled where possible (HIG prefers filled tab symbols).
- **Motion:** droplet tab and segmented selection, sheet slide, morphing pills. Spring-like with a small overshoot. Disabled
  under reduced motion.
- **Canvas:** full-bleed stage. Glass chrome *floats* at the edges (floating toolbar top, floating tab bar bottom), with a
  solid neutral stage behind. A 35 % dimmer goes under any glass that overlaps a bright checker.
- **Pros:** most "2026", very attractive on phones, matches Apple's current direction, and GlassKit gives the mobile pieces for
  free (sheet, floating tab bar + accessory, segmented with droplet, steps, toast with action).
- **Cons:**
  - Fights the medium: blur behind or near pixel art smears colors and tints color judgement.
  - Contrast isn't fixed: dark-glass text over a light checker measured **1.14:1**.
  - The backdrop re-blurs on every sprite frame (mobile perf).
  - Mobile-sized controls are too big for a desktop inspector.
  - GlassKit misses the desktop structure (sidebar, inspector, toolbar groups, tooltips).
  - It is dark by default with no OS sync, and has a bus factor of 1.
  - Details: [`glasskit_review.md`](glasskit_review.md).

### 3.3 C: Neutral pro-tool dark (Figma UI3, Aseprite-modern, Blender-lite)

The feel is a dense, dark, panel-heavy creative tool that puts the art first.

| Token | Dark (primary) | Light (secondary) |
|---|---|---|
| `--bg` / `--panel` / `--raised` | `#18181b` / `#1f1f23` / `#27272a` | `#f4f4f5` / `#ffffff` / `#fafafa` |
| `--stage` | `#111113` | `#e4e4e7` |
| `--line` | `#2e2e33` | `#e4e4e7` |
| `--text` / `--text-2` | `#e4e4e7` / `#a1a1aa` | `#18181b` / `#52525b` |
| `--accent` | fill `#6a4cf0` (white ink 5.4:1), text `#9d85ff` (6.1:1); violet stays clear of skin and hair hues | `#5b3df5` |

- **Type:** Inter Variable (OFL, ~30 KB woff2 subset) or system-ui, at 11–12 px body with 600-weight 11 px uppercase-free
  section labels (HIG now prefers title case).
- **Spacing:** 4 px grid, 24–28 px rows, 8 px panel padding.
- **Radius:** 4 for controls, 6 for panels.
- **Icons:** Lucide at 16 px, 1.25 stroke.
- **Motion:** 80–120 ms fades only.
- **Canvas:** dark surround, rulers optional, pixel grid overlay from 8× zoom, onion skin, and frame strip with per-frame ms
  under the stage.
- **Pros:** the best fit for power users and long sessions, color-accurate, very cheap to render.
- **Cons:** intimidating for casual users ("this is Blender"), and it invites exposing every knob. **Use it as A's dark mode
  plus `data-density="compact"`, not as the product's face.**

### 3.4 D: Soft playful minimal (Picrew-like, for casual creators)

The feel is a friendly character maker: rounded, warm, slightly toy-like but clean.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#fbf8f3` (cream) | `#1f1b24` |
| `--panel` | `#ffffff` | `#2a2530` |
| `--text` / `--text-2` | `#2b2730` / `#6f6878` | `#f4eff7` / `#b9b0c2` |
| `--accent` | `#d1365c` (berry), white ink 4.8:1 | `#ff6f91`, dark ink `#2b2730` 5.5:1 |
| `--accent-2` | `#2fb39a` (mint) | `#5fd8bf` |
| `--stage` | `#f1ece4` with a soft floor ellipse under the feet | `#18151c` |

- **Type:** `ui-rounded` (SF Pro Rounded on Apple), with Nunito Variable (OFL) as fallback, at 15–16 px. Headings 700.
- **Radius:** 12 controls, 20 cards, 28 sheets; pill buttons.
- **Controls:** 44 px everywhere.
- **Icons:** Lucide at 2 px stroke with round caps, or Phosphor "bold"/"duotone" (MIT).
- **Motion:** gentle springs (wiggle on equip, a "pop" of the item card when a job finishes). Reduced-motion fallback is a fade.
- **Canvas:** the character stands on a soft pastel "stage" with a contact shadow. The checker is hidden by default and
  toggled on to inspect transparency.
- **Pros:** most inviting for the casual target, and the Picrew mental model ("tap parts to dress") is well known.
- **Cons:** reads as "toy" to game devs exporting to Godot or Unity. Pastel surround and a floor shadow bias color judgement.
  It needs a web font for the rounded look on Windows and Android.

### 3.5 E: Pixel-accent minimal

The feel is A's calm structure plus a few deliberate pixel-art signatures, so the tool feels made *for* pixel art.

- **Palette:** A's neutrals, plus an accent ramp taken from a classic 16-color palette (Sweetie-16-like): `--accent #3b5dc9`,
  `--accent-hi #41a6f6`, `--spark #ffcd75`, `--ok #38b764`, `--bad #b13e53`. Check every pairing for 4.5:1 on its surface;
  for example, use `#2f4bb0` for accent text on white.
- **Type:**
  - UI text in system-ui (legibility first).
  - **Display only** (logo, empty-state headings, step numbers) in Pixelify Sans or Silkscreen (OFL), at integer multiples of
    the font's pixel grid (e.g. 16, 24 or 32 px) so the glyphs stay crisp.
- **Radius:** 0–2 px. Primary buttons get a **stepped 2 px corner** (`clip-path` polygon) and a 2 px offset hard shadow
  `box-shadow: 2px 2px 0 var(--accent-shadow)` that collapses on press.
- **Icons:** Lucide for UI. **pixelarticons** (MIT, 1,036 icons on a strict 24 grid) for brand moments only (logo, empty
  states, slot glyphs in the wardrobe), always rendered at 24 or 48 px so they stay on the pixel grid.
- **Motion:** `steps(4)` timing for small brand animations (a sparkle on job done, the progress fill advancing in "frames").
  This echoes frame-based animation. Normal easing everywhere else.
- **Canvas:** the hero. The checker is aligned to sprite pixels (one square = 4 × 4 sprite pixels), the pixel grid appears from
  8×, and a pivot crosshair and ground line are optional. **Empty states use the user's own character** (e.g. a gray
  silhouette of the frozen base in an empty slot).
- **Pros:** distinctive and on-topic at near-zero cost. It keeps A's accessibility and performance, and gives a strong brand
  without fighting the art.
- **Cons:** pixel fonts at body size hurt legibility (so don't use them there). Heavy-handed "retro" can look kitsch, so keep
  it to about 5 touch points.

### 3.6 Pixel-canvas rules (all directions)

1. **Integer zoom only** (1×–12×). "Fit" picks the largest integer that fits. Set `image-rendering: pixelated` on the canvas.
   The backing store is `cell` px (64 × 64) and the CSS size is `cell × k / devicePixelRatio`, with `k` an integer number of
   *device* pixels per sprite pixel. On a 1.25/1.5 DPR Windows laptop this keeps pixels even. Never use a CSS `transform:
   scale` on sprites.
2. **Neutral surround:** no blur, no tint, no gradient behind the art. Background modes: checker (default in the item lab),
   solid neutral (default in dress-up), custom color (preview against the game background).
3. **Checker:** two neutrals ≤ 6 % apart in luminance (light `#e9e9ec`/`#f4f4f6`, dark `#2a2a2d`/`#323235`), with each square
   a multiple of the sprite pixel size so it doesn't moiré.
4. **Overlays** are drawn on a second canvas at device resolution: pixel grid from 8×, pivot, slot rect, QA heatmap
   (S1 colors: green added, red body changed, blue drift, magenta erased). They are off by default and live under "Details".
5. **One playback clock** per animation drives every visible direction (as in M5). Space toggles play/pause, `,`/`.` step a
   frame, `1–4` pick a direction, `0` shows all directions.
6. **Accessibility:** the canvas gets `role="img"` and an `aria-label` such as "Knight, walking, facing south, wearing Iron
   helmet and Leather vest". Thumbnails get alt text with the item name.

---

## 4. Information architecture

### 4.1 Objects (what users think in)

```
Project ("Knight")                      ← one character = one frozen rig (baseHash)
├── Character (base body + moves + directions)          [rig, freeze, skeleton: hidden]
├── Wardrobe
│   ├── Slot group  Head · Hair · Face · Body · Legs · Feet · Back · Hands
│   │   └── Item  ("Iron helmet")  — versions, colors (materials), layer order, QA status   [routes, key color: hidden]
├── Outfits  (saved combinations = manifest presets)
└── Exports  (last settings remembered)
App-level: Activity (job queue + costs), Account (PixelLab key, balance), Settings
```

The 16 architecture slots are grouped into 8 user-facing groups (two levels, HIG). The group's sub-slot is chosen by the item
prompt plus a "Where does it go?" picker, defaulted, in Details:

| Group | Slots | Group | Slots |
|---|---|---|---|
| Head | `head` (hats, helmets) | Legs | `legs`, `waist` |
| Hair | `hair`, `facial_hair` | Feet | `feet` |
| Face | `face_acc` (glasses, masks) | Back | `back` (capes, wings, backpacks) |
| Body | `torso_inner`, `torso_outer`, `shoulders`, `arms`, `neck` | Hands | `main_hand`, `off_hand` |

### 4.2 Screen list

| # | Screen | Surface | Built from | Default visible | Behind "Details" / Developer |
|---|---|---|---|---|---|
| S0 | **Home / Projects** | page | – | Character cards (animated thumbnails), New character, Open demo, Import .zip | storage usage, persist status |
| S1 | **Create character** | full-page flow with 3 steps | M1 + M2 | Describe → Moves → Generate → Review → "Looks good" | seed, view, base size (48/64, O14), mannequin template, rig QA table, keypoints, anchors |
| S2 | **Studio** (main) | sidebar + canvas + inspector | M4 | Wardrobe, live preview, inspector for the selection | z override per direction, hides matrix |
| S3 | **New item** | sheet | M3 | Slot, "What is it?", optional color hint, Make · 30 gens | key color, budget (rigid) mode, which moves, seed, extractor knob |
| S4 | **Item inspector** | inspector pane / phone sheet | M3 + M4 | Preview, colors, "In front of / behind", Try again, Remove | QA gates + heatmap per cell, versions, provenance, layer split |
| S5 | **Colors** | inspector tab / phone tab | M4 | Material swatch rows (Skin, Hair, Eyes, item materials), link toggles, Randomize | ramp editor, OKLab snap stats |
| S6 | **Moves** | inspector tab / phone tab | M2 | Animation list with play, Add move (cost shown), direction count | playlist ms, frame order, cells |
| S7 | **Outfits** | sidebar section / phone list | M4 | Saved looks, Save current | preset ids |
| S8 | **Export** | sheet | M5 | Engine cards (Godot, Unity, Phaser, PNG sheets), Download | split mode, baked toggle, file list, warnings |
| S9 | **Activity** | popover (desktop) / sheet from the accessory (phone) | M1 | Running and queued jobs: label, step, time left, cost. Balance. | raw ledger: endpoint, job ids, attempts, concurrency |
| S10 | **Connect PixelLab** | sheet | M1 | Paste key, "Remember on this device" (off), Get a key ↗, privacy line | dev key (DEV only) |
| S11 | **Settings** | sheet / page | – | Appearance (System/Light/Dark), Reduce transparency (B only), Cost confirmation threshold, Notifications | Developer mode (exposes M1–M5 benches), concurrency, clear data |

The M1–M5 benches stay reachable under **Settings → Developer**. They are the team's debugging tools.

### 4.3 Navigation model per size class

| Size class | Breakpoint (CSS) | Layout | Areas | Tasks |
|---|---|---|---|---|
| **Expanded** desktop / laptop / iPad landscape | `width ≥ 1024px` | 3 panes: sidebar 240, canvas flex, inspector 280. Toolbar 44 px. | Sidebar sections: Wardrobe, Outfits, Character | Centered sheets (max 560 px), popovers for Activity and menus |
| **Medium** tablet portrait / small laptop window | `600–1023px` | 2 panes: canvas + inspector (320). Sidebar is an overlay drawer (toolbar toggle, edge swipe). | same | same |
| **Compact** phone portrait | `width < 600px` | Canvas pinned at the top (~42 % of height, integer zoom), panel scrolling below, floating tab bar (3 tabs) + accessory. Toolbar 44 px. | Tabs: **Wardrobe · Colors · Moves** | Bottom sheets with medium/large detents and a grabber |
| **Compact height** phone landscape | `height < 500px and orientation: landscape` | Canvas square on the leading side (full height). Trailing column with a segmented control (Wardrobe / Colors / Moves). Toolbar merges into the column header. **No bottom tab bar.** | Segmented control instead of tabs | Sheets become trailing side panels (max 60 % width), so the canvas stays visible |

Touch vs mouse is decided by `@media (pointer: coarse)` (44 px targets, larger type) and not by width, so a touch laptop or an
iPad with a keyboard gets the right density. Safe areas use `env(safe-area-inset-*)`, and `100dvh` sets heights.

---

## 5. User flows

### 5.1 First run (no key, no project)

```
Home (empty) ──▶ "Try the demo knight" ──▶ Studio (demo, read-only rig, items: helmet, vest, sword)
     │                                         │  tip (once): "Tap an item to wear it"
     │                                         ├─▶ Dress up / recolor / play / turn  (free, instant)
     │                                         └─▶ Export ▸ Godot ▸ Download   (works without a key)
     └──▶ "New character" ──▶ S1 Describe ──▶ [Generate · ≈12 gens] ──▶ no key? ──▶ S10 Connect PixelLab (sheet)
                                                                                    └─▶ back to Generate, nothing lost
```

- The demo uses the bundled S1 fixture (`app/public/fixtures/s1`), so there is no wait and no cost (HIG: bundle enough content
  to start right away).
- The key is asked for **in context**, at the first action that spends. The sheet explains three things in one line each:
  - What it is: "Your PixelLab key lets PixelDoll draw for you. Generations come from your PixelLab account."
  - Where it goes: "Sent only to api.pixellab.ai."
  - Where it is kept: "In this tab only, unless you choose Remember."
- A "Get a key ↗" link goes to pixellab.ai.

### 5.2 Happy path (4 decisions)

```
1 Create character                 2 Add items                        3 Dress up                   4 Export
──────────────────                 ───────────                        ──────────                   ────────
Describe ─▶ Moves ─▶ Generate      Wardrobe ▸ Head ▸ + New            tap item = wear              Export ▸ Godot
"A stocky dwarf,   Idle ✓ Walk ✓   "What is it?"  [Iron helmet ]      tap swatch = recolor        [Download zip]
 tan skin"         Punch □ (+20)   [Make · 30 gens · ~5 min]          ⟲ turn  ▶ play  ⚄ random     (remembers choice)
                   4 directions    ──▶ card appears in the slot with   Save as outfit
[Generate · 12 gens · ~6 min]          a progress ring; keep working
──▶ progress card (leave anytime)  ──▶ first preview after ~2 min
──▶ Review: all 4 directions           (can "Stop & try again")
    animated; warnings in words    ──▶ "Clean" badge → auto-wears
──▶ [Looks good]  (= freeze)
```

Defaults that remove decisions:

- Directions: 4 (west mirrored).
- Moves: idle + walk.
- Base size: 48 + pad.
- Key color: chosen from the prompt.
- Budget mode: on automatically for rigid slots in idle/walk.
- Item route: chroma.
- Re-rolls: 2 automatic.
- New items auto-wear.
- Export: the last engine, all items and outfits, baked composites.

Option: an **"Ask me to approve each item's first preview"** setting, off by default. With it on, the remaining 20 gens wait for
an OK. That is architecture §11's "one optional design approval".

### 5.3 Long generations (minutes)

- **Where:**
  - The item card in the wardrobe shows a progress ring and "2:40 left".
  - The **Activity** control in the toolbar (desktop) or the **accessory capsule** above the tab bar (phone) shows "2 items
    generating · ~4 min".
  - The page title shows "(2) PixelDoll".
- **Honest estimates:**
  - Use the median duration per endpoint and cell count from the local ledger, seeded with the measured values (base ~240–290 s,
    template batch 70–140 s, 16-cell edit ~100–160 s).
  - Use `last_response.progress` when the server gives it, clamped at ≤ 1 (B1 saw 1.11).
  - The label says the step: "Drawing", "Animating walk (south, east, north)", "Adding Iron helmet 1/3", "Checking".
  - Never show fast-then-stalled pacing. If the time runs past the estimate, the label becomes "Taking longer than usual —
    PixelLab is busy" rather than freezing.
- **Non-blocking:** every other screen stays usable. Pending cells render as skeleton tiles, and the base silhouette fills them
  as soon as layers arrive.
- **Leave and come back:** the ledger already resumes jobs after a reload (M1). Say so on the progress card: "You can close
  this tab — we'll pick up where we left off." Offer **"Notify me when done"** (Notification permission, asked in context the
  first time a job over 60 s starts).
- **Cancel:**
  - "Stop" on a queued item is free.
  - On a submitted job: "Stop waiting? The generations already started can't be refunded." The result is still saved if it
    arrives.

### 5.4 Cost transparency

- **Every spending button names its price:** "Generate · 12 gens", "Make · 30 gens", "Try again · 30 gens", "Add Punch · 20
  gens". The button itself is the confirmation.
- **An extra confirm** appears only when a single action is above the user threshold (default 50 gens), or when the balance
  is too low: "You have 18 gens left; this needs 30. Top up at PixelLab ↗".
- **Balance** stays in the toolbar trailing group ("1,840 gens"), refreshed after each settled job (as `TopBar.svelte` does
  today). The full breakdown is in Activity:
  - spent this session;
  - per job;
  - the note that "template animations report dollars; generations are reconciled from your balance" (B1 finding).
- **Project estimate** on Home and the S1 Review: "A character with 10 items costs about 300 gens."
- **Terminology:** use PixelLab's word **"generations" (gens)** everywhere. No invented "credits".

### 5.5 Errors (mapped from the queue's states)

| Cause | User sees | Action |
|---|---|---|
| 401 bad key | Sheet: "PixelLab didn't accept this key." | Paste a new key. The queue resumes. |
| 402 out of gens | Banner: "Out of generations." | Top up ↗. Jobs stay queued. |
| 429 / 5xx / network | Nothing at first (auto backoff). After 30 s: "Waiting for PixelLab…" in Activity. | Automatic. |
| Offline | Banner: "You're offline — generations will continue when you're back." | Automatic. |
| Content policy (`code 5000`) | Card: "PixelLab declined this prompt. Try different words (avoid describing the body)." | Edit the prompt. Never auto-retried. |
| QA fail after 2 re-rolls | Badge "Needs a look". The inspector shows the best version with a plain reason ("Parts of the helmet flicker between frames"). | Keep anyway / Try again · 30 / Try with another key color (Details). |
| Stale item (base changed) | Badge "Made for an older body". | Regenerate for this body · 30. |
| Export warning (e.g. clipped weapon) | Inline in the Export sheet. | Export anyway. |

The tone is plain, blame-free and specific. Every error offers one next step.

### 5.6 Undo

- One **command history** per project (store `project.ts` is already planned to be command-based):
  - Covered: wear/unwear, recolor (a slider or picker drag batches into one entry), layer order, hides, rename, outfit save,
    delete item (soft delete).
  - Shortcuts: `⌘/Ctrl+Z`, `⇧⌘Z` / `Ctrl+Y`. Toolbar ↶ ↷ on all sizes. Labels like "Undo Color Change" appear in the
    tooltip and menu.
- **Generations can't be undone** (gens are spent), but nothing is thrown away:
  - "Try again" keeps the previous result as **Version 1 / 2 / 3** in the item inspector, so going back to a previous version
    is itself undoable.
  - "Remove item" shows a toast "Removed Iron helmet · Undo" for 8 s and keeps the item recoverable until the project is
    closed.

### 5.7 Empty states (HIG: explain, never hide)

| Where | Content |
|---|---|
| Home, no projects | Pixel hero (E) + "Make a pixel character you can dress up" + **New character** (primary) + Try the demo · Import |
| Wardrobe slot, no items | Gray silhouette of the user's base in that slot + "No hats yet" + "+ Make one" |
| Outfits, none | "Save a look to switch between outfits in your game." + Save current look |
| Activity, idle | "Nothing generating." + balance |
| Moves, idle + walk only | List + "Add a move · from 20 gens" with template chips (Run, Punch, Jump…) |

---

## 6. Wireframes (ASCII)

Legend: `▣` item thumbnail, `◔` progress ring, `░▒` checker, `[ ]` button, `(•)` primary, `▾` menu.

### 6.1 Desktop, expanded (1440 × 900): Studio

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◧  Knight ▾                              ↶  ↷                         ◔ 2 · 1,840 gens   (• Export ⤓ )  ◨ │
├────────────────────┬─────────────────────────────────────────────────────────────────┬────────────────────┤
│ Wardrobe        ⌕  │                                                                 │ Iron helmet        │
│                    │                                                                 │ Head · ✓ Clean     │
│ Head           +   │                ░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒                     │ ┌────────────────┐ │
│  ▣ none ▣ Iron ▣ Wiz│                ▒                          ░                     │ │ ░▒ ▣ ▣ ▣ ▣ ░▒ │ │
│ Hair           +   │                ░        64 × 64 sprite    ▒                     │ └────────────────┘ │
│  ▣ none ▣ Bob      │                ▒          at 6×           ░                     │ Colors            │
│ Face           +   │                ░                          ▒                     │  Metal  ■■■■■ ▾    │
│ Body           +   │                ▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░                     │  Trim   ■■■   ▾    │
│  ▣ none ◔ Vest 2:40│                                                                 │ Layer              │
│ Legs · Feet    +   │       ┌──────────────────────────────────────────────────┐      │  In front of Hair ▾│
│ Back · Hands   +   │       │ ▶  Walk ▾    S  E  N  W  ⊞      − 6× +   ▦ ▾      │      │                    │
│ ────────────────── │       └──────────────────────────────────────────────────┘      │ [ Try again · 30 ] │
│ Outfits (2)        │                 frame strip ▫▫▪▫▫▫▫▫  (Details only)            │ [ Remove ]         │
│ Character          │                                                                 │ ▸ Details          │
└────────────────────┴─────────────────────────────────────────────────────────────────┴────────────────────┘
 ◧ / ◨ toggle sidebar / inspector · ⊞ all directions · ▦ background (checker / solid / custom)
```

### 6.2 Desktop: New item (centered sheet over the Studio)

```
                 ┌──────────────────────────────────────────────┐
                 │ Cancel            New item                    │
                 │                                               │
                 │ Where      [ Head ▾ ]                         │
                 │ What is it?                                   │
                 │ ┌───────────────────────────────────────────┐ │
                 │ │ an iron knight helmet with a visor        │ │
                 │ └───────────────────────────────────────────┘ │
                 │ Ideas: (wizard hat) (crown) (hood) (bandana)  │
                 │ Color hint (optional)  ○ ● ● ● ● +           │
                 │                                               │
                 │ ▸ Details  (moves: Idle, Walk · budget mode   │
                 │            on · key color: auto · seed)      │
                 │                                               │
                 │ About 5 min. You can keep working.            │
                 │                         (• Make · 30 gens )   │
                 └──────────────────────────────────────────────┘
```

### 6.3 Desktop: Create character (full-page flow, step 1 of 3)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ ✕  New character                     ① Describe ── ② Moves ── ③ Generate                  │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│   Describe the body — clothes and hair come later.         ┌─────────────────────┐        │
│   ┌──────────────────────────────────────────────────┐     │   ░▒░▒░▒░▒░▒░▒░▒   │        │
│   │ a stocky dwarf, tan skin, friendly face          │     │   ▒  example      ░ │        │
│   └──────────────────────────────────────────────────┘     │   ░  mannequin    ▒ │        │
│   Skin   ● ● ● ● ● ● +       Build  (slim) (•average) (stocky)│ ▒░▒░▒░▒░▒░▒░▒░▒   │        │
│   View   (•low top-down) (side)                            └─────────────────────┘        │
│   ▸ Details (seed · base size 48+pad · template)                                          │
│                                                                           [ Next › ]      │
└───────────────────────────────────────────────────────────────────────────────────────────┘
 Step ③ shows: "Generate · 12 gens · about 6 min" → progress card with steps
 (Drawing ✓ · Animating idle ◔ · Animating walk · Finding joints) → Review grid (idle/walk × S E N W, animated)
 → warnings in words → [ Try another · 2 gens ]  (• Looks good )
```

### 6.4 Phone portrait (390 × 844): Studio, Wardrobe tab

```
┌──────────────────────────────────┐
│ ‹ Home   Knight ▾     ↶  ↷   ⤓   │  toolbar (44)
│ ┌──────────────────────────────┐ │
│ │ ░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░ │ │
│ │ ▒                          ░ │ │  canvas (≈42 % height,
│ │ ░        sprite 5×         ▒ │ │  integer zoom)
│ │ ▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒ │ │
│ │  ▶  Walk ▾   S E N W   ⊞    │ │  floating canvas bar
│ └──────────────────────────────┘ │
│ (Head) Hair  Face  Body  Legs  … │  slot chips, scroll →
│ ┌──────┐┌──────┐┌──────┐┌──────┐ │
│ │ none ││▣ Iron││▣ Wiz ││  +   │ │  item grid (44+ targets)
│ └──────┘└──────┘└──────┘└──────┘ │
│ Iron helmet · ✓ Clean        ⓘ  │  ⓘ opens S4 as a sheet
│ Metal ■■■■■   Trim ■■■           │
│                                  │
│ ╭──────────────────────────────╮ │
│ │ ◔ Leather vest · 2 min left ⌃│ │  accessory → Activity sheet
│ ╰──────────────────────────────╯ │
│ ╭──────────────────────────────╮ │
│ │   Wardrobe   Colors   Moves  │ │  floating tab bar
│ ╰──────────────────────────────╯ │
└──────────────────────────────────┘
```

### 6.5 Phone portrait: New item (bottom sheet, medium → large detent)

```
┌──────────────────────────────────┐
│ (canvas stays visible, dimmed)   │
│                                  │
├──────────────── ═══ ─────────────┤  grabber
│ Cancel       New item            │
│ Where   [ Head ▾ ]               │
│ What is it?                      │
│ ┌──────────────────────────────┐ │
│ │ iron helmet with a visor     │ │
│ └──────────────────────────────┘ │
│ (wizard hat) (crown) (hood)      │
│ ▸ Details                        │
│ About 5 min · keep working       │
│ ┌──────────────────────────────┐ │
│ │      Make · 30 gens          │ │  primary, full width
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### 6.6 Phone landscape (844 × 390): Studio

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────┐  ‹ Knight ▾              ↶ ↷   ◔2   ( ⤓ Export )   │
│ │ ░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒ │  [ Wardrobe | Colors | Moves ]                     │
│ │ ▒                       ░ │  Head  Hair  Face  Body  Legs  Feet  Back  Hands →  │
│ │ ░     sprite 4×         ▒ │  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐          │
│ │ ▒                       ░ │  │ none ││▣ Iron││▣ Wiz ││  +   ││      │          │
│ │ ░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒ │  └──────┘└──────┘└──────┘└──────┘└──────┘          │
│ │ ▶ Walk  S E N W  ⊞       │  Iron helmet · ✓ Clean   Metal ■■■■■  Trim ■■■   ⓘ │
│ └───────────────────────────┘                                                    │
└──────────────────────────────────────────────────────────────────────────────────┘
 Sheets open as a trailing panel over the right column; the canvas never gets covered.
```

### 6.7 Export (desktop sheet; phone uses the same content as a large-detent sheet)

```
┌──────────────────────────────────────────────────────┐
│ Cancel                 Export                          │
│ For which engine?                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │ (•)Godot │ │  Unity   │ │  Phaser  │ │ PNG+JSON │    │
│ │  4.x     │ │  6       │ │  3 / 4   │ │ any      │    │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│ Includes: 4 directions · 2 moves · 6 items · 2 outfits │
│ ▸ Details (split mode · baked composites · file list)  │
│ ! Sword is clipped at the edge in 2 frames  [Show]     │
│                                (• Download zip · 340 KB)│
└──────────────────────────────────────────────────────┘
```

### 6.8 Activity (desktop popover from `◔ 2`)

```
┌───────────────────────────────────────────┐
│ Generating                     1,840 gens │
│ ◔ Leather vest   Adding 2/3   2:40 · 30   │
│ ◔ Wizard hat     Checking     0:20 · 10   │
│ Queued                                    │
│ ○ Boots          waiting           · 30   │
│ Done today                                │
│ ✓ Iron helmet                 4:55 · 10   │
│ This session: 52 gens + $0.08             │
│ ▸ Details (ledger, job ids, concurrency)  │
└───────────────────────────────────────────┘
```

---

## 7. Ranking and recommendation

Scores run from 1 (poor) to 5 (best).

| Criterion (weight) | A Native | B Glass | C Pro dark | D Soft | E Pixel-accent |
|---|---|---|---|---|---|
| Casual friendliness (×3) | 5 | 4 | 2 | 5 | 4 |
| Pixel-art fit: color neutrality, crispness (×3) | 4 | 2 | 5 | 3 | 5 |
| Accessibility out of the box (×2) | 5 | 2 | 4 | 4 | 4 |
| Mobile performance (×1) | 5 | 2 | 5 | 4 | 5 |
| Build cost and maintenance (×2) | 5 | 3 | 4 | 4 | 4 |
| Distinctiveness / brand (×1) | 2 | 4 | 2 | 4 | 5 |
| **Weighted total (max 60)** | **54** | **34** | **44** | **48** | **53** |

**Ranked** (the order follows the scores):

1. **A Native minimal + E pixel accents (recommended).**
   - Apple's structure and restraint carry the IA (sidebar / canvas / inspector, sheets, tab bar + accessory).
   - It is neutral for color work, accessible by default, and costs no dependencies.
   - E adds the identity in about five places: logo, pixel display font for headings, stepped primary button,
     pixelarticons for slot glyphs and empty states, and `steps()` sparkle on job done.
   - C's dark palette becomes A's dark mode, and C's density becomes `data-density="compact"` for power users.
2. **E on its own.** It is the same thing with more retro. It could be offered as a selectable "Pixel" look later.
3. **D Soft playful.** It is great for onboarding warmth, but its pastel surround and toy feel undercut the "export to Godot"
   professionalism. Borrow its warmth in copy and empty states.
4. **C Pro dark.** Keep it as a mode, not a face.
5. **B Liquid Glass.** It is the most current on phones and the most fashionable, but it contradicts the content-first rule
   around pixel art, has unfixed contrast (1.14:1 over a light checker), re-blurs behind the animated canvas, and needs extra
   desktop components that GlassKit lacks. The user asked about it, so **still build it as a mockup** (GlassKit, chrome only)
   and judge from screenshots.

**Phase 6 mockup plan** (TODO "build multiple design/theme mockups"):

- Build **one** component set with three token blocks: **A+E**, **B** (GlassKit, chrome only) and **D**. Show light and dark.
- Screenshots at 1440 × 900, 820 × 1180, 390 × 844 portrait and 844 × 390 landscape.
- Screens: Studio, New item and Create-character review, all on the S1 fixture. That makes 3 looks × 2 themes × 4 viewports
  × 3 screens, scripted with the Browser pane.

## 8. Framework and tooling recommendation

| Topic | Recommendation | Why |
|---|---|---|
| UI framework | **Svelte 5** (5.57.2, runes) as an SPA. **Not SvelteKit.** Keep the tiny hash router in `App.svelte` (it is about 15 lines): `#/`, `#/p/<id>`, `#/p/<id>/new`, `#/settings`, `#/dev/m1…m5`. | GitHub Pages is static. Hash routing needs no 404 fallback. SvelteKit's adapters, SSR and file routing add nothing here. |
| Build | **Vite 8** (8.3.4, already in use). | It works, the build output is verified clean (B1), and it is zero-risk. |
| Vite+ | Optional. `vite-plus` 1.3.0 (MIT, VoidZero, now part of Cloudflare): 1.0 went stable in Oct 2026 and VoidZero calls it "a stability milestone rather than a finished product". It is one `vp` CLI bundling Vite 8, Vitest, Rolldown, tsdown, Oxlint and Oxfmt; it also manages the Node runtime and package manager, and adds `vp migrate` / `check` / `lint` / `fmt` / `test` ([InfoQ](https://infoq.com/news/2026/10/cloudflare-viteplus-stable), [Vite+ guide](https://viteplus.dev/guide/)). **Trial `vp migrate` on a branch once lint, format and unit tests are wanted.** Adopt it if `vp build`, the Svelte plugin and `npm run selftest` behave the same. | The gain is lint, format and test in one tool, not a better build. The runtime management is new surface area for a one-person project. |
| Language | **TypeScript** (6.0, already in use). Strict. | Already set up, and the manifest types exist. |
| CSS | **Plain CSS custom properties.** `src/styles/tokens.css` holds the semantic tokens (`--bg`, `--bg-side`, `--stage`, `--text*`, `--line`, `--accent*`, `--ok/warn/bad`, `--space-*`, `--radius-*`, `--control-h`, `--font-ui/display/mono`, `--dur-*`, `--ease`). Use `color-scheme: light dark` + `light-dark()` (Baseline 2024) for both themes in one declaration. Look blocks go under `[data-look]`, plus `[data-density="compact"]`, `@media (prefers-contrast: more)`, `(forced-colors: active)`, `(prefers-reduced-motion)` and `(prefers-reduced-transparency)`. `src/styles/base.css` (~150 lines) covers reset, type scale, focus ring and native control styling. Components use Svelte scoped `<style>`. | No build step, no class soup. Tokens make the five directions a swap, not a rewrite. |
| Components | **No UI kit.** Use the platform: `<dialog>` for modals and sheets, the `popover` attribute for menus and Activity, `<details>` for disclosures, native `<input type=range>`, `<select>` where it fits, and CSS `scroll-snap` for slot chips. Write about 12 small components: `Button`, `IconButton`, `Segmented`, `Sheet`, `Popover`, `Toast`, `Swatch`/`RampPicker`, `ItemCard`, `Progress`, `EmptyState`, `Canvas` (from M5), `Inspector` section. | Heavy kits (Skeleton, Flowbite, shadcn-svelte) bring their own look and weight. Bits UI is the fallback only if a combobox or menu gets hard. |
| Icons | **About 25 Lucide icons inlined** as path strings in one `Icon.svelte` (copied from `lucide-static`, ISC). Add `@lucide/svelte` (1.60.0, per-icon imports) only if the count grows past ~40. **pixelarticons** (MIT) for the few brand glyphs (E). | Zero runtime dependency, tree-shaken by construction. |
| Fonts | System stack (A). Display: Pixelify Sans or Silkscreen via `@fontsource/*` (OFL), latin subset, `font-display: swap`, preloaded (≈ 10–20 KB). | Body legibility; tiny cost. |
| State | Svelte 5 runes stores in `lib/store/` (project command history for undo), with IndexedDB already in place. | As the architecture says. |
| Quality gates | `svelte-check`, the existing Node self-tests, axe-core run in the Browser pane for the mockups, and contrast checks on the tokens (script in CI later). | Accessibility is a requirement (casual users, mobile). |

**Accessibility baseline (all looks):**

- WCAG 2.2 AA: text 4.5:1, UI and graphics 3:1.
- 2 px focus ring with a 2 px offset.
- Targets ≥ 24 px with a mouse, ≥ 44 px with `pointer: coarse`.
- Every icon button has an `aria-label` and a tooltip.
- `aria-live="polite"` for job completion.
- The full keyboard path covers every flow.
- Reduced motion stops UI motion but not user-initiated sprite playback.

## 9. Open questions for the user

1. Pick a look after screenshots: A+E (recommended), B glass or D soft.
2. Default item flow: **auto-finish** (minimal human work, the default) or **approve the first preview** (saves gens on bad
   designs)?
3. Is it OK to bundle the S1 knight fixture as the public demo (it is PixelLab output from the team's account)?
4. Base size O14: is the smaller 48 + pad figure acceptable in the studio preview? It affects the default zoom and the hero
   look.
5. Branding: name, logo and accent color (E proposes a Sweetie-16-style blue + gold).

## 10. Sources

- Apple:
  - Liquid Glass overview: <https://developer.apple.com/documentation/technologyoverviews/liquid-glass>
  - Adopting Liquid Glass: <https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass>
  - HIG Materials: <https://developer.apple.com/design/human-interface-guidelines/materials>
  - HIG Sidebars: <https://developer.apple.com/design/human-interface-guidelines/sidebars>
  - HIG Split views: <https://developer.apple.com/design/human-interface-guidelines/split-views>
  - HIG Toolbars: <https://developer.apple.com/design/human-interface-guidelines/toolbars>
  - HIG Tab bars: <https://developer.apple.com/design/human-interface-guidelines/tab-bars>
  - HIG Sheets: <https://developer.apple.com/design/human-interface-guidelines/sheets>
  - HIG Onboarding: <https://developer.apple.com/design/human-interface-guidelines/onboarding>
  - HIG Progress indicators: <https://developer.apple.com/design/human-interface-guidelines/progress-indicators>
  - HIG Loading: <https://developer.apple.com/design/human-interface-guidelines/loading>
  - HIG Undo and redo: <https://developer.apple.com/design/human-interface-guidelines/undo-and-redo>
  - The HIG pages were read through their DocC JSON (`/tutorials/data/design/human-interface-guidelines/<page>.json`), because
    the HTML is client-rendered.
- Liquid Glass legibility follow-ups:
  - <https://tidbits.com/2025/10/21/ios-26-1-to-add-optional-opacity-to-liquid-glass/>
  - <https://sixcolors.com/post/2025/11/soaping-up-liquid-glass-less-transparency-more-contrast/>
- Web platform:
  - <https://caniuse.com/wf-prefers-reduced-transparency>
  - <https://developer.chrome.com/blog/css-prefers-reduced-transparency>
  - <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency>
  - backdrop-filter recipes and performance (secondary source): <https://www.buildmvpfast.com/blog/liquid-glass-css-backdrop-filter-recipes-2026>
- GlassKit:
  - <https://glasskit.jungherz.com/>
  - <https://github.com/JUNGHERZ/GlassKit> (v1.29.0 source read locally)
  - Review: [`glasskit_review.md`](glasskit_review.md)
- Vite+:
  - <https://infoq.com/news/2026/10/cloudflare-viteplus-stable>
  - <https://viteplus.dev/guide/>
  - npm `vite-plus@1.3.0` (MIT)
  - npm `vite@8.3.4`, `svelte@5.57.2`
- Icons and fonts (npm, checked 2026-10-20):
  - `lucide-static` / `@lucide/svelte` 1.60.0 (ISC)
  - `pixelarticons` 2.4.2 (MIT)
  - `@phosphor-icons/core` 2.1.1 (MIT)
  - `@fontsource/pixelify-sans`, `@fontsource/silkscreen`, `@fontsource-variable/inter` (OFL-1.1)
- Prior art (UX patterns): [R5 tools survey](../research/tools/paperdoll_tools_survey.md), covering the LPC generator,
  Picrew, fralonra PpdEditor and RPG Maker MZ.
