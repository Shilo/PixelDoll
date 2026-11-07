# Live endpoint-dressing feasibility pilot

November 7, 2026. This report evaluates the actual completed PixelLab pilot specified by [the pre-submission protocol](protocol.md) and [preparation script](prepare.mts). It preserves the protocol deviation and all returned frames. The external reference-to-video example motivated the hypothesis; this experiment uses PixelLab's allowed `animate-pixminimax` endpoint and does not test the external MiniMax H3 model or ComfyUI inference.

## Decision

Do not promote endpoint dressing or the cloth-settling prompt to a production default. This easy, already-fitted cohort does not establish a benefit over free exact overlay. Both prompt arms change approved garment pixels; the additional cloth language changes shape and detail substantially in several cases. Neither better novel-garment fitting nor savings against a matched existing dresser was tested.

The method can produce a recognizable dressed sprite for a small confirmed charge. That is a narrower result than registered, design-preserving, swappable equipment. Exact palette membership and a plausible recomposition are insufficient acceptance criteria.

## Evidence and audit

The ignored `app/test-results-post-handoff-live/evidence.json` contains eight completed jobs, their durable claims, exact plan, raw provider-order PNGs and receipts. [evaluate.mts](evaluate.mts) verifies and evaluates it; [results.json](results.json) is the tracked compact output.

| Check | Observed result |
| --- | --- |
| Canonical request identities | 8/8 match production `requestIdentity`, including normalized stored parameters and input hashes. |
| Claims | 8/8 bind to the matching job and are timestamped before its queue record. |
| Raw PNG hashes | 72/72 match their retained result records. |
| Native dimensions | 72/72 match metadata and the full submitted two-pane canvas: 128×64 or 160×80. |
| Requested frames versus retained outputs | Eight requested; nine returned per request. All nine retained. |
| Output 0 versus supplied first frame | 8/8 decoded RGBA-exact; 0/8 PNG-byte-exact. Re-encoding changes bytes without changing decoded pixels. |
| Billing | Confirmed cash **$0.09793791823254691**, zero subscription generations; no unresolved jobs or unknown charges in this export. |
| Evaluator calls | Zero new provider calls; no reruns or automatic paid retries. |

The observed nine outputs are consistent with an included source anchor plus eight generated frames. Thus the evidence contains 72 retained PNGs, including eight decoded-exact anchors and 64 subsequent images. This does **not** generalize to a guarantee that every future first frame is exact, and it does not erase the predeclared expectation of eight returned outputs.

## Preserved protocol deviation

The protocol required eight outputs and named raw provider index 7 as its sole acceptance candidate. Every request deviated from that count. Retrospectively dropping index 0 and declaring the new last frame to be the original candidate would change the experiment after observing it.

The analysis therefore retains:

1. **Primary:** raw index 7, exactly as predeclared.
2. **Sensitivity:** raw index 8, the actual last returned frame, explicitly added after the anchor/count discrepancy was identified.
3. **Context:** all indices 0–8, including the source anchor and the transient dressing sequence.

No candidate was selected by quality, no failed sample was discarded, and no paid call was repeated. The sensitivity analysis is not an amended claim that the original protocol passed. Future pilots should reconcile raw-endpoint anchor semantics before submission.

## Evaluation method

The left-hand native cell is cropped at its fixed input coordinates. The right-hand cell is measured separately. There is no translation search, recentering, rescaling, pose correction, color correction or best-frame selection.

Three stages remain separate:

- **Raw:** provider pixels, visible key witnesses, source-body regions, right-pane residue, palette/shape changes and frame-to-frame changes.
- **Extracted:** production `extractCell` with `posed: false`, a full-cell band and no inferred cut. The evaluator asserts that the helper applies zero offset and leaves the raw crop unchanged. It does not call corrective `postProcess` or palette matching.
- **Recomposed:** the extracted layer over the frozen real body. This can restore body pixels that were damaged or erased in the raw result, so it cannot substitute for raw review.

The free baseline places the known approved garment layer over its original frozen body, applying its existing approved cuts. That garment already fits the tested body. Free overlay therefore preserves its design without generation or fitting work. This is an intentionally easy necessary-condition test, not a novel garment, a new body fit, or a held-out generalization study.

Numeric measures include unaligned alpha-mask IoU, production pixel-weighted max-channel palette distance, exact color-edge preservation at approved coordinates, raw key pixels outside the original body, and visible differences from free recomposition. These are complementary proxies. Shape changes can be valid drape, identical RGB does not establish material ownership, and a raw off-key pixel is not automatically clothing or a skin leak.

## Endpoint measurements

`IoU` compares extracted and approved alpha at fixed native coordinates. `Palette` is production palette distance, where zero means the same color set can explain the candidate's visible colors; it does not mean the same motif or shade placement. `Changed` counts visible RGBA differences between frozen-body recomposition and free exact overlay.

