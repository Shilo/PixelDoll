# Releasing

Releases are fully automatic: a scheduled workflow tags the build that was live at each release cutoff, writes notes with Claude, translates them, draws a banner with PixelLab and publishes a GitHub Release. The app shows the same notes in What's new. Nobody edits versions or publishes anything by hand.

## Pieces

- `app/version.ts` stays the only version source. A release's version is the shipped-commit count at the tagged commit.
- `releases/schedule.json` sets the UTC cadence. For `week` and `2 weeks`, cutoffs repeat every 7 or 14 days from `anchor` at `hourUtc`. For `month`, they fall on the first matching weekday `day` of each month at `hourUtc`, on or after `anchor`. A cadence change applies after the last published release or the cutoff already staged for publication.
- `.github/workflows/release.yml` runs at 15:17 UTC on the release day and the day after (a backup for a dropped run), and on demand from the Actions tab (Run workflow). Each run publishes the oldest cutoff that has passed since the last release (the Run workflow `max` input allows more), so a missed run catches up one release at a time and a failure never repeats more than one release's Claude calls. A run with nothing due exits in seconds. Changing `day` or `hourUtc` also means changing the cron line; a unit test checks they match.
- `app/scripts/release/` holds the release script (`npm run release -- --dry-run` from `app/`), its unit tests live in `app/test/unit/release-*.test.ts`.
- `docs/release-notes.md` and `docs/release-notes-translate.md` are the Claude instructions, sent verbatim (the translation prompt is followed by `app/src/locales/TRANSLATING.md`).
- `releases/reverts.json` maps a revert whose message names no commit to the commits it withdrew, so withdrawn work stays out of the notes.
- `releases/<version>/` holds what the app shows; `releases/index.json` lists published releases, newest first.

## One release, step by step

1. Process the scheduled cutoffs that have passed since the last published release, oldest first.
2. Select the last successful `github-pages` deployment at or before the cutoff, timed by its success status. The status must include an environment URL so that a skipped stale build does not count as a deployment. The current counting function applied to the deployed commit gives its version. Skip the cutoff if no successful deployment exists yet or if its version equals the previous release's.
3. Collect the commits since the previous release that touch shipped paths, of type `feat`, `fix` or `perf` and without scopes for work players never see (tests, tooling, research, benchmarks, the board, the release pipeline; see `skipped` in app/scripts/release/changes.ts). Remove explicitly identified revert pairs. The first release includes history from the repository root. These commits become the deterministic All changes list (New = feat, Improved = perf, Fixed = fix). Each entry links to its commit and capitalizes the first letter of the scope and subject. When the scope is empty, the entry contains just the subject.
4. Claude writes a catchy headline, a one-paragraph summary (`intro`), up to 4 highlights (4 when the week has enough) and up to 3 noticeable fixes. Each highlight and fix cites commits. The script checks citations, word limits and plain prose, allows known acronyms such as PNG, and sends the validation errors back to Claude once if needed. A second invalid reply fails the run. When the version changed and there are no qualifying commits, the script uses a short maintenance message with no highlights or fixes.
5. Translation: the AI-written fields are translated into every app locale. Each request also carries `labels`: every short app label from `app/src/locales/en.json` that appears verbatim in the English notes, mapped to the same key in the target locale, so named controls match the app. A locale that fails validation falls back to English for that release.
6. Banner: Claude's notes include a one-sentence scene (`banner` in `source.json`, never translated or shown). PixelLab Pixen (`create-image-pixen`, one generation, about half a cent) draws it at 320x160 inside a fixed frame (`bannerPrompt` in app/scripts/release/banner.ts), with a seed from the version. The request may take up to 20 minutes on a busy account. Any failure (no `PIXELLAB_API_KEY`, a rejected key, no credits, a refused scene, a timeout, or a picture that is not an opaque 320x160 PNG) never stops the release: it gets the default banner `releases/banner.png` and the run page shows a warning. Nothing paid is retried, and a resumed release keeps the banner it was staged with.
7. Commit and push `releases/<version>/` before listing it so a later run can resume publication from the staged folder. Create the tag `v<version>` on the build from step 2, or verify an existing tag points to that build. Create or resume the draft release, upload and verify the 4x banner, publish, and check the tag again. Commit and push the entry in `releases/index.json`, then dispatch the Pages workflow on `main` with `deploy: true` so the app gets the notes. Pushes to `main` that change what ships also deploy the notes. A deploy only moves the site forward: it exits successfully with a notice when its build is older than the live site. A later release run requests a deploy again if the live site still lacks the newest index and a deploy for current `main` is not already pending.

## Setup (once)

