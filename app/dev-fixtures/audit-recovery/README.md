# Offline audit evidence recovery

Developer-only standalone page: `/dev-fixtures/audit-recovery/index.html` on the existing localhost Vite origin containing the failed creation. It is not a production entry or recovery feature.

The page immediately opts out of agent connection. Only the visible Inspect button reads `studio-create`, jobs and referenced PNGs. It creates an idle-only editable ZIP in memory, validates it by import, and enables an explicit download. No project/job is written or retried. The original idle+walk creation stays failed. Diagnostic thumbnails show the exact lost estimator inputs matched to stored walking frames, including opaque counts and bounds. No conclusion about the provider's HTTP500 cause is assumed.

Recovery requires an independent four-view 48/56px saved spec, matching original rotations/rest import and measured rest joints, complete raw idle requests, and actual done estimator results matching each cleaned frame's exact PNG hash. Missing or malformed evidence stops recovery. Existing QA warnings stay visible. Provenance/usage covers selected source records, not the entire failed attempt.

First open Studio keyless and dismiss the failed creation visibly. A separate helper button may enable agent connection on a later Studio load; it never fetches a credential or navigates. The keyless link always reapplies the opt-out. No credential module or production bootstrap is imported; CSP blocks external connections.

Offline checks from `app/`: `npx vitest run test/unit/audit-recovery.test.ts` and `npx tsc -p dev-fixtures/audit-recovery/tsconfig.json`. The helper's source imports pure route-shape definitions through existing cleanup/QA helpers; it imports no HTTP client or queue.
