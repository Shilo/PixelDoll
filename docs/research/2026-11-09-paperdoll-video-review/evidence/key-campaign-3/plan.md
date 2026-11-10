# Keys 3, plan v2: challenge every chroma key and the mannequin style

Date: 2026-11-10. Status: stage 0 (free) done; nothing paid. v2 applies every required change in `CHALLENGE.md`. Sections 0, 1
(O1 to O4) and 6 of `PLAN.md` stand except where this file overrides them; read `PLAN.md` for the offline evidence.
Owner cap 2,000 generations. Campaign hard cap 1,060 cumulative (stages 1 to 3), plus the bench top-up (about 1,170 worst case).
Expected spend about 260 if stage 1 stops.

## 0. What changed from v1

| Area | v1 | v2 |
| --- | --- | --- |
| Cuts | fa on 3 green-only R1 items; navy tunic x {fa, fb}; turquoise amulet x fa; fb helm and cloak | all cut (decision-free or answered offline: hue collisions in the detector, words already blocked; fb drawing bias already seen in arm Y) |
| Additions | none | deep-skin body B x {helm, braids} x {fg, prod}; held sword A s7 x {fg, prod} plus its walk; fg on two pure-green R1 items; slash S/E/N for fg helm, hair, cloak, sword |
| Kept | | the 3-call flat azure column for R2 (P3) and R3 (P4): it can drop the blue key |
| Detector | window 12 quoted at every hue | **window 20 (S 0.25, V 0.30) decides for every hue**; window 12 (S 0.35, V 0.50) is a reported sensitivity only; rerun the O2 drift on each new hue's outputs before quoting window-12 collisions |
| Metric 10 | none (novel dark dropped was decisive) | new decisive metric for dark key-colored px on the silhouette (section 3); novel dark dropped is reported only (about 0 on flat by construction) |
| Tie band | undefined | a candidate clears seed 7 only if **every criterion uses at most half its allowance**; otherwise it runs seed 11 |
| Fallback block | one failing role auto-blocks the flat switch | **owner decision** ("Needs decision") with the data |
| Fairness | stored references reused freely | record the API base; both arms of every comparison in the same session on the same base; stored runs are replicates, never paired controls (paired prod arms added where needed) |
| Mannequin | outline = OKLab L < 0.42 (absolute) | outline cut relative to the body's own skin lightness (section 2) |
| Despill | windowed despill implemented in the spike | the evaluation calls the working-tree production `despill` (the separate despill fix lands there first); every report prints the `chroma.ts` hash |

## 1. Fairness rules (all stages)

- `arm_k3.mts` logs a session line per invocation in `out/<run>/K3/sessions.jsonl`: time, stage, API base (local or public),
  HEAD, `chroma.ts` hash, ledger total, cap. A paid invocation refuses to run if an earlier paid session of the run used another
  base (ask the owner).
- Every comparison pair is sent in one invocation, interleaved (fg then prod of the same cell, back to back).
- Stored arm Y and arm S outputs (A s7, A s11, B s7) enter the R0 pool as replicates; they are never the paired control of a new
  cell. Where a v1 cell leaned on a stored control, v2 adds the paired arm (P2 emerald tunic prod-magenta and fg; P5 fg helm and
  cloak).
- Every call stores the exact inputs it sent (`<file>.input.<i>.png`); the evaluation reads them instead of rebuilding.

## 2. Stage 0 results (free, done)

**Outline cut (task 2).** `k3_flat.mts` `flatMannequin`: non-skin px use L < 0.42 as before; skin-like px (HSV hue <= 50 or >= 340,
S >= 0.25, V >= 0.12) use 0.42 x min(1, view skin median L / 0.55). Light bodies have skin median 0.60 to 0.74, so their mannequins
are byte-identical to arm S's stored fg mannequins (A, B: verified) and to v1 at hues 210, 240, 300 (A, B, body128: verified);
the stored fg results stay valid replicates. Deep skin = base skin px x 0.42 in sRGB (`darkSkin`; body B skin median L 0.34, LPC
deep 70,44,34 is 0.32). Outline-tone share, light / dark old / dark new:

