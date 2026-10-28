# Unity playback verification, October 28, 2026

The installed Unity Editor **6000.4.0f1** exposed two export playback defects in native tests. Both fixes passed **884 native Editor checks** and **700 Windows Mono standalone player checks** on untouched regenerated exports.

## Current evidence

- A fresh minimal project probe ran the installed Editor with `-batchmode -nographics -quit -noUpm` and exited **198**. Its log reports no valid Editor license and zero matching entitlements. This probe does not install project packages or attempt account activation.
- After the user signed into Unity Hub, the same minimal project probe exited **0**, reported successful batch-mode shutdown, and reported neither the missing-license nor zero-entitlement errors. The activation blocker is resolved.
- Fresh `Paperdoll.cs` output from the current exporter compiled successfully against that Editor's real Unity reference assemblies using its bundled Roslyn compiler. The remaining warning is Unity 6.4's deprecation of `Object.GetInstanceID()`. No older Editor version was compiled in this check.
- Native importing and actual Play Mode were subsequently tested using a UI-downloaded ZIP and a separate layered export generated through the real global export settings pipeline. The latter includes a 64 px body, 64 px hair, 64 px and 96 px alternate hats, hides, palette variants, and uneven frame durations.
- The installed Editor includes the required 2D Sprite package and the Windows Mono standalone build module. The isolated test project enables the installed built-in 2D Sprite, animation, JSON serialization, image conversion, and IMGUI modules. No system installation or account change was performed by the test scripts.

Ignored probe artifacts are under `app/node_modules/.cache/native-playback-review/`. License logs are `unity-license-probe/editor-2026-10-28.log` and `unity-license-probe/editor-after-hub-login-2026-10-28.log`; the initial sanitized summary and offline runtime compile results are in `unity-offline-2026-10-28/`. Raw license logs are not committed.

## Activation

The user opened Unity Hub and signed in. No further activation action is currently needed. If activation stops working later, check **Settings > Licenses > Refresh** in the Hub and activate the appropriate license there.

These are [Unity's documented activation steps](https://docs.unity.com/en-us/hub/manage-license). Credentials, serial numbers, and license files should not be sent in chat.

## Native defects and fixes

Unity includes one sample interval after the final object-reference key. The exporter placed a duplicate key at the requested total duration, adding an unwanted interval. A requested 360 ms clip became 380 ms, causing visible loop drift. Setting the clip's stop time alone did not correct its native length.

The importer now places the final hold key one sample before the requested end, and omits that duplicate when the last frame already lasts one sample. Native experiments compared both approaches and the stop-time-only alternative across single-frame, uniform, uneven, one-sample-tail, and prime-millisecond timelines. Only the corrected key placement produced the requested native clip length in all five cases.

Unity's default `Animator.Play` preserves the current time when selecting the same state. The exported wrapper therefore could not replay a completed once animation. It now restarts only the same completed non-looping state. Repeated calls during active once or looping playback preserve progress, so ordinary controllers that select walking every update do not freeze the animation. Selecting a different state still starts that state normally. The native loop flag supplies this behavior; animation names do not imply a playback policy.

The candidate run passed all 417 assertions, including actual Animator boundaries through three cycles and beyond, final-frame holds, replay, active-play continuity, visible layer synchronization, pivots, bounds, hides, palette texture assignment and instance isolation, native importer output, and stable reimport references. This was headless testing: no Unity GPU-rendered pixel comparison is claimed, and no older Editor version was tested.

The final portable verifier passed **884/884 Editor assertions** using untouched exports regenerated after the production fix. Its synthetic export adds single-frame, uniform, one-sample-tail and prime-duration animations to the uneven once/loop timelines. It also imported the fresh UI-downloaded ZIP, SHA-256 `49d63117c00e20db022e261273e6305c7fdbb48db0a40e262d8fd175e1d9c931`. All 15 native duration experiments behaved as expected: five corrected lengths and ten negative controls demonstrating the extra sample in the old construction and the stop-time-only alternative.

The revised fixture also places a 64 px alternate hat before the equipped 96 px hat in the same slot. Native geometry checks use the actual equipped/resolved item, and explicit equip/restore checks verify both sizes, hides and clock continuity.

The same project built successfully as a Windows Mono development player, then passed **700/700 shared runtime assertions** in that player. The player loads the generated prefabs and exported JSON through serialized scene references, so this also verifies that those assets and generated runtime assemblies survive a real build. The Editor run includes 184 additional importer, slice, clip and reimport checks. No native checks failed in the final run.

Final ignored evidence is under `app/node_modules/.cache/unity-export-review/run-5f4Aas/`: `sources.json`, `editor-results.json`, `duration-variants.json`, `native-results.json` (the build/import report), and `player-results.json`. The synthetic archive SHA-256 is `81a61c455ec76170c500b5c7fa3091216a0c2a1ff31649ad958def931e321184`. These machine-local artifacts are not committed; the source verifier recreates them on an activated installation.

The native CLI launch used the agent shell's Node 25.0.0. A separate prepare-only run with the existing repository-local Node 24.22.1 passed and generated byte-identical synthetic and actual UI archive hashes. The native results therefore exercised the same generated exports verified under the pinned generator runtime; no pinned-runtime claim is made for the Node process that launched Unity.

## Reproduction

From `app/`, with an activated Editor installed:

```powershell
node --experimental-transform-types scripts/verify-unity-export.mjs --editor 'C:/Program Files/Unity/Hub/Editor/6000.4.0f1/Editor/Unity.exe' --zip '<fresh Unity export.zip>' --build-player
```

The CLI creates a fresh ignored project under `app/node_modules/.cache/unity-export-review/`, generates six synthetic timelines through the actual exporter, imports optional actual UI ZIPs, runs native Editor playback checks and duration negative controls, and optionally builds and runs a Windows Mono development player with the shared playback assertions. Repeated `--zip` inputs must represent different characters to avoid duplicate exported assembly identities. `--prepare-only` creates the project without launching Unity. `--output` selects a new project directory and refuses to reuse an existing directory. No PixelLab requests occur.

Geometry assertions resolve the actual equipped item and any runtime-derived variant, so multiple accepted items in one slot do not cause a false mismatch. The synthetic fixture includes 64 px and 96 px hats in the same slot and tests switching between them. A 20-minute timeout terminates only the owned Editor/player process tree and waits for its closure; termination errors remain failures. A short injected-timeout probe verified that the owned parent and child exited while an unrelated sentinel process remained alive.

Results and raw Editor logs remain in the printed project directory. Do not publish raw license logs. The committed verifier and C# templates contain no license data or generated project/vendor files.

Unity documents the relevant [batch-mode options](https://docs.unity.com/en-us/engine/6000.0/manual/unity-editor/command-line-arguments/editor) and [Animator.Play API](https://docs.unity3d.com/6000.4/Documentation/ScriptReference/Animator.Play.html).
