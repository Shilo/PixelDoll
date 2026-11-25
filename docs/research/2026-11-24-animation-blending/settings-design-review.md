# Review: where "Moving attack layers" belongs

Date: 2026-11-24. Read-only review of the proposal to move the Export sheet checkbox into Settings > Export as a persisted global preference. No code, board or paid changes.

Verdict: move it, as a global persisted preference, but only together with a read-only row in the Export sheet's Current settings. Without that row the proposal is worse than today, because it removes the only place the option is disclosed. The existing "Settings" button in the Export sheet already lands on this exact page and Back to Export preserves the session, so the discoverability cost is one click, not a lost feature.

## 1. Is Settings > Export the better home?

Where the current placement wins:

- It is the moment of decision. The control sits above the notes and next to the target cards (`app/src/studio/ExportSheet.svelte:945-958`), so the user sees the option, its hint and the rebuilt ZIP size together. The hint already says it uses the character's Live move and waist even when Live attacks are off, and that it adds files to the ZIP.
- The effect is character-dependent. `currentLiveLayering(doc.id)` and `currentLiveClips(doc.id, ...)` read per-character choices (`app/src/studio/ExportSheet.svelte:535-544`), and eligibility is data-gated: no hips or no qualifying pairs means no fragments (`app/src/lib/export/sheets.ts:181-186`). A one-line global switch hides that the bytes depend on who you export.
- It is engine-dependent. Only Phaser, GDevelop, Godot and Unity consume `actionLayers` (`app/src/studio/ExportSheet.svelte:161`, enforced again in `app/src/lib/export/export.ts:171-182`). Hiding the control for other targets was honest.
- Cost is real but bounded: +87,632 bytes (+7.9%) on the real Bonequin Phaser ZIP, nothing for characters without tracked hips (`IMPLEMENTATION-REPORT.md:91-92`).

Where the proposal wins, and why it wins overall:

- The "Settings" view is not a different sheet. `Studio.svelte:404-407` keeps the ExportSheet instance mounted when `settingsNavigation.fromExport`, and `ExportSheet.svelte:798-825` renders SettingsContent inside it. Back to Export restores the prepared ZIP and per-session choices; the existing E2E proves this for the RPG walk choice (`app/test/e2e/export-picker.spec.ts:3937`). So the control moves one click away, with the same session, not to another flow.
- Artifact-shaping preferences already live there. `dressedCharacterSheets` and `playOnce` are global, persisted and shown read-only in Current settings (`ExportSheet.svelte:1065-1088`). Adding files is exactly the class of decision this page owns.
- Settings search only finds what the index knows (`SettingsContent.svelte:226-243`). A preference that exists only inside Export is unreachable from Ctrl+, and invisible to anyone browsing settings.

What would change my mind: dropping the summary row, or making the Settings control conditional on the *default* target. Either turns relocation into a hidden global that silently bloats later ZIPs.

## 2. Scope: global, per character, per export, or default plus override?

Global, persisted in `ExportSettings`, with no per-export override.

- Per character is the tempting alternative because waist and Live choices already are. Reject it: eligibility is already decided by the character's data, so a per-character switch adds a field, a new place to set it and a second explanation, for a failure mode (no hips) the pipeline already handles by producing nothing.
- A per-export override creates two sources of truth for one bool, while the sheet's engine picker already persists globally (`ExportSheet.svelte:405-407`). "I changed it for this export and it changed everywhere" is the existing contract; do not invent a second one.
- Document the asymmetry instead: the per-character Live switch does not gate export, deliberately (`IMPLEMENTATION-REPORT.md:78`, the "explicit export inclusion" fix). The new global switch must not re-couple them.

## 3. If moved: show it read-only, never hide it

Show it, in the Current settings `<dl>` (`ExportSheet.svelte:1070-1087`), only when `supportsActionLayers`, as a label plus state ("Included" / "Not included"). No second checkbox, and no extra link: the sheet header already has the Settings button, which opens the page holding the control. That is the simplest honest UI. A duplicate control would need optimistic-save handling, focus restoration and cross-view sync for no gain.

## 4. Implementation risks

