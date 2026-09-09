/* The invariants — the properties a build has to have whatever the deck says.
   Written as the properties themselves rather than as the symptoms: every
   defect this suite exists to catch showed up first as one of these being
   false somewhere nobody was looking.

     node tests/invariants.mjs                 build tests/fixture.typ and check it
     node tests/invariants.mjs path/to.html    check a deck that is already built

   `typst` must be on PATH; if the deck's packages live outside the default
   package directory, set TYPST_PACKAGE_PATH as you would to build by hand. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "./cdp.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/* ── saying what held and what did not ──────────────────────────────── */
const results = [];
/* `ok` may also be "n/a": a property this deck has nothing to test it with. Said
   out loud rather than passed quietly — a check that never ran is not a check
   that held. */
const check = (name, ok, detail = "") => results.push({ name, ok: ok === "n/a" ? ok : !!ok, detail });
const same = (name, got, want) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ── the deck under test ────────────────────────────────────────────── */
const build = () => {
  const out = join(mkdtempSync(join(tmpdir(), "vit-fixture-")), "fixture.html");
  try {
    execFileSync("typst", ["compile", "--root", ROOT, "--features", "html",
      join(ROOT, "tests/fixture.typ"), out], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    process.stderr.write(String(e.stderr ?? e.message));
    throw new Error("the fixture did not compile");
  }
  return out;
};
const file = process.argv[2] ? resolve(process.argv[2]) : build();
const html = readFileSync(file, "utf8");

/* ── what the two sides agree on, read from the source ───────────────
   These need no browser: they are the Typst side and the JS side being asked
   to show the same vocabulary. A control the document emits and nobody binds
   is silent at runtime, which is why it is checked here. */

/* the keys of a `const NAME = { … }` table, at its top level */
const topKeys = (src, decl) => {
  const at = src.indexOf(decl);
  if (at < 0) return null;
  let i = src.indexOf("{", at), depth = 0;
  const keys = [];
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") { depth++; continue; }
    if (c === "}") { if (--depth === 0) break; continue; }
    if (depth === 1) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(src.slice(i));
      if (m && /[{,\s]/.test(src[i - 1] ?? "")) { keys.push(m[1]); i += m[0].length - 1; }
    }
  }
  return keys;
};

/* the deck and the chrome, since it is the chrome that binds the controls */
const player = ["runtime.js", "chrome.js"].map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const lib = readFileSync(join(ROOT, "lib.typ"), "utf8");
/* the deck carries its own scripts and stylesheet inline, and those mention the
   very attribute names being looked for — so the markup is read on its own */
const markup = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const attrs = name => [...new Set([...markup.matchAll(new RegExp(`data-${name}="([^"]*)"`, "g"))].map(m => m[1]))];

{
  const tokens = /:root\{([^}]*)\}/.exec(html)?.[1] ?? "";
  const names = [...tokens.matchAll(/--vit-([\w-]+)\s*:/g)].map(m => m[1]);
  const need = ["page", "w", "h", "duration", "easing"];
  check("the layout's constants reach the stylesheet",
    need.every(k => names.includes(k)),
    `:root has ${names.length} tokens, missing ${need.filter(k => !names.includes(k)).join(" ") || "none"}`);
}
{
  const bound = topKeys(player, "const acts = {");
  const emitted = attrs("act").filter(a => a !== "reset");   // reset is the panel's own
  check("every toolbar button the document emits is bound",
    emitted.every(a => bound?.includes(a)),
    `emitted ${emitted.join(" ")}; bound ${bound?.join(" ")}`);
}
{
  const dials = topKeys(player, "const DIALS = {");
  const emitted = attrs("set");
  const outs = attrs("out");
  check("every settings control the document emits has a dial",
    emitted.every(a => dials?.includes(a)), `emitted ${emitted.join(" ")}; dials ${dials?.join(" ")}`);
  check("every readout names a control that exists", outs.every(o => emitted.includes(o)), outs.join(" "));
}
{
  /* What the deck itself says, for the runtime to read back. A value the Typst
     side stops writing, or writes in another shape, is a player that quietly
     falls back to a default. */
  const deck = /<div class="vit-deck"([^>]*)>/.exec(markup)?.[1] ?? "";
  const attr = k => new RegExp(`data-${k}="([^"]*)"`).exec(deck)?.[1];
  const shape = {
    duration: v => /^\d+$/.test(v),
    easing: v => v?.split(" ").length === 4 && v.split(" ").every(x => !Number.isNaN(+x)),
    theme: v => ["auto", "light", "dark"].includes(v),
    version: v => /^\d+\.\d+\.\d+$/.test(v),
  };
  const wrong = Object.entries(shape).filter(([k, ok]) => !ok(attr(k))).map(([k]) => `${k}=${attr(k)}`);
  check("the deck says what the runtime reads off it", wrong.length === 0, wrong.join(" "));

  const frames = [...markup.matchAll(/<section class="vit-slide"([^>]*)>/g)].map(m => m[1]);
  const bad = frames.filter(f => !/data-steps="\d+"/.test(f)
    || (/data-transition/.test(f) && !/data-transition="(enter-[\w-]+ leave-[\w-]+)( [\w-]+)*"/.test(f)));
  check("and every frame says how it comes in and how far it steps",
    frames.length > 0 && bad.length === 0, `${frames.length} frames, ${bad.length} malformed`);
}

