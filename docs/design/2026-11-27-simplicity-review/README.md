# Simplicity-first app review

The review follows a player from choosing or adding a character through dressing, generation, recovery, review and export. The baseline is `bafa8fc27` with the bundled Adventurer and a local editable copy. Frequency estimates reflect where a surface occurs in that journey. They are design judgments without usage telemetry.

## Surface inventory

Screenshots live in the ignored `evidence/` folder under the repository's local-media policy. “Source” identifies a path that still needs a rendered pass. This inventory covers the shipped app and its in-app Developer controls. Vite-only research labs are internal harnesses.

| Surface | Player's task and frequency | Baseline and smallest change worth testing | Status |
| --- | --- | --- | --- |
| Characters | Pick a character, every visit | Backup warning can appear on a later visit with only the demo. Reserve it for work at risk. [Baseline](evidence/characters.png) | Rendered |
| Character selection and name pickers | Switch characters, frequent | Character name, facts and list selection repeat for orientation. Put the picker choices ahead of raw generation material. [Baseline](evidence/character-context-menu.png) | Rendered |
| Add character menu | Choose create or one of two import sources, occasional | Source choices are clear. Preserve separate, direct destinations and the paid cue before create. [Baseline](evidence/add-character-menu.png) | Rendered |
| Character creator | Describe and size a new character, occasional | The exact prompt appears below Appearance and again in its own tab. The price sits on the far side of the footer from Create. [Baseline](evidence/create-or-connect.png) | Rendered |
| Character setup help | Understand a field, occasional | Camera and mirroring help use provider terminology. Show the visual consequence first. Source in `CharacterForm` and `Help`. | Source |
| Import from file | Load a character ZIP, occasional | Put the accepted artifact by Choose ZIP. Footer repeats the local-copy explanation. [Baseline](evidence/import-from-file.png) | Rendered empty |
| Import from PixelLab | Browse or preview a character, occasional | The optional direct path is technical. Name what the field takes. [Baseline](evidence/import-from-pixellab.png) | Rendered disconnected |
| Import preview, moves and items | Verify chosen artwork before importing, occasional | The preview names the exact character contents. Free import is described twice when rig setup is suggested. [Round-trip preview](evidence/import-archive-preview.png) · [Wrong filename](evidence/import-zip-error.png) | Rendered character archive; move and item import source |
| Studio Preview | Inspect the current look and animation, every session | Keep stage and playback together. Preview can say Move for a State; test a label that covers both. [Baseline](evidence/studio-preview.png) | Rendered |
| Top-down and Side-scroller | Play-test a character, frequent | Short input instruction stays near the field of play. Mount and missing-coverage feedback need separate state checks. [Top-down](evidence/top-down.png), [Side-scroller](evidence/side-scroller.png) | Rendered |
| Wardrobe | Wear, remove or add gear, frequent | Empty slots render the same New action twice, a disabled shuffle and an Empty tile that is already selected. [Baseline](evidence/wardrobe.png) | Rendered |
| Slot rail, slot menu and slot editor | Find, show, reorder or add slots, occasional | Preserve one rail as the map to the long list. Verify contextual actions and focus on return. | Source |
| Item menu and missing-art choice | Inspect or act on a tile, frequent | The named item and warning establish scope. Compare Recolor availability and the “make” actions on demo, owned and shared items. [Baseline](evidence/item-menu.png) | Rendered owned |
| Item View and edit | See available art and tools, frequent | Item-wide findings and a single-facing repair live together without clear scope. Keep the existing sections. [Details](evidence/item-details.png), [Quality](evidence/item-quality.png) | Rendered incomplete |
| Item Outfit | Set order, handedness and hiding, occasional | “Only for facing south” changes the scope of subsequent layer-order edits across the slot. Compare an explicit scope choice beside the arrows. | Rendered by independent review |
| Item creation and appearance edit | Describe a new item or variant, occasional | Setup pitch, stage explanation, shortcut and checks compete with the description. Keep real costs and prerequisites at their actions. [New item](evidence/new-item.png) | Rendered new; appearance source |
| Item progress, failed and paid review | Follow work, recover or keep purchased artwork, occasional | Test queued, paused, failed, reviewing, ready and accepted states. Keep the route from tile and Activity. Source in `GenCard`, `ItemMenu`, `PaidReview`. | Source |
| Colors | Recolor a body or gear range, frequent | Color ramps are task controls. Keep concrete range names and verify keyboard access to the native color UI. [Baseline](evidence/colors.png) | Rendered |
| Outfits, save and action menu | Save or restore a look, frequent | Thumbnails distinguish paired names. Preserve selected state, save in place and Trash recovery. [Baseline](evidence/outfits.png) | Rendered list |
| Moves | Choose and edit motion, frequent | Coverage counts all items, including unworn ones. Name the set consistently in View and edit. [Baseline](evidence/moves.png) | Rendered |
| States | Choose and edit a pose, frequent | A distinct tab works; distinguish free capture from a paid new pose on entry. [Baseline](evidence/states.png) | Rendered |
| Move and State action menus and View and edit | Review poses, artwork and available fixes, frequent | A zero-eligible batch can still open Generate items. Check actual eligibility before showing the action. | Rendered by independent review |
| Move, State and item generation pickers | Decide what to create or replace, occasional | Keep exact scope and price near each action. Verify unavailable, pending, partial coverage and tier cases. | Source and independent review |
| Move and State progress and review | Keep, repair or retry, occasional | Strong defaults need paid results to stay recoverable. Verify actual changed assets and missing-facings paths. | Source |
| Character View and edit | Inspect raw body and tools, occasional | Recorded spend and future estimate sit in one Cost section. Distinguish the two decisions in copy. [Baseline](evidence/character-window.png) | Rendered |
| Adjust frame and Directions | Change character geometry, occasional | Existing previews matter more than synthesis details. Verify mirrored and cropped artwork with saved frames. [Frame](evidence/adjust-frame.png) · [Directions](evidence/directions.png) | Rendered |
| Cost estimate | Plan future work, occasional | Keep estimation distinct from authorization. [Baseline](evidence/cost-estimate.png) | Rendered |
| Character setup | Prepare prerequisite views and rig, occasional | Missing rotation recovery should name what to bring and link to the import route when possible. [Baseline](evidence/setup-character.png) | Rendered |
| Frame viewer and Fix frames | Inspect or edit frames, occasional | Facing, zoom and frame index stay in context. Verify return focus and exact edited scope. [Viewer](evidence/frame-viewer-stage.png) | Rendered viewer |
| Playback picker and coverage | Pick move or state and inspect gaps, frequent | The picker already groups Moves and States. Trigger wording should cover both. [Baseline](evidence/playback.png) | Rendered picker |
| Mount settings and seat editor | Place a character on a mount, occasional | Riding pose and leg visibility belong by the mounted preview. Verify compact seats and explicit coordinate changes. [Baseline](evidence/mount.png) | Rendered settings |
| Share | Copy or send preview media, occasional | Keep output type, scaling and actual dimensions on the action. Preserve the distinct job from Export. [Baseline](evidence/share.png) | Rendered still |
| Export and version menus | Get files for an engine, frequent at delivery | Settings round trip for export options. Keep engine choice, contents and output action discoverable. [Baseline](evidence/export.png) · [Coverage notes](evidence/export-notes.png) · [Phone](evidence/phone-export.png) | Rendered picker and ZIP download |
| Project folder | Publish recurring updates, occasional | Keep link/update state near the target. Verify supported, unlinked, linked, updating and failure paths. | Source and rendered unlinked |
| More, language and Help menus | Find global or fallback actions, occasional | Account and Language recovery are meaningful shortcuts. The menu should favor the destinations that help in the current view. [More](evidence/studio-more.png), [Help](evidence/help-menu.png) | Rendered More and Help |
| Connect and account | Connect or manage a key, occasional | Generic Connect can hide a pending paid action. Keep the purchase explicit. [Baseline](evidence/connect.png) | Rendered disconnected |
| Activity and API calls | Find work that is running or needs attention, occasional | Pending work leads when present. In the empty state, account and capacity sit above the work status. [Empty](evidence/activity.png) · [Stopped work](evidence/activity-stopped-work.png) | Rendered keyless, other-tab and stopped |
| Settings navigation and search | Find a named preference, occasional | Preserve recovery by known term and Back. Fifteen sections put substantial weight on creation defaults. [Baseline](evidence/settings.png) | Rendered desktop |
| Settings Appearance and Audio | Set theme, language, panel side and sound, occasional | Controls use familiar choices. Verify the remembered settings and compact back path. [Appearance](evidence/settings-appearance.png), [Audio](evidence/settings-audio.png) | Rendered |
| Settings Wardrobe, Mount and Play mode | Choose visibility, mounts and play inputs, occasional | Keep per-character choices beside the affected task and shared defaults discoverable. [Wardrobe](evidence/settings-wardrobe.png), [Mount](evidence/settings-mount.png), [Play mode](evidence/settings-play-mode.png) | Rendered |
| Settings Character, Move, State and Item | Tune defaults or suggestions, occasional | Repeated intros and long dependency prose obscure the controls. Keep the deliberate default and editing workflows. [Character](evidence/settings-character.png), [Move](evidence/settings-move.png), [State](evidence/settings-state.png), [Item](evidence/settings-item.png) | Rendered |
| Settings Export | Change future exports and linked folders, occasional | Distinguish defaults for all characters from the work being exported. [Baseline](evidence/settings-export.png) | Rendered |
| Settings Library and Trash | Back up, restore, recover or permanently delete, occasional | Preserve named scope and safe focus on destructive confirmations. [Library](evidence/settings-library.png), [Trash](evidence/settings-trash.png) | Rendered landing |
| Settings PixelLab, Developer and About | Manage account, inspect calls and find version, occasional | Keep developer detail out of ordinary journeys. [PixelLab](evidence/settings-pixellab.png), [Developer](evidence/settings-developer.png), [About](evidence/settings-about.png) | Rendered disconnected |
| Rename, Delete, cancel and reset confirms | Confirm a consequential change, occasional | Keep object name and consequence concrete. Verify Cancel focus and Escape across stacked layers. | Source |
| Report and isolated workspace | Diagnose or report a problem, rare | Technical evidence belongs behind Details. Recovery can preserve an existing draft under the checked disclosure. [Report preview](evidence/report-preview.png) | Rendered report; isolated workspace source |
| Tips, inline notices and status chips | Understand a new action, restriction or result, as needed | The Wardrobe tip intercepted the New button. Check placement against neighboring actions. [Tip](evidence/wardrobe-tip-overlap.png) · [Mocked stopped creation](evidence/mocked-stopped-creator.png) | Rendered tip and item status |
| Toasts, startup, offline, install and update | Notice a result or recover from interruption, as needed | Keep actionable errors reachable beyond the toast. Verify launch, expired updates, offline, next action and recovery. [Backup notice](evidence/characters.png) · [Export toast](evidence/export-download-toast.png) | Rendered backup and download; startup and PWA tests |

