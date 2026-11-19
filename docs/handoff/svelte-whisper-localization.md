# Handoff: localize PixelDoll with svelte-whisper (10 languages)

Status: original implementation brief, November 18, 2026. This is not a status report or a direction to restart implementation. See the [localization tracking card](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=299807644) for current progress and remaining verification.

Audience: an AI agent (or developer) working in this repository. PixelDoll has no localization today: every user-facing
string is hard-coded English. Your job is to add the `svelte-whisper` library, move all user-facing text into locale
files, and ship the app in ten languages. Follow this repository's `AGENTS.md` throughout (board card first, commands
from `app/`, `npm install -E`, Prettier, the testing policy); this document adds to it and does not replace it.

The owner will not proofread translations. Translation quality is your responsibility: section 8 says how to check it.

File and line references were checked against this checkout on 2026-11-18. Lines move; search for the name.

## How to run this work

The owner's instruction: this work is critical and is done by a full team, not by one agent. You lead the team:

| Team member | Setting |
|---|---|
| Sol 6.2 | medium |
| Opus 5.5 | medium |
| DeepSeek 4.1 Flash | low |

- **Research before the first edit.** Have the team read this document, the library's `llms.txt` (section 3) and the
  code this document names, and challenge the plan. Settle a disagreement with evidence (a compile, a test, a run
  in the browser), not by vote. Where this checkout contradicts this document, the checkout wins; say so in your
  report.
- **Review everything.** Each milestone (section 10) gets a code review from a team member who did not write it.
  Every message in every language is read by a model other than the one that translated it (section 8, step 4),
  and the third model settles what the two disagree on. Keep going until no reviewer has an open objection: an
  objection is closed by a fix or by evidence, never by silence.
- **Test in the T3 Code browser as well as with the automated suites,** visually and functionally, in all ten
  languages (section 9). Passing tests alone do not prove this work.
- **Done means no open concerns:** every message correct, every language working. What you could not verify is
  listed in your report as not verified (section 12), not left out.

## 1. What done looks like

1. A user whose browser prefers any of the ten languages sees the Studio in that language the first time it
   renders, and can switch language from the app. The choice is remembered. (Messages shown before the Studio
   mounts stay English by design: section 4, step 3.)
2. English is part of the startup bundle, so there is always text to fall back to; the nine other languages are
   lazy chunks, and the page normally downloads only the one in use.
3. English users see exactly what they see today, down to number precision and grouping. The existing end-to-end
   suite passes with setup changes only.
4. `svelte-whisper check --usage src` exits 0 and runs as part of `npm run check`, so a missing translation, a
   placeholder mismatch or a `t('…')` call with no message fails CI.
5. Nothing that leaves the app, or is stored, changes with the language: requests to PixelLab, exported
   spritesheets, manifests and file names, and saved data are what they are today (section 6).
6. Every message in each of the ten languages has been read in context by a second reviewer and seen working in
   the browser (sections 8 and 9), and no reviewer has an open objection.

## 2. Decisions already made

| Decision | Value |
|---|---|
| Library | `svelte-whisper` 2.1.1, installed from GitHub (it is not on npm): `npm install -E github:Shilo/svelte-whisper#v2.1.1` |
| Source language | English, `app/src/locales/en.json`. Every other file mirrors its keys. |
| Locale files | One JSON file per language in `app/src/locales/`. The file name is the locale id. |
| Call style | Plain functions (`t('key')`, `formatNumber(n)`, `getLocale()`). None of the 85 components here is a legacy component (no `export let`, no `$:`), so the `$t` store forms are not needed. Do not convert or restructure components. |
| Fallback | `en`, bundled with the app |

The ten languages, with the ids to use as file names. The owner's reason for the list: a practical balance of
internet reach, creator relevance and support effort, challenged by an independent review; not a proven global ranking.

| Language | Locale id | Name in the picker | Plural forms to write |
|---|---|---|---|
| English | `en` | English | `one`, `other` |
| Spanish | `es` | Español | `one`, `other` |
| Simplified Chinese | `zh-Hans` | 简体中文 | `other` |
| Brazilian Portuguese | `pt-BR` | Português (Brasil) | `one`, `other` |
| Japanese | `ja` | 日本語 | `other` |
| German | `de` | Deutsch | `one`, `other` |
| French | `fr` | Français | `one`, `other` |
| Korean | `ko` | 한국어 | `other` |
| Turkish | `tr` | Türkçe | `one`, `other` |
| Indonesian | `id` | Bahasa Indonesia | `other` |