| Body | south | east | north |
| --- | --- | --- | --- |
| A | 44 / 64 / 44 % | 50 / 68 / 51 % | 44 / 67 / 44 % |
| B | 46 / 74 / 48 % | 40 / 74 / 42 % | 48 / 72 / 48 % |
| body128 | 30 / 53 / 32 % | 33 / 57 / 38 % | 32 / 53 / 32 % |

Sheets: `keys3/s0/outline_sheet.png`, `outline_sheet128.png`. Limit: a body with near-black clothes (non-skin) still goes mostly
one-tone; none of the campaign bodies has one.

**Plate, metric 10 as written, prod 196 vs fg 326 (task 3).** Both are almost entirely the plate's own outline ring: 191 of 196
(prod) and 322 of 326 (fg) touch a non-item px, all 326 sit in the torso band, and only 15 fg px came from the "dark key px
touching the item" rule (the rest are below the V 0.30 floor, never key). The sheets show the ring around the breastplate in both
arms. The difference is color, not body: prod draws the plate outline near-black green (mean V 0.08, e.g. 2,12,3), fg a muted dark
green (mean V 0.24, S 0.42, e.g. 40,62,45). After working-tree despill, fg's ring becomes neutral dark gray (53,56,59; 42,41,39)
with **2** px still key-tinted; prod keeps **50** key-tinted (70 counting any V). Core items, final-layer key-tinted px prod / fg:
helm 0/0, plate 70/2, hair 0/0, cloak 0/0, jerkin 19/0. So the 326 is item outline (good), and the metric as written penalizes a
more complete outline. Crops: `keys3/s0/plate_crops_A7.png`, `plate_crops_B7.png`, `plate_dark_crops.png`.

**Harness (task 4).** `spikes/api/c25/k3_flat.mts` (key-free: flat mannequin, `darkSkin`, window detector at W20 / W12, metric 10),
`arm_k3.mts` (stage 1, dry run), `eval_k3.mts` (read-only). The evaluation was smoke-tested on stored B s7 outputs relabeled in a
scratch run (since deleted): it reproduces the R0 table and flags B hair saturation at 0.83 of its allowance (fg S 0.65 vs 0.71).

## 3. Metrics (v1 section 3, changed)

1 to 9 as v1, each arm through its own detector; flat arms at W20 (decisive) and W12 (sensitivity); both despilled by the
working-tree production `despill` (prod inside `extractCell`; flat in the rotated frame with the composite passed).

10. **Dark key-colored px next to the item (decisive).** Two parts:
    - 10a, decisive: layer px still key-tinted in the FINAL layer (hue within 30 degrees of the key, S >= 0.25). Rule: at most
      1.25 x prod + 10 per item, body and seed.
    - 10b, reported and reviewed: raw dark key-hue px kept on the silhouette (hue within 30, S >= 0.25, V < 0.5) and the share of
      them on the item edge. A 10b px that is not on the item's own outline ring (sheet review) is body kept as item and counts
      as body leak (criterion 2).

## 4. Decision rules (v1 section 4, changed)

- R0: v1 criteria 1, 2, 4, 5, 6 unchanged; criterion 3 becomes **metric 10a** (decisive) plus outlines visibly no worse on the
  sheets; novel dark dropped is reported only.
- Tie band (all roles): a candidate clears seed 7 only if every criterion uses at most half its allowance (allowance used =
  excess over the control / allowed excess; hard fails have zero allowance). `eval_k3` prints the share per criterion.
- Style coupling: if R0 stays ramp, stages 2 and 3 fallbacks are skipped (unchanged). If R0 goes flat and a role has no
  non-inferior flat candidate, stop that role and report it to the owner as "Needs decision" with the data (switch R0 alone and
  keep that role on its ramp, or block); never block or keep it silently.
- R1: fg absorbs green items if, on the three R1 green items, fg is non-inferior to prod magenta (v1 R1 rule) at W20; then R1
  keeps only green plus blue items (tabard) and its hue question is fm vs ramp magenta there.
