# Toolchain standardization — 2026-10-22

Scope: development architecture, dependency versions and regression tooling. The Studio, custom CSS, runtime modules, generated images, queue/storage semantics and export formats retain their existing behavior. No GlassKit dependency or visual changes are introduced.

## Exact versions

| Package/runtime | Version |
|---|---|
| Node.js / npm | 24.22.1 / 11.19.1 |
| svelte | 5.57.2 |
| vite / @sveltejs/vite-plugin-svelte | 8.3.4 / 7.3.1 |
| typescript / svelte-check | 6.0.3 / 4.7.7 |
| @types/node / @tsconfig/svelte | 24.19.2 / 5.0.8 |
| vitest / @playwright/test | 4.1.12 / 1.64.1 |
| @lucide/svelte | 1.61.0 |

The runtime selector is `.nvmrc`; package metadata declares `npm@11.19.1` and compatible Node 24/npm 11 engine ranges. CI selects Node 24.22.1. Existing Svelte/Vite versions are retained, not upgraded for uniformity alone.

## Test migration and review decisions

- CODE-DERIVED: Vitest executes all 30 original Node-compatible module groups plus the existing agent-key guard group individually. A sequential, awaited per-case spy turns false `console.assert` calls into assertion failures and restores the original function in `finally`. Three failure-injection cases verify synchronous failures, awaited asynchronous failures and thrown-exception cleanup.
- CODE-DERIVED: only existing registry arrays are exported from the dev-only self-test module. Its browser runner and all production module assertions remain unchanged. The old `selftest` npm command is an alias; the direct Node script and browser harness remain available.
- CODE-DERIVED: the original Studio regression is preserved under Playwright Test. The main flow uses managed fixture context/page for failure traces. Additional isolated contexts preserve phone, landscape and tablet checks. API requests are blocked, and each context opts out of agent-key loading.
- CODE-DERIVED: a second Playwright case runs the real browser self-test page and requires every registered browser group, including canvas PNG round-trip and IndexedDB transaction checks, to report success.
- CODE-DERIVED: strict checking includes application, build configuration and test configuration/source. The existing Svelte TS preset and Lucide dependency remain justified; standalone screenshot/debug utilities use the directly declared Playwright Test package.
- Review agreement: a Vitest-only assertion adapter avoids touching production implementations solely for test-runner adoption. Managed Chromium is the default; installed Edge remains an optional explicit channel. The two browser cases fit a five-minute CI gate, so no subset of existing Studio checks is dropped.

## Validation

VERIFIED on Node.js 24.22.1/npm 11.19.1 with Playwright-managed Chromium:

| Check | Result |
|---|---|
| Clean npm ci from committed checkout | Passed; zero reported audit advisories |
| Pre-change strict Svelte/config check | 0 errors, 0 warnings |
| Pre-change direct Node self-tests | All 31 groups passed |
| Pre-change Studio browser script | Passed desktop, phone, landscape and tablet flows |
| Post-change strict application/config/test check | 0 errors, 0 warnings |
| Vitest | 34 tests passed: 31 preserved groups plus 3 adapter failure checks |
| Playwright Test | Both Studio production-build regression and full browser self-test registry passed |
| Production build and dist guard | Passed; no agent/dev code or secret/source-map markers |
| Production asset parity | Main JavaScript, worker JavaScript and CSS each match pre-change SHA-256 byte-for-byte |

The final clean-install run used a temporary export of committed checkout aff23e7, keeping an already-running development server and concurrent source edits undisturbed.

The byte-identical production artifacts establish that this tooling migration changes no deployed UI code or styling. Chromium checks do not claim real-device, assistive-technology or cross-engine coverage. No live API calls or generations were performed.