Why these ids (the matching below was tested against the library):

- `zh-Hans`, not `zh` or `zh-CN`: the library matches the browser's language by language and script. A `zh`,
  `zh-CN` or `zh-SG` browser gets `zh-Hans`; a `zh-TW`, `zh-HK` or `zh-MO` browser (Traditional) correctly does
  not, and gets English.
- `pt-BR`, not `pt`: the text is Brazilian. A `pt-PT` browser still gets it, which is better than English.
- `es` is neutral, international Spanish (no regional slang, `ustedes` not `vosotros`).
- Spanish, Portuguese and French also have a `many` plural category, used for exact millions. Leave it out: the
  library falls back to `other`, which reads correctly.

## 3. What the library does (enough to start)

Read these after installing; they ship inside the package and are written for agents:

- `app/node_modules/svelte-whisper/llms.txt`: the whole API on one page.
- `app/node_modules/svelte-whisper/skills/whisper-setup/SKILL.md`: setup and how to extract text.
- `app/node_modules/svelte-whisper/skills/whisper-translate/SKILL.md`: how to produce and apply translations.
- `app/node_modules/svelte-whisper/skills/whisper-audit/SKILL.md`: how to find missing, unused and broken keys.

Where a skill and this document differ (bundling English, the PWA), this document wins: it is about this app.

```ts
import { t, formatNumber, formatDate, formatPercent, getLocale, setLocale, getLocales, localeName } from 'svelte-whisper';

t('export.title'); // "Export"
t('items.count', { count: 3 }); // plural: picks the form from the language's rules
t('character.named', { name }); // "{name}" in the message is replaced
formatNumber(1234.5); // "1,234.5" in en, "1.234,5" in de
```

- `t()` is reactive. Called in markup, `$derived` or `$effect`, directly or through a function in a `.ts` file, the
  result updates when the language changes. A value computed once does not (section 5, point 5).
- `t()` always returns a string. A key missing from the active language shows the English text; a key missing
  everywhere shows the key itself. Both are reported once, and in `npm run dev` a small overlay lists them.
- The library sets `<html lang>` and `dir` on every switch. Do not set them by hand. `index.html` keeps `lang="en"`
  as the value before scripts run.
- It is client-side only and keeps its state in the module, which fits this app (no SvelteKit, no server rendering).

## 4. Setup in this repository

Facts checked in this checkout: Svelte 5.57.3, Vite 8.3.6, `@sveltejs/vite-plugin-svelte` 7.3.1, strict TypeScript 6,
Vitest 4 with `environment: 'node'` and no Svelte plugin in `app/vitest.config.ts`, Playwright end-to-end tests, a
hand-written PWA build (`app/pwa-build.ts`, `app/pwa-worker.js`), a strict Content-Security-Policy in
`app/index.html`, and startup in two steps: `app/src/main.ts` imports `app/src/bootstrap.ts`.

1. **Install** from `app/`: `npm install -E github:Shilo/svelte-whisper#v2.1.1`, and commit the lockfile. No Vite or
   Svelte configuration is needed: the package is a `.svelte.js` module that the existing Svelte plugin compiles, in
   dev and in production.
2. **Create `app/src/locales/en.json`** (start small; it grows as you extract text) and `app/src/lib/i18n.ts`:

   ```ts
   import { addDictionary, init, registerLoader } from 'svelte-whisper';
   import en from '../locales/en.json';

   export function setupI18n(): Promise<void> {
     // English is bundled: it is the fallback, so the app has text even when a language file cannot be fetched.
     addDictionary('en', en);
     // Every other language is its own lazy chunk. The single `*` does not match files in sub-folders (glossary/).
     registerLoader(import.meta.glob(['../locales/*.json', '!../locales/en.json']));
     return init({ fallback: 'en', persistKey: 'pixeldoll.locale' });
   }
   ```

   - Bundle English as shown. Without it, a first load where the language file fails to download shows raw keys
     (`export.sheet.title`) instead of English. This was tested.
   - The storage key follows the app's existing `pixeldoll.*` names. Only a language the user picks is stored; a
     detected one is not.
   - `init` does not throw when a language cannot be loaded. It tries the saved choice, then the first browser
     preference the app has, then English, so a failed download can lead to a second attempt before the app opens
     in English. `setLocale` can be tried again later.
