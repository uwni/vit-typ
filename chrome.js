/* ── vit · chrome ──────────────────────────────────────────────────
   Everything that floats over the deck: the toolbar, the laser pointer and
   its tracer, the settings panel, the key help, the black screen, the speaker
   view. It is written against `window.vit` and the events the deck fires, and
   against nothing else — the deck does not know this file exists, and a
   document that leaves it out is a deck without chrome rather than a broken
   one.

   What the presenter chooses lives here and in their browser: how fast the
   deck moves, what the laser looks like, how long its tracer lasts, light or
   dark. The document says where each of those starts; the deck itself only
   has a speed.                                                             */

(() => {
  "use strict";

  const root = document.documentElement;
  const prefersLight = matchMedia("(prefers-color-scheme: light)");
  let vit = null, deck = null;

  /* One reader and one writer for everything the presenter chooses. */
  const store = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch { }
    return v;
  };

  /* Where in a box a pointer is, as two fractions; outside it, nothing. The
     speaker view's preview is a box like any other. */
  const frac = (pt, el) => {
    const r = el.getBoundingClientRect();
    const x = (pt.clientX - r.left) / r.width, y = (pt.clientY - r.top) / r.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  };

  /* The presenter's own pace, remembered by their browser. The deck divides
     every duration by it and knows nothing else about it. */
  const setSpeed = v => {
    vit.speed = v;
    store("vit-speed", vit.speed);
    syncSettings();
    flash(`${vit.speed}×`);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen().catch(() => { });
  };

  /* black screen (b / .): "look at me, not at the screen" — everything in the body is hidden, the keys still work */
  let black = false;
  const toggleBlack = () => {
    black = !black;
    document.body.classList.toggle("vit-black", black);
  };

  /* ── one window's chrome ──────────────────────────────────────────────
     The main window has a set of it and the speaker view another: a toolbar,
     the key table, the settings panel. What they set is shared — the deck, and
     what the presenter has chosen — but what they *show* is each their own, and
     a panel opened from a toolbar belongs on that toolbar's screen rather than
     on the audience's. So there is one record per window and everything that
     refreshes the chrome walks the list; wireChrome() below makes one.

     A control in the panel names what it sets in data-set, and appears in DIALS
     once: how to read it, how to apply it, and how to say it. */
  const chromes = [];
  const chromeIn = doc => chromes.find(c => c.doc === doc) ?? chromes[0] ?? {};

  const toggleHelp = doc => {
    const { help } = chromeIn(doc);
    if (help) help.open ? help.close() : help.showModal();
  };

  const DIALS = {
    speed: {
      read: () => vit.speed,
      write: v => setSpeed(+v),
      say: v => `${(+v).toFixed(2).replace(/\.?0+$/, "")}×`,
    },
    trail: {
      read: () => trailMs,
      write: v => setTrail(+v),
      say: v => (+v ? `${+v} ms` : "off"),
    },
    ink: {
      read: () => store("vit-ink") ?? laserInk,
      write: v => { store("vit-ink", v); applyLaser(); },
      say: v => String(v).toUpperCase(),
    },
    size: {
      read: () => +(store("vit-size") ?? laserSize),
      write: v => { store("vit-size", +v); applyLaser(); },
      say: v => `${+v} px`,
    },
    theme: {
      read: () => store("vit-theme") ?? deck.dataset.theme,
      write: v => { store("vit-theme", v); applyTheme(); },
    },
  };

  /* the controls show what is in force, whatever moved it — a key, a panel in
     another window, the deck itself */
  const syncSettings = () => {
    for (const { panel } of chromes) {
      if (!panel?.open) continue;
      for (const el of panel.querySelectorAll("[data-set]")) {
        const dial = DIALS[el.dataset.set];
        if (!dial) continue;
        const v = dial.read();
        if (el.tagName === "INPUT") el.value = v;
        else for (const b of el.children) b.setAttribute("aria-pressed", String(b.dataset.value === v));
        const out = panel.querySelector(`[data-out="${el.dataset.set}"]`);
        if (out && dial.say) out.textContent = dial.say(v);
      }
    }
  };

  const toggleSettings = doc => {
    const { panel } = chromeIn(doc);
    if (!panel) return;
    if (panel.open) panel.close();
    else { panel.showModal(); syncSettings(); }
  };

  const resetSettings = () => {
    for (const k of ["vit-speed", "vit-trail", "vit-ink", "vit-size", "vit-theme"]) store(k, null);
    setSpeed(1);
    setTrail(laserTrail);
    applyLaser();
    applyTheme();
    syncSettings();
  };

  /* ── toolbar ─────────────────────────────────────────────────────────
     A name of its own keeps a page transition from carrying it along: it is
     captured as its own group and that group is told not to animate, so it
     stays put and in sight while the page moves under it. There are two: the
     main window's, which auto-hides, and the speaker view's, which does not.
     Each button names what it does in data-act, and syncTools() refreshes them
     together. */

  /* A download link with no address wants the .pdf beside this page: this
     page's own address is the one thing about the link only the browser knows.
     The name ends where a query or a fragment starts, and a deck opened at
     #12.3 is the ordinary case. */
  const pdfLink = () => {
    const m = /^([^?#]*)\.x?html?(?=[?#]|$)/i.exec(location.href);
    return m ? `${m[1]}.pdf` : "";
  };

  /* A button with two faces shows one of them, and wears its words: what it
     does now, or what it will. Both faces are in the document. */
  const showFace = (el, name) => {
    for (const i of el.querySelectorAll("[data-icon]")) i.hidden = i.dataset.icon !== name;
    const on = el.querySelector(`[data-icon="${name}"]`);
    if (!on) return;
    el.title = on.dataset.title;
    el.setAttribute("aria-label", on.dataset.title);
  };

  /* Everything of the chrome that this window has, wired and remembered. A
     window that has none of it — a preview inside the speaker view — gets a
     record of nothing, and the loops that walk the list skip it. */
  const wireChrome = doc => {
    const c = {
      doc,
      bar: doc.querySelector(".vit-bar"),
      help: doc.querySelector(".vit-help"),
      panel: doc.querySelector(".vit-settings"),
    };
    chromes.push(c);

    if (c.bar) {
      c.count = c.bar.querySelector(".vit-count");
      const acts = {
        desk: () => { vit.mode = vit.mode === "desk" ? "present" : "desk"; },
        overview: () => { vit.mode = vit.mode === "overview" ? "present" : "overview"; },
        laser: toggleLaser,
        speaker: openSpeaker,
        settings: () => toggleSettings(doc),
        full: toggleFullscreen,
      };
      for (const [act, run] of Object.entries(acts)) {
        const btn = c.bar.querySelector(`[data-act="${act}"]`);
        if (!btn) continue;
        c[act] = btn;
        btn.addEventListener("click", e => { e.stopPropagation(); run(); });
      }
      const dl = c.bar.querySelector(".vit-dl");
      if (dl) {
        if (!dl.getAttribute("href")) {
          const href = pdfLink();
          if (href) dl.href = href;
          else dl.remove();                   // no name to build one from
        }
        dl.addEventListener("click", e => e.stopPropagation());
      }
    }

    c.help?.addEventListener("click", () => c.help.close());
    c.panel?.addEventListener("input", e => {
      const dial = DIALS[e.target.dataset.set];
      if (dial) { dial.write(e.target.value); syncSettings(); }
    });
    c.panel?.addEventListener("click", e => {
      if (e.target === c.panel) { c.panel.close(); return; }         // the backdrop
      const seg = e.target.closest(".vit-seg [data-value]");
      if (seg) { DIALS[seg.parentNode.dataset.set].write(seg.dataset.value); syncSettings(); return; }
      if (e.target.closest('[data-act="reset"]')) resetSettings();
    });
    return c;
  };

  /* ── when the toolbar is out ──────────────────────────────────────────
     CSS owns the rule (deck.css); what it cannot see is the pointer, since a
     hidden toolbar is not hit-testable and what the pointer arrives on is
     `.vit-reach`, the patch of page beneath it. So one class carries the
     browser's answer — and while the deck moves nothing is hit-tested and it
     has none to give, so the last one stands. */
  let bar = null;

  const reached = e => {
    if (vit.moving) return;
    bar?.classList.toggle("is-reached", e.type === "pointerover" && !!e.target.closest?.(".vit-reach, .vit-bar"));
  };

  /* ── laser pointer ───────────────────────────────────────────────────
     The mouse gets a CSS cursor image, in deck.css; touch and pen have no
     cursor to restyle and get a DOM dot, routed by each event's own
     pointerType. `lasing` is presentation state: the overview only tucks the
     cursor or dot away, and it comes back on leaving. */

  let lasing = false;
  let touching = false;   // whether the latest input was non-mouse
  let laser = null;
  const findLaser = () => { laser = document.querySelector(".vit-laser"); };

  const dot = (x, y) => {
    laser.style.transform = `translate(${x}px,${y}px)`;
    laser.classList.add("is-on");
    trail(x, y);
  };

  /* ── the tracer ──────────────────────────────────────────────────────
     Where the pointer has just been, a segment at a time. It can be no longer
     than the document left room for — that is the ceiling below — and one
     point a frame at most, or a 1000 Hz mouse would spend the whole tracer
     inside a few milliseconds. */
  const FRAME = 16;
  let segs = [], pts = [], trailMs = 0, trailRaf = 0;

  /* ── what the laser looks like ───────────────────────────────────────
     deck.css owns the drawing; this owns the colour and the size. Its URL and
     its ink are read once, so no colour or size is written here. */
  let laserUrl = "", laserInk = "", laserSize = 32, laserPx = 32, laserTrail = 400;
  const enc = hex => "%23" + hex.replace("#", "").toLowerCase();

  const applyLaser = () => {
    const ink = store("vit-ink") ?? laserInk;
    const size = laserPx = +(store("vit-size") ?? laserSize);
    root.style.setProperty("--vit-laser-ink", ink);
    root.style.setProperty("--vit-laser-size", `${size}px`);
    root.style.setProperty("--vit-laser-hot", String(size / 2));
    root.style.setProperty("--vit-laser", laserUrl
      .replaceAll(enc(laserInk), enc(ink))
      .replace(/width='\d+' height='\d+'/, `width='${size}' height='${size}'`));
  };

  const findLaserLook = () => {
    const css = getComputedStyle(root);
    laserUrl = css.getPropertyValue("--vit-laser").trim();
    laserInk = css.getPropertyValue("--vit-laser-ink").trim();
    laserSize = parseFloat(css.getPropertyValue("--vit-laser-size")) || laserSize;
    laserTrail = parseFloat(css.getPropertyValue("--vit-laser-trail")) || 0;
    applyLaser();
  };

  const findTrail = () => {
    segs = [...(document.querySelector(".vit-trail")?.children ?? [])];
    const kept = parseInt(store("vit-trail"), 10);
    setTrail(Number.isFinite(kept) ? kept : laserTrail);
  };

  const setTrail = ms => {
    trailMs = Math.min(Math.max(Math.round(ms) || 0, 0), segs.length * FRAME);
    store("vit-trail", trailMs);
    if (!trailMs) clearTrail();
    syncSettings();
  };

  const clearTrail = () => {
    pts.length = 0;
    for (const s of segs) s.removeAttribute("d");
  };

  /* Newest segment first, so the piece at the dot is always segs[0] and the
     tail runs off the end of what there is. Keeps drawing after the pointer
     stops, until the last point has aged out. */
  const drawTrail = () => {
    trailRaf = 0;
    const now = performance.now();
    while (pts.length && now - pts[0].t > trailMs) pts.shift();
    for (let i = 0; i < segs.length; i++) {
      const b = pts[pts.length - 1 - i], a = pts[pts.length - 2 - i];
      if (!a || !b) { segs[i].removeAttribute("d"); continue; }
      const left = 1 - (now - a.t) / trailMs;    // 1 at the dot, 0 at the tail
      segs[i].setAttribute("d", `M${a.x} ${a.y}L${b.x} ${b.y}`);
      /* The tracer is the dot's own streak, so it is drawn to the dot's size,
         and it thins to nothing at the tail — that, and the oldest point
         dropping off, is the whole of the fade. */
      segs[i].setAttribute("stroke-width", (laserPx * 0.22 * left * left).toFixed(2));
    }
    if (pts.length) trailRaf = requestAnimationFrame(drawTrail);
  };

  const trail = (x, y) => {
    if (!trailMs || !segs.length) return;
    const now = performance.now(), last = pts[pts.length - 1];
    if (last && now - last.t < FRAME) { last.x = x; last.y = y; }
    else pts.push({ x, y, t: now });
    if (pts.length > segs.length + 1) pts.shift();
    if (!trailRaf) trailRaf = requestAnimationFrame(drawTrail);
  };

  /* The mouse's dot is the cursor, so there is nothing to place — but the
     tracer is ours to draw whichever pointer is in use. */
  /* What the pointer is for is state — whether the laser is on, and whether the
     pointer that last moved has a cursor of its own to restyle. What that looks
     like is drawn from it, by the same rule as the toolbar: whenever the state
     changes, not only when the pointer moves. Drawn on pointer moves alone, the
     dot is left behind on the screen when the deck changes mode under it. */
  const drawLaser = () => {
    if (!laser) return;
    const live = lasing && vit.mode === "present";
    document.body.classList.toggle("vit-lasing", lasing);
    document.body.classList.toggle("vit-nomouse", touching);
    /* the mouse is given the cursor image, in deck.css; the dot is for a pointer
       that has no cursor to restyle, and only while it has somewhere to be */
    if (!(live && touching)) laser.classList.remove("is-on");
    if (!live) clearTrail();
  };

  /* Which pointer is in use, and where it is. Both are the event's own, and both
     survive a transition — it is a pointer's *target* that a transition takes
     away, not its position. */
  const route = e => {
    touching = !(e.pointerType === "mouse" || e.pointerType === "");
    drawLaser();
    if (!lasing || vit.mode !== "present") return;
    if (touching) dot(e.clientX, e.clientY);
    else trail(e.clientX, e.clientY);
  };

  const toggleLaser = () => {
    lasing = !lasing;
    vit.hold(lasing);   // while it is out, a press on the page points rather than turns
    drawLaser();
    syncTools();
  };

  const syncTools = () => {
    const text = `${vit.label()} / ${vit.pages}${vit.speed === 1 ? "" : ` · ${vit.speed}×`}`;   // a multiplier survives reloads: keep it in sight
    const fs = !!document.fullscreenElement;
    for (const b of chromes) {
      if (!b.bar) continue;
      b.doc.body.classList.toggle("vit-lasing", lasing);   // the speaker window's cursor follows too
      b.count.textContent = text;
      /* a toolbar is what it carries: the speaker view's has no say in what the
         audience is shown, so it has none of those buttons to refresh */
      if (b.desk) showFace(b.desk, vit.mode === "desk" ? "play" : "desk");
      b.overview?.setAttribute("aria-pressed", String(vit.mode === "overview"));
      b.laser?.setAttribute("aria-pressed", String(lasing));
      if (b.full) showFace(b.full, fs ? "unfull" : "full");
    }
  };

  /* flash something (the speed multiplier, say) where the counter is; syncTools writes the page number back after 900ms */
  let flashTimer = null;
  const flash = text => {
    for (const b of chromes) if (b.count) b.count.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(syncTools, 900);
  };

  /* Chrome theme: deck(theme:) fixes it, auto follows the system. Only the
     verdict lands on <html data-theme>; every colour is a token in deck.css,
     and the speaker window copies the same tokens. */
  let speaker = null, spk = null, spkFrom = 0;
  const applyTheme = () => {
    const t = store("vit-theme") ?? deck.dataset.theme;
    root.dataset.theme = t === "auto" ? (prefersLight.matches ? "light" : "dark") : t;
    if (speaker && !speaker.closed) speaker.document.documentElement.dataset.theme = root.dataset.theme;
  };
  const initTheme = () => {
    prefersLight.addEventListener("change", applyTheme);
    applyTheme();
  };

  /* ── the desk's two boundaries ────────────────────────────────────────
     What a grip is dragged through is a length: the width of the rail, or the
     height the deck leaves the notes. Which grip is `data-grip`, and it is the
     browser that says so — it hit-tests the grip and hands it the pointer, so
     the rest of the drag arrives there and nowhere else until it is let go.
     What is read of the pointer is how far it has come, against the size the
     element itself reports; how far it may be taken is the stylesheet's, in the
     clamps around the two properties. They are written on the body, which is
     the element they describe and the only one that reads them — deck.css
     registers them as not inheriting, so a drag recalculates that one element
     rather than the whole document. Without its dashes, a property is the name
     it is remembered under. */
  const grips = {
    rail: { of: ".vit-rail", prop: "--vit-rail", size: "offsetWidth", axis: "clientX" },
    notes: { of: ".vit-pane", prop: "--vit-split", size: "offsetHeight", axis: "clientY" },
  };
  let held = null;
  const grab = e => {
    const g = e.target.closest?.(".vit-grip");
    if (!g) return;
    const { of, prop, size, axis } = grips[g.dataset.grip];
    held = { g, prop, axis, base: document.querySelector(of)[size], from: e[axis] };
    g.setPointerCapture(e.pointerId);
    g.classList.add("is-held");
  };
  const pull = e => held && document.body.style.setProperty(held.prop, `${held.base + e[held.axis] - held.from}px`);
  const drop = () => {
    if (!held) return;
    store(held.prop.slice(2), document.body.style.getPropertyValue(held.prop));
    held.g.classList.remove("is-held");
    held = null;
  };
  /* double-click: back to the size the stylesheet draws */
  const reset = e => {
    const g = e.target.closest?.(".vit-grip");
    if (!g) return;
    const { prop } = grips[g.dataset.grip];
    document.body.style.removeProperty(prop);
    store(prop.slice(2), null);
  };
  const initSplit = () => {
    for (const { prop } of Object.values(grips)) {
      const kept = store(prop.slice(2));
      if (kept) document.body.style.setProperty(prop, kept);
    }
    document.addEventListener("pointerdown", grab);
    document.addEventListener("pointermove", pull);
    document.addEventListener("pointerup", drop);
    document.addEventListener("pointercancel", drop);
    document.addEventListener("dblclick", reset);
  };

  /* ── speaker view ────────────────────────────────────────────────────
     A separate window for another screen. "Current" and "next" are two iframes
     loading this very HTML, positioned by #hash, so there is no second renderer
     and the real transitions play there too. The window is about:blank and
     same-origin, so its own DOM is built directly; the iframes are never
     touched, only their src changes. Sync is the vit:move-ready events. */

  const tick = () => {
    const s = Math.round((Date.now() - spkFrom) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    spk.clock.textContent = `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
  };

  const openSpeaker = () => {
    if (speaker && !speaker.closed) { speaker.focus(); return; }
    speaker = open("", "vit-speaker", "popup,width=1040,height=640");
    if (!speaker) { console.warn("[vit] the speaker view was blocked by the browser; allow pop-ups for this page."); return; }

    /* the same stylesheet as this document's, as it is (its speaker rules are under .vit-speaker, the layout's size, background and easing open it), the same theme */
    const d = speaker.document;
    d.head.innerHTML = `<style>${document.getElementById("vit-style").textContent}</style>`;
    d.documentElement.className = "vit-speaker";
    d.documentElement.dataset.theme = root.dataset.theme;
    d.title = `Speaker view · ${document.title}`;
    /* the window's whole body, its toolbar included, and the same two dialogs
       — the very elements, cloned, rather than a second copy of the markup to
       keep in step */
    d.body.appendChild(d.importNode(document.querySelector("template.vit-speaker-body").content, true));
    for (const el of document.querySelectorAll(".vit-help, .vit-settings")) {
      const copy = d.body.appendChild(d.importNode(el, true));
      copy.removeAttribute("open");
    }
    spk = {
      page: d.querySelector("header b"), title: d.querySelector("header span"),
      clock: d.querySelector("time"), note: d.querySelector(".vit-notes"),
      now: d.querySelector("main iframe"), next: d.querySelector("aside iframe"),
      nextCap: d.querySelector("aside small"), prog: d.querySelector(".prog i"),
    };
    /* timer: counts from opening, click to reset */
    spkFrom = Date.now();
    spk.clock.addEventListener("click", () => { spkFrom = Date.now(); tick(); });
    const timer = setInterval(() => {
      if (speaker.closed) { clearInterval(timer); return; }
      tick();
    }, 1000);

    /* its own chrome, wired like the main window's; the toolbar sits bottom
       right and does not auto-hide, because nobody but the presenter sees it */
    const c = wireChrome(d);
    speaker.addEventListener("pagehide", () => chromes.splice(chromes.indexOf(c), 1));

    /* A key pressed here is a key pressed at the deck, so this window doubles
       as a remote — every key but the chrome's own, which act on the window
       they were pressed in: the help and the settings belong where the
       presenter is looking, not on the audience's screen. */
    d.addEventListener("keydown", guard, true);
    d.addEventListener("keydown", e => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || KEYS[e.key]) return;
      e.preventDefault();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, cancelable: true }));
    });
    d.addEventListener("keydown", onKey);

    /* The "current" preview stands in for the main deck: clicking it is
       clicking the deck (same frac/tap), and moving over it with the laser on
       points on the main window. That window has no mouse whose cursor could
       change, so it gets the DOM dot; coordinates map preview box → main deck
       box proportionally. */
    d.addEventListener("click", e => {
      if (e.target.closest("a, button")) return;
      const q = frac(e, spk.now);
      if (q) vit.tap(q.x);
    });
    d.addEventListener("wheel", e => { if (frac(e, spk.now)) vit.wheel(e.deltaY); }, { passive: true });
    d.addEventListener("pointermove", e => {
      if (!lasing || vit.mode !== "present") return;
      const q = frac(e, spk.now);
      if (!q) { laser.classList.remove("is-on"); return; }
      const m = deck.getBoundingClientRect();
      dot(m.left + q.x * m.width, m.top + q.y * m.height);
    });
    d.documentElement.addEventListener("pointerleave", () => laser.classList.remove("is-on"));

    syncSpeaker();
    syncTools();
    /* The audience's screen wants nothing on it, and still believes the
       pointer is on its toolbar. */
    bar?.classList.remove("is-reached");
  };

  /* Only the src changes: a navigation that differs from the current URL by
     the fragment alone does not reload, the deck inside gets hashchange and
     follows. */
  const show = (frame, hash) => {
    const u = new URL(location.href);
    u.hash = hash;
    if (frame.getAttribute("src") !== u.href) frame.src = u.href;
  };

  /* The "next" preview shows what the audience will see next: still within
     this page (next frame, or next step of an element animation) it is the
     next step; only past the page is it the next page. */
  const syncSpeaker = () => {
    if (!spk || speaker.closed) return;
    const nx = vit.after();
    spk.page.textContent = `${vit.label()} / ${vit.pages}`;
    spk.prog.style.width = vit.progress();
    spk.title.textContent = vit.title();
    show(spk.now, vit.label());
    spk.next.hidden = !nx;
    spk.nextCap.textContent = !nx ? "Last page" : nx.page ? "Next page" : "Next step";
    if (nx) show(spk.next, vit.label(nx.index, nx.step));
  };

  const initSpeaker = () => {
    deck.addEventListener("vit:move-ready", syncSpeaker);
    /* close it when the main window goes, so no window is left out of sync */
    addEventListener("pagehide", () => { if (speaker && !speaker.closed) speaker.close(); });
  };

  /* ── the page's notes, beside it at the desk ─────────────────────────
     Read off the deck; the layout carries them and never shows them. */
  let notes = null;
  const syncNotes = () => { if (notes) notes.innerHTML = vit.note(); };

  /* ── keys ─────────────────────────────────────────────────────────────
     The chrome's own, and the modal guard. A black screen and an open dialog
     are modal: only their own keys act, and the deck must not hear the rest —
     caught on the way down, so it does not matter who bound a listener first. */
  const KEYS = {
    f: toggleFullscreen,
    l: toggleLaser,
    s: openSpeaker,
    b: toggleBlack,
    ".": toggleBlack,
    "?": doc => toggleHelp(doc),
    ",": doc => toggleSettings(doc),
    "-": () => setSpeed(vit.speed / 1.25),
    "=": () => setSpeed(vit.speed * 1.25),
    "+": () => setSpeed(vit.speed * 1.25),
    0: () => setSpeed(1),
  };

  const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  const guard = e => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const doc = e.currentTarget, { help, panel, bar: their } = chromeIn(doc);
    /* A button with the keyboard on it is being used, and the keys it acts on
       are its own: the deck must not take them. Propagation stops, so the deck
       never hears them; the default is left alone, so the button is pressed. */
    if (their?.querySelector(":focus-visible") && (e.key === "Enter" || e.key === " ")) { e.stopPropagation(); return; }
    const own = black
      ? { b: toggleBlack, ".": toggleBlack, Escape: toggleBlack }
      : help?.open
        ? { "?": () => toggleHelp(doc) }        // Escape is the dialog's own
        : panel?.open
          ? { ",": () => toggleSettings(doc) }
          : null;
    if (!own) return;
    e.stopPropagation();
    if (own[e.key]) { e.preventDefault(); own[e.key](); }
  };

  const onKey = e => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const run = KEYS[e.key];
    if (run) { e.preventDefault(); run(e.currentTarget); }
  };

  /* ── start ────────────────────────────────────────────────────────────
     The deck says when it is live. A preview inside the speaker view is
     driven by the window that opened it, so it takes none of this. */

  const start = () => {
    vit = window.vit;
    deck = vit.deck;
    if (window.name === "vit-mirror") {
      for (const el of document.querySelectorAll(".vit-bar, body > .vit-notes, .vit-help, .vit-settings, .vit-laser, .vit-trail, template.vit-speaker-body")) el.remove();
      return;
    }
    notes = document.querySelector("body > .vit-notes");
    document.addEventListener("fullscreenchange", syncTools);
    bar = wireChrome(document).bar;
    /* every arrival anywhere, and the one departure that is real */
    for (const t of ["pointerover", "pointerleave"]) document.documentElement.addEventListener(t, reached);
    findLaser();
    findLaserLook();
    findTrail();
    initTheme();
    initSplit();
    initSpeaker();
    document.addEventListener("keydown", guard, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointermove", route);
    document.addEventListener("pointerdown", route);
    document.addEventListener("pointerup", () => { if (touching) laser.classList.remove("is-on"); });
    document.addEventListener("pointercancel", () => laser.classList.remove("is-on"));
    /* the deck draws itself and says so; everything here is drawn from that */
    deck.addEventListener("vit:render", () => {
      syncTools();
      syncNotes();
      drawLaser();
    });
    const kept = parseFloat(store("vit-speed"));
    if (kept) vit.speed = kept;
    syncTools();
    syncNotes();
  };

  if (window.vit) start();
  else document.addEventListener("vit:ready", start, { once: true });
})();