{
  const list = /#let transitions = \(([^)]*)\)/.exec(lib)?.[1] ?? "";
  const names = [...list.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const missing = names.filter(t => !html.includes(`enter-${t}`) || !html.includes(`leave-${t}`));
  check("every effect name has rules in the stylesheet", names.length > 0 && missing.length === 0,
    `${names.length} effects, missing ${missing.join(" ") || "none"}`);
}

/* ── and what only the browser can answer ───────────────────────────── */
let model = [], labels = [];
const page = await open({ width: 1280, height: 800, port: 9351 });
try {
  await page.goto("file://" + file, ".vit-deck[data-ready]");

  /* Every view transition is instrumented from here on: a capture that fails
     is not a transition that looks wrong, it is no transition at all, and the
     only place it shows is `ready` rejecting. */
  await page.evaluate(`
    window.__vt = { started: 0, failed: [] };
    const real = window.__real = document.startViewTransition.bind(document);
    document.startViewTransition = opts => {
      window.__vt.started++;
      const t = real(opts);
      t.ready.catch(e => window.__vt.failed.push({ why: String(e && e.message || e), types: [...(opts.types || [])], mode: document.documentElement.dataset.mode }));
      return t;
    };
    window.__settle = ms => new Promise(r => setTimeout(r, ms ?? 260));
    /* Wait for the move itself rather than for a duration: a deck's own pace is
       its business, and the address bar is written when the move is announced. */
    window.__move = fn => new Promise(r => {
      const deck = document.querySelector('.vit-deck');
      let done = false;
      const ok = () => { if (done) return; done = true; deck.removeEventListener('vit:move-ready', ok); r(); };
      deck.addEventListener('vit:move-ready', ok);
      fn();
      setTimeout(ok, 1500);   // a press with nowhere to go announces nothing
    });
    /* the move is announced when the new position is in the DOM; this waits
       until it has finished moving, which is when what plays by itself may */
    window.__done = fn => new Promise(r => {
      const deck = document.querySelector('.vit-deck');
      let done = false;
      const ok = () => { if (done) return; done = true; deck.removeEventListener('vit:move-done', ok); r(); };
      deck.addEventListener('vit:move-done', ok);
      fn();
      setTimeout(ok, 4000);
    });
    window.__model = () => [...document.querySelectorAll('.vit-deck .vit-group')].map((g, k) => {
      const frames = [...g.querySelectorAll('.vit-slide')].map(s => +s.dataset.steps || 0);
      const pos = frames.reduce((n, s) => n + s + 1, 0);
      return { page: k + 1, frames: frames.length, pos,
               labels: frames.flatMap((s, f) => Array.from({length: s + 1}, (_, i) => i))
                 .map((_, i) => pos > 1 ? \`\${k + 1}.\${i + 1}\` : String(k + 1)) };
    });
    return 1;`);

  /* Read while presenting: at the desk one frame is not in the deck at all
     (see "every frame is in the deck", below). */
  model = await page.evaluate("window.vit.mode = 'present'; await window.__settle(400); return window.__model();");
  labels = model.flatMap(g => g.labels);

  /* the position sequence: one press is one notch, and every notch is where
     the address bar said it would be */
  {
    const walk = await page.evaluate(`
      window.vit.mode = 'present';
      await window.__move(() => { location.hash = '#1'; });
      const fwd = [];
      for (let i = 0; i < ${labels.length}; i++) { fwd.push(location.hash.slice(1)); await window.__move(window.vit.next); }
      const back = [];
      for (let i = 0; i < ${labels.length}; i++) { back.push(location.hash.slice(1)); await window.__move(window.vit.prev); }
      return { fwd, back };`);
    same("one press is one position, forward", walk.fwd, labels);
    same("and the same sequence back", walk.back, [...labels].reverse());
  }

  /* the address bar is a position, both ways */
  {
    const trip = await page.evaluate(`
      const out = [];
      for (const l of ${JSON.stringify(labels)}) {
        await window.__move(() => { location.hash = '#' + l; });
        out.push(location.hash.slice(1));
      }
      return out;`);
    same("every label is a place the address bar can name", trip, labels);
  }

  /* Where several pages are on screen a key is on all of them at once, and a
     name that is not unique is a capture that fails. */
  for (const mode of ["present", "desk", "overview"]) {
    const dup = await page.evaluate(`
      window.vit.mode = ${JSON.stringify(mode)};
      await window.__settle(400);
      const by = new Map();
      for (const el of document.querySelectorAll('*')) {
        const n = getComputedStyle(el).viewTransitionName;
        /* a name on something that is not rendered is not captured, so it
           cannot collide — what is counted is what the capture would see */
        if (!n || n === 'none' || !el.getClientRects().length) continue;
        by.set(n, (by.get(n) ?? 0) + 1);
      }
      return [...by].filter(([, c]) => c > 1);`);
    check(`no name is used twice · ${mode}`, dup.length === 0, dup.map(([n, c]) => `${n}×${c}`).join(" "));
  }

  /* A thumbnail is one picture and one only, wherever the rail is up and
     whatever a hovered dot is previewing — and previewing must not move the
     thumbnails under the reader's pointer. */
  for (const mode of ["desk", "overview"]) {
    const bad = await page.evaluate(`
      window.vit.mode = ${JSON.stringify(mode)};
      await window.__settle(400);
      const ts = [...document.querySelectorAll('.vit-rail .vit-thumb')];
      const boxes = t => [...t.children].filter(e => getComputedStyle(e).display !== 'none'
        && !e.matches('.vit-cap, .vit-dots'));
      const y = t => t && Math.round(t.getBoundingClientRect().y);
      const bad = [];
      for (const [k, t] of ts.entries()) {
        const dots = [...t.querySelectorAll('.vit-dots i')];
        const below = ts[k + 1], y0 = y(below);
        for (const hover of [null, ...dots.keys()]) {
          if (hover === null) t.querySelector('.vit-dots')?.dispatchEvent(new PointerEvent('pointerleave'));
          else dots[hover].dispatchEvent(new PointerEvent('pointerenter'));
          await new Promise(r => requestAnimationFrame(r));
          const box = boxes(t);
          if (box.length !== 1) bad.push({ page: k + 1, hover, boxes: box.length });
          else if (!box[0].children.length) bad.push({ page: k + 1, hover, empty: true });
          if (below && y(below) !== y0) bad.push({ page: k + 1, hover, moved: y(below) - y0 });
        }
        t.querySelector('.vit-dots')?.dispatchEvent(new PointerEvent('pointerleave'));
        await new Promise(r => requestAnimationFrame(r));
      }
      return bad;`);
    check(`one picture per thumbnail, and it stays put · ${mode}`, bad.length === 0, JSON.stringify(bad));
  }

  /* The model is an array of frames built once from the DOM; if a mode moves a
     frame out of the deck, every index into it is off by one from then on. */
  {
    const counts = await page.evaluate(`
      const out = {};
      for (const m of ['present', 'desk', 'overview']) {
        window.vit.mode = m; await window.__settle(400);
        out[m] = document.querySelectorAll('.vit-deck .vit-slide').length;
      }
      return out;`);
    const want = model.reduce((n, g) => n + g.frames, 0);
    same("every frame is in the deck, in every mode", counts, { present: want, desk: want, overview: want });
  }

  /* a closed dialog is out of the layout: one that is merely invisible still
     takes the wheel and the clicks meant for the deck */
  {
    const shown = await page.evaluate(`
      return ['.vit-help', '.vit-settings'].map(s => {
        const el = document.querySelector(s);
        return el && !el.open && getComputedStyle(el).display !== 'none' ? s : null;
      }).filter(Boolean);`);
    check("a closed dialog is out of the layout", shown.length === 0, shown.join(" "));
  }

  /* ── what the player has to keep doing ────────────────────────────────
     These were a log to be read by eye; they are properties now, because a
     number printed beside an expected one in a comment is not a check. */

  /* The rail says what the model says: a page each, numbered in order, and a
     page's dots are its positions. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'overview'; await window.__settle(500);
      const ts = [...document.querySelectorAll('.vit-rail .vit-thumb')];
      return { caps: ts.map(t => t.querySelector('.vit-cap b').textContent),
               dots: ts.map(t => t.querySelectorAll('.vit-dots i').length) };`);
    same("one thumbnail per page, numbered in order", r.caps, model.map(g => String(g.page)));
    same("a page's dots are its positions", r.dots, model.map(g => (g.pos > 1 ? g.pos : 0)));
  }

  /* Opening a page from the overview is the whole page zooming, not its marks
     morphing: leftovers from the last page turn would pair up and fly. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'overview'; await window.__settle(500);
      const real = document.startViewTransition.bind(document); let vt;
      document.startViewTransition = o => (vt = real(o));
      document.querySelectorAll('.vit-rail .vit-thumb')[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vt.ready;
      const groups = [...new Set(document.getAnimations()
        .map(a => String(a.effect?.pseudoElement || '')).filter(x => x.startsWith('::view-transition-group')))];
      document.startViewTransition = real;
      await vt.finished.catch(() => { });
      await window.__settle(300);
      return { types: [...vt.types], groups, mode: document.documentElement.dataset.mode, hash: location.hash };`);
    check("opening a page from the overview is a whole-page zoom",
      r.types.includes("overview") && r.groups.some(g => g.includes("vit-zoom")) && !r.groups.some(g => /\(m-/.test(g)),
      JSON.stringify(r));
    check("and it leaves the overview", r.mode === "present" && r.hash === "#" + model[2].labels[0], JSON.stringify(r));
  }

  /* The deck answers the keys, unless something modal is up: then only its own
     keys act and the deck stays where it is. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present'; await window.__settle(400);
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
      const was = window.vit.index, held = {};
      key('b'); await window.__settle(120);
      held.blackHides = getComputedStyle(document.querySelector('.vit-deck')).visibility;
      key('ArrowRight'); await window.__settle(300); held.black = window.vit.index === was;
      key('.'); await window.__settle(120);
      key('?'); await window.__settle(120); held.helpOpen = document.querySelector('.vit-help').open;
      key('ArrowRight'); await window.__settle(300); held.help = window.vit.index === was;
      key('?'); await window.__settle(120);
      key(','); await window.__settle(120); held.panelOpen = document.querySelector('.vit-settings').open;
      key('ArrowRight'); await window.__settle(300); held.panel = window.vit.index === was;
      key(','); await window.__settle(120);
      key('ArrowRight'); await window.__settle(400); held.thenMoves = window.vit.index !== was;
      return held;`);
    check("a modal holds the deck where it is",
      r.black && r.help && r.panel && r.helpOpen && r.panelOpen && r.thenMoves, JSON.stringify(r));
    check("the black screen hides the deck", r.blackHides === "hidden", r.blackHides);
  }

  /* Pressing faster than the deck moves: each press counts from the target
     already accepted, not from the frame still on stage, and a transition cut
     short by the next leaves every name where it found it. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present';
      await window.__move(() => { location.hash = '#${labels[0]}'; });
      for (let i = 0; i < 5; i++) { window.vit.next(); await window.__settle(40); }
      window.vit.prev();
      await window.__settle(1500);
      return { hash: location.hash,
               names: [...document.querySelectorAll('.vit-slide.is-active .vit-mark')]
                 .map(m => getComputedStyle(m).viewTransitionName) };`);
    check("every press counts, however fast", r.hash === "#" + labels[4], `${r.hash}, want #${labels[4]}`);
    check("a transition cut short leaves every name intact", !r.names.includes("none"), r.names.join(" "));
  }

  /* The pointer is presentation state: the overview only tucks the cursor away,
     and it comes back on leaving. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present'; await window.__settle(400);
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
      const look = () => ({ lasing: document.body.classList.contains('vit-lasing'),
                            cursor: getComputedStyle(document.querySelector('.vit-deck')).cursor.slice(0, 4) });
      key('l'); await window.__settle(150); const on = look();
      window.vit.mode = 'overview'; await window.__settle(500); const over = look();
      window.vit.mode = 'present'; await window.__settle(500); const back = look();
      key('l'); await window.__settle(150);
      return { on, over, back, off: look() };`);
    check("the laser survives the overview",
      r.on.lasing && r.over.lasing && r.back.lasing && !r.off.lasing, JSON.stringify(r));
    check("but does not point at a thumbnail",
      r.on.cursor === "url(" && r.over.cursor === "defa" && r.back.cursor === "url(", JSON.stringify(r));
  }

  /* The toolbar floats over the page, so it is captured as a group of its own to
     stay in sight while the page moves under it — but only while it is out: a
     group carries backdrop-filter, and a hidden toolbar with one would be an
     invisible sheet of frosted glass over the deck. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present';
      await window.__move(() => { location.hash = '#${labels[0]}'; });
      await window.__settle(400);
      const bar = document.querySelector('.vit-bar');
      const during = async () => {
        const real = document.startViewTransition.bind(document); let vt;
        document.startViewTransition = o => (vt = real(o));
        window.vit.next(); await vt.ready;
        const out = { name: getComputedStyle(bar).viewTransitionName,
                      glass: getComputedStyle(document.documentElement, '::view-transition-group(vit-bar)').backdropFilter };
        document.startViewTransition = real;
        await vt.finished.catch(() => { });
        return out;
      };
      await new Promise(ok => { const t = () => (bar.classList.contains('is-shown') ? setTimeout(t, 100) : ok()); t(); });
      const hidden = await during();
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
      await window.__settle(250);
      const shown = await during();
      return { hidden, shown };`);
    check("a hidden toolbar has no group of its own", r.hidden.name === "none", JSON.stringify(r.hidden));
    check("a shown one keeps its glass through a transition",
      r.shown.name === "vit-bar" && /blur/.test(r.shown.glass), JSON.stringify(r.shown));
  }

  /* At the desk the toolbar is furniture, not chrome over a picture: it stays. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'desk'; await window.__settle(400);
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
      await window.__settle(3000);
      return document.querySelector('.vit-bar').classList.contains('is-shown');`);
    check("at the desk the toolbar stays out", r === true, String(r));
  }

  /* A transition may carry settings of its own — the Typst side turns them into
     a rule and names it after what it holds, and the name travels as one of the
     transition's types. The stylesheet is the only place they are read. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present'; await window.__settle(300);
      const all = [...document.querySelectorAll('.vit-deck .vit-slide')];
      const f = all.findIndex(s => /set-duration-\\d+ms/.test(s.dataset.transition || ''));
      if (f < 1) return null;
      const ms = +/set-duration-(\\d+)ms/.exec(all[f].dataset.transition)[1];
      await window.__done(() => window.vit.go(f - 1));
      const real = document.startViewTransition.bind(document); let vt;
      document.startViewTransition = o => (vt = real(o));
      window.vit.go(f); await vt.ready;
      const cs = ps => getComputedStyle(document.documentElement, ps);
      const out = { ms, types: [...vt.types],
                    ran: cs('::view-transition-group(root)').animationDuration };
      document.startViewTransition = real;
      await vt.finished.catch(() => { });
      return out;`);
    check("a transition's own settings reach the stylesheet",
      !r ? "n/a" : r.ran === `${r.ms / 1000}s`,
      r ? `asked for ${r.ms}ms, group ran ${r.ran} · ${r.types.join(" ")}` : "no page in this deck sets any");
  }

  /* A drawing that plays itself is the page's, not the deck's: the deck only
     decides when it may run, and a page not on stage is still. */
  {
    /* A frame with states and no steps is one that plays them itself. */
    const k = await page.evaluate(`
      const gs = [...document.querySelectorAll('.vit-deck .vit-group')];
      for (const [k, g] of gs.entries())
        for (const s of g.querySelectorAll('.vit-slide'))
          if (!(+s.dataset.steps || 0) && s.querySelector('[data-tween-at]')) return k;
      return -1;`);
    const r = k < 0 ? null : await page.evaluate(`
      window.vit.mode = 'present';
      await window.__done(() => { location.hash = '#${k < 0 ? 1 : model[k].labels[0]}'; });
      await window.__settle(300);
      const s = document.querySelector('.vit-slide.is-active');
      const play = a => [...new Set(a.map(x => x.playState))].sort();
      const here = play(s.getAnimations({ subtree: true }));
      await window.__done(window.vit.prev);
      await window.__settle(300);
      return { here, away: play(s.getAnimations({ subtree: true })) };`);
    check("a drawing that plays itself runs on stage and is still off it",
      !r ? "n/a" : r.here.includes("running") && r.away.length > 0 && r.away.every(x => x === "paused"),
      r ? JSON.stringify(r) : "no drawing in this deck plays itself");
  }

  /* Everything the player can be asked to do, once — the captures are counted
     across all of it. */
  {
    const vt = await page.evaluate(`
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
      window.vit.mode = 'present'; await window.__settle(400);
      for (const k of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home']) { key(k); await window.__settle(); }
      for (const m of ['overview', 'desk', 'present', 'desk', 'overview', 'present']) { window.vit.mode = m; await window.__settle(400); }
      window.vit.mode = 'overview'; await window.__settle(400);
      document.querySelector('.vit-deck .vit-group:nth-child(3) .vit-slide')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await window.__settle(400);
      for (const k of ['?', '?', ',', ',', 'l', 'l', 'b', 'b', '-', '=', '0']) { key(k); await window.__settle(80); }
      await window.__settle(400);
      const seen = window.__vt;
      /* And once more with nothing watching: a rejection the player does not
         handle itself only surfaces when no test is holding it. Fast enough
         that a transition is overtaken before it is even ready — later than
         that and there is nothing left to reject. */
      document.startViewTransition = window.__real;
      window.vit.mode = 'present';
      await window.__move(() => { location.hash = '#${labels[0]}'; });
      for (let i = 0; i < 4; i++) { key('ArrowRight'); await window.__settle(8); }
      await window.__settle(900);
      return seen;`);
    /* A transition overtaken by the next one is skipped on purpose — that is
       how the player answers a presenter pressing faster than the deck moves.
       Anything else is a capture that did not happen: no transition at all. */
    const aborted = vt.failed.filter(m => !/skipped/i.test(m.why));
    check("every capture succeeded", aborted.length === 0,
      `${vt.started} transitions, ${vt.failed.length - aborted.length} overtaken, aborted: ${JSON.stringify(aborted.slice(0, 6))}`);
    check("the sweep actually transitioned", vt.started > 8, `${vt.started} transitions`);
  }

  check("the page reported nothing", page.errors.length === 0, page.errors.slice(0, 3).join(" | "));
} finally {
  page.close();
}

/* The chrome is written against the deck and the deck knows nothing of it, so
   a document without it is a deck with no toolbar rather than a broken one. */
{
  const bare = html.replace(/<script>\/\* ── vit · chrome[\s\S]*?<\/script>/, "");
  const cut = bare.length < html.length;
  const out = join(mkdtempSync(join(tmpdir(), "vit-bare-")), "bare.html");
  writeFileSync(out, bare);
  const p2 = await open({ width: 1280, height: 800, port: 9352 });
  let walked = null;
  try {
    await p2.goto("file://" + out, ".vit-deck[data-ready]");
    walked = await p2.evaluate(`
      await new Promise(r => setTimeout(r, 400));
      const deck = document.querySelector('.vit-deck');
      const move = fn => new Promise(r => { let done = false;
        const ok = () => { if (done) return; done = true; deck.removeEventListener('vit:move-ready', ok); r(); };
        deck.addEventListener('vit:move-ready', ok); fn(); setTimeout(ok, 1500); });
      const from = location.hash;
      await move(window.vit.next);
      await move(window.vit.next);
      window.vit.mode = 'overview'; await new Promise(r => setTimeout(r, 500));
      const over = document.documentElement.dataset.mode;
      window.vit.mode = 'present'; await new Promise(r => setTimeout(r, 500));
      return { from, to: location.hash, over, bar: !!document.querySelector('.vit-bar.is-shown') };`);
  } finally { p2.close(); }
  check("a deck without the chrome still walks and still zooms",
    cut && walked?.to === "#" + labels[2] && walked.over === "overview" && !walked.bar && p2.errors.length === 0,
    JSON.stringify({ cut, ...walked, errors: p2.errors.slice(0, 2) }));
}

/* ── the verdict ────────────────────────────────────────────────────── */
const failed = results.filter(r => r.ok !== true && r.ok !== "n/a");
const skipped = results.filter(r => r.ok === "n/a");
for (const r of results) {
  const tag = r.ok === "n/a" ? "n/a " : r.ok ? "ok  " : "FAIL";
  console.log(`${tag}  ${r.name}${r.ok === true ? "" : `\n        ${r.detail}`}`);
}
console.log(`\n${results.length - failed.length - skipped.length}/${results.length - skipped.length} invariants hold`
  + (skipped.length ? `, ${skipped.length} had nothing to test` : "") + (failed.length ? "" : " · " + file));
process.exit(failed.length ? 1 : 0);
