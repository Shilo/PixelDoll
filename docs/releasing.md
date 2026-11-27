# Releasing

Releases are fully automatic: a scheduled workflow tags the build that was live at each release cutoff, writes notes with Claude, translates them, draws a banner and publishes a GitHub Release. The app shows the same notes in What's new. Nobody edits versions or publishes anything by hand.

## Pieces

- `app/version.ts` stays the only version source. A release's version is the shipped-commit count at the tagged commit.
- `releases/schedule.json` sets the cadence: `every` is `week`, `2 weeks` or `month` (the first `day` of the month), `day` is the weekday, `hourUtc` the hour, and `anchor` the first cutoff date (2-week cadence counts from it). A change applies after the last published release.
- `.github/workflows/release.yml` runs once a day shortly after the release hour, and on demand from the Actions tab (Run workflow). Each run publishes every cutoff that has passed since the last release, oldest first, so a missed run catches up. A run with nothing due exits in seconds.
- `app/scripts/release/` holds the release script (`npm run release -- --dry-run` from `app/`), its unit tests live in `app/test/unit/release-*.test.ts`.
- `docs/release-notes.md` and `docs/release-notes-translate.md` are the Claude instructions, sent verbatim (the translation prompt is followed by `app/src/locales/TRANSLATING.md`).
- `releases/<version>/` holds what the app shows; `releases/index.json` lists published releases, newest first.

## One release, step by step

1. Cutoff: the most recent scheduled time that has passed and has no release yet.
2. Build: the last successful `github-pages` deployment at or before the cutoff. Its version comes from the current counting function applied to that commit. If the version equals the previous release's, the period is skipped (nothing shipped).
3. Changes: commits since the previous release that touch shipped paths, of type `feat`, `fix` or `perf`, without test, dev, e2e, ci or agent scopes, with reverted pairs removed. They become the deterministic All changes list (New = feat, Improved = perf, Fixed = fix), each line "Scope: subject" linking to its commit.
4. Notes: Claude writes the headline, intro, optional English joke, 1 to 3 highlights and up to 3 noticeable fixes, each citing commits. The script validates the reply (citations, word limits, banned words, no emoji, links or ALL CAPS) and fails the run on any violation; the next run retries.
5. Translation: the AI-written fields are translated into every app locale. A locale that fails validation falls back to English for that release.
6. Banner: a static pixel-art PNG of the demo character, composed from curated outfits, moves, directions and backdrops, different from recent releases.
7. Publish, resumable at every step: commit `releases/<version>/` (not yet listed), create the tag `v<version>` on the build from step 2, create a draft release with the banner, verify, publish, list it in `releases/index.json`, then start a Pages deploy so the app gets the notes. That deploy is skipped if `main` moved on meanwhile; the newer push deploys the notes instead.

## Setup (once)

1. In the Anthropic Console, create a workspace for releases with a monthly spend limit, keep auto-reload off, and create an API key in it.
2. In GitHub: Settings > Environments > New environment `release`, limited to the `main` branch, with secret `ANTHROPIC_API_KEY`.
3. Settings > Secrets and variables > Actions > Variables: set `RELEASES_ENABLED` to `true`. Until then the workflow only dry-runs.

## Dry run

From `app/`: `npm run release -- --dry-run [--until <ISO time>]` prints the cutoffs, chosen builds, versions and All changes lists without calling Claude or writing anything. Add `--notes` to also call Claude (needs `ANTHROPIC_API_KEY`; costs a few cents per release).

## Data format

The release script writes these files and the app reads them (served from `dist/releases/`, copied there by the build). All JSON is UTF-8; dates are `YYYY-MM-DD` (the cutoff date in UTC).

- `releases/index.json`: `{ "releases": [ { "version": "1.4.12", "date": "2026-11-27", "headline": { "en": "...", "de": "..." }, "features": 12 } ] }`, newest first, published releases only. `features` is the number of `feat` commits in the release; the app opens What's new by itself only when it is above 0. A folder that exists without an index entry is staged and ignored by the app.
- `releases/<version>/notes.<locale>.json` for `en` and every app locale that translated: `{ "headline": "", "intro": "", "joke": "", "highlights": [ { "title": "", "text": "" } ], "fixes": [ { "text": "" } ] }`. `joke` is empty in every locale except possibly `en`. A missing locale file means the app uses `notes.en.json`.
- `releases/<version>/changes.json`: `{ "total": 0, "groups": [ { "kind": "new" | "improved" | "fixed", "items": [ { "text": "Export: add a Phaser AE export with a shared version picker", "sha": "<full sha>" } ] } ] }`. Groups appear in that order and only when non-empty. Each item links to `https://github.com/Shilo/PixelDoll/commit/<sha>`.
- `releases/<version>/banner.png`: the banner at native pixel size (scale it with `image-rendering: pixelated`). Decorative: the app shows it with empty alt text.
- `releases/<version>/source.json`: the record the script resumes from: `{ "version", "date", "cutoff", "sha", "previousSha", "model", "commits": ["<full sha>"], "notes": <the validated English tool reply with commit citations> }`. The app never reads it.

The GitHub Release body renders the same notes in the same order as the app: headline (release title is "PixelDoll <version>: <headline>"), date and version, banner (a 4x copy uploaded as a release asset), intro and joke, highlights, Fixed, then a collapsed `<details><summary>All changes (N)</summary>` with the groups.
