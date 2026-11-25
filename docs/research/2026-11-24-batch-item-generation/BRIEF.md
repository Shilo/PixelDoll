# Brief: paperdoll API surface and batch item generation spike

2026-11-24. Research only. No app behavior change and no paid PixelLab calls.

## Questions

1. Is there any public PixelLab API capability related to paperdolling that PixelDoll has not used yet?
2. Does PixelLab publicly document a paperdoll/equipment-slot system with batch item generation for an animation, as described secondhand? If not, what public features come closest?
3. If PixelDoll generated several items for one move in a single paid call, what would it cost, what would break, and how would layers be separated?
4. What is the cheapest paid test that would falsify the idea before building UI for it?

## Constraints

- Only public sources: PixelLab's docs, llms.txt, public OpenAPI at https://api.pixellab.ai/v2/openapi.json, public marketing/YouTube/X/changelog/pricing pages, and this repository. No private PixelLab information, no scraping of authenticated app internals, no reverse-engineering proprietary JS.
- No paid generation. No token use. No code changes under `app/`.
- Cite file paths or URLs for every claim. Mark anything inferred as inferred.

## Context the reader already has

- PixelDoll extracts layers from composites: dress a chroma-keyed copy of the frozen body, pose that per move with skeleton-v3, key out the background, QA, export.
- Current routes are in `app/src/lib/pixellab/routes.ts`.
- Recent cost evidence is in `docs/research/2026-11-24-pipeline-spike/`.
