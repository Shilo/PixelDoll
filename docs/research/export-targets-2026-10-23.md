# Export target review — 23 October 2026

## Decision criteria

An engine button must deliver engine-specific resources or an importer/runtime that preserves the paperdoll: shared frame clock, variable frame durations, equipment changes, per-frame draw order, oversized-layer pivots and saved outfit colors. Renaming a PNG/JSON bundle after an engine does not qualify. Aseprite and PNG + JSON remain useful general interchange formats.

## What current adoption evidence can establish

The [GDC 2026 State of the Game Industry report](https://investgame.net/wp-content/uploads/2026/01/2026-01-29-dec052f4_d88e_48ce_9f83_a18ce2f2a6e5_541400_GDC26_PDF_SOTI_Report.pdf), pp. 28–29, reports primary engine use of Unreal 42%, Unity 30% and Godot 5%. This covers professional development across genres, not a ranking of 2D tools. The report cautions that its changed survey makes year-on-year comparisons difficult. Its generative-AI section does not establish that AI determines engine choice.

The [Gamedev.js 2025 survey](https://gamedevjs.com/survey/2025/), question 16, reports Phaser 35.8%, Unity 24.7%, Godot 24.4% and GDevelop 20.4%. These are web-community responses with multiple tools possible; they cannot be combined with GDC's primary-engine percentages. The [2026 survey page](https://gamedevjs.com/survey/2026/) was accessible, but a completed 2026 results report was not located during this audit. The 2025 numbers are explicitly a fallback, not 2026 measurements.

[Godot's May 2026 growth analysis](https://godotengine.org/article/godot-growth-stats-2026/) supports continued adoption, while explaining that downloads, unique installs and inferred Steam releases measure different things. None is a precise census of 2D developers. [Construct](https://www.construct.net/en) also has an active 2D audience; its vendor-reported usage is not directly comparable to independent survey shares.

AI coding makes machine-readable text resources and documented runtimes useful. That is a design consideration, not evidence that any particular engine has acquired market share. This review found no representative 2026 survey of specifically AI-assisted 2D engine choice; it does not invent one.

## Target decisions

| Target | Native value and recommendation |
|---|---|
| Godot 4 | Keep. Native scene, SpriteFrames resources and GDScript equip/playback runtime avoid manual slicing and synchronization. Validate resource dependencies in exported game packs as well as the editor. |
| Unity 6 | Keep. C# importer creates sliced Sprites, AnimationClips, AnimatorController and a layered prefab. Validate required packages, actual compilation, reimport and runtime rendering. |
| Phaser | Keep. Phaser atlas metadata plus a Phaser Container runtime are framework-native integration. Verify the actual supported versions and exact animation timing; an atlas alone is insufficient. |
| Aseprite | Keep as editable interchange. Layered binary files carry timeline tags, timing and a pivot slice; downstream importer behavior varies. |
| PNG + JSON | Keep as universal fallback. Explicit per-layer cell/pivot, playlists, materials and slot rules let users build an integration without maintaining a separate exporter for every framework. |
| GDevelop | Added in the [native export follow-up](native-export-expansion-2026-10-23.md): editable native project with registered Sprite resources and an embedded paperdoll controller, verified through the released editor core/exporter/runtime. [Sprite objects](https://wiki.gdevelop.io/gdevelop5/objects/sprite/) alone would require manual rig reconstruction. |
| GameMaker | Strong future 2D candidate. [Sprite strips](https://manual.gamemaker.io/monthly/en/The_Asset_Editors/Sprites.htm) already work through generic export. A distinct target should supply tested `.yy`/`.yymps` resources and GML for equipment/timing/ordering; strips plus instructions do not earn another button. |
| Construct 3 | Consider after demonstrated demand. Its [Sprite integration](https://www.construct.net/en/make-games/manuals/construct-3/plugin-reference/sprite) needs a native object/event or addon package to preserve paperdoll semantics. Manual image import is covered by generic export. |
| Unreal / Paper2D | Defer. Broad professional popularity is not proof of demand for this 2D workflow. Epic's [sprite importer](https://dev.epicgames.com/documentation/en-us/unreal-engine/import-sprites-in-unreal-engine) accepts dedicated descriptors, but those alone do not provide synchronized, swappable doll components. A worthwhile target needs a tested component/Blueprint or plugin too. |
| MonoGame | Defer a dedicated button. Official [animation guidance](https://docs.monogame.net/articles/getting_to_know/howto/graphics/HowTo_Animate_Sprite.html) builds animation in application code; the [content pipeline](https://docs.monogame.net/articles/getting_to_know/whatis/content_pipeline/CP_Overview.html) supports textures and custom processors rather than one standard paperdoll resource. PNG + JSON is suitable for custom C# runtimes. [MonoGame.Aseprite](https://monogameaseprite.net/guides/getting-started/installation.html) is an optional third-party alternative; verify its handling of layers, pivots and z-indexes before adopting it. A `.mgcb` containing texture entries alone would add little value. |
| Other frameworks and specialist RPG engines | Use PNG + JSON or Aseprite until demand and a stable native integration justify maintenance. Fixed RPG sheet conventions cannot silently discard arbitrary directions, timing or oversized weapons. |

The initial audit added no new engine button based on popularity alone. The subsequent user-authorized follow-up adds a
verified GDevelop native project/controller. GameMaker is explicitly deferred by user decision until native runtime testing
is possible. See [follow-up decisions](native-export-expansion-2026-10-23.md) for the updated scope and Unreal's native route.

The independent Godot, Unity and Phaser reviewers challenged this proposal and agreed to retain the current target list. Their concrete exporter defects justify work now; an additional unverified native runtime would expand the maintenance surface before those guarantees were reliable. This is a scope decision for this audit, not a claim that the deferred engines are unpopular or unsuitable.
