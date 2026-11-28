// Serves the spike page and an extracted PixelDoll export on a fixed loopback port so the
// origin (and its IndexedDB handle store) stays the same across browser restarts.
// Usage: node serve.mjs <extracted export dir> [port]
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "");
const port = Number(process.argv[3] ?? 5288);
const here = new URL(".", import.meta.url);
const pages = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/plan.mjs": ["plan.mjs", "text/javascript; charset=utf-8"],
  "/manifest.webmanifest": [
    "manifest.webmanifest",
    "application/manifest+json",
  ],
  "/icon-192.png": [
    "../../../../app/public/icons/pwa/icon-192.png",
    "image/png",
  ],
  "/icon-512.png": [
    "../../../../app/public/icons/pwa/icon-512.png",
    "image/png",
  ],
};

async function list(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await list(p)));
    else out.push(relative(root, p).split(sep).join("/"));
  }
  return out;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const page = pages[url.pathname];
    let body, type;
    if (page) [body, type] = [await readFile(new URL(page[0], here)), page[1]];
    else if (url.pathname === "/export/list.json")
      [body, type] = [JSON.stringify(await list(root)), "application/json"];
    else if (url.pathname.startsWith("/export/")) {
      const file = resolve(root, decodeURIComponent(url.pathname.slice(8)));
      if (!file.startsWith(root + sep))
        throw Object.assign(new Error("outside"), { code: "ENOENT" });
      [body, type] = [await readFile(file), "application/octet-stream"];
    } else throw Object.assign(new Error("missing"), { code: "ENOENT" });
    res
      .writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" })
      .end(body);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500).end();
    if (error.code !== "ENOENT") console.error(error);
  }
}).listen(port, "127.0.0.1", () => console.log(`http://localhost:${port}/`));
