# Design decisions and palette-study scope

**Historical decision log.** The later [current design record](current-design.md) supersedes the open/recommended policies below: Bronze is selected, missing clips no longer block movement, missing equipment may temporarily hide, timed prompt fading is replaced by one-line disclosure, and a dynamic mobile joystick is accepted. Earlier proposals remain here to explain the corrections.

Recorded 2026-10-23 before preparing palette imagery. This is the current decision record; prior round files remain historical evidence.

## Accepted direction

The user accepted the preceding direction review except for the points explicitly clarified or left open below.

- Full-screen immersive Obsidian Holodeck; purposeful labels; character information left and all equipment controls right, adapting to one mobile bottom sheet.
- Direct Characters landing screen, demo plus saved characters, separate complete Create character form, and one customization studio with Preview / Top-down / Side-scroller tabs. No redundant Customize/Play buttons in the studio.
- Preserve the implemented creator workflow and all controls. Creation already includes idle/walk and saves before result review. Four-pixel size validation is implemented.
- Shared default Selection/Preview background with configurable per-screen alternatives and retained assets. Separate camera-appropriate live-view backgrounds/ground. No world Grid/Bounds/Proof controls, props or extra gameplay systems.
- Continuous held-input movement, authored animation timing, following camera and equipment changes in live views. Hide inapplicable manual playback/facing and move-authoring controls.
- Background gradients behind information and controls remain part of the visual design.

## Clarifications that supersede earlier wording

1. **Appearance swaps background art and UI colors**, including text, gradients, surfaces and selection accents. References to background light/material describe the appearance painted into that artwork, not runtime lighting on the actor.
2. **The character is unlit and unfiltered.** No theme tint, relighting, shader effect, bloom, added cast/contact shadow or grading on/around the actor. Existing shading painted into source sprites is preserved unchanged. Intentional equipment/palette edits remain the only source of character recoloring.
3. **Optional reflection is configured through code only.** No end-user reflection toggle, strength slider or appearance-menu option. Earlier contact-shadow and user-adjustable reflection suggestions are superseded. The palette studies leave reflection off to compare the unchanged source sprite plainly.
4. Future mockups must use **actual stored demo sprites**, not ImageGen interpretations of the character. Generate environment art separately; composite the real sprite with deterministic integer nearest-neighbor enlargement. Source sprite and outfit must be identical across theme options.
5. A palette means a small set of **environment/UI color roles**, never an outfit recoloring palette. Dark/light variants are coordinated background/UI pairs. Bronze, Frost and Sage are candidate design choices, not three extra settings required in the shipped app.

## Open interaction decisions

- Missing live-view animation: user proposes silent no-op, possibly an icon near the actor. Lead recommendation pending critique: reject fully silent failure; distinguish absent locomotion, idle, unsupported action and incomplete equipment coverage; give restrained contextual feedback without modal interruptions or per-frame repetition. No automatic paid repair or silently hidden equipment.
- Prompt subtitle: user proposes truncation and fading after a delay. Lead recommendation pending critique: stable one-line truncation with accessible Details is preferable to automatic disappearance. Any transient entrance text must remain recoverable, avoid layout shifts and not carry essential information.
- Touch locomotion remains unresolved. Keyboard movement cannot certify the mobile interaction. This is a later focused prototype decision, not a reason to invent a joystick in imagery.

## Authorized work now

Document decisions and concerns, then create **palette studies only**, showing Bronze, Frost and Sage with paired dark/light background/UI treatments and the same actual demo sprite. Use a small representative equipment/control sample to explain where colors apply. These are comparison images, not a new full-screen design round or interactive mockup.

Full desktop/mobile screen mockups follow palette/interaction discussion. The small isolated navigation/movement/reflection proof follows review of those images. No production implementation or paid PixelLab work is needed now.

## Lead recommendations after critique (still for discussion)

- Do not make failed input completely silent. For unavailable locomotion, keep position and the last valid complete pose; show one short neutral badge with specific text above/beside the actor, clear of equipment. Keep the reason reachable in contextual details after the cue fades. No red flashing, focus stealing, modal or repeated cue on held keys.
- Supported directions continue to work. Normal four-direction facing quantization is not itself missing coverage. Do not silently invent mirrors, change camera projection, slide a non-walking pose or make paid repair calls.
- Missing idle is a different case: use a stored resting pose or hold a valid frame on stop, without warning on every stop. The details truthfully say Idle is not added.
- Incomplete equipped-item coverage needs a separate explicit policy. The current Preview may omit missing layers and explain them. The lead recommends a stricter live-test default: block only the unsupported movement/action and hold the complete valid outfit, identify the affected item in the equipment zone, and keep supported movement available. This avoids disappearing equipment or an old frozen helmet over an animated body, but may restrict travel when gear is incomplete. This tradeoff remains proposed, not an implemented or accepted change.
- The optional description may be limited to one/two responsive lines and fade after about eight seconds on character selection. Eight seconds is a prototype starting point, not an established optimum. Keep Details permanently reachable with the full untimed text, pause fading while reading/focused, reserve the same layout space, and never fade creation prompts, costs, errors or coverage notices. Do not restart the caption on every mode/equipment change. A stable truncated line remains the simpler alternative.
- Recommend Bronze as the visual family; Frost is the strongest cooler alternative and Sage the softer alternative. The [three paired studies](palette-studies/README.md) use the actual identical sprite. Palette choice remains with the user.

Palette studies and source-pixel verification are complete. Full-screen mockups and the gameplay/reflection proof have not begun.

## History

- Round one established Moonlit Camp/Quiet Stage immersion.
- Round two's more tool-like treatment was rejected.
- Round three established the preferred Obsidian world and minimal composition, but used illustrative actors and an outdated workflow.
- Round four verified the current implementation, corrected the workflow and researched appearance/rendering constraints.
- This clarification locks exact source sprites, background/UI-only themes and code-only optional reflection before palette imagery.
