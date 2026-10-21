# PixelDoll

Paperdolling for [PixelLab](https://pixellab.ai). Describe a pixel-art character, add hats, armour, hair and weapons as
**separate frame-aligned layers**, recolour them, and export sprite sheets plus a manifest for **Godot, Unity, Phaser** or any
engine (PNG + JSON). Every generated pixel comes from PixelLab; PixelDoll turns PixelLab's one-image-per-call output into a
consistent, layered, slot-based paperdoll: one base body, N directions, M moves, and a transparent layer per item on the same
grid and pivot.

Client-side only (Svelte 5 + Vite 8 + TypeScript, no backend). The browser calls the PixelLab REST v2 API directly with your own
key.

## Status

**Research / MVP phase.** Research R1–R5, live spikes S1–S5, architecture v1.3 and the Studio MVP are done; hardening is under
way. See [PLAN.md](PLAN.md) (current state, decisions D1–D13) and [TODO.md](TODO.md).

- Proven: base character (48 px, padded to a 64 px cell) → skeleton-v3 moves → items dressed on a chroma mannequin and posed per
  move → automatic checks → layers. Held items use a 96 px canvas with the same pivot.
- Godot 4.7.1 and Phaser 3.80 / 3.90 / 4.2.1 render the exports pixel-identical to PixelDoll's own compositor.
  Unity: the C# importer compiles, live import not yet verified.
- Not yet: shields (off hand), PWA (planned in PLAN.md). The bundled demo uses the team's own spike
  outputs (revisit before a public release).

## Run locally

Needs Node 24 (Node ≥ 23 for `npm run selftest`; it runs the TypeScript directly).

```sh
cd app
npm install
npm run dev        # http://localhost:5173
```

Open `#/` for the Studio. **Try the demo** needs no key. To generate, open **Connect PixelLab…** and paste a key from
<https://pixellab.ai/account>. It stays in memory unless you tick *Remember on this device*, and is only sent to
`api.pixellab.ai`. `npm run dev` handles the key exactly like the deployed site: there is no key file, endpoint or button.

**Agent mode (AI agents only).** Automated agents (Claude, Codex, …) that test generations use a separate dev server:

```sh
npm --prefix app run dev:agent   # http://localhost:5199, Vite mode "agent" (launch config "app-dev-agent")
```

It reads `PIXELLAB_TOKEN_AGENT_DEV` from a git-ignored `.env` at the repo root, server-side, and serves it at `/__dev/pixellab-key`
only to same-origin requests from localhost (`cache-control: no-store`). The app connects automatically and shows an
**Agent mode** badge. Humans don't use it. None of it exists outside `vite --mode agent`: Vite loads no `.env` files at all
(`envDir: false`, no `VITE_` variables), `vite build --mode agent` refuses to run, and CI fails if `dist/` mentions it. Never
commit `.env` and never print the key. See [AGENTS.md](AGENTS.md).

Developer pages: `#/m1` … `#/m5` (the M1–M5 harnesses), `#/selftest` (browser self-tests).

## Build and test

All commands run from the repo root.

```sh
npm --prefix app ci
npm --prefix app run build      # -> app/dist (base './', works under any sub-path)
npm --prefix app run preview    # serves app/dist on http://localhost:4173
npm --prefix app run check      # svelte-check + tsc
npm --prefix app run selftest   # node self-tests (no network, no spend)
```

**End-to-end smoke test** (Playwright, demo only, no key, no spend). Playwright is not an `app/` dependency; the scripts import it
from `design-mockups/node_modules`, so install that once:

```sh
npm --prefix design-mockups ci
npx --prefix design-mockups playwright install chromium   # first time only
npm --prefix app run dev                                  # in another terminal (or the "app-dev" launch config)
node app/scripts/e2e-studio.mjs                           # BASE=http://localhost:4173 to test the preview build
```

The scripts stay keyless on the agent server too (`BASE=http://localhost:5199`): they opt out of the agent key, and the e2e
then only checks that agent mode auto-connected (`GET /balance`, free).

`node app/scripts/shoot-mvp.mjs` writes Studio screenshots to `docs/testing/img/` the same way.

## Export targets

The Studio's **Export** sheet builds one zip per engine, on your device, for free. Each zip contains `README.txt` (quick start),
`manifest.json` ([spec](docs/manifest-spec.md)), `CREDITS.csv` (PixelLab provenance), `layers/` (one sheet per item layer and
move; rows = directions, columns = frames) and, optionally, `baked/` (finished characters per outfit).

| Target | In the zip | Import |
|---|---|---|
| Godot 4 | `godot/Paperdoll.tscn`, `.gd`, SpriteFrames `.tres` | Copy the folder into the project, instance `godot/Paperdoll.tscn`; `play_anim(anim, dir)`, `equip(slot, item_id)`. See `godot/README.txt`. |
| Unity 6 | Editor importer + `unity/pixeldoll_unity.json` | Copy under `Assets/`; the importer builds sliced sheets, clips, a controller and a prefab in `unity/Generated/`. See `unity/README.txt`. |
| Phaser 3.80+ / 4 | `phaser/PaperdollContainer.js` + TexturePacker-hash atlases | Copy into your assets, `loadPaperdoll(scene, dir)` then `new Paperdoll(...)`; serve over http. See `phaser/README.txt`. |
| PNG + JSON | `generic/` strips per layer, move and direction | Any engine: one sprite per layer, same grid and pivot, one clock. See `generic/README.txt`. |

Use nearest-neighbour filtering and whole-pixel positions in every engine.

## CI and deploy to GitHub Pages

[.github/workflows/pages.yml](.github/workflows/pages.yml) runs on every push and pull request: `npm ci`, `npm run check`,
`npm run selftest`, `npm run build` in `app/`, then a **dist guard** that fails the run if `app/dist` contains `__dev`,
`pixellab-key`, `PIXELLAB_TOKEN_AGENT_DEV`, agent-mode code, any `.env*` file or any source map. On a push to `main` it also deploys
`app/dist` to GitHub Pages (or run it by hand from the Actions tab). The workflow uses no secrets and no environment
variables: the PixelLab key never reaches CI. Enable Pages once: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. The site is served at <https://shilo.github.io/PixelDoll/>; it works under that sub-path because Vite's `base` is
`./` and the router uses `#/` hashes.

GitHub Pages cannot set response headers, so the Content-Security-Policy is a `<meta>` tag in `app/index.html`. It allows
scripts from `'self'` only and network calls to `api.pixellab.ai` and PixelLab's image hosts. Add any new origin there.

**Serve PixelDoll from its own origin.** Browsers isolate storage per origin (scheme + host + port), not per path. Every
project site of an account (`https://<user>.github.io/<repo>/`) shares the origin `https://<user>.github.io`. Any page on it
(another repo, a demo with third-party scripts, an XSS anywhere) can read PixelDoll's IndexedDB (projects, prompts, job
ledger), a key saved with "Remember on this device" (`localStorage`), and its same-origin `BroadcastChannel`. So deploy to
either:

