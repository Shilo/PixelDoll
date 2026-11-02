# Explicit agent environment references in PixelDoll and Backpack

November 2, 2026. Owner-authorized replacement of the hardcoded bare-name convention in both applications. Scope includes
online research, implementation, ignored local configuration, commits/pushes and bounded real agent authentication.

## Research and decision

[Node 24's environment documentation](https://nodejs.org/docs/latest-v24.x/api/environment_variables.html) explains that
dotenv files have no universal formal specification. Node defines valid names, whitespace, comments and optional quotes.
Its built-in [parseEnv implementation and documentation](https://github.com/nodejs/node/blob/v24.22.1/doc/api/util.md#utilparseenvcontent)
can parse the file into an object without loading it into the process environment. Both apps already require this Node version.

[Vite's environment guide](https://v8.vite.dev/guide/env-and-mode) documents variable expansion and warns that client-exposed
environment variables are bundled into client code. Its [envDir option](https://vite.dev/config/shared-options.html#envdir)
can disable automatic dotenv loading. Keep `envDir:false`; secret handling belongs only in the localhost agent middleware.

[dotenv-expand's own documentation](https://github.com/dotenvx/dotenv-expand) uses `${NAME}` references and supports broader
variable expansion. Neither app needs full interpolation or another dependency. Command substitution is also explicitly
outside our contract. Using familiar reference notation does not mean implementing a whole expansion language.

The chosen contract is one explicit whole-value reference:

```env
PIXELLAB_API_KEY_AGENT_DEV=${PIXELLAB_SECRET}
```

Any valid name can replace `PIXELLAB_SECRET`. The app recognizes the `${...}` syntax, not a token prefix or a hardcoded
variable name. Non-reference values remain opaque literal tokens, including old and new formats. Quotes alone do not
change a token into a reference; after Node parses optional quotes, the complete value must still match `${NAME}`.
Only the inherited server environment is consulted, not sibling dotenv entries. No defaults, recursive expansion,
embedded interpolation, commands, account lookup or automatic fallback is supported.

Missing/blank referenced values or malformed reference syntax fail with a sanitized HTTP 503 setup response. A missing
dotenv file or empty agent entry still returns 404. Request guards run before reading the file; successful responses
remain no-store. The existing human credential flow, normal development, production, memory-only agent connection,
framing guard and paid-generation consent are unchanged.

Token-prefix detection was rejected: the documented token transport does not establish a permanent old/new token
grammar, and a typo or future token format must not silently select another secret or fall back to a variable's name.
An exact bare `PIXELLAB_SECRET` is no longer a special alias. Both local files are updated to the explicit syntax;
no compatibility shim or credential is committed.

## Validation and live request budget

Unit coverage checks arbitrary names, quoted references/literals, comments/spacing, missing/blank targets, malformed
syntax, unsupported defaults, inherited properties, literal token formats and no mutation of the supplied environment.
Native middleware and production tests use only synthetic credentials. Dist guards cover the resolver itself as well
as the existing agent markers. Local `.env` files stay ignored and are never printed or included in test artifacts.

After both code changes are pushed, real checks use fresh isolated browser contexts and localhost-only agent servers:
PixelDoll allows only GET /balance, with no generation requests. Backpack's existing open check is capped at seven family
first pages plus one possible account/growth row, all GETs. Extra pagination, details, pictures and mutation requests
are blocked. No live token, headers, account response bodies, screenshots, HAR or browser profiles are saved.

The existing board card `PVTI_lAHOAAg2ds4Boo7NzhE6arQ` tracks both apps. PixelDoll's concurrent PWA work and other unrelated
edits are excluded.

## Offline results

- PixelDoll: strict checking passed; 1,557 unit tests passed, one existing skip; the auth and Studio browser selection
  passed (46 tests). Production build and dist guard passed.
- Backpack: strict checking passed with zero errors/warnings; all 400 unit tests and the seven-test browser smoke
  selection passed. Production build and dist guard passed.
- Each app passed 13 synthetic native middleware checks: arbitrary/renamed references, quoted literal, missing file,
  malformed/missing target, no-store, origin/proxy guards and normal-mode exclusion. Agent-mode builds were refused.
  A synthetic canary was absent from both production outputs.
- Both ignored local settings now use the explicit reference. Unrelated dotenv entries were preserved. No live token
  was printed, committed or placed in test artifacts. No paid generations were used.

## Post-push authentication results

Implementation commits: PixelDoll `18259c4f5f181401a70b143f299f0e66ade53489`; Backpack
`67817b19d11268a707406b81d4664968ef320f65`. Both were pushed to their own `origin/main` before real authentication checks.

Fresh localhost agent servers inherited the current Windows User environment value. Both served their agent entry with
HTTP 200, showed the Agent mode badge, connected automatically and retained no credential in local/session storage.
PixelDoll GET `/v2/balance` returned 200. Each of Backpack's seven asset-family first-page GETs returned 200. No generation
request was sent, and no screenshots, headers, response bodies, account inventory or browser profiles were retained.

Test-harness corrections are part of the evidence: the first run closed before its proxied network responses settled,
so its two initiated GETs have unconfirmed outcomes. The final native-browser run observed all eight required 200s.
Its initial aggregate assertion incorrectly required zero blocked API requests, despite deliberately blocking every
extra read and picture. It blocked one additional PixelDoll request, three additional Backpack API requests and 48
Backpack picture requests. Offline qualification of the recorded status/state booleans confirmed authentication in
both apps; the request-count assertion was corrected for this stated scope without further live calls. Picture display,
detail loading and pagination were intentionally not qualified by this bounded sign-in check. Total real GET attempts
were capped at ten across both harness runs, including the two with unconfirmed responses. Zero paid generations.

The local files contain the reference rather than a copied token. Future Windows-variable changes require restarting
the terminal/editor and agent server so the new value is inherited. Renaming the Windows variable requires only changing
the name inside `${...}` in each ignored local entry. Ordinary users' pasted and remembered tokens keep their existing flow.

## Independent follow-up

The owner requested an adversarial review of the combined older/newer token changes and matching behavior in both apps.
The [independent review](../reviews/2026-11-02-token-integration-challenge.md) found two agent-startup defects, reproduced
them offline and independently approved the bounded fixes. The [coordinator's validation](../reviews/2026-11-02-token-review-validation.md)
records the final checks, fake-token transport/rejection matrix, cross-tab race checks and remaining explicit limits.
`PIXELLAB_SECRET` remains a dist-guard leak marker by owner decision. It does not restrict environment-reference names;
the generic resolver marker protects against accidentally bundling resolution code regardless of the chosen name.
