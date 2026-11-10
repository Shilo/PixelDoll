# Keys 3 plan: adversarial review (no PixelLab calls)

Date: 2026-11-10. Reviewer reran O1, O2/O3 and O4 (`o1_census.mts`, `o2_metrics.mts`, `o3_despill.mts`): all three outputs are
byte-identical to the stored `*.out.md`. The reruns rewrote `o1_census.json` and `o2_rows.json` with the same content.
New offline checks: `../keys3chk/chk.mts` (steel color against the green-key reference, dark key-hue px kept), `edge.mts` and
`edge210.mts` (spill left at edges), `lab.mts` (flat mannequin on dark skin). All are read-only and import no key.

Verdict: **start, but only after the free stage 0 changes below.** Stage 1 as written is close to right. Stages 2 and 3 need
trimming and three additions. Bench regeneration can drop from 450 to 600 gens to about 60 to 110.

## 1. The offline analyses

The numbers reproduce. Some claims are weaker than stated:

| Claim | Problem | Fix |
| --- | --- | --- |
| O3: fg "passes every arm S criterion", novel dark 0 vs 272 | **Structural, not measured.** The flat detector only drops px with V >= 0.30 inside the window. Novel dark dropped (V < 0.35) is therefore about 0 by construction. The flat-specific risk is the reverse: dark key-hue shading next to the item is *kept* (the V < vMin - 0.08 rule absorbs it), and no metric counts it. Leak "mannequin kept" requires the px to be within 24 of the bright input, and "natural redraw" requires it to be near the real base. | Add metric 10, **dark key-hue kept**: layer px on the silhouette with raw hue within 30 degrees of the key, S >= 0.25 and V < 0.5. Stored data, prod vs fg: helm 57/55, hair 69/10, cloak 61/7, jerkin 61/20, **plate 196/326**. Fg fails a 1.25x + 10 rule on plate. Make it decisive (<= 1.25 x prod + 10 per item) and review the plate sheets before stage 1. Keep novel-dark as a reported metric, not a decisive one. |
| O2: window 12, S >= 0.35, V >= 0.50 is safe | The drift was measured only at 120 and 185 (fg, fc), and the tuning and G2 verification ran on the same outputs. O1's "navy survives 240, pink survives 300 at window 12" carries that parameter to hues where drift was never measured. | Pre-register **window 20 (S 0.25, V 0.30) as decisive for every hue**, with window 12 as a reported sensitivity. Rerun the O2 drift on each new hue's paid outputs before quoting the window-12 collision numbers. |
| O1: fa is 0.0 % for every fallback role | R3 has 2 unbiased sets at 210. R2 at 210 excludes every blue-generated set. The corpus was drawn on ramps, so it cannot show drawing bias. | Treat it as a hypothesis for P3 and P4, not as evidence. |
| O1: flat green keeps emerald | Already partly measured: `S A tunic fg s7` (emerald on flat green) has hue 160, S 0.88, 0 hard fails, G2 0.996 and 738 px (prod magenta has 726). The 120 column excludes it, so the plan never uses it. | Use it, and test pure greens on fg in P2 (below). If fg covers emerald, R1 shrinks. That is a larger simplification than the azure merge. |
| O4: windowed despill keeps key-tinted px identical | **Circular.** "Tinted" (S >= 0.3, within 30 degrees) is a subset of the gate (S >= 0.25, within 40 degrees), so the counts are identical by definition. | See section 3 for a non-nested proof. |

Reference fairness:

- Arms Y and S share the 2026-11-08 prompt template, seeds and bodies, so they are fair references.
- `y_env.mts` sends calls to the owner's **local API** when the key references `PIXELLAB_SECRET_DEV`. Record the API base per run, and run both arms of every comparison on the same base and in the same session.
- A shared seed does not pair noise across different inputs. Treat seeds as replicates, not as pairs.

New construction defect (free to fix):

- `flatMannequin` sends every px with OKLab L < 0.42 to the outline tone, and that is an absolute cut. Deep LPC skin (70,44,34) has L 0.32.
- With body A's skin darkened, **409 of 636 px (64 %) become the outline tone**, against 278 (44 %) on light skin. Dark-skinned bodies get a mostly one-tone mannequin.
- Make the cut relative, for example by quantiles of the body's own L like `toChroma`'s normalization, and verify offline before stage 1.

## 2. The paid plan

**Cut (about 90 gens):**

- P2 fa on the 3 green-only items (30 gens). R1 keeps magenta for green plus blue items in every case, so fa on R1 can never remove a key. The rule makes this arm decision-free.
- P5 navy tunic x {fa, fb} and turquoise amulet x fa (30 gens). The navy and turquoise collisions are hue collisions in the detector, already answered offline (59 % and 3 to 26 %). Both words are blocked anyway.
- P5 fb helm and cloak (20 gens). Arm Y already found that blue turned the red cloak purple and emptied navy. O4 shows that drawing bias is tied to the hue, not to the style. Fb stays only as the R2 flat candidate.
- Remaining P5: helm and cloak x {fm, fa}, 4 calls.

**Add:**