| Case/view | Arm | Index 7 IoU | Index 7 palette | Index 7 changed | Index 8 IoU | Index 8 palette | Index 8 changed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A chest, south | Plain | 1.0000 | 0.00 | 40 | 1.0000 | 0.00 | 40 |
| A chest, south | Cloth settling | 0.6272 | 0.00 | 222 | 0.5833 | 5.14 | 248 |
| A chest, east | Plain | 0.5573 | 4.70 | 97 | 0.5573 | 4.52 | 97 |
| A chest, east | Cloth settling | 0.4403 | 7.17 | 138 | 0.4242 | 7.46 | 143 |
| B tunic, south | Plain | 0.9725 | 0.00 | 158 | 0.9746 | 0.00 | 156 |
| B tunic, south | Cloth settling | 0.7253 | 1.87 | 430 | 0.7568 | 2.86 | 406 |
| B tunic, east | Plain | 0.6831 | 10.85 | 249 | 0.6840 | 10.48 | 253 |
| B tunic, east | Cloth settling | 0.5931 | 13.63 | 333 | 0.5868 | 15.28 | 329 |

The closest primary result, A/south/plain, has perfect shape overlap and palette distance zero, yet changes 40 recomposed pixels and preserves only 85 of 182 exact approved color edges. The A/south cloth-settling primary also has palette distance zero, while its shape overlap is 0.6272 and only six of those 182 exact color edges remain. This directly challenges using palette success as a motif or equipment-quality verdict.

Within these four requested-seed pairs, cloth settling has lower approved-mask overlap and more recomposition differences at both evaluated indices. That is a design-retention observation for this cohort, not proof that the prompt can never improve an unfitted garment's drape. Equal requested seeds do not establish shared random noise across the arms.

## Raw body witnesses, residue and temporal behavior

All right panes are fully transparent at indices 7 and 8. The model removes the separate reference garment by those endpoints. Earlier frames include the original reference and transient motion; those are retained rather than cropped away from the evidence.

The raw index-7 key witness counts are:

| Case/view | Arm | Key pixels outside frozen body | Off-key pixels in body regions uncovered by the approved garment | Erased pixels in those regions |
| --- | --- | ---: | ---: | ---: |
| A chest, south | Plain | 0 | 0 | 0 |
| A chest, south | Cloth settling | 0 | 62 | 0 |
| A chest, east | Plain | 1 | 15 | 0 |
| A chest, east | Cloth settling | 4 | 14 | 0 |
| B tunic, south | Plain | 0 | 12 | 1 |
| B tunic, south | Cloth settling | 5 | 26 | 0 |
| B tunic, east | Plain | 1 | 31 | 0 |
| B tunic, east | Cloth settling | 3 | 27 | 0 |

These off-key counts identify review regions, not ground-truth errors: new drape can legitimately cover a region that the approved garment leaves visible. Key-colored pixels outside the frozen body are registration/identity witnesses under the requested no-key-in-clothing constraint, not a complete anatomical test. New exposure, one-pixel erasure, garment overlap and altered body shading need independent visual interpretation.

Even A/south/plain changes the exact key RGBA on 162 of 454 approved-uncovered body pixels while retaining key classification on all 454. That violates the literal exact-key-color instruction, but key-shading changes alone need not damage the final real body because extraction removes the key. This is why exact raw RGB, body shape, extraction ownership and recomposition are reported separately.

The last three left-crop RGBA transition counts are `8,10,8`, `12,3,9`, `24,24,20`, and `497,129,129` for the four plain cases in table order; the corresponding cloth-settling counts are `165,164,188`, `140,159,153`, `381,343,337`, and `350,380,301`. The sequence is not uniformly frozen or settled. These counts also include intended clothing motion and palette changes, so they must not be described as measured body motion alone. Full per-frame bounds, key witnesses and changes are retained in `results.json`.

## Independent visual review

The evaluator writes native-pixel public-input/output contact sheets and play-once sequences into ignored `app/test-results-post-handoff-live/blind/`. Open its `index.html` through the local test server. It shows anonymous A/B candidates, control garment and free overlay, both endpoint indices, raw/extracted/recomposed columns, and every full-canvas provider frame.

The candidate-to-arm mapping is retained in a separate `blinding-map.json`. The independent reviewer must record judgments before opening that mapping or the labeled numeric report. A checkerboard is presentation background only. Playback uses an explicitly labeled 200 ms display cadence; the experiment does not establish provider video timing. No integer magnification or contact-sheet placement changes the measured native images.

The coordinator owns the independent review record and any resulting challenge. This report does not substitute the evaluator's knowledge of prompt arms for a blind preference or semantic ownership judgment.

## Reproduction and limits

With the retained public evidence present, run from the repository root using pinned Node `v24.22.1`:

```text
node docs/research/post-handoff-qualification-2026-11-07/live/evaluate.mts
```

The run verifies hashes and dimensions, regenerates compact measurements and ignored review media, and makes no network calls. The tracked result records the evidence hash and exact production helper hashes. The evaluator's initial audit incorrectly compared an in-memory `undefined` property with its omitted JSON-export form; it was corrected to use production canonical `stableStringify` before accepting the matching identities. No receipt, parameter or image was changed.

No extra generation was purchased for the evaluator or count discrepancy. There is no cost-benefit comparison with current edit/transfer dressing, no cross-body fit, no novel garment test, only one seed per fixture/view, and no evidence that a pose-video reference could be passed to this PixelLab endpoint. Do not extrapolate this pilot to character ages, new proportions, weapons, higher occlusion, ComfyUI/H3 output, or the entire wardrobe pipeline.
