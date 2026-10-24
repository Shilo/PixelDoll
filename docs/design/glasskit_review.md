# GlassKit review (D1, 2026-10-20)

Subject: GlassKit by Jungherz GmbH, <https://glasskit.jungherz.com/>, <https://github.com/JUNGHERZ/GlassKit>.
Source read from a depth-1 clone at `C:\Programming_Files\Shilocity\PixelLab\checkouts\GlassKit`
(HEAD `7651fe2`, v1.29.0, "A count per segmented option"). Context: should PixelDoll (Svelte 5 + Vite, pixel-art paperdoll
tool, casual users, desktop + mobile) use it as a theme foundation? Companion to [`D1_design_research.md`](D1_design_research.md).

**Verdict:** Don't use it as PixelDoll's foundation. Use it as-is for the **Liquid Glass mockup (direction B)** so the user can
judge glass from real screenshots. Treat it as a reference for tokens (density, surface presets) and for mobile patterns
(sheet, floating tab bar plus accessory, empty state, toast with action). If the user picks glass after the screenshots, pin
an exact version and limit it to the chrome (toolbar, tab bar, sheets, popovers). The pixel canvas, the wardrobe and the
color pickers stay on solid, neutral surfaces.

---

## 1. What it is

| Aspect | Finding |
|---|---|
| Type | **One CSS file** (`glasskit.css`, 3,328 lines) with BEM-like `glass-*` component classes and `--gl-*` design tokens. CSS-only, framework-agnostic. Works with Svelte through plain class names. |
| JS | Optional `glasskit-droplet.js` (11.3 KB raw, ESM, no dependencies) adds the iOS-26-style "droplet" that glides the selection along tab bars and segmented controls. `glasskit-styles.js` (generated at publish time) exports a constructable stylesheet for shadow DOM. |
| Family | GlassKit Elements (vanilla web components `glk-*`) and GlassKit Web (Astro template) sit on top. Neither is needed with Svelte. |
| License | **MIT** (© 2026 Jungherz GmbH). |
| Distribution | npm `@jungherz-de/glasskit` (files: css, min.css + map, styles.js, droplet.js, theme-override.css, docs). CDN via jsDelivr and unpkg. |
| Size (measured) | `glasskit.css` 151,467 B raw / **30.8 KB gzip**. Minified with clean-css `-O2`: 92.7 KB / **13.7 KB gzip**. The README still claims "51 KB raw / 39 KB minified / 6.5 KB gzipped", which is stale by about 3×. |
| Components (34) | Background (aurora), nav bar, pill button, tab bar (fixed, floating, with accessory capsule, droplet), accordion, divider, title, card (+glow), badge/chip, avatar, status, grouped list, skeleton, table, prose, segmented, steps, sheet (bottom), empty state, buttons (primary/secondary/tertiary, sm/lg), modal (native `<dialog>`), toast (with action and close), popover, input (+prefix/suffix), textarea, select, search, toggle, checkbox, radio, range, progress, date strip, calendar, image picker, theme toggle, plus a few utilities (`gl-stack`, `gl-row`, spacing, text). |
| Theming | `data-theme="dark"` (default, also `:root`) / `"light"` on `<html>`. Rebrand with two tokens (`--gl-color-primary`, `--gl-color-primary-dark`). Everything else is derived with `color-mix()`. `data-density="compact"` turns controls down (inputs 52 → 40 px, buttons 56 → 40 px). `data-surface="solid"` gives opaque surfaces with blur and gloss off. `data-surface="tint"` gives see-through tints with no blur. |
| Browser floor | `color-mix()` sets it: Chrome/Edge 111, Safari 16.4, Firefox 113, Samsung 22. Later features (`lh`, `:has()`, `:dir()`) fall back quietly. Without `backdrop-filter`, surfaces fall back to their background colors. |
| Maintenance | Repo created **2026-03-21**. 68 commits, 42 changelog releases in 7 months (latest 1.29.0, 2026-10-21 CEST), effectively **one contributor** (`dobexx`), 15 stars, 0 forks, 0 open issues. The changelog is very detailed and claims additive changes ("No class was renamed or removed"). High velocity, bus factor 1. |
| Docs | `docs.html` (live previews), `showcase.html`, German translations, and `SKILL.md` (114 KB LLM-oriented reference with markup rules and common mistakes). |

