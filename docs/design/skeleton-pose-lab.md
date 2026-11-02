# Offline Motion Lab

Implemented October 28, 2026 on `codex/motion-lab`. The [implementation and qualification record](../research/2026-10-28-motion-lab-implementation.md) contains before/after findings, spending and outcomes. The original proposal is preserved in Git history. Its universal-fit and proposed lint guarantees were not established.

## Open the lab

From `app/`, run `npm ci`, then `npm run dev`. Open `/motion-lab.html`. All calibration, playback, editing, import and preview work without a token. The HTML entry and `dev-fixtures/motion-lab/` are development-only and are excluded from the production build. Studio defaults are not connected to experimental presets.

Agents use `npm run dev:agent` on localhost:5199 for authorized paid tests. The page shows Agent mode. Keyless automation sets `pixeldoll.agentKey=off` before loading. Credentials stay in the existing queue's memory; motion documents and evidence exports contain no token. See [token contract](../handoff/agent-dev-token-handling.md).

## What is implemented

- Three stored bodies: adult 64 px, chibi 64 px and adult 128 px, with their original directional drawings and joints. Direction metadata identifies mirrors. Each body has its own estimated camera elevation and side bearing; these are editable proxy calibrations.
- Six CC0 Quaternius source clips baked at 60 Hz: idle, walk, jog, standing overhead strike, chest hit and fall. The source GLB hash, source URL and CC0 license accompany the bake. No additional runtime package is required.
- Source and target 3D rig previews with orbit, requested joints over the native sprite, previous-pose onion skin and an approximate segmented paper puppet.
- Source-time selection and per-frame durations. The strike concentrates samples around the measured wrist-speed peak at 0.4 seconds. Body-part weights reduce the balance arm and squat while retaining the striking arm's motion. Front/back falls adapt the motion plane for silhouette readability.
- Reference-joint calibration, pose FK, two-bone wrist/ankle IK, joint coordinate/depth fields, keyboard nudging, Undo/Redo, and credential-free JSON save/import. Hip editing rotates both branches to retain the virtual pelvis midpoint. Head landmarks move as a group.
- Fixed target 3D bone lengths, finite-value and canvas checks, reach diagnostics, exact reference XY fit, and depth derived from the same target geometry as XY. Out-of-frame joints are reported, never silently clamped.
- Reviewed live candidates through an isolated instance of the existing queue. The original campaign used a 914-generation remainder. The targeted continuation separately caps reservations against the 194 generations left after 806 actual prior generations, raises reservations for higher known charges, and keeps the historical ledger. Identical candidates resume existing job IDs; unknown paid outcomes are retained without automatic resend.
- Raw-frame inspection and playback with authored timing. Persist review status, notes, excluded frames and a final local hold. Export a reviewed clip only after explicit candidate acceptance with notes and at least three selected frames. Export every raw result, request image, pose and job ID separately as evidence.

## Conversion and contact model

`app/src/lib/rig/motion.ts` is the shared pure converter. Coordinates are anatomical left, up, forward. Each directional drawing fits exactly in XY. Source-reference depth provides a documented latent-depth proxy, scaled to that drawing's leg length. Bone-direction changes transfer with stable 3D shortest swings and reconstruct at calibrated target lengths. Position, depth and draw order then project from the same target pose.

Contact weights come from a smooth fixed clip-ground estimate. A continuous pelvis reach envelope and analytic two-bone IK replace the old discrete lowest-ankle support choice. This addresses the reproduced discontinuity. It does not establish real sole contacts, eliminate skating, or infer the foot's hidden surface. Nominal movement speeds are provisional metadata and do not certify world-space foot planting.

The fall adds transparent padding without resampling native pixels: 24 px around 80 px cells and 48 px around 160 px cells. Front/back views rotate the motion basis, not the drawing's camera. A duplicated final target is a paid terminal buffer; its raw output is retained and excluded from default reviewed playback. The reviewed final hold repeats a selected image locally and costs nothing.

## Qualification limits

The puppet is a pose aid. It cannot predict generated art, hidden surfaces, anatomy quality or equipment alignment. PixelLab redraws the whole character and can change proportions and details even with correct joints. Eighteen joints omit spine articulation, toes, fingers, clothing and weapons. Reference calibration from a single drawing is underdetermined.

No claim of arbitrary sprite, body shape, size or professional quality follows from passing geometry tests. Qualify the actual body, view, size, action, timing and equipment. Keep rejected candidates and state remaining defects. A manual acceptance applies only to its candidate, not an entire preset family.

Copy/mirror/interpolation tools, arbitrary GLB upload, automated semantic naturalness scoring, mesh deformation and product-facing preset adoption are not implemented. They are not prerequisites to this six-motion qualification. Pixel repair remains a separate workflow. Do not describe these as delivered.

## Reproduce the evidence

From the repository root with Node 24.22.1:

```text
node spikes/api/mocap/bake-motion-lab.mts
node spikes/api/mocap/audit-corrected.mts
node spikes/api/mocap/compare-corrected.mts
node spikes/api/mocap/analyze-motion-lab.mts <evidence-export.json>
node spikes/api/animation-research-2026-10-27/serve.mjs spikes/api/out/motion-lab-2026-10-28 5270
```

