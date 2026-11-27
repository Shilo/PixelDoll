# Engine priority for PixelDoll exports (2026-11-26)

Question: which engines should PixelDoll support most deeply (runtimes, demos, docs) for its niche: 2D, pixel art, AI-made art
and games built with AI coding agents? Researched by a delegated agent (Sol 6.2, medium) from public sources; numbers are
snapshots and self-reported where noted.

## Ranking

1. **Phaser** (3 and 4 through one runtime, with Phaser AE as the default Phaser export and the first demo game). Web
   tech is the strongest signal for AI-built games: among 2D engines named in the Cursor Vibe Jam, Phaser led in 2025 (57)
   and 2026 (61), ahead of PixiJS (12 to 23), Godot (5 to 21) and Unity (16 to 11). Phaser npm downloads grew from about
   68K to 780K a week in the year to November 2026. There are no public adoption numbers for Phaser AE yet.
2. **Godot 4**: the strongest pixel-art audience (about 39K itch.io pixel-art games), 47% of GMTK 2026 entries, and text
   scenes plus headless commands that suit agents.
3. **Unity 6**: the largest reach (about 49% of 2025 Steam releases, 46K itch.io pixel-art games) and official CLI and
   MCP tooling for agents.
4. Then deepen **GDevelop** (official AI agent and MCP), and consider **GameMaker** (about 9K itch.io pixel-art games) and
   **PixiJS** as the next native and web targets.

## Sources

- Vibe Jam submissions: https://vibejam.com/api
- itch.io engine directory and pixel-art filters: https://itch.io/game-development/engines
- GMTK 2026 engine tally: https://bsky.app/profile/gamemakerstoolkit.com/post/3mrmx5mi3mk24
- SteamDB technologies: https://steamdb.info/tech/
- GameDiscoverCo engine usage (March 2026): https://newsletter.gamediscover.co/p/hows-pc-game-engine-usage-changing
- npm downloads: https://api.npmjs.org/downloads/point/2026-11-19:2026-11-25/phaser,pixi.js,kaplay,excalibur,three
- Phaser AE announcement: https://phaser.io/news/2026/07/no-you-didn-t-miss-a-3d-update

## Limits

No public dataset isolates games made with AI-generated pixel art. itch.io tags are self-reported, SteamDB detects files,
npm counts include automation, Vibe Jam favors web and Three.js, and GMTK bans AI-generated art. The ranking combines
these signals rather than measuring the niche directly.