## 2. Accessibility audit (source + measurements)

Counts are taken from `glasskit.css`.

| Check | Result |
|---|---|
| `prefers-reduced-motion` | 3 blocks only: droplet, skeleton shimmer, sheet slide. Other transitions (`--gl-transition: all .25s`) stay on. |
| `prefers-reduced-transparency` | **Not handled** (0). The app has to map it to `data-surface="solid"` itself. The media query only works in Chromium (Chrome/Edge 118–119+); Safari and Firefox don't support it ([caniuse](https://caniuse.com/wf-prefers-reduced-transparency), [Chrome blog](https://developer.chrome.com/blog/css-prefers-reduced-transparency)). So the app also needs a manual setting. |
| `prefers-contrast`, `forced-colors` | **Not handled** (0 / 0). |
| `prefers-color-scheme` | **Not handled** (0). Dark is the default regardless of the OS. The app must set `data-theme` from `matchMedia` and listen for changes. |
| Focus | 18 `:focus-visible` rules plus a primary-derived focus ring. |
| Touch targets | 44 px minimum is a stated rule, and toast close / action keep 44 px hit areas. |
| Text contrast (vendor-measured) | Badges were raised to WCAG AA in 1.7.0 (4.6–4.9:1). **The primary button is knowingly left at 2.03:1** (white on amber) in dark and 2.68:1 in light. The documented escape hatch is a dark `--gl-color-on-primary`. |
| Text contrast (D1 calculation, alpha-composited, blur ignored) | Dark theme muted text (60 % white) on `--gl-surface-2` over the GlassKit background: **4.26:1**, below AA. Light theme muted text (55 % ink) on a 0.55 white surface: **2.4–3.5:1**, below AA. Glass contrast depends on the backdrop: dark-theme white text on a dark glass card over a **light checkerboard (#eee) is 1.14:1**, and over a skin-colored sprite area 1.33:1. The light theme survives light backdrops (13.8:1) but its muted text fails everywhere. |
| RTL, print | Handled (`:dir(rtl)` pairs, print color preservation). |

Apple's own guidance makes the same point: use the regular (more opaque) variant for text-heavy surfaces, use clear glass only
over visually rich media, add a ~35 % dimming layer under bright content, and respect Reduce Transparency and Increase Contrast
([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)). GlassKit's surfaces sit
between "regular" and "clear" and have no automatic adaptation.

## 3. Performance (backdrop-filter)

- 51 `backdrop-filter` declarations (25 with the `-webkit-` prefix). Blur radii are 12 / 16 / 24 / 40 px. The sheet uses 40 px.
- Each blurred surface is its own compositing layer that re-samples what is behind it. **PixelDoll's preview canvas animates
  continuously** (idle and walk playlists at 100–150 ms per frame), so any glass over or next to the stage re-blurs on every
  sprite frame. That is cheap on desktop GPUs and noticeable on low-end phones. Community guidance is to keep at most 3–4 glass
  surfaces per viewport, use ≤ 20 px blur on large bars, never animate the blur radius, and fade with opacity instead
  ([buildmvpfast recipes](https://www.buildmvpfast.com/blog/liquid-glass-css-backdrop-filter-recipes-2026), a secondary
  source). Apple also tells native apps to group glass to keep rendering cheap
  ([Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).
- GlassKit writes `-webkit-backdrop-filter: blur(var(--gl-blur-heavy))`. One secondary source claims Safari doesn't resolve
  custom properties inside the prefixed property. This is unverified and should be checked on iOS Safari before trusting the
  sheet blur.

## 4. Fit for a pixel-art tool

**Pros**

- MIT, zero dependencies, CSS-only. It drops into Svelte with one `import '@jungherz-de/glasskit/glasskit.css'` and no
  wrapper components.
- Good tokens (spacing, radius, density, surfaces). The **solid preset turns all glass off with one attribute**, which makes a
  reduced-transparency fallback trivial.
- It already has the mobile pieces the PixelDoll IA needs: bottom **sheet** (new item, export, key), **floating tab bar with
  an accessory capsule** (a natural "2 items generating · 3 min" job indicator, like Apple's MiniPlayer accessory),
  **segmented** (directions S/E/N/W, animation picker), **steps** (create-character wizard), **toast with action** (undo),
  **empty state**, **progress**, **image picker** (PNG import), **badge** (QA status), **skeleton** (pending cells).
- The droplet is a polished, tasteful Liquid Glass gesture, and it respects reduced motion.

**Cons**

- **Glass behind or around pixel art fights the medium.** Blur smears the sprite's colors under the chrome, and the tinted,
  aurora-lit surfaces (teal/amber `--gl-bg-aurora-*`) shift how the colors next to them read. Recoloring materials needs a
  **neutral surround**, as in photo editors. PixelDoll must not use `.glass-bg`.
- **Mobile-first sizing.** Default inputs are 52 px and buttons 56 px. Compact is still 40 px. A desktop inspector wants
  28–32 px rows. Every panel would need overrides.
- **Missing desktop structure.** There is no sidebar or split view, no resizable inspector, no toolbar with groups, no tooltip,
  no menu, no tree or selectable list at desktop density, no color-ramp picker, no number stepper. These make up most of
  PixelDoll's desktop UI, so they would be custom CSS in a second vocabulary next to `glass-*`.
- **Accessibility gaps** (§2): no color-scheme, contrast or transparency media queries, a sub-AA primary button and muted text.
  Text over glass has no fixed contrast, which is worst on a light checkerboard.
- **Dark-by-default** with an attribute toggle only. The app must add OS sync.
- **Size.** 13.7 KB gzip of CSS, most of it unused (calendar, date strip, prose, table…). That is acceptable but not "tiny".
- **Bus factor 1, very high churn** (about 6 releases per month). Pin an exact version. Don't use `@latest` as the README
  suggests.

## 5. How it would integrate with Svelte 5 (if chosen)

```ts
// main.ts
import '@jungherz-de/glasskit/glasskit.css'            // pinned exact version in package.json
const mq = matchMedia('(prefers-color-scheme: dark)')
const sync = () => (document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light')
sync(); mq.addEventListener('change', sync)
if (matchMedia('(prefers-reduced-transparency: reduce)').matches) document.documentElement.dataset.surface = 'solid'
```

```svelte
<!-- droplet as a Svelte attachment; state stays in Svelte (aria-pressed), the drop follows -->
<script lang="ts">
  import { attachDroplet } from '@jungherz-de/glasskit/glasskit-droplet.js'
  let dir = $state('south')
  const droplet = (node: HTMLElement) => { const d = attachDroplet(node); return () => d.destroy() }
</script>
<div class="glass-segmented glass-segmented--droplet" role="group" {@attach droplet}>
  {#each ['south', 'east', 'north', 'west'] as d}
    <button class="glass-segmented__item" aria-pressed={dir === d} onclick={() => (dir = d)}>{d[0].toUpperCase()}</button>
  {/each}
</div>
```

- The modal is a native `<dialog class="glass-modal-overlay">` opened with `showModal()`, which works fine from an
  attachment or `bind:this`.
- The sheet toggles `.is-active` on `.glass-sheet-overlay`, which maps to Svelte `class:is-active={open}`.
- Svelte's scoped styles don't collide with `glass-*`. Overrides go in one `glass-overrides.css` loaded after the library.
- PixelDoll-specific tokens (canvas checker, accent) would be mapped onto `--gl-*` in that file.

## 6. Recommendation

1. **Mockup B (Liquid Glass):** use GlassKit unmodified, rebranded to the PixelDoll accent, with `data-density="compact"` on
   desktop. Restrict glass to the toolbar, the floating tab bar plus accessory, sheets and popovers. Keep the canvas stage, the
   wardrobe and the inspector on solid surfaces. Screenshot both themes on desktop and phone.
2. **MVP:** unless the user prefers B after seeing it, build on the recommended **Native + pixel-accent** token set (plain CSS
   custom properties). Borrow GlassKit's ideas, not its file: density tokens, a `data-surface` switch, the sheet's detent
   behavior and the accessory-capsule pattern for job progress.
3. If B wins, then:
   - vendor or pin the exact version;
   - set `--gl-color-on-primary` to a dark ink (or pick a darker primary) so the primary button reaches AA;
   - darken the muted text tokens;
   - add `prefers-contrast` and `forced-colors` overrides;
   - ship a "Reduce transparency" setting that maps to `data-surface="solid"`.
