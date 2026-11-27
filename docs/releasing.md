# Releasing

Releases are fully automatic: a scheduled workflow tags the build that was live at each release cutoff, writes notes with Claude, translates them, draws a banner and publishes a GitHub Release. The app shows the same notes in What's new. Nobody edits versions or publishes anything by hand.

## Pieces

- `app/version.ts` stays the only version source. A release's version is the shipped-commit count at the tagged commit.
- `releases/schedule.json` sets the UTC cadence. For `week` and `2 weeks`, cutoffs repeat every 7 or 14 days from `anchor` at `hourUtc`. For `month`, they fall on the first matching weekday `day` of each month at `hourUtc`, on or after `anchor`. A cadence change applies after the last published release or the cutoff already staged for publication.
- `.github/workflows/release.yml` runs at 15:17 UTC on the release day and the day after (a backup for a dropped run), and on demand from the Actions tab (Run workflow). Each run publishes every cutoff that has passed since the last release, oldest first, so a missed run catches up. A run with nothing due exits in seconds. Changing `day` or `hourUtc` also means changing the cron line; a unit test checks they match.
- `app/scripts/release/` holds the release script (`npm run release -- --dry-run` from `app/`), its unit tests live in `app/test/unit/release-*.test.ts`.
- `docs/release-notes.md` and `docs/release-notes-translate.md` are the Claude instructions, sent verbatim (the translation prompt is followed by `app/src/locales/TRANSLATING.md`).
- `releases/<version>/` holds what the app shows; `releases/index.json` lists published releases, newest first.

## One release, step by step

1. Process the scheduled cutoffs that have passed since the last published release, oldest first.
2. Select the last successful `github-pages` deployment at or before the cutoff, timed by its success status. The status must include an environment URL so that a skipped stale build does not count as a deployment. The current counting function applied to the deployed commit gives its version. Skip the cutoff if no successful deployment exists yet or if its version equals the previous release's.
3. Collect the commits since the previous release that touch shipped paths, of type `feat`, `fix` or `perf` and without test, dev, e2e, ci or agent scopes. Remove explicitly identified revert pairs. The first release includes history from the repository root. These commits become the deterministic All changes list (New = feat, Improved = perf, Fixed = fix). Each entry links to its commit and capitalizes the first letter of the scope and subject. When the scope is empty, the entry contains just the subject.
4. Claude writes the headline, intro, optional English joke, 1 to 3 highlights and up to 3 noticeable fixes. Each highlight and fix cites commits. The script checks citations, word limits and plain prose, allows known acronyms such as PNG, and sends the validation errors back to Claude once if needed. A second invalid reply fails the run. When the version changed and there are no qualifying commits, the script uses a short maintenance message with no highlights or fixes.
5. Translation: the AI-written fields are translated into every app locale. Each request also carries `labels`: every short app label from `app/src/locales/en.json` that appears verbatim in the English notes, mapped to the same key in the target locale, so named controls match the app. A locale that fails validation falls back to English for that release.
6. Banner: a static pixel-art PNG of the demo character, composed from curated outfits, moves, directions and backdrops, different from recent releases.
7. Commit and push `releases/<version>/` before listing it so a later run can resume publication from the staged folder. Create the tag `v<version>` on the build from step 2, or verify an existing tag points to that build. Create or resume the draft release, upload and verify the 4x banner, publish, and check the tag again. Commit and push the entry in `releases/index.json`, then dispatch the Pages workflow on `main` with `deploy: true` so the app gets the notes. Pushes to `main` that change what ships also deploy the notes. A deploy only moves the site forward: it exits successfully with a notice when its build is older than the live site. A later release run requests a deploy again if the live site still lacks the newest index and a deploy for current `main` is not already pending.

## Setup (once)

1. In the Anthropic Console, create a workspace for releases with a monthly spend limit, keep auto-reload off, and create an API key in it.
2. In GitHub: Settings > Environments > New environment `release`, limited to the `main` branch, with secret `ANTHROPIC_API_KEY`.
3. Settings > Secrets and variables > Actions > Variables: set `RELEASES_ENABLED` to `true`. Until then the workflow only dry-runs. Once it is `true`, a missing key fails the run instead of skipping publication. The first enabled run backfills every weekly cutoff since the anchor (about six releases and their translations in one run).

The release workflow uses its built-in GitHub token to read deployments, publish tags and releases, push the generated commits to `main`, and dispatch Pages. The repository's rules for `main` must allow those generated commits.

## Dry run

From `app/`: `npm run release -- --dry-run [--until <ISO time>] [--max <n>]` prints the cutoffs, chosen builds, versions, commit counts and All changes lists. It also renders one in-memory banner to check that the fixture and Chromium work. Install Chromium with `npx playwright install chromium` if needed. Set `GITHUB_TOKEN` for authenticated deployment reads. Add `--notes` to also call Claude for the English notes (requires `ANTHROPIC_API_KEY` and uses paid API credits). Dry runs leave release files and GitHub unchanged.

## Data format

The release script writes these files and the app reads them (served from `dist/releases/`, copied there by the build). All JSON is UTF-8; dates are `YYYY-MM-DD` (the cutoff date in UTC).

- `releases/index.json`: `{ "releases": [ { "version": "1.4.12", "date": "2026-11-27", "headline": { "en": "...", "de": "..." }, "features": 12 } ] }`, newest first, published releases only. `features` is the number of `feat` commits in the release; the app opens What's new by itself only when it is above 0. A folder that exists without an index entry is staged and ignored by the app.
- `releases/<version>/notes.<locale>.json` for `en` and every app locale that translated: `{ "headline": "", "intro": "", "joke": "", "highlights": [ { "title": "", "text": "" } ], "fixes": [ { "text": "" } ] }`. `joke` is empty in every locale except possibly `en`. A missing locale file means the app uses `notes.en.json`.
- `releases/<version>/changes.json`: `{ "total": 0, "groups": [ { "kind": "new" | "improved" | "fixed", "items": [ { "text": "Export: add a Phaser AE export with a shared version picker", "sha": "<full sha>" } ] } ] }`. Groups appear in that order and only when non-empty. Each item links to `https://github.com/Shilo/PixelDoll/commit/<sha>`.
- `releases/<version>/banner.png`: the banner at native pixel size (scale it with `image-rendering: pixelated`). Decorative: the app shows it with empty alt text.
- `releases/<version>/source.json`: the record the script resumes from: `{ "version", "date", "cutoff", "sha", "previousSha", "model", "commits": ["<full sha>"], "notes": <the English notes with commit citations>, "bannerHash": "<SHA-256 of native RGBA pixels>" }`. The cutoff is an ISO timestamp in UTC. For the first release, `previousSha` records the repository root. For a maintenance message with no qualifying commits, `model` is null. The app never reads this file.

The GitHub Release body renders the same notes in the same order as the app: headline (release title is "PixelDoll <version>: <headline>"), date and version, banner (a 4x copy uploaded as a release asset), intro and joke, highlights, Fixed, then a collapsed `<details><summary>All changes (N)</summary>` with the groups.
