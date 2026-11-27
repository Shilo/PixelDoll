import assert from "node:assert/strict";
import {
  DELETED,
  PENDING,
  planPublish,
} from "../../../app/src/lib/project-folder/plan.ts";

const path = "_PixelDoll/runtime.js";
const v1 = "runtime-v1-hash";
const v2 = "runtime-v2-hash";
const custom = "user-edited-hash";
const plan = (want, disk, mine, approved) =>
  planPublish({
    next: new Map([[path, want]]),
    disk: new Map([[path, disk]]),
    record: { written: mine === undefined ? {} : { [path]: mine }, kept: [] },
    overwrite: approved === undefined ? undefined : new Map([[path, approved]]),
  }).actions[0];

const rows = [
  [
    "A second character sees matching bytes with no ownership record",
    plan(v1, v1),
    "foreign",
    undefined,
  ],
  [
    "A second character may mistake a deleted runtime for a new path",
    plan(v1, null),
    "create",
    undefined,
  ],
  [
    "An old tab reading a shared record can roll a mutable runtime back",
    plan(v1, v2, v2),
    "update",
    undefined,
  ],
  [
    "A user edit requires approval of the bytes found",
    plan(v2, custom, v1),
    "conflict",
    "edited-outside",
  ],
  [
    "An approval for different bytes cannot replace the current file",
    plan(v2, custom, v1, v1),
    "conflict",
    "edited-outside",
  ],
  [
    "An approval for the exact foreign bytes permits replacement",
    plan(v2, custom, v1, custom),
    "update",
    undefined,
  ],
  [
    "A completed runtime file cannot be silently recreated after deletion",
    plan(v1, null, v1),
    "conflict",
    "deleted",
  ],
  [
    "A pending runtime file cannot be silently recreated after deletion",
    plan(v1, null, PENDING),
    "conflict",
    "deleted",
  ],
  [
    "A user can explicitly approve recreation after deletion",
    plan(v1, null, v1, DELETED),
    "restore",
    undefined,
  ],
];
for (const [test, result, kind, reason] of rows) {
  assert.equal(result.kind, kind, test);
  assert.equal(result.reason, reason, test);
  console.log("PASS", test, result.kind);
}
