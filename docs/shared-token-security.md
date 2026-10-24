# Shared PixelLab credential contract

Decision: 2026-10-23. PixelDoll, Backpack, and future applications on this origin intentionally share the optional,
unencrypted `localStorage['pixellabApiKey']`. Existing paste/connect/Remember controls remain unchanged. No passphrase,
encryption, backend, or additional unlock step is required. Apps on other origins do not share this storage.

## Cross-app notifications

The implementation in `src/lib/shared-auth.ts` is identical in both apps (PixelDoll's source lives under `app/`).

- After changing the saved key, send the bare string `key-changed` on `BroadcastChannel('pixellab-auth')`.
  Other remembered sessions read the current `pixellabApiKey` value, never a key from a message. If it changes to a
  different nonempty key, open connections keep their current account as session-only; they never silently switch
  queued work or the visible library to another account. Newly opened/reloaded apps read the saved value as usual.
- Forget first removes the saved key and clears the initiating app's credentials, then writes a fresh UUID to
  `localStorage['pixellabAuthForget']` and broadcasts `{ type: 'signed-out', id: '<same UUID>' }` on that channel.
  This marker is not a credential. It reaches session-only clients even when no saved token existed. The current
  stored marker wins over delayed channel messages; acknowledge the current marker on a fresh user connection.
- Listen for both storage and channel events. Deduplicate the same Forget UUID. Reconcile after `pageshow` and
  visibility restoration to catch missed notifications. A canonical storage removal disconnects remembered clients;
  `localStorage.clear()` disconnects all cooperating clients. No receiver echoes events or removes another app's newer saved key.
- Session-restoring apps associate their tab credential with the current Forget marker. They discard that tab copy
  if a newer Forget occurred while the page was inactive. Never restore a stale credential after Forget.
- Explicit reconnection invalidates stale responses before the new account is verified.
  Clearing local credentials prevents future requests; it cannot recall requests already submitted or revoke a stolen token.

Future apps can adopt this protocol without a shared runtime dependency. Existing/uncooperative pages may still hold
their own memory copies; only PixelLab can revoke the credential globally. If both browser storage and messaging
are unavailable, cross-tab notification cannot be guaranteed. App-generated channel messages and Forget notifications must never carry a token; native storage events inherently expose old/new values on this intentionally shared origin. Never put tokens in URLs, logs, or exports.

## Security boundary

Every same-origin app and its script dependencies are trusted with the saved token. Anyone controlling that browser
profile or executing malicious same-origin code may recover it. Keep persistence optional, constrain scripts with CSP,
limit authenticated requests to PixelLab, omit cookies, avoid authenticated redirects, and keep agent credentials out of builds.

Production GitHub Pages enforces supported CSP/referrer meta tags, but does not apply `_headers`. In particular,
`frame-ancestors` needs an actual response header. Local-preview headers must not be described as protection already
deployed by Pages. Both entry points refuse to initialize the app when framed, mitigating clickjacking on Pages;
this client guard is not a replacement for response-header protection. A future static hosting/CDN change can deliver
headers without adding an application backend.

Deferred separately: persisted PixelDoll queue records are not scoped to an API-key fingerprint. Reloading after a
saved key changed may attach the existing ledger to that key. A future fix must scope enqueue/dedup/recovery/polling
durably and conservatively handle legacy records while preserving accepted job IDs. This patch avoids introducing
automatic account switching in open tabs; it does not claim durable queue-account isolation.

Encryption is deferred in the TODO/roadmap: a fixed bundled key or an automatically available saved decryption key
does not solve same-origin token theft, while a separate passphrase adds unwanted friction. Reassess only when there
is a concrete protection goal and an acceptable independent unlock or provider-delegation mechanism.
