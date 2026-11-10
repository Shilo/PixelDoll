# Keys 3 stage 1 results (R0 robustness: flat green fg vs production ramp green prod)

Date: 2026-11-10. Plan: scratchpad keys3/PLAN-v2.md. Harness: spikes/api/c25/arm_k3.mts, eval_k3.mts, k3_flat.mts.
Session: local API (Tier 2), HEAD 0bded5ab, chroma.ts sha 499e4ad2c292 (committed despill fix, identical to the working tree).
Balance before 17,448.1, after 17,188.1 generations: **260 charged** (ledger 260, estimate 260, cap 280). 22 of 22 calls done,
0 errors, 0 lost, nothing resent. Pairs sent back to back in one session (pool 6).

## Rule outcome (PLAN-v2 section 4, window 20 decisive)

| Pair | Hard | 2 leak | 10a tinted | 4 hue | 4 S | 5 gray | 6 G2 mean | 6 G3 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B helm s11 | 0/0 | 4/4 | 0/0 | n/a | n/a | ok | 0.9835/0.9900 FAIL 1.29 | ok | fail (G2 mean) |
| B plate s11 | 0/0 | 32/21 (0.72) | 0/0 | n/a | n/a | ok | ok | ok | tie band (leak = silver over shirt, artifact) |
| B hair s11 | 0/0 | 0/4 | 0/0 | 47/44 | 0.66/0.74 FAIL 1.01 | ok | ok | ok | fail (S) |
| B cloak s11 | 0/0 | 0/6 | 0/0 | 11/356 FAIL 1.48 | 0.80/0.80 | ok | ok | ok | **fail (hue; olive folds)** |
| body128 helm s7 | 0/0 | 8/10 | 0/0 | n/a | n/a | ok | 0.48 | ok | pass |
| body128 plate s7 | 0/0 | 593/345 FAIL 2.58 | 0/0 | n/a | n/a | ok | 0.45 | ok | fail on metric; artifact (below) |
| body128 hair s7 | 0/0 | 0/7 | 0/0 | 0.23 | 0.32 | ok | 0.27 | ok | pass |
| body128 cloak s7 | 0/0 | 0/23 | 0/0 | 5/350 FAIL 1.48 | 0.81/0.89 FAIL 1.03 | ok | 0.73 | 0.51 | **fail (hue, S; olive folds)** |
| Bdark helm s7 | 0/0 | 38/3 FAIL 3.26 | 0/0 | n/a | n/a | ok | 0.9828/0.9906 FAIL 1.56 | ok | fail (G2 mean); leak is artifact |
| Bdark hair s7 | 0/0 | 0/1 | 0/0 | 0.25 | 0.31 | ok | 0.66 | ok | tie band |
| A sword s7 | 0/0 | 0/11 | 0/0 | 0.07 | 0.26 | ok | 0 | 0.44 | pass |

Values are fg/prod (allowance used). Window 12 changes no verdict. Hard fails 0 everywhere. Novel dark dropped: fg 0 in every
pair, prod 0 to 62 (reported only).

## Sheets and diagnosis

- **Cloak, back view (both bodies): the deciding defect.** fg's red cloak is drawn with muddy olive/brown fold shading
  (final-layer px hue 30 to 90, S >= 0.25: B fg 491 vs prod 18 on north; body128 fg 1,912 vs prod 0). They are olive in the raw
  output (not key hue), so neither the detector, despill nor metric 10a (key-tinted within 30 degrees) sees them; criterion 4
  (hue, saturation) and the sheets do. This is drawing bias on the bright flat green body, not extraction.
- Leak failures are metric artifacts, checked pixel by pixel: body128 plate 583 of 592 fg px are silver over the light gray shirt
  (202,210,212; fg draws lighter silver than prod); Bdark helm 30 of 38 are the helm's black outline over the base's black outline
  (the flat input has no black there, the ramp does). Neither is body kept on the sheets.
- Helm G2 means (B, Bdark) are below prod but every view is >= 0.974: no hard fail, cause not investigated.
- Hair (B s11): fg blonde is paler and lighter-outlined than prod (S 0.66 vs 0.74), visible on the sheet.
- Dark-skin body: both arms clean; the new relative-outline mannequin keeps shading; no face redraw kept.
- Sword: both arms hold it in the marked right hand and the layer is clean; prod drew a second blade in the east view
  (one-held-item violation), fg did not.
- Plate outlines: fg keeps a complete ring, despilled to neutral gray (metric 10b fg 102/88 vs prod 41/35, all on the item edge).

## Decision

PLAN-v2 stop rule: fg fails R0 criteria at window 20 on stage 1 pairs and the sheets agree (cloak). **Stop: production ramp green
stays; stage 2 does not run.** Spend 260 of the 280 cap. Stages 2 (32 calls, cap 620) and 3 exist in arm_k3.mts as dry-run code
only (dry2.log, dry3.log). Data: K3/stage1.rows.json, eval1.md, per-cell sheets K3/<body>/<item>/<arm>_dress_s<seed>.sheet.png.
