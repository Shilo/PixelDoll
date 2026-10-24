# Round three: recovering the immersive world

Date: 2026-10-22. Visual critique and image-generation guidance only. No production implementation or generated imagery is included in this note.

## Evidence and controlling brief

Inspected at original size: first-round `mockups/camp-desktop-dress.png`, `mockups/camp-desktop-select.png`, `mockups/quiet-desktop-dress.png`, `mockups/board-camp.png`; second-round `round-2/mockups/yard-desktop-dress.png`. Read the first-round README and design direction, plus the second-round README.

The current brief supersedes earlier decisions against a walking scene and against camera following. It also supersedes the recommendation for Calibration Yard as the everyday editor. The requested result is an immersive game-like virtual testing ground, with beautiful HD world art, subtle floating/in-world controls, and the same interface for customization and gameplay. Movement uses WASD/arrows and a following camera. Top-down and side views are switchable. There is no onscreen movement pad, action-button bank, grid toggle, bounds toggle, proof button, or requirement for props.

Desktop composition is explicit: character information on the left; **all equipment categories, equipment mode tabs, and the item picker together in one right-hand zone**. Centered view controls are acceptable. Clicking the character name switches cast. On portrait phones, the right equipment zone becomes one bottom zone.

## What the first round achieved

Moonlit Camp makes the world the entire screen. Near tree silhouettes, a mid-ground clearing, water, distant mountains, clouds, and moon form a continuous spatial hierarchy. The quiet patch under the character feels like reachable ground within a larger place. It is not a bordered viewport embedded in an application. The world extends behind the text and controls, so the eye reads one scene.

The dress screen's strongest elements are its prominent actor, restrained upper-left identity, and isolated contextual item panel. The selected character is approximately 295 pixels tall in the 900-pixel image, including the helmet; there is enough face and equipment detail to care about the outfit. Bright character colors and the red cape pull attention forward against the cooler scene. The cast-selection image preserves that focus while placing companions on the same ground. Its uncluttered space conveys a place where characters belong.

Quiet Stage preserves the actor and simple hierarchy but loses the sense of a world. Its elliptical floor line is a display plinth. It is a useful reference for low-contrast lighting and silhouette legibility, not the requested destination for round three.

The Camp board demonstrates that immersive backgrounds can survive desktop and phone framing. Its phone dress layout keeps the actor above a lower equipment area. The problem to solve is equipment organization and control weight, not the existence of the scene.

First-round weaknesses must not be copied literally: categories on the left and equipment mode tabs at the bottom scatter one editing task across three edges. The current brief brings these into the right zone. Its large solid item panel, boxed bottom mode bar, duplicate new-item entry points, and Inspect action are also heavier than the desired floating game interface.

## Why Calibration Yard lost the effect

| Visible change | Result | Round-three correction |
| --- | --- | --- |
| A solid header occupies the top 90 pixels | The world starts below application chrome rather than filling the screen | Extend world art to every edge; float a few small utility actions over it |
| The name becomes a rectangular identity card | The character reads as a record in a tool | Use a quiet name plus chevron on the left, directly over the world |
| A separate boxed category rail remains on the left | Equipment decisions occupy both sides of the actor | Move the complete category set into the same right-hand surface as modes and item choices |
| A giant outlined rectangle surrounds the ground under the actor | The character becomes a specimen inside a bounded preview canvas | Use open continuous ground extending beyond the camera; omit the visible arena rectangle |
| Repeating blocks and perimeter ledges form a fenced stage | Sparse scenery still feels like an obstacle-course editor | Let ground, atmosphere, horizon, and light establish the world; props are optional |
| Grid/Borders/Proof controls sit at the upper center | Debugging becomes the screen's dominant purpose | No such buttons; any grid is part of the world material |
| A bottom mode bar and separate playback bar consume lower space | The screen resembles a workstation with multiple toolbars | Put equipment modes in the right zone; reserve a very small central strip for view and customizer playback |
| Thick panel borders, square wells, and corner caption frame everything | UI furniture outweighs the intended place | Prefer light text, thin selection marks, and only localized low-opacity backing |
| The hero drops to about 200 pixels tall | It becomes harder to read the face and equipment while the editing UI stays large | Restore a prominent actor and open visual space; do not solve world scale by shrinking the subject |
| Nearly flat green-gray blocks replace layered depth | Quietness becomes visual emptiness | Build depth through light falloff, atmospheric distance, a continuous floor, and restrained material detail |

