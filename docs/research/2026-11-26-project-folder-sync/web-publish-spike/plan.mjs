// Publish planner shared by every filesystem adapter (browser handle, native shell or CLI).
// It decides per path from three inputs and never touches a path outside the export or the
// ownership index, so engine sidecars such as Godot .import/.uid and Unity .meta survive.

export const INDEX_NAME = ".pixeldoll-publish.json";

// next: Map<path, hash> the files PixelDoll wants at the destination.
// owned: Map<path, Set<hash>> bytes PixelDoll wrote there (committed plus pending from an
// interrupted publish, so recovery does not mistake its own half-finished writes for edits).
// disk: Map<path, hash | null> current hash of every path in next or owned (null = missing).
export function planPublish({ next, owned, disk, removeStale = false }) {
  const actions = [];
  for (const [path, hash] of next) {
    const current = disk.get(path) ?? null;
    const mine = owned.get(path);
    if (current === hash)
      actions.push({ path, kind: mine ? "unchanged" : "adopt" });
    else if (current === null)
      actions.push({ path, kind: mine ? "restore" : "create" });
    else if (mine?.has(current)) actions.push({ path, kind: "update" });
    else
      actions.push({
        path,
        kind: "conflict",
        reason: mine ? "edited-outside" : "not-ours",
      });
  }
  for (const [path, hashes] of owned) {
    if (next.has(path)) continue;
    const current = disk.get(path) ?? null;
    if (current === null) actions.push({ path, kind: "gone" });
    else if (hashes.has(current))
      actions.push({ path, kind: removeStale ? "remove" : "stale" });
    else actions.push({ path, kind: "stale-edited" });
  }
  const conflicts = actions.filter((a) => a.kind === "conflict");
  return {
    actions,
    conflicts,
    blocked: conflicts.length > 0,
    writes: actions.filter(
      (a) => a.kind === "create" || a.kind === "update" || a.kind === "restore",
    ),
    removals: actions.filter((a) => a.kind === "remove"),
  };
}

// Index written before any file (pending) and again after the last one (committed).
export function pendingIndex(index, next, plan) {
  const pending = {};
  for (const a of plan.writes) pending[a.path] = next.get(a.path);
  return { version: 1, committed: index?.committed ?? {}, pending };
}

export function committedIndex(next, plan) {
  const committed = {};
  for (const [path, hash] of next) committed[path] = hash;
  for (const a of plan.actions) {
    // A stale generated file stays owned so a later reviewed removal can still match it.
    if (a.kind === "stale") committed[a.path] = plan.ownedHash(a.path);
  }
  return { version: 1, committed, pending: null };
}

export function ownedFrom(index) {
  const owned = new Map();
  const add = (path, hash) => {
    if (!owned.has(path)) owned.set(path, new Set());
    owned.get(path).add(hash);
  };
  for (const [p, h] of Object.entries(index?.committed ?? {})) add(p, h);
  for (const [p, h] of Object.entries(index?.pending ?? {})) add(p, h);
  return owned;
}

// Convenience wrapper so adapters only supply hashing, reads and writes.
export function planWithIndex({ next, index, disk, removeStale }) {
  const owned = ownedFrom(index);
  const plan = planPublish({ next, owned, disk, removeStale });
  plan.ownedHash = (path) => disk.get(path);
  plan.recovering = !!index?.pending;
  return plan;
}
