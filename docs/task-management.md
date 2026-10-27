# Task management rationale and limits

Automatic task tracking keeps requested work discoverable across sessions while the maintainer controls priorities
and scope. The operating rules live in [AGENTS.md, Tasks](../AGENTS.md#tasks); authorization troubleshooting lives in
[GitHub CLI authorization workflow](github-cli-workflow.md).

## Why the policy uses requested outcomes

Tracking every explicitly requested project change, including tiny fixes, provides a consistent record without an
ambiguous threshold for "significant" work. It deliberately accepts the extra board operations and completed cards.
One card represents an independent outcome; follow-ups and delegated implementation steps stay with that outcome.

Existing cards are matched by scope so differently worded requests do not generate duplicates. A matching card
does not expand the user's request: scope approval, prerequisite approval and another session's ownership are
separate concerns. Routine maintenance applies to the selected work; priorities and unrelated backlog cleanup
remain under the maintainer's control.

Whole-card completion preserves the meaning of Done. A completed slice of a larger card leaves its remaining scope
intact and returns that work to Ready or deferred Later. Requested work still awaiting checks or review remains
unfinished. Incomplete original delivery and a later regression have separate histories: the former reopens its
original card, while the latter gets a linked card.

## Accepted tool limits

These limits were checked against [the board CLI](../app/scripts/board.mjs).

| Limit | Consequence |
|---|---|
| Concurrent sessions have no atomic claim or recorded owner. Duplicate-title checking is not atomic and does not detect equivalent scopes with different titles. | Match and status rechecks reduce races but cannot eliminate them. Active overlapping work needs a handoff; dropping a duplicate card remains a maintainer decision. |
| Archived listings expose titles, IDs and markers, but the CLI cannot show archived bodies or restore cards. | A likely match needs manual restoration before its scope can be inspected. Tracking waits; independently authorized file work may continue. |
| Card creation, status assignment and Origin metadata assignment are separate mutations. | A failed add may leave a draft with no status, or a Ready card whose Origin update failed. Reconciliation uses the actual card state before retrying; the current CLI cannot inspect or repair Origin metadata. |
| GitHub access or a status update can fail independently of implementation. | File delivery and board synchronization can finish separately. Pending tracking stays visible in the agent's report; an outage supplies no authority to choose unseen backlog work or bypass a known blocker. |

## Review findings and validation

The policy change in [commit 5e986d4b](https://github.com/Shilo/PixelDoll/commit/5e986d4b) was independently challenged
and tested on October 27, 2026. Three fresh test agents evaluated 52 mock scenario cases, with focused retests after
wording changes:

- 16 cases covered new requests, reuse, delegation, spending, installation, failed checks and requested review.
- 18 cases covered existing cards, partial scope, deferred work, continuation, regressions, archived candidates
  and ambiguous matches.
- 18 cases covered access failures, uncertain mutations, generic blockers, concurrent sessions and validation gaps.

The tests exposed unclear authorization for a slice of a larger card, incomplete treatment of generic blockers,
and ambiguous card selection. The saved instructions were tightened and retested; the final reviews reported no
unresolved material policy issues in those cases.

These were simulated decisions, not live concurrency or GitHub failure injection. The actual policy task completed
its Ready to Progress to Done lifecycle successfully. The review supports the intended behavior; it does not
guarantee instruction following in every future session.

Repeated duplicate cards, ownership conflicts or lost synchronization would justify revisiting the tooling.
Changes to archived-card or Origin support would also warrant updating the accepted limits above.