`UAL1_GLB` may override the local GLB path. Baking also needs the three stored `out/c25` body exports; source fixtures are versioned, historical raw exports and generated evidence stay local under the repository's media policy. The static evidence viewer is read-only, binds loopback, has no token endpoint, and makes no PixelLab requests.

## Current timing and review details

The fall template now uses 13 event-focused source times, plus an excluded terminal buffer, reserving four generations conservatively. The live provider reported three per tested fall. Attack uses 12 event-focused times. Hurt intervals match source sampling and retain a final hold. A reviewer can change any generated frame duration and add a local final hold without rendering again. One-shot previews stop on their final included frame. Reviewed clips include source reference PNG/joints, requested joints per selected frame, native padded canvas/pivot, durations and loop metadata; this research JSON is not a Studio character ZIP.

Reference-joint diagrams are generated by `spikes/api/mocap/inspect-references.mts`. The shared diagnostic sheet helper lives in `spikes/api/animation-research-2026-10-27/preview.mts`; its default preserves the original research analyzer, with optional markers for new inspections. Equipment extraction and before/after cleanup are reproduced by `spikes/api/mocap/evaluate-motion-equipment.mts`.

## Follow-up controls and qualification

**Save body/view calibration** explicitly retains the camera and corrected reference joints for the exact reference PNG hash and converter revision. It survives reloads and switching bodies; return to the saved direction to restore it. Motion timing and pose edits remain in saved motion documents. Invalid/stale calibration reports an error and can be cleared without clearing the current document or generation ledger. Calibration identity follows body artwork, not a source clip.

The **KayKit control** selector loads six independently baked CC0 Free 1.1 motions using the same target fixtures and converter. They retain distinct source IDs and semantic action descriptions. Imported current-source clips keep priority when changing body/view. These controls have only offline geometry validation. They are not part of the 806-generation renderer campaign. License, hashes, synthetic face assumptions, native duration and the fall root-travel correction are recorded in [the follow-up](../research/2026-10-28-motion-followup.md).

Diagnostics now fit constant horizontal target-world speed to dense template ankle paths at source confidence >= 0.5, weighted by confidence and interval duration. Residual RMS measures how poorly a constant speed fits those requested paths. Sparse manual pose edits are excluded. The reported speed is not an engine setting or measured sole contact. The loop metric measures the last-to-first rendered-pose interval, not exact source cycle closure. Candidate previews also report actual raw-image border/connectivity observations without erasing pixels.

`catalog-motion-presets.mts` selects 42 frozen body/action/view candidates from the 84-render comparison, preserving alternate job IDs, failures and exact equipment coverage. Two saved experimental reviews remain distinct from 40 unreviewed candidates. The equipment evaluator also writes rigid helmet/sword placement experiments; those do not solve grip orientation, occlusion or perspective and are explicitly unqualified. Neither catalog nor rigid prototype is wired into Studio defaults.

## Targeted authoring and qualification

The [targeted continuation](../research/2026-10-28-motion-targeted-authoring.md) adds editable target-space stance intervals, fades, anchors and root velocity. **Draft stance contacts** proposes windows from source confidence; **Sample contact events** preserves short running support intervals. Changing calibration or motion controls clears the plan. Source-time and duration edits remain explicit. Unreachable or broken full-weight contacts block a paid render.

Completed planted candidates expose **Measure rendered soles**. Pick or import visible heel/toe measurements on exact frozen frame hashes. The tool checks opaque native pixels, consistent anatomical landmarks and distinct observed times, reports projected displacement and observed stance coverage, and preserves missing observations as insufficient evidence. Its root samples follow source time; continuous playback and engine retiming need separate validation.

**Author held item** imports transparent directional source art and saves a draft bound to the exact frozen body. Calibrate a source grip and independent blade axis, then edit each target grip, blade angle and body occlusion mask. Brushes affect the item only where the body exists. The experimental canvas adds up to 64 px of padding without resampling the body. Exports contain native body/layer/composite frames, masks, pivots, durations, selected frames and unqualified authoring metadata. A closed-fist prompt checkbox is an optional comparison, not a hand-rig guarantee.

The optional third equipment reference permits south/east/north dressing together. A narrow **frozen attack frames 7 and 8** probe uses actual frozen adult east attack pixels, saved measured grips and dressed east/south references with `inpaint-v3`. It reserves 25 conservatively after the live 448×112 grid cost 15 against an area estimate of 10. The lab does not change the production grid estimator or automatically adopt this held-item repair route. The final audit is 992 total actual generations, with all accepted jobs settled.

The [54-profile catalog](../research/2026-10-28-motion-targeted-catalog.json) preserves older experimental reviews and identifies every new unqualified comparison. No new candidate receives professional acceptance solely from clean geometry or extraction gates.

The [custom V3 follow-up](../research/2026-11-01-custom-skeleton-v3.md) adds live MCP inspection, free authoring instructions and one fixed south/east comparison using the validated agent connection. It reserves the remaining eight research generations before submission, retains unknown outcomes and cannot resend an accepted request. The completed comparison cost six generations. Credentials and sessions stay in memory; sanitized results, refusal history and settled billing can be exported. No backend or dependency was added. Live results, the corrected pre-dispatch seed refusal, alignment limits and offline playback review are documented separately from mock verification and production qualification.
