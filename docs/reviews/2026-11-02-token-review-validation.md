# Combined token review: resolution and validation

November 2, 2026. Follow-up to the owner-requested independent challenge of both applications, including the previous
session's shared-auth and agent-token work. Implementation research and initial live evidence are in
[the reference decision](../research/2026-11-02-agent-env-reference-best-practices.md). The separate reviewer's findings,
independent runs and approval are in [the challenge](2026-11-02-token-integration-challenge.md).

## Findings accepted and fixed

1. Both agent bootstraps could replace a newer manual connection, or reconnect after a keyless Forget, when an older
   local-key response arrived late. The coordinator reproduced six failing PixelDoll cases and three failing Backpack
   cases before changing production source. Both now capture the existing credential revision before requesting the
   agent key and check it after the full response body resolves, immediately before connecting. PixelDoll exposes its
   existing counter; Backpack reuses its existing accessor. The reviewer challenged the fix, confirmed the actual local
   and remote Forget paths increment the counters even while keyless, and approved the result.
2. Backpack treated optional browser-storage failure as a reason to skip its memory-only agent request. A failing test
   reproduced this. Its optional off-switch lookup is now isolated, matching PixelDoll. An explicit off switch still
   suppresses delivery. No change was made to the remembered-token policy.
3. PixelDoll's no-store header now precedes the request guard, matching Backpack for empty 403 responses as well as
   successful responses. The reviewer classified the old ordering as harmless; this is parity housekeeping.

The dist guards retain the historical `PIXELLAB_SECRET` marker, as the owner explicitly requested. A comment in each
explains that marker names are leak indicators, not permitted reference names. The generic resolver marker remains.

## Matching contract in both applications

| Input or state | Both applications |
| --- | --- |
| Complete `${NAME}` value, optionally quoted | Resolve that own-property name from the inherited server environment |
| Ordinary old/new/fake token or bare variable-looking word | Preserve the literal value; never infer another credential |
| Missing/blank target or malformed `${...}` reference | Sanitized HTTP 503; no API request or literal fallback |
| Missing file or empty entry | HTTP 404; no automatic connection |
| Newer manual connection or Forget during delivery | Ignore the stale agent response, including delayed body text |
| Optional storage unavailable | Agent connection may remain in memory; explicit off switch still stops it |
| Normal dev, production or a framed page | No agent credential initialization |
| Production build | No endpoint/resolver/agent markers; agent-mode builds are refused |

The same behavior uses each application's existing connection API. File paths differ because PixelDoll keeps its Vite
app in `app/`, while Backpack keeps it at the repository root. No common runtime package, dependency or backend was added.

## Coordinator checks

- Both strict checks passed with zero errors and warnings. PixelDoll: **1,575 unit tests passed, one existing skip**, 136
  files. Backpack: **408 unit tests passed**, 18 files.
- PixelDoll auth and Studio browser selection: **46 passed**. Backpack browser smoke: **7 passed**. These use synthetic
  API responses and cover remembered/session credentials, shared Forget, replacement-on-reload, framing and existing UI.
- Native agent browser matrix: **26 passed**, 13 in each app. Actual copied Vite configurations served synthetic dotenv
  entries to real frontends. Checks cover arbitrary/renamed references, unquoted old/new token shapes, colliding bare
  environment names, the retired bare alias, quoted fake tokens rejected with controlled HTTP 401, missing/malformed
  references and empty entries. Browser interception verified the exact Bearer credential without real provider calls.
  A rejected fake literal never switched to the environment credential. No agent credential entered browser storage.
- Four of those native scenarios exercise the real credential modules: defer the local endpoint, then manually connect
  or send a credential-free Forget from a second page on the same origin; release the stale response. The manual key
  remains, or the key stays empty with no API call after Forget. This validates event/revision wiring beyond unit mocks.
- Both production builds and dist guards passed. Both agent-mode builds were refused. Only scoped browser specs ran;
  the full cross-feature browser suites were not repeated for these bounded agent-only changes.

Native fixtures, scripts and boolean/path/count-only reports remain in ignored local test output. Initial harness
failures were investigated: source junctions caused the observer to import a separate module instance, so fixtures now
copy source consistently; Backpack intentionally clears its key and resets transport state after 401, so rejection is
checked against the cleared credential and actual intercepted 401, not a persistent transport-status label. App behavior
was not changed to satisfy either incorrect harness assumption. Fake-token tests are offline; no fake credential was
sent to PixelLab. Existing real dotenv files were not rewritten during this review.

## Limits and remaining concerns

No remaining concrete defect was found in the reviewed token changes after the bounded fixes. This is not a guarantee
against every browser/provider failure. Missing/malformed agent configuration has a sanitized HTTP setup error but no
dedicated in-app setup screen. Optional origin-wide plaintext remembered credentials and the deferred persisted-queue
credential-ownership work remain existing project decisions. The reviewer inspected concurrent PWA work only for agent
gating and credential caching interactions; that work's unrelated features and uncommitted edits were not included.

## Post-push real authentication

Reviewed application fixes were pushed to PixelDoll `7daefa38` and Backpack `cc25fad` on their respective `origin/main`
branches. Fresh localhost-only agent servers then inherited the current Windows User environment value. No real dotenv
file was rewritten. The final native-browser live harness passed in both apps on its first run in this follow-up:

- PixelDoll: local agent endpoint 200, Agent mode badge, automatic connection and GET `/v2/balance` 200.
- Backpack: local agent endpoint 200, Agent mode badge, automatic connection and all seven first-page asset-family GETs
  200. No pagination or details were allowed.
- Both: no credential in local/session storage, no credential output or artifact, and zero paid generations. Browser
  contexts were closed and only the two task-owned localhost test servers were stopped.

Exactly eight real GETs were authorized by the live harness. Its guards intentionally blocked one extra PixelDoll API
request, three extra Backpack API requests and 60 picture requests, so gallery picture rendering is outside this live
authentication result. No screenshot, trace, HAR, response body, token header or browser profile was retained. Fake-token
and failure-path cases remained offline. This closes the follow-up card `PVTI_lAHOAAg2ds4Boo7NzhFfe0E`; no further token
fix or paid test is indicated by the reviewed evidence. The documented boundaries above remain in force.

The independent reviewer also checked the final committed application diffs and confirmed they match the approved
fixes, with no incidental token-policy drift or remaining concrete blocker. That final check did not repeat the
coordinator's whole-suite/browser/live runs.

## Owner decision on the separate queue-account limitation

On November 2, the owner explicitly reaffirmed deferral of queue credential ownership. A follow-up offline assessment
using the actual queue reproduced two cases: waiting work submitted with a replacement credential after an explicit
manual token switch, and after restoring saved work with a replacement token. No provider calls or charges occurred.
The potential wrong-account charge is an accepted preview limitation, rather than a resolved defect or a measured
high-frequency problem. The owner prefers keeping current code simple for the expected uncommon use case. The existing
Later card remains deferred; no queue isolation, account-switching feature or application code was added. Revisit on
owner request, relevant user reports or planned account-switching support. See the current decision in
[the shared credential contract](../shared-token-security.md).
