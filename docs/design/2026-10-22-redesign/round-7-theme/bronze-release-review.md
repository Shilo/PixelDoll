# Bronze UI extraction and release review

Date: 2026-10-23. Independent source and release-design review of the round-seven Bronze showcase before creation of `Shilo/bronze-ui`. Reviewed the style guide, control inventory, research and coverage reviews, both committed browser reports, theme/recipe CSS, six Svelte components, showcase entry points, fixture loader and source MIT license. No runtime source, remote repository, package registry or release was modified by this review. Existing browser reports are prior evidence, not newly repeated tests.

## Recommendation

Proceed with a small **0.1.0** package and separate static showcase after the release gates below pass. The reviewed theme is a good visual foundation, but the current lab cannot simply become the package directory: it assumes PixelDoll's filesystem, fixture compositor, document resets and preselected example values. The previous no-blocker verdict applied to the isolated demonstrated scope; the reusable form cases below are new extraction requirements.

Keep native controls and CSS recipes. Publish the five reusable behaviors (`Field`, `ChoiceGroup`, `Help`, `Dialog`, `Notice`) through optional Svelte subpaths; keep `Scene`, sprite loading, request samples, app navigation and artwork in the showcase. Do not export the PixelDoll compositor, queue, API client or domain manifest as UI-library utilities.

The lead's accepted extraction architecture uses `@shilo/bronze-ui`, a `--bu-`/`.bu-` namespace, CSS entries `tokens.css`, `components.css`, `optional-base.css`, `style.css`, optional Svelte and Lucide peers, and an immutable GitHub release tarball. This is a sound refinement of the proposal below. Document that Svelte-subpath users must install the optional peers; optional metadata permits CSS-only consumers to omit them, rather than making component imports work without them.

## Prioritized findings

| Priority | Finding and source evidence | Minimum resolution |
| --- | --- | --- |
| P1 — release blocker | **Internal buttons submit host forms.** `ChoiceGroup.svelte` radio buttons, `Help.svelte` trigger and `Dialog.svelte` Close button omit `type`. The lab has no surrounding form, so its current interaction checks do not expose native default submit behavior. | Set `type="button"` on internal non-submit buttons. Verify choice selection, Help activation and Close inside an actual form do not trigger its submit handler; retain explicit host submit behavior for consumer footer snippets. |
| P1 — release blocker | **Unselected choices are unreachable through Tab.** `ChoiceGroup` defaults `value` to undefined, then assigns `tabindex=0` only when an option equals that value. The same failure occurs when a consumer replaces options and the selected value disappears. | Give the first available option the Tab stop when none is selected, without silently selecting it. Handle empty options without indexing/focusing undefined nodes. Verify entry, arrows, Home/End, activation and reactive option changes. Native radios are also a valid simplification. |
| P1 — release blocker | **The showcase is not standalone.** `App.svelte` imports production `RequestFields`; `Scene.svelte` imports round-five PNGs and round-six `assets.js`; that loader imports app compositor TypeScript and fetches `'/'+path`; `run.mjs` reaches app/node_modules and app/public. Root fixture fetches also fail under `/bronze-ui/`. | Own every showcase source/asset within the new repo, with normal installed dependencies. Use a tiny local atlas/fixture renderer or precomposed demo sheets; preserve unshaded integer-scale artwork without dragging the compositor into the package. Resolve runtime asset requests against `import.meta.env.BASE_URL`. Package code must contain no `app/src`, round-five/six, fixture-loader or parent-directory imports. |
| P1 — release blocker | **Fresh-clone media and licensing are unproved.** The source README explicitly requires restoring original world PNGs; `git ls-files` shows only `assets/lucide.json` tracked in the round-five asset folder. Fixture metadata identifies PixelLab-generated S2 outputs but has no per-file redistribution declaration. Root MIT software licensing alone is not an asset provenance record. | Commit the exact chosen local showcase media and document source, author/generation provenance, redistribution basis and exclusions. Preserve Shilo's MIT notice for extracted code. Keep original third-party license texts where their material is redistributed. If image rights are not established, use locally authored code/vector art or clearly licensed replacement media; do not imply ownership by copying an MIT label. |
| P1 — integration gate | **Portable recipes have global document effects.** `components.css` changes every `svg` to 20px and stroke 1.6, all headings, body, all native controls and file inputs. `theme.css` disables every document animation in reduced motion and globally outlines all selected ARIA states in forced colors. These policies can be appropriate for a full themed document, but surprising when imported for one Field or dialog. | Separate optional document/base styling from component recipes, or explicitly name/document a full-document stylesheet and its effects. Scope component icon/file/focus rules to Bronze classes. Keep reduced-motion behavior local to Bronze decorations. Have the showcase and prototype explicitly import the document stylesheet if desired. A scoped multi-theme framework is not required for 0.1.0. |
| P2 — before advertising reusable accessibility | **Modal recovery assumes an app-specific fallback.** `Dialog` focuses `document.querySelector('main')` when its opener disconnects; an arbitrary consumer main is not guaranteed focusable. Automatic initial focus also always encounters the header Close control before long content. | Document `returnTo` and provide a deliberate focusable fallback/initial-focus hook if the API promises these cases. At minimum, keep focus in a meaningful visible location when a row opening the dialog is removed. Verify programmatic close, Escape, nested Help and popup-to-dialog return after extraction. Avoid a generic overlay manager. |
| P2 — API/type gate | **The Svelte props are untyped lab contracts.** The five public components use unconstrained JavaScript `$props`; ChoiceGroup assumes unique string choices, Notice assumes a supported tone, Field expects the consumer to spread supplied attributes on exactly one native control. | Publish useful generated declarations from typed props or equivalent JSDoc. Define `Snippet` contracts, valid tone/theme unions and bindable values. Document string identity/uniqueness and Field attribute forwarding. A TypeScript consumer must compile real examples from the packed artifact. |
| P2 — evidence limit | **Existing evidence is broad visual/browser evidence, not full assistive-technology validation.** The prior reports cover Chromium/WebKit, six sections, both modes and four viewports. They do not test no-selection choices, forms, packaged imports, screen-reader announcements or production sheet variants. | Add focused form/choice regressions and packed-consumer smoke checks. Re-run existing keyboard/overlay/preference and layout checks against the standalone build and prototype integration. Describe screen-reader and physical-device limits honestly; do not claim certification. |