- Existing records. `checkedSettings` rejects any record that lacks a required boolean (`app/src/lib/store/export-settings.ts:65-89`). Requiring the new field makes every current user's settings invalid, showing "Saved export settings could not be read" and forcing a Reset that discards `playOnce` and `dressedCharacterSheets`. Read an absent field as `false` and keep the rest; absence is unambiguous for a field that never existed.
- Change union. The final `else` in `saveExportSetting` currently means `dressedCharacterSheets` (`export-settings.ts:132-136`). Add an explicit `{ actionLayers: boolean }` branch with a type check, and a test that a non-boolean throws.
- Default detection. `isDefaultExport` compares three fields by hand (`settingsDefaults.svelte.ts:90-97`). Miss the new one and Reset stays enabled after resetting, and `settingsAtDefaults('export'|'all')` lies. `resetSettings.ts:81-89` then covers the write.
- Pipeline source. Delete `includeActionLayers` (`ExportSheet.svelte:159`) and read `preferences?.actionLayers ?? false`; keep the `supportsActionLayers` gate so an unsupported target never mutates or applies it. The build effect already waits for `ready` (`ExportSheet.svelte:521-544`).
- Save failures and toasts. Nothing new if the control stays inside the snippet: `persistSettings` rolls back a non-radio input and shows `saveError` via `preferencesStatus` (`ExportSheet.svelte:398-466, 681-709`). Wire it through `changeSetting` so focus restoration works.
- Cross-tab. `subscribeExportSettings` and the sheet's focus/visibility refresh already propagate it (`export-settings.ts:29-53`, `ExportSheet.svelte:321-383`). No new channel.
- Two render sites. The snippet mounts standalone through `SettingsSheet.svelte:53-61` (embedded ExportSheet) and inside ExportSheet's settings view. Keep all state in the store and the host component; do not copy the control per view.
- Conditional support. Gate the summary row on the visible target. Do not gate the Settings control on the stored default; name the four formats in the hint instead.
- Localization. Two new value keys plus a hint revision across ten catalogs (`app/src/locales/`), reviewed per `TRANSLATING.md`; `npm run check` runs `svelte-whisper check --usage src`. This is the largest hidden cost of the summary row.
- Accessibility. Reuse the `export-dressed` label pattern (`ExportSheet.svelte:747-764`) with `aria-describedby` on the hint; add `data-setting="action-layers"` and an index entry so search and focus land there.
- Tests today. No E2E touches this control; only pipeline unit tests exist (`live-layering.test.ts`, `export-phaser.test.ts`, `gdevelop-export.test.ts`).

## 5. Plan

1. `app/src/lib/store/export-settings.ts`: add `actionLayers: boolean` (default `false`) to `ExportSettings`, `defaultExportSettings`, `checkedSettings` (absent reads `false`), `ExportSettingChange` and `saveExportSetting`, with an explicit branch.
2. `app/src/studio/settingsDefaults.svelte.ts`: include it in `isDefaultExport`.
3. `app/src/studio/ExportSheet.svelte`: remove the sheet-body block at 945-958 and `includeActionLayers`; add the control to the snippet after dressed sheets with `data-setting`; add the summary row when supported; build from `preferences.actionLayers`.
4. `app/src/studio/SettingsContent.svelte`: index entry for search and focus.
5. Locales: value keys and the revised hint in all ten.
6. Tests: unit in `export-settings.test.ts` (default, absent-field read, save preserves the other fields, non-boolean rejected); extend `export-picker` "global Export choices survive a browser restart..." (set it from Settings via the sheet's Settings button, Back to Export, summary reflects it, survives restart and character switch) and the reset test; assert the row disappears for Aseprite. Skip a ZIP-fragment E2E: the demo has no hips and the pipeline is unit-proven.
7. Run from `app/`: `npm run check`, `npm test -- export-settings`, `npm run e2e -- export-picker -g "global Export choices|reset preserves"`.

I would refuse: a per-export override, a second checkbox in the sheet, hiding the row when off, requiring the field (data loss), defaulting it on, tying export to the Live switch, or editing the checkbox in the sheet while Settings also edits it.

## Implementation follow-up

Implemented as recommended, with two wording changes after the independent implementation review: the summary shows `On`/`Off` rather than `Included`/`Not included` because a supporting engine can still produce no fragments for a character, and the hint now names Phaser, GDevelop, Godot and Unity. The global preference, summary gate, search entry and tolerance for older records are unchanged. See [IMPLEMENTATION-REPORT.md](IMPLEMENTATION-REPORT.md).