3. **Await it before the app mounts,** in `app/src/bootstrap.ts`, so the Studio's first render is already in the
   right language. Start it alongside the queue startup and await both before mounting. For a non-English user the
   mount then waits for a language chunk (normally one); on a slow connection that is a real delay, and it is the
   price of not flashing English.
   - Detection walks the browser's whole list of preferred languages, in order, and takes the first one the app
     has. A browser set to `zh-TW` alone gets English; `zh-TW` followed by `ja` gets Japanese.
   - Text shown before or instead of the Studio cannot use the library, because it is not loaded yet: the startup
     message in `index.html`, the "could not finish loading" message, its Reload button and the "open in its own
     tab" link in `main.ts`, and the "could not open your saved work" message in `bootstrap.ts`. Leave these in
     English.
   - The dev-only pages (`item-trial.html`, `motion-lab.html`, `app/src/ui/`) are not translated, but some import
     Studio components (`ui/TopBar.svelte` uses `studio/ApiPeek.svelte`). Call `await setupI18n()` in their entry
     points too, or those components show raw keys there.
4. **Typed keys.** Add `app/src/whisper.d.ts` so keys autocomplete and a mistyped key is a compile error, which
   `npm run check` then catches. It compiles under this app's TypeScript options as they are:

   ```ts
   import type en from './locales/en.json';

   declare module 'svelte-whisper' {
     interface Register {
       dictionary: typeof en;
     }
   }
   ```

5. **Content-Security-Policy:** no change. Locale chunks are same-origin scripts, and the dev overlay's inline
   styles are already allowed.
6. **Add the check to `npm run check`** in `app/package.json`: `svelte-whisper check --usage src`. Know exactly
   what it does and does not guarantee:
   - It fails on: a key missing from, or extra in, a language file that exists; placeholders that differ from the
     source (compared across a whole plural message, not form by form); a message that differs from its glossary
     entry; and a literal key written directly inside `t('…')` that has no message.
   - It does not fail on: unused keys, or a translation identical to the English (both are only listed); a language
     file that does not exist at all; a key passed in a variable. Plurals are compared as whole messages: the check
     can notice a missing form or a lost `{count}` indirectly, but it does not validate each form. Check these
     yourself before you call the work done: nine target files exist, and every plural has the forms in the table
     in section 2, each with its `{count}`.
   - The locale files must also pass Prettier: after `svelte-whisper apply` or `sync`, run
     `npx prettier --write` on the locale files it changed.
7. **Language picker.** There is no preferences screen today; the only preference control is the light/dark switch
   (in `studio/Welcome.svelte`, and wherever else it appears). Put the language control beside that switch, in every
   place the switch appears, and follow `DESIGN.md` and the bronze-ui theme for its look. Take the list of
   languages from `getLocales()`, so a new locale file appears by itself:

   ```svelte
   <script lang="ts">
     import { getLocale, setLocale, getLocales, localeName } from 'svelte-whisper';

     // Each language under its own name; these are not translated. The names are in the table in section 2.
     const NAMES: Record<string, string> = { en: 'English', es: 'Español' /* … */ };
   </script>

   {#each getLocales() as id (id)}
     <button aria-pressed={getLocale() === id} lang={id} onclick={() => switchLanguage(id)}>
       {NAMES[id] ?? localeName(id)}
     </button>
   {/each}
   ```

   - Language names need no translation keys: each is shown in its own language. `localeName(id)` returns that
     name from the browser, but the result varies (one browser gives 简体中文 for `zh-Hans`, another 中文（简体）,
     and Spanish, French and Portuguese come back lower-case), so the fixed list uses the exact names from the
     table and `localeName(id)` covers a language added later.
   - Put `lang={id}` on each option so the browser picks the right font for each name.
   - `switchLanguage` is yours to write. It awaits `setLocale(id)`, which resolves `true` once the language is
     active and `false` when its file could not be downloaded or a newer choice replaced this one. While it is
     pending, show that a switch is in progress; on a failed download, leave the control on the active language and
     tell the user.
   - A component with no runes in it, like this snippet, still updates on a language switch with this app's
     settings (mounted and checked on Svelte 5.57.3, in dev and in a production build). A component does not
     update if it uses legacy syntax: `export let`, `$$props`, `$$restProps`, or any labelled statement at the top
     level of its script (`$:` is one). This app has none today; if one appears, it writes `$t(…)` instead.
   - The snippet shows only the calls. Use the app's own controls.

