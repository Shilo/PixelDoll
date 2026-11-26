import assert from "node:assert/strict";
import { test } from "node:test";
import { committedIndex, pendingIndex, planWithIndex } from "./plan.mjs";

const m = (o) => new Map(Object.entries(o));
const kinds = (plan) =>
  Object.fromEntries(plan.actions.map((a) => [a.path, a.kind]));

test("first publish creates files and adopts identical manual extracts", () => {
  const plan = planWithIndex({
    next: m({ "a.png": "A", "manifest.json": "M" }),
    index: null,
    disk: m({ "a.png": null, "manifest.json": "M" }),
  });
  assert.deepEqual(kinds(plan), {
    "a.png": "create",
    "manifest.json": "adopt",
  });
  assert.equal(plan.blocked, false);
});

test("a foreign file at a target path blocks the whole publish", () => {
  const plan = planWithIndex({
    next: m({ "a.png": "A" }),
    index: null,
    disk: m({ "a.png": "X" }),
  });
  assert.equal(plan.blocked, true);
  assert.equal(plan.conflicts[0].reason, "not-ours");
});

test("republish updates only changed owned files and blocks on an external edit", () => {
  const index = {
    committed: { "a.png": "A1", "b.png": "B1", "c.png": "C1" },
    pending: null,
  };
  const clean = planWithIndex({
    next: m({ "a.png": "A2", "b.png": "B1", "c.png": "C1" }),
    index,
    disk: m({ "a.png": "A1", "b.png": "B1", "c.png": "C1" }),
  });
  assert.deepEqual(kinds(clean), {
    "a.png": "update",
    "b.png": "unchanged",
    "c.png": "unchanged",
  });
  const edited = planWithIndex({
    next: m({ "a.png": "A2", "b.png": "B1", "c.png": "C1" }),
    index,
    disk: m({ "a.png": "A1", "b.png": "B1", "c.png": "GAME" }),
  });
  assert.equal(edited.blocked, true);
  assert.deepEqual(edited.conflicts, [
    { path: "c.png", kind: "conflict", reason: "edited-outside" },
  ]);
});

test("an interrupted publish recovers without treating its own writes as edits", () => {
  const next = m({ "a.png": "A2", "b.png": "B2" });
  const before = { committed: { "a.png": "A1", "b.png": "B1" }, pending: null };
  const first = planWithIndex({
    next,
    index: before,
    disk: m({ "a.png": "A1", "b.png": "B1" }),
  });
  const crashed = pendingIndex(before, next, first);
  // a.png landed, b.png did not, then the browser died.
  const retry = planWithIndex({
    next,
    index: crashed,
    disk: m({ "a.png": "A2", "b.png": "B1" }),
  });
  assert.equal(retry.recovering, true);
  assert.deepEqual(kinds(retry), { "a.png": "unchanged", "b.png": "update" });
  // The library changed again before recovery: pending bytes still count as ours.
  const newer = planWithIndex({
    next: m({ "a.png": "A3", "b.png": "B2" }),
    index: crashed,
    disk: m({ "a.png": "A2", "b.png": "B1" }),
  });
  assert.deepEqual(kinds(newer), { "a.png": "update", "b.png": "update" });
});

test("stale generated files stay unless removal is requested and still match", () => {
  const index = {
    committed: { "old.png": "O", "edited.png": "E" },
    pending: null,
  };
  const disk = m({ "old.png": "O", "edited.png": "GAME" });
  const keep = planWithIndex({ next: m({}), index, disk });
  assert.deepEqual(kinds(keep), {
    "old.png": "stale",
    "edited.png": "stale-edited",
  });
  assert.deepEqual(committedIndex(m({}), keep).committed, { "old.png": "O" });
  const remove = planWithIndex({ next: m({}), index, disk, removeStale: true });
  assert.deepEqual(kinds(remove), {
    "old.png": "remove",
    "edited.png": "stale-edited",
  });
});

test("engine sidecars are never part of a plan", () => {
  const plan = planWithIndex({
    next: m({ "a.png": "A2" }),
    index: { committed: { "a.png": "A1" }, pending: null },
    disk: m({ "a.png": "A1" }),
  });
  assert.deepEqual(
    plan.actions.map((a) => a.path),
    ["a.png"],
  );
});
