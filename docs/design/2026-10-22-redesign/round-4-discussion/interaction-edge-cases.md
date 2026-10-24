# Missing animation feedback and fading description

**Superseded research proposal.** See [current-design.md](current-design.md) for accepted continuous movement with sprite fallbacks, deduplicated toasts and one-line prompt expansion. In particular, the movement-blocking and timed-fade suggestions below were not accepted. This document preserves the earlier rationale and sources.

2026-10-23. Narrow UX recommendation for discussion before full mockups. No code, new mechanics, paid calls or images. The policies below are proposed; the current app has sprite playback, not playable locomotion. Existing sprites retain their original palette: none of this needs actor tinting or a shader. Reflection remains a rendering concern and must not carry essential feedback.

## Missing animations: quiet, but explain the failed request

Use a small **neutral availability cue above and slightly beside the actor**, outside the combined equipment bounds, rather than an icon under its feet. The feet are the alignment/pivot and grounding reference, and a floor icon competes with shadows, reflections and movement. A persistent overhead warning would distract from headwear; show the world cue briefly only after a genuinely unavailable request, with the reason remaining reachable from the character information. This location and behavior are design judgments, not requirements from the sources below.

Do not use red flashing, floating error text on every input, camera shake, sound by default, or a bouncing exclamation mark. A familiar small outlined “unavailable” symbol is enough when paired with a specific explanation. The icon cannot explain which clip/direction/item is missing on its own.

| Missing coverage | Proposed behavior | Explanation and recovery |
| --- | --- | --- |
| Locomotion in the requested direction | Keep position and the last valid facing. Do not slide an idle sprite across the floor, animate the wrong direction, or invent mirrors. Continue working movement directions. | On first failed attempt: “Walk north is not available.” Availability details show the missing coverage and an explicit route to animation setup/review where supported. Avoid implying that the current Add a move sheet can extend arbitrary missing directions. |
| Idle | Stop movement and show the stored rest view for that facing if available; otherwise hold a valid existing frame. No repeated warning every time the user stops. | Availability details say “Idle not added”; this is an honest still pose rather than a newly fabricated idle animation. If the user explicitly requests an unavailable Idle clip, give the same once-per-condition feedback as another missing move. |
| An optional action | Omit unbound, nonexistent mechanics. For actions actually offered, show unavailable state/reason before activation; if another input path requests it, keep the current valid state. | “This move has no east view.” Offer another valid facing or the appropriate authoring path. Do not assume combat, jumping, collision or action keys exist. |
| Equipment frames for an otherwise valid body clip | Body can continue, while only the missing item layer is absent. Keep that item equipped in the outfit model; do not silently unequip it or freeze its old pose onto the moving body. | Retain a visible, compact “1 item missing frames” status in the equipment zone and mark the affected item. Details name the move/direction and expose the existing priced pose/remake/fit-review path. A brief world cue on the first transition is optional. |

The equipment case is already a real behavior in the app: missing layers render transparent; `StageNote.svelte` names the affected item/move/direction and offers repair. Preserve that explanation when reworking the shell (`app/src/lib/compose/compose.ts:197`, `app/src/studio/StageNote.svelte:1–44`). Intentional hiding by another garment is not missing coverage (`dress.ts:189–192`). Base direction coverage already constrains preview controls (`Stage.svelte:25`, `:90–98`).

Use one deduplicated condition per character + clip + direction + affected item set. Holding a movement key must never restart the icon or announce the message repeatedly. Remember that the condition was explained until its availability changes or a new character/session begins; let the user reopen the reason whenever needed. Group several missing items into one count. Clear the issue when coverage exists, not when its short visual cue expires. A short cue can fade after roughly **two seconds** because an untimed route to the same reason remains available; this is a proposed trial value, not an evidence-based universal duration.

Do not move keyboard focus or open an authoring modal automatically. Announce a meaningful new failure once through an appropriate status region; keep the detailed recovery control reachable normally. W3C guidance explicitly covers status conveyed by icons as well as text and cautions against overly chatty announcements. [W3C: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

The unresolved product choice is how strictly the playable world protects the complete outfit. My recommendation is the same truthful layer behavior as Preview, with a persistent equipment issue marker; blocking every movement direction because a hat is incomplete would make casual testing frustrating. If the goal becomes proving complete export coverage, that should be an explicit inspection state rather than an invisible movement restriction.

## Truncated prompt: fading can work when the full text stays available

Separate **the creation prompt being edited** from **the descriptive excerpt under a character name**. The creation prompt, validation, costs, quality warnings and missing-frame recovery must remain stable and readable. The optional excerpt in the immersive scene can recede.

Recommended behavior:

- On selecting a different character, show a maximum two-line excerpt with a visible **Details** affordance. Keep the name and Details available throughout.
- Let the excerpt fade after **eight seconds** as an initial design value. No study establishes eight seconds as correct; the reason for allowing the timer is that the same complete information remains available without a timer.
- Keep the excerpt's layout slot stable, so fading never moves the character identity, actor, right-side controls or another target. Do not collapse the left column or recenter the actor.
- Hover or keyboard focus on the excerpt/Details pauses the automatic fading. Opening Details shows the complete description in an untimed, selectable/copyable surface, with an explicit close. Support touch activation equally. Never fade an expanded description or an actively focused element away.
- A click/tap on Details brings the excerpt/full text back at any time. Do not automatically replay it on every movement, equipment change or mode switch. A newly selected character can start the sequence again.
- Reduced-motion users receive a static visibility change or keep the excerpt shown; do not animate its height. Fading must not change the generated sprites or their palette.

This approach follows the key distinction in W3C timing guidance: a temporary message may disappear when an equivalent untimed route remains available; the disappearing version must not be the only opportunity to read or act. It does **not** justify timing out essential text. [W3C: Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html).

If Details is implemented as hover/focus content, it must be dismissible, hoverable and remain available while the relevant hover/focus persists. A tap/click disclosure is the simpler cross-device contract. [W3C: Content on Hover or Focus](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html).

**Discussion recommendation:** choose a brief overhead availability cue with a persistent reason/recovery in the UI, rather than silent failure; allow the optional two-line description to fade after eight seconds, with permanent Details access and stable layout. These can be reflected in palette studies through a neutral availability accent and readable left-side text; neither decision needs a full mockup yet.
