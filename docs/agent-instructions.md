# Writing AGENTS.md

AGENTS.md is read by every coding agent (Codex directly; Claude through CLAUDE.md's `@AGENTS.md`) at the start of every
session, so each line costs tokens on every task. Studies find these files do not raise success rates on average and add
over 20% to cost, but agents follow them well when they state conventions an agent cannot infer
([ETH Zurich, arXiv 2602.11988](https://arxiv.org/abs/2602.11988)). Keep it to that.

## What belongs

- The project description at the top: product, pipeline, allowed PixelLab models, quality bar. It stays complete; it is
  the only context for judgment calls.
- Facts the repository does not show: credential policy, paid-API rules, board workflow, which e2e spec covers what,
  intended fallbacks, why something is the way it is.
- Commands whose exact syntax matters or is easy to get wrong (`npm run e2e -- <spec> -g "<title>"`: without `--`,
  npm swallows the flags).
- Rules that counter known agent failure modes (see below).
- One pointer per deeper document an agent needs at a specific moment.

## What does not

- Anything inferable in one cheap step: versions pinned in `package.json`/`.nvmrc`, directory names that explain
  themselves, scripts any agent finds in `package.json`, a docs list that `docs/README.md` already indexes.
- Repository overviews and tours; they did not help in the study above.
- Progress logs, history, dates and "recently changed" notes; they go stale. Use the board, commits and docs.
- Bans on things nobody uses. State the positive rule ("style with Bronze UI; add no other UI kit") so it also covers
  the next alternative.
- Rules that belong to one tool only; put them in that tool's file (CLAUDE.md, `.codex/`). Rules every agent needs go
  here, so Codex sees them too.

## Rules that counter agent failure modes

These are observed, repeated failures, not style preferences
([GitClear 2025](https://devclass.com/2025/02/20/ai-is-eroding-code-quality-states-new-in-depth-report/),
[complexity creep](https://codex.danielvaughan.com/2026/07/20/complexity-creep-ai-coding-agents-codebase-entropy-codex-cli-refactoring-defence/),
[agents editing tests](https://dev.to/penloom_studio_829b7817d3/your-ai-agent-will-pass-any-test-its-allowed-to-edit-51fo)):

| Failure | Rule in AGENTS.md |
|---|---|
| Over-engineering, speculative options | KISS and YAGNI |
| Re-implementing an existing helper; copy-paste | DRY in app/ (reuse first, extract at the second caller) |
| Patching the reported path only | Fix the root cause in shared code |
| Drive-by refactors and renames | Stay in scope |
| Reverting or committing someone else's edits | Never touch changes you did not make |
| Silent catch, placeholder data, hidden fallback | Surface errors (with the intended fallbacks named) |
| Editing tests or expected values to get green | Never weaken a test just to pass |
| Leftover dead or commented-out code | Delete code your change makes dead |
| Claiming checks that were not run | Report what you verified, failed and skipped |

When a new failure repeats, add one rule for it; when a rule never matters, remove it. Prefer enforcement by tooling
(type check, tests, `dist-guard.mjs`, CI) over prose whenever a check can do it.

## Wording

- One line per rule, imperative, concrete. Name the exception when the codebase has one ("unless documented as
  intended, e.g. the inpaint-v3 fallback"), or agents either break real fallbacks or call their own shortcut "design".
- Scope a rule to where it applies ("DRY in app/") so it does not fight intended duplication, such as the standalone
  prototype.
- Do not let two rules pull against each other (for example "extend the helper" versus "no new options").
- Keep facts in one place. If a value lives in a file, point to the file instead of copying the value.

## Editing checklist

1. Cut a line only if an agent can recover it in one cheap step without losing behavior; otherwise keep it.
2. Check that every path, command, flag and default still exists and works (run the command, `ls` the path).
3. Search for anything that points at the line or section you change: CLAUDE.md, `.codex/rules/`, code comments
   (for example `plans.ts` points to "PixelLab plan policy"), docs.
4. Have an independent reviewer challenge the diff for regressions and wrong rules, then fix only the valid findings.
5. Commit the change with any files it refers to, so a clean checkout matches the text.
