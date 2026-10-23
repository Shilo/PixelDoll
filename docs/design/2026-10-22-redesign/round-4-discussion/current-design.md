# Current design direction: Obsidian / Porcelain Bronze

Updated 2026-10-23 after the user's movement-fallback correction and palette choice. **This is the controlling design record.** It supersedes incompatible proposals in the earlier discussion, including blocked locomotion, timed prompt disappearance, overhead warning icons, and the previous rejection of a mobile joystick. It records design intent, not implemented behavior or a passed gameplay test.

**Dynamic behavior refinement:** [animation-resolver.md](animation-resolver.md) specifies the velocity-based motion state machine, normalized nearest-direction calculation, intended-versus-available coverage, fallback chain, equipment synchronization and deduplicated error notices. The user delegated algorithm choice and accepted the equipment recommendation. The specification below remains the visual/interaction overview.

**Approval recorded:** The user explicitly agreed to the recommendations, including the dynamic resolver, and authorized full desktop/mobile image mockups for Characters, Create character, Preview, Top-down and Side-scroller in Obsidian / Porcelain Bronze using actual demo sprites. The image round is [round five](../round-5-mockups/README.md). This approval does not request production integration or the later playable prototype yet.

## Accepted visual and screen direction

- Full-screen immersive HD prototype world; Obsidian Holodeck is the chosen direction. Use **Obsidian / Porcelain Bronze** for coordinated dark/light backgrounds and UI. Frost and Sage remain historical alternatives, not additional product requirements.
- Theme switching changes background assets, text, accents, control surfaces and local gradients only. Characters remain unlit, unfiltered and untinted. Preserve their source pixels, including existing painted shading. Intentional equipment/palette editing remains independent of theming.
- Optional character reflection is configured through code only. No user-facing toggle or slider. No added actor lighting, shadow, glow or color grading. All future mockups use the actual stored sprites and equipment, composed deterministically rather than redrawn by image generation.
- Information and character identity on the left; equipment modes, categories, items and actions in one right zone on desktop. Use one expandable bottom equipment area on portrait phones. Keep the world and character prominent; maintain dependable local gradients behind text/controls.
- Purposeful labels: Characters, Create character, Customize character. Use actual character name and description rather than invented classes or slogans.
- Start at Characters: bundled demo plus saved characters, selected last-used character on return, direct Customize, New character and Import, with paging/search for larger libraries.
- Create character remains a separate complete form. Preserve linked Appearance/Prompt, traits, exact prompt, Help/API/Copy, Enhance/Undo, name, body/frame controls and size guide, camera, five direction presets, individual directions/mirroring, seed and cost. Creation includes idle/walk and saves before result review; no invented Imagine/Review/Animate wizard or extra Save step.
- One studio with **Preview / Top-down / Side-scroller** at top center. Character name switches characters. Wardrobe, Colours and Outfits remain available in each view. Preview includes clip selection/playback/facing and contextual detailed inspection. Live views hide manual playback/facing and move authoring. No duplicate Customize/Play buttons in the studio.
- Selection and Preview share a retained background by default, with configurable per-screen alternatives. Live views need continuing surfaces and their own camera-appropriate backgrounds. No Grid/Bounds/Proof controls, required props, combat, platforms or jumping are introduced.

## Accepted correction: movement and animation availability are separate

**Movement continues when animation coverage is missing.** An unavailable sprite clip must not freeze the actor's world position. Use available animation/rest artwork instead. The previous lead recommendation to block movement was rejected because it treated an immersive character trial like a strict coverage validator.

### Direction mapping

The user's examples define normal supported behavior:

| Available animated facings | Intended display |
| --- | --- |
| East and west | NE/E/SE display east; NW/W/SW display west. Pure north/south retains the last displayed east/west facing while movement continues vertically. |
| North, south, east, west | Map movement onto the available cardinal facings, including diagonals. No need for diagonal artwork to move diagonally. |
| Eight facings | Use the matching facing when available. If NW is unavailable, west or another suitable available neighboring facing may substitute. |

These are direction quantization rules, not automatic mirroring or a new camera projection. Deliberately reduced direction sets are valid designs and should not generate warning toasts. A fixed side-facing sprite moving vertically is an intentional representation of that limited artwork, not proof of a newly generated north view.

Lead recommendations within this direction:

