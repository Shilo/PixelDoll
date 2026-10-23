# Before Bronze UI versus the current prototype

2026-10-23. This is the requested historical baseline comparison. The previous `theme-0.2.0` gallery compared two Bronze UI versions and therefore did not answer this question. Its evidence remains intact for its original ownership-extraction purpose.

## Correct baseline

- **Before:** `003bef29bbb733f41fc0e2dc0707b8d5f317996a`, the immediate parent of `e2f2006` (the first Bronze UI prototype integration).
- **After:** prototype runtime at `274f737`, using the published Bronze UI 0.2.0 dependency from theme commit `d811d35`.
- The before entry imports `styles.css` and `glass-theme.css`. It is the last pre-Bronze prototype, including the historical restrained GlassKit study. It is not a Bronze component showcase or an earlier Bronze release.
- This comparison includes subsequent UI repairs and layout changes as well as the theme integration. Differences should not all be attributed to theme CSS alone.

## Capture method

Exported the baseline with `git archive` into `.runtime.tmp/pre-bronze-003bef2/`, preserving the active checkout. All 111 tracked prototype, compositing-library and fixture files were verified byte-for-byte against the baseline Git objects. The two untracked generated environment PNGs were copied unchanged from the current local art assets; both versions use that same art. The isolated snapshot reused installed build tools through a local dependency junction. It served on loopback port 5206 with environment loading disabled; the current prototype remained on 5202.

`capture-evidence.mjs` now accepts a source root and extra source-file fingerprints, allowing it to capture an isolated Git snapshot while recording that snapshot's actual files. Both manifests include source hashes, timestamps, image hashes and viewport dimensions. The historical theme CSS, material module and vendored stylesheet are included in its fingerprints. The same scripted screen interactions are used for before and after, with the existing Colours/Colors label compatibility.

Each side has 68 captures: selection, creation, Preview, Top-down, Side-scroller, customization panels, menus, dialogs and toast states. Mobile also includes scrolled creator sections. Desktop images are 1920×1080; phone images are 450×800; device scale is 1. Moving animation poses can differ with capture timing.

The original screenshots are unmodified. Joined pairs add only a 48px label strip above the two original, equal-size images. The gallery keeps them adjacent even on phones and offers actual-pixel horizontal scrolling and links to each original. Four overview boards cover every captured screen in each device/theme combination.

[Open the corrected comparison](http://127.0.0.1:5202/pre-bronze-review.html?device=desktop&theme=obsidian&screen=preview).

Local evidence: `evidence/pre-bronze-current/`. Generated screenshots remain local, following the repository's media policy.

## Verification

Both captures completed without page errors or external requests. Verified all 136 original image hashes and dimensions, all 68 joined-pair dimensions, and every recorded source fingerprint against the captured snapshot/current files. Eight gallery device/theme/viewport combinations passed image-loading, filter, fit-width, overflow and actual-pixel checks. The corrected gallery was also inspected in the Codex browser; dark desktop Preview and light phone Preview pairs were reviewed visually. No application styling or behavior was changed in this follow-up.
