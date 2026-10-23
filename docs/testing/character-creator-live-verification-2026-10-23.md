# Character creator live verification — 2026-10-23

Completed: six grouped live cases, desktop/mobile visual checks and focused regressions. A planned request preview or fixture does not establish that PixelLab accepted a request or followed an appearance hint. Generated art retains the quality limitations recorded below.

## Method

Real requests were submitted through the app in the Codex in-app browser on the loopback-only agent server. Request JSON was copied using the app's API inspector. Output ZIPs were downloaded through Export. No token is included in the evidence. Offline tests intercept all PixelLab traffic and explicitly disable the agent key.

The live matrix groups option values to reduce costs, rather than testing them separately or taking a Cartesian product. The user requested fewer remaining generations after L04 started, so L05–L06 each animate one source and the proposed seventh paid case was dropped. Every listed option is covered by the offline UI-to-HTTP matrix; Skin “Not set,” maximum size/seed and some direction combinations do not have separate live generations. Appearance labels are prose guidance to an image model; they cannot guarantee exact anatomy or palette colours. Source size is the requested image canvas, not a guaranteed opaque body height. Export frame padding and direction mirroring are deterministic operations and are checked at the pixel level.

## Live matrix

| Case | Appearance | Body / frame | Directions / camera | Seed | Result |
|---|---|---|---|---|---|
| L01 | Human; Slender; Natural; Deep brown | 48 / Auto 64 | Side-scroller 2; Side | 424201 | Complete |
| L02 | Elf; Broad; Chibi; Brown | 64 / Auto 80 | Top-down 4; High top-down | 0 | Complete, 2 px drift warnings |
| L03 | Dwarf; Muscular; Natural; Tan | 96 / manual 160 | Diagonal 4; Low top-down | 424203 | Complete, 3–4 px walk warnings |
| L04 | Orc; Rounded; Chibi; Light tan | 128 / Auto 160 | Unique 8; High top-down | 424204 | Complete, quality notes retained |
| L05 | Undead; Not set; Not set; Light | 32 / Auto 48 | East only; Low top-down | Random | Complete, no final QA warnings |
| L06 | Not set; Not set; Not set; Pale | 76 / manual 129 | West + mirrored east; Side | 424206 | Complete, 2 px walk notes |

Screenshots, request exports and generated ZIPs are kept locally outside the repository. Only this summary, tests and the [offline verifier](live-creator-2026-10-23/verify-output.mjs) are committed. Run it with a case ID and the local evidence directory.

### L01

- The actual V3 request contained the exact assembled prompt, 48 × 48 image size, Side camera and seed 424201. Name was local only.
- All eight original standing views were registered and retained. Only east was animated; west was derived locally.
- Export contained 4 idle frames and 8 walk frames per direction in 64 × 64 cells. Both exported clips were nonempty; every west frame was an exact horizontal pixel flip of east.
- The saved project had 24 measured frame skeletons, no rig QA warnings, idle adherence 0.40 px and walk adherence 0.53 px. Both clips passed palette and border checks.
- The real result was inspected visually in the Codex browser and opened successfully in Studio. The account display moved from approximately 9,956 to 9,943 generations; exact per-request reported usage is retained separately from estimates.

### L02

- Actual initial HTTP JSON exactly matched the reviewed plan, including seed zero, a 64 × 64 source and the High top-down camera.
- All eight registered originals were distinct 80 × 80 images. The western originals were not copies of their eastern partners.
- Only south, east and north were animated. The four-direction export contained 48 nonempty cells, with complete measurements; west was pixel-exactly mirrored from east.
- Freeze warnings report 2 px drift relative to the shared pivot in idle/north, walk/south and walk/north. These are retained quality warnings, not missing measurements or corrupted output. The raw clip gate passed; no art reroll occurred in this case.
- The result was inspected in the Codex browser at a 390 × 844 viewport, opened in Studio and exported successfully.

### L03

- A 96 × 96 V3 source was padded to a manually chosen 160 × 160 frame. All eight registered images and exported rest images matched exactly. Estimator inputs were padded to 256 × 256 without scaling; the saved measurements were complete and within the frame.
- Only south-east and north-east were animated. Both western diagonals were exact pixel mirrors, with matching reflected skeleton coordinates.
- The 48 exported cells contained 4 idle and 8 walk frames per selected direction. Raw request descriptions retained Dwarf, Muscular, Natural and Tan; all sent camera values and seeds matched the reviewed plan. Reported cost was 25.25 generations, with no unknown cost rows.
- Shared-pivot warnings recorded 3–4 px foot movement during walking. No art reroll occurred. Output was inspected on mobile, opened in Studio and exported.
- A real exact-prompt enhancement at 96 px and Low top-down retained the chosen appearance in its prose. Undo restored the original prompt byte-for-byte.

