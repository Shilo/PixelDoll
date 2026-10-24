# Challenged review and repair decisions

2026-10-23. Claude's original report remains unchanged as historical evidence. This response independently checks its claims against the prototype and Bronze UI. A passing test suite is evidence for its assertions, not a certificate of professionalism or accessibility. No production Studio migration or paid API work is included.

## Disposition of the entire review

| Finding | Decision and reason | Repair / boundary |
| --- | --- | --- |
| F1 Tab changes views | Accept. It prevents ordinary keyboard traversal. The earlier requested shortcut conflicts with a more fundamental navigation convention. | Native Tab/Shift+Tab restored; 1/2/3 change views only while the world is focused. |
| F2 Enter hijacks selection controls | Accept. Native activation must act on the focused control. | Enter on New opens creation; Enter on an unselected row selects it, then opens that character on the next activation. Stage shortcuts belong to the focused canvas. |
| F3 render loses focus | Accept, but a complete framework rewrite is unnecessary for this isolated prototype. | A shared stable-identity focus helper preserves focus through renders; menus receive focus and return it on dismiss; dialogs return to a surviving trigger. Creator/equipment scrolling survives renders. Production should use stable Svelte DOM. |
| F4 compact actor/UI overlap | Accept. Horizontal centering alone cannot fit a character vertically. | Measure free vertical space; reduce sprite size only when constrained. Short portrait layout reserves a stage. Expanded sheets also reserve space rather than covering the actor and playback. See renderer report for exact limits. |
| F5 drag-only movement | Accept the accessibility gap; defer tap-to-move as a separate interaction change. | The approved dynamic joystick remains. A non-drag pointer alternative is needed before claiming WCAG 2.5.7 conformance. Keyboard support alone does not resolve it. Tap destination movement needs deliberate camera/ground hit testing and cancellation behavior; this patch does not silently introduce it. |
| F6 global movement shortcuts | Accept. Letter shortcuts must not hijack controls or speech input. | Focusable, labelled world; clicking it resumes input. WASD/arrows act only there. Moving focus to UI clears held keyboard keys. Touch joystick plus second-finger equipment still works. |
| F7 mobile Undo absent | Accept. Screen size must not remove the only undo path. | Keep the existing Undo icon in the mobile header, with its disabled state and accessible name. |
| F8 stale notice / inaccurate Side hint | Accept. The toast must describe the current fallback. | Suppress the fixture's initial Idle absence; report it once after moving/stopping, and dismiss it when its state ends. Side hint names A/D and left/right. Hints no longer overlap phone view tabs. |
| F9 physical pixel scaling | Accept. Integer CSS scale is insufficient at fractional DPR. | Integer physical-pixel scaling and snapped origins; canvas size refreshes on DPR changes. Reflections remain intentional compressed decoration. |
| F10 native selects | Accept weak standalone boundary and nested playback box; reject “native triangle is automatically wrong.” | Bronze 0.2.1 uses the field boundary token and adds a quiet select recipe for bounded toolbars. Native affordance retained. |
| F11 dark initial paint | Accept. Stored appearance should be selected before module loading. | Small guarded head script sets the root scheme; storage denial does not prevent startup or session switching. |
| F12 busy Dialog Escape | Accept the repeated-Escape failure. Its paid-generation impact is prospective; this prototype performs no paid operations. | Upstream keydown/cancel protection and repeated-Escape tests, followed by normal dismissal once no longer busy. |
| F13 host independence | Partly accept. Ordinary element/universal resets and optional-base omissions are valid contract bugs. Arbitrary CSS immunity is impossible. | Upstream namespaced sizing/type defaults, icon/message spacing, documented cascade limits. Classic scrollbar gutters and transparent tracks are independent; retain the transparent track and browser fallback. |
| F14 showcase fidelity | Accept local duplicate tile styling; reject exact product-workflow parity as a theme requirement. | Showcase uses shared tile/quiet-select recipes. Creator presets, mirror positions and generation behavior are consumer concerns; the showcase is not a duplicate PixelDoll implementation. |
| F15 documentation/provenance | Accept drift and missing recipe composition documentation. A CRLF-only local archive difference is not release corruption. | Upstream guide/index/coverage/changelog corrected, historical coverage labelled, immutable release provenance recorded. |
| F16 customization contents | Partly accept unclear fixture presentation; reject removing approved tabs or implementing unrequested generation/recoloring. | Outfits now describe looks instead of character names. Colors displays the same reusable sample palette with explicit disconnected status. Wardrobe retains its approved contextual preview. Moves remains the animation inventory; playback remains transport. |
| F17 duplicate/no-op actions | Accept no-op brand button; reject removing a useful familiar Cancel solely because Back has the same destination. | PixelDoll brand is text, not a false action. Creator Cancel remains. |
| F18 Escape / Backspace | Accept accidental navigation while editing or focusing ordinary controls. | Editable controls keep Escape/Backspace. Backspace returns only from the focused world or dismisses an open popover; it is blocked from browser-history navigation on ordinary buttons (confirmed WebKit). Escape still dismisses menus/dialogs or returns from non-editing screen state. |
| F22 typography | Reject mandatory replacement. The report explicitly calls this subjective. | Preserve approved Georgia/system typography and document cross-platform variation. Bundling a font is an optional future identity decision, not a defect fix. |
| F25 CSS/render architecture | Accept maintenance risk; reject line counts, inline layout styles and repeated media blocks as sufficient proof of a bug. | Fix focus/scroll behavior and keep appearance upstream. Avoid a broad CSS cascade rewrite during targeted repair. Svelte migration should replace string rendering when integrating production. |
| F26 verification gaps | Accept. The old suites did not assert the failing interactions. | Add keyboard/focus/notice/first-paint checks in Chromium and WebKit, actual painted-pixel overlap and DPR tests, upstream reset/busy/select regressions. Existing tests are retained and updated only for the deliberate world-focus contract. |
| Palette “Metal” label | Reject Metal: the displayed fixture swatches are not a verified selected-item metal ramp. | Use “Sample palette” and explicit scope copy; no recoloring is fabricated. |
| Top-down reflection | Reject as an automatic defect. Stylized reflection is approved and code-configurable. | Preserve original unshaded pixels and the separate optional reflection. |
| Backdrop seam/perspective alignment | Reject mandatory offset. Stage centering and a full-window environment have different composition roles. | Preserve approved art; shifting an image is not justified by a seam being off-center. |
| Light muted contrast | Partly accept. Entire-element screenshot minima can include input borders, adjacent text and non-glyph pixels; they cannot all be called text failures. | Use the stronger existing text role for scene eyebrows, category labels and row metadata; keep global theme tokens. Recheck sampled text regions. Hints use the stronger role and avoid tabs. |
| Small text / touch targets | Accept practical improvements, not a blanket WCAG 44px requirement. | Raise remaining 10/11px consumer text to 12px. Sheet handle becomes 24px tall. Sample swatches retain approved alignment and spacing; real color editing still needs a dedicated touch interaction. |
| Missing theme/production controls | Accept as a future integration inventory, not current bugs. | No speculative sheet/job/menu/worn-state APIs added without a concrete consumer contract. Bronze is not claimed to implement all Studio workflows. |
| Magic numbers / single-consumer tokens | Reject these as automatic defects. Accept demonstrated opaque-fallback omissions. | Upstream action material roles now cover reduced transparency, contrast and forced colors. Geometry stays consumer-owned. |
| Showcase spelling | Accept consistency with the approved American English copy; either dialect is otherwise valid. | Normalize showcase Color/Colors wording upstream. This is catalog copy, not a reason to change the released CSS. |

