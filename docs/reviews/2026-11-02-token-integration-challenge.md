# Independent challenge: combined agent and shared-token integration

November 2, 2026. Requested by the owner after the two-app environment-reference update. Reviewer:
`token_integration_challenge`, a separate sub-agent. This is an independent source/test review, not a claim that every
possible defect has been ruled out. The coordinator owns fixes, final integration, live checks and task tracking.

## Scope and baseline

- PixelDoll baseline `0715713a`, including the older token work `372d4e7f` and replacement `18259c4f`.
- Backpack baseline `6f82739`, including `67817b1` and earlier shared-auth work `edde030` / `ad7fb0d`.
- Reviewed both resolvers, Vite middleware and mode gates, entry/frame guards, credential state, shared Forget/replacement
  protocol, production guards, focused tests, and prior research/test claims.
- Inspected the active primary checkout's additional PWA changes only for agent plugin gating and credential caching
  interaction. Other PWA functionality was not audited and its uncommitted files were not changed.
- No real `.env`, real secret, account response, PixelLab request or generation was accessed by this reviewer.

## Findings in the reviewed baseline

### R1, P2: late agent delivery can overwrite a newer connection or undo Forget

PixelDoll `app/src/bootstrap.ts:29-32` and Backpack `src/bootstrap.ts:12` test keylessness before starting asynchronous
agent delivery, but do not check credential identity/revision after the local response and its body finish loading.

Reproduction used the actual extracted agent blocks with deferred synthetic promises. Start keyless; leave delivery
pending; establish a newer manual connection; then release the older agent response. Both blocks replace the newer
credential with the agent credential. A second reproduction clears an already-keyless pending connection and then
releases delivery. Both reconnect after the explicit Forget. No endpoint or provider was needed for either reproduction.

A final `!key` check alone does not cover Forget because the key is empty both before and after it. Reuse credential
revisions: Backpack already exports `getKeyRevision()` in `src/lib/api/http.ts:103`; every `dropKey`, including a remote
Forget when already keyless, increments it. PixelDoll's private `keyRevision` similarly increments in `setKey`,
`clearLocalKey` and queue-driven credential changes. A small accessor can expose that existing counter. Capture before
delivery, then compare after the full body resolves before invoking the existing connection method.

Required regressions: delayed response and delayed response body, manual replacement, remote Forget while still keyless,
and same-value reconnect with a changed revision. These branches must remain within the existing agent compile-time gate.
The reviewed production and ordinary development branches do not run the agent block.

### R2, P2: optional storage failure gives the apps different agent behavior

Backpack `src/lib/api/http.ts:187-194` wraps the optional off-switch read and endpoint fetch in one `try`. If
`localStorage.getItem` throws, it returns null without asking the server for the memory-only agent credential.
PixelDoll catches only its off-switch read and continues the endpoint fetch. Both applications otherwise support
credential storage failures by keeping credentials in memory.

Reproduced by executing Backpack's exact `agentKey` function with a throwing synthetic `getItem` and a counted synthetic
fetch: it returns null with zero fetches. Separate the optional off-switch lookup from network handling to match
PixelDoll's existing behavior, and test denied storage, an enabled off switch and a successful memory-only response.

## Nonblocking observations and accepted boundaries

- Missing/malformed references correctly produce sanitized server-side 503 responses. Both clients currently reduce
  non-OK agent responses to no automatic connection; the UI does not present that setup explanation. This is a developer
  feedback gap rather than evidence of credential fallback or a production authentication defect. Missing local
  configuration is intentionally optional; do not conflate its 404 with configured-but-invalid 503.
- PixelDoll sets no-store after its origin guard; Backpack sets it before. Both successful secret responses have
  no-store and both unauthorized responses are empty. This is a harmless ordering difference, not a secret leak.
- Agent configuration does not support generic interpolation, defaults, recursive references or shell execution.
  Bare names, fake tokens and unknown token formats intentionally remain literal values. A missing `${NAME}` target
  must not fall back to either its name or another secret. These are deliberate requirements, not missing features.
- The prior live harness's corrected acceptance is defensible for authentication: eight observed GET 200 responses,
  connected state and absent credential persistence support its bounded claim. Intentional picture/detail blocks
  should not fail an authentication-only check. It does not qualify full gallery rendering or every agent failure
  branch; the present follow-up tests should provide the missing literal/fake-token evidence.
- Remembered origin-wide plaintext keys, credential-free notifications, delayed saved-key adoption, and the documented
  deferred persisted queue-account isolation remain explicit project decisions. This review does not silently reopen
  those decisions or claim they provide stronger isolation.