The difference is not simply forest versus grid, nor pixel art versus HD. Yard reorganizes the whole screen into labeled boxes. Repainting those boxes with better art would leave the central problem intact. Camp's world-first hierarchy should survive even in an abstract simulation chamber.

## Proposed shared shell

The scene is the full viewport in both states. A readable pixel character stands on an open HD ground plane with a small contact shadow. The floor is calm near the actor and gains detail gently toward the edges and distance. A subtle grid may be etched into the material, catch light, or fade into fog; it must not look like an editor overlay. Avoid strong lines crossing the face or equipment silhouette. HD should mean coherent materials, lighting, and space, not photographic detail everywhere.

On desktop, upper-left information is a compact floating cluster: **Rowan ▾**, a short secondary identity line, and an understated current-state cue if needed. Clicking the name opens cast selection in the same world. There is no permanent character-list panel or separate navigation button needed for the central image.

The right zone contains the whole equipment task: Wardrobe/Colors/Outfits mode tabs, all seven named categories (Head, Hair, Body, Legs, Feet, Back, Hands), the selected category's choices, and its relevant palette. The categories can be a compact labeled two-row arrangement inside this zone. One modest new-item action is sufficient. Keep the zone visually integrated: one organizing surface, not a stack of separately bordered dashboard cards. Selected item and category need a delicate bright edge, tick, or underline. The right zone should feel light enough that the world remains visible around and through its margins, with localized backing wherever text needs contrast.

Composition guidance for a wide frame: keep roughly the right quarter for equipment, a small upper-left identity cluster, and the majority of the frame as uninterrupted world. Center the hero within the remaining world, not geometrically under the equipment panel. These are visual starting points, not responsive CSS specifications. The actor should remain large enough to recognize face, hands, and gear at normal viewing size.

Place the small **Top-down / Side** view switch near the lower center, clear of the sprite. A subtle Customize/Play state affordance may sit alongside it. It must not read as a pair of separate apps or a large destination button. Global export/settings can float in a quiet upper corner, separated from the equipment decision hierarchy.

The float-over-world aesthetic is not permission for illegible thin text. Essential labels still need contrast and credible touch sizes. Avoid either extreme: a full opaque sidebar or bare white text over busy illuminated geometry. Soft local scrims and a calm scene region offer a middle ground.

## State differences without changing interface

| Element | Customization | Gameplay |
| --- | --- | --- |
| World and visual shell | Full viewport simulation ground | The same simulation ground and shell |
| Character identity | Clickable name on left | Same name and position |
| Equipment zone | All categories, modes, choices; immediately dresses actor | Same zone remains usable and immediately dresses moving actor |
| View selection | Top-down / Side | Same control and position |
| Actor/camera | Comfortable inspection framing; selected pose may play in place | Smooth movement with WASD/arrows; following camera keeps actor in the usable world area |
| Playback and frame inspection | Small contextual playback/move selector and frame controls if required | Hidden |
| Add moves / animation authoring | Available contextually within customization | Hidden, including the Moves tab if it would expose animation authoring |
| Movement guidance | Optional short hint in a relevant first-use state | A small transient “WASD or arrows” hint is sufficient; no movement pad or action bank |

Do not move identity and equipment to different screen edges when entering gameplay. Do not introduce a second opaque game HUD, alternate Test World header, miniature actor, or full-width bottom bar. Gameplay is a state change inside the same scene. Viewport controls stay anchored while world geometry moves with the camera. “In-world” appearance does not require usable controls to travel out of reach with the character.

For image studies, show paired customization and gameplay frames with the same camera composition, lighting, name, and right zone. A walking pose plus shifted floor features and absent playback strip communicates the state without speed lines or invented game mechanics. A still image cannot validate smoothness or camera-follow behavior; label those as intended behaviors in the accompanying notes rather than pretending the image proves them.

## Mobile adaptation

Keep the upper portion as uninterrupted world with a prominent actor. Place the clickable name at the upper-left and small global actions at the upper-right. Move the entire equipment zone to one bottom tray: modes, the complete category selector, then item choices. A compact expanded tray may show all seven named categories over two rows. Do not leave categories floating halfway up one side while choices live below.

The small view switch can float just above the tray. Customization adds compact playback controls there; gameplay removes them while leaving equipment available. The tray should have a clear compact state so gameplay can show more world without creating a different shell. A phone gameplay image must not invent a directional pad or action buttons. The current keyboard movement brief does not establish touch locomotion, so the image should avoid claiming one.

## Image-generation prompt guidance

Start with the visual hierarchy, before describing atmospheric detail:

> A finished fullscreen game interface, one continuous immersive virtual world filling every edge of the image. An original beautiful HD simulation training ground with quiet open ground, coherent atmospheric depth, restrained light, and subtle grid lines built into the physical floor material. A charming crisp pixel-art adventurer is the unmistakable subject, standing large and legible on the ground, with a small grounded shadow. Preserve the spacious world-first composition and calm floating text of the Moonlit Camp reference. At upper left, only the character identity “Rowan” with a tiny dropdown chevron and one short subtitle. On the right, one lightweight coherent equipment zone contains every named equipment category, the Wardrobe/Colors/Outfits tabs, item thumbnails, and local color swatches together. Small unobtrusive Top-down/Side controls near bottom center. Elegant game UI with legible type, delicate selection cues, minimal localized backing, abundant visible world. The image should look like a place the character can walk through immediately.

For gameplay append:

> The exact same interface remains visible while the character walks through the same world. Retain the same left identity and right equipment zone. Hide all animation playback, frame controls, and add-move controls. No onscreen locomotion controls. Convey movement through the character's walk pose and composition alone.

Useful exclusions to state directly: no browser frame, no title banner, no marketing heading, no dashboard, no bordered preview rectangle, no specimen platform, no debugging toolbar, no Grid/Bounds/Proof buttons, no separate left equipment rail, no equipment tabs detached along the bottom, no virtual joystick, no arrows drawn on the ground, no action-button bank, no mandatory crates or training props. Do not include generic editor chrome even if the image generator associates “holodeck” with a control console.

Keep concept variations about the world rather than changing the interface each time. A holodeck can use a dark luminous floor and distant volumetric grid; a Simulacrum-like space can use pale mineral ground, impossible scale, and a softly disappearing horizon. Both should retain the shared visual shell. Avoid copying a named game's architecture, insignia, equipment artwork, or exact HUD.

## Visual approval rubric

Reject a proposed image if any mandatory row fails. This is review judgment, not measured user testing.

| Test | Pass |
| --- | --- |
| World first, mandatory | At a glance this is a playable place occupying the full screen; no enclosing application canvas or solid header cuts it off |
| Unified equipment, mandatory | Every equipment category, equipment mode tab, and item choice belongs to the right zone on desktop or bottom zone on portrait phone |
| Shared shell, mandatory | Paired customization/gameplay frames preserve identity, equipment, view switch, and world composition; gameplay removes animation authoring/playback |
| Forbidden UI absent, mandatory | No movement pad, move-action buttons, Grid/Bounds/Proof controls, debugging caption, or extra editor panel |
| Character priority | Face, hands, current gear, and silhouette remain readable; controls and environment do not become the main subject |
| Ground reads as world | Floor continues beyond the view and supports camera travel; grid is a restrained material feature rather than a toggleable overlay |
| Floating controls feel intentional | Text and selections feel integrated and light, while all essential labels remain readable |
| Cast switching reads directly | Character name has a small credible dropdown affordance; no permanent roster is required |
| HD coherence | Lighting, depth, material scale, and shadow agree; a pixel character does not look like an unrelated sticker |
| Mobile keeps the premise | Large visible actor, cohesive bottom equipment zone, no crowded miniature desktop HUD |

The decisive question is whether the image still feels immersive when the equipment zone is open. A beautiful background behind a heavy editor does not satisfy this brief.

## Review of the first three ImageGen studies

Inspected `images/01-quiet-meridian-customize.png`, `images/02-porcelain-dawn-customize.png`, and `images/03-obsidian-holodeck-customize.png` at their delivered raster sizes. These are static image studies; no runtime behavior is inferred.

All three successfully recover the requested world-first composition. The world reaches every edge, the name floats on the left with a clear dropdown, equipment tabs/category access/item choices occupy one coherent right zone, and the character is prominent. The controls have enough backing to read without becoming an opaque sidebar. None repeats Yard's bounding rectangle, solid application header, debugging toolbar, movement pad, or prop obstacle course. This is a successful direction that needs a few meaningful corrections before expanding to other states.

| Study | Judgment | Meaningful refinement |
| --- | --- | --- |
| **03 Obsidian Holodeck** | **Strongest overall.** Calmest background above the hero, clearest intentional simulation space, dark default, coherent restrained gold accents. The thin dome geometry supplies context without props. | Lower or dim the bright horizon behind the neck; reduce the busiest foreground floor texture slightly. Preserve the simple dark sky rather than adding clouds or architecture. |
| **01 Quiet Meridian** | Strong atmospheric blue alternative; closest to Camp's cooler emotional tone while remaining an open virtual ground. | The luminous cloud cavity sits directly above and behind the helmet. Quiet this local area and soften the very bright horizon so head and shoulders lead the image. Keep the larger cloud atmosphere at the perimeter. |
| **02 Porcelain Dawn** | Attractive light-world counterpart with a legible dark UI; strongest demonstration that the composition survives a light theme. | The sun, glowing cloud bank, and bright reflected column compete with the outfit. Lower their local contrast around the hero and equipment. Warm reflected light should not obscure the character's actual colors. |