## Additional defects found during challenge

- Creator scrolling used `.creator`, not the nonexistent `.creator-scroll`. Focus restoration alone otherwise left the focused size preset offscreen. Preserve actual scroll before restoring focus.
- A newly focusable full-window world inherited an old `outline:none`. Remove it; Bronze owns the visible ring and accepts an inset focus-offset geometry override.
- Filtering the character list rebuilt rows without reapplying shared Bronze recipes. Reapply the adapter to the new list contents.
- Short-phone expanded sheets need their own reserved stage. A collapsed-only screenshot cannot establish expanded-state correctness.
- WebKit pointer clicks do not necessarily focus a button. Capture the actual action trigger for direct dialogs instead of relying only on `activeElement`; clicking Export and closing now returns focus to Export. Menu dialogs still return to the surviving menu trigger. The independent final review reproduced this, and the two-engine interaction suite now covers it.

## Ownership and durability

Shared fixes are in Bronze UI 0.2.1 source and its versioned release; PixelDoll consumes the published archive through its package and lockfile. The prototype retains layout, workflow, keyboard scope, focus restoration and renderer changes. It does not patch installed package CSS. The source ownership guard remains a tripwire, not proof of visual correctness.

Claude's original screenshots/results remain local and unchanged. New captures are separate. The pre-Bronze comparison gallery remains a historical snapshot with its recorded commit hashes; these review repairs must not be mistaken for that older after capture.