- Merge: fa replaces blue (R2) only if non-inferior on R2 and it lets one key go (unchanged).

## 5. Stages, calls and caps

Ledger: `lib.mts` `paid()`, `C25_RUN=keys3-2026-11-10`, `C25_CAP` = the stage's cumulative cap, arm cap 1,060, nothing resent,
a `.sent` marker without frames is reported and recovered by GET only. Import `y_env.mts` first. Dress pool 6, pose pool <= 6,
never more than 8 jobs in flight (Tier 2 local API allows about 10). GET /balance before and after each stage. Receipts: 64 and
80 px dress 10 gens, 160 px dress 15, sword on the 96 px canvas 10, any walk or slash direction 3.

| Stage | Runs only if | Calls | Estimate | Cap (cumulative) |
| --- | --- | ---: | ---: | ---: |
| 0 | always | none | 0 | 0 |
| 1 R0 robustness | always | 22 (list below) | 260 | 280 |
| 2 fallback screen | fg passes R0 on stage 1 | 32 (list below) | 320 | 580 (see note) |
| 3 confirmation | something to confirm | about 110 | about 455 | 1,060 |
| Bench top-up | flat ships | 6 to 9 | 60 to 110 | about 1,170 |

Stage 1 (all `edit-animation-v2` dress, S/E/N rest views, production prompt; fg prompt equals prod's):

| Cells | Calls | Gens |
| --- | ---: | ---: |
| B s11: helm, plate, braids, cloak x {fg, prod} | 8 | 80 |
| body128 s7: helm, plate, braids, cloak x {fg, prod} | 8 | 120 |
| deep-skin B s7: helm, braids x {fg, prod} | 4 | 40 |
| A s7: steel longsword with a brass crossguard (main_hand, pad 16, 96 px, red hand dot, held wording) x {fg, prod} | 2 | 20 |
| **Total** | **22** | **260** |

Stage 2 (A s7): P2 emerald tunic, forest green hooded cloak with a steel clasp, green leather vest with brass buckles, teal and
navy tabard x {prod magenta, fm} (8) plus fg on tunic, cloak and vest (3; the tunic pair is rerun, not reused); P3 green and pink
jester hat, red and green holly tunic, red and green tabard over steel plate x {prod blue, fb, fa} (9); P4 green and purple jester
hat, green and purple striped tunic, steel helmet with a green and purple plume x {prod azure, fa} (6); P5 steel great helm and
red hooded cloak x {fm, fa} (4) plus paired fg helm and cloak (2). 32 calls, 320 gens. **Note:** the fairness additions (tunic fg
and prod rerun, P5 fg pair) add 4 calls to the reviewed 28; at about 10 gens each the stage lands at 580 exactly, so either
raise the stage 2 cap to 620 or drop the P5 fg pair (and compare P5 to stage 1 replicates only).

Stage 3 (unchanged from v1 plus): sword walk S/E/N x {fg, prod} (6 calls, 18); slash S/E/N for fg helm, hair, cloak, sword on A
(12 calls, 36; bench clip structure). Pose pools at most 6.

Stop rules (v1, changed): after stage 1, stop if fg fails any R0 criterion on any stage 1 pair at W20 (sheets agree); a W12-only
failure is reported, not a stop. After stage 2, a candidate inside the tie band runs seed 11; a role with no surviving candidate
goes to the owner (section 4). Any 429 or lost poll: recover by GET, never resend.

## 6. Run commands

```
cd spikes/api
C25_RUN=keys3-2026-11-10 C25_CAP=280 node c25/arm_k3.mts dry      # free: requests, estimates, mannequins in out/<run>/K3/dry
node c25/s_balance.mts                                             # GET /balance only
C25_RUN=keys3-2026-11-10 C25_CAP=280 node c25/arm_k3.mts stage1   # paid, 22 calls, owner approval required
C25_RUN=keys3-2026-11-10 node c25/eval_k3.mts                     # read-only
```

Stage 2 and 3 cells are not in `arm_k3.mts` yet; add them (other hues and names, walks and slash with the pose builder) only after
stage 1 passes.
