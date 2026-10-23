# Prototype regression audit

2026-10-23. Independent source and live Chromium review of the published Bronze integration against **003bef2**, at the same viewport and device scale. No API calls. The original comparison below describes the runtime before the corrective work; parity does not imply that an existing design is usable.

## Attribution and causes

| Reported issue | Attribution | Evidence and exact cause |
| --- | --- | --- |
| Equipment labels paint above the All parts menu | **Introduced by integration** | At 1469 × 889 the old `.glass-popover` computed `z-index:50`; replacement `.popover.bu-floating` computed `auto`. `.item span` computes `z-index:1` as a flex item. The new material creates a stacking context through its backdrop filter but has no explicit layer. At the Steel helmet label, `elementsFromPoint()` returned the menu button first before integration and the item `SPAN` first after integration. Geometry was identical. The menu needs a layer above content; DOM order and a blur alone do not provide that contract. |
| Desktop None resembles ordinary text | **Pre-existing usability deficit** | Both adapters explicitly remove the `.none` border. At 1469 × 889 both revisions compute a transparent background, zero border, 18 px text, 46 px height and the same coordinates. Default `button` is transparent. Mobile None uses an item tile, a different control treatment. |
| Moves rows do not clearly advertise clickability | **Pre-existing usability deficit** | Unchanged `equipment.js` creates generic buttons without `outline` or a row recipe. `.character-list button` supplies size/alignment, not a resting boundary. Walk receives a 12% accent fill through the generic selected-row rule; Cross-punch remains transparent with zero border in both revisions. |
| Creator becomes oversized or overlaps at intermediate desktop sizes | **Pre-existing responsive defect** | At `min-width:1101px` / `min-height:541px`, the stylesheet switches to three columns, fixed 48 px title, 20 px fields, 22 px editor tabs and 17–18 px presets/compass text. The two-column layout stops at 1100 px. At 1175 × 711 the title ends at x382.5 while Name begins at x367.2, creating a 15.3 px horizontal intersection with overlapping vertical ranges. At 1101 × 800 the overlap is 36.3 px. Both revisions contain these same rules. |
| Fonts changed | **Fallback change; no Windows primary font or size change found** | UI family changed from `"Segoe UI", sans-serif` to `"Segoe UI", system-ui, sans-serif`; display family adds Times New Roman after Georgia. Windows continues to use Segoe UI and Georgia. At 1469 × 889 both root fonts are 16.159 px / 23.4306 px and creator fields 20 px / 29 px. The large controls come from existing responsive rules, not a newly applied package body reset. Other platforms can render a different fallback. |
| White-on-white native popup in dark mode | **Observed user defect; exact platform cause not established by these probes** | Both revisions compute `color-scheme:dark` on root, body, playback select and its options in Chromium. Both leave playback options' backgrounds transparent while inheriting light text. Neither integration's root-scheme assertion nor these computed values certify the platform popup's painted colors. Explicit theme-colored option backgrounds/foregrounds are a justified robustness repair; actual opened popups need browser/platform visual verification. Do not claim that the integration dropped inherited color-scheme: the package token root supplies it. |

At 1469 × 889, creator title and Name did **not** intersect in the paired probe. The first content column was 743 px tall inside a 611 px scrolling form. At 1280 × 800 the title/name horizontal gap was only 14.4 px. A 1469 px content viewport reduced by 125% browser zoom is approximately 1175 CSS px, where overlap was reproduced; device pixel ratio alone does not reduce the CSS viewport. Viewport/zoom evidence must therefore be recorded explicitly.

An additional pre-existing cascade bug: `.creator label textarea { min-height:48px }` outranks the intended `.creator textarea { min-height:126px }`. The desktop textarea actually computed min-height 48 px and height 80 px in both revisions. Splitting textarea sizing from single-line fields removes that accidental interaction.

The broader review also found inherited popup-anchor errors: the adapter's `.popover.bu-floating { left:auto }` overrides `.character-popover` / `.description` left anchors. This was carried from the old GlassKit adapter. At 1469 px both menus started at x0 instead of the identity's x42.9; at 450 px the character popup shrank to 222 px and moved to x208 instead of x20. The package's floating recipe does not position elements, so that old positioning override is unnecessary. Narrow landscape also exposed a pre-existing missing New/Import path: below 761 px the desktop header actions disappear, and below 541 px height the mobile action row also disappears.

## Screen and control inventory

This inventory is a review/checklist boundary, not a claim that every behavior has a complete automated test.

| Screen/surface | Controls and states to retain/check |
| --- | --- |
| Characters | Home; desktop Import/New; mobile search/New/Import; desktop search; selected/unselected character rows and live thumbnails; no search results; Customize; previous/next; More. |
| Create | Back/Cancel; Name; Appearance/Prompt switches; help/API/copy; disabled Enhance; appearance textarea and four native selects; exact-prompt textarea; 48/64/96/128 presets; custom body/frame number fields; Auto/read-only state; Camera select; all direction presets; eight facings; six mirror switches; Seed; disabled Create; desktop/mobile size guides; complete scrolling reachability and footer separation. |
| Preview | Back, Undo disabled/enabled, Export, More; character/prompt menus; three view switches; four panel switches; Head/Hair/Body/All parts; selected/unselected item tiles and None; palette swatches; New item/Saved design; play/pause/still; native animation popup; four facing buttons; animation details; missing-direction and missing-equipment notices. |
| Top-down | Shared equipment/identity/navigation controls; Moves intentionally unavailable; WASD/arrows; drag joystick; diagonal motion; second-finger equipment use; missing-equipment notice; stop/cancel/focus-loss behavior. |
| Side-scroller | Shared equipment/identity/navigation controls; horizontal movement/facing; joystick; missing-equipment notice; view transitions. |
| Panel variants | Colours explanation; Moves selected and unselected choices; Outfits selectable rows; expanded/collapsed mobile wardrobe; long content scroll. |
| Transient surfaces | More and appearance switch; character menu; prompt text/copy/close; parts choices; export/animation/about/creator-help/API/not-connected dialogs; toast; click/keyboard dismiss; opener return; active hover/focus/pressed states. |

