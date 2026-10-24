# Independent renderer challenge and repairs

2026-10-23. Scope: prototype `world.js` and `stage-layout.mjs`; compact-screen CSS is a coordinated consumer repair. No production files, API calls, credits, reflection settings or horizontal backdrop alignment changed.

## Disposition

| Review claim | Decision and evidence |
| --- | --- |
| F4: actors overlap controls on compact screens | Accepted. At 320×500 the original view tabs ended at y=220 while playback began at y=213, leaving no vertical stage at all. A renderer change alone cannot repair overlapping UI boundaries. The coordinated compact portrait CSS now supplies room; measured top/bottom boundaries constrain actor size and feet only on mobile or short screens. Selection also reserves its neighbours' 30px raised position. |
| F9: integer CSS scaling gives uneven physical pixels | Accepted. For example, six CSS pixels at DPR1.25 equal 7.5 physical pixels. Sprite scale now uses an integer physical-pixel step and both draw coordinates snap to that grid. DPR participates in canvas invalidation through the existing resize path. Rounded backing-store dimensions get matching CSS dimensions, avoiding a fractional viewport resampling the whole canvas. |
| Top-down reflection is a rendering error | Rejected as an automatic defect. It is a configurable stylized floor reflection already approved as a separate layer. The review explicitly labels this subjective. No reflected pixels enter the original sprite; removing it changes the art direction. Preserved. |
| Selection backdrop must follow the free stage centre | Rejected as an automatic defect. The painted scenery fills the viewport while actors occupy the stage beside the rail. A vertical seam need not be the actor's ground anchor. No alignment or functional failure was demonstrated, and shifting the backdrop changes the approved composition. Preserved. |

## Verification

`scripts/renderer-regression.mjs` passed **144/144 cases** in managed Chromium: selection, Preview, Top-down and Side-scroller at 320×500, 390×844, 450×800, 568×320, 844×390, 683×384 (the audit's 200%-equivalent CSS viewport), 1024×768, 1366×768 and 1920×1080; each at DPR1, 1.25, 1.5 and 2.

The test checks actual solid actor pixels against visible buttons, inputs, selects and identity/selection text. Transparent cell padding is deliberately excluded: using the entire 64×64 cell as an overlap detector gives false positives on approved desktop composition. All tested cases had zero painted collisions. The test also renders a known 64-column alternating pattern through the actual `drawSprite` method: all 64 columns survived, every run had the same physical-pixel width, and draw origins were device-grid aligned. Reflections intentionally remain compressed/translucent decoration and are excluded from the solid-sprite check.

At DPR1, 1366×768 desktop Preview retains its original frame rectangle `{x:321,y:196,w:384,h:384}`, and 390×844 Preview retains `{x:99,y:247,w:192,h:192}`. Compact screenshots at 320×500 and 568×320 were also visually inspected; the character is visible between controls. Pixel-perfect compact sprites can be smaller than the earlier overflowing sprites.

Results and representative captures: [renderer-remediation evidence](evidence/renderer-remediation/), including [JSON results](evidence/renderer-remediation/results.json), [capture provenance](evidence/renderer-remediation/provenance.json), [320×500 Preview](evidence/renderer-remediation/320x500-dpr1-preview.png) and [568×320 Preview](evidence/renderer-remediation/568x320-dpr1-preview.png). This focused matrix uses the default dark appearance; appearance-wide checks belong to the broader consumer suite. Physical-device touch comfort and screen-reader behavior are outside renderer scope.

## Expanded mobile sheets

`scripts/renderer-expanded.mjs` adds **36/36 passing cases**: both appearances at 320×500, 390×844 and 450×800, each in normal/expanded Preview, Top-down and Side-scroller. It checks solid actor pixels against controls, identity text and movement hints, checks hints against view tabs, verifies an opaque sky immediately above the Side-scroller horizon, and verifies the requested appearance and sheet state. The final compact layout keeps the actor clear when the sheet expands; short phones hide the prompt and raise the view tabs to create room. Normal and expanded Preview captures in all six appearance/size pairs were visually inspected, together with representative live views. The prior hint/tab text collision is also repaired and now has an explicit assertion.

Stage changes also exposed a real Side-scroller defect: entering Side while expanded and then collapsing the sheet moved the floor horizon but left the sky at its old height. At 450×800 the horizon moved from 288 to 343.39 while the sky ended at 312, creating an uncovered band. `floor()` now repaints only the cached sky when its projected horizon changes; it performs no asynchronous reload or canvas resize. The supplemental cases enter Side while expanded, collapse, and expand again, and require fully opaque sky coverage immediately above each new horizon.

A resize-path smoke test at 450×800 simulated DPR1→1.5 and dispatched resize: actor backing dimensions changed 450×800→675×1200, its transform became 1.5, CSS width stayed 450 and every background load count stayed 1. This verifies resize-driven DPR refresh; moving a physical window between monitors was not tested.

Final supplemental captures use Bronze UI **0.2.1**, Chromium **156.0.8078.4**, captured at **2026-10-24T00:18:12.885Z** (October 23 local time). They live in [renderer-expanded](evidence/renderer-expanded/); [results](evidence/renderer-expanded/results.json) and [capture provenance](evidence/renderer-expanded/provenance.json) record the verified cases and installed Bronze/browser versions. The 144-case matrix was rerun after the renderer/CSS repairs with Bronze 0.2.0; its separate provenance preserves that distinction. Original audit data remains intact. This supplemental matrix runs at DPR1; fractional DPR is covered by the 144-case matrix above.

Run from the repository root with the keyless prototype server on port 5202 and the managed Chromium cache configured:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='C:/Users/shilo/AppData/Local/ms-playwright'
& ./.runtime.tmp/node-v24.22.1-win-x64/node.exe docs/reviews/2026-10-23-claude-redesign-audit/scripts/renderer-regression.mjs
& ./.runtime.tmp/node-v24.22.1-win-x64/node.exe docs/reviews/2026-10-23-claude-redesign-audit/scripts/renderer-expanded.mjs
```
