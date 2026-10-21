# Shared research notes (append-only)

Each agent appends short, dated bullets prefixed with its ID (R1..R5, S1, …). Read this before writing conclusions so findings stay
consistent across agents. Append with a shell `>>` (or a single Edit at the end) — never rewrite others' lines.

- PM: PixelLab REST v2 `https://api.pixellab.ai/v2` returns CORS allow for origin `https://*.github.io` incl. `authorization` header.
- PM: OpenAPI spec saved at `docs/research/pixellab/pixellab-openapi-v2.json` (102 paths, version "dev").
- PM: `docs/research/pixellab/proper_paperdolling_in_pixellab.md` is about the Android "PixelLab – Text on pictures" app, NOT pixellab.ai.
- PM: Prior art: `../pixellab-pip/docs/pixellab/pixellab-paperdolling-research-spike.md` and `pixellab-paperdolling-system-plan.md`
  (2026-07) — proposes same-canvas edit + local diff extraction.