## 5. Moving text into the locale file

Work through `app/src/studio/` and the shared components and modules it uses. For every string a user can see or
hear: visible text, `placeholder`, `title`, `alt`, `aria-label`, toasts, confirmations, validation and error
messages, empty states, the help content and PWA notices.

1. One key per message, grouped by screen or feature, camelCase: `export.sheet.title`, `connect.token.placeholder`.
   Reuse a key only when the meaning is the same everywhere it appears: "Save" on a button and "Save" as a noun are
   two keys in other languages.
2. **One sentence, one key.** Never join translated fragments or insert a translated word into another sentence:
   word order, gender and case differ. `` `Delete ${name}?` `` becomes `"Delete {name}?"` with
   `t('delete.confirm', { name })`. A real case here: `studio/generationStatus.ts` builds
   `'~' + Math.ceil(…) + 'min left'`; that becomes one plural message with `{count}`.
3. **Counts use plurals:** `"items": { "one": "{count} item", "other": "{count} items" }` with
   `t('items', { count })`. No `count === 1 ? … : …` in code.
   - **Every category form (`one`, `other`) keeps `{count}`.** In French and Brazilian Portuguese `one` also
     covers 0 and 1.5, so "One item" in the `one` form would be shown for zero. The check does not catch this.
   - A special message for zero uses an exact `"0"` key, which wins over the category and needs no `{count}`:
     `{ "0": "No items", "one": "{count} item", "other": "{count} items" }`.
   - For a formatted number inside the sentence, pass it as a second placeholder:
     `t('items', { count, n: formatNumber(count) })`.
4. **Numbers, money, percentages and dates the user reads** go through `formatNumber`, `formatPercent` and
   `formatDate`, never `toLocaleString()`, `toFixed()` or hand-built strings. Real cases: costs written as
   `` `$${usd.toFixed(3)}` `` and "gens" in `ActivitySheet`, `ApiPeek`, `GenCard` and `GenerationDetails`, and
   `toLocaleString(undefined, …)` in `GenerationDetails` (`formatDate`). Choose options that reproduce today's
   English output exactly, call site by call site: `toFixed(3)` prints `$1.200` and `$1200.000`, so the options
   need the same precision and no digit grouping
   (`{ style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false }`),
   not the currency defaults of two decimals and grouped thousands. Leave alone the `toFixed` calls that round a value for a request or a
   calculation (`studio/create.ts`, `studio/apiPlans.ts`): nothing there is displayed.
   - A list of things inside a sentence (`wearing.join(', ')` in `studio/Stage.svelte`) is formatted with
     `new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(items)` and passed as one placeholder.
5. **Text computed once does not update.** A module-level `const labels = { walk: t('moves.walk') }` is evaluated
   before the language is known and never again. Store keys, and call `t()` where the text is shown:
   `const moves = [{ id: 'walk', label: 'moves.walk' }]`, then `{t(move.label)}`; or make it a function, or
   `$derived`. The same goes for default values of `$state` and for anything built in a class constructor.
   - Type a field that holds a key as `WhisperKey` (exported by the library), not `string`: with typed keys,
     `t(move.label)` does not compile otherwise.
   - `check --usage` reads the code as text. It validates a key written as a literal directly inside `t('…')`; a
     key held in data and passed in a variable is not validated there, so a typo in such a key is caught only by
     the `WhisperKey` type. Keep those fields typed.
6. **Never store translated text.** Data saved to storage, put in a manifest or kept in app state holds ids and
   keys; the text is produced when it is displayed. Otherwise a character saved in German shows German labels to an
   English user forever, and exports differ by language. Section 6 lists where this app does it today.
