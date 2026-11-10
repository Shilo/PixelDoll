# Keys 3 final step: fallback keys (pre-registration below was written before any spend)

## Paid check (pre-registered 2026-11-10, before sending)

Harness `spikes/api/c25/arm_k3f.mts` (local API, run `keys3-2026-11-10`, ledger shared with stage 1). Body A, dress only (S/E/N),
seeds 7 and 11, same-session pairs sent back to back, production dress builder with the key forced per arm. 16 calls, estimate 160
gens, arm cap 200, step hard cap 300. Evaluation: `keys3final/eval_f.mts` with HEAD `chromaLayer` (despill fix included).

**Q-R2 (merge): can azure replace blue for green plus pink or red?** Items: green and pink jester hat, red and green holly tunic;
arms blue (production) and azure. Azure replaces blue only if, over both items and seeds, all hold:
1. hard-fail views (empty, G2 per `g2Fails`, G3 > 0.02): azure <= blue;
2. red/pink and green item px (S >= 0.25, V >= 0.30) lost to the key: azure <= blue + 10 per item;
3. red/pink circular-mean hue within 10 degrees of the real-base reference (stored `K none`: jester 336 to 341, holly 359 to 3)
   on every item and seed, and red/pink mean S not more than 0.08 below blue's;
4. G2 mean within 0.005 of blue; summed G3 not above blue's + 0.02;
5. sheets show no visible defect that blue does not have.
Otherwise blue stays.

**Q-R1 (steel on magenta): is magenta still right for green items that include steel?** Items: steel helmet with a green plume,
green tabard over steel plate armor; arms magenta (production) and azure (the only other key that keeps green). Steel px = layer
px with S < 0.35, V >= 0.25, hue outside 75 to 175. Magenta loses the R1 role only if, summed over items and seeds:
1. steel px leaning to magenta (hue 260 to 350, S >= 0.08 in the final layer) exceed azure's leaning share (hue 180 to 240,
   S >= 0.08, minus the green-key steel norm of hue 200 to 216) by more than 0.15 and the tint is visible on the sheets; or
2. magenta has more hard-fail views or loses more green px (> azure + 10 per item).
Otherwise magenta stays. Reported, not decisive: steel mean hue and S against the green-key steel reference (helm S 0.20, hue 205
to 209, arm Y).

## Outcome (written after the run)

Session: local API, HEAD 0bded5ab (chroma.ts clean). GET /balance before 17,188.1, after 17,028.1: **160 generations charged**
(ledger 160, 16 of 16 calls, 0 errors, nothing resent). Campaign total about 420 of 2,000. Data:
`spikes/api/out/keys3-2026-11-10/K3F/<item>/<key>_dress_s<seed>.*` and `.sheet.png`; table `eval_f.out.md`; pair sheets
`pair_<item>.png` (rows: seed 7 key 1, seed 7 key 2, seed 11 key 1, seed 11 key 2).

### 1. Stage 1 stop: verified