## Decisions

| Finding | Change | Alternative considered |
| --- | --- | --- |
| Character creation showed the exact prompt in two places and the price apart from Create. | Appearance shows description and traits. Prompt has exact editing and copying. Create carries its estimate and describes it for assistive technology. [Before](evidence/creator-before.png) · [After](evidence/creator-after.png) | A Look → Format wizard or a collapsed geometry section would reduce initial density. The independent implementation pass found that size, frame, reference limits and cost provide immediate feedback together. Keep those choices and their feedback visible. |
| Connect can immediately start the approved generation. The form used to lose the target and price. | Starting a new character or item carries its name and estimate into the connection action. Standalone account entry has no purchase. [Before](evidence/connect-pending-item.png) · [After](evidence/connect-pending-item-after.png) | Connecting and returning to the priced form would offer a fresh decision and add a click. Carry the decision for these already-priced actions. Other reconnecting flows still need the same scope review. |
| A Move or State could promise to draw gear when the only missing design was unavailable. | Use the same source-art and pending-work eligibility as the priced picker. Wardrobe coverage stays visible, with a reason when no item can be offered. [Before](evidence/walk-before.png) · [After](evidence/walk-after.png) · [Mixed](evidence/walk-mixed.png) | Moving the priced checklist into every clip window would make the common inspect task heavier. Keep a separate picker for eligible batches. |
| Empty Wardrobe slots showed duplicate creation controls and a selected Empty action. | The New tile is the action for a truly empty slot. Populated slots keep their header action and ability to take gear off. [Before](evidence/wardrobe.png) · [After](evidence/wardrobe-after.png) | Keeping only the header plus in empty slots would save a row and hide the only available task behind a small icon. |
| Desktop and phone toolbar priority favored presentation over getting game assets out. | Export stays visible ahead of Full screen and Audio when space runs low. More retains the displaced actions. [320 px before](evidence/studio-small-phone.png) · [320 px after](evidence/studio-small-phone-after.png) | Leaving Full screen ahead of Export made the primary deliverable take a trip through More. Removing the shortcuts would also remove useful presentation access. |
| The item Quality section could make item-wide findings look scoped to the currently selected move. | Label the findings across the item, and name the selected move in the one-view fix group. Preserve the facing selector and existing frame descriptions. [Before](evidence/item-qa-before.png) · [After](evidence/item-qa-after.png) | Filtering findings to the selected view would hide information and imply precision for checks that have only an aggregate result. |