7. **Pure modules return a key and values, not a sentence.** `studio/generationStatus.ts` returns `{ text, detail }`
   prose that unit tests assert, and `deletionBlocked()` / `moveDeletionBlocked()` return prose too. Change these to
   return the key and its variables (`{ key: 'status.minutesLeft', vars: { count } }`); the component calls
   `t(key, vars)`, and the unit test asserts the key. This also keeps `svelte-whisper` out of unit-tested modules
   (section 9).
8. **Errors the user sees.** Messages thrown in `app/src/lib/` reach the screen through `e.message`
   (`bodyCutVariantLimit`, `lib/items/items.ts`, `lib/equipment/compatibility.ts`, `lib/store/import.ts`; shown in
   `ImportSheet`, `ExportSheet`, `DeleteSheet`, `ActivitySheet` and `studio/download.svelte.ts`). Throw an error
   that carries a key and its variables; keep the English `message` for logs; translate where it is displayed.
   The same applies to messages that are returned instead of thrown: export validation in `lib/export/export.ts`
   (`invalid.push('Pixels per unit must be…')`), the update error shown by `studio/PwaNotice.svelte`, and ledger
   errors.
   - Easy to miss, because they live in data or are built in script: the setup steps in `studio/setup.ts`
     (`SETUP_STEPS` labels), and the direction captions and the long accessible label assembled from fragments in
     `studio/Stage.svelte` (`…, facing ${d}, wearing …`), which must become one message with placeholders.
9. **Case and truncation.** Do not call `toUpperCase()`, `toLowerCase()` or cut text by character count in code.
   Turkish has dotted and dotless i (`i` → `İ`), and Chinese and Japanese have no spaces. Use CSS (`text-transform`,
   which follows the `<html lang>` the library sets, and `text-overflow`).
10. **Keyboard keys.** Keep key names inside the message (`"Press Ctrl+Enter or Cmd+Enter"`, as in
    `NewItemSheet.svelte`), so each translator writes what their keyboards print: German keyboards say `Strg` and
    `Entf`. `Cmd` / `⌘` stays.
11. **Sorting and searching** text the user reads: use `localeCompare(other, getLocale())`, not `<` or a plain sort.

## 6. What must stay the same in every language

This app generates images from text and exports files for game engines. Getting this section wrong produces bugs
that look like PixelLab or engine problems, not translation problems. The rule in every case: **keep the English
constant as the value; translate only what is displayed, looked up by id.** `OUTLINES` / `DETAILS` in
`studio/characterConfig.ts` already separate value from label; that is the pattern to copy.

**Sent to PixelLab**

- `studio/characterConfig.ts`: `TRAITS` labels and options, and `UNSET`. They are shown to the user, written into
  the prompt as lines such as `Kind: Elf` (`writeTrait`), and read back out of the prompt by `recognized()` /
  `readPrompt()`; `'Not set'` is compared as a value. Translating the constants breaks generation and parsing.
  Display them through keys (`traits.kind.label`, `traits.kind.options.elf`). The same goes for `DIRECTION_LABELS`
  and `PRESETS` labels.
- All prompt templates, item and move descriptions, style words, parameter names and enum values stay exactly as
  they are, whatever the interface language. Text the user types is sent as typed.
- The idea chips in `studio/NewItemSheet.svelte` put their label straight into the prompt
  (`prompt = idea.label`). Give each idea a translated caption for the chip and keep inserting the original English
  text.
- The request content shown in `ApiPeek` / `ApiPreview` is the request: never translate it.

**Stored, compared or exported**

- `LABELS` in `lib/items/slots.ts` becomes the stored `slot.label`, which is exported (`lib/export/generic.ts`) and
  compared for duplicates (`lib/equipment/compatibility.ts`).
- `materialNames()` in `lib/dress/dress.ts` produces `Material.label`, which is exported.
- Default names: `'Base'` (`studio/create.ts`), `` `Outfit ${n}` `` (`studio/Outfits.svelte`), `'My character'` and
  names derived from the description or kind (`studio/CreateSheet.svelte`), `'Base body'` and the other defaults
  given to imported data (`lib/store/import.ts`).
