# Shared PixelLab token security review

**Decision update:** the user subsequently chose plaintext shared storage and no additional unlock step. The vault
recommendation below is historical; the current decision and implementation contract are in [shared-token-security](../shared-token-security.md).

Reviewed: 2026-10-23. Scope: PixelDoll and `pixellab-gallery`, whose product and deployed repository are now named PixelLab Backpack. This is a storage, credential-lifecycle, and deployment review, not a complete application penetration test.

## Recommendation

Preserve one shared credential location, but replace the persisted plaintext token with an **optional, encrypted, locked vault**. Both apps should read the same versioned IndexedDB record. Unlock with a strong user passphrase initially; do not persist the passphrase or decryption key. Keep memory-only use as the default. Put the two apps on an origin reserved exclusively for this suite, and fix token broadcasting and shared sign-out before describing the result as secure credential storage.

This protects a locked saved token from simple storage inspection and adds meaningful protection against theft of the encrypted record. It does **not** make a token secret from someone controlling an unlocked browser or from malicious code running during token entry/unlock/use. Direct browser-to-PixelLab requests necessarily expose the usable bearer credential to the browser. That boundary cannot be fixed by choosing another browser database.

If the actual requirement is that application JavaScript must never obtain the usable token, the architecture must change to a credential broker outside the page's trust boundary. A backend is excluded by the current project rules. A browser extension or native companion could be a future, explicitly different product, with its own security review.

## Method and limits

- Read both projects' AGENTS.md files, credential implementations, API clients, tab coordination, login/settings components, relevant account-cache handling, Vite configurations, distribution guards, and existing security tests.
- Reviewed the committed PixelLab v2 OpenAPI authentication scheme and current public API documentation, plus primary guidance from WHATWG, W3C, OWASP, IETF, MDN, and browser/authenticator vendors.
- Fetched the two public production HTML pages and inspected their response headers without credentials.
- Ran existing targeted tests: PixelDoll API client, queue, and agent-request guard: **3 passed**; Backpack HTTP/credential and agent-mode/guard suites: **66 passed**. Requests in these tests are mocked.
- Ran the companion [offline browser probe](token-storage-probe.mjs) in managed Chromium 156.0.8078.4: **7 checks passed**, using only synthetic pages and values, with network requests intercepted.

No real token or `.env` was read, no authenticated PixelLab request was sent, and no generations were purchased. Application source and configuration were not changed. The test host has Node 25.0.0/npm 11.16.0, rather than the repositories' pinned Node 24.22.1/npm 11.19.1; these targeted results are not a release certification. Initial sandbox cache-write failures were resolved by rerunning the same mocked tests with normal cache access. The browser probe used the already installed browser cache through `PLAYWRIGHT_BROWSERS_PATH`.

## What is protected, and from whom?

“Any user can read it” needs a precise boundary. Another visitor on another computer does not receive your saved key. An unrelated website on a different origin cannot normally read it. The people/code with relevant access are:

| Threat | Current exposure | What improves it |
|---|---|---|
| Someone using the same unlocked browser profile | Can inspect saved storage and use the account | Memory-only default; locked vault; separate OS/browser profiles |
| Script on another `https://shilo.github.io/...` project | Shares origin storage; can listen to origin-wide channels | Move this suite to an exclusive origin |
| XSS or compromised dependency in either app | Can capture input, plaintext storage, or live API credentials | Prevent script compromise; limit dependency/deployment authority; reduce credential lifetime/authority |
| Theft of the saved vault record while locked | Current record is immediately usable | Encryption whose unlock secret is not stored with the record; strong passphrase |
| Malicious extension, local malware, or browser owner actively debugging | Can potentially observe inputs/runtime/network | Browser-only storage cannot offer a comprehensive defense |

This review found concrete exposure paths and lifecycle gaps. It did not establish that either app has an exploitable XSS vulnerability or that any real token has been stolen.

## Implementation findings

### 1. High: the shared trust boundary includes every project on the account's Pages origin

PixelDoll reads `localStorage['pixellabApiKey']` on module load and writes it when Remember is enabled: [app.svelte.ts:7](../../app/src/lib/app.svelte.ts) and [line 33](../../app/src/lib/app.svelte.ts). Backpack reads/writes the same name: http.ts:8 (`pixellab-gallery/src/lib/api/http.ts:8`) and line 103 (`pixellab-gallery/src/lib/api/http.ts:103`).

The deployed URLs are `https://shilo.github.io/PixelDoll/` and `https://shilo.github.io/pixellab-backpack/`. Their different paths do not isolate them. A vulnerable old demo, compromised project deployment, or malicious code published under a third path on that origin could access the remembered token. The browser probe reproduced cross-path reads and cross-origin isolation.

