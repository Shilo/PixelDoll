# Prompt suggestions: defaults, customization and Settings

Status: approved design (owner direction plus Sol and DeepSeek brainstorm, 2026-11-21).

## What exists today

- `app/src/studio/PromptSuggestions.svelte`: ghost pills under a prompt box. Props `suggestions` (`{ id, label, prompt }`), `label`, `value`, `active` (templates), `limit` (More pill), `onpick`.
- Data lives in three places: item ideas per slot profile in `app/src/studio/slots.ts` (`COPY[profile].ideas`, `label` = English prompt, `caption` = localized title key), State pose and character look ideas in `app/src/studio/promptIdeas.ts`, and move templates in `MoveSheet.svelte` (`TEMPLATE_ORDER`, `options`, `moveTemplatePrompt` from `moveAnimationOptions.ts`; a template also sets the move id, loop and frames via `chooseAction`).
- Settings has creation pages Characters, Moves, States and Items (`app/src/studio/CreationSettings.svelte`, `creationSettings.ts`, sections in `SettingsContent.svelte`), stored per page in `localStorage['pixeldoll.creation.<section>']`, with Reset per page and in General (`resetSettings.ts`, `settingsDefaults.svelte.ts`).

## Decisions

1. **Name.** UI: "Prompt suggestions". Code: `promptSuggestions`. Pill group labels stay as they are (Ideas, Move templates, Pose ideas, Look ideas).
2. **Pills wrap indefinitely.** Remove `limit` and the More pill from `PromptSuggestions.svelte` (and the `common.more` key if it becomes unused). Every suggestion shows; the row wraps.
3. **One global defaults file**, `app/src/studio/promptSuggestionDefaults.ts`, the only place the owner edits default titles, prompts and order (most commonly useful first). Lists:
   - `character.look`, `state.pose`, `move`, and `item.<profile>` for every slot profile in `slots.ts` COPY (custom slots use their profile's list, as `categoryCopy` does today).
   - Entry: `{ id, titleKey, prompt }`, with a stable slug `id` that never gets reused for a different suggestion (item ids such as `head.knightHelmet`, no longer the prompt text). Move entries add `action` (the template id) and take their default prompt from `moveTemplatePrompt(action)`; keep the existing English prompts and title keys unchanged.
   - Move the data out of `slots.ts` ideas and `promptIdeas.ts` (delete what becomes dead). Locale keys may stay where they are.
4. **Prompts are English and never localized. Titles are localized only when they come from the catalog** (`titleKey`). Anything a user types is literal text, even if it happens to look like a key. Move titles may keep the current display name for the move (`nice`/`displayMove`) when no key exists.
5. **User customizations: a sparse diff, global, in `localStorage['pixeldoll.promptSuggestions.v1']`.** This implements the owner's rule "empty means use the app's default" without storing empty sentinels:
   ```ts
   type StoredList = {
   	order?: string[]; // only after the user reorders
   	edits?: Record<string, { title?: string; prompt?: string }>; // built-in ids only
   	added?: { id: string; title: string; prompt: string }[]; // ids "u_<random>"
   	removed?: string[]; // built-in ids the user deleted
   };
   type Stored = Partial<Record<ListKey, StoredList>>;
   ```
   - **Saving a built-in field:** trim it. If it is empty, or equals the current default (the title compared with the localized default title in the current language, the prompt compared exactly), omit the field, so it keeps tracking the app's default after updates. Drop an `edits` entry once both fields are omitted, and drop a list once it is empty.
   - **Effective list:** defaults; apply edits field by field; drop `removed`; order by `order` for ids that still exist, inserting built-ins missing from `order` at their default rank (after their default predecessor), so a new default lands near its intended place; then append `added`. Without `order`, use catalog order followed by `added`. Editing or deleting alone never writes `order`.
   - **Removed defaults** (gone from the catalog in an update) are skipped; their stored edits stay dormant. Ids are never recycled.
   - **Added suggestions** need a non-empty prompt; an empty title falls back to the first words of the prompt.
   - **Unreadable storage** (corrupt JSON or blocked access): show defaults and a visible notice in the Settings editor; never crash. Sync across tabs with the `storage` event.
   - Put the merge and save rules in a DOM-free module (for example `promptSuggestions.ts`) with unit tests.
6. **Settings UI: one reusable editor**, `PromptSuggestionsEditor.svelte`, on each creation page: Characters (`character.look`), Moves (`move`), States (`state.pose`) and Items (with a slot-profile picker above the editor, showing one list at a time instead of all 17 lists).
   - **Each row:** a single-line Title input and a multi-line "Prompt (English)" input. Both always show the effective text, never a raw key or an empty default.
   - **Row actions:** Move up and Move down buttons (accessible, keeping focus on the moved row) and Delete.
   - **List actions:** Add suggestion, and Restore defaults for the current list.
   - **On phones:** stack the title over the prompt, with the actions in a row below.
   - **Saving and Reset:** autosave valid edits. The creation page's Reset clears that page's suggestion lists, and General's Reset all clears them all; wire this into `resetSettings.ts` and `settingsDefaults.svelte.ts` the way main's creation settings do.
   - **Appearance:** use existing Bronze UI classes and the creation pages' existing layout; no new local appearance beyond layout.
7. **Moves.**
   - **Built-in templates:** keep their `action`, so picking one still sets the move id, loop and frames. Their title and prompt are editable.
   - **An edited built-in prompt:** picking the template applies it and then fills the edited prompt. Under the existing rule, text that differs from the template's prompt makes it a described move. Show a one-line hint in the Moves editor saying so.
   - **User-added move suggestions:** have no action. Picking one clears any applied template and fills the prompt, like typing a custom move.
   - The template filters stay: no moves the character already has, no reserved moves, no Ride.
8. **Consumers:** all four sheets read their effective list through one reactive function (for example `promptSuggestions(listKey)`), so a Settings change shows on the pills at once.

## Tests

- Unit tests for the merge and save rules:
  - empty or default-equal fields are omitted;
  - localized default titles compare correctly;
  - deletes and adds;
  - order with new defaults inserted at their rank;
  - removed defaults;
  - corrupt storage.
- E2E tests:
  - Editing a suggestion's title and prompt in Settings changes the pill and what it inserts.
  - Add, delete, reorder and Restore defaults work in the editor.
  - Page Reset clears that page's lists.
  - Update the existing tests that rely on More or on the old data.