- **Copy JSON** in `studio/GenerationDetails.svelte` builds its `settings` object from display labels
  (`[s.label, s.value]`). Give settings a separate display key; the copied JSON keeps today's keys and values.
- Error text that is compared or kept: the queue in `lib/pixellab/queue.ts` tests `err.message === 'no API key
  set'` and stores `r.error = err.message` in the ledger. Keep the stored and compared text as it is; translate
  at display from a code or kind.
- `'Adventurer (demo)'` (`studio/state.svelte.ts`) must keep its suffix: `fileSlug` matches `/\(demo\)/`.
- `` `${it.name} under ${over.name}` `` (`lib/compose/compose.ts`) ends up in exports.
- Job labels in `studio/apiPlans.ts` (`'Dress standing views'`, …) are stored in the ledger and asserted by
  `test/e2e/studio.spec.ts`. Keep the stored label English; translate at display from a kind or id.
- Spritesheet and manifest contents, JSON keys, layer, slot, move and direction ids, file names, and numbers
  inside files. Use `String(n)` / `JSON.stringify` there, never the formatters: `1.5` must not become `1,5` in a
  German user's manifest.

Keep saved and exported default names exactly as they are, and do not change the storage format. Translate only
display labels that existing metadata already identifies (an item whose id says it is the base body, for example).
Whether a new character or outfit should get its default name in the user's language is a product decision: raise
it in your report.

**Used by code or tests**

- `data-*` attributes, ids, storage keys, CSS classes.
- An `aria-label` that code or a test uses as a selector: `ApiPeek.svelte` focuses
  `[aria-label="Close API calls"]`. Translate the label and change the selector to something that does not depend on
  text (a `data-*` attribute or a bound element), in the same change. Search for other cases.

**Never decide anything by matching English text.** Whether a name is a generated default, whether an error is a
known one, whether a line of a prompt is a trait: test an id, a flag or a code. Where the code does it today
(`/\(demo\)/`, `'no API key set'`, `'Not set'`), leave the English constant alone.

**Left in English on purpose**

- Brand and product names: PixelDoll, PixelLab, Godot, Phaser, Unity, Aseprite, GitHub, model and tool names
  (`skeleton-v3`, `inpaint-v3`, …), file extensions. List them in `TRANSLATING.md` (section 8).
- Messages that come from PixelLab's API. Where the app recognises an error by status or code, show its own
  translated message; show an unrecognised message as received.
- `index.html` metadata (`<title>`, description, Open Graph) and the startup messages (section 4, step 3).
- Developer-only surfaces: `app/src/ui/`, `item-trial.html`, `motion-lab.html`, console logs.

**Two things to raise with the owner in your report, not to solve or track here**

- **Prompts typed in other languages.** `materialNames()` and `readPrompt()` match English words, and nobody has
  checked how PixelLab handles non-English prompts. Whether description fields should say "Describe in English" is
  the owner's decision. Do not spend paid generations finding out unless asked.
- **Export file names.** `fileSlug` (`studio/download.svelte.ts`) and `lib/export/phaser.ts` keep only `[a-z0-9]`,
  so a character named 勇者 exports as `character.pixeldoll.zip` and its Phaser folder becomes `assets/-/`. The bug
  exists today; non-English users will hit it often. Report it; do not fix it in this task.

## 7. Layout, fonts and the PWA

- **Length.** German, French, Turkish, Portuguese and Indonesian usually run longer than English, and a short
  label can double. Chinese, Japanese and Korean are shorter but taller. Fixed-width buttons, tabs, chips and sheet titles
  must grow, wrap or ellipsize without clipping, on a phone as well. Fix the layout, not the translation: do not ask
  for shorter words to rescue a fixed width.
- **Line breaking.** Where long words overflow, `hyphens: auto` helps German compounds (it follows `<html lang>`),
  and `word-break: keep-all` keeps Korean words whole. Keep these local to where they are needed.
- **Fonts.** Check that the interface font (`--bu-font` from `@shilo/bronze-ui`) falls back to system fonts for
  Chinese, Japanese, Korean and the Turkish letters `ğ ş ı İ`. If shared appearance has to change, that is a
  bronze-ui release (see Theme in `AGENTS.md`), not a local override.