### L04

- All eight directions were independently animated and exported, with no mirroring. The 96 nonempty cells had complete skeletons; all eight registered originals matched the retained images.
- There were 204 accepted POSTs and 37 explicitly uncharged HTTP 429 refusals. Every refused estimate later completed with the same body and queue identity. No accepted request was resent. Final reported usage was 98.6 generations, with no unknown cost rows.
- Walk east and west each used the existing single bounded quality reroll. West still reported 2.71 px arm-pose deviation. Eleven additional shared-pivot notes reported 2–9 px foot movement. These are retained output limitations; this case does not establish that all art-quality gates passed.
- Output was inspected across all eight directions in the Codex browser and exported. The independent reviewer confirmed pixel borders and measurements without further generations.
- Corrected Appearance enhancement received the full linked prompt and retained Orc, Rounded, Chibi and Light tan. Enhance and Undo occupied the same 78 × 28 px bounds; Undo restored the original Details before generation.

### L05

- The actual request used a custom 32 × 32 source, Auto 48 × 48 frame and Low top-down camera. Blank Random resolved once to seed 320892553 and was retained consistently in downstream requests.
- Only east was exported, with 4 idle and 8 walk frames, 12 complete skeletons and no final QA warnings. All eight distinct registered originals remained available. This verifies the one-facing workflow without adding a preset.
- There were 22 accepted POSTs, no rate refusals or unknown-cost rows, and 12.95 reported generations. No art reroll occurred; no manual generation was repeated.
- The live result opened in Studio and exported successfully through the Codex browser.

### L06

- A real Appearance enhancement used `/enhance-character-v3-prompt`, full linked Pale context, Side camera and the originally entered 73 px size. Its improved freckles/expression description was reused for the corrected creation without another enhancement call. Not-set Kind, Build and Proportions add no trait clauses.
- The original create request at 73 px was rejected with HTTP 422 before a job was created. The exact stored error established the four-pixel from-scratch constraint. Its cost was not reported and remains unknown. Reload after the fix blocked the unsupported value locally without another request.
- The corrected request uses a 76 px body, 129 px manual frame, Side camera, seed 424206 and west as the sole animation source; east is derived locally. V3 accepted the supported non-eight-multiple size and registered the odd frame size.
- The terminal JSON matched the reviewed plan and retained the enhanced description exactly. All eight registered originals matched the export. Only west was animated; every east cell was its exact horizontal pixel mirror, with correctly reflected skeleton coordinates.
- Export contained 4 idle and 8 walk frames per direction, 24 nonempty cells and 24 complete measurements. Skeleton estimation used a 256 px input with a 63 px offset, without scaling the odd 129 px frame. Raw clip gates passed; two shared-pivot walk notes report 2 px foot movement and were expanded and inspected in the live results disclosure.
- There were 25 accepted POSTs, 13 reported generations, no rate refusals, no unknown-cost rows in the corrected workflow and no art reroll. The earlier rejected 73 px call remains a separate unknown-cost record. The completed character opened in Studio and exported through the Codex browser.
- The reviewer independently checked 199,692 reflected pixels with zero mismatches and all 20 padded estimator inputs. Both actual clip gates passed (idle 0.88 px and walk 1.14 px pose deviation). No further test or generation was needed.

## Independent review and fixes

The reviewer challenged both the implementation and proposed fixes. Accepted findings:

