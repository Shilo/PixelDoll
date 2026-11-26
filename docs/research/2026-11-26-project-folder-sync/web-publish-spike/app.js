// Browser adapter for automatic project publishing through the File System Access API.
// The "library" is an extracted real Studio export held in IndexedDB; saveEdit() stands in
// for a saved Studio edit and publishing runs from that save, never from a click.
import {
  INDEX_NAME,
  committedIndex,
  pendingIndex,
  planWithIndex,
} from "./plan.mjs";

const SUBTREE = ["assets", "pixeldoll", "adventurer"];
const WALK = "layers/body/base/main/walk.png";
const RW = { mode: "readwrite" };
const events = (window.__events = []);
const $ = (id) => document.getElementById(id);

function emit(name, detail = {}) {
  const e = {
    t: Date.now(),
    name,
    visibility: document.visibilityState,
    ...detail,
  };
  events.push(e);
  $("log").textContent +=
    `${new Date(e.t).toISOString().slice(11, 23)} ${name} ${JSON.stringify(detail)}\n`;
}

const req = (r) =>
  new Promise((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
const opening = indexedDB.open("publish-probe", 1);
opening.onupgradeneeded = () => {
  opening.result.createObjectStore("kv");
  opening.result.createObjectStore("files");
};
const db = await req(opening);
const store = (name, mode = "readonly") =>
  db.transaction(name, mode).objectStore(name);
const kvGet = (k) => req(store("kv").get(k));
const kvSet = (k, v) => req(store("kv", "readwrite").put(v, k));

async function loadLibrary() {
  const keys = await req(store("files").getAllKeys());
  if (keys.length) return keys.length;
  const paths = await (await fetch("/export/list.json")).json();
  const entries = await Promise.all(
    paths.map(async (p) => [
      p,
      await (await fetch("/export/" + encodeURI(p))).arrayBuffer(),
    ]),
  );
  const tx = db.transaction("files", "readwrite");
  for (const [p, bytes] of entries) tx.objectStore("files").put(bytes, p);
  await new Promise(
    (ok, fail) => ((tx.oncomplete = ok), (tx.onabort = () => fail(tx.error))),
  );
  await kvSet("revision", 1);
  return entries.length;
}

async function hash(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function dirFor(root, parts, create) {
  let dir = root;
  for (const part of parts)
    dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

async function readFile(root, path) {
  const parts = [...SUBTREE, ...path.split("/")];
  try {
    const dir = await dirFor(root, parts.slice(0, -1), false);
    return await (await dir.getFileHandle(parts.at(-1))).getFile();
  } catch (error) {
    if (error.name === "NotFoundError") return null;
    throw error;
  }
}

async function writeFile(root, path, bytes) {
  const parts = [...SUBTREE, ...path.split("/")];
  const dir = await dirFor(root, parts.slice(0, -1), true);
  const out = await (
    await dir.getFileHandle(parts.at(-1), { create: true })
  ).createWritable();
  try {
    await out.write(bytes);
    await out.close();
  } catch (error) {
    await out.abort().catch(() => {});
    throw error;
  }
}

async function removeFile(root, path) {
  const parts = [...SUBTREE, ...path.split("/")];
  await (
    await dirFor(root, parts.slice(0, -1), false)
  ).removeEntry(parts.at(-1));
}

let folder = await kvGet("folder");
let timer = 0;

async function permission() {
  if (!folder) return "unlinked";
  return folder.queryPermission(RW);
}

async function publish({ removeStale = false } = {}) {
  return navigator.locks.request("publish", async () => {
    const started = performance.now();
    const state = await permission();
    if (state !== "granted") {
      $("reconnect").disabled = !folder;
      $("status").textContent = folder
        ? "Reconnect to keep publishing"
        : "Link a project folder";
      emit("needs-reconnect", { permission: state });
      return { permission: state };
    }
    const revision = await kvGet("revision");
    try {
      const paths = await req(store("files").getAllKeys());
      const next = new Map();
      const bytes = new Map();
      for (const p of paths) {
        const b = await req(store("files").get(p));
        bytes.set(p, b);
        next.set(p, await hash(b));
      }
      const indexFile = await readFile(folder, INDEX_NAME);
      const index = indexFile ? JSON.parse(await indexFile.text()) : null;
      const disk = new Map();
      const candidates = new Set([
        ...next.keys(),
        ...Object.keys(index?.committed ?? {}),
        ...Object.keys(index?.pending ?? {}),
      ]);
      for (const p of candidates) {
        const f = await readFile(folder, p);
        disk.set(p, f ? await hash(await f.arrayBuffer()) : null);
      }
      const plan = planWithIndex({ next, index, disk, removeStale });
      if (plan.blocked) {
        $("status").textContent =
          `Paused: ${plan.conflicts.length} file(s) changed outside PixelDoll`;
        emit("blocked", { revision, conflicts: plan.conflicts });
        return { blocked: plan.conflicts };
      }
      const counts = {};
      for (const a of plan.actions) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
      if (
        plan.writes.length ||
        plan.removals.length ||
        plan.recovering ||
        !index
      ) {
        await writeFile(
          folder,
          INDEX_NAME,
          JSON.stringify(pendingIndex(index, next, plan)),
        );
        // Manifest last so a reader that keys off it never sees a newer manifest than its sheets.
        const order = [...plan.writes].sort(
          (a, b) => (a.path === "manifest.json") - (b.path === "manifest.json"),
        );
        let written = 0;
        for (const a of order) {
          if (window.__slowMs)
            await new Promise((r) => setTimeout(r, window.__slowMs));
          await writeFile(folder, a.path, bytes.get(a.path));
          written++;
          if (written % 50 === 0) emit("progress", { written });
        }
        for (const a of plan.removals) await removeFile(folder, a.path);
        await writeFile(
          folder,
          INDEX_NAME,
          JSON.stringify(committedIndex(next, plan)),
        );
      }
      await kvSet("published", revision);
      const ms = Math.round(performance.now() - started);
      $("status").textContent = `Published revision ${revision}`;
      emit("published", { revision, counts, recovering: plan.recovering, ms });
      return { revision, counts, ms };
    } catch (error) {
      $("status").textContent = `Publish failed: ${error.name}`;
      emit("publish-failed", {
        revision,
        error: error.name,
        message: error.message,
      });
      return { error: error.name, message: error.message };
    }
  });
}

function schedule(delay = 250) {
  clearTimeout(timer);
  emit("scheduled", { delay });
  timer = setTimeout(() => void publish(), delay);
}

// Stand-in for a saved Studio edit: change one opaque pixel of the walk sheet and the manifest.
async function saveEdit() {
  const original = await req(store("files").get(WALK));
  const bitmap = await createImageBitmap(new Blob([original]), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  let i = 0;
  while (data.data[i + 3] !== 255) i += 4;
  data.data[i] = (data.data[i] + 37) % 256;
  ctx.putImageData(data, 0, 0);
  const png = await (
    await canvas.convertToBlob({ type: "image/png" })
  ).arrayBuffer();
  const revision = (await kvGet("revision")) + 1;
  const manifest = JSON.parse(
    new TextDecoder().decode(await req(store("files").get("manifest.json"))),
  );
  manifest.export.exportedAt = new Date().toISOString();
  const tx = db.transaction(["files", "kv"], "readwrite");
  tx.objectStore("files").put(png, WALK);
  tx.objectStore("files").put(
    new TextEncoder().encode(JSON.stringify(manifest, null, "\t")).buffer,
    "manifest.json",
  );
  tx.objectStore("kv").put(revision, "revision");
  await new Promise(
    (ok, fail) => ((tx.oncomplete = ok), (tx.onabort = () => fail(tx.error))),
  );
  const pixel = {
    x: (i / 4) % bitmap.width,
    y: Math.floor(i / 4 / bitmap.width),
    r: data.data[i],
  };
  emit("saved", {
    revision,
    pixel,
    userActivation: navigator.userActivation?.isActive ?? null,
  });
  schedule();
  return { revision, pixel };
}

let observer = null;
async function observe() {
  if (typeof FileSystemObserver !== "function")
    return emit("observer", { supported: false });
  observer = new FileSystemObserver((records) => {
    for (const r of records.slice(0, 20))
      emit("observed", {
        type: r.type,
        path: r.relativePathComponents?.join("/"),
      });
  });
  await observer.observe(await dirFor(folder, SUBTREE, true), {
    recursive: true,
  });
  emit("observer", { supported: true });
}

$("link").addEventListener("click", async () => {
  try {
    folder = await showDirectoryPicker({ ...RW, id: "pixeldoll-project" });
    await kvSet("folder", folder);
    emit("linked", { name: folder.name });
    await publish();
  } catch (error) {
    emit("link-failed", { error: error.name, message: error.message });
  }
});

$("reconnect").addEventListener("click", async () => {
  try {
    const state = await folder.requestPermission(RW);
    emit("reconnect", { permission: state });
    if (state === "granted") {
      $("reconnect").disabled = true;
      await publish();
    }
  } catch (error) {
    emit("reconnect-failed", { error: error.name, message: error.message });
  }
});

window.probe = { saveEdit, publish, observe, permission, kvGet };
emit("ready", {
  files: await loadLibrary(),
  picker: typeof showDirectoryPicker,
  observer: typeof FileSystemObserver,
  linked: !!folder,
  permission: await permission(),
  standalone: matchMedia("(display-mode: standalone)").matches,
});
$("reconnect").disabled = !folder;
$("status").textContent = folder
  ? "Folder remembered"
  : "Link a project folder";
// Resume a save that happened while access was missing or the page was closed.
if (folder && (await kvGet("revision")) !== (await kvGet("published")))
  schedule(0);