1. In the Anthropic Console, create a workspace for releases with a monthly spend limit, keep auto-reload off, and create an API key in it.
2. In GitHub: Settings > Environments > New environment `release`, limited to the `main` branch, with secrets `ANTHROPIC_API_KEY`, `PIXELLAB_API_KEY` (a PixelLab account with credits; the banners use it) and `RELEASE_TOKEN`. `RELEASE_TOKEN` is a fine-grained personal access token for this repository with Contents and Workflows read and write: GitHub refuses the built-in workflow token when it tags an old commit whose workflow files differ from today's (every backfilled release, and any week the workflows changed). It is used only for releases and tags; git pushes keep the workflow token, so the bot's commits never trigger workflows. Renew it before it expires.
3. Settings > Secrets and variables > Actions > Variables: set `RELEASES_ENABLED` to `true`. Until then the workflow only dry-runs. Once it is `true`, a missing key fails the run instead of skipping publication.
4. Backfill one release at a time: Actions > Release > Run workflow (raise `max` to publish several). After the first one, check the published release (banner, Latest badge, All changes) and that What's new shows it on pixeldoll.app.

## When a run fails

Nothing is published halfway. A run stops with a message on its summary page saying what to fix: an invalid, revoked or expired `ANTHROPIC_API_KEY`, no API credit, a reached spend limit, or a refused tag (`RELEASE_TOKEN`). Notes already written are kept in `releases/<version>/`, so after fixing the cause, Actions > Release > Run workflow resumes without paying for them again.

## Editing a published release

`releases/<version>/` is the single source for both the GitHub Release and What's new. Edit `notes.en.json`, or add or replace `banner.png` (an opaque 320x160 PNG at native pixel size; GitHub gets a 4x copy), commit and push to `main`. Several releases can be edited in one commit. Replacing the default `releases/banner.png` the same way updates every release without its own banner, and deleting a release's `banner.png` switches it to the default. The release workflow then re-translates edited English notes, replaces the GitHub banner and body, updates `index.json`, and deploys the app. Editing only a translation (`notes.de.json`) keeps it as written. To redo it by hand: Run workflow with `update` set to the version.

## Testing in a private repository

A private copy can run everything for real without touching this repository: push the history (and `main`), set the `release` environment secrets and the variables `RELEASES_ENABLED=true`, `RELEASE_PAGES=off` (no deploys there) and `RELEASE_DEPLOYMENTS_REPOSITORY=Shilo/PixelDoll` (read the real site's Pages history), and disable the CI and Pages workflow there.

## Dry run

From `app/`: `npm run release -- --dry-run [--until <ISO time>] [--max <n>]` prints the cutoffs, chosen builds, versions, commit counts and All changes lists. It checks the default banner first. Set `GITHUB_TOKEN` for authenticated deployment reads. Add `--notes` to also call Claude for the English notes and print the banner prompt (requires `ANTHROPIC_API_KEY` and uses paid API credits; PixelLab is never called in a dry run). Dry runs leave release files and GitHub unchanged.

## Data format

The release script writes these files and the app reads them (served from `dist/releases/`, copied there by the build). All JSON is UTF-8; dates are `YYYY-MM-DD` (the cutoff date in UTC).

- `releases/index.json`: `{ "releases": [ { "version": "1.4.12", "date": "2026-11-27", "headline": { "en": "...", "de": "..." }, "features": 12, "banner": true } ] }`, newest first, published releases only. `features` is the number of `feat` commits in the release; the app opens What's new by itself only when it is above 0 and the running app is at least that version (an older cached app waits for its update instead of announcing features it lacks). The app fetches the index at startup and when it becomes visible; a failed fetch keeps the releases it already knew. A folder that exists without an index entry is staged and ignored by the app.
- `releases/<version>/notes.<locale>.json` for `en` and every app locale that translated: `{ "headline": "", "intro": "", "highlights": [ { "title": "", "text": "" } ], "fixes": [ { "text": "" } ] }`. A missing locale file means the app uses `notes.en.json`.
- `releases/<version>/changes.json`: `{ "total": 0, "groups": [ { "kind": "new" | "improved" | "fixed", "items": [ { "text": "Export: add a Phaser AE export with a shared version picker", "sha": "<full sha>" } ] } ] }`. Groups appear in that order and only when non-empty. Each item links to `https://github.com/Shilo/PixelDoll/commit/<sha>`.
- `releases/<version>/banner.png`: the release's own 320x160 banner at native pixel size (scale it with `image-rendering: pixelated`). Decorative: the app shows it with empty alt text. Without one, the release shows `releases/banner.png`, the shared default banner; each `index.json` entry's `banner` says which.
- `releases/<version>/source.json`: the record the script resumes from: `{ "version", "date", "cutoff", "sha", "previousSha", "model", "commits": ["<full sha>"], "notes": <the English notes with commit citations and the banner scene>, "publishedEn": <the English notes as last published, after an edit> }`. The cutoff is an ISO timestamp in UTC. For the first release, `previousSha` records the repository root. For a maintenance message with no qualifying commits, `model` is null. The app never reads this file.

The GitHub Release body renders the same notes in the same order as the app: headline (release title is "PixelDoll <version>: <headline>"), date and version, banner (a 4x copy uploaded as a release asset), summary, highlights, Fixed, then a collapsed `<details><summary>All changes (N)</summary>` with the groups.