- **PWA: precache the locale files with everything else.** `emitPwa` in `app/pwa-build.ts` lists every file in the
  build output with its hash, and the worker's install fails if one is missing; that is how the app can say its
  files are ready for offline use. Leave that as it is: the nine locale chunks are small next to the rest of the
  build, every language then works offline, and neither the build step nor the worker needs a change. The page itself still
  downloads only the language in use; the worker fetches the rest in the background. Check that
  `test/unit/pwa-build.test.ts` and the PWA end-to-end spec still pass with the extra files. (The `whisper-setup`
  skill recommends the same, and describes leaving locale chunks out of the precache as an option for apps with
  many languages. Do not take that option here: it would mean changing `emitPwa`, `staticResponse` and the
  release clean-up, and a first visit followed by going offline would have no language file.)
- **No right-to-left work.** None of the ten languages is right-to-left.

## 8. Translating and checking the translations

Do this once the English extraction is complete (section 10), in this order:

1. Write `app/src/locales/TRANSLATING.md`: who the users are (game developers and pixel artists, many of them
   hobbyists), the tone (plain, friendly, short), what never gets translated (section 6), and the per-language
   rules below.
2. Fix the product's terms per language before translating in bulk, as a term list in `TRANSLATING.md`. At least:
   paper doll, base body, layer, item, outfit, slot, move, direction, frame, rig / skeleton, pivot, palette,
   spritesheet, manifest, token. Use the words each language's game-art community really uses (for example
   スプライトシート, 스프라이트 시트); when a community keeps the English word, keep it.
   - `app/src/locales/glossary/<id>.json` is a different tool: it has the shape of a locale file and pins the
     whole message of a key (the tools write that value over whatever a translator produced, and the check fails
     when they differ). It does not enforce a term inside a longer sentence. Use it for messages that must be exact,
     such as brand names and one-word labels (`"terms": { "layer": "Ebene" }`).
3. Translate with the `whisper-translate` skill, one language at a time: write only the missing keys to a temporary
   file and run `npx svelte-whisper apply <id> <file>`, which keeps key order and removes stale keys. Do not
   hand-edit whole locale files.
4. **Review every language with a second reader** that did not write it (a different model or agent), given the
   English source, the translation, `TRANSLATING.md` and the glossary, and asked to judge it as a native speaker
   using the product: wrong meaning, unnatural phrasing, inconsistent terms, a label translated without knowing it
   is a button or a noun. Apply the fixes. Report anything the two readers disagree on.
5. Where English is ambiguous out of context (`Move`, `Base`, `Frame`, `Export`), say what it is in the key name
   (`moves.addButton`) and in `TRANSLATING.md`; that is where most wrong translations come from.

Per-language rules to put in `TRANSLATING.md`:

- **Address:** the register that mainstream creative software uses in that language, written down once and kept
  throughout. As a starting point: `du` in German, `tú` in Spanish, `você` in Portuguese, `vous` in French, the
  polite imperative in Turkish, `Anda` in Indonesian, です/ます in Japanese, 해요체 in Korean. The second reader
  (step 4) confirms or corrects the choice per language.
- **Nothing attached to a placeholder.** Korean particles (을/를, 이/가, 은/는) and Turkish suffixes (`'i` / `'ı`)
  depend on the inserted word. Write the sentence so none is needed: `"{name} 삭제할까요?"`,
  `"{name} silinsin mi?"`.
- **Counters** in Japanese and Chinese go in the `other` form: `{count}個`, `{count} 个`.
- **French typography:** a narrow no-break space (U+202F) before `; ! ?` and inside « », a no-break space (U+00A0)
  before `:`.
- **Chinese and Japanese** use full-width punctuation (，。：！？) and no space between words.

## 9. Tests

Read `docs/testing/test-performance.md` and the Testing section of `AGENTS.md` before adding an end-to-end test or
changing a test config.

