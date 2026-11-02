# Review of uncommitted agent environment reference support

November 2, 2026. The owner asked to identify, review and commit the remaining five token-handling files if safe.

## Origin and purpose

The changes came from the interrupted Codex chat **Verify Windows env key linking**, ID
`01a18f86-b8ec-79c2-bb44-852ed1346a2d`. Its user request explicitly included PixelDoll and the gallery app. The retained
history shows the PixelDoll helper/test/config edits and earlier checks, but no completed commit or final live validation.
This review finishes only PixelDoll's files; it does not claim completion of the gallery portion or its task card.

`PIXELLAB_API_KEY_AGENT_DEV=PIXELLAB_SECRET` now means: in agent development mode only, read the inherited server
environment variable with that exact name. Missing or blank values yield no key. Literal values keep their prior
behavior. This is an explicit convention, not general dotenv expansion or an automatic Windows registry lookup.

Reviewed files: `app/agent-key.ts`, `app/vite.config.ts`, `app/scripts/dist-guard.mjs`,
`app/test/unit/agent-key.test.ts` and `docs/handoff/agent-dev-token-handling.md`. The documentation contradicted itself
by both forbidding and supporting the reference name; that wording is corrected. No credential, real `.env` file,
production token flow or ordinary user storage rule was changed.

## Safety and verification

A read-only sub-agent found no concrete blocker and independently passed 36 tests across the agent-key and existing
selftest files under Node 24.22.1. It did not inspect credentials or call PixelLab.

The coordinator verified the actual Vite middleware with an isolated copied config and synthetic `.env` fixture:
ten checks pass for reference/literal resolution, missing-value rejection, no-store responses, same-origin/proxy guards,
agent plugin gating and the absence of a secret-serving endpoint in normal development. No real `.env` was read.

Production verification used a synthetic environment canary. It is absent from every built file. A temporary marker
probe makes the strengthened distribution guard fail as expected; removing that probe restores a clean guard. Building
in agent mode is explicitly refused. These four checks pass without a provider request.

Strict Svelte/TypeScript checking passes with zero errors/warnings. Auth and Studio browser coverage passes all 46
tests on an isolated snapshot, including remembered-token, Forget, framing and paid-consent paths. An earlier main-tree
run also passed 46, but the isolated run is the final evidence because another chat started fullscreen work during review.

The first isolated full unit run encountered worker-shutdown timeouts while other work was running and was interrupted.
The same suite was rerun with two workers, without altering assertions or test configuration. Its final outcome is
recorded below. A preceding main-tree unit run passed 1,539 tests and one existing skip.

The final isolated rerun passed **1,539 tests, one existing skip, across 135 files** in 31.45 seconds with two workers.
No test timeout, assertion or configuration was weakened. The isolated auth/Studio run passed all 46 tests in 2.5 minutes.

## Scope and disposition

The feature is safe to commit within the existing localhost-only agent contract. It does not add automatic generation,
production environment injection, broader secret lookup or another user-facing token option. Zero PixelLab requests or
generation units were used. The temporary synthetic servers were closed after verification.

The separate active chat **Add full-screen toggle** owns the new fullscreen UI/test/documentation edits. They are
excluded from this commit. The already committed simplicity-first guidance in `7b0b49c5` is documentation-only and
belongs to **Refine simplicity-first design rules**. No active agent's staged or unstaged work is swept into this change.

The existing environment-reference board card, recorded by its original chat as `PVTI_lAHOAAg2ds4Boo7NzhE6arQ`, also
includes gallery work. Board reads currently lack project scope; no completion or new board mutation is claimed.
