# Underwear default and Nude opt-in

## Decision

New character requests use `wearing a plain white underwear set`. The clause contains no subject gender and does not
prescribe garment cuts. An off-by-default **Nude** switch immediately below Skin replaces that clause with the unchanged
tested bare-body prompt. This gives ordinary character creation a covered default without requiring setup, while keeping
the bare base available for clothing layers that would otherwise reveal underwear.

The exact prompt remains authoritative. The switch recognizes canonical body lines rather than maintaining a second
boolean that could drift after prompt edits or Undo. Custom exact text remains untouched until an explicit coverage
change. Both body variants participate in Details/trait roundtrips and the stored animation description.

Underwear is baked into the base and can show through open garments. This is a generation preference, not a nudity
filter or coverage guarantee. The help text asks users to review generated coverage; the user guide explains this limit.

## Bounded live validation

Four `/create-character-v3` calls cost **8 gens total**, confirmed by completed-job usage receipts. Each used a 64×64
image, low top-down view, mannequin template, transparent background and seed 343. Only the subject phrase, `an adult
human woman` or `an adult human man`, and the clothes clause varied. No animations or nude samples were generated.

- `wearing plain white underwear`: the male sample had light white/blue-shaded briefs in every view. The female sample
  had matching bottoms but no top, so this shorter wording was rejected.
- `wearing a plain white underwear set`: the female sample had a plain white top and bottoms in all eight views. The
  male sample had plain white briefs without a top in all eight views. This is the selected wording.

All views were inspected at nearest-neighbor 4× scale. One seed per subject is a bounded sanity check, not evidence of
reliability across every description, seed, body type or model update. Local receipts, original frames and review
montages remain under `app/test-results-underwear/live/` and `app/test-results-underwear/live-set/`, intentionally ignored
by Git. Paid submissions were not retried; completed receipts were reused when sandboxed image downloads failed.

## Verification and review

- `npm run check`: passed, including Svelte diagnostics, TypeScript and formatting.
- `npm test`: 177 files passed, 2,244 tests passed and one existing test skipped.
- `npm run e2e -- character-creator.spec.ts creator-request-matrix.spec.ts`: all 37 tests passed with the final wording.
  Coverage includes exact outgoing payloads, keyboard switching, appearance edits, enhancement and Undo, persistence,
  export, and viewport sizes from 320×568 to 1440×900.
- Svelte autofixer and `git diff --check`: no issues. Existing unrelated autofixer style suggestions were left alone.
- Independent GPT-6.1 Sol medium agents challenged the design, implementation, regressions and initial live failure.
  Review emphasized prompt-authoritative state, matching animation clothes and avoiding unsupported safety claims.
  A final independent visual reviewer accepted both selected-prompt sheets with no uncovered or inconsistent views.

Initial test runs hit a shared Playwright cache permission error and a retained server port. Isolated ports/cache fixed
those environment failures. The first UI test run exposed reuse of the prompt-preview row class for the switch; using
the existing appearance trait row fixed it without weakening assertions. Generated cache files were moved outside
`app/` rather than formatting them or changing the check configuration.

The available runtime was Node 25.0.0 and npm 11.21.2, outside the repository's Node 24/npm 11 engine range. No dependency
versions changed. The full unrelated E2E suite and manual dark/light browser review were not run; this small control
reuses Bronze UI appearance and the existing form layout without new styling.