The olive cloak is real and repeatable, not a seed artifact. Counting raw north-view px with hue 30 to 90 (S >= 0.25) on every
stored red-cloak output (`olive.mts`): flat green 114 and 358 (arm S, body A s7/s11), 145 (body B s11), 1,842 (body128 s7), so
4 of 4 bodies and seeds; ramp green 0, 36, 0, 0; flat cyan, skin cyan, azure, cyan and blue ramps 0. One caveat on fairness:
criteria 4 (hue, S) and 6 (G2) are non-inferiority tests with prod as the reference, so any difference counts against fg (fg's
crimson 356 against prod's 11 is not wrong by itself, and the helm G2 and hair S gaps are small). Without them the verdict rests
on the cloak alone, but the cloak is a direct defect count, visible on the sheets, 4 of 4: the stop stands.

### 2. Free evidence: current extraction on every stored fallback output (`rerun.mts`, `rerun.out.md`)

63 sets (D, K, Z, Sc, C, N, U, S magenta tunic, arm Y azure/blue). The despill fix changes colors only, never the mask, so no
gate, lost-px or target-kept number moves. What moved:
- Azure steel: helm rewritten px 408 to 103 (A s7), 409 to 110 (A s11), 984 to 256 (B); plate 331 to 112 and 318 to 118;
  Sc plume 353 to 204, tabard 426 to 296. Gray-px mean S is now equal to raw (0.16 to 0.19) instead of 0.02 to 0.11.
- Blue steel: helm 271 to 105 rewritten, S 0.15 to 0.20 (raw 0.21).
- Magenta: 0 changed px on every magenta set except Z stripes (13) and Z jester (3). No magenta set changed verdict.
- Verdicts unchanged: magenta still loses pink (K jester, 3 and 2 hard views) and purple (Z jester 33 of 328 purple px kept);
  blue and azure pass every fallback set; blue still empties the navy tunic (3 hard views) and blue drew the red cloak at
  hue 344 (green 1 to 3, azure 2 and 353, `hue.mts`).
Prompt change 14a31bc1 only dropped "natural" from the dress sentence and was A/B tested as no difference; the stored outputs
remain valid evidence.

### 3. Paid check verdicts

| cell | hard | G2 mean | red/pink hue, S | green hue, S | steel hue, S |
|---|---|---|---|---|---|
| jester blue s7 / s11 | 0 / 0 | 1.000 / 1.000 | 331, 0.68 / 323, 0.70 | 136 / 132 | - |
| jester azure s7 / s11 | 0 / 0 | 1.000 / 1.000 | 329, 0.59 / 327, 0.61 | 127 / 126 | - |
| holly blue s7 / s11 | 0 / 0 | 1.000 / 1.000 | 3, 0.79 / 1, 0.84 | 115 / 109 | - |
| holly azure s7 / s11 | 0 / 0 | 0.999 / 1.000 | 356, 0.69 / 348, 0.66 | 130 / 124 | - |
| plume magenta s7 / s11 | 0 / 0 | 1.000 / 1.000 | - | 129 / 135 | 205, 0.22 / 203, 0.17 |
| plume azure s7 / s11 | 0 / 0 | 0.997 / 0.999 | - | 138 / 144 | 204, 0.10 / 194, 0.10 |
| tabard magenta s7 / s11 | 0 / 0 | 0.999 / 0.999 | - | 132 / 131 | 220, 0.12 / 214, 0.20 |
| tabard azure s7 / s11 | 0 / 0 | 0.998 / 0.996 | - | 142 / 141 | 204, 0.12 / 216, 0.16 |

- **Q-R2: blue stays.** Azure passes criteria 1, 2, 4 and 5 (0 hard fails, 0 target px lost, clean sheets) but fails 3: its
  red/pink is 0.09 to 0.18 less saturated than blue's on all four cells (allowance 0.08) and holly s11 is 11 degrees off the
  real-base red. Azure also drew both holly tunics mostly green with red trim, blue mostly red (design drift toward less red).
  Merging blue into azure is not supported.
- **Q-R1: magenta stays.** Steel on magenta is neutral blue-gray (hue 203 to 220, S 0.12 to 0.22, the green-key norm is about
  205 to 209, S 0.20), magenta-leaning share 0.00 to 0.04; 0 hard fails, 0 green px lost. Azure is equally clean but its steel
  is grayer on the plume (S 0.10). The 10 to 24 "red/pink lost" px on magenta are redrawn mannequin px, not item (sheets).

### 4. Fallback verdicts and order

- Green items: **magenta**. Census production-score loss 0.0 % on green items; azure 0.2 %, blue 0.0 % lose nothing either, but
  magenta collides only with red, pink and purple, which already route away, while azure and blue collide with navy, denim, sky
  and royal blue. New: steel is clean on magenta.
- Green plus pink or red: **blue**. Paid check above; azure is the only alternative and drew weaker, cooler reds.
- Green plus purple: **azure**. Purple is a blue-key and magenta-key collision (census 17.2 % magenta loss; Z jester magenta
  keeps 10 % of purple); azure keeps 100 % on 9 of 9 stored sets with the current extraction.
- Order green, magenta, blue, azure is right: each later key is reached only when the earlier ones collide, and no key earlier in
  the list was beaten for its role.

### 5. Should PixelDoll change?

No code change. Optional doc updates: record in chroma-key.md / PLAN D27 that the fallback roles were rechallenged on
2026-11-10 (despill fix verified on all stored fallback outputs; azure-for-R2 merge rejected; steel on magenta clean), and close
the open question "azure before magenta for green-only items" (closed: magenta). Not tested: poses, body B and 128 px bodies
for the fallback keys, a held weapon on magenta.
