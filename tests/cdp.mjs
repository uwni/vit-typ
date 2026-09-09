/* A Chrome DevTools Protocol driver in one file: no package to install, no
   browser to download. `CHROME=/path/to/binary` overrides; otherwise the first
   of the usual places that exists is used — a Playwright cache if there is one,
   else the system's Chrome. Nothing here is specific to vit. */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/* the Playwright caches name their directory after a build number, so the
   version is looked up rather than written down */
const cached = (dir, ...rest) => {
  try {
    return readdirSync(dir)
      .filter(d => d.startsWith("chromium-") && !d.includes("headless"))
      .sort()
      .reverse()
      .map(d => join(dir, d, ...rest))
      .find(existsSync);
  } catch { return undefined; }
};

export const chrome = () => {
  const tries = [
    process.env.CHROME,
    cached(join(homedir(), "Library/Caches/ms-playwright"),
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
    cached(join(homedir(), "Library/Caches/ms-playwright"),
      "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
    cached(join(homedir(), ".cache/ms-playwright"), "chrome-linux/chrome"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = tries.filter(Boolean).find(existsSync);
  if (!found) throw new Error("no Chrome found; set CHROME=/path/to/chrome");
  return found;
};

/* Launch, and return the few things a check needs: evaluate an expression in
   the page, send a raw CDP command, and read what the page complained about. */
export async function open({ width = 1280, height = 800, port = 9333 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vit-cdp-"));
  const proc = spawn(chrome(), [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-sandbox",
    "--force-color-profile=srgb", "--hide-scrollbars",
    `--window-size=${width},${height}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"] });

  let list;
  for (let i = 0; i < 100 && !list?.length; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { }
    if (!list?.length) await new Promise(r => setTimeout(r, 100));
  }
  const target = list?.find(t => t.type === "page");
  if (!target) { proc.kill(); throw new Error("Chrome did not come up"); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r, { once: true }));

  let id = 0;
  const pending = new Map(), listeners = [];
  ws.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else listeners.forEach(f => f(m));
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const k = ++id;
    pending.set(k, m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: k, method, params }));
  });
  const on = f => listeners.push(f);

  /* everything the page said went wrong, in order */
  const errors = [];
  on(m => {
    if (m.method === "Runtime.exceptionThrown") {
      const e = m.params.exceptionDetails;
      errors.push(e.exception?.description ?? e.text);
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" "));
    }
  });

  /* The expression is a function body: `return` what the check wants, `await`
     freely. Anything thrown comes back as an Error on this side. */
  const evaluate = async expr => {
    const r = await send("Runtime.evaluate", {
      expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
    return r.result.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");

  const goto = async (url, ready) => {
    const loaded = new Promise(r => on(m => m.method === "Page.loadEventFired" && r()));
    await send("Page.navigate", { url });
    await loaded;
    if (ready) await evaluate(`
      await new Promise((ok, no) => {
        const t0 = Date.now();
        const t = () => document.querySelector(${JSON.stringify(ready)}) ? ok()
          : Date.now() - t0 > 60000 ? no(new Error("timed out waiting for ${ready}"))
          : requestAnimationFrame(t);
        t();
      });
      return 1;`);
  };

  /* the profile is scratch: the browser is still writing to it as it goes down,
     and a directory left behind in the system's temp is nobody's problem */
  const close = () => {
    ws.close();
    proc.kill();
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch { }
  };
  return { send, on, evaluate, goto, errors, close };
}