- Use nearest available facing with a stable tie-break: keep the previous eligible facing when possible; otherwise use a documented deterministic default. For a fresh east/west character, prefer a saved eligible facing, then east if available, then west.
- Start with normalized nearest-direction selection, remembered ties and the joystick dead zone. No extra angular smoothing/delay is required; consider a small switch margin only if real prototype input demonstrates a problem.
- Four-direction diagonal ties are valid either way; consistency matters more than claiming one universal mapping. Pure vertical motion for a two-direction set explicitly uses remembered facing as requested.
- Use only actual artwork or mirroring already authorized by the rig. Direction fallback does not repair incompatible camera pitch.

### Clip and rest fallback

For the live views, resolve a renderable presentation while preserving continuous movement:

1. Requested locomotion clip, using its available facings and the mapping above. For unexpected gaps, avoid opposite-facing animated substitutions: prefer an available direction within 90 degrees of the intended facing.
2. Compatible idle animation, still allowing world movement, when the requested clip has no suitable available facing.
3. Stored character creation/rest image for an appropriate facing. New V3 output retains original rest views; use what the particular character actually contains.
4. A valid existing frame when that character lacks stored rest artwork as well. This is a last-resort display fallback; the world position still moves.

On stopping, use idle if available, otherwise stored rest artwork or a valid still frame. Preserve facing continuity rather than unexpectedly rotating the actor on release. Do not repeatedly warn whenever the actor stops.

This suitability check applies after intentional direction quantization: it never rejects a deliberately one/two-direction presentation. If no suitable animated/rest presentation exists, use a closest valid still image as the final rescue. The detailed resolver defines finite termination, missing metadata and unavailable-body handling.

Resolve body clip, facing, timeline and frame **before** drawing any equipment. All visible equipment must use that same resolved state. Never animate Walk equipment over an Idle body, independently offset frame clocks or retain a frozen helmet pose over a cycling body.

Loading, corrupt data or no renderable body at all is a separate failure state; do not disguise it as a successful fallback. Likewise, a presentation fallback does not imply that an unimplemented action, attack or jump happened. The initial live world has locomotion, not new combat/game rules.

### Equipment without matching coverage

Accepted: temporarily hide equipment that cannot match the resolved clip/direction; **keep it equipped in the outfit model**, and restore it automatically when compatible. Do not block movement, automatically unequip it, spend credits, or select an unrelated item pose.

Lead refinement: if the required sequence is incomplete, hide the affected item for that clip/direction rather than flashing it on/off for individual missing frames. Legitimately transparent stored frames must not be treated as missing data. Preserve intentional garment hiding/tucking rules separately from coverage warnings.

Mark affected equipment and keep the reason reachable after a toast fades. Aggregate multiple missing items. Example: **2 items hidden — no Walk / north frames**. Recovery uses the existing explicit authoring/repair flow and its costs; no automatic generation.

### Toast feedback

Use a compact screen-anchored error toast for genuine unexpected coverage issues in a reserved area clear of the character, joystick and equipment actions. An overhead icon is not required. Do not infer intended coverage from whichever clip frames happen to be present; compare against declared rig directions first.

- No warning for normal two/four-direction quantization.
- For a genuine missing clip: **Walk unavailable — showing Idle** or **Walk unavailable — showing a still pose**.
- For unexpected holes within the intended coverage: **Northwest Walk unavailable — showing west**. If the limited direction set is intentional, suppress this message.
- For equipment: the grouped hidden-item message above, with persistent affected-item details.
- Do not emit per-frame, per-stride or per-key-repeat messages. Deduplicate by character, requested/resolved clip and relevant missing coverage. Group closely related changes; ordinary direction changes must not produce a stream of notices. A new character or changed coverage can reset the relevant explanation.
- No focus stealing, sound or modal. Do not announce a recovery toast whenever a valid direction resumes. Transient notices have an untimed equivalent in contextual details.

Fallbacks belong to the **live experience**. Preview, quality notes and export must continue reporting actual stored coverage; do not silently synthesize export frames or claim an animation exists because a fallback looked usable. Existing Preview's own transparency/coverage behavior should remain explicit.

## Prompt disclosure replaces disappearance

Accepted: retain a one-line description that expands to show the full prompt on desktop hover or mobile touch. The earlier timed fade-away proposal is superseded.

Lead recommendation: start collapsed, rather than automatically collapsing while someone is reading. Use a subtle visible disclosure cue. Also support click/tap and keyboard opening, pinning and dismissal; hover must not be the only path.

