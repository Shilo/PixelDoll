# Independent merge review — 2026-10-23

Scope: merge `a6e27de9ac17dbfd93f6f6d2feabd63d27b21c1a` against main parent `0eb169e04415c61798e8bd6346756ede88980997` and redesign parent `c641929861f5db15c54101ff8ef2c435b0ab1230`. Read-only source audit and offline reproductions. No tokens or environment files read; every reproduced HTTP request used a local fetch stub. Subsequently authorized regression tests were added in `app/test/unit/queue-activity-credential.test.ts`; production fixes remain owned by the coordinating reviewer.

## Confirmed merge regression

### P2 — A stale restored poll can reject replacement credentials

Location: `app/src/lib/pixellab/queue.ts:873–885` (merge revision).

`poll()` captures `key`, then awaits `restoreActivity()`, then captures `keyRevision`. A credential transition during restoration therefore pairs the old key with the new revision. A 401 from that old key satisfies the revision check and sets `paused = 'auth'` for the replacement key. A network failure can similarly pause the replacement session as offline. Forgetting the key during restoration also does not prevent the subsequent GET from using the forgotten key.

Realistic trigger: a long session evicts a still-running submission from the bounded Activity store (500 foreground entries). Its next poll reloads the original request image from IndexedDB for Activity. The user changes credentials while that read is pending. No paid request needs to be repeated to encounter the bug.

Parent comparison: main captures its revision immediately before API invocation without the new restoration await. Redesign captures the old key before restoration but rejects stale faults using `key === this.key`; a different replacement key therefore cannot be poisoned in that parent. The merged revision guard is captured on the wrong side of the new asynchronous boundary.

Existing `queue-credential-state.test.ts` late-poll tests supply `deps.api`, which bypasses the `deps.api === realApi` restoration branch. Their pending boundary is after HTTP invocation, so they do not exercise this regression.

Reproduction: run the following JavaScript from repository root using `.runtime.tmp/node-v24.22.1-win-x64/node.exe --input-type=module` with the script on stdin. Only synthetic credential strings appear; `globalThis.fetch` is fully replaced before any queue API invocation.

```js
import { Queue } from './app/src/lib/pixellab/queue.ts';
import { beginActivityCall, finishActivityCall, activityRequest } from './app/src/lib/pixellab/activity.ts';
let enteredResolve, release, blockedRead = false, requests = 0, usedOld = false;
const entered = new Promise(r => enteredResolve = r);
const blocked = new Promise(r => release = r);
const q = new Queue({ locks: null, online: () => true, now: () => 1000,
  put: async () => {}, putBlob: async () => 'synthetic-hash',
  getBlob: async () => {
    if (blockedRead) { enteredResolve(); return await blocked; }
    return new Blob([new Uint8Array([1])]);
  }
});
q.setKey('synthetic-old');
q.setBalance({ subscription: { status: 'active', plan: 'Tier 3' } }, q.key);
globalThis.fetch = async (_url, opts) => {
  if (opts.method === 'POST') return new Response('{"background_job_id":"synthetic-paid-job"}', { status: 200 });
  requests++;
  usedOld = opts.headers.authorization === 'Bearer synthetic-old';
  return new Response('{"detail":"Invalid API key"}', { status: 401 });
};
const r = await q.enqueue({ method: 'POST', path: '/animate-with-skeleton-v3',
  body: { image: { type: 'base64', base64: 'AQ==' }, seed: 1 } });
await q.tick();
for (let i = 0; i < 501; i++) {
  const id = beginActivityCall('GET', '/synthetic-free-read');
  finishActivityCall(id, 200, true);
}
console.log('activityEvicted', !activityRequest(r.id));
blockedRead = true;
const tick = q.tick();
await entered;
q.setKey('');
q.setKey('synthetic-new');
release(new Blob([new Uint8Array([1])]));
await tick;
console.log(JSON.stringify({ requests, usedOld, paused: q.paused,
  currentKeyNew: q.key === 'synthetic-new', state: r.state }));
```

