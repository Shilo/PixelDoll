# Validation and council record

Status: workshop review in progress. This file distinguishes completed checks from proposed acceptance tests.

## Corrected Body and Legs revision

The user clarified and selected the clothing arrangement: Body and Legs remain separate shown slots; Body accepts upper-body or full-body artwork and draws above Legs. Outerwear and Underwear each have one hidden universal slot. Extra independently selected outer/under tops and bottoms are custom slots. The current prototype therefore starts with ten shown and six hidden, superseding the historical ten/five and Underwear comparisons below. Slot identity, built-in editing and populated hiding remain comparisons, not approved production changes.

- Browser interaction checks passed for 16 built-ins, ten shown/six hidden, Body label, no split Underwear built-ins, combined underwear examples, a custom Underwear top copied from Underwear, populated hide refusal, Reset and partial runtime descriptor depths.
- The new front-view layer diagram uses simple geometric masks, not generated clothes. A sampled overlap pixel changed from the Body color to the Legs color when Body was unequipped. Switching Body to Full outfit left Pants equipped. Reordering the Body manager row left preview pixels unchanged. These prove selection and illustrative depth only, not extraction, articulation or canonical rendering.
- Desktop browser DOM checks at 1402x876 and small-screen checks at 320x568 found no horizontal document overflow. The Underwear settings dialog fit the small viewport. The light-theme diagram and disabled directional selector were checked through the DOM. Physical touch remains untested.
- Embedded preview rendered at 390px in light mode with no console messages; that image was visually inspected. Desktop screenshot capture still reports that the browser is not producing screenshot frames. The original localhost 5198 server returned ERR_EMPTY_RESPONSE; the fallback browser host was unavailable. An owned localhost server on 5216 restored T3 browser interaction checks without touching other servers.
- JavaScript syntax and theme-ownership checks passed. Source formatting and both bundles were regenerated. No production app tests, builds, engine parity checks or paid calls were run for this isolated prototype.

The default layer sequence is Base, Underwear, Legs, Body, Outerwear. Wide pants may remain visible outside a dress; no selection is automatically cleared. Underwear remains usable on nude and clothed bases, but does not remove clothing baked into the Base. Full-body extraction and custom copied behaviors still require production validation.

## Accessory documentation follow-up

Following independent Sol and Opus reviews, the user approved optional naming with the Accessory fallback and numbered repeats. No required region picker. Default drawing position is above Body and Legs, below Outerwear, Hair and held items, with adjustable order. This supersedes the initial region-based creation proposal. It adds no built-in and preserves one selection per slot. The plan explains readable-key API and folder behavior and records the reviewers' disagreement about Hair accessory.

The blank-name fallback and revised default depth are not implemented or tested. Existing Add slot and Start with controls only approximate the proposal. No prototype or production files were changed for this documentation follow-up, and no new browser, generation or engine checks were run. Future acceptance checks include blank and repeated names, case-insensitive collisions, default depth independent of Wardrobe order, clear feedback when Outerwear covers the item, and actual accessory fitting. Production implementation remains separately unapproved.

## Council composition and dissent

The requested models were GPT-6.1 Sol at medium reasoning and Claude Opus 5.5 at medium effort. Independent delegated reviews examined architecture and workflows. Their findings were challenged against one another; agreement was not manufactured by treating one model's imagined internal voices as additional reviewers.

| Topic                  | Sol position                                                    | Opus position                                                             | Workshop treatment                                                                                                  |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Identity               | Permanent readable keys plus labels; keep current built-in keys | Permanent readable keys plus labels; suggested cleaner built-in keys      | Compare name references; retain existing keys to avoid unnecessary churn                                            |
| Built-in editing       | Resolved per-character customization with reset                 | Smaller inherited-profile surface; no advanced authoring editor initially | Fixed/copy and customize/reset modes; advanced settings clearly simulated                                           |
| Duplicate labels       | Prefer uniqueness including hidden slots                        | Consider allowing a custom replacement while hidden original unavailable  | Prototype permits hidden-label duplicates with different keys, exposing the ambiguity; production policy unresolved |
| Hiding populated slots | Favors one hidden group with equipped counts                    | Favors blocking until empty                                               | All three policies; empty-only initial mode follows user's current preference                                       |
| Underwear              | One experimental hidden combined slot, provisional z15          | Custom-only because standard body has baked underwear                     | None, combined and split; no generation claim                                                                       |
| Custom depth ties      | Independent deterministic render ordering                       | Suggested base+1 and list-order tie                                       | Reject list-order tie because browsing must not alter pixels                                                        |
| Metadata               | Existing runtime manifest plus project authoring concerns       | Reuse manifest; no depth suffix                                           | Three export comparisons; loose PNG explicitly not parity                                                           |

## Verification record