- **End-to-end (Playwright).** Existing specs find things by English text. Pin the browser language so detection
  cannot change it: `locale: 'en-US'` in `playwright.config.ts` and `playwright.experience.config.ts`. A Playwright
  config change is cross-cutting, so it needs one full run (`npm run e2e -- --all`).
  Cover localization by extending an existing spec where one fits, as `AGENTS.md` asks; a new spec file must be
  added to a project's `testMatch` list or it never runs. What to cover, each in a fresh browser context: a
  non-English browser locale shows translated Studio text the first time it renders; the picker switches language;
  a reload keeps the choice; a browser set to `zh-TW` only gets English.
- **Unit (Vitest).** `app/vitest.config.ts` has no Svelte plugin, and the library is a `.svelte.js` module that
  needs compiling, so a unit-tested module that starts importing `svelte-whisper` fails to load
  (`ReferenceError: $state is not defined`; tested). Section 5, points 7 and 8 avoid this: logic modules return
  keys and values, and components call `t()`. Where a tested module really has to import the library, add the
  Svelte plugin to the Vitest config (that alone makes it load; tested) and run the full unit suite. With only
  English loaded, a test asserts English text after `await setupI18n()`, or asserts keys.
- **Numbers in assertions.** French groups digits with a narrow no-break space (U+202F) and several languages use
  no-break spaces around symbols. Do not hard-code a plain space in an expected string.
- **By eye and by hand, in the T3 Code browser,** in each of the ten languages, on a phone-sized and a desktop
  viewport, dark and light: the main Studio flow (connect, create a character, add an item, moves, colors,
  export), every sheet and dialog, toasts and error states.
  - Look for clipped or overlapping text, English left behind, raw keys such as `export.sheet.title` on screen,
    and unreadable glyphs.
  - Use the app, do not only look at it: switch language on each screen while it is open and check that all of it
    changes, including numbers, costs and dates; reload and check the choice is kept; check `<html lang>`; watch
    the console for errors and missing-key warnings; and confirm in the network panel that only the language in
    use was downloaded by the page.
  - Account for every key. Keep a list, per language, of the screens and states you visited. A message that no
    visited screen showed has not been checked: find the state that shows it, or have a reviewer read it against
    the code that displays it.
  - Do not spend paid PixelLab generations on this. Use the app's demo data and the fixtures the end-to-end tests
    use.

## 10. Order of work

One board card (one outcome), delivered in two milestones, each leaving `main` shippable:

1. **Plumbing and English only.** Install, `i18n.ts`, bootstrap, typed keys, the check in `npm run check`, and
   all text moved into `en.json`, including the changes to modules that return or store text (section 5, points 7
   and 8; section 6). No picker yet. The app looks identical. Do not rely on the end-to-end suite alone to prove
   it: with the same fixtures and the export clock frozen (exports carry timestamps), capture request bodies and
   the entries of exported archives before you start, and compare them byte for byte afterwards.
2. **The picker and the nine other languages:** `TRANSLATING.md`, the glossaries, translation, the second-reader
   review, layout fixes, the end-to-end coverage, and the offline check of the PWA.

## 11. Reference implementation

[RG Backpack Planner](https://rgbp.app/) uses the same library. Useful to read, not to copy wholesale:

- `src/lib/i18n.ts`: setup (it loads English lazily; this app bundles it, section 4).
- `src/lib/buttons/LanguageDropdown.svelte`: a picker that lists the browser's language first.
- `package.json` `test` script: `svelte-whisper check --usage src` wired into the checks.
- `src/locales/TRANSLATING.md` and `src/locales/glossary/`: translation rules and fixed terms.

One difference matters: most of that app's components are legacy components (`export let`, `$:`), so it writes
`$t(…)`, `$locale` and `$formatNumber(…)`. PixelDoll has none: write the plain calls.

## 12. Report back

When finished, report: the number of keys extracted, and anything deliberately left in English and why; the
default names that are still shown in English; each module changed to return or store keys instead of text, and the proof
that exports and requests are unchanged; per language, what the second reader changed and what remains uncertain;
layout changes made for long text; the test results (`npm run check`, `npm test`, the end-to-end specs you ran);
what was checked in the T3 Code browser, per language; which team member wrote and which reviewed each part; and
anything not verified.

Library documentation: https://github.com/Shilo/svelte-whisper (README, CHANGELOG). A browser-based grid editor for
locale files, which opens pull requests, is at https://shilo.github.io/svelte-whisper/.
