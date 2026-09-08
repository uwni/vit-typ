/* ── vit · runtime ─────────────────────────────────────────────────
   The player. Three jobs:
   · Transitions — a page or frame change starts one View Transition with the
     types the Typst side wrote on the frame; everything visual is in deck.css
     under :active-view-transition-type(), so an effect is a CSS-only change.
   · Stepping — the arrow keys walk the states of the drawings on a frame,
     which tween interpolates. What plays by itself the deck only pauses.
   · Chrome — overview, toolbar, laser pointer, speaker view.
   No dependencies; opens straight from file://.                            */

(() => {
  "use strict";

  /* The file only defines; init() at the end runs, in one place and in order. */

  const root = document.documentElement;
  let deck, slides, n;

  /* ── group = one page, frame = one layout state of that page ────────
     Navigation walks frames, the overview shows groups. The title is a hidden
     .vit-title inside the group; the browser flattens it to plain text. */
  const groups = [];      // { el, title, from, to, pos }  `to` exclusive
  const gOf = [];         // frame index → group index
  let gn = 0;

  /* deck(duration:), deck(easing:) — the Typst side decides every default, this side only reads */
  let defaultMs, EASING;

  /* The presenter's live knob: every duration in deck.css is divided by it, and
     so are the step animations, which are timed here. Kept in localStorage. */
  let speed = 1;
  const durMs = ms => Math.round(ms / speed);
  const setSpeed = v => {
    speed = Math.min(4, Math.max(0.25, Math.round(v * 100) / 100));
    try { localStorage.setItem("vit-speed", speed); } catch { }
    root.style.setProperty("--vit-speed", speed);
    flash(`${speed}×`);
  };

  let cur = -1;       /* the frame on stage */
  let want = -1;      /* the accepted target: stage() runs only once the old
                         snapshot is captured, and a next() arriving meanwhile
                         has to count from here. Written only where a target is
                         accepted — a skipped transition's update callback runs
                         late and would set it back. */

  let reduced, prefersLight, canvit;
  const mirror = window.name === "vit-mirror";   // a preview inside the desk or the speaker view: it presents, and builds no chrome

  const clamp = i => (i < 0 ? 0 : i > n - 1 ? n - 1 : i);
  const at = i => slides[i].vitAt || 0;
  const over = () => deck.classList.contains("vit-all");
  const atDesk = () => deck.classList.contains("vit-desk");

  /* ── positions = frames × steps, flattened into one sequence ───────────
     To the audience a frame and a step are the same thing, "one more press", so
     the dots, the counter, the progress bar, the hash and the speaker view's
     "next" all read this sequence and never tell them apart. POS is every
     position as { i, at, n }, g.pos those of one page; abs[i] is where frame i
     starts, head[i] where it starts within its page. */
  const POS = [], head = [], abs = [];

  /* deck(…) parameters, the presenter's speed, what this browser can do */
  const settings = () => {
    defaultMs = parseInt(deck.dataset.duration, 10);
    EASING = deck.dataset.easing.split(" ").map(Number);   // the four numbers of a cubic Bézier
    try { speed = parseFloat(localStorage.getItem("vit-speed")) || 1; } catch { }
    reduced = matchMedia("(prefers-reduced-motion: reduce)");
    prefersLight = matchMedia("(prefers-color-scheme: light)");
    canvit = typeof document.startViewTransition === "function";
  };

  /* pages, frames and steps into the position sequence */
  const buildModel = () => {
    for (const el of deck.querySelectorAll(".vit-group")) {
      const t = el.querySelector(".vit-title");
      const g = { el, title: t ? t.textContent.trim() : "", from: gOf.length, to: gOf.length };
      for (const _ of el.querySelectorAll(".vit-slide")) { gOf.push(groups.length); g.to++; }
      groups.push(g);
    }
    gn = groups.length;
    for (const g of groups) {
      g.pos = [];
      for (let i = g.from; i < g.to; i++) {
        head[i] = g.pos.length;
        abs[i] = POS.length;
        for (let k = 0; k <= stepsOf(slides[i]).n; k++) {
          const q = { i, at: k, n: POS.length };
          g.pos.push(q);
          POS.push(q);
        }
      }
    }
  };

  /* index of frame i at step k; without k, at the frame's current step */
  const idx = (i, k) => abs[i] + (k ?? at(i));
  const progress = i => `${POS.length < 2 ? 100 : (idx(i) / (POS.length - 1)) * 100}%`;

  /* "3" or "3.2" — only a page with more than one position gets the dot */
  const label = (i, k) => {
    const g = groups[gOf[i]];
    return (gOf[i] + 1) + (g.pos.length > 1 ? `.${head[i] + (k ?? at(i)) + 1}` : "");
  };

  /* the page's speaker notes, as the layout carries them */
  const noteOf = i => groups[gOf[i]].el.querySelector(".vit-note")?.innerHTML ?? "";

  /* The update half of a view transition, and the only way onto the stage:
     what it leaves is the state the browser captures — hence the lift. */
  const stage = i => {
    lift(slides[i]);
    cur = i;
    slides.forEach((s, k) => {
      s.classList.toggle("is-active", k === i);
      if (k !== i) { still(s); halt(s); }
    });
    announce();
  };

  /* Thumbnails, counter, address bar and speaker view all learn where we are
     from here — fired on every page change and every step. */
  const announce = () => {
    syncThumbs(true);
    try { history.replaceState(null, "", `#${label(cur)}`); } catch { }
    deck.dispatchEvent(new CustomEvent("vit:move-ready", { detail: { index: cur, step: at(cur) } }));
  };

  /* One for one with `vit:move-ready`, including moves with nothing to animate
     and moves cut short by the next. Opening the overview announces neither. */
  const moveDone = i =>
    deck.dispatchEvent(new CustomEvent("vit:move-done", { detail: { index: i, step: at(i) } }));

  /* Hover preview: temporarily show frame f at step k in its group's
     thumbnail; null restores. The step is the frame's own state, so it is
     moved for the preview and moved back on leave; syncThumbs shows it. */
  let peeked = null;
  const unpeek = () => {
    if (peeked) stepTo(slides[peeked.i], peeked.was, true);
    peeked = null;
  };
  const peek = (f, k) => {
    unpeek();
    if (f != null) { peeked = { i: f, was: at(f), at: k }; stepTo(slides[f], k, true); }
    syncThumbs();
  };

  /* Which frame a thumbnail shows: the one being previewed, else the current
     frame while we are on that page, otherwise the last frame at its last step
     (the finished page, like a handout). The only writer of is-thumb and the
     dots' state. `scroll` only on a real move — hovering a dot previews a step
     and must leave the rail where the reader put it. */
  const syncThumbs = (scroll = false) => {
    const now = idx(cur);
    groups.forEach((g, k) => {
      const here = gOf[cur] === k, peekHere = peeked && gOf[peeked.i] === k;
      const shown = peekHere ? peeked.i : here ? cur : g.to - 1;
      /* Judge by `want`, not `cur`: the page we are entering (transition not yet
         settled) has already been positioned — don't move it back. The moment
         the overview zoom starts, the browser stops hit-testing the real DOM and
         the dots receive pointerleave first. */
      if (!here && !peekHere && gOf[want] !== k) stepTo(slides[shown], stepsOf(slides[shown]).n, true);
      for (let i = g.from; i < g.to; i++) slides[i].classList.toggle("is-thumb", i === shown);
      g.el.classList.toggle("is-here", here);
      if (scroll && here && atDesk()) g.el.scrollIntoView({ block: "nearest" });
      /* Dots show progress, not position: everything passed is solid, the current
         one a notch brighter. Same rule for every page — pages behind us fully
         solid, pages ahead fully hollow. */
      g.dots?.forEach((dot, d) => {
        const q = g.pos[d];
        dot.classList.toggle("is-on", q.n <= now);
        dot.classList.toggle("is-now", q.n === now);
        dot.classList.toggle("is-peek", !!peekHere && q.i === peeked.i && q.at === peeked.at);
      });
    });
  };

  /* Thumbnail caption and position dots. Built by the runtime, like the
     toolbar — the layout must not contain player parts. They are children of
     the group, not of a slide, so the overview zoom (named on the group) does
     not blow the caption up to full screen. */
  const buildCaptions = () => {
    groups.forEach((g, k) => {
      const cap = document.createElement("div");
      cap.className = "vit-cap";
      cap.innerHTML = "<b></b><span></span>";
      cap.firstChild.textContent = k + 1;
      cap.lastChild.textContent = g.title;
      cap.lastChild.title = g.title;
      g.el.insertBefore(cap, g.el.firstChild);

      if (g.pos.length < 2) return;
      const dots = document.createElement("div");
      dots.className = "vit-dots";
      g.dots = g.pos.map((q, d) => {
        const el = document.createElement("i");
        el.dataset.frame = q.i;
        el.dataset.at = q.at;
        el.title = `Step ${d + 1}`;
        /* hovering swaps the thumbnail to that step — no need to open the page to
           see which step is which */
        el.addEventListener("pointerenter", () => peek(q.i, q.at));
        dots.appendChild(el);
        return el;
      });
      dots.addEventListener("pointerleave", () => peek(null));
      g.el.appendChild(dots);
    });
  };

  /* ── the same key several times on one page ─────────────────────────
     A name pairs with exactly one counterpart, so "one becomes three" has to
     be cloned on the smaller side: copy the single one twice in place and name
     all three, and three copies leaving one spot for three destinations reads
     as a split. The reverse is a merge. What is cloned is the hoisted <svg>,
     whose <use> references resolve against the document's own <defs>. */

  const marksOf = slide => {
    const by = new Map();
    for (const m of slide.querySelectorAll(".vit-mark[data-vit-key]")) {
      by.set(m.dataset.vitKey, [...(by.get(m.dataset.vitKey) ?? []), m]);
    }
    return by;
  };

  /* ── names ──────────────────────────────────────────────────────────
     m-<key>-<n>, n the occurrence of the key on its frame (hoist.js leaves
     data-vit-key; the key's characters are the Typst side's assertion).
     Given once, at load; spread() renames for one transition and restores. */
  const nameOf = (key, i) => `m-${key}-${i + 1}`;
  /* A name each, and whatever its object declared: the pair of effects and the
     names of its settings, as the Typst side wrote them into vitMarks. A mark
     that morphs carries them too — the effects then match no animation rule
     (those want the side, vit-only-new or vit-only-old, which soloize puts in
     front of vit-mo), while the settings still reach its images. */
  const name = s => {
    for (const [k, marks] of marksOf(s)) {
      const own = vitMarks[k];
      marks.forEach((m, i) => {
        m.style.viewTransitionName = nameOf(k, i);
        if (own?.transition) m.style.viewTransitionClass = `vit-mo ${own.transition}`;
      });
    }
  };

  /* An unlifted frame cannot morph, so both sides of a transition are lifted
     before it starts; the sweep below only saves the wait. */
  const lift = s => { if (s && window.vitLift(s)) name(s); };

  const unlifted = () => {
    for (let d = 0; d < n; d++) {
      const a = slides[cur + d], b = slides[cur - d];
      if (a && !a.dataset.vitLifted) return a;
      if (b && !b.dataset.vitLifted) return b;
    }
    return null;
  };

  /* One frame per idle slice, nearest the one on stage first — read afresh, so
     walking or jumping re-aims it with no queue. Not while a transition runs
     (the work is layout); it starts again when that ends, and on every move.
     Without an idle callback nothing is swept and frames wait until needed. */
  let sweeping = false;
  const sweep = () => {
    if (sweeping || mirror || pendingUndo || !window.requestIdleCallback) return;
    sweeping = true;
    requestIdleCallback(() => {
      sweeping = false;
      if (pendingUndo) return;
      const s = unlifted();
      if (!s) return;
      lift(s);
      sweep();
    });
  };

  /* Spread els over K names: name i takes source floor(i*k/K); a source taken
     a second time is cloned in place. Everything touched is recorded and
     restored after the transition. */
  const spread = (els, K, key, undo) => {
    const k = els.length, used = new Set();
    for (let i = 0; i < K; i++) {
      const si = Math.floor((i * k) / K);
      let el;
      if (used.has(si)) {
        el = els[si].cloneNode(true);
        els[si].parentNode.insertBefore(el, els[si].nextSibling);
        undo.push(() => el.remove());
      } else {
        el = els[si];
        used.add(si);
        const was = el.style.viewTransitionName;
        undo.push(() => { el.style.viewTransitionName = was; });
      }
      el.style.viewTransitionName = nameOf(key, i);
    }
  };

  const balance = (from, to, undo) => {
    const A = marksOf(from), B = marksOf(to);
    for (const [k, a] of A) {
      const b = B.get(k);
      if (!b || a.length === b.length) continue;     // one-sided keys enter/leave; equal counts need nothing
      const K = Math.max(a.length, b.length);
      spread(a, K, k, undo);
      spread(b, K, k, undo);
    }
  };

  /* Marks whose name is unmatched in this transition. One that declared an
     effect gets it as a class behind the side it has (vit-only-old on the frame
     being left, vit-only-new on the one entered) — the side matters because
     WebKit styles both images of a named element whether or not they exist, and
     an animation on an image that does not exist is never torn down. One
     without an effect has its name dropped and folds back into root, so it
     moves with the whole page rather than by its own width. */
  const soloize = (from, to, undo) => {
    const names = s => new Set([...s.querySelectorAll(".vit-mark")].map(m => m.style.viewTransitionName));
    const A = names(from), B = names(to);
    const tag = (s, other, side) => {
      for (const m of s.querySelectorAll(".vit-mark")) {
        if (other.has(m.style.viewTransitionName)) continue;
        const was = m.style.viewTransitionName, cls = m.style.viewTransitionClass;
        const own = vitMarks[m.dataset.vitKey];
        if (own?.transition) m.style.viewTransitionClass = `${side} ${own.transition}`;
        else m.style.viewTransitionName = "none";
        undo.push(() => { m.style.viewTransitionName = was; m.style.viewTransitionClass = cls; });
      }
    };
    tag(from, B, "vit-only-old");
    tag(to, A, "vit-only-new");
  };

  /* ── stepping ───────────────────────────────────────────────────────
     One step shows a different state of every drawing on the frame and hands
     the pair to tween, which animates node by node; stepping back plays the
     same segment in reverse. The drawings step together, the count is the
     largest one, and shorter ones stop at their end. */

  const stepsOf = s => {
    if (s.vitSteps) return s.vitSteps;
    /* One container is one drawing, so the same key twice on a frame stays two
       of them; a drawing inside a state is an ordinary node, not a drawing. */
    const marks = tween.boxes(s).map(box => ({
      key: box.dataset.tween || "a drawing",
      box,
      states: tween.states(box),
    }));
    let steps = 0;
    for (const m of marks) {
      m.nodes = tween.nodes(m.states, m.key);
      /* a drawing that plays its states over time is not stepped; whether it
         does is its own business, so we ask rather than look */
      m.anim = tween.plays(m.box);
      if (!m.anim) steps = Math.max(steps, m.states.length - 1);
    }
    return (s.vitSteps = { marks, n: steps });
  };

  /* A step's animations are the deck's to cancel when the next one starts; a
     continuous one plays and pauses with the frame. The browser keeps both —
     they are asked for by role — and what it cannot keep stays here: the
     clean-ups a cross-fade owes, and the callbacks that re-measure a track. */
  const STEP = "vit:step";

  /* the engine returns the animations and the undo; the frame keeps the undo,
     so that halt() can put back what a cancelled cross-fade changed */
  const fade = (s, host, oldG, newG, olds, news, timing) => {
    const r = tween.crossfade(host, oldG, newG, olds, news, timing);
    for (const a of r.anims) a.id = STEP;
    (s.vitUndo ??= []).push(r.undo);
    r.anims.at(-1).finished.then(r.undo, r.undo);
    return r.anims;
  };

  const stepTo = (s, k, instant) => {
    const st = stepsOf(s), from = s.vitAt || 0;
    k = Math.max(0, Math.min(st.n, k));
    if (k === from) return;
    s.vitAt = k;
    halt(s);
    let mine = [];
    const live = !instant && !reduced.matches;
    for (const m of st.marks) {
      if (m.anim) continue;
      const a = Math.min(from, m.states.length - 1), b = Math.min(k, m.states.length - 1);
      m.states.forEach((g, i) => { g.style.display = i === b ? "inline" : "none"; });
      if (a === b || !live) continue;
      const timing = { duration: durMs(defaultMs), delay: 0, iterations: 1, direction: "normal", easing: EASING };
      const host = m.states[b].closest(".vit-mark") ?? s;
      if (!m.nodes) { mine = mine.concat(fade(s, host, m.states[a], m.states[b], null, null, timing)); continue; }
      /* Each node of the new state animates from the value of its counterpart in
         the old state to its own; the end is the node's own attribute, so it
         lands there by itself and nothing has to be committed. What has no
         in-between is collected and cross-faded. */
      const olds = [], news = [];
      m.nodes[b].forEach((el, j) => {
        const old = m.nodes[a][j], f = tween.frames([old, el], m.key);
        if (f.frames) mine.push(waapi.animate(el, f.frames, timing, STEP));
        if (f.fade) { olds.push(old); news.push(el); }
      });
      if (olds.length) mine = mine.concat(fade(s, host, m.states[a], m.states[b], olds, news, timing));
    }
    /* instant moves (landing, previews, thumbnails) are not "a step taken", so
       they don't announce; the caller's stage() does */
    if (!instant && s === slides[cur]) {
      announce();
      const done = mine.map(a => a.finished.catch(() => { }));
      if (done.length) Promise.all(done).then(() => moveDone(cur));
      else moveDone(cur);
    }
  };

  /* Cut a running step short — the new state already rests on its own
     attributes, so cancelling is jumping to the end. */
  const halt = s => {
    for (const a of waapi.of(s, STEP)) a.cancel();
    for (const f of s.vitUndo ?? []) f();
    s.vitUndo = [];
  };

  /* ── continuous animation ────────────────────────────────────────────
     None of it is the deck's: what moves says so where it is written, and tween
     and waapi start it. What is left here is the lifecycle — everything under a
     frame that is not on stage is paused, and the frame on stage plays once its
     transition is over, since a snapshot is still and a playing element would
     jump at the end. Step animations are the deck's own; halt() cancels those. */

  const loose = s => waapi.of(s).filter(a => a.id !== STEP);
  const still = s => loose(s).forEach(a => a.pause());
  const play = () => {
    if (reduced.matches || over() || atDesk()) return;
    loose(slides[cur]).forEach(a => a.play());
  };

  /* ── transition ──────────────────────────────────────────────────────
     `types` are handed to the API and deck.css selects on them; falsy means no
     transition, land at once. `setup` runs before the old snapshot is captured
     and pushes its clean-ups onto `undo`, a stack, so what was changed twice is
     restored to what it was first.

     Starting one while another runs skips that one, and its clean-ups run here
     first, synchronously: read mid-transition, a name temporarily "none" would
     be recorded as the value to restore and stay that way for good. */
  let pendingUndo = null;
  const transition = (types, update, setup, done) => {
    if (pendingUndo) pendingUndo();
    if (!types) { update(); play(); done?.(); return; }
    const undo = [];
    setup?.(undo);
    const vit = document.startViewTransition({ update, types });
    const flush = pendingUndo = () => {
      if (pendingUndo === flush) pendingUndo = null;
      while (undo.length) undo.pop()();
    };
    const clear = () => {
      const latest = pendingUndo === flush;
      flush();
      if (latest) play();
      sweep();
      done?.();
    };
    vit.finished.then(clear, clear);
  };

  const go = (i, k) => {
    i = clamp(i);
    if (i === want) return;
    const dir = i > want ? "fwd" : "back", dest = slides[i];
    /* The transition between two frames belongs to the later one: the Typst
       side wrote its types there (data-transition; none: no transition), and
       deck.css replays them in reverse when the direction is back. */
    const types = slides[Math.max(i, want)].dataset.transition;
    want = i;
    lift(dest);               // before the transition: its setup reads both sides' marks
    stepTo(dest, k || 0, true);
    transition(
      canvit && !reduced.matches && !over() && !atDesk() && types && `${types} ${dir}`.split(" "),
      () => stage(i),
      undo => {
        balance(slides[cur], dest, undo);
        soloize(slides[cur], dest, undo);
      },
      () => moveDone(i),
    );
  };

  /* go to a position: within the current frame it is a step (animated), otherwise a page change */
  const goto = q => { if (q.i === want) stepTo(slides[q.i], q.at); else go(q.i, q.at); };
  /* one notch forward/back; in the overview walk frames, ignore steps */
  const step = d => {
    const q = !over() && POS[idx(want) + d];
    if (q) goto(q); else go(want + d);
  };
  const next = () => step(1);
  const prev = () => step(-1);

  /* ── input ────────────────────────────────────────────────────────── */

  const NEXT = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "j"]);
  const PREV = new Set(["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "k"]);

  /* the keys, as the help overlay lists them; README keeps the same table */
  const KEYS = [
    ["→ ↓ PageDown Space Enter n j", "Next: step, frame or page"],
    ["← ↑ PageUp Backspace p k", "Previous"],
    ["Home / End", "First / last page"],
    ["1 – 9", "Page"],
    ["o / a", "Overview (Esc closes it)"],
    ["Esc / Enter", "Desk ⇄ presenting"],
    ["f", "Full screen"],
    ["l", "Laser pointer"],
    ["s", "Speaker view"],
    ["b / .", "Black screen"],
    ["- / = / 0", "Slower / faster / normal speed"],
    ["?", "This help"],
  ];

  const onKey = e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    /* a black screen and the help are modal: only their own keys act */
    if (black) { if (e.key === "b" || e.key === "." || e.key === "Escape") { e.preventDefault(); toggleBlack(); } return; }
    if (!help.hidden) { if (e.key === "?" || e.key === "Escape") { e.preventDefault(); toggleHelp(); } return; }

    if (atDesk() && e.key === "Enter") { e.preventDefault(); present(); return; }   // Enter presents; the other "next" keys walk the deck

    if (NEXT.has(e.key)) { e.preventDefault(); next(); }
    else if (PREV.has(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); pick(0); }
    else if (e.key === "End") { e.preventDefault(); pick(groups[gn - 1].from); }
    else if (e.key === "f") { e.preventDefault(); toggleFullscreen(); }
    else if (e.key === "l") { e.preventDefault(); toggleLaser(); }
    else if (e.key === "s") { e.preventDefault(); openSpeaker(); }
    else if (e.key === "b" || e.key === ".") { e.preventDefault(); toggleBlack(); }
    else if (e.key === "?") { e.preventDefault(); toggleHelp(); }
    else if (e.key === "-") { e.preventDefault(); setSpeed(speed / 1.25); }
    else if (e.key === "=" || e.key === "+") { e.preventDefault(); setSpeed(speed * 1.25); }
    else if (e.key === "0") { e.preventDefault(); setSpeed(1); }
    else if (e.key === "a" || e.key === "o") { e.preventDefault(); toggleOverview(); }
    else if (e.key === "Escape" && !atDesk()) { e.preventDefault(); if (over()) toggleOverview(); else toggleDesk(); }
    else if (e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      pick(groups[Math.min(parseInt(e.key, 10) - 1, gn - 1)].from);
    }
  };

  /* Click = navigate: left third goes back, the rest forward.

     Bound on document and judged by coordinates, not on the deck by target:
     during a transition the browser stops hit-testing the real DOM and every
     event targets <html>, so a listener on the deck would hear nothing until
     the animation is over. */
  const frac = (pt, el) => {
    const r = el.getBoundingClientRect();
    const x = (pt.clientX - r.left) / r.width, y = (pt.clientY - r.top) / r.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  };
  const tap = q => { if (q.x < 1 / 3) prev(); else next(); };

  const onClick = e => {
    if (over() || atDesk()) {
      const d = e.target.closest(".vit-dots i");
      if (d) { pick(+d.dataset.frame, +d.dataset.at); return; }
      const g = e.target.closest(".vit-group");
      if (g) {
        const f = slides.indexOf(g.querySelector(".vit-slide"));
        if (peeked && gOf[peeked.i] === gOf[f]) pick(peeked.i, peeked.at);   // a dot being previewed opens its own position
        else pick(f, 0);
      }
      return;
    }
    if (e.target.closest("a, button, input, select, textarea, pre, table")) return;
    if (bar && frac(e, bar)) return;         // a click on the toolbar during a transition is not a page turn
    if (lasing && touching) return;          // pointing by touch is not a page turn
    const q = frac(e, deck);
    if (q) tap(q);
  };

  let tx = 0, ty = 0, swiping = false;
  const onTouchStart = e => {
    const t = e.changedTouches[0];
    swiping = !!frac(t, atDesk() ? view : deck);
    tx = t.clientX;
    ty = t.clientY;
  };
  const onTouchEnd = e => {
    if (!swiping || lasing) return;          // no swiping while the laser is on
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)();
  };

  /* Wheel navigation: down is forward, up is back. A mouse wheel notch is
     deltaY≈100, one notch one position; a trackpad gesture is a burst of small
     deltas, accumulated until a threshold, then reset and cooled down for
     300ms so the gesture's inertia mostly lands in the cool-down. In the
     overview the wheel scrolls the grid. The main deck and the speaker
     preview share wheel(). */
  let wheelAcc = 0, wheelAt = 0;
  const wheel = e => {
    const now = Date.now();
    if (now - wheelAt < 300) { wheelAcc = 0; return; }
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    wheelAt = now;
    if (wheelAcc > 0) next(); else prev();
    wheelAcc = 0;
  };
  const onWheel = e => { if (!over() && frac(e, atDesk() ? view : deck)) wheel(e); };

  /* "#3" = page 3, first position; "#3.4" = page 3, fourth position (frames and steps flattened) */
  const fromHash = () => {
    const m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
    if (!m) return POS[0];
    const g = groups[Math.min(Math.max(parseInt(m[1], 10) - 1, 0), gn - 1)];
    return g.pos[Math.min(Math.max(m[2] ? parseInt(m[2], 10) - 1 : 0, 0), g.pos.length - 1)];
  };

  const initInput = () => {
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("pointermove", e => { showBar(); route(e); });
    document.addEventListener("pointerdown", route);
    document.addEventListener("pointerup", () => { if (touching) laser.classList.remove("is-on"); });
    document.addEventListener("pointercancel", () => laser.classList.remove("is-on"));
    /* follow the address bar (replaceState does not fire this, so our own writes don't loop back) */
    addEventListener("hashchange", () => goto(fromHash()));
  };

  /* ── modes ────────────────────────────────────────────────────────── */

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen().catch(() => { });
  };

  /* Overview ⇄ presenting: a whole-page zoom. The thumbnail and the shown page
     are the same .vit-slide, so a temporary name on it makes the browser
     interpolate its box. Meanwhile the CSS overrides every .vit-mark name so
     the marks fold into root — otherwise leftovers from the previous page pair
     up and fly, which is a page turn, not an opening. */
  const zoomTo = (i, update, done) => {
    const dest = groups[gOf[i]].el;
    transition(canvit && !reduced.matches && ["overview"], update, undo => {
      dest.style.viewTransitionName = "vit-overview";
      undo.push(() => { dest.style.viewTransitionName = ""; });
    }, done);
  };

  const toggleOverview = () => {
    if (over()) openSlide(cur);
    else zoomTo(cur, () => {
      deck.classList.remove("vit-desk");
      deck.classList.add("vit-all");
      still(slides[cur]);
      syncTools();
    });
  };

  /* Open a page from the overview; without a step, at whatever step the
     thumbnail shows. Clicking the previewed dot means that step — the dots'
     pointerleave on leaving the overview must not move it back. */
  const openSlide = (i, k) => {
    want = i;
    if (peeked && peeked.i !== i) unpeek();   // a preview of another page is put back; this page's is what opens
    peeked = null;
    if (k != null) stepTo(slides[i], k, true);
    zoomTo(i, () => { deck.classList.remove("vit-all"); stage(i); }, () => moveDone(i));
  };

  /* Choosing a position: from the overview it opens, from the desk or the
     presentation it is where we go. The peek a hovered dot left behind is put
     back first — it already stepped that frame, and a move that finds itself
     where it wanted to be does nothing at all, preview and address bar
     included. */
  const pick = (i, k) => {
    if (over()) { openSlide(i, k); return; }
    unpeek();
    goto({ i, at: k || 0 });
  };

  /* ── the desk ─────────────────────────────────────────────────────────
     Where the deck opens and what Esc comes back to: thumbnails down one side,
     the page they point at beside them, its notes under it. The preview is the
     same mirror the speaker view uses, so there is one renderer and it plays
     the real transitions. Going either way is instant — the page is on screen
     twice while the desk is up, and no zoom can be drawn between. */
  let pane = null, view = null, notes = null;
  const buildPane = () => {
    if (mirror) return;
    pane = document.createElement("div");
    pane.className = "vit-pane";
    pane.innerHTML = "<div class='vit-view'><iframe class='vit-mirror' name='vit-mirror' title='Preview'></iframe></div><div class='vit-notes'></div>";
    view = pane.querySelector("iframe");
    notes = pane.querySelector(".vit-notes");
    document.body.appendChild(pane);
    deck.addEventListener("vit:move-ready", syncPane);
  };

  const syncPane = () => {
    if (!atDesk()) return;
    show(view, label(cur));
    notes.innerHTML = noteOf(cur);
  };

  const toggleDesk = () => {
    if (atDesk()) { present(); return; }
    deck.classList.remove("vit-all");
    deck.classList.add("vit-desk");
    still(slides[cur]);
    syncThumbs(true);
    syncPane();
    syncTools();
    showBar();
  };

  /* the selected page, full size: from the overview with its zoom, from the desk at once */
  const present = () => {
    if (over()) { openSlide(cur); return; }
    deck.classList.remove("vit-desk");
    play();
    syncTools();
    showBar();
  };

  /* black screen (b / .): "look at me, not at the screen" — everything in the body is hidden, the keys still work */
  let black = false;
  const toggleBlack = () => {
    black = !black;
    document.body.classList.toggle("vit-black", black);
  };

  /* the key table, on ? */
  let help = null;
  const toggleHelp = () => { help.hidden = !help.hidden; };
  const buildHelp = () => {
    help = document.createElement("div");
    help.className = "vit-help";
    help.hidden = true;
    const table = document.createElement("table");
    for (const row of KEYS) {
      const tr = table.insertRow();
      row.forEach((cell, k) => {
        const td = tr.insertCell();
        td.appendChild(k ? document.createTextNode(cell) : Object.assign(document.createElement("kbd"), { textContent: cell }));
      });
    }
    help.appendChild(table);
    const about = document.createElement("div");
    about.className = "vit-about";
    about.textContent = `vit${deck.dataset.version ? ` ${deck.dataset.version}` : ""}`;
    help.appendChild(about);
    help.addEventListener("click", toggleHelp);
    document.body.appendChild(help);
  };

  /* ── toolbar ─────────────────────────────────────────────────────────
     Built by the runtime, so every deck has one. Lives outside .vit-deck with
     its own view-transition-name, so a page transition never drags it along.
     A toolbar can be built in any document: one in the main window
     (auto-hiding), one in the speaker view (always shown, bottom right).
     Buttons call the same functions; syncTools() refreshes them together. */

  const ICON = {
    desk: "M4 5h16v14H4zM10 5v14",
    play: "M8 5l11 7-11 7z",
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    laser: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1",
    down: "M12 4v10M8 12l4 4 4-4M5 20h14",
    notes: "M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4",
    full: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
    unfull: "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5",
  };

  const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/>${extra}</svg>`;

  /* PDF download. data-pdf="auto" is the .pdf with this page's name, "none" no
     button. download + target=_blank together: where the download attribute is
     ignored it merely opens a tab. */
  let pdfHref = "";
  const pdfLink = () => {
    const v = deck.dataset.pdf;
    if (v === "none") return "";
    if (v !== "auto") return v;
    const m = /^([^?#]*)\.x?html?$/i.exec(location.href);
    return m ? `${m[1]}.pdf` : "";
  };

  const buildBar = doc => {
    const button = (title, markup, action) => {
      const el = doc.createElement("button");
      el.type = "button";
      el.title = title;
      el.setAttribute("aria-label", title);
      el.innerHTML = markup;
      el.addEventListener("click", e => { e.stopPropagation(); action(); });
      return el;
    };
    const b = { el: doc.createElement("div"), count: doc.createElement("div") };
    b.el.className = "vit-bar";
    b.count.className = "vit-count";
    b.el.appendChild(b.count);

    b.desk = button("Desk (Esc)", svg(ICON.desk), toggleDesk);
    b.el.appendChild(b.desk);
    b.overview = button("Overview (o)", svg(ICON.grid), toggleOverview);
    b.el.appendChild(b.overview);
    b.laser = button("Laser pointer (l)", svg(ICON.laser, '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>'), toggleLaser);
    b.el.appendChild(b.laser);
    b.el.appendChild(button("Speaker view (s)", svg(ICON.notes), openSpeaker));

    if (pdfHref) {
      const a = doc.createElement("a");
      a.className = "vit-dl";
      a.href = pdfHref;
      a.download = "";
      a.target = "_blank";
      a.rel = "noopener";
      a.title = "Download PDF";
      a.setAttribute("aria-label", "Download PDF");
      a.innerHTML = svg(ICON.down);
      a.addEventListener("click", e => e.stopPropagation());
      b.el.appendChild(a);
    }

    b.full = button("Full screen (f)", svg(ICON.full), toggleFullscreen);
    b.el.appendChild(b.full);
    return b;
  };

  /* The two previews in the speaker view are copies of this very HTML
     (iframe name="vit-mirror"): they only display, no toolbar. */
  const bars = [];
  let bar = null;
  const buildToolbar = () => {
    pdfHref = pdfLink();
    document.addEventListener("fullscreenchange", syncTools);
    deck.addEventListener("vit:move-ready", syncTools);
    if (mirror) return;
    const mainBar = buildBar(document);
    bars.push(mainBar);
    bar = mainBar.el;
    document.body.appendChild(bar);
    bar.addEventListener("pointerenter", showBar);
    bar.addEventListener("pointerleave", showBar);
  };

  /* auto-hide: the bar is chrome, not content. Shown on every activity and
     hidden 2.4 s after the last, unless the pointer or the focus is on it. */
  let barTimer = null;
  const hideBar = () => {
    if (bar.matches(":hover") || bar.contains(document.activeElement)) { barTimer = setTimeout(hideBar, 2400); return; }
    bar.classList.remove("is-shown");
  };
  const showBar = () => {
    if (!bar) return;
    bar.classList.add("is-shown");
    clearTimeout(barTimer);
    if (!atDesk()) barTimer = setTimeout(hideBar, 2400);   // at the desk the toolbar is part of the furniture
  };

  /* ── laser pointer ───────────────────────────────────────────────────
     The mouse gets a CSS cursor image, in deck.css; touch and pen have no
     cursor to restyle and get a DOM dot, routed by each event's own
     pointerType. `lasing` is presentation state: the overview only tucks the
     cursor or dot away, and it comes back on leaving. */

  let lasing = false;
  let touching = false;   // whether the latest input was non-mouse
  let laser = null;
  const buildLaser = () => {
    laser = document.createElement("div");
    laser.className = "vit-laser";
    document.body.appendChild(laser);
  };

  const dot = (x, y) => {
    laser.style.transform = `translate(${x}px,${y}px)`;
    laser.classList.add("is-on");
  };

  const route = e => {
    const mouse = e.pointerType === "mouse" || e.pointerType === "";
    touching = !mouse;
    document.body.classList.toggle("vit-nomouse", touching);
    if (!lasing || mouse || over() || atDesk()) { laser.classList.remove("is-on"); return; }
    dot(e.clientX, e.clientY);
  };

  const toggleLaser = () => {
    lasing = !lasing;
    document.body.classList.toggle("vit-lasing", lasing);
    if (!lasing) laser.classList.remove("is-on");
    syncTools();
    showBar();
  };

  const syncTools = () => {
    const text = `${label(cur)} / ${gn}${speed === 1 ? "" : ` · ${speed}×`}`;   // a multiplier survives reloads: keep it in sight
    const fs = !!document.fullscreenElement;
    for (const b of bars) {
      b.el.ownerDocument.body.classList.toggle("vit-lasing", lasing);   // the speaker window's cursor follows too
      b.count.textContent = text;
      b.desk.innerHTML = svg(atDesk() ? ICON.play : ICON.desk);
      b.desk.title = atDesk() ? "Present (Enter)" : "Desk (Esc)";
      b.desk.setAttribute("aria-label", b.desk.title);
      b.overview.setAttribute("aria-pressed", String(over()));
      b.laser.setAttribute("aria-pressed", String(lasing));
      b.full.innerHTML = svg(fs ? ICON.unfull : ICON.full);
      b.full.title = fs ? "Exit full screen (f)" : "Full screen (f)";
      b.full.setAttribute("aria-label", b.full.title);
    }
  };

  /* flash something (the speed multiplier, say) where the counter is; syncTools writes the page number back after 900ms */
  let flashTimer = null;
  const flash = text => {
    for (const b of bars) b.count.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(syncTools, 900);
    showBar();
  };

  /* Chrome theme: deck(theme:) fixes it, auto follows the system. Only the
     verdict lands on <html data-theme>; every colour is a token in deck.css,
     and the speaker window copies the same tokens. */
  let speaker = null, spk = null, spkFrom = 0;
  const applyTheme = () => {
    const t = deck.dataset.theme;
    root.dataset.theme = t === "auto" ? (prefersLight.matches ? "light" : "dark") : t;
    if (speaker && !speaker.closed) speaker.document.documentElement.dataset.theme = root.dataset.theme;
  };
  const initTheme = () => {
    prefersLight.addEventListener("change", applyTheme);
    applyTheme();
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
    d.body.innerHTML =
      "<div class='prog'><i></i></div>" +
      "<header><b></b><span></span><time title='Click to reset'>00:00</time></header>" +
      "<main><iframe class='vit-mirror' name='vit-mirror'></iframe><div class='vit-notes'></div></main>" +
      "<aside><small>Next</small><iframe class='vit-mirror' name='vit-mirror'></iframe></aside>";
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

    /* its own toolbar, always shown bottom right; buttons and state are the main window's */
    const b = buildBar(d);
    b.el.classList.add("is-shown");
    d.body.appendChild(b.el);
    bars.push(b);
    speaker.addEventListener("pagehide", () => bars.splice(bars.indexOf(b), 1));

    /* a key pressed in this window is a key pressed in the main window, so it doubles as a remote */
    d.addEventListener("keydown", e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, cancelable: true }));
    });

    /* The "current" preview stands in for the main deck: clicking it is
       clicking the deck (same frac/tap), and moving over it with the laser on
       points on the main window. That window has no mouse whose cursor could
       change, so it gets the DOM dot; coordinates map preview box → main deck
       box proportionally. */
    d.addEventListener("click", e => {
      if (e.target.closest("a, button")) return;
      const q = frac(e, spk.now);
      if (q) tap(q);
    });
    d.addEventListener("wheel", e => { if (frac(e, spk.now)) wheel(e); }, { passive: true });
    d.addEventListener("pointermove", e => {
      if (!lasing || over()) return;
      const q = frac(e, spk.now);
      if (!q) { laser.classList.remove("is-on"); return; }
      const m = deck.getBoundingClientRect();
      dot(m.left + q.x * m.width, m.top + q.y * m.height);
    });
    d.documentElement.addEventListener("pointerleave", () => laser.classList.remove("is-on"));

    syncSpeaker();
    syncTools();
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
    const g = groups[gOf[cur]], nx = POS[idx(cur) + 1];
    spk.page.textContent = `${label(cur)} / ${gn}`;
    spk.prog.style.width = progress(cur);
    spk.title.textContent = g.title;
    show(spk.now, label(cur));
    spk.next.hidden = !nx;
    spk.nextCap.textContent = !nx ? "Last page" : gOf[nx.i] === gOf[cur] ? "Next step" : "Next page";
    if (nx) show(spk.next, label(nx.i, nx.at));
    spk.note.innerHTML = noteOf(cur);
  };

  const initSpeaker = () => {
    deck.addEventListener("vit:move-ready", syncSpeaker);
    /* close it when the main window goes, so no window is left out of sync */
    addEventListener("pagehide", () => { if (speaker && !speaker.closed) speaker.close(); });
  };

  /* ── init ─────────────────────────────────────────────────────────── */

  /* the frame the address bar names goes on stage; from here on the deck is live */
  const land = () => {
    deck.setAttribute("data-ready", "");
    root.style.setProperty("--vit-speed", speed);
    const h0 = fromHash();
    stepTo(slides[h0.i], h0.at, true);
    if (!mirror) deck.classList.add("vit-desk");   // the deck opens on the desk; a preview opens on its page
    stage(want = h0.i);
    moveDone(h0.i);
    play();
    showBar();
    deck.addEventListener("vit:move-ready", sweep);
    sweep();
    window.vit = {
      go, next, prev,
      get index() { return cur; },
      get total() { return n; },
      get step() { return at(cur); }, set step(k) { stepTo(slides[cur], k); },
      get steps() { return stepsOf(slides[cur]).n; },
      get speed() { return speed; }, set speed(v) { setSpeed(v); },
      get version() { return deck.dataset.version || null; },
      /* "desk" (where it opens), "present" or "overview" — what the toolbar and Esc / Enter / o switch between */
      get mode() { return over() ? "overview" : atDesk() ? "desk" : "present"; },
      set mode(m) {
        if (m === "overview") { if (!over()) toggleOverview(); }
        else if (m === "desk") { if (!atDesk()) toggleDesk(); }
        else present();
      },
      deck,
    };
  };

  const init = () => {
    deck = document.querySelector(".vit-deck");
    slides = deck ? [...deck.querySelectorAll(".vit-slide")] : [];
    n = slides.length;
    if (!n) return;
    settings();
    buildModel();
    buildCaptions();
    buildToolbar();
    buildPane();
    buildLaser();
    buildHelp();
    initTheme();
    initSpeaker();
    initInput();
    land();
  };

  /* Lifting forces layout, so wait for the browser's own first pass: forcing
     one while the parser is still filling the document lays the whole deck out
     twice. `DOMContentLoaded` is before that pass, and `requestAnimationFrame`
     never runs in a background tab. */
  if (document.readyState === "complete") init();
  else addEventListener("load", init, { once: true });
})();