- a custom domain (Settings → Pages → Custom domain), **recommended**, or
- a user or organisation root site (`<name>.github.io`) that hosts nothing else.

`https://shilo.github.io/PixelDoll/` is such a project path: fine for trying the demo, but for real work (your key, saved
projects) use a custom domain. Never deploy it as a project path next to pages you do not control. PixelDoll keeps the key in memory by default and never
answers "send me the key" messages from other tabs. The Connect sheet warns when "Remember" is turned on at a `*.github.io`
project path.

## Repo layout

| Path | What |
|---|---|
| `app/` | The Studio (Svelte 5 + Vite 8 + TS). `src/studio/` UI, `src/lib/` pipeline (pixellab, rig, items, dress, compose, export, store), `src/ui/` M1–M5 harnesses, `public/fixtures/` demo data, `scripts/` selftest, e2e, screenshots, fixture builders. |
| `spikes/` | Node spikes S1–S5 against the live API (`spikes/api/*.mjs`) and their evidence in `spikes/api/out/` (PNGs, `calls.jsonl` with base64 and key stripped, costs). |
| `design-mockups/` | D2 look mockups (A–E); also provides Playwright for the app's e2e scripts. |
| `docs/` | Research, spikes, architecture, manifest spec, design, test reports. Start at [docs/README.md](docs/README.md). |

## Key docs

- [User guide](docs/user-guide.md): the Studio in plain language
- [Docs index](docs/README.md)
- [Architecture v1.3](docs/architecture.md) and [manifest spec](docs/manifest-spec.md)
- [PLAN.md](PLAN.md) and [TODO.md](TODO.md)

## License

[MIT](LICENSE). The bundled demo art and the spike outputs were generated with PixelLab by the team.

## Credits

Powered by [PixelLab](https://pixellab.ai): every character, item and move is generated through the PixelLab API with your
own account. Icons: [Lucide](https://lucide.dev).
