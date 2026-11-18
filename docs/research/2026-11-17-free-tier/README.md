# Free-tier live verification

Date: 2026-11-17 (America/Los_Angeles). Account: Trial, no numbered plan, no USD credits. Credential values were never printed or saved. The isolated provider-source review was not reopened.

## Results

| Request                                                           | Result                                                  | Reported charge | Balance  |
| ----------------------------------------------------------------- | ------------------------------------------------------- | --------------- | -------- |
| `/edit-animation-v2`, two identical 64 px standing frames         | HTTP 202, then failed: `Generation failed`, code `3006` | USD 0           | 27 to 27 |
| `/create-character-v3`, 48 px, eight directions, from text        | Completed                                               | 2 generations   | 27 to 25 |
| `/animate-with-skeleton-v3`, three 48 px south-facing idle frames | Completed, exactly three valid PNGs                     | 2 generations   | 25 to 23 |

The equipment failure reproduces the user's accepted-job-then-failed sequence. Its generic message does not independently prove a tier refusal; the Tier 1 rule comes from the previously isolated endpoint-contract verification. Zero reported USD and an unchanged generation balance were observed, not inferred from HTTP 202.

Only three generation POSTs were submitted. Each accepted job was polled, never resubmitted. Total observed balance change: **4 generations**, under the 10-generation ceiling. Existing app policy tests passed (30 tests), and an offline smoke check verified the duplicated standing-frame request and its required schema fields before any live POST.

The skeleton test verifies Free access and basic output shape. It does not qualify equipment extraction, moving-body quality, every animation mode, every size, trial availability under load, or every account. Its deliberately small idle movement is not a motion-quality benchmark.

## Final access conclusion

- Free character generation and raw skeleton animation worked on the actual trial key.
- New equipment and anchored edits still require Tier 1 under the verified contract. No Free-equivalent standing-design pipeline was qualified.
- Grid inpainting still requires Tier 1, or Tier 2 above 256 px on either side. It was not live-submitted: another potentially 10-generation operation would exceed the remaining campaign allowance. The matrix and 256/257 px boundary remain covered offline and by the earlier contract review.
- Clean skeleton-only posing of an existing design can avoid a grid. It is not a replacement for masks or for unsafe imported joints. No quality gate, canvas layout, or model policy was relaxed.
- There is no automatic paid-to-Free endpoint substitution after failure. Eligible routes are selected before spending; unsupported actions explain the needed tier before submission.

## Notice timing and screenshots

Screenshots use the actual Studio components with explicitly simulated account snapshots. The browser had no real API key, and its PixelLab fetches were blocked. The Activity example replays the actual sanitized live failure receipt. The Tier 2 example supplies a numeric pending requirement to the real Connect/TierNotice components; it does not claim a live inpaint request.

1. Connect: a valid Free key remains usable and explains equipment restrictions. A restricted pending action does not run.
2. Character creation and body-only moves: Tier 1 is recommended for trial availability; generation remains enabled once the form is valid.
3. New equipment: Tier 1 is required. A completed prompt does not enable Make on Free.
4. Sufficient tier: the required notice disappears reactively and the valid action becomes available.
5. Larger-grid requirement: Tier 1 is insufficient for a Tier 2 operation. The same reusable notice explains the numeric requirement.
6. Runtime failure: Activity retains the provider error and explicitly avoids diagnosing every failure as a plan problem. Nothing automatically retries.

Local screenshots: `docs/testing/free-tier-access/`. The interactive walkthrough is `screenshots.html`; generated PNGs remain local under the existing evidence-media policy.

## Reproduction and safety

`live-check.mjs` reads only `PIXELLAB_SECRET_FREE_TIER`. Its local ledger is in the OS temporary directory `pixeldoll-free-tier-2026-11-17`. A submission marker is written before transport. Reusing a command resumes an accepted job; an ambiguous submission with no ID stops instead of resending. Do not delete that ledger to retry a paid request.

The `--smoke` command needs `source.png` in that temporary directory: the first 64 x 64 cell of `app/public/fixtures/s2/layers/body/base/main/walk.png`. It performs no network calls. Live stages are separate explicit commands: `edit`, `create`, `skeleton`; `report` reads the final balance and writes the sanitized receipt summary. Do not rerun the live stages merely to regenerate this report.

Sanitized receipts: [live-results.json](live-results.json).
