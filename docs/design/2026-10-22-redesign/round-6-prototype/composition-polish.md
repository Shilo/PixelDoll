# Composition and interaction polish — 2026-10-23

This follow-up addresses the review after `878321a`. It changes the prototype consumer, not Bronze UI's published palette, typography or package version. The problems were scene composition, action handling and insufficient material backing in consumer CSS.

## Approved decisions

- Character rows remain borderless when unselected. Thumbnails, names, hover/focus feedback and the selected treatment establish the list. First activation selects an unselected character; activating the selected character opens Preview. This applies to rows and world actors. Previous/Next and keyboard navigation still select without opening. No timing-dependent double-click handler is required.
- Actors, selection captions and playback share the measured horizontal stage: viewport space up to the actual right sidebar. Portrait bottom sheets leave the full horizontal stage available. Fixed sprite pivots, not equipment silhouette bounds, define actor centers so swords and animation frames cannot shift layout.
- The category button is **More**, containing only **Back** and **Held item**. Its selected treatment indicates one of those categories. The internal legacy action ID `slot:all` is retained for the historical capture flow; it is not user-facing copy.
- Its popup anchors to the actual More button, opens below when space permits, otherwise above, and stays inside the viewport. Keep the panel tabs reachable: on short phones use a scrollable menu below instead of covering the tabs with a flipped menu. When neither side has adequate room, place it above the navigation group. Reposition on resize and equipment scrolling; do not retain a fixed viewport-relative top when the menu content changes height.
- Customization tabs are **Wardrobe, Colors, Outfits, Moves**. Moves is unavailable in live gameplay views. Switching panels dismisses transient menus.
- The GitHub link uses a Lucide GitHub icon before its label and an external-link icon aligned to the row's right edge.
- View tabs beneath the identity on phones keep intrinsic widths and a consistent gap, aligned to the identity's left edge. They do not distribute across the screen.
- Mirror and facing controls have a single shared seam with square inner corners and rounded outer corners. Touch mirror targets remain 44px.
- Creator choice controls use opaque Bronze field/selected/hover materials, matching their text inputs. These small local surfaces preserve the world while protecting labels from changing floor texture. Navigation and character rows are deliberate lighter treatments, not form-control styling exceptions copied ad hoc. No new blur, palette or font was introduced.
- Creator labels retain their muted hierarchy. Their scene gradient uses measured minimum backing: 85–88% in dark mode and 90–92% in light mode through the form region; the left size guide uses primary text. This is less opaque than the initially reviewed 92–96% treatment. Selection, Preview and gameplay scrims are unchanged.
- The horizontal creator gradient reaches its minimum form backing by 19% of the viewport, before the earliest form edge at the 1350px layout boundary. Full-width forms use the vertical gradient, including wide, short landscape layouts. This follows the actual creator layout branches rather than assuming that only phones use full-width forms.
- Selection preserves sidebar scroll position across rerenders. This keeps a clicked row under the pointer so a real second click reaches the same character, including short landscape layouts.

## Preventing recurrence

1. `stage-layout.mjs` measures the real rail once after render/resize. Both canvas layout and DOM controls consume it. Breakpoints no longer each invent a different horizontal center. Small landscape playback wraps to fit that same space.
2. `creator.css` owns composition and attached geometry. `bronze-theme.css` owns consumer material recipes using published semantic tokens. Bronze UI owns the colors. Do not fix scene geometry by changing package font or control defaults.
3. `verify-polish.mjs` independently compares real painted sprite rectangles and DOM control centers against the actual sidebar edge. It exercises viewport changes in an existing session, repeated selection, menu dismissal, intrinsic phone tabs, icon alignment, joined controls and creator material/text contrast.
4. Keep `verify-regressions.mjs`: outer page bounds alone missed the original failures. Its 26 cases check control intersections, scrolling, picker semantics, stacking and label fit. Keep the movement and dependency checks too.
5. Capture exact-size before/after evidence and inspect it. Automated geometry cannot certify visual quality. `capture-polish.mjs` keeps this round separate from all historical evidence, refuses overwrites, records PNG and runtime hashes, and rejects a runtime changed during capture.

These are local regression gates, not a claim that CI currently enforces the visual prototype. Its generated backgrounds remain local under the repository's media policy. A fresh checkout must restore those assets before running browser checks. Physical touch devices, screen readers and every OS-native picker are not certified by headless runs.

## Contrast rationale

An identifying boundary is not mandatory for every labeled control, so preserving the immersive character list is defensible. However, visible focus and meaningful state cues still matter. [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

For creator controls, the test composites their real surface against black and white backdrops and checks ordinary text at 4.5:1. Opaque backing removes dependence on the scene's local brightness; it is a design choice, not a requirement that every UI element be opaque. [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Evidence and review

The before set reuses the complete previous repair captures: all 16 recorded runtime hashes exactly matched the unchanged starting checkout. A fresh partial attempt timed out during mobile loading and is explicitly retained as incomplete; it is not presented as a successful run. The complete historical images remain untouched.

See [before/after gallery](http://127.0.0.1:5202/polish-review.html) and [independent GPT-6.1 Sol High review](polish-review.md).

### Final validation

- Behavior suite: 18 checks passed; dependency/theme suite: 8 cases passed. Bronze UI remains version 0.1.0 with unchanged package CSS hashes.
- Existing regression suite: 26 cases passed in each of Chromium and WebKit.
- Independent polish review: 24 full cases and 28 creator breakpoint cases passed in each browser. After the final popup viewport clamp, 6 targeted cases per browser passed, including scrolling, resizing, selecting both menu entries and dismissing through every panel tab. This final delta did not require repeating the unchanged creator audit.
- Lowest sampled normal-text contrast across creator boundaries was 4.90:1. No page errors or external requests were observed in these browser runs.
- Final evidence contains 68 matched before/after states at identical desktop and mobile resolutions, plus 12 supplemental current-state captures. All 148 source PNG hashes and dimensions and all 17 final runtime hashes were verified after capture. The final anchored mobile menu was visually inspected alongside the other screen comparisons.
- The remaining validation step after this documentation commit is a repeat of the existing Chromium regression suite against the committed source; its result is reported with the commit.