Both apps already warn about this. The warnings are accurate disclosures, but do not enforce isolation. WHATWG explicitly documents that local storage has no pathname access boundary. [HTML Standard: cross-directory attacks](https://html.spec.whatwg.org/multipage/webstorage.html#cross-directory-attacks)

### 2. High: PixelDoll sends the raw token through an origin-wide broadcast

[queue.ts:413](../../app/src/lib/pixellab/queue.ts) posts `{ key }` to the `pixeldoll-queue` BroadcastChannel when the user connects from a follower tab. The intended recipient is the queue leader, but BroadcastChannel is a broadcast to other eligible same-origin subscribers, not a private connection to that tab. A sibling project can subscribe before the connection and receive the token, even with Remember disabled. [MDN: Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)

The existing self-test opens a spy **after** the initial key transfer and confirms that an unsolicited `ask` gets no response: [queue.ts:1044](../../app/src/lib/pixellab/queue.ts). That is useful, but does not test passive interception of a future legitimate transfer. The companion probe confirms the underlying broadcast behavior; the application call site establishes that a real credential takes that path.

Remove raw credentials from BroadcastChannel. For a small first fix, require the tab running jobs to unlock locally. If transparent cross-tab operation remains a requirement, separately design a request broker; do not substitute an easily discovered channel name or claim that a public channel is authenticated. Memory-only broker designs can reduce direct disclosure but still authorize use by compromised trusted clients.

### 3. Medium: shared persistence does not mean shared sign-out

PixelDoll removes the shared saved entry and clears its own state in [app.svelte.ts:40](../../app/src/lib/app.svelte.ts). Its queue channel differs from Backpack's `pixellab-backpack` channel. Backpack sends `signed-out` and `key-changed` only on its own channel: http.ts:585 (`pixellab-gallery/src/lib/api/http.ts:585`). Neither credential module handles cross-app `storage` events.

Consequently, removing a remembered key in one app does not immediately clear an already-open other app's memory. Backpack can also retain its sessionStorage copy. Within PixelDoll, a follower's empty-key message clears the leader, but a leader clearing its own key does not broadcast that change to every follower. “Forget” is not presently a suite-wide lock or revocation operation.

Define separate operations: **Lock all open apps**, **Forget the saved credential**, and **Revoke at PixelLab**. Use one shared protocol carrying only events and credential-version identifiers, never tokens. Clear application/UI references, expire queued authorization, and reject late account responses. Requests already submitted cannot be recalled merely by clearing local storage. Provider-side revocation is required to invalidate an already copied bearer token.

### 4. Medium: Backpack session storage is less persistent, but is still readable

Backpack defaults to `sessionStorage['pixellab-backpack:key']`: http.ts:60 (`pixellab-gallery/src/lib/api/http.ts:60`). PixelDoll defaults to memory. Session storage survives reload, and another page on the same origin reached in the same tab can read it; the browser probe reproduced this. It should not be described as a secure vault. OWASP recommends avoiding sensitive data in JavaScript-readable local storage and notes that one XSS can expose it. [OWASP HTML5 security guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#storage-apis)

For the new contract, use memory-only consistently unless the user explicitly creates the encrypted saved record. Do not promise that tab closure is a cryptographic deletion mechanism or that dropping JS references guarantees memory zeroization.

### 5. Medium: production anti-framing protection differs from Backpack preview

Both live pages returned HTTP 200. Neither inspected response contained `Content-Security-Policy`, `X-Frame-Options`, or `Cross-Origin-Opener-Policy` headers. Both contained CSP meta tags.

Backpack's public/_headers:2 (`pixellab-gallery/public/_headers:2`) declares `frame-ancestors 'none'`, and its local preview serves those headers. Its vite.config.ts:24 (`pixellab-gallery/vite.config.ts:24`) correctly explains that GitHub Pages ignores `_headers` and removes unsupported directives from the CSP meta tag. PixelDoll uses a [CSP meta tag](../../app/index.html) too. `frame-ancestors` cannot be enforced through a meta tag. [MDN: frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)

The agent auto-connect checks `window.top === window`, but that restriction covers agent startup, not ordinary production connections. Framing is relevant to clickjacking and, for a same-origin parent, DOM access to a credential input. A parent on another origin does not gain DOM access merely by framing.

Use a static hosting/CDN configuration that can deliver real response headers; no application backend is needed for that. Serve `frame-ancestors 'none'` for the apps. If GitHub Pages remains the only delivery layer, document the limitation rather than treating preview checks as production coverage. Anti-framing is defense in depth; it does not isolate same-origin storage.

### 6. Medium: live key replacement bypasses Backpack's normal account transition

On `key-changed`, a kept Backpack tab assigns `key = saved` directly: http.ts:610 (`pixellab-gallery/src/lib/api/http.ts:610`). That path does not notify the library to perform the fingerprint/account checks that startup and `connect()` use: library.svelte.ts:166 (`pixellab-gallery/src/lib/data/library.svelte.ts:166`).

This is a source-level account-consistency finding: an open tab can start authorizing requests with a replacement credential while retaining previous in-memory library state. The complete visible effect was not reproduced end to end in this review. Treat credential replacement as a full account transition, invalidate old-account work, and then verify/load the new account. A change in another app currently has the separate stale-memory problem in finding 3.

### Existing protections worth preserving

- Persistence is opt-in, and password fields mask entry. Backpack also supports a user-managed password manager through `autocomplete="current-password"`; that is an external vault convenience, not protection after autofill.
- Both clients use HTTPS bearer authorization. Backpack has an explicit URL host guard, GET-only request construction, and minimal error metadata. PixelDoll builds authenticated URLs from a fixed API base and redacts activity exports. The reviewed artwork download paths do not attach the account token.
- Both projects isolate agent-mode `.env` handling server-side, disable Vite env loading, reject agent production builds, and have distribution guards. Agent-request guards check loopback, host, fetch metadata, and proxy headers. Keep those controls intact.
- Both CSPs restrict scripts; neither enables inline script execution. PixelDoll's inline-style allowance is a separate policy choice. CSP reduces some attack paths but does not change storage access by a different legitimate same-origin page.

## Alternatives challenged

| Option | Shared location? | Security assessment |
|---|---|---|
| Rename/base64/obfuscate the localStorage value | Yes | Conceals presentation only; no secret boundary |
| Store plaintext in IndexedDB or OPFS | Yes, same origin | Different persistence API; still accessible to trusted-origin script |
| sessionStorage | Same tab/origin, not general cross-tab sharing | Shorter exposure; plaintext and script-readable |
| Memory only | Needs explicit sharing/broker for other tabs | Best simple default; limits persistence, not active script capture |
| Encrypt with a bundled key or another saved string | Yes | Any reader can recover the decryption key |
| Encrypt with a non-exportable CryptoKey saved in IndexedDB | Yes | Can stop raw key export, but same-origin code can retrieve the handle and call decrypt; probe verified both behaviors |
| Encrypt with a passphrase that is not saved | Yes, encrypted record | Meaningful protection while locked; offline password guessing and active compromise remain |
| WebAuthn PRF-gated encrypted vault | Yes within the intended credential/origin design | Promising unlock UX; requires supported browser/OS/authenticator combinations and recovery planning |
| HttpOnly cookie alone | Not a replacement for this bearer API | Page JS cannot create/read HttpOnly; a cookie on your site cannot supply a bearer header to PixelLab |
| Backend credential broker | One broker serves both apps | Can keep the reusable upstream token out of normal page JS, but violates today's client-only rule and introduces custody/operations |
| Extension/native broker | Can serve both apps through narrow messages | Separate trust boundary and installation cost; must proxy allowed requests rather than return the token |

IndexedDB is recommended for asynchronous access and transactions, **not because it is inherently a secret store**. Web Crypto also does not guarantee hardware-backed persistence or secure erasure. [W3C Web Crypto security considerations](https://www.w3.org/TR/webcrypto/#security-considerations)

HttpOnly is valuable when a server holds the credential and the browser receives only a session cookie. It is not a static-site setting that solves this integration. [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)

The IETF distinguishes storage exposure from malicious-code protection and describes how a backend-for-frontend keeps upstream tokens away from application JavaScript while remaining susceptible to unauthorized requests from a compromised client. These are useful architectural comparisons; PixelLab's current API-key integration is not an OAuth login flow. [RFC 10017, sections 6 and 8](https://datatracker.ietf.org/doc/html/rfc10017)

## Concrete client-only design

1. **Reserve an origin for the suite.** Deploy only the two reviewed builds there, for example under `/pixeldoll/` and `/backpack/`. Keep their source repositories separate if desired. This requires a deliberately combined static publication or equivalent routing; merely assigning a domain to the current user Pages site may also bring unrelated projects onto it. Treat both apps and their dependencies as one security boundary. Separate origins per app provide stronger isolation but would require a broker to retain sharing.
2. **Use a shared, versioned IndexedDB vault.** One database/store/record, such as `pixellab-credentials` / `vault` / `primary`. Store only format/KDF parameters, random salt, IV, and authenticated ciphertext. Both apps implement exactly the same format and lock events. This preserves the requested common location.
3. **Keep “use for this session” as the default.** No plaintext writes to localStorage, sessionStorage, IndexedDB, URL state, clipboard, logs, or exports. Existing credential input necessarily contains the value while entering it; clear it promptly after use.
4. **Make saved use explicitly locked.** Initially use a strong passphrase and native Web Crypto PBKDF2-HMAC-SHA-256 to derive an AES-256-GCM key. Use a random salt of at least 16 bytes and a fresh 12-byte IV for every encryption with a given key; authenticate the format context as additional data. Persist KDF parameters and bound them before processing an untrusted record. Use a non-extractable derived key in memory, but do not save it. Web Crypto supports this derivation directly. [MDN deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey), [OWASP authenticated encryption guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
5. **Choose KDF work deliberately.** PBKDF2-HMAC-SHA-256 at 600,000 or more iterations is a reasonable initial baseline, informed by OWASP, then benchmark supported mobile devices and version the parameters. This is an engineering starting point, not a claim that OWASP certifies this vault. Argon2id has memory-hard advantages, but would add an implementation/dependency absent from Web Crypto. A weak PIN plus a local retry counter is inadequate against an attacker copying the record. [OWASP password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
6. **Unlock separately per app/tab in the first version.** Both use the same stored token without saving the unlock secret. The cost is an unlock prompt after reload/new-tab use instead of automatic persistent sign-in. Do not silently restore seamless sign-in by saving the decryption key. Consider a reviewed volatile broker only if this UX cost proves unacceptable.
7. **Unify lifecycle events.** Lock/forget/replacement must invalidate credentials and account-sensitive state in all open clients, with non-secret version/event messages. Stop new paid work after lock; already submitted jobs remain submitted. Existing queue coordination must no longer transport raw keys. Define what happens to paused jobs on account replacement before implementing it.
8. **Use real production security headers and keep scripts constrained.** Verify deployed responses, not just the `_headers` file or preview. Add `form-action 'none'` and stronger base restrictions where compatible. Keep required image/worker behavior working. Review scripts from the entire dedicated origin and the deployment pipeline.

WebAuthn PRF is a possible later unlock alternative. It can provide credential-bound key material, but ordinary passkeys alone do not encrypt an arbitrary API key. Feature-detect PRF, validate target combinations, and retain a recovery/reset path; provider re-entry may be preferable to vault recovery for this product. This review does not assert universal current platform support. [W3C PRF explainer](https://github.com/w3c/webauthn/blob/main/explainers/prf-extension.md), [Yubico implementation guidance](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html)

## Migration and acceptance criteria

The current AGENTS.md contracts explicitly require the shared plaintext name and forbid legacy-key migration/removal. A future implementation must intentionally update those contracts and the corresponding tests. This review does not authorize an invisible migration or broad storage deletion.

For the current canonical entry, offer an explicit “protect saved key” flow. Keep the token in memory during conversion, verify the encrypted write/decryption, then remove the canonical plaintext value. Never silently fall back to plaintext if encryption/storage fails. Old deployed tabs can recreate the old value; retire outdated entry points and require reload during migration. A new origin cannot directly read the old origin's storage: prefer re-entry/password-manager fill and explicit old-origin cleanup over transferring credentials through URLs or inventing a migration bridge.

Historical app-specific entries deliberately left by prior versions are a separate residual-secret concern. Decide and document an explicit cleanup policy rather than scanning or deleting unrelated site data. No such entries were inspected during this review. Removing storage is not secure erasure of disk backups, and rotating a provider key is the appropriate response to suspected exposure.

Acceptance checks should use synthetic credentials and mocked requests:

- Both apps read the same encrypted record; neither stores a plaintext token or unlock key anywhere persistent.
- Wrong passphrase, corrupted ciphertext, unsupported schema, excessive KDF parameters, denied storage, and failed writes fail safely.
- A passive sibling BroadcastChannel listener receives no token during legitimate connect, reconnect, leadership change, lock, or forget.
- Cross-app and same-app lock/forget affect already-open tabs; reload does not revive a forgotten credential.
- Account replacement invalidates stale library state, queued authorization, and late responses without buying generations.
- The deployed app responses enforce anti-framing policy and retain their effective CSP.
- Agent tokens remain memory-only and absent from production bundles. Existing dist guards and build restrictions continue to pass.

Finally, ask PixelLab whether it offers independently revocable keys, read-only scopes, expiry, spend caps, or a supported short-lived delegated authorization flow. The reviewed snapshot declares HTTP bearer authentication and no OAuth scheme; public docs describe bearer tokens. That is evidence for the current integration, not proof that undocumented provider capabilities do not exist. Backpack's GET-only guard does not restrict what a stolen full-access token can do elsewhere. [PixelLab v2 API documentation](https://api.pixellab.ai/v2/docs)
