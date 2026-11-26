// Minimal Chrome DevTools Protocol driver for a real Edge or Chrome window (no Playwright, so
// the browser shows its genuine folder picker and permission prompts).
// CDP_PORT (default 9333) selects the debugging port.
// node drive.mjs launch <browser exe> <profile dir> <url>
// node drive.mjs eval <expression>     -- awaits the result, prints JSON
// node drive.mjs click <css selector>  -- trusted mouse click (grants user activation)
// node drive.mjs close
// node drive.mjs cdp <method> [json params]
import { spawn } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
const portArg = () => Number(process.env.CDP_PORT ?? 9333);

async function target(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  // CDP_TARGET picks a page whose URL contains it (for example a browser settings tab).
  const want = process.env.CDP_TARGET ?? "http://localhost";
  return (
    list.find((t) => /page|browser_ui/.test(t.type) && t.url.includes(want)) ??
    list.find((t) => t.type === "page")
  );
}

function session(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, fail } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? fail(new Error(JSON.stringify(msg.error))) : ok(msg.result);
    }
  };
  const ready = new Promise(
    (ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)),
  );
  const send = async (method, params = {}) => {
    await ready;
    return new Promise((ok, fail) => {
      waiting.set(++id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  return { send, close: () => ws.close() };
}

async function evaluate(s, expression) {
  const r = await s.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
    );
  return r.result.value;
}

if (cmd === "launch") {
  const [exe, profile, url] = args;
  const port = portArg();
  const child = spawn(
    exe,
    [
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      // BROWSER_FLAGS adds switches, such as turning off occlusion so a covered window stays visible.
      ...(process.env.BROWSER_FLAGS ?? "").split(" ").filter(Boolean),
      "--new-window",
      url,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  for (let i = 0; i < 60; i++) {
    try {
      const t = await target(port);
      if (t) {
        console.log(JSON.stringify({ pid: child.pid, url: t.url }));
        process.exit(0);
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("browser did not expose a page");
} else {
  const port = portArg();
  const t = await target(port);
  const s = session(t.webSocketDebuggerUrl);
  if (cmd === "eval") console.log(JSON.stringify(await evaluate(s, args[0])));
  else if (cmd === "click") {
    const box = await evaluate(
      s,
      `(() => { const r = document.querySelector(${JSON.stringify(args[0])}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    );
    await s.send("Page.bringToFront");
    for (const type of ["mousePressed", "mouseReleased"])
      await s.send("Input.dispatchMouseEvent", {
        type,
        x: box.x,
        y: box.y,
        button: "left",
        clickCount: 1,
      });
    console.log(JSON.stringify({ clicked: args[0] }));
  } else if (cmd === "close") {
    const browser = await (
      await fetch(`http://127.0.0.1:${port}/json/version`)
    ).json();
    const b = session(browser.webSocketDebuggerUrl);
    await b.send("Browser.close").catch(() => {});
    b.close();
  } else if (cmd === "cdp")
    console.log(
      JSON.stringify(await s.send(args[0], JSON.parse(args[1] ?? "{}"))),
    );
  s.close();
}