P1 identifies concrete release blockers, not an instruction to delay creating or preparing a reviewable repository. P2 items can be kept small and bounded; unsupported generic variants should be documented rather than invented.

## Lightweight package boundary

One package, one Vite showcase, no workspace framework is necessary. A suitable layout is:

```text
src/lib/                 # five behaviors, index.ts, tokens and recipe CSS
showcase/                # Svelte app, local example renderer/data/media
tests/                   # behavioral and packed-consumer checks
dist/                    # generated package contents only
site-dist/               # built showcase, excluded from package
LICENSE
THIRD-PARTY-NOTICES.md   # retained notices for redistributed material
ASSETS.md               # showcase media provenance and scope
```

Use `@sveltejs/package` as a development packaging tool if typed Svelte exports are included. It emits preprocessed Svelte and declarations without bundling the Svelte runtime into the library. Its documentation is hosted under SvelteKit, but that does not require converting the showcase or PixelDoll into a SvelteKit app. Publish the components as Svelte source for the consumer compiler, with Svelte as a peer dependency and local development dependency. Keep the exact development versions/lockfile; use a truthful tested Svelte peer range rather than claiming every Svelte 5 minor. `@lucide/svelte` is a production requirement while components import it: use a dependency or documented optional peer rather than leaving it only in devDependencies. [Official Svelte packaging guidance](https://svelte.dev/docs/kit/packaging).

An intentionally small export map can be:

```json
{
  "type": "module",
  "files": ["dist", "THIRD-PARTY-NOTICES.md"],
  "exports": {
    "./svelte": { "types": "./dist/index.d.ts", "svelte": "./dist/index.js" },
    "./tokens.css": "./dist/tokens.css",
    "./components.css": "./dist/components.css",
    "./optional-base.css": "./dist/optional-base.css",
    "./style.css": "./dist/style.css"
  },
  "sideEffects": ["**/*.css"]
}
```

`optional-base.css` owns global document policies; document whether the convenience `style.css` includes it or only tokens and recipes. Do not add wildcard deep exports, auto-import all styling from the JS barrel, ship the showcase as runtime API, or require browser storage on import. CSS consumers should be able to use the tokens/recipes without mounting Svelte. Keep persistence and default appearance choice in the host; document the existing document-root `data-theme` contract and intentional global token scope. Do not promise independent nested theme islands unless implemented and tested. Svelte recommends exports and CSS side-effect metadata; npm's `files` allowlist controls the packed artifact. [Svelte export/side-effect documentation](https://svelte.dev/docs/kit/packaging), [npm package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

Keep icon dependencies rather than copying inline icon paths for nominal zero dependencies. Lucide's license includes ISC terms and notices for Feather-derived icons; retaining the installed package's complete license text is preferable to substituting a generic MIT statement. The built showcase also redistributes bundled icon/runtime code, so retain applicable third-party notices in the repository/site distribution. [Lucide license](https://lucide.dev/license).

## Standalone showcase and Pages

The showcase should demonstrate Bronze rather than present itself as a working PixelDoll instance. Preserve useful scene/control examples, clear simulated-work labels and disabled credential examples. Replace localhost reference links and PixelDoll storage keys with standalone names. Render generic nested request/example data locally; the real `RequestFields` can remain part of PixelDoll's integration proof instead of becoming an accidental Bronze domain API.

Commit only the assets actually displayed. Keep the two world images and a compact walk/equipment atlas if their provenance is documented. An atlas with small local metadata and a simple canvas blit is enough for theme parity; copying the full manifest validation/composition graph is unnecessary. The package tarball must omit showcase media, screenshots, generated test evidence and old review media. Report CSS/runtime sizes separately from the several-megabyte illustrative images.

For `https://shilo.github.io/bronze-ui/`, configure Vite `base: '/bronze-ui/'`, build locally with that same base and verify direct asset requests under the prefix. Vite rewrites imported assets, but an authored `fetch('/fixture.json')` still needs correction. Query/hash page selection avoids inventing a client router/Pages rewrite. Deploy only the built showcase with GitHub's Pages artifact flow; use narrow `contents: read`, `pages: write`, `id-token: write` permissions. [Official Vite Pages guide](https://vite.dev/guide/static-deploy.html).

## Minimum first-release gates

1. **Source independence and licensing:** a clean checkout outside PixelDoll installs and builds without neighbouring repositories, cached media, symlinks or environment files. Check source, packed files and built site for parent imports/paths and accidental private material. Record copied-source provenance and chosen asset rights/notices.
2. **Behavior:** fix P1 form submission and choice-entry cases. Test Help and dialog inside forms, zero/one/unselected/reactively changed options, visible focus, Escape layering and return focus. These are new meaningful regressions rather than tests mirroring CSS declarations.
3. **Package artifact:** run checks, package build and `npm pack --dry-run --json`; inspect an actual tarball and install it in an isolated plain Vite + Svelte + strict TypeScript consumer. Import each documented CSS entry and all five public components, build and exercise their behavior. Verify no packaged example imports and no duplicate bundled Svelte runtime. Dry-run output alone does not prove consumers compile. [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/).
4. **Standalone site:** build/serve at `/bronze-ui/` with no console errors, 404s, external API/credential requests or root-path asset failures. Recheck dark/light, 320px portrait, coarse-pointer landscape, long dialog/footer, forced colors, reduced motion/transparency and actor pixel parity. Preserve honest accessibility evidence limits.
5. **Prototype dependency:** install the same immutable released tarball/tag artifact into the round-six/seven prototype as authorized, and remove copied implementations/styles from that integration. Keep PixelDoll scene, fixtures and domain code local. The committed lockfile must resolve a public immutable artifact; no `file:../bronze-ui`, local symlink, mutable branch or `latest` dependency. Verify a fresh PixelDoll checkout can install/build/run that prototype.
6. **Release consistency:** tag, package `version`, changelog and attached tarball agree. Include the package artifact and notices in the GitHub release. Confirm README install commands reproduce the tested path. A GitHub repository/release is sufficient for this first release; npm registry publication is a separate distribution action and is not technically required for reproducible dependency integration.

An immutable GitHub release `.tgz` URL is a lightweight initial dependency if npm publication is not part of the chosen scope. Avoid relying on Git install-time `prepare` to build an absent `dist` with undeclared tools. Whichever distribution route is chosen, test the exact artifact that users and PixelDoll install.

## Follow-up review

After implementation, re-review the standalone repo's export map and tarball, generated declarations, local showcase dependencies, retained notices/asset manifest, base-path build, focused behavior tests and PixelDoll lockfile/import diff. That review should report the actual final artifact and findings rather than inheriting this recommendation as an approval of unseen code.

## Created-repository review: first pass

Reviewed `C:/Programming_Files/Shilocity/bronze-ui` after extraction on 2026-10-23, while the lead was still implementing tests and workflows. This section is a snapshot, not final release approval.

### Confirmed improvements

- Package is CSS-first with separate tokens, components, explicit optional document `base.css`, convenience `style.css` and `./svelte` entry. Optional peer installation is documented. The `--bu-`/`.bu-` vocabulary is independent of PixelDoll.
- All internal ChoiceGroup, Help and Dialog action buttons now use `type="button"`. ChoiceGroup provides a first Tab stop when its value is absent and handles empty keyboard navigation without indexing an option.
- JSDoc props produce useful declarations including bindable values, valid Notice tone union and Field/Dialog snippets. The package contains source Svelte rather than a bundled runtime.
- Actual first tarball contains 20 files: four stylesheets, five Svelte components, generated declarations/barrel, package metadata, README, MIT license and notices. No gallery media, parent imports, fixtures or tooling are included.
- Showcase uses committed local environment plates, a prebaked atlas and local metadata/renderer. Runtime source search found no imports from PixelDoll, parent rounds or app/node_modules. Provenance describes source commit, no new generations, owner-authorized publication and rights limitations. Lucide/Feather notices are retained.

### Independent runtime evidence

Managed headless Chromium loaded `http://127.0.0.1:5204/bronze-ui/`, including genuinely nonempty actor pixels, without page errors or failed HTTP responses. A separate 36-case pass covered six sections × two themes × three sizes (1440×1000, 320×568, 844×390): document width stayed within the viewport, requested theme and native scheme agreed, and there were no page errors or 404s. Native modal state, Escape opener restoration and nested Help-first Escape behavior passed.

This independent check used the existing local preview build and Node 25.0.0 for the disposable browser driver, not a claim that the Node 24.22.1 build was repeated. CUA browser inventory was empty. Installed WebKit versions did not include Playwright's requested revision 2370, so no new independent WebKit result is claimed. The lead's current supported-runtime CI remains the release authority.

### Findings returned immediately

| Priority | Finding | Required follow-up |
| --- | --- | --- |
| P1 | Component-only CSS still styles unowned `input[type=file]` and its selector button. An unrelated native file input became full viewport width in the isolated runtime fixture. | Namespace the file recipe; retain existing document behavior only in opt-in base styling. |
| P1 | A hidden `.bu-stack` computes `display:grid` with tokens+components because the only `[hidden]` rule lives in optional base CSS. | Preserve hidden state for namespaced component/layout classes independently of document resets. |
| P1 | Surface-backed standard buttons/inputs inherit arbitrary host text colors. Independently reproduced: host `#222` gives `rgb(34,34,34)` text on dark `rgb(32,35,41)`; host `#eee` gives `rgb(238,238,238)` text on light `rgb(250,247,240)`. The full gallery's base.css conceals this integration failure. | Pair Bronze surface backgrounds with Bronze text roles in component-only usage, and check explicit contrasting host colors in both appearances. Keep font inheritance if desired. |
| P1 — distribution | Site notices retain Lucide/Feather but omit the bundled Svelte runtime's installed MIT copyright/license text. | Include `node_modules/svelte/LICENSE.md` attribution in the site distribution's notices, without relabeling it as Shilo-owned code. |
| P1 — validation | Initial package test installs/resolves CSS from the tarball but inspects Svelte from the local repository's dist. Self-imported showcase components are not an isolated packaged Svelte/TypeScript consumer. | Compile a strict TypeScript Svelte consumer against the installed tarball and explicit optional peers. Include `contract.html` in Vite's build inputs before testing it through preview. |
| P2 | Dialog's disconnected-opener fallback still assumes a focusable main element. | Document host requirements or provide a fallback target; test the supported contract. Native top-layer dialogs/popovers avoid a new portal dependency. |
| P2 — docs | README CSS code fence starts with two backticks; copied coverage review still presents the old PixelDoll 5203/current-production context as its final source review. | Fix the fence and identify imported evidence as historical upstream work; add the standalone verification record and remaining limits. |

The root theme scope, inherited scrollbar policy and default-dark `color-scheme` are deliberate and documented. Independent nested theme islands are not promised. The optional base split is the right choice; the findings concern the remaining component-entry leaks and requirements, not a need for a generic theme provider.

## Final standalone correction review

**Verdict: no unresolved release blocker found in the reviewed standalone 0.1.0 scope.** All first-pass P1 findings above are resolved. The package and standalone showcase are ready for the authorized GitHub release and Pages deployment, subject to the actual remote verification/deployment steps. This verdict does not claim those remote actions have occurred or that the PixelDoll dependency integration has already been reviewed.

Reviewed artifact: `.evidence/shilo-bronze-ui-0.1.0.tgz`, **12,716 bytes / 21 files**, SHA-256 `597b093ed6a0b185b77af315a9d41a8944abc65a32c03f8792947420246104d8`. The archive now also includes a CSS side-effect declaration, with typed CSS export conditions so strict TypeScript 6 consumers do not need Vite ambient globals merely to import the styles. Final archive inspection confirmed intended styles/components/declarations, MIT license and notices, and no showcase media or parent-source dependencies.

### Correction evidence

- **CSS isolation:** file styling now requires `.bu-file`; namespaced hidden components retain `display:none` independently of base.css; Bronze surface-backed controls own their foreground. Independently repeated Chromium and WebKit tests with explicit opposite host body colors found correct dark `rgb(242,238,230)` and light `rgb(37,40,45)` button/input text. Hidden grid stayed hidden. Unowned file inputs retained native widths (253px Chromium, 221px WebKit) instead of expanding across the page.
- **Form and focus behavior:** independently passed in Chromium and WebKit revision 2370: actual Tab entry to an unselected radio group; Arrow/Home/End selection; Help and dialog Close inside a host form with zero accidental submissions; native modal state and return focus to the visible opener. Empty choices render safely. Native top-layer dialog/popover behavior remains adequate; no portal manager is required.
- **Focus fallback:** README now explicitly requires a focusable host `<main tabindex="-1">` when an opener can be removed, and documents explicit `returnTo` for pointer/WebKit restoration. This is an acceptable bounded 0.1.0 contract rather than an unresolved generic fallback promise.
- **Packaged consumer:** the lead's completed `npm test` installs the tarball into an OS-temporary directory, resolves CSS without Svelte dependencies, explicitly installs the optional peers/tools, and passes strict Svelte/TypeScript checking and Vite production build. Source inspection confirms it tests the installed artifact rather than resolving the package through a parent node_modules. This addresses the original packaging evidence gap; I did not independently rerun the lead's installation/build command.
- **Browser reports:** inspected the final standalone JSON reports: Chromium **48 passed**, WebKit **48 passed**, with empty error and external-request lists. These are newly generated standalone results, distinct from imported historical PixelDoll evidence. My own independent layout passes covered the six sections, both modes and 1440×1000 / 320×568 / 844×390 before completing the focused correction checks.
- **Visual check:** inspected the current generated dark desktop Scene and light phone Creator captures. The open scene, crisp unshaded sprite, quiet controls, readable light fields, joined direction controls and mobile form hierarchy remain coherent. This is a bounded visual spot check, not physical-device validation.
- **Distribution/docs:** Svelte's installed MIT copyright/license is now retained alongside Lucide ISC/Feather MIT in both repository/package notices and built-site notice source. README code fences are corrected. Imported research/coverage records are explicitly marked historical upstream evidence. Vite includes both showcase and consumer-contract entry points; contract.html works under the `/bronze-ui/` preview prefix.
- **Release workflow:** verify precedes Pages/release, release jobs have scoped permissions, and the tag now must equal `v` + package version. The workflow does not overwrite an existing release. Actual GitHub execution and immutable artifact URL remain deployment verification tasks.

The documentation appropriately limits the library's claims: root-scoped themes, host-owned persistence, no full accessibility certification, and remaining physical-device/assistive-technology testing. Do not expand the first release to speculative widgets or a theme provider to address those evidence limits.

### Suggested standalone release-review record

The lead may copy this final correction section into `bronze-ui/docs/RELEASE-REVIEW.md`, adjusting paths to that repository and retaining the separation between independent reviewer checks and lead-owned test results. Keep the earlier finding/fix record available for traceability, but make this final verdict prominent so historical P1 rows are not mistaken for current open blockers.

After publishing, verify the exact release URL/archive hash, a fresh install from that URL, Pages assets at the public prefix and PixelDoll's immutable lockfile integration. Those concrete delivery checks should be recorded separately from this pre-publication package review.

## Final public artifact and PixelDoll delivery review

2026-10-23. **Verdict: no new release blocker found in the published 0.1.0 artifact or the reviewed round-six dependency integration.** This review checked the delivered bytes and refreshed consumer evidence; it does not inherit artifact approval from the earlier source review.

- **Published identity:** independently queried GitHub's public release and tag APIs. The release is published, not a draft or prerelease. Its annotated `v0.1.0` tag resolves to `a9964ab1b9cd03c433fd66d33e5ef7cac861f534`, matching main at review time. The public [release archive](https://github.com/Shilo/bronze-ui/releases/download/v0.1.0/shilo-bronze-ui-0.1.0.tgz) returned HTTP 200: **12,716 bytes, 21 files**, independently computed SHA-256 `597b093ed6a0b185b77af315a9d41a8944abc65a32c03f8792947420246104d8`, also matching GitHub's asset digest. The intended styles, five components, declarations, metadata, README and license/notices are present; showcase media and tooling are absent.
- **Installed dependency and lock:** all 21 public archive members are byte-identical to `app/node_modules/@shilo/bronze-ui`. Its real path is the normal installed directory, not a sibling-repository symlink. Every documented CSS and Svelte export resolves inside that installed package. Both app manifests use the public versioned URL; the lock diff adds only Bronze, with no unexpected transitive changes. Recomputed archive integrity exactly matches `sha512-yIG7wArjYFSyRzHgUMGXbnxPNtPTFbHQsEFY3EfoazgN5NWEinmAxALYI/o+WF+EUtFF2VD9Xw7VB5vrBoScSg==`. The URL is a release-distribution location; the lock integrity is the concrete byte pin. Preserve the published tag and asset rather than replacing them.
- **Actual consumer runtime:** independently decoded the live Vite adapter response and found the complete installed `tokens.css` and `components.css` contents, allowing only whitespace normalization. This closes the possibility that a current filesystem fingerprint merely accompanies a stale served stylesheet. Independent Chromium loads at **1920 × 1080** and **450 × 800** reached ready state with no page errors, failed HTTP responses, document overflow or GlassKit resources. The adapter keeps package colors/materials in Bronze while the prototype retains screen geometry, scene art and domain logic; optional document resets remain deliberately omitted.
- **Clean installation/build:** the lead reports a successful isolated `npm ci` from the current app manifests and public release URL. A separate clean consumer made from committed PixelDoll app `003bef2` plus those manifests passed Svelte/TypeScript checking and production build/dist guard on the supported runtime. These are lead-owned results, not commands independently repeated by this reviewer. The combined working tree's check currently encounters two unrelated, uncommitted Godot exporter type errors; that result must not be described as a clean whole-worktree check. The clean committed-app result isolates Bronze integration from that concurrent work. The existing bundle-size advisory remains.
- **Refreshed prototype proof:** the integration worker reports **12 unit tests, 18 existing browser checks and eight appearance/viewport cases passed** after the release install and server restart, including exact RGB checks for 997 opaque sprite pixels in both modes. Independently inspected the refreshed `bronze-verification.json` dated **17:59:32 UTC**: its token fingerprint `5729ae3a6a99dade872d602c73129603e3e58e4a21c637a0e98c67847293eb7c` and component fingerprint `167ab46204bdebfa949d39dc17d6eb61735766ace2effe57048aad8b4c8a7775` match the public archive. The earlier component fingerprint `e863995a…` was pre-release evidence and is superseded. The verifier now also checks served CSS against the installed files.
- **Fresh visual evidence:** independently verified the SHA-256 digest and PNG viewport dimensions of every one of the **68 before and 68 refreshed after images** against their manifests. The after manifest is dated **17:58:30 UTC**, has empty error/external-request lists and **no measured major-surface geometry difference above 1 px**. The worker refreshed all 68 pairs and four boards, and reports the before aggregate stayed `59bdd40959e40991c309f0f9d9ce26c24e24adf1ff7a1b87a937bde5cb7c35f4`. Independently viewed the new Obsidian desktop and Porcelain mobile boards: screen hierarchy, fields, menus, native dialogs and crisp scene sprites remain coherent. This is a visual spot check of two boards, not a claim of independently re-running the entire capture suite.

The remaining limits are unchanged: the prototype still needs its previously documented local environment artwork; automated browser results do not certify physical devices or assistive technology; production Studio migration and npm registry publishing are outside this delivery. Concurrent exporter work should retain its own validation and ownership. See the [final delivery record](../../../testing/bronze-ui-delivery-2026-10-23.md) for the lead's installation/build and refreshed evidence record.

Lead follow-up after review: the concurrent export task completed its type updates, and the final combined working tree passed `npm run check` and `npm run build` with a clean distribution guard. The earlier dirty-tree errors above are historical observations, not remaining blockers. The delivery record and export audit document the shared-index commit overlap without rewriting either task's subsequent history.