Source review found no integration-induced markup changes to these controls. The migration intentionally applied the package recipe only to primary buttons, form fields and floating surfaces, so importing Bronze does not improve generic button affordance automatically.

## Why the earlier checks missed this

- Captures covered 1920 × 1080 and 450 × 800; dependency checks added 390 × 844 and 844 × 390. None exercised 1101–1280 px desktop widths or a 125% equivalent CSS viewport.
- Capture geometry recorded only major containers. A z-index change preserves every recorded rectangle; a title can overlap a sibling while the form's `scrollWidth <= clientWidth` still passes.
- The existing 68 images include parts/None/Moves, but no assertion checks overlay hit order or resting affordance. The reduced desktop boards draw each 1920 px image at 480 px wide, where local label/menu failures can be easy to overlook. Full-size review is necessary.
- Native control tests inspected root scheme and creator field class/focus/size, but never opened an animation/creator option popup to inspect its real colors.
- Presence, rectangle bounds and sprite RGB checks do not establish whether users can recognize a control, whether selected items are clear, or whether keyboard focus survives the prototype's whole-UI rerender.
- Current automation does not fully cover every creator help/API/not-connected dialog, every creator preset/mirror/custom-field interaction, clipboard failure, keyboard focus continuity after rerender, native popup painting on each platform, or actual browser zoom. These remain distinct from the movement and modal checks that already exist.

## Corrective verification

`verify-regressions.mjs` adds both appearances at 320 × 500, 320 × 568, 390 × 844, 450 × 800, 568 × 320, 760 × 800, 844 × 390, 1100 × 800, 1101 × 800, 1175 × 711, 1280 × 800, 1469 × 889 and 1920 × 1080. It checks actual title/Name intersection, field font sizes/schemes, scroll reachability of every creator control, selected editor indicators, visible resting boundaries for equipment/None/Moves/Outfits, all popup anchors/bounds, parts-menu z-order plus overlap hit tests in all three views, native option colors/contrast, and playback control fit/hit targets. Supporting engines also exercise the actual native picker by click/tap, selection, Escape and focus return. Requests are restricted to the isolated local server. It writes no capture/report artifacts and uses no credentials. `BROWSER=webkit` selects the fallback engine; default is Chromium.

Initial run against the unfixed integration failed as intended on the first 390 × 844 equipment boundary assertion. The script tests the repaired design contract, including repairs to pre-existing usability deficits; it is not a pure before/after parity test.

The first corrective 20-case Chromium run passed. Subsequent stronger checks found the wrong selected-editor attribute selector, the popup anchors, the missing narrow-landscape creation action, and playback overflow introduced by enlarging the mobile animation select. At 320 px the new 128 px select pushed the settings control's center to x341, offscreen. A two-row correction also required removing fixed icon widths that exceeded their grid tracks. The expanded 24-case run then passed. A final short-portrait probe exposed the older height-only landscape classification at 320 × 500; changing the responsive conditions to include orientation makes that viewport follow the phone composition. These findings were returned to the implementation owner before the final run.

The lead's full-size phone review then caught another real cascade mismatch: `.bu-btn.primary { width:auto }` in the adapter outranked the new mobile `.create-footer button { width:100% }`, shrinking the Create action to its 220 px minimum. The creator's mobile rule now uses `.create-footer button.primary`; the short-landscape rule explicitly retains automatic width. The checker now compares the portrait action's actual width to the footer's available width, and checks all six coarse-pointer mirror targets remain at least 44 × 44 px without overflowing their compass cells. This is an example of why control-level geometry and full-size review supplement container bounds.

Additional live checks exercised all five creator selects by real option click/tap at 320 × 568, 844 × 390 and 1469 × 889 in both appearances: **30 selections and 30 picker-Escape checks passed**, with correct selected values, select focus retained, and the creator screen preserved. A separate per-control scroll/hit sweep at ten sizes, including 320 × 568, found no obstructed creator control centers, horizontal form overflow or form/footer intersection. The short 320 × 500 coarse-pointer creator now uses one column; all six mirror targets measure 44 px wide and fit their compass cells.

Run with the keyless prototype on 127.0.0.1:5202 and the documented Node 24 / managed Chromium environment:

```powershell
node docs/design/2026-10-22-redesign/round-6-prototype/verify-regressions.mjs
```

Final corrective Chromium run, repeated after the mobile Create action repair with HMR disabled: **26 appearance/viewport cases passed**, with no page errors or external requests. Native popup interaction, item/None/Moves/Outfits boundaries, all three scene views, popup anchors/paint order, creator field sizes and control reachability, full-width portrait Create actions, 44 px coarse-pointer mirror targets, and short-portrait playback fit passed. The selected animation label fits beside the actual picker icon at the narrow sizes. The checker supports a separate WebKit run for native fallback coverage; that engine's final result is owned by the implementation lead.

One earlier 26-case attempt timed out on a menu click; a targeted reproduction repeated all four menu actions five times successfully. Concurrent gallery HTML edits were subsequently identified as triggering Vite's global hot reload during active browser actions. The checker now serves an empty `/@vite/client` module so unrelated documentation/gallery edits cannot reload a test midway through an interaction. Runtime capture still needs its own source-freeze/provenance guard.

These checks establish the stated local contracts. Full-size capture review and real opened native-menu inspection remain separate evidence; the checker does not certify platform popup painting in engines that retain an OS picker.