## Open items

- Test whether export preferences should be directly editable beside the export target while keeping deliberate defaults, project-folder access, and the existing return path. The two independent passes agreed on context and differed on removing the Settings section. The existing section also manages defaults and a linked project folder, so the current change addresses the compact entry point first.
- The owner’s “one place per job” rule works within a surface. Backup, language recovery, and attention links need context at multiple points. Keep a single destination while testing which shortcuts earn space in More.
- Reproduce the remaining source-only paths with saved or mocked inputs, especially restore review, linked-folder failure, paid and interrupted work, installation, and offline recovery. The coverage table distinguishes those paths from rendered evidence.
- Evaluate separate import copy, creation defaults and Activity hierarchy without removing a supported workflow. Test whether the scope switch in Outfit is understood as a layer-order choice across the slot before considering a different control.
- The baseline gear tip can cover the slot's New button. A left placement exposed New but covered Empty, Steel helmet and its menu in the independent German desktop check. Keep the original placement until a change can preserve the whole row's hit targets.

## Research applied

- Put advanced controls one clear step from their task. Keep the exact prompt in the Prompt tab and let appearance carry the description. [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- Put related settings where the player changes them. Capture scope on the action and use compact menus for contextual operations. [Apple HIG settings](https://developer.apple.com/design/human-interface-guidelines/settings) · [Apple HIG context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus)
- Preserve the labeled trigger, keyboard behavior and predictable focus return when changing controls in menus and dialogs. [WAI-ARIA menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) · [WAI-ARIA modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Keep recovery close to the problem and enable assistive technology to announce status without taking focus. [WCAG 2.2 error suggestion](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html) · [WCAG 2.2 status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- Let the output task determine export options. Figma presents format for the selected work, and Aseprite places sheet layout, layers and frame tags in its sprite-sheet export. [Figma export](https://help.figma.com/hc/en-us/articles/360040028114-Export-static-designs-from-Figma) · [Aseprite sprite sheets](https://aseprite.org/docs/sprite-sheet/)
- Treat a callout and the controls beneath it as one layout test. Check keyboard focus visibility as well as hit targets at the rendered coordinates. [WCAG 2.2 focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)

## Verification

- The lead and both independent reviewers drove the changed paths in T3 preview, using the bundled demo, an editable local copy and seeded offer and Quality states. They checked desktop, phone portrait and short landscape, dark and light themes, English and German, and mouse and keyboard interaction. The full-width stage and 44 px header targets fit at 1440×900, 390×844, 320×568 and 844×390 in the lead's measurements.
- The lead downloaded a generic ZIP, saw the completion toast and reopened the ZIP in Import. A synthetic stopped creation showed its recovery and public-report preview. The report stayed in the local preview.
- The type, locale and format checks passed on Node 24.22.1. Three cases timed out or missed a wait during the initial unit run and passed individually. The final scoped planner pass covered 110 tests.
- Physical touch, screen-reader audio, live paid generation and the remaining source-only paths in the inventory have gaps. Screenshots show states reached with bundled or mocked data.

## Consistency pass

The owner asked for every agent to apply Impeccable's design practices and for controls and styling to be consistent. Two independent audits followed Impeccable's polish, audit, Operate-mode and craft-floor references, one for controls and one for containers, type and feedback. The detector's only findings in `app/src` were TypeScript generics (`Promise<Img>`) read as images.

| Finding | Change | Alternative considered |
| --- | --- | --- |
| Inline notices used a local tinted box (12px text, no stripe) while toasts and a few notices used Bronze's stripe. | Bronze 0.3.16 adds a compact notice (tint, 8px corners, 3px tone stripe, 14px text, 16px icon) and a neutral tone. All 167 inline notices use it, and the local CSS is gone. | Moving the few Bronze notices to the local box would have kept a second notice look outside the theme. |
| Section headings had about seven treatments, partly unstyled `h3` at the browser's 16.38px bold. | A scoped heading reset and one 14px, 600 section-title rule. Sheet titles stay 18px. | Reusing `.bu-section-title` would truncate headings that need to wrap. |
| `rem` sizes on a 15px root landed between steps (16.875px, 14.06px, 41.25px). | Pixel values on the 12/14/16/18 scale; the cost total is 28px. | |
| Sheets had no border while confirm dialogs had the Bronze rim, with different title sizes and 18px padding. | Sheets use the Bronze rim, confirm dialog titles use 18px text, and sheet bodies use 16px vertical padding with 20px horizontal padding above 599px and 16px at 599px or below. | |
| Header icons mixed 16, 18 and 20px in one row; menu command rows mixed plain rows with Bronze actions. | The updated icon-only header actions and view tabs use 20px icons. Share, Export and New character use 16px icons with visible labels and 20px icons when icon-only. The updated menu commands use Bronze actions with 18px icons. | |
| Connect used a legacy 40×24 switch; the custom color picker showed no keyboard focus; disabled Bronze buttons could show the pointer cursor. | Connect uses the Settings switch row; the picker shows the focus ring on its visible chip; the app's pointer fallback applies only to enabled legacy buttons. | |
| Inconsistent capitalization in labels such as "Change Loop", "Frames & Quality" and "(Demo)". | Standardized the affected labels in English and updated translations where casing changes applied. | Kept the existing capitalization of "State" pending a glossary decision. |

Left for a decision or a later pass: whether Move and State are proper nouns in labels; two disclosure styles; the API calls popover's own type scale; the offline banner and stage note outside the toast structure; 13px and 15px text roles; mixed icon stroke widths (1.6 in Bronze recipes, 2 elsewhere); the compact Wardrobe ⋮ target under coarse pointers; uneven side padding from `scrollbar-gutter: stable` (`both-edges` costs phones 15px each side).

## Challenge round

An independent review of the whole branch (simplicity first, readable layouts, minimal text, no regressions) tested the changed journeys at four sizes in both themes. The lead argued each finding before accepting it.

| Finding | Outcome |
| --- | --- |
| The notice migration dropped conditional warning tones (item details, paid review) and left `ProblemNotice` without any notice styling. | Fixed: tone follows the state, and problem notices use the danger compact notice. |
| Connect's priced action scrolled below the fold at 844×390. | Fixed: the purchase line and Connect sit in the sheet's fixed footer; the key link stays in the form. |
| A setup notice with an action squeezed its text into a narrow column on phones. | Fixed in layout: compact notices with an action wrap the action below readable text. The copy stays; it is one sentence with real information. |
| Activity's empty state led with account details, and the session line repeated billing boilerplate the owner had removed elsewhere. | Fixed: "Nothing generating." leads, the session line shows only after spending, and it no longer explains dollar billing. |
| Export's footer said "see export notes" without a way to get there. | Fixed: the note is a link that opens the notes and moves focus to them. Download stays available for deliberate partial exports. |
| A Move window explained a missing standing design only in a summary below the list. | Fixed: each missing row names its reason ("Needs a standing design" or "In progress"), and the summary is dropped when rows say it all. A link to item details was rejected for now: shared items have no details window. |
| The Wardrobe tip says "Use + on a slot" and can overlap search in short landscape. | Kept: the tip anchors to a slot's +, so the copy matches; the overlap is the existing open item on tip placement. |

## Owner follow-ups

| Question | Decision |
| --- | --- |
| Why can't Walk generate the demo copy's Wizard hat, and should it be blocked? | Posing an item onto a move starts from its saved standing design (`dressed`). Items made in the app keep it; demo copies, older imports and some shared copies do not, so nothing can be posed. Generate items now stays visible and disabled with that reason, and the row offers Make it again…, the existing priced remake also used by the stage note (`remakeItem.ts`). Rejected for now: rebuilding the reference offline from the existing standing art (free, medium work, still no north view for the demo) and a prompt-only inpaint route (larger, more view drift). A combined "standing plus move" offer is the next step if it comes up outside demo copies. |
| Where does Get Secret API key belong in Connect? | In the footer, right-aligned before Connect: secondary then primary, as in other sheets. A pending purchase's note takes its own row above both. |
