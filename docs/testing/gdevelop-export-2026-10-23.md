# GDevelop native export and picker verification — 23 October 2026

## Scope and review

Separate agents investigated GameMaker and GDevelop; a third challenged Unreal feasibility, target ordering and picker names.
GameMaker was explicitly deferred by the user after discovery that native compile/run verification needs an uninstalled
modern runtime. Its acceptance criteria are recorded in [TODO](../../TODO.md). No unverified GameMaker exporter or option
is shipped. The [design/research record](../research/native-export-expansion-2026-10-23.md) explains Unreal and the category decisions.

## Native GDevelop verification

Implementation: `app/src/lib/export/gdevelop.ts`; fixtures/unit tests: `app/test/fixtures/gdevelop-native.ts` and
`app/test/unit/gdevelop-export.test.ts`; reproducible engine check: `app/scripts/verify-gdevelop-engine.mjs`.

The official GDevelop **5.6.285** portable release supplied the actual editor-core `libGD` WASM, official web exporter and
GDJS/PIXI runtime. The native importer reads generated `game.json`, and `exportWholePixiProject` compiles the scene and
copies registered PNG resources. The exported game runs in managed Chromium. No stand-in engine or copied runtime logic
is substituted for this check. The desktop Electron executable itself fails during crashpad startup on this machine;
desktop UI interaction and desktop-package deployment are not claimed.

Executed assertions:

- Native Sprite frame pixels switch at the exact 80 ms boundary in an 80/180/100 ms repeated-cell playlist; distinct
  green/yellow markers are checked through PIXI GPU pixel extraction, beyond inspecting the controller's frame number.
- A canonical default sheet intentionally differs from its raw source sheet. The expected blue body and cyan linked hair
  prove original source-ramp recoloring; a second doll becomes red/magenta without modifying the first doll or its source.
- Native Sprite bounds share one pivot: a 2 px body starts at `(319,238)` and a 4 px oversized layer at `(318,237)` when
  the common position is `(320,240)`.
- Per-cell z overrides cross the body correctly; tucked variants replace hair; explicit hide rules and unequipping work.
- A non-looping animation stops at its last frame; unavailable direction requests are rejected; destruction frees owned
  nodes/textures and preserves other dolls. Destroyed controllers are pruned and scene-unload cleanup is registered once.
- Two exports with the same name/item/layer IDs and different frozen-base hashes are merged into **one native scene**
  with eight Sprite objects and two controller events. Both character libraries coexist with distinct identities.

All assertions pass with zero page errors. Generated native project/game, results and screenshots remain under ignored
`app/node_modules/.cache/gdevelop-native-verification/`; downloaded engine/tools remain in ignored caches.

To reproduce from `app/`, provide a local unpacked release and its extracted `libGD` JavaScript/WASM pair:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = '<managed Playwright browser cache if required>'
node scripts/verify-gdevelop-engine.mjs '<portable GDevelop directory>' '<extracted libGD.cjs>'
```

The JavaScript core file and `libGD.wasm` must be beside one another. The script defaults to the ignored local cache paths
used in this audit. It starts only a localhost server and does not download tools, sign in, or contact PixelLab.

## Integrated verification

| Check | Result |
|---|---|
| `npm test` on Node 24.22.1 / npm 11.19.1, native Godot/Aseprite enabled | **313 passed in 36 files**, no skipped tests |
| `npm run check` | Passed, Svelte 0 errors / 0 warnings and strict TypeScript checks |
| Production build and dist guard | Passed; existing main-bundle size advisory remains |
| New picker browser regression | Passed: native radio arrow keys, categories/order, invalid remembered-target fallback, local SVG availability, responsive layouts, real GDevelop ZIP/resources download and zero PixelLab requests |
| Existing Studio browser regression | Passed: original dressing/storage/Godot ZIP flow and desktop/phone/landscape/tablet layouts; **both browser cases passed together in 26.1 s**, exit code 0 |
| Visual QA | Desktop and 390 px phone screenshots inspected; all six named targets and selected-format details remain readable. Icons use local Lucide outlines; phone spacing keeps target names compact. |

The picker groups Godot, Unity, Phaser and GDevelop under **Engines & frameworks**, and Aseprite / PNG + JSON under
**Asset formats**. Essential descriptions remain visible for touch and keyboard users; native hover titles supplement them.
No runtime/application dependency or lockfile change is introduced. No PixelLab requests, paid generations or credentials
are needed for any export verification.