- Stage 1, dark skin: body B with deep LPC skin (after the construction fix), helm and braids x {fg, prod}. 4 calls, about 40 gens.
- Stage 1, held item: steel longsword (main_hand, padded) on A s7, dress x {fg, prod}. 2 calls, about 20 gens. Stage 3 adds its walk S/E/N. It is also needed as a bench case.
- P2 fg arm on the forest cloak and the green vest (the emerald tunic on fg is stored). 2 calls, 20 gens. This answers "does flat green absorb R1?" and doubles as the measured `keyFor` / `nearKeyShare` collision positive. Recalibrate `nearKeyShare` thresholds offline from these outputs; no extra cell is needed.
- Stage 3: slash S/E/N for fg helm, hair, cloak and sword on A (12 calls, 36 gens). The campaign outputs then match bench clip structure (walk plus slash), which is what cuts the bench cost.
- **Despill fix first** (section 3). Evaluate R2 and R3 baselines with the fixed despill: that is what production will be, and the current az steel numbers penalize the ramp baseline unfairly.

**Rules:**

- **Tie band:** "tie band" and "twice the margin" are undefined. Pre-register a number: a candidate clears seed 7 only if every criterion uses at most half its allowance. Otherwise it runs seed 11.
- **Style coupling:**
  - Skipping flat fallbacks when R0 stays ramp is justified (KISS; fallbacks are a small share of items).
  - The auto-block when R0 goes flat is too strong: one rare role's failure would veto a measured gain on the default. Escalate it to the owner ("Needs decision") with the data, rather than blocking or keeping ramp silently.
  - The open question "azure before magenta for green-only items" closes offline for the same reason as the cut above: it cannot remove a key.
- **Merge:** testing fa on R2 costs only P3's fa column (3 calls). It can drop the blue key, so keep it. It is not premature.

**Revised budget (generations, cumulative caps):**

| Stage | Calls | Estimate | Cap |
| --- | ---: | ---: | ---: |
| 1 | 22 | ~260 | 280 |
| 2 (P2 9, P3 9, P4 6, P5 4) | 28 | ~280 | 580 |
| 3 (plan's 402, plus sword walk 18, plus slash 36) | ~110 | ~455 | 1,060 |
| Bench top-up (A chest, A boots, A axe; others reused) | ~6 to 9 | 60 to 110 | 1,170 |

The worst case is about 1,170, against the plan's 1,010 plus 450 to 600 (1,460 to 1,610). The expected spend is about 260 if stage 1 stops.

## 3. Production despill defect (real; fix regardless of flat)

Steel gray px on the helm, all stored bodies and seeds (`chk.mts`), shown as mean S / hue:

| Key | Raw | Production despill | Windowed despill | Green-key reference |
| --- | --- | --- | --- | --- |
| az (azure) | 0.180 / 206 | **0.025 / 179** (1,356 of 1,577 px moved, mean 24 levels) | 0.162 / 205 | prod 0.205 / 209; fg 0.196 / 205 |
| bl (blue) | 0.206 / 211 | 0.146 / 198 | 0.164 / 204 | |

- The raw azure steel is no bluer than steel drawn on green. Production azure despill therefore **erases the native cool tint**; it is not removing spill.
- Interior steel px that keep the native 210 tint: green key 1,207, production azure 72, windowed 1,172.
- Root cause: `tint()` is a ratio with `sT = 10`, so steel at S 0.18 counts as spill once rotated into the key frame, and then snaps to a neutral core.
- Blue's clamp `[r, g, max(r, g)]` does the same thing to a smaller degree. Magenta was not measured (there is no stored steel on magenta).

The windowed variant leaves more low-S azure-hue px at edges: helm 144 of 218 edge px, against 33 of 131 on green. Some of that is likely real spill. Fix it as follows: despill a px when it is within 40 degrees of the key with S >= 0.25, or when it is within 40 degrees and 8-adjacent to a removed key px.

Offline proof:

1. Rerun `chk.mts` and `edge210.mts`. Fixed az/bl interior steel must be within 0.03 S of the green reference, and edge low-S share no higher than green's plus 10 points.
2. Unit test: an azure/blue layer with a steel ramp (S about 0.15 to 0.2) stays within 2 per channel, and a key-hued edge px is still neutralized. Keep `despill-own-colors` as it is.
3. Bench: add steel keep-exact labels to `a-plume-azure` (steel helmet), then confirm that only those numbers move.

## 4. Code and cost

- The chroma.ts estimate of 250 to 350 lines is plausible.
- The test estimate is high. The listed ramp tests total about 1,200 lines, and only about half need rewriting, so 600 to 900 is more likely.
- Two items are missing from the estimate:
  - re-annotating bench keep/drop labels (pommels, jester pink, plume, stripes) on new raw outputs;
  - recalibrating `nearKeyShare` / `KEY_COLLISION`.
- **Bench regeneration can mostly be avoided:**
  - (a) Re-key the frozen raw outputs offline with a color-to-color map: ramp t gives a base luminance, which gives a flat tone. The ramp is monotonic, so no alignment is needed, and the existing labels stay valid. This gives code regression for free. It cannot contain the flat-specific dark-shading case, so say so in bench.md.
  - (b) Freeze the campaign's own fg outputs (A, B, body128, dark skin, sword, walk plus slash) and the P3/P4 outputs as real flat cases.
  - (c) Pay only for cases with no counterpart: A chest, A boots, and optionally A axe, at about 28 gens each.
- The despill fix is a separate, small change: about 15 lines plus about 40 test lines, plus a bench regeneration.
