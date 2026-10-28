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
- Reviewed live candidates through an isolated instance of the existing queue. The campaign ledger reserves against the approved 914-generation remainder, before queuing. Identical candidates resume their existing job IDs; unknown paid outcomes are retained without automatic resend.
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