1. Recreating the same seeded output used a content-derived project ID and could overwrite an existing dressed character. New creation IDs are persisted before the first request; reloads retain the ID. Atomic publication preserves an existing record, including legacy IDs. IDs remain local and do not change paid request caching.
2. Missing frame skeleton measurements could be skipped by adherence scoring and incorrectly pass QA. Required observations now stop setup, retain generated images and use the queue's no-resend safety. Empty art is rejected before spending on skeleton estimation; clip QA independently rejects missing measurements and empty frames.
3. Managed standing skeletons were accepted based on label existence alone. They now require complete, finite, normalized coordinates before use; invalid selected references fall back to safe estimation.
4. Opening the API inspector during the gap between durable submission and HTTP recording could fabricate a second restored request row. The queue now leaves live submitting requests to the HTTP recorder. A deferred-request regression verifies one real POST and one activity row; genuinely interrupted submissions remain inspectable.
5. Appearance enhancement omitted selected appearance hints. A real call returned “slender” despite Broad being selected. Enhancement now receives the linked prompt; canonical returned clauses are parsed before applying improved Details, preserving selected hints without duplicated clauses. Model-written prose can still require user review; Undo restores the original prompt exactly.
6. Incomplete pose observations were scored as zero deviation. They now remain unscored and fail completeness checks, avoiding misleading quality claims.
7. The results screen showed only four notes, hiding a later failed clip behind shared-pivot warnings. All notes are now available in a compact disclosure, with stored clip failures first and expanded initially. Idle notes no longer say “while walking.”
8. The reviewer challenged the proposed narrower direction grid on touch tablets. The final grid accounts for 44 px mirror targets at every coarse-pointer width, preserving 56 px arrows. Auto/input heights and the right-aligned prompt copy control are covered by the existing viewport checks.
9. Live V3 rejected a 73 px from-scratch body with HTTP 422: dimensions must be multiples of 4. The saved OpenAPI's V3 size schema omits that constraint; current [official Pixen documentation](https://api.pixellab.ai/v2/openapi.json) states divisibility by four, and V3 uses Pixen for its initial image. UI validation, enhancement availability, input stepping and pipeline guards now enforce 32–256 in 4 px steps. Frame padding remains any valid whole-pixel size. The failed response did not report cost, so it is recorded as unknown rather than assumed free. The corrected final case uses 76 px to avoid unnecessarily restricting sizes to multiples of eight; the enhanced text is reused without another enhancement call.

The reviewer caught and corrected an invalid test-fixture assumption while evaluating the fixes. Both agents rejected a fresh ID inside the pipeline in favor of a persisted creation ID, because reloads require the same identity.

## Offline verification

- Type checking: zero errors or warnings. Production build and secret-dist guard pass; the existing bundle-size advisory remains.
- 260 unit tests passed before the final live size correction, including 863 valid direction plans and 12,082 transitions, all 225 local integer pixel sizes, frame padding, exact mirrors, complete measurements and atomic project identity. Focused validation coverage now distinguishes 57 valid from-scratch sizes from 168 unsupported integers; the local pixel pipeline still handles every whole-pixel frame size.
- A clean full browser suite passed 61/61 before the final layout and disclosure changes. The affected six layout tests and one new quality-note test then passed independently; the full suite was not repeated.
- The UI-to-HTTP matrix captured 57 offline POSTs, covering every appearance option, camera, preset, manual direction/mirror control and boundary values without paid generations. Five viewport checks cover 320 × 568 through 1440 × 900, including landscape; a separate coarse-pointer tablet check protects touch targets.
- After discovering the service's size constraint, the reviewer reran only the affected size checks: all 57 supported 4 px body sizes pass and all 168 other integers are blocked; 225 local padding/mirror cases remain covered. The focused browser case captured nine POSTs, including 76 px and manual frame 129, and confirmed unsupported 73 px sends none. This checks serialization and local guards; live acceptance is verified separately.
- The new disclosure test initially needed its fixture readiness corrected: the project-menu button appears before demo art is loaded. Waiting for the stage canvas resolved that test setup issue.
- Final desktop (1440 × 900) and mobile (390 × 844) screenshots were captured from the production preview using the Codex browser. The independent reviewer viewed all three captures and found no additional layout issue. Images remain outside Git.

## Single-direction preset decision

Single-facing battle art is a real use case, but current research does not establish enough demand to add a sixth permanent preset. Side-scroller 2 already uses one unique east source; west is a free mirror. Turning W off obtains east only, with the same paid work. Keep five presets and explain that action in Directions help. If added later, “Single view” describes the behavior accurately.

“RPG Maker” would imply compatibility the preset does not provide: [RPG Maker MZ side-view battlers](https://rpgmakerofficial.com/product/MZ_help-en/01_11_02.html) require a specific 9 × 6 motion layout. Pokémon-style battle systems also commonly use distinct front and back graphics; see the maintained [Pokémon Emerald expansion authoring guide](https://github.com/rh-hideout/pokeemerald-expansion/blob/master/docs/tutorials/how_to_new_pokemon.md).