- JavaScript syntax checks passed for `prototype/workshop.js` and `prototype/bundle.mjs`. Prettier ran only on changed source/docs. Both generated HTML files were regenerated afterward from installed Bronze UI 0.3.6, fixture PNGs and the current source.
- The existing theme-ownership tripwire passed, including a targeted `checkOwnership` call on `prototype/workshop.css`. Shared component appearance stays in Bronze UI; prototype geometry stays local.
- Desktop browser initially loaded existing fixture artwork without reported console errors; the initial desktop screenshot was inspected. Later T3 screenshot capture could not obtain desktop frames, so final visual screenshot review is incomplete. This is not reported as full visual approval.
- Browser DOM/layout checks passed at 1440x900, 390x844, 320x568 and 844x390. Manager/export surfaces had no horizontal document overflow. Settings dialogs fit the checked small portrait and landscape viewports. Light and dark states were exercised, not a substitute for physical-device or final visual review.
- Embedded-frame previews at 728px dark, 390px dark and 320px light rendered without reported console messages. The frame follows host color preference and hides its standalone theme switch; `workshop.html` retains both themes. Fixed dialog bounds replace viewport-height units only in the embedded packaging.
- Browser interaction checks passed: ten shown/five hidden inventory; empty-only populated refusal and empty-after-delete path; collapsed and single-group hiding with unchanged equipped state; return to empty-only restores populated categories; Undo; combined/split Underwear; independent browsing order; stable-key rename; name-reference rename breaking an old key; suffix and loose-art warnings.
- Council blocker reproductions passed after fixes: atomic outfit remapping when a custom `chest` key overlaps a renamed built-in; restoring original keys on return to key mode; duplicate experimental Underwear keys rejected; copy form submits without extra typing; name-mode factory reset remaps keys; duplicate-label identity transition rejected; duplicate labels disambiguated in Wardrobe.
- Input checks passed: actual pointer drag of Head onto adjacent Hair changes their order correctly and restores handle focus; group-end Move controls are disabled; hiding retains manager focus; closing the editor restores its opener; arrow-key tab navigation works. Physical touch and continuous edge-autoscroll remain unverified.
- Foreground depth changes below body z10 changed sample pixels; Undo restored the original canvas. This proves the illustrative painter's depth control only, not canonical rendering parity.
- Both download controls completed. Downloaded JSON parsed successfully with `exampleOnly` markers and expected slot/hidden counts. No production loader was invoked.
- No production source files are part of this change. No PixelLab calls, paid generations, real character writes or credential reads are needed.
- App-wide check/unit/E2E suites are not required for docs plus an isolated static prototype. They are not claimed as run.

## Fresh artifact review and disposition

Independent artifact reviews: [Sol contract review](t3-thread://v2/4bd92ed5-5417-4d87-8dfb-d5737c6cb02d/thread:delegated-task:command%3Amcp%3Afa8dcd92-4bd1-4418-995e-d1efd3b21b18%3Adelegate-task%3A746275f3-705f-4e03-85ca-95d01c5b2da4), [Opus workflow review](t3-thread://v2/4bd92ed5-5417-4d87-8dfb-d5737c6cb02d/thread:delegated-task:command%3Amcp%3Afa8dcd92-4bd1-4418-995e-d1efd3b21b18%3Adelegate-task%3A38696e3e-e3df-4e08-86cb-e8046053cf92).

Both were static reviews. The coordinator fixed their blockers and reproduced the relevant flows in the browser; the reviewers did not independently reapprove the final revision.

| Finding                                                                                           | Disposition                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sequential identity rewrite could overwrite saved outfit entries; key mode failed to restore keys | Atomic mapping from original references, creation keys retained, duplicate transition rejected; reproduced               |
| Underwear toggle could duplicate a custom key                                                     | Conflict check before mutation for combined and split presets; reproduced combined conflict                              |
| Name-mode Reset left an unrelated key; reused deleted keys overstated compatibility               | Reset validates/remaps; indicator now says only that the key exists; deletion/reuse contract documented                  |
| Copy opened with missing key and misleading inherited dropdown                                    | Unique key suggested immediately; copies retain source-profile provenance and hide the creation-only profile picker      |
| Move crossed hidden-group boundaries; adjacent drag was off by one                                | Group-scoped move and disabled boundary controls; drag target index captured before removal; actual adjacent drag passed |
| Focus, tabs and repeated accessible names                                                         | Retained action focus, close-event opener recovery, proper tab roles/keyboard behavior and category-specific labels      |
| Body ignored its z; advanced settings implied unsupported art                                     | Body sorted at z10; creation-ordinal tie order; explicit unqualified-generation and populated-item warnings              |
| Reset exposed for experimental/fixed slots; duplicate labels unclear in dressing                  | Reset only for editable qualified built-ins; duplicate keys shown in Wardrobe/equipped summaries                         |
| Underwear toggle silent; empty-only Hide looked broken                                            | Toggle disclosure, baked-base warning and empty-only button label; policy restoration feedback                           |
| Generated bundle drift                                                                            | Reproducible bundler; both committed outputs regenerated with every source revision                                      |

Remaining judgments: keep the compact Face label for comparison, with scope defined as accessories rather than anatomy; Undo intentionally includes experiment settings so a risky comparison can be reversed. These are not production decisions. Raw JSON override editing is retained only to inspect metadata needs and should not be mistaken for a finished casual-user control.

## Explicit limitations

- This is a foreground-only illustrative painter, not the canonical compositor. It does not validate custom extraction, anchors, masking, background splits, padded held sprites or native-engine parity.
- Export downloads are partial marked design examples, not usable engine archives. Do not replace existing manifest consumers with them.
- Physical touch scrolling, long-press interaction and continuous edge-autoscroll are not proven by desktop browser checks.
- Name/path validation is illustrative, not a production security boundary. Plain JSON advanced input is an expert comparison, not final simplicity-first UX.
- Settings are in memory and reset on reload. No persistence or shared-library compatibility is promised.
- The factory baseline ten/five layout is a recommendation. Existing grouped access to Outerwear and Waist means hiding them is a discoverability change, not free cleanup.

## Discussion after trying the workshop

We should settle the stable-key versus mutable-name tradeoff first, then decide whether built-ins can be customized in place. Those choices determine whether duplicate labels and copied categories are worth supporting at all. Next choose hiding, Underwear and the smallest advanced surface that is honest about supported art.

Do not start production implementation merely because the prototype feels interactive. Approval must specify policies and support boundaries, with offline test cases from the [plan](plan.md).
