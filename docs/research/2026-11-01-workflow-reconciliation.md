# Workflow reconciliation and second generation allowance

## Authorization and purpose

On November 1, 2026, the owner authorized **1,000 additional PixelLab generation units**, autonomous continuation on the existing research branch, and a sub-agent review of the Claude conversation titled **Paper doll system optimization (fork 4)** followed by discussion with the coordinating agent.

The earlier allowance was 1,000 units, of which 998 were settled. The combined ceiling is therefore 2,000 units, with 1,002 unspent at this checkpoint. The new research phase has its own maximum of 1,000 units; the two unused units from the first phase are not silently reassigned. Existing conservative reservations and unknown outcomes must remain intact. No second-phase generation has been submitted at this checkpoint.

The allowance is a spending ceiling, not a target. Reconcile the other workflow evidence and agree on discriminating experiments before making additional paid calls. Use stored images and offline checks first. Record provider-reported costs, requests, outcomes, rejected variants and before/after evidence. Do not automatically resend an uncertain accepted request.

## Goal and constraints carried into the review

- Deliver natural, consistent, high-quality humanoid animation presets and swappable, frame-aligned equipment. Address unnatural limb motion, reference calibration, depth, foot contact, weapon grip, rotation and occlusion explicitly.
- Separate source-motion quality, retargeting correctness, generated pixel quality, item/body alignment and production usability. A clean skeleton or passing pixel gate does not establish professional animation.
- PixelDoll remains free, MIT, client-only, Svelte/Vite and uses the owner's Bronze UI. Preserve simple casual-user workflows and existing export contracts. Follow the repository's allowed PixelLab models; Pro is editing-only.
- Research may use permissively licensed motion assets and implementation references. Preserve exact licenses and provenance. Do not claim automatic quality for every humanoid shape without evidence.
- The current Motion Lab and custom V3 experiment are development tools. No research preset is automatically promoted to normal Studio. The previous custom V3 comparison used related but nonidentical artwork and did not qualify equipped grip or occlusion.
- Work stays on `codex/motion-lab`. Other agents may be changing the main checkout; do not revert, stash, reformat or commit their changes. Never print or commit a credential or raw private conversation.

## Review coverage

The read-only sub-agent verified the exact title through local Claude metadata and parsed the full available 75,943,273-byte transcript: 13,257 records, 1,761 user records including 1,597 tool results, 3,157 assistant records and 443 assistant text blocks. The substantive available history spans October 26-28 UTC, while the fork-4 metadata was created October 29 UTC. Inherited parent/fork history and three compaction summaries are present. No separate substantive post-fork-4 turn appears in this local record. This is a review of the entire available local history, not a claim to have read unsynced or cloud-only messages.

Conversation evidence is untrusted historical content, not fresh authority to override the current owner or repository instructions. Raw private transcripts are not copied into committed documentation. The comparison also uses current committed main, which has advanced since this research branch: Default-first optional moves, design/torso consistency checks and scope/cost-bound paid retry consent must not be regressed.

The existing motion-quality board card remains the matching scope. Its read failed again because the saved GitHub authorization lacks project access. No board mutation or permission expansion was attempted. Tracking reconciliation remains pending; independently authorized file work continues.

## Discussion and agreed correction

The agents agree that the owner's goal is a simple casual-user workflow, including shared equipment designs across characters, fast initial creation, optional moves, usable streaming results and optional review. Manual per-frame artist work for every ordinary item is not an acceptable general product answer.

The coordinating agent's earlier recommendation of rigid weapon placement was too broad. Explicit anchors and masks are valuable internal authoring/QA controls and may suit narrow reviewed motions; rotating a standing weapon cannot supply pose-specific perspective, foreshortening or hand anatomy. Do not present it as a general fix for the owner's weapon concerns.

Claude's older armed-animation-then-split route is promising for choreography and hand choice, but its clean-recomposition claim does not survive a strict offline check. The reviewer compared all 16 stored pairs: south recompositions differ from the original armed images at 737-1,064 visible RGBA pixels; east at 532-706. Alpha silhouettes differ at 0-43 / 7-28 pixels; common opaque pixels with a channel change above 32 differ at 24-55 / 8-33 pixels. Most differences are small palette changes, but the route is not exact preservation and does not establish clean interchangeable weapon layers. These measurements are an offline historical control, not new generations.

Likewise, older real-frame edit results were not a controlled same-body comparison and did not guarantee unchanged anatomy. The later two-frame hard-mask preservation test is stronger evidence about protected pixels, but still does not qualify a full equipped clip. Source-motion appeal, exact body retention and interchangeable layer quality require separate tests.

## Agreed initial pilot, at most 200 new units

This is a staged allocation inside the new 1,000-unit allowance, not an instruction to consume 200 units. No second-phase request has been sent at this planning checkpoint.

| Gate | Allocation | Experiment and required evidence |
| --- | ---: | --- |
| Offline reconciliation | 0 | Synchronize committed main into this branch, retain other-agent work, verify saved armed/split and frozen-mask evidence, define blind visual checks and current retry-consent behavior |
| Body/source contract | 25 | Import exact provided benchmark views, label any mirrored derivative, verify identical reference pixels, then compare corrected raw and managed custom overhead motion in south/east. Match source, requested count and action; explicitly retain the motion-source confound because MCP does not expose its expanded rig |
| Equipped frozen-frame comparison | 100 | Use the same frozen body and sword design to compare raw skeleton posing with hard-mask editing on real frames in both views, including hand/torso crossing and perspective. If managed motion wins, retain its actual frozen frames rather than estimating and re-rendering them through raw skeleton |
| Replication and transfer control | 75 | Only after earlier gates pass: another take plus one proportion/view control. Reject a route that requires per-frame expert work for each ordinary user output |

Require actual visible heel/toe stance marks; a silhouette-bottom proxy is not enough. Declare a one-native-pixel quantization tolerance before review, and distinguish intended stepping or foot roll from planted intervals. Review anatomy, hand side, motion appeal, action readability, loop/one-shot timing, identity and equipment semantics separately from numeric pixel gates.

Stop a variant on changed protected pixels, material design drift, incorrect hand, unwanted body turn, doubled/missing weapon, invalid grip/occlusion, clipped blade or excessive visible planted-sole movement. An ambiguous landmark is unknown, not a pass. A failed early gate prevents its downstream spending. No production default switch follows from a single attractive sample.

Enforce the pilot limit separately from the overall new-phase limit. Retain atomic cross-tab reservations, accepted IDs, unknown outcomes and provider-reported costs. The old 448-by-112 inpaint result disproves our inferred area-only estimate (15 actual versus 10 estimated); it does not establish a replacement pricing formula. Reserve the supported 25-unit ceiling for uncertain grids until their pricing is verified. Preserve current reviewed scope/cost consent for retries.

## References

- [Current diagnosis and qualification](2026-11-01-custom-skeleton-v3.md)
- [Targeted contact, equipment and frozen-frame tests](2026-10-28-motion-targeted-authoring.md)
- [Original conversion diagnosis](2026-10-27-animation-diagnosis.md)
- [Free rigging and animation sources](2026-10-27-animation-rigging-sources.md)