Observed output:

```text
activityEvicted true
{"requests":1,"usedOld":true,"paused":"auth","currentKeyNew":true,"state":"running"}
```

Fix requirements: capture revision with key before restoration, and revalidate credentials and queue connection before HTTP invocation. Comparing key values alone misses Forget/reconnect with the same value. Moving the revision alone suppresses stale pause but still sends a request using forgotten credentials. Keep the accepted job running and preserve its identifier; do not cancel or recreate the paid job.

## Confirmed inherited robustness issue; not a merge-only finding

`hasPreparedInputs()` (`queue.ts:535`) suppresses the initial account read when every queued record has an unavailable input blob. `planWait()` then holds a Tier 1 workflow pending account verification, preventing submit's rehydration failure from marking the record failed locally. Actual Queue reproduction with an image-bearing minimumTier:1 request, missing input, synthetic key, and three ticks produced `state: queued`, `waitingForPlan: Waiting to verify your PixelLab plan. Retrying automatically…`, and zero API calls. Persisting that queued record and loading it has the same condition. This needs unavailable/corrupt persisted blobs and is present in redesign; it is not established as a normal-flow merge regression.

## Coverage challenge

Reviewed changes to measurement recovery, measurement retry, queue resume and credential-state tests. Most additions correctly accommodate free `/balance` calls; they do not remove paid submission counts. The changed recovery error assertion retains its no-publication/no-redraw checks. The significant missing coverage is the real-client Activity restoration boundary identified above. Source review and passing dependency-injected queue tests alone do not prove that boundary safe.

## Added regression evidence

Before production fixes, the new focused test file ran eight cases: **five failed, three passed**. Four failed because a replacement key, same-key Forget/reconnect, Forget alone, or disconnect during Activity restoration allowed the extra stale GET. The fifth loaded a queued Tier 1 measurement from persisted records with its blob missing and observed it stuck queued instead of failed. Passing controls preserve explicit cancellation during missing-input lookup and suppress auth/network faults from a poll already invoked before credentials changed. All HTTP calls, including the original synthetic submission, use stubbed fetch.

After the coordinating reviewer's production patch, independently inspected the connection/revision checks and missing-input mutation guards, then ran the focused file together with `queue-credential-state`, `queue-capacity`, `queue-resume`, and `measurement-retry`: **five test files, 81 tests passed**. Missing-input scanning now revalidates queue connection/leadership, record ownership/state, persistence and busy guards after storage awaits; it preserves an intervening cancellation. Accepted paid jobs remain running with their original identifiers throughout credential transitions.

Final challenge: the coordinating reviewer added two disconnect cases to the focused file, bringing it to **10 tests**. They cover both present and missing blobs while the preflight read is pending; releasing the queue must prevent every subsequent fetch and record write. Reviewed the added `work()` disconnect checks after the helper returns, including the false-result branch: both stop the suspended scheduler before account lookup, submission or polling. No concrete new race introduced by these fixes was found in this review.

The pre-existing Activity preparation-failure assertion changed from `attempts: 1` to `attempts: 0` because the failure now occurs during local input preflight, before `submit()` increments attempts. Its `state: failed`, `requestStarted: false`, no-foreground-Activity and reload checks remain. Replacing the former allowance for balance-only requests with `fetchMock.not.toHaveBeenCalled()` strengthens the network boundary. This is a justified behavioral update, not weakened coverage. Final independent targeted run, including `api-activity`, passed **six files and 103 tests**.

Command from `app/` (redirect temporary files to the existing writable runtime directory because the sandbox's default temporary-directory rename was denied):

```powershell
$env:TEMP = (Resolve-Path '../.runtime.tmp').Path
$env:TMP = $env:TEMP
& ../.runtime.tmp/node-v24.22.1-win-x64/node.exe node_modules/vitest/vitest.mjs run test/unit/queue-activity-credential.test.ts
```
