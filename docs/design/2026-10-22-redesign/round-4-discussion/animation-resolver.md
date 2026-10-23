# Dynamic movement animation resolver

2026-10-23. Design specification authorized by the user's request to choose a dynamic velocity/direction-based approach. No runtime implementation or gameplay tests are claimed. This refines [current-design.md](current-design.md); all visual, prompt and joystick decisions remain unchanged.

## Recommendation and established patterns

Use a small **motion state machine plus a discrete direction/clip resolver**. Position and velocity belong to simulation; available sprites determine presentation. An Idle sprite may represent a moving actor without changing the simulation state to stopped. No generic state-machine dependency, engine integration or animation graph editor is required.

Godot documents nearest-point selection for frame-based sprites in `BLEND_MODE_DISCRETE`, with playback position retained in `BLEND_MODE_DISCRETE_CARRY`. Its AnimationTree also supports state machines. Unity's directional blend trees use velocity parameters to choose directional motion. These establish the general pattern, not PixelDoll's missing-data policy. PixelDoll selects one frame-aligned sprite presentation: no crossfade between character images, sprite rotation or shader blending.

- [Godot discrete direction selection and carry](https://docs.godotengine.org/en/stable/classes/class_animationnodeblendspace2d.html)
- [Godot AnimationTree/state machines](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html)
- [Unity directional blend trees](https://docs.unity3d.com/6000.0/Documentation/Manual/BlendTree-2DBlending.html)

## Inputs and truth about availability

Keep three concepts separate:

1. **D: intended facings**, from `manifest.rig.directions`. These define whether a character is intentionally one-, two-, four-, eight-directional, or another sparse subset of the supported compass directions.
2. **A(c): playable body facings for clip c**, a subset of D, based on complete valid playlist coverage and available image resources. Authorized `mirrorOf` resolution counts when its source is valid. Do not invent additional mirrors.
3. **R: stored resting views**, from `rig.rest`, which may include original views deliberately excluded from D. Their presence must not expand the character's intended animated direction set or cause missing-animation notices for those unused directions.

Use existing rig metadata and finite compass vectors. The algorithm works over whatever subset is present, without hardcoded two/four/eight branches. The current format has named compass directions; this does not promise arbitrary new direction counts unsupported by that format.

Coverage must validate each referenced playback cell and resource, not merely whether a sheet contains one nonempty frame. Current `hasCells`/`moveDirs` helpers use presence-style checks and cannot alone certify complete playback. Explicit `null` layer cells are authored transparency; missing entries, out-of-range referenced cells and absent image blobs are different. Honor explicit item `coverage` and established legacy/mirror handling. A transparent foreground/background layer is not automatically a missing item. A body sequence with no visible representation at all cannot furnish a useful fallback actor.

Loading is distinct from absent coverage: retain a valid existing presentation while resources load, and do not emit missing-animation errors for a load that is still pending. Availability should be rebuilt when assets/rig data change, not by rescanning image pixels every display frame.

## 1. Determine motion state from velocity

The initial states are **Stopped** and **Moving**. Actual movement velocity, after input processing, determines the state. Side view projects movement onto the horizontal ground axis; top-down retains both ground axes. Convert velocity into the compass coordinate convention once. Camera-follow velocity is not character velocity.

- Nonzero finite velocity after the input dead zone: Moving, requested clip role Walk.
- Zero velocity: Stopped, requested role Idle; retain the last displayed facing if possible, otherwise saved/default facing.
- Opposite keys cancel to zero. Diagonal movement is normalized so keyboard diagonals do not run faster. Do not normalize a zero vector.
- Clear input/state on the cancellation events already documented for touch/keyboard. Invalid/nonfinite velocity is an input error, not a direction to feed into angle arithmetic.

Use explicit known clip-role mapping (`walk`, `idle` in the current flow), not name guessing that might loop an arbitrary attack as locomotion. Future actions require their own semantics; no actions, run state or jump state are added now.

## 2. Find the intended direction mathematically

Represent each direction by a **unit** vector b(d). Use x east/right and y north/up here; the renderer may convert its downward-positive screen coordinates separately. Diagonals must be normalized too.

For moving velocity v:

```text
u = v / length(v)
intended = argmax over d in D of dot(u, b(d))
```

The maximum dot product is the smallest angular difference. With all direction vectors normalized, this is also the nearest point by Euclidean distance on the unit circle. Speed does not bias which facing wins.

Tie policy: among equally best candidates, prefer the previous displayed facing; if none, the previous intended facing; then a saved/default eligible facing; then a stable compass order (south, east, north, west, southeast, northeast, southwest, northwest). Compare floating-point equality with a tiny numerical tolerance only. Do not retain a previous direction that is clearly worse.

For D={E,W}, pure north/south gives equal dot products, so it retains E/W naturally. NE and SE select E; NW and SW select W. A new E/W actor without history defaults to E. Four-direction diagonal ties use the same policy. The same rule works for one direction or an irregular sparse set.

Start with this standard nearest-direction rule, remembered ties and the input dead zone. A separate angular delay or smoothing feature is **not required**. If the real touch proof shows noisy switching near boundaries, a small switch margin may be evaluated then; do not add it speculatively or expose a sensitivity control now.

If D is empty or contains invalid direction metadata, do not evaluate an empty argmax or silently invent an intended set. Report the metadata issue and use a valid rest/still rescue if one exists. Mirror resolution must detect cycles and missing source directions; invalid references are unavailable data, never unbounded recursion.

## 3. Resolve the requested clip and available directions

First calculate intended against D, **not** against A(c). Otherwise a missing expected direction would vanish from the diagnostic model and appear intentional.

If intended is playable for the requested clip, use it. Otherwise rank available facings by the same dot-product distance from u, retaining eligible previous display facing on ties. At rest use the retained facing vector instead of normalizing zero velocity.

### Reverse-facing gait exception

Blindly selecting any available Walk can make an eight-direction actor walk south using a north-facing walking cycle even when a south Idle exists. The lead recommends a geometric suitability rule for **unexpected missing-clip coverage**:

```text
eligible substitute d when dot(b(d), b(intended)) >= 0
```

This permits neighboring or perpendicular substitutions, but not opposite-facing animated gait. It is a 90-degree geometric boundary, not an adjustable UX setting. Apply it **after** intentional direction quantization: a deliberately north-only character still normally uses north for every movement direction, and an E/W-only actor still uses its remembered side facing for vertical travel.

Choose the nearest eligible candidate, then move down this finite preference chain:

| Motion state | Presentation preference |
| --- | --- |
| Moving | Walk in intended/eligible neighboring direction → Idle in intended/eligible neighboring direction → stored rest view in intended/eligible declared direction → closest valid still frame |
| Stopped | Idle in retained/eligible neighboring direction → stored rest view in retained/eligible declared direction → closest valid still frame |

Do not loop Walk while stopped just because Idle is absent. When choosing an animated fallback, its playback duration/cadence remains its own authored value; moving with Idle does not turn it into an invented walking animation.

For the final still-frame rescue, prefer valid artwork within D, including a currently usable frame, then any valid stored original/rest or body frame if the configured set has no usable representation. Prefer nearest direction; use stable ties. This rescue never expands D, invents new animation or changes the export. If only reverse-facing artwork exists, a still display can be used while movement continues, with truthful fallback feedback; an algorithm cannot reconstruct unseen character art. If no valid body image exists anywhere, return an explicit unavailable/loading/error presentation rather than cycling forever through fallback rules.

An unexpectedly unavailable requested clip or intended direction still counts as a coverage issue even if a usable substitute is found. Intentional quantization itself does not.

## 4. Keep one resolved presentation and clock

Return a concrete resolved record: requested state/clip, intended direction, rendered clip-or-rest source, rendered direction, playlist position/frame, and diagnostic reason. Keep requested state separate from this record.

- Use authored frame durations and elapsed time. Changing movement angle must not restart the walk cycle every update.
- A facing change within the same clip carries its playback phase. If compatible imported direction timelines differ in duration, map normalized phase rather than indexing beyond their frames.
- A genuine clip/state change uses a deterministic transition, initially beginning the new clip once; repeated resolver evaluations of the same result do not restart it. Stop retains facing and chooses the appropriate idle/rest presentation.
- Base and equipment use the same resolved clip, direction and playlist frame. The compositor handles existing layer pivots, z-order, hiding, tucking and authorized mirrors. A stored rest view is a distinct source; only validated equipment aligned to that source can accompany it. No Walk frame is assumed to align to rest merely because it is frame zero.
- Gear changes do not change which body animation is selected. Hide only incompatible equipment for the resolved sequence, keep it equipped, and restore it on compatible sequences. Incomplete sequence coverage hides the item for that sequence rather than flickering individual missing frames; legitimate transparent frames remain valid.
- No per-item fallback animation clocks, no world-position freeze, no silent paid repair and no synthesized export frames.

## 5. Coverage notifications

The user confirmed error toasts are for **unexpected missing animation/direction data**, not normal reduced-direction movement. Use concise issue wording without alarming full-screen treatment:

- D has eight directions; selected NW Walk is missing: **Northwest Walk missing — showing west**.
- Walk is wholly unavailable: **Walk missing — showing Idle** (or **showing a still pose**).
- Required equipment sequence is missing: **2 items hidden — missing Walk / north frames**.
- Direction quantization inside an intentional E/W or cardinal set: no error.

Deduplicate notices by character, coverage revision, requested clip, intended missing direction and affected item set. Do not include a changing fallback facing/frame in the identity: that would create spam while circling. If an entire clip is absent, aggregate at clip level rather than generating eight direction errors. Coalesce related item issues and retain untimed details in the equipment/character information. Repeated normal stops do not regenerate an Idle-missing toast; report a real missing Idle once as appropriate. Loading is not a missing-asset toast. A changed character or repaired/newly changed coverage can produce a new relevant notice.

## Scenario checks for the later implementation

| Case | Required outcome |
| --- | --- |
| E/W only, moving NE then north then south | E throughout; movement follows velocity; no toast |
| E/W only, last displayed W, moving north | W retained; no toast |
| Four directions, exact NE diagonal | E or N via stable tie rule; no missing-diagonal toast |
| Eight directions, NW Walk missing, W/N Walk valid | Nearest eligible W/N; stable tie; one NW coverage notice |
| Eight directions, moving south, only north Walk, south Idle valid | Continue south with south Idle; do not loop backward-facing Walk |
| Deliberately north-only character moving south | Normal north representation; no missing-south toast |
| No Walk, Idle valid | Move continuously with Idle; one clip-level notice |
| No Walk/Idle, original rest available | Move with a direction-appropriate rest image |
| Legacy character with no rest images | Valid still frame rescue; no demand for new paid generation |
| Declared direction set has no usable frames, retained original exists outside it | Explicit still rescue; do not redefine D or claim coverage exists |
| Idle missing when releasing movement | Rest/still display; no repeated stop notification |
| Missing/short body playlist or missing image blob | Exclude unsafe sequence; use resolver chain; distinguish pending loading |
| Authored null equipment cells | Legitimate transparency, not a missing-frame error |
| Item missing required resolved sequence | Hide item, keep equipped, restore on compatible sequence |
| Walk falls back to Idle with only Walk equipment available | Idle body; incompatible equipment hidden rather than misaligned |
| Zero/invalid velocity, opposite keys, release/blur/modal | No NaN normalization or stuck movement |
| Different clip frame counts/durations | Valid phase/frame resolution; body/equipment remain synchronized |
| No renderable body data | Explicit load/error state; no infinite fallback or invented sprite |

These are acceptance scenarios, not tests already run. Runtime behavior remains deferred to the isolated proof and eventual implementation.

## What interaction tuning means

It means checking a few concrete presentation/input values in the later prototype: how far a finger drags before movement starts; how much thumb travel reaches the chosen movement speed; whether movement stops cleanly on release; whether the camera follows comfortably; how long a non-repeating toast remains readable; and whether the expanded prompt fits a small screen. These are code defaults and usability checks, not additional features, settings screens or decisions the user must make before mockups.

The standard motion state, normalized direction selection and tie memory are sufficient to specify the design now. Optional angular hysteresis is reserved for evidence of a real problem, not an assumed requirement.

## Source review notes

The current rig already declares direction/mirror metadata and optional `rest` originals. Current creation retains unused original rest views, so they cannot define intended animated coverage. `Layer.cells` explicitly uses null for transparency, and `Item.coverage` supports explicit covered cells; resource/presence checks must respect that distinction. A GPT-6.1 Sol / High researcher reviewed these contracts and challenged the opposite-facing gait case. The state/resolver above is a design recommendation informed by that code review and the cited primary engine documentation; it is not a claim that an engine supplies PixelDoll's fallback policy automatically.