Expand into an anchored readable surface. Long prompts get a bounded scrollable region, selectable/copyable text and deliberate dismissal. Do not push the actor or right-side equipment around. Keep expanded hover content open while the pointer is over either trigger or content; allow Escape to close. On mobile, tapping the line opens it, and close/outside dismissal consumes that touch instead of starting locomotion. Do not run movement keys while typing/selecting text in a focused form.

The actual creation prompt, validation, costs and warnings remain stable form content, not timed caption behavior. [W3C hover/focus guidance](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html) supports dismissible, hoverable and persistent revealed information; the chosen presentation is a PixelDoll design recommendation.

## Dynamic touch joystick

Accepted: a minimal joystick appears where a touch begins in the world, outside UI controls. Dragging controls movement; there is no permanent directional pad. This applies only to the live Top-down and Side-scroller views, not Characters, Create or Preview.

Lead recommendations for predictable interaction:

- Show the stick at the eligible initial touch. A small drag threshold prevents taps or a resting finger from moving. Releasing or returning to the center dead zone stops movement; release hides the stick.
- Keep the input origin at the contact point. Cap knob travel and avoid requiring a large drag near screen edges. Clip/simplify decoration if necessary rather than silently shifting the control origin.
- Top-down uses the two-dimensional drag vector; diagonal speed is normalized. Side-scroller uses horizontal drag only; vertical input does not imply jumping or elevation.
- The first world touch owns movement until release/cancellation. Extra world touches do not steal or recenter it. A gesture starting on equipment, the prompt, menus or their interactive padding remains a UI gesture, even if dragged out into the world.
- A movement finger crossing over controls does not activate those controls on release. A second finger may operate equipment while moving. Ordinary outfit changes preserve movement; a blocking form/dialog cancels it.
- Clear input on release, pointer cancellation/lost capture, window blur, page hiding, modal opening, character/view change and orientation changes. Require fresh input afterward; no stuck movement.
- Preserve normal scrolling in equipment and prompt surfaces. Do not disable touch scrolling/zoom for the whole document merely to capture the world gesture. Respect OS safe areas and gestures.
- Keep the compact mobile equipment state large enough for actual item use while leaving useful world touch space. An expanded sheet may temporarily prioritize equipment; a joystick cannot compensate for a world reduced to an unusable sliver.
- Retain WASD/arrows, focus handling and Escape/stop behavior. One brief first-use hint can explain **Drag in the world to move**; no permanent instruction banner. A discrete non-drag touch alternative remains an accessibility consideration for the prototype, not a silently added default button bank.

[W3C Pointer Events](https://www.w3.org/TR/pointerevents3/) provides pointer capture/cancellation and scoped touch-action mechanisms. These support the interaction rules, but do not prescribe the joystick visual or thresholds. Keyboard support alone does not establish an equivalent non-drag touch interaction; see [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

## Evidence, history and next work

- [Workflow verification](current-workflow-review.md): current creator, storage, demo and coverage evidence.
- [Theme research](theme-research.md) and [palette studies](palette-studies/README.md): Bronze selected; actual demo pixels were verified unchanged in all six studies. Images remain local under the media-ignore policy.
- [Earlier decisions](decisions-2026-10-23.md), [interaction research](interaction-edge-cases.md) and [world feasibility](world-feasibility.md) preserve how the design evolved. Their conflicting recommendations are superseded by this record.
- Two GPT-6.1 Sol / High researchers challenged the new fallback/disclosure and touch policies. The lead accepted continuous fallback movement, rejected warnings for intentional direction reduction, retained explicit equipment coverage feedback and clarified gesture ownership/cancellation.

No remaining visual-direction blocker was identified. Interaction tuning means checking concrete defaults in the prototype: finger travel before movement starts, joystick travel/speed, immediate stopping, camera-follow comfort, readable toast duration and the space needed for expanded prompts. These are not additional product features or unresolved decisions the user must make before mockups. Fallback correctness, coverage notifications and equipment synchronization are specified in the resolver and must be verified when implemented. No new paid generations or application implementation are required to settle the mockup direction.

Full desktop/mobile image mockups are now available in the [round-five image index](../round-5-mockups/image-index.md): all five screens in both Bronze appearances, exact demo sprites, complete mobile creator scroll positions and supplemental disclosure/first-visit states. Documentation and rendering source are committed; PNGs remain local under repository policy. After image review, an isolated visual proof can test navigation, continuous movement/camera, the dynamic joystick, fallback cases, equipment changes and code-configured reflection. This remains research/design work and does not implement those behaviors.