- The two localhost origins used for separate apps do not automatically share browser storage across different ports.
  Cross-app protocol correctness therefore needs same-origin peer tests, not merely opening one app on each port.

## Semantic parity review

The resolver implementations have equivalent logic, differing only in formatting. Both use Node `parseEnv`, recognize
only a complete `${NAME}`, consult inherited environment own-properties, trim the result, preserve opaque literals and
fail missing/malformed references. Node's real Windows `process.env` case-insensitive lookup was exercised with a unique
synthetic variable and a lowercase reference; both resolved correctly. No real environment secret was read.

Both Vite configs keep `envDir:false`, refuse agent-mode builds and register the endpoint only for `serve` plus `agent`.
Their origin/socket/proxy guards are semantically identical. The dotenv file locations differ as required by each
repository's app-root layout. Both entry points decline initialization inside frames. Shared-auth helpers match in
behavior and send no credential in their app-generated messages. R1 and R2 above are the identified integration gaps.

The active PWA config retains the same agent plugin gate and build refusal. Its worker plugin is build-only;
`startPwa` declines nonproduction initialization. The inspected worker handles only static shipped resources and
navigation; ordinary `/__dev` requests and external PixelLab API requests pass through. No agent credential caching
interaction was found in that bounded inspection.

## Independently executed checks

- PixelDoll: `npm test -- agent-key shared-auth key-switch --maxWorkers=2`, 31 passed across three files. The first
  sandbox attempt hit an EPERM transform-cache rename before executing tests; the authorized outside-sandbox rerun
  passed. The file named `key-switch` concerns chroma-key rerolls, so its four passing tests are not claimed as API-key
  race coverage.
- Backpack: `npm test -- agent-key shared-auth http library --maxWorkers=2`, 174 passed across four files.
- Extra resolver assertions against both actual exported functions passed for Windows case-insensitive environment
  lookup and literal fake/new/old/bare/embedded-reference strings, with no secret reads or provider calls.
- Exact-bootstrap deferred-promise checks reproduced R1 in both apps for manual replacement and keyless Forget.
- Exact Backpack helper execution reproduced R2 with zero fetches when the optional storage read throws.

No full suite, build, browser test or live provider check was run by this reviewer. Those checks belong to the coordinator;
this report must not be used to imply they were independently repeated here. The baseline needed the two bounded fixes
and their deterministic regressions before approval.

## Independent review of the fixes

The coordinator supplied bounded working-tree fixes after the baseline findings. This reviewer inspected them and
independently verified the following:

- PixelDoll exports its existing credential revision. Its agent block snapshots it before fetching and checks the
  same revision plus keylessness only after the entire response body resolves. Backpack applies the same policy
  through its existing revision accessor and fully awaited `agentKey()` helper. No asynchronous step occurs between
  each final guard and the connection invocation. R1 is addressed in both applications.
- Backpack now isolates the optional off-switch storage read. Denied storage permits its memory-only agent fetch,
  while an actual enabled switch still suppresses it. R2 is addressed without changing ordinary credential storage.
- PixelDoll now sets no-store before its origin guard, matching Backpack's ordering. This is consistent with the
  existing behavior for successful responses and introduces no broader endpoint access.
- New tests run the real bootstrap modules with controlled credential state and deferred delivery, rather than
  copying the fixed guard into a test. PixelDoll explicitly distinguishes delayed headers from delayed body text.
  Backpack's helper awaits its text before the outer revision guard, so the complete delivery is covered by that
  guard. A native browser check of remote Forget remains useful to verify the actual revision/event hookup beyond
  these focused mocks; the coordinator is responsible for that test.

Independent post-fix runs:

- PixelDoll: `npm test -- agent-bootstrap agent-key shared-auth --maxWorkers=2`, **39 passed**, three files.
- Backpack: `npm test -- agent.test agent-key shared-auth http library --maxWorkers=2`, **181 passed**, five files.
- Nine additional exact-source offline assertions passed: response/body delays against manual replacement/keyless
  Forget in both apps, plus denied optional storage in the actual Backpack helper. Zero provider calls.

The fixes preserve the existing agent compile-time gates and production credential flow. No remaining concrete
defect was found in these bounded changes. This reviewer approves R1/R2 resolution subject to the coordinator's required
whole-suite, production-build and browser/live checks. This is evidence-based approval of the stated scope, not a
guarantee that no possible bug or external browser/provider failure exists. The nonblocking observations and explicit
product boundaries above remain documented.
