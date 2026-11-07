# Claude's response to the post-bb830dfb counter-review

November 7, 2026. Answers [the counter-review handoff](../../handoff/2026-11-07-claude-post-bb830dfb-review.md) finding by
finding. Every correction below has a production regression test that fails on the reviewed code; each was challenged by an
independent reviewer, whose findings were reproduced, and the accepted ones were applied before commit. No PixelLab generation
was used for these corrections.

| Finding | Verdict | Correction |
| --- | --- | --- |
| R1 held connector | Reproduced; corrected | A part below the size floor may link to a full-size part that lies mostly off the body. |
| R2 one-joint action | Reproduced; corrected | A joint counts only while every bone on its chain to the trunk keeps a plausible length. |
| R3 front-only dark detail | Reproduced; corrected as uncertainty | A view flagged only by solid near-black patches is a review note, not a smudge. |
| R4 hidden saved-frame recovery | Reproduced; corrected | The save-conflict message leads, so the free recovery stays offered. |
| R5 lost noun | Reproduced; corrected, and widened | Counted prefixes are removed; "of" names are kept. |
| R6 decoration shield slot | Reproduced; corrected | The slot reads the item's subject, cut at attachment and decoration clauses. |
| R7 zero-width hang | Reproduced; corrected | Both grid helpers share one input validator. |

## R1. Held cleanup across a thin connector

Reproduced with an equivalent fixture (`app/test/unit/held-connector.test.ts`): a 100 px handle, a 2 px link and a 20 px head,
2 blank columns apart, kept 100 of 122 px. `heldParts` now lets a component below the size floor that touches the kept set
join when it is within the 3 px attachment distance of a full-size component that lies mostly off the body; that component
then joins on the next pass. Ownership is the separating signal: a repaint sits on the body, a flail head hangs in open air.

- Valid: the flail keeps 122 of 122 at two part sizes; the reviewer's adapted probe also keeps it at 64 to 160 px cells and
  with a diagonal link.
- Controls kept: the detached head without a link is dropped, and the fleck still cannot pull a buckle painted on the body.
- Frozen bench: every held case's shipped masks are identical.
- Limits: a chain of two or more sub-floor links still loses its head; a full-size smear in open air reachable through one
  fleck is now kept (the attachment reach becomes about 7 px for off-body parts); a head lying mostly over the body is
  still dropped. The 3 px attachment distance is not scaled with the cell.

## R2. One measured joint disabling walk checks

Reproduced: one measured eye at the frame corner made a walk an action. My first correction (two joints and two frames)
was rejected by the independent review: real slashes are decided by one joint, the wrist, in two or three frames, so it lost
4-frame slashes named like gaits, and two correlated outliers still flipped a walk. The adopted rule keeps the original
one-joint, one-frame decision but ignores any joint whose bone chain to the trunk grew more than 0.2 body heights (stored
clips stretch at most 0.06). A second review round found the same class on the trunk (one bad neck or hip estimate flipped
43 of 47 stored walks and idles), so a frame whose hip width grew is skipped, the neck's bone runs to the hip center, and a
lean counts only when the shoulders lean with the neck.

- Valid: real slashes stay actions, including 4-frame subsamples named `run-slash`.
- Fixed: one eye, both eyes, a wrist thrown above the head, a knee, the neck or a hip misplaced, in one or two frames, no
  longer turn a walk into an action (`app/test/unit/move-classification.test.ts`). On 12 stored rigs: 19 of 20 real slash
  clip-directions and 38 of 40 four-frame subsamples stay decisive, as before; 0 of 47 walks and idles are; KayKit deaths stay
  decisive.
- Limit: a plausible-length wrong estimate (a whole arm consistently misplaced) can still decide.

## R3. Front-only dark detail treated as corruption

Reproduced. Intended dark details drawn on one side (an emblem, buttons) are common, so asserting a smudge is wrong; but
skipping all near-black again would hide an unrequested dark blotch. `smudgedViews` now reports a view flagged only because
of solid near-black patches as `dark`: a review note, "a dark patch not seen in the other views; check that it is part of
the design", instead of the D1 smudge. Gray patches stay D1 smudges.

- The set of flagged views is unchanged; only the label and the severity of dark-only cases change. No frozen bench
  keyframe changes.
- Limit: intent still cannot be read from pixels; the note asks the user.

## R4. Combined failure and save conflict hid free recovery

Reproduced (`app/test/unit/automatic-recovery.test.ts`). When a direction failed and the save also conflicted, the
direction error came first and the "Use saved frames" offer, keyed on the conflict prefix, disappeared. The save error now
leads. Not verified in a live browser session.

## R5. Article plus count lost the noun

Reproduced, and the independent review found the same commit also cut "of" names ("Cloak of shadows" became "Cloak").
`itemHead` now removes a leading article and a count phrase (a pair of, sets of, a couple of), keeps "of", and cuts a head
longer than four words at " of " ("sword of a thousand truths" becomes "Sword"). An earlier test that expected "Cloak" encoded
the regression and was corrected. The generation prompt is unchanged; only the display name is affected.

## R6. Decoration noun moved the item to the other hand

Reproduced. The independent review showed that reusing the name head broke real shields ("a black and gold kite shield", "a
large, round wooden shield"), because names cut at "and" and commas. The slot now reads its own subject phrase, cut only at
attachment and decoration clauses (with, bearing, engraved, of, hanging and similar), after the same article and count
strip as names. Direct shields, bows, color pairs, adjective lists and "a pair of shields" stay in the off hand; a sword with
a scutum emblem stays in the main hand. Limit: "a coat of arms shield" defaults to the main hand. The default stays editable.

## R7. Zero-width repair input hung the layout search

Reproduced. `repairGridLayout` and `gridEstimate` share one validator, so invalid dimensions or counts throw at once; valid
layouts, including 160 px cells needing three columns, are unchanged.

## Documentation

The grip note in `docs/known-issues.md` now says the layering cuts nothing from the item at the grip, and that extraction
cleanup can still drop small detached parts elsewhere.

## Validation

`npm run check`, the full unit suite and the studio end-to-end spec pass; the frozen bench report is unchanged. Not run:
the full end-to-end suite, a live browser check of R4, and paid generations.
