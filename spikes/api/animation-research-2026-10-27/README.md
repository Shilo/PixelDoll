# Animation diagnosis research harness

Research only. Does not change the production pipeline. See
`docs/research/2026-10-27-animation-diagnosis.md` for findings and limitations.

The owner authorized up to 1,000 PixelLab generations for this investigation.
Use small controlled batches and stop when further calls do not answer a new question.
Never automatically resend a paid request with an unknown outcome.

1. From `spikes/api`, run `node animation-research-2026-10-27/prepare.mts`.
2. Copy `browser.html` to `app/animation-research.html` temporarily.
3. Run `npm run dev:agent` in `app/` and open
   `http://localhost:5199/animation-research.html` using the Codex browser.
4. Load the generated `out/animation-research-2026-10-27/inputs.json` using the file input.
5. Check balance, select an explicit batch, and submit once. This campaign used
   reference, motion, remaining controls, then fall settle. The browser calls the
   provider directly. The agent key stays in memory and is never displayed or exported.
6. Export the credential-free evidence bundle with the Download evidence button.
   A localStorage ledger stores only case IDs, job IDs, request reservations and results.
   Reloading can resume free job polling, never paid submission.
7. Remove only the temporary `app/animation-research.html` copy after the run.

Inputs, output frames, snapshots and analyses live under the existing ignored
`spikes/api/out/animation-research-2026-10-27/` evidence directory. Source and the written
report are versioned. Do not overwrite historical spike outputs.

Copy the downloaded evidence JSON into that directory as `evidence.json`, then run
`node animation-research-2026-10-27/analyze.mts` from `spikes/api`. It preserves raw PNGs,
computes diagnostic metrics, and builds a timing-aware review gallery including the old
round 8 clips. `node animation-research-2026-10-27/serve.mjs` serves only this evidence
directory at `http://127.0.0.1:5269/`, without credentials or write routes. The HTML also
works as a local file.

`node animation-research-2026-10-27/retarget-audit.mts` reproduces the inconsistent-depth
and support-switch defects without a token or network. Its assertions are tied to the
documented existing c27man/UAL1 fixtures, not every arbitrary animation archive.