## Evidence and limitations

Final test results and screenshots are recorded below. The renderer's initial matrix is detailed in [renderer-remediation.md](renderer-remediation.md); it distinguishes real painted pixels from transparent cell padding.

Physical touch comfort, screen readers, true OS zoom/virtual keyboards, Firefox, long/RTL content and failed assets are not comprehensively certified by this patch. Creation/import/export/recoloring remain isolated prototype scope stubs. Drag-only pointer movement remains an explicitly open accessibility issue, not a dismissed finding.

## Sources checked during challenge

- [W3C keyboard interface guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/): Tab traversal and predictable focus.
- [WCAG character-key shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html): focus-scoped letter shortcuts are a supported solution.
- [WCAG dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html): a keyboard alternative does not automatically satisfy the non-drag pointer requirement. The Understanding pages are explanatory guidance, not themselves the normative standard.

These sources support interaction constraints. They do not prescribe a font, corner radius, background offset or mandatory glass appearance.

## Completed verification

The prototype now installs the immutable [Bronze UI 0.2.1 release](https://github.com/Shilo/bronze-ui/releases/tag/v0.2.1), source commit `36e9b63`. Its upstream [patch report](https://github.com/Shilo/bronze-ui/blob/main/docs/PATCH-0.2.1.md) records the independent challenge, no-base/reset tests, browser contracts and package-consumer tests. Published archive SHA256: `a5d715362081444f16184b3145cb12dec96a34f99f09f025235eb2c7533258d6`. Every packaged file matched the source/generated distribution after line-ending normalization. The local server was restarted after installation; `verify-bronze.mjs` asserts that served token/component bytes match the installed release.

Final consumer checks with 0.2.1:

- `verify-review-fixes.mjs`: four appearance/viewport cases plus stored-light first paint in **each of Chromium and WebKit**. Covers native activation, focus/scroll preservation, popover/dialog return, world-scoped shortcuts, mobile Undo, filtered-row recipes, stale notices and desktop/phone playback typography.
- `verify-regressions.mjs`: **26 cases per engine**, Chromium and WebKit, including compact/intermediate creator layouts, resting boundaries, popup stacking, native picker appearance/contrast and label fit.
- `verify-bronze.mjs`: **eight appearance/viewport cases**, all five screens, exact release/served-CSS provenance, field/dialog/focus contracts and alternative display preferences. Ownership guard passes.
- `verify-polish.mjs`: **12 Chromium cases**, widths 320, 390, 450, 568, 844 and 1469, both appearances. Tested scene-text minima: **5.09:1 normal, 12.21:1 large**. This is scoped evidence, not a claim that every pixel of every possible screen was measured.
- `verify.mjs`: **18 checks**, including authored playback, untouched sprite RGB in both themes, continuous movement, camera follow, missing-gear recovery, configurable reflections and real touch events with secondary-finger equipment interaction.
- `motion.test.mjs`: **12 tests**. Includes every nonempty compass subset, intent-preserving Preview and missing-clip fallbacks.
- Renderer: **144 cases after source repairs with 0.2.0**, followed by **36 final phone/expanded-sheet cases with 0.2.1**. Separate provenance is retained; these are not presented as one identical-release matrix.
- Production build succeeds and the agent-token distribution guard is clean. Vite reports the existing large JavaScript chunk warning; production Studio source is unchanged.
- Final Codex browser inspection confirms the quiet playback select, mobile Undo, clear equipment choices and preserved visual direction. Final desktop/light and phone/dark captures were also inspected directly.

Local captures (excluded from Git): [desktop light](../../design/2026-10-22-redesign/round-6-prototype/evidence/claude-remediation/chromium-porcelain-1366-preview.png), [desktop dark](../../design/2026-10-22-redesign/round-6-prototype/evidence/claude-remediation/chromium-obsidian-1366-preview.png), [phone light](../../design/2026-10-22-redesign/round-6-prototype/evidence/claude-remediation/chromium-porcelain-390-preview.png), [phone dark](../../design/2026-10-22-redesign/round-6-prototype/evidence/claude-remediation/chromium-obsidian-390-preview.png). Expanded/compact captures are linked from the renderer report. Original Claude evidence is preserved.