### Correct before expanding the family

1. **Show the view switch.** Top-down/Side is missing in all three. Add a small labeled switch near the center controls. It is distinct from the current S/E/N/W facing buttons. No additional projection toolbar is needed.
2. **Resolve complete category visibility.** The current right zone shows Head, Hair, Body, and All parts. It consolidates access correctly, but does not visibly show Legs, Feet, Back, and Hands. To meet the explicit full-category visual contract, use a compact two-row seven-category selector within the same zone. Do not solve this by restoring a left rail. If All parts is intentionally retained as progressive disclosure, show its expanded state once so completeness is reviewable rather than assumed.
3. **Quiet the horizon at the hero.** Every study places a bright horizon through the head/neck region. Lowering it or softly reducing its luminance behind the silhouette improves the subject without changing the world. Avoid a conspicuous rectangular masking patch.

The large Customize/Play pair is clear and currently acceptable. If space becomes tight after adding the view switch, make that state selector a modest segmented control; preserve the labels rather than introducing ambiguous icons. Do not add another large bottom bar.

### Expansion guardrails

- **Gameplay:** preserve the identical right equipment zone, left name, and world art direction. Hide Idle, playback, direction/frame inspection, and animation-authoring access, including Moves. Retain Colors/Outfits and wardrobe access. Show a natural walking frame and the small Top-down/Side control. Do not replace the current editor controls with a joystick or action bank.
- **Cast selection:** the character-name dropdown is already the correct entry. Show a small floating cast surface or a few characters grounded in the same place. Avoid introducing a full roster sidebar or a new application header.
- **Creation:** keep the same world and restrained left/right organization; use a focused description form where the contextual right zone lives. Clearly identify an example body if one appears before generation. Avoid a large opaque modal that erases the scene.
- **Portrait phone:** move the entire right equipment zone into one cohesive bottom tray, including mode tabs and complete category access. Keep a substantial visible actor and floating name above. Do not shrink the desktop composition wholesale. The view switch remains just above or at the top edge of the tray; gameplay hides animation controls while keeping the tray usable.

Recommended next family: expand Obsidian Holodeck through desktop cast/creation/gameplay and portrait customization/gameplay, carrying Quiet Meridian as the blue alternative and Porcelain Dawn as a light-world counterpart. If the parent selects Quiet Meridian for emotional warmth, the same shell is already sound; the cloud/horizon correction is sufficient and does not justify starting over.

## Final family review

Inspected the final desktop customization (`03b`), top-down gameplay (`04`), side gameplay (`05`), portrait customization/gameplay (`08`/`09`), and desktop/portrait selection and creation (`06`/`07`/`10`/`11`). **Approved as a coherent image-only design family. No material brief violation requires another generation.**

The final customization adds the missing view selector and moves the strongest horizon light away from the face. Both desktop gameplay studies keep the same left identity and right equipment organization while removing playback and Moves. The portrait pair preserves the same identity and view selector, uses one cohesive lower equipment zone, and leaves the actor clearly visible above it. There are no movement pads, action-button banks, or debug controls. Selection keeps the cast grounded in the same world; creation retains the setting, labels its example body, and makes drawing-cost review the clear action.

The lead's final category decision is **Head/Hair/Body plus explicit All parts**, with access to all seven categories documented. This supersedes this note's earlier recommendation to display all seven category names simultaneously. The final composition satisfies equipment consolidation; it does not visually demonstrate the contents of the unopened All parts surface.

Remaining art limitations are minor: the illustrated sprite anatomy/equipment details vary slightly between generated poses; gameplay floor texture and glow are stronger than in customization; the side-play selected button has a fuller gold treatment than the other active Play controls. These do not undermine the layout or shared-state premise. They should not be mistaken for exact stored-frame output, verified palette fidelity, measured touch targets, or production UI behavior.

The walking poses and changed perspectives communicate intended gameplay states only. Smooth WASD/arrow movement, continuous camera following, instant equipment changes during movement, and actual cast/category interactions remain behaviors described by the design, not capabilities proven by still images.
