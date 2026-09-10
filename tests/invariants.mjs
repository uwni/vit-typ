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
  /* The prose in the stylesheets is for whoever reads them; a deck carries the
     rules and nothing else. */
  const sheet = /<style id="vit-style">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
  const comments = (sheet.match(/\/\*/g) ?? []).length;
  check("the stylesheet ships rules, not prose", sheet.length > 0 && comments === 0,
    `${comments} comments in ${sheet.length} bytes`);
}

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
  /* An effect is written for the page, and the page's snapshot is root while
     presenting and `vit-page` at the desk — so every rule an effect keys on
     has to name both. One that names only root plays on the screen and not in
     the box, which is how a cross-fade there stopped holding its old side and
     dipped. (The mode zoom's own rules and `boxed` are keyed on those types
     instead, and mean root alone.) */
  const sheet = /<style id="vit-style">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
  const orphans = [...sheet.matchAll(/([^{}]*)\{[^{}]*\}/g)]
    .map(m => m[1].trim())
    .filter(sel => /active-view-transition-type\((?:enter|leave|set)-/.test(sel))
    .filter(sel => /::view-transition-(?:old|new)\(root\)/.test(sel) && !sel.includes("(vit-page)"));
  check("an effect names the page, whichever snapshot the page is",
    sheet.length > 0 && orphans.length === 0, orphans.slice(0, 2).join(" | "));
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
const page = await open({ width: 1280, height: 800, port: 9351, args: ["--disable-popup-blocking"] });
try {
  await page.goto("file://" + file, ".vit-deck[data-ready]");
  /* focus events are not delivered to a document the window is not showing */
  await page.send("Page.bringToFront");

  /* Every view transition is instrumented from here on: a capture that fails
     is not a transition that looks wrong, it is no transition at all, and the
     only place it shows is `ready` rejecting. */
  await page.evaluate(`
    window.__vit = { started: 0, failed: [] };
    const real = window.__real = document.startViewTransition.bind(document);
    document.startViewTransition = opts => {
      window.__vit.started++;
      const t = real(opts);
      t.ready.catch(e => window.__vit.failed.push({ why: String(e && e.message || e), types: [...(opts.types || [])], mode: document.documentElement.dataset.mode }));
      return t;
    };
    window.__settle = ms => new Promise(r => setTimeout(r, ms ?? 260));
    /* Reaching for the toolbar and giving up on it, as the browser reports it:
       the pointer arriving on the patch of page under the toolbar, or on
       anything else. */
    /* whether the toolbar is out — CSS decides it, so this asks CSS */
    window.__barOut = () => +getComputedStyle(document.querySelector('.vit-bar')).opacity === 1;
    window.__reach = yes => {
      const el = document.querySelector(yes ? '.vit-reach' : '.vit-deck');
      el?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    };
    /* Two waits, and a check has to mean one of them. __move is the move being
       announced — the new position is in the DOM and its animation is about to
       run, which is what counts a press. __done is the move having finished
       moving. A check that only wants to be somewhere waits for the second:
       waiting for the first and carrying on overtakes the transition, which is
       a thing the player has to survive but not a thing to do by accident in
       the middle of measuring something else. */
    window.__move = fn => new Promise(r => {
      const deck = document.querySelector('.vit-deck');
      let done = false;
      const ok = () => { if (done) return; done = true; deck.removeEventListener('vit:move-here', ok); r(); };
      deck.addEventListener('vit:move-here', ok);
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
      const real = document.startViewTransition.bind(document); let vit;
      document.startViewTransition = o => (vit = real(o));
      document.querySelectorAll('.vit-rail .vit-thumb')[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vit.ready;
      const groups = [...new Set(document.getAnimations()
        .map(a => String(a.effect?.pseudoElement || '')).filter(x => x.startsWith('::view-transition-group')))];
      document.startViewTransition = real;
      await vit.finished.catch(() => { });
      await window.__settle(300);
      return { types: [...vit.types], groups, mode: document.documentElement.dataset.mode, hash: location.hash };`);
    check("opening a page from the overview is a whole-page zoom",
      r.types.includes("overview") && r.groups.some(g => g.includes("vit-zoom")) && !r.groups.some(g => /\(m-/.test(g)),
      JSON.stringify(r));
    check("and it leaves the overview", r.mode === "present" && r.hash === "#" + model[2].labels[0], JSON.stringify(r));
  }

  /* A page's own entrance is for a page that is on the screen. In the overview
     the pages are thumbnails; turning to another moves the highlight, and
     nothing else may move. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'overview'; await window.__settle(600);
      let started = 0;
      const real = document.startViewTransition.bind(document);
      document.startViewTransition = o => { started++; return real(o); };
      const rail = document.querySelector('.vit-rail');
      const before = rail.getBoundingClientRect();
      for (let i = 0; i < 3; i++) { window.vit.next(); await window.__settle(300); }
      const after = rail.getBoundingClientRect();
      document.startViewTransition = real;
      const here = [...document.querySelectorAll('.vit-rail .vit-thumb')].findIndex(t => t.classList.contains('is-here'));
      return { started, moved: Math.round(after.x - before.x), here };`);
    check("walking the overview moves the highlight and nothing else",
      r.started === 0 && r.moved === 0 && r.here > 0, JSON.stringify(r));
  }

  /* A page turn moves the page. Presenting, the page is the screen and the
     screen is what the effect is written on; at the desk it is a box beside the
     rail, and root is not captured at all — so the furniture around it is not a
     picture of itself for the length of the turn, and a thumbnail in it can
     still be clicked. */
  {
    const r = await page.evaluate(`
      const turn = async mode => {
        window.vit.mode = mode;
        await window.__done(() => { location.hash = '#${labels[0]}'; });
        await window.__settle(300);
        const real = document.startViewTransition.bind(document); let vit;
        document.startViewTransition = o => (vit = real(o));
        window.vit.next();
        await vit.ready;
        const cs = ps => getComputedStyle(document.documentElement, ps);
        const named = re => !!document.getAnimations().find(a => re.test(String(a.effect?.pseudoElement || '')));
        /* whatever is captured is not painted, and what is not painted is not
           hit-tested: this asks the browser, of a thumbnail, mid-transition */
        const t = [...document.querySelectorAll('.vit-rail .vit-thumb')].find(t => {
          const b = t.getBoundingClientRect();
          return b.width && b.top > 40 && b.bottom < innerHeight - 40;
        });
        const tb = t?.getBoundingClientRect();
        const out = {
          types: [...vit.types],
          page: named(/group\\(vit-page\\)/),
          root: named(/\\(root\\)/),
          /* A name is a capture and a capture is a hole, so under boxed nothing
             outside the page may carry one — the toolbar and the laser least of
             all, since they sit over what the presenter is looking at. */
          outside: (() => {
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
              acceptNode: el => el.classList.contains('vit-deck') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
            const named = [];
            while (w.nextNode())
              if (getComputedStyle(w.currentNode).viewTransitionName !== 'none')
                named.push((String(w.currentNode.className).split(' ')[0] || w.currentNode.tagName));
            return named;
          })(),
          rail: tb ? !!document.elementFromPoint((tb.left + tb.right) / 2, (tb.top + tb.bottom) / 2)?.closest('.vit-thumb') : null,
          rootOld: cs('::view-transition-old(root)').animationName,
          rootNew: cs('::view-transition-new(root)').animationName,
          pageOld: cs('::view-transition-old(vit-page)').animationName,
          pageNew: cs('::view-transition-new(vit-page)').animationName,
          clipped: cs('::view-transition-group(vit-page)').clipPath,
        };
        document.startViewTransition = real;
        await vit.finished.catch(() => { });
        await window.__settle(300);
        return out;
      };
      return { present: await turn('present'), desk: await turn('desk') };`);
    check("presenting, the page's effect is the screen's",
      !r.present.page && r.present.root && r.present.rootOld === "vit-leave" && r.present.rootNew === "vit-enter",
      JSON.stringify(r.present));
    check("at the desk it is the page's box, and nothing else is captured at all",
      r.desk.page && r.desk.types.includes("boxed") && !r.desk.root && r.desk.outside.length === 0,
      JSON.stringify({ ...r.desk, outside: r.desk.outside }));
    check("so the rail is still there to be clicked while the page turns",
      r.desk.rail === true, JSON.stringify({ rail: r.desk.rail }));
    /* The price of that: for a frame at the start of a transition the deck is
       captured and its snapshot is not up yet, and the rest of the page goes on
       painting without it. What is behind it then has to be the page itself —
       the same <use> a thumbnail is, at the deck's own size — or the desk shows
       through the middle of the screen. */
    const g = await page.evaluate(`
      window.vit.mode = 'desk'; await window.__settle(400);
      const out = [];
      for (const [w, h] of [[1280, 800], [900, 1000], [1280, 500]]) {
        /* the window cannot be resized from here; the cell can */
        document.body.style.setProperty('--vit-rail', (1280 - w) / 2 + 112 + 'px');
        document.body.style.setProperty('--vit-split', h / 2 + 'px');
        await window.__settle(120);
        const deck = document.querySelector('.vit-deck'), g = document.querySelector('.vit-plate');
        const d = deck.getBoundingClientRect(), b = g.getBoundingClientRect();
        out.push({
          fits: Math.abs(b.width - d.width) < 1 && Math.abs(b.height - d.height) < 1
                && Math.abs(b.x - d.x) < 1 && Math.abs(b.y - d.y) < 1,
          /* and it is drawing the frame the deck is drawing, not some other */
          shows: g.dataset.shows?.split(':')[0] === String(window.vit.index),
          drawn: !!g.querySelector('use'),
          box: [Math.round(d.width), Math.round(d.height)],
          ground: [Math.round(b.width), Math.round(b.height)],
        });
      }
      for (const k of ['--vit-rail', '--vit-split']) document.body.style.removeProperty(k);
      await window.__settle(200);
      return out;`);
    check("and what is behind the page is the page itself, exactly its box",
      g.every(x => x.fits && x.shows && x.drawn), JSON.stringify(g));
    check("and the effect plays there, clipped to that box",
      r.desk.pageOld === "vit-leave" && r.desk.pageNew === "vit-enter" && r.desk.clipped === "inset(0px)",
      JSON.stringify({ old: r.desk.pageOld, new: r.desk.pageNew, clip: r.desk.clipped }));
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
      await window.__done(() => { location.hash = '#${labels[0]}'; });
      await window.__settle(300);
      const bar = document.querySelector('.vit-bar');
      const during = async () => {
        const real = document.startViewTransition.bind(document); let vit;
        document.startViewTransition = o => (vit = real(o));
        window.vit.next(); await vit.ready;
        const out = { name: getComputedStyle(bar).viewTransitionName,
                      glass: getComputedStyle(document.documentElement, '::view-transition-group(vit-bar)').backdropFilter };
        document.startViewTransition = real;
        await vit.finished.catch(() => { });
        return out;
      };
      window.__reach(false); await window.__settle(250);
      const hidden = await during();
      window.__reach(true); await window.__settle(250);
      const shown = await during();
      window.__reach(false);
      return { hidden, shown };`);
    check("a hidden toolbar has no group of its own", r.hidden.name === "none", JSON.stringify(r.hidden));
    check("a shown one keeps its glass through a transition",
      r.shown.name === "vit-bar" && /blur/.test(r.shown.glass), JSON.stringify(r.shown));
  }

  /* Over a page being shown, the toolbar is out only while somebody is reaching
     for it, and it is not there to be pressed when it is not: the corner it
     sits in belongs to the page, and a press there turns the page. What is
     reached is a patch of page under it, which therefore has to cover it — or
     part of the toolbar could not be reached at all. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present';
      await window.__done(() => { location.hash = '#${labels[0]}'; });
      await window.__settle(400);
      const bar = document.querySelector('.vit-bar'), reach = document.querySelector('.vit-reach');
      const shown = () => window.__barOut();
      const b = bar.getBoundingClientRect(), z = reach.getBoundingClientRect();
      const mid = [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
      const out = {
        onArrival: shown(),
        covers: z.left <= b.left && z.top <= b.top && z.right >= b.right && z.bottom >= b.bottom,
        underPointer: String(document.elementFromPoint(...mid)?.className ?? ''),
      };
      window.__reach(true); await window.__settle(250); out.reaching = shown();
      window.__reach(false); await window.__settle(250); out.gaveUp = shown();
      /* and the press that lands there while it is hidden turns the page */
      const was = window.vit.index;
      document.elementFromPoint(...mid).dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: mid[0], clientY: mid[1] }));
      await window.__settle(900);
      out.turned = window.vit.index !== was;
      return out;`);
    check("the toolbar is out only while it is being reached for",
      !r.onArrival && r.reaching && !r.gaveUp, JSON.stringify(r));
    check("and hidden it is not in the page's way",
      r.covers && !/vit-bar/.test(r.underPointer) && r.turned,
      JSON.stringify({ covers: r.covers, under: r.underPointer, turned: r.turned }));
  }

  /* While the deck moves, the browser cannot say where the pointer is: what was
     captured is not hit-tested, so it reports the pointer leaving the toolbar
     and arriving on <html> although it has not moved. Believed, the toolbar
     goes out for the whole of every transition and comes back after it. */
  {
    const r = await page.evaluate(`
      /* the mode change is a transition of its own: let it finish, or the move
         below overtakes it and what answers __done is the wrong one */
      window.vit.mode = 'present';
      await window.__settle(500);
      await window.__done(() => { location.hash = '#${labels[0]}'; });
      await window.__settle(300);
      const bar = document.querySelector('.vit-bar');
      window.__reach(true); await window.__settle(250);
      const out = { reaching: window.__barOut(), low: 1 };
      let stop = false;
      const tick = () => { out.low = Math.min(out.low, +getComputedStyle(bar).opacity);
                           if (!stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
      await window.__settle(60);
      out.moving = window.vit.moving;
      /* what the browser says when it cannot tell */
      document.documentElement.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      await window.__settle(120);
      out.during = window.__barOut();
      await window.__settle(1200);
      stop = true;
      out.after = window.__barOut();
      return out;`);
    check("the toolbar does not blink when the deck moves under it",
      r.reaching && r.moving && r.during && r.after && r.low === 1, JSON.stringify(r));
  }

  /* While the deck moves, the document is not hit-tested: pointer events still
     arrive with their position, and with <html> for a target. So what follows
     the pointer's position keeps up, and what needs its target does not — the
     deck takes no press while it is a picture, and the keys are the fast path. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present';
      await window.__done(() => { location.hash = '#${labels[0]}'; });
      await window.__settle(300);
      const laser = document.querySelector('.vit-laser');
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
      const touch = (t, x, y) => document.dispatchEvent(
        new PointerEvent(t, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
      key('l');                                   // the laser, as the DOM dot touch gets
      touch('pointerdown', 300, 300);
      await window.__settle(200);
      const out = { atRest: laser.style.transform };
      const was = window.vit.index;
      key('ArrowRight');
      await window.__settle(80);
      out.moving = window.vit.moving;
      out.target = String(document.elementFromPoint(640, 300)?.tagName ?? '');
      touch('pointermove', 700, 420);             // the position is true …
      const deck = document.querySelector('.vit-deck');
      deck.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 1100, clientY: 300 }));
      await window.__settle(120);
      out.followed = laser.style.transform;
      out.turnedByPress = window.vit.index !== was + 1;
      await window.__settle(1400);
      out.settled = window.vit.index === was + 1;
      key('l');
      return out;`);
    check("what follows the pointer's position keeps up while the deck moves",
      r.moving && r.target === "HTML" && r.atRest === "translate(300px, 300px)"
        && r.followed === "translate(700px, 420px)", JSON.stringify(r));
    check("and a press that lands on a picture is not a press on the page",
      !r.turnedByPress && r.settled, JSON.stringify({ turned: r.turnedByPress, settled: r.settled }));
  }

  /* Reaching for it is not only with a pointer: a toolbar that cannot be got at
     from the keyboard is a toolbar somebody cannot use at all. */
  {
    /* Reached for with the Tab key, not with `focus()`. Whether a scripted
       focus counts as a visible one is the browser's own reading of what the
       user last did, which nothing here sets; pressing the key is both what
       the claim says and the only way to ask it without that hidden state. */
    const tab = async () => {
      for (const type of ["rawKeyDown", "keyUp"])
        await page.send("Input.dispatchKeyEvent",
          { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    };
    await page.evaluate(`
      window.vit.mode = 'present'; await window.__settle(400);
      window.__reach(false); document.activeElement?.blur();
      await window.__settle(200); return 1;`);
    const r = { hidden: await page.evaluate("return !window.__barOut();"), focused: false };
    for (let i = 0; i < 30 && !r.focused; i++) {
      await tab();
      r.focused = await page.evaluate(
        "return !!document.querySelector('.vit-bar')?.contains(document.activeElement);");
    }
    await page.evaluate("await window.__settle(200); return 1;");
    r.shown = await page.evaluate("return window.__barOut();");
    await page.evaluate("document.activeElement?.blur(); await window.__settle(200); return 1;");
    r.afterBlur = await page.evaluate("return window.__barOut();");
    check("and the keyboard reaches it too", r.hidden && r.focused && r.shown && !r.afterBlur, JSON.stringify(r));
  }

  /* The laser is state, and what it looks like is drawn from that state — not
     only when the pointer moves. Drawn only then, the dot is left behind on
     screen when the deck changes mode under it. */
  {
    const r = await page.evaluate(`
      const laser = document.querySelector('.vit-laser');
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
      window.vit.mode = 'present'; await window.__settle(500);
      key('l');
      document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 400, clientY: 300, bubbles: true }));
      await window.__settle(200);
      const out = { presenting: laser.classList.contains('is-on'), lasing: document.body.classList.contains('vit-lasing') };
      window.vit.mode = 'overview';
      await window.__settle(700);
      /* no pointer event in between: the mode changing is what puts it out */
      out.afterMode = laser.classList.contains('is-on');
      out.stillOn = document.body.classList.contains('vit-lasing');
      window.vit.mode = 'present'; await window.__settle(700);
      key('l');
      await window.__settle(150);
      out.afterOff = document.body.classList.contains('vit-lasing');
      return out;`);
    check("the laser goes out when the deck changes under it",
      r.presenting && r.lasing && !r.afterMode && r.stillOn && !r.afterOff, JSON.stringify(r));
  }

  /* At the desk the toolbar is furniture, not chrome over a picture: it stays. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'desk'; await window.__settle(400);
      window.__reach(false);
      await window.__settle(1500);
      return window.__barOut();`);
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
      const real = document.startViewTransition.bind(document); let vit;
      document.startViewTransition = o => (vit = real(o));
      window.vit.go(f); await vit.ready;
      const cs = ps => getComputedStyle(document.documentElement, ps);
      const out = { ms, types: [...vit.types],
                    ran: cs('::view-transition-group(root)').animationDuration };
      document.startViewTransition = real;
      await vit.finished.catch(() => { });
      return out;`);
    check("a transition's own settings reach the stylesheet",
      !r ? "n/a" : r.ran === `${r.ms / 1000}s`,
      r ? `asked for ${r.ms}ms, group ran ${r.ran} · ${r.types.join(" ")}` : "no page in this deck sets any");
  }

  /* An element that runs along a path is placed by `offset-path`, a string of
     pixels measured against the frame's own box — so it is only right once the
     frame is on screen, and it has to be measured again whenever that box
     changes. Wrong, and the thing sits in a corner of the page. */
  {
    const k = await page.evaluate(`
      const gs = [...document.querySelectorAll('.vit-deck .vit-group')];
      const t = document.querySelector('[data-typst-label^="waapi-track:"]');
      return t ? gs.findIndex(g => g.contains(t)) : -1;`);
    const r = k < 0 ? null : await page.evaluate(`
      const at = '#${k < 0 ? 1 : model[k].labels[0]}';
      const out = {};
      for (const m of ['present', 'desk']) {
        window.vit.mode = m; await window.__settle(500);
        await window.__done(() => { location.hash = '#${labels[0]}'; }); await window.__settle(200);
        await window.__done(() => { location.hash = at; }); await window.__settle(300);
        const s = document.querySelector('.vit-slide.is-active');
        const track = s.querySelector('[data-typst-label^="waapi-track:"] path');
        const dot = [...s.querySelectorAll('*')].find(e => getComputedStyle(e).offsetPath !== 'none');
        if (!track || !dot) { out[m] = { missing: true }; continue; }
        const t = track.getBoundingClientRect(), d = dot.getBoundingClientRect();
        const cx = d.x + d.width / 2, cy = d.y + d.height / 2;
        out[m] = { on: cx >= t.x - 3 && cx <= t.right + 3 && cy >= t.y - 3 && cy <= t.bottom + 3,
                   dot: [Math.round(cx), Math.round(cy)],
                   track: [Math.round(t.x), Math.round(t.y), Math.round(t.right), Math.round(t.bottom)] };
      }
      return out;`);
    check("an element that follows a path is on it, in every mode",
      !r ? "n/a" : r.present?.on === true && r.desk?.on === true,
      r ? JSON.stringify(r) : "no deck in this document follows a path");
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

  /* The speaker view is another window on another screen. It drives the deck
     like a remote, and what belongs to the presenter rather than to the
     audience belongs in it: its own help and its own settings panel, and the
     audience's screen left with nothing on it. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present'; await window.__settle(500);
      await window.__done(() => { location.hash = '#${labels[0]}'; });
      await window.__settle(200);
      const bar = document.querySelector('.vit-bar');
      window.__reach(true);
      await window.__settle(200);
      const shownBefore = window.__barOut();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', cancelable: true }));
      await window.__settle(900);
      const w = window.open('', 'vit-speaker');
      if (!w || w.closed || !w.document.querySelector('.vit-bar')) return null;
      const d = w.document;
      const out = { shownBefore, shownAfter: window.__barOut(),
                    ownDialogs: !!d.querySelector('.vit-settings') && !!d.querySelector('.vit-help'),
                    /* it drives the deck, it does not decide what the audience is shown */
                    noModes: !d.querySelector('.vit-bar [data-act="desk"], .vit-bar [data-act="overview"]'),
                    hasModes: !!document.querySelector('.vit-bar [data-act="overview"]') };
      d.querySelector('.vit-bar [data-act="settings"]').click();
      await window.__settle(250);
      out.opensThere = !!d.querySelector('.vit-settings').open;
      out.notHere = !document.querySelector('.vit-settings').open;
      const was = window.vit.index;
      d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
      await window.__settle(500);
      out.heldWhileOpen = window.vit.index === was;
      d.querySelector('.vit-settings').close();
      await window.__settle(200);
      await window.__done(() => d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })));
      await window.__settle(300);
      out.remote = window.vit.index !== was;
      window.__reach(true);
      await window.__settle(200);
      out.backOnHover = window.__barOut();
      w.close();
      await window.__settle(300);
      return out;`);
    /* A window that has been behind another one paints nothing, and what does
       not paint does not advance: the checks after this need the page back. */
    await page.send("Page.bringToFront");
    await page.evaluate("await new Promise(r => setTimeout(r, 300)); return 1;");
    check("the speaker view is the presenter's window, and the deck's remote",
      !r ? "n/a" : r.shownBefore && !r.shownAfter && r.backOnHover && r.ownDialogs
        && r.noModes && r.hasModes && r.opensThere && r.notHere && r.heldWhileOpen && r.remote,
      r ? JSON.stringify(r) : "the browser would not open the window");
  }

  /* A move is said out twice: once when it has been accepted and nothing has
     been captured, once when it has landed. The first is what lets another
     window showing this deck start alongside rather than behind, so what it
     has to be is early — before the capture — and it has to carry where the
     deck is going, since where it is has not changed yet. A change of mode is
     a transition but not a move and says neither. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'present'; await window.__settle(500);
      await window.__done(() => { location.hash = '#${labels[0]}'; });
      await window.__settle(300);
      const deck = document.querySelector('.vit-deck');
      const seen = [];
      const watch = t => e => seen.push({ t, index: e.detail.index,
                                          where: window.vit.index, moving: window.vit.moving });
      const b = watch('begin'), d = watch('done');
      deck.addEventListener('vit:move-begin', b);
      deck.addEventListener('vit:move-done', d);
      await window.__done(window.vit.next);
      await window.__settle(250);
      const afterTurn = seen.length;
      window.vit.mode = 'desk'; await window.__settle(800);
      window.vit.mode = 'present'; await window.__settle(800);
      const quiet = seen.length === afterTurn;
      deck.removeEventListener('vit:move-begin', b);
      deck.removeEventListener('vit:move-done', d);
      return { seen, quiet };`);
    const begin = r.seen.filter(x => x.t === "begin"), done = r.seen.filter(x => x.t === "done");
    check("a move is said out before it is captured, and again once it has landed",
      begin.length === 1 && done.length === 1
        && begin[0].moving === false && begin[0].index !== begin[0].where
        && done[0].index === begin[0].index && done[0].where === done[0].index,
      JSON.stringify(r.seen));
    check("and a change of mode, being no move, says neither", r.quiet, JSON.stringify(r));
  }

  /* The clock times the talk, not the window. It cannot be asked here — this
     deck has been on stage since the model was read — so it is asked in a
     window that has never presented. */
  {
    const w = await open({ width: 1000, height: 700, port: 9354, args: ["--disable-popup-blocking"] });
    let r = null;
    try {
      await w.goto("file://" + file, ".vit-deck[data-ready]");
      const clock = () => w.evaluate(`const s = window.open('', 'vit-speaker');
        return s && !s.closed ? s.document.querySelector('time').textContent : null;`);
      const hold = ms => w.evaluate(`await new Promise(r => setTimeout(r, ${ms})); return 1;`);
      await w.evaluate(`localStorage.clear();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', cancelable: true }));
        await new Promise(r => setTimeout(r, 2000)); return 1;`);
      r = { mode: await w.evaluate("return window.vit.mode;") };
      await hold(1400);
      r.waiting = await clock();
      await w.evaluate("window.vit.mode = 'present'; await new Promise(r => setTimeout(r, 200)); return 1;");
      await hold(1400);
      r.onStage = await clock();
      /* and it does not stop for a look at the desk: the slot is still burning */
      await w.evaluate("window.vit.mode = 'desk'; await new Promise(r => setTimeout(r, 200)); return 1;");
      await hold(1400);
      r.andAtTheDesk = await clock();
    } finally { w.close(); }
    check("the clock times the talk, not the window it is shown in",
      !r?.waiting ? "n/a" : r.mode === "desk" && r.waiting === "00:00"
        && r.onStage !== "00:00" && r.andAtTheDesk > r.onStage,
      r ? JSON.stringify(r) : "the browser would not open the window");
  }

  /* A preview inside the speaker view is this same document in a window that
     says so in its name. Over file:// it is another origin, so it cannot be
     reached into from here — it is asked in a window of its own instead,
     named the way the template names it.

     The two are not the same kind of thing. The mirror shows what the
     audience is looking at, so it plays the page change out and its drawings
     start on the same gate as theirs. The one that runs ahead shows what has
     not happened yet, so there is nothing to be in step with and it lands at
     once, legible while it is being read. */
  {
    const ask = async (name, port) => {
      const w = await open({ width: 900, height: 560, port });
      try {
        await w.goto("about:blank");
        await w.evaluate(`window.name = ${JSON.stringify(name)}; return 1;`);
        await w.goto("file://" + file, ".vit-deck[data-ready]");
        return await w.evaluate(`
          await new Promise(r => setTimeout(r, 500));
          const deck = document.querySelector('.vit-deck');
          const done = fn => new Promise(r => { let ok = false;
            const f = () => { if (ok) return; ok = true; deck.removeEventListener('vit:move-done', f); r(); };
            deck.addEventListener('vit:move-done', f); fn(); setTimeout(f, 3000); });
          let started = 0;
          const real = document.startViewTransition.bind(document);
          document.startViewTransition = o => { started++; return real(o); };
          const from = window.vit.index;
          await done(window.vit.next);
          const out = { started, from, to: window.vit.index, mode: window.vit.mode,
                        rail: !!document.querySelector('.vit-rail'),
                        bar: !!document.querySelector('.vit-bar') };
          /* a frame that plays itself: states of its own, no steps */
          const slides = [...deck.querySelectorAll('.vit-slide')];
          const k = slides.findIndex(s => !(+s.dataset.steps || 0) && s.querySelector('[data-tween-at]'));
          if (k < 0) { out.plays = null; return out; }
          await done(() => window.vit.go(k));
          await new Promise(r => setTimeout(r, 300));
          const state = a => [...new Set(a.map(x => x.playState))].sort();
          out.plays = state(slides[k].getAnimations({ subtree: true })).includes('running');
          /* The pace is told to it, and only by the window that made it. Here
             there is no such window — this one was opened by the suite, not by
             a deck — so what can be asked is the half that must hold anyway:
             a message from anyone else is ignored. That it is taken from its
             maker is a thing of three windows and two origins, and over
             file:// a preview cannot be seen into from here at all. */
          const before = window.vit.speed;
          postMessage({ vit: 'speed', speed: 4 }, '*');
          await new Promise(r => setTimeout(r, 150));
          out.pace = window.vit.speed;
          out.deaf = out.pace === before;
          return out;
        `);
      } finally { w.close(); }
    };
    const m = await ask("vit-mirror", 9353);
    const a = await ask("vit-mirror-ahead", 9355);
    check("a preview presents, with neither the rail nor the toolbar",
      [m, a].every(x => x.mode === "present" && !x.rail && !x.bar), JSON.stringify({ m, a }));
    check("the one that mirrors the audience plays the page change out",
      m.started >= 1 && m.to === m.from + 1, JSON.stringify(m));
    check("and the one that runs ahead of them lands at once",
      a.started === 0 && a.to === a.from + 1, JSON.stringify(a));
    check("a page that draws itself draws in either",
      m.plays === null ? "n/a" : m.plays === true && a.plays === true,
      m.plays === null ? "no frame in this deck plays itself"
        : JSON.stringify({ mirror: m.plays, ahead: a.plays }));
    check("and neither takes a pace from a window that did not make it",
      m.deaf && a.deaf, JSON.stringify({ mirror: m.pace, ahead: a.pace }));
  }

  /* The desk's two boundaries are the presenter's to move: the width of the
     rail, and the height the deck leaves the notes. A drag sets a length, the
     stylesheet says how far it may be taken, and the deck follows because it is
     measured against the cell it sits in and nothing else. */
  {
    const r = await page.evaluate(`
      window.vit.mode = 'desk'; await window.__settle(500);
      const box = s => { const b = document.querySelector(s).getBoundingClientRect();
                         return [Math.round(b.width), Math.round(b.height)]; };
      const drag = (which, dx, dy) => {
        const g = document.querySelector('.vit-grip[data-grip=' + which + ']');
        const b = g.getBoundingClientRect(), x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
        const at = (t, ex, ey) => new PointerEvent(t, { bubbles: true, pointerId: 1, clientX: ex, clientY: ey });
        g.dispatchEvent(at('pointerdown', x, y));
        document.dispatchEvent(at('pointermove', x + dx, y + dy));
        document.dispatchEvent(at('pointerup', x + dx, y + dy));
      };
      const drawn = { rail: box('.vit-rail')[0], pane: box('.vit-pane')[1],
                      notes: box('.vit-notes')[1], deck: box('.vit-deck')[0] };
      drag('rail', 90, 0); await window.__settle(150);
      const wider = box('.vit-rail')[0];
      drag('notes', 0, -120); await window.__settle(200);
      const shorter = { pane: box('.vit-pane')[1], notes: box('.vit-notes')[1], deck: box('.vit-deck')[0] };
      const kept = [localStorage.getItem('vit-rail'), localStorage.getItem('vit-split')];
      /* taken past the end of the range, and the stylesheet holds it there */
      drag('rail', 4000, 0); await window.__settle(150);
      const capped = box('.vit-rail')[0];
      /* double-click is the way back to the size the stylesheet draws */
      for (const which of ['rail', 'notes']) {
        document.querySelector('.vit-grip[data-grip=' + which + ']')
          .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
      await window.__settle(200);
      const back = { rail: box('.vit-rail')[0], pane: box('.vit-pane')[1], deck: box('.vit-deck')[0] };
      const gone = [localStorage.getItem('vit-rail'), localStorage.getItem('vit-split')];
      /* and nowhere else is there a boundary to move */
      const elsewhere = {};
      for (const m of ['present', 'overview']) {
        window.vit.mode = m; await window.__settle(400);
        elsewhere[m] = getComputedStyle(document.querySelector('.vit-grip')).display;
      }
      window.vit.mode = 'desk'; await window.__settle(400);
      return { drawn, wider, shorter, capped, back, kept, gone, elsewhere };`);
    check("the desk's boundaries move, and only where there are two sides to move",
      r.wider === r.drawn.rail + 90
      && r.shorter.pane === r.drawn.pane - 120 && r.shorter.notes === r.drawn.notes + 120
      && r.shorter.deck < r.drawn.deck
      && r.capped === Math.round(0.4 * 1280)
      && r.kept.every(v => /^-?\d+px$/.test(v ?? ""))
      && r.back.rail === r.drawn.rail && r.back.pane === r.drawn.pane && r.back.deck === r.drawn.deck
      && r.gone.every(v => v === null)
      && Object.values(r.elsewhere).every(d => d === "none"),
      JSON.stringify(r));
  }

  /* Everything the player can be asked to do, once — the captures are counted
     across all of it. */
  {
    const vit = await page.evaluate(`
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
      window.vit.mode = 'present'; await window.__settle(400);
      for (const k of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home']) { key(k); await window.__settle(); }
      for (const m of ['overview', 'desk', 'present', 'desk', 'overview', 'present']) { window.vit.mode = m; await window.__settle(400); }
      window.vit.mode = 'overview'; await window.__settle(400);
      document.querySelector('.vit-deck .vit-group:nth-child(3) .vit-slide')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await window.__settle(400);
      for (const k of ['?', '?', ',', ',', 'l', 'l', 'b', 'b', '-', '=', '0']) { key(k); await window.__settle(80); }
      await window.__settle(400);
      const seen = window.__vit;
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
    const aborted = vit.failed.filter(m => !/skipped/i.test(m.why));
    check("every capture succeeded", aborted.length === 0,
      `${vit.started} transitions, ${vit.failed.length - aborted.length} overtaken, aborted: ${JSON.stringify(aborted.slice(0, 6))}`);
    check("the sweep actually transitioned", vit.started > 8, `${vit.started} transitions`);
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
        const ok = () => { if (done) return; done = true; deck.removeEventListener('vit:move-here', ok); r(); };
        deck.addEventListener('vit:move-here', ok); fn(); setTimeout(ok, 1500); });
      const from = location.hash;
      await move(window.vit.next);
      await move(window.vit.next);
      window.vit.mode = 'overview'; await new Promise(r => setTimeout(r, 500));
      const over = document.documentElement.dataset.mode;
      window.vit.mode = 'present'; await new Promise(r => setTimeout(r, 500));
      const bar = document.querySelector('.vit-bar');
      return { from, to: location.hash, over, bar: +getComputedStyle(bar).opacity === 1 };`);
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
