# Pipeline research spike: shared brief

Date: 2026-11-24. Branch: `t3/pixellab-pipeline-research`. Coordinator: the main agent.

## Mission

Find concrete, testable ways to improve the PixelDoll generation pipeline on four axes at once:

1. **Consistency** across views, frames, moves and items (same design, same colors, same silhouette, stable seams).
2. **Accuracy** of fit (alignment to the frozen body, grip, occlusion, perspective, proportions).
3. **Quality** of the delivered pixels (detail, shading, clean edges, no smudges/props/stray pixels).
4. **Cost and size**: raise the usable frame/image size and/or frame count while lowering generations per accepted asset. Larger canvases may also improve consistency, so treat size as a quality lever, not only a cost lever.

## Hard rules

- **Ignore every other project.** Do not read, cite, compare with, or reason from any document that compares PixelDoll with other tools or repositories. Any document that compares PixelDoll with another tool or repository is out of scope. Only PixelDoll's own code/docs and PixelLab's own API contract are evidence.
- Do **not** make paid PixelLab calls, run tests, builds, dev servers or installs. This round is reading and reasoning only. The coordinator owns the 1,000-generation test budget.
- Do **not** edit app code. Write exactly one report file, at the path your brief names, plus nothing else.
- Read `AGENTS.md` first. Follow its evidence and reporting standards. Do not restate it.
- Cite evidence as `path:line` (repo-relative) or OpenAPI `operationId`/schema name. No unsourced claims.
- Prefer numbers: pixels, frames, generations, USD, percentages, counts. If a number is derived, show the formula.
- Distinguish **verified** (code/contract/docs), **derived** (arithmetic), and **hypothesis** (needs a paid test).
- Challenge the current design. If a widely held assumption in the docs is wrong or stale, say so with evidence.

## Product constraints you must respect

- Client-only Svelte app, browser calls PixelLab REST v2 directly with the user's token.
- Allowed models only: characters v3 (Standard/Pro/Pro Flash alternatives), animations v3, pixminimax, skeleton-v3, estimate-skeleton, edit-animation-v2, inpaint-v3, transfer-outfit-v2; reviewed State routes create-character-state, edit-images-v2, edit-image-pro-flash, edit-image-pixen.
- Every item is a separate transparent layer that must align to a frozen base on every frame of every move and direction.
- Exports cap layers at 256 px and body-cut variants at 256 combinations (`docs/known-issues.md`).
- No backend, no server-side image processing at generation time; all post-processing is local TypeScript/WASM/Canvas.

## Report shape (keep it dense, max ~250 lines)

1. **Scope and method** (what you read, what you did not).
2. **Findings** grouped by the four axes, each with evidence and numbers.
3. **Where the current pipeline loses** (ranked, with the mechanism, not just the symptom).
4. **Candidate changes** table: change, mechanism, expected effect per axis, cost delta, risk, how to test with generations, confidence.
5. **What must not be changed** and why (accepted limits, paid A/B results, safety/QA).
6. **Open questions** for the other agents / the coordinator.

End your reply with: the report path, and a 10-line summary of your three strongest candidates.
