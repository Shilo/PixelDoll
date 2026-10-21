# PixelDoll

2D pixel-art paperdolling companion web app using PixelLab AI for image generations, animations, skeleton rigging, and other AI tools.
Goal is to create traditional frame-based paperdolling sprites using modern tooling and AI for an automated workflow that is intuitive and easy to use. Uses minimal human workflow. It should automate creation of the art as well as the spritesheets and any other setup involving paperdolling systems. For 2D pixel art games that will be used with popular game engines such as Godot, Unity, Phaser.
Tech stack: Svelte framework (Not SvelteKit), Vite+ or Vite, Typescript or Javascript. Fully client-side only hosting on GitHub pages.
Powered by PixelLab: https://pixellab.ai

Research spiking and mockup phase only.
To test what is possible with creating a proper modern paperdolling system powered by PixelLab behind the scenes.

## Agent testing (PixelLab key)

- AI agents (Claude, Codex, others) that need the PixelLab key run the agent dev server: `npm --prefix app run dev:agent`
  (launch config `app-dev-agent`, http://localhost:5199). It serves `PIXELLAB_TOKEN_AGENT_DEV` from the repo-root `.env` to
  same-origin localhost requests, and the app auto-connects and shows an "Agent mode" badge.
- Humans never use it. `npm run dev` (launch config `app-dev`, :5173) has no key endpoint and no key option: paste the key
  in Connect, as in production. Builds never contain any of this (`vite build --mode agent` refuses to run; CI greps `dist`).
- Never print, log, screenshot or commit the key. Check `GET /balance` only, unless the task needs generations.
- Keyless scripts (`app/scripts/e2e-studio.mjs`, `probe-tabs.mjs`, `shoot-mvp.mjs`) work on either server; on the agent server
  they set `localStorage['pixeldoll.agentKey'] = 'off'` so nothing can spend. Use `BASE=http://localhost:5199`.
