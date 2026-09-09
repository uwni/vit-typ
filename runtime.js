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
     Navigation walks frames, the overview shows groups. The title is the
     thumbnail's caption, which the browser has flattened to plain text. */
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
    store("vit-speed", speed);
    root.style.setProperty("--vit-speed", speed);
    syncSettings();
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

  /* One reader and one writer for everything the presenter chooses. */
  const store = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch { }
    return v;
  };

  /* deck(…) parameters, the presenter's speed, what this browser can do */
  const settings = () => {
    defaultMs = parseInt(deck.dataset.duration, 10);
    EASING = deck.dataset.easing.split(" ").map(Number);   // the four numbers of a cubic Bézier
    speed = parseFloat(store("vit-speed")) || 1;
    reduced = matchMedia("(prefers-reduced-motion: reduce)");
    prefersLight = matchMedia("(prefers-color-scheme: light)");
    canvit = typeof document.startViewTransition === "function";
  };

  /* How many steps a frame has, from data-steps — so the whole model is known
     before a single page is opened. */
  const stepCount = s => +s.dataset.steps || 0;

  /* pages, frames and steps into the position sequence */
  const buildModel = () => {
    for (const el of deck.querySelectorAll(".vit-group")) {
      const t = el.querySelector(".vit-cap span");
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
        for (let k = 0; k <= stepCount(slides[i]); k++) {
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
    waapi.refit();   // this frame's box is new, and a followed path is in pixels
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
     dots' state.

     `scroll` brings the current thumbnail into view: "center" when the grid
     opens, so you can see where you are, and true — nearest — on a move, so
     the rail does not jump. Hovering a dot passes neither: a preview must
     leave the rail where the reader put it. */
  const syncThumbs = (scroll = false) => {
    const now = idx(cur);
    groups.forEach((g, k) => {
      const here = gOf[cur] === k, peekHere = peeked && gOf[peeked.i] === k;
      const shown = peekHere ? peeked.i : here ? cur : g.to - 1;
      /* Judge by `want`, not `cur`: the page we are entering (transition not yet
         settled) has already been positioned — don't move it back. The moment
         the overview zoom starts, the browser stops hit-testing the real DOM and
         the dots receive pointerleave first. */
      if (!here && !peekHere && gOf[want] !== k) stepTo(slides[shown], stepCount(slides[shown]), true);
      for (let i = g.from; i < g.to; i++) slides[i].classList.toggle("is-thumb", i === shown);
      g.el.classList.toggle("is-here", here);
      if (scroll && here && (atDesk() || over())) g.el.scrollIntoView({ block: scroll === "center" ? "center" : "nearest" });
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

  /* The dots pair off with the page's positions in order: the nth dot is the
     nth position. A caption too wide for the rail is clipped to an ellipsis and
     left at that: a tooltip would have to repeat the text the browser laid out,
     which only the browser knows. */
  const readDots = () => {
    for (const g of groups) {
      const rail = g.el.querySelector(".vit-dots");
      if (!rail) continue;
      g.dots = [...rail.children];
      g.dots.forEach((el, d) => {
        const q = g.pos[d];
        if (!q) return;
        el.vitPos = q;
        /* hovering swaps the thumbnail to that step — no need to open the page to
           see which step is which */
        el.addEventListener("pointerenter", () => peek(q.i, q.at));
      });
      rail.addEventListener("pointerleave", () => peek(null));
    }
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
    for (const m of marks) {
      m.nodes = tween.nodes(m.states, m.key);
      /* a drawing that plays its states over time is not stepped; whether it
         does is its own business, so we ask rather than look */
      m.anim = tween.plays(m.box);
    }
    return (s.vitSteps = { marks, n: stepCount(s) });
  };

  /* A step's animations are the deck's to cancel when the next one starts; a
     continuous one plays and pauses with the frame. The browser keeps both —
     they are asked for by role — and what it cannot keep stays here: the
     clean-ups a cross-fade owes, and the callbacks that re-measure a track. */
  const STEP = "vit:step";

  /* the engine returns the animations and the undo; the frame keeps the undo,
     so that halt() can put back what a cancelled cross-fade changed */
  const fade = (s, oldG, newG, olds, news, timing) => {
    const r = tween.crossfade(oldG, newG, olds, news, timing);
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
      if (!m.nodes) { mine = mine.concat(fade(s, m.states[a], m.states[b], null, null, timing)); continue; }
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
      if (olds.length) mine = mine.concat(fade(s, m.states[a], m.states[b], olds, news, timing));
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
    if (reduced.matches) return;
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
      canvit && !reduced.matches && types && `${types} ${dir}`.split(" "),
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

  const onKey = e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    /* a black screen and the help are modal: only their own keys act */
    if (black) { if (e.key === "b" || e.key === "." || e.key === "Escape") { e.preventDefault(); toggleBlack(); } return; }
    if (help.open) { if (e.key === "?") { e.preventDefault(); toggleHelp(); } return; }   // Escape is the dialog's own
    if (panel?.open) { if (e.key === ",") { e.preventDefault(); toggleSettings(); } return; }   // Escape is the dialog's own

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
    else if (e.key === ",") { e.preventDefault(); toggleSettings(); }
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
      if (d) { if (d.vitPos) pick(d.vitPos.i, d.vitPos.at); return; }
      const g = e.target.closest(".vit-group");
      if (g) {
        const f = slides.indexOf(g.querySelector(".vit-slide"));
        if (peeked && gOf[peeked.i] === gOf[f]) pick(peeked.i, peeked.at);   // a dot being previewed opens its own position
        else pick(f, 0);
      }
      return;
    }
    if (e.target.closest("a, button, input, select, textarea, pre, table")) return;
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
    /* The deck's clicks come to the deck: the browser routes them, so a
       dialog's own click, a button on the toolbar and the margin beside the
       stage never arrive here at all. */
    deck.addEventListener("click", onClick);
    deck.addEventListener("touchstart", onTouchStart, { passive: true });
    deck.addEventListener("touchend", onTouchEnd, { passive: true });
    deck.addEventListener("wheel", onWheel, { passive: true });
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
  const zoomTo = (i, update, done) => zoom(groups[gOf[i]].el, update, done);

  /* One box interpolated into another. Whoever is named is what the browser
     carries across, so the caller names the thing that is in both states: the
     page for the overview, the frame itself for the desk. */
  const zoom = (dest, update, done) =>
    transition(canvit && !reduced.matches && ["overview"], update, undo => {
      dest.style.viewTransitionName = "vit-overview";
      undo.push(() => { dest.style.viewTransitionName = ""; });
    }, done);

  const toggleOverview = () => {
    if (over()) openSlide(cur);
    else zoomTo(cur, () => {
      deck.classList.remove("vit-desk");
      deck.classList.add("vit-all");
      still(slides[cur]);
      syncPane();
      /* the grid opens where we are, not at the top; inside the update callback,
         so the zoom flies to where the thumbnail will actually be */
      syncThumbs("center");
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
     page beside them is the frame itself, moved out of the rail, so the deck is
     never rendered twice — and going either way is a zoom, because the small
     one and the big one are the same element for the browser to carry across. */
  let pane = null, view = null, notes = null;
  const findPane = () => {
    pane = document.querySelector(".vit-pane");
    if (!pane) return;
    view = pane.querySelector(".vit-view");
    notes = pane.querySelector(".vit-notes");
    deck.addEventListener("vit:move-ready", syncPane);
  };

  /* ── the page, in two places ─────────────────────────────────────────
     At the desk the page is wanted big beside the rail and small within it,
     and there is only one of it. So the page goes big — the element itself,
     which keeps it live and lets it morph into the presented page — and its
     place in the rail is held by a stand-in: an <svg> of two nodes whose
     <use> points back at the very same drawing.

     Two things the reference needs. The width and height have to be given:
     the source carries its size in points, and left to itself it would draw
     a third too large. And a mark that hoisting has lifted out of the page
     is no longer inside it — what is referenced there is the <g> within,
     which carries the matrix that puts it back in the page's own space. */
  let parked = null;   // { slide, home, next, stand } — where it came from

  const standFor = slide => {
    const page = slide.querySelector(".vit-page");
    const src = page?.querySelector("svg");
    if (!src) return null;
    const box = src.getAttribute("viewBox");
    const [, , w, h] = box.split(/\s+/).map(Number);
    src.id ||= `vit-src-${slides.indexOf(slide)}`;
    const marks = [...page.querySelectorAll("svg.vit-mark > g")];
    marks.forEach((g, i) => (g.id ||= `${src.id}-m${i}`));
    const svg = (tag, attrs) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };
    const el = svg("svg", { class: "vit-stand", viewBox: box });
    el.append(svg("use", { href: `#${src.id}`, width: w, height: h }));
    for (const g of marks) el.append(svg("use", { href: `#${g.id}` }));
    return el;
  };

  /* Put the frame back exactly where it was taken from, whatever has happened
     to the rail meanwhile. */
  const toRail = () => {
    if (!parked) return;
    const { slide, home, next, stand } = parked;
    parked = null;
    stand.remove();
    home.insertBefore(slide, next);
  };

  /* The frame moves, not the page: the caption and the dots stay behind in the
     rail, and the stand-in slots in exactly where the frame was. Which frame is
     the model's answer, not the rail's — the rail is only told about it after. */
  const toPane = () => {
    const slide = slides[cur];
    if (parked?.slide === slide) return;
    toRail();
    const stand = standFor(slide);
    if (!stand) return;
    parked = { slide, home: slide.parentNode, next: slide.nextSibling, stand };
    slide.replaceWith(stand);
    view.replaceChildren(slide);
  };

  const syncPane = () => {
    if (!atDesk()) { toRail(); return; }
    toPane();
    notes.innerHTML = noteOf(cur);
  };

  const toggleDesk = () => {
    if (atDesk()) { present(); return; }
    zoom(slides[cur], () => {
      deck.classList.remove("vit-all");
      deck.classList.add("vit-desk");
      still(slides[cur]);
      syncThumbs(true);
      syncPane();
      syncTools();
      showBar();
    });
  };

  /* the selected page, full size: from the overview with its zoom, from the desk at once */
  const present = () => {
    if (over()) { openSlide(cur); return; }
    zoom(slides[cur], () => {
      deck.classList.remove("vit-desk");
      syncPane();
      syncTools();
      showBar();
    });
  };

  /* black screen (b / .): "look at me, not at the screen" — everything in the body is hidden, the keys still work */
  let black = false;
  const toggleBlack = () => {
    black = !black;
    document.body.classList.toggle("vit-black", black);
  };

  /* the key table, on ? */
  let help = null;
  const toggleHelp = () => { if (help.open) help.close(); else help.showModal(); };
  const findHelp = () => {
    help = document.querySelector(".vit-help");
    help?.addEventListener("click", () => help.close());
  };

  /* ── settings ────────────────────────────────────────────────────────
     A control in the panel names what it sets in data-set, and appears here
     once: how to read it, how to apply it, and how to say it. */
  const TRAIL = 400;
  let panel = null;

  const DIALS = {
    speed: {
      read: () => speed,
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

  /* the controls show what is in force, whatever moved it — a key, the panel
     or another window */
  const syncSettings = () => {
    if (!panel || !panel.open) return;
    for (const el of panel.querySelectorAll("[data-set]")) {
      const dial = DIALS[el.dataset.set];
      if (!dial) continue;
      const v = dial.read();
      if (el.tagName === "INPUT") el.value = v;
      else for (const b of el.children) b.setAttribute("aria-pressed", String(b.dataset.value === v));
      const out = panel.querySelector(`[data-out="${el.dataset.set}"]`);
      if (out && dial.say) out.textContent = dial.say(v);
    }
  };

  const toggleSettings = () => {
    if (panel.open) panel.close();
    else { panel.showModal(); syncSettings(); }
  };

  const resetSettings = () => {
    for (const k of ["vit-speed", "vit-trail", "vit-ink", "vit-size", "vit-theme"]) store(k, null);
    setSpeed(1);
    setTrail(TRAIL);
    applyLaser();
    applyTheme();
    syncSettings();
  };

  const findSettings = () => {
    panel = document.querySelector(".vit-settings");
    if (!panel) return;
    panel.addEventListener("input", e => {
      const dial = DIALS[e.target.dataset.set];
      if (dial) { dial.write(e.target.value); syncSettings(); }
    });
    panel.addEventListener("click", e => {
      if (e.target === panel) { panel.close(); return; }             // the backdrop
      const seg = e.target.closest(".vit-seg [data-value]");
      if (seg) { DIALS[seg.parentNode.dataset.set].write(seg.dataset.value); syncSettings(); return; }
      if (e.target.closest('[data-act="reset"]')) resetSettings();
    });
  };

  /* ── toolbar ─────────────────────────────────────────────────────────
     Outside .vit-screen, so a page transition neither captures it nor drags it
     along — while one runs it is simply not on screen. There are two: the main
     window's, which auto-hides, and the speaker view's, which does not. Each
     button names what it does in data-act, and syncTools() refreshes them
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

  const wireBar = el => {
    const acts = { desk: toggleDesk, overview: toggleOverview, laser: toggleLaser, speaker: openSpeaker, settings: toggleSettings, full: toggleFullscreen };
    const b = { el, count: el.querySelector(".vit-count") };
    for (const [act, run] of Object.entries(acts)) {
      const btn = el.querySelector(`[data-act="${act}"]`);
      if (!btn) continue;
      b[act] = btn;
      btn.addEventListener("click", e => { e.stopPropagation(); run(); });
    }
    const dl = el.querySelector(".vit-dl");
    if (dl) {
      if (!dl.getAttribute("href")) {
        const href = pdfLink();
        if (href) dl.href = href;
        else dl.remove();                     // no name to build one from
      }
      dl.addEventListener("click", e => e.stopPropagation());
    }
    return b;
  };

  /* The two previews in the speaker view are copies of this very HTML
     (iframe name="vit-mirror"): they only display, no toolbar. */
  const bars = [];
  let bar = null;
  const findToolbar = () => {
    document.addEventListener("fullscreenchange", syncTools);
    deck.addEventListener("vit:move-ready", syncTools);
    bar = document.querySelector(".vit-bar");
    if (!bar) return;
    bars.push(wireBar(bar));
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
  let laserUrl = "", laserInk = "", laserSize = 32, laserPx = 32;
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
    applyLaser();
  };

  const findTrail = () => {
    segs = [...(document.querySelector(".vit-trail")?.children ?? [])];
    const kept = parseInt(store("vit-trail"), 10);
    setTrail(Number.isFinite(kept) ? kept : TRAIL);
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
  const route = e => {
    const mouse = e.pointerType === "mouse" || e.pointerType === "";
    touching = !mouse;
    document.body.classList.toggle("vit-nomouse", touching);
    if (!lasing || over() || atDesk()) { laser.classList.remove("is-on"); clearTrail(); return; }
    if (mouse) { laser.classList.remove("is-on"); trail(e.clientX, e.clientY); }
    else dot(e.clientX, e.clientY);
  };

  const toggleLaser = () => {
    lasing = !lasing;
    document.body.classList.toggle("vit-lasing", lasing);
    if (!lasing) { laser.classList.remove("is-on"); clearTrail(); }
    syncTools();
    showBar();
  };

  const syncTools = () => {
    const text = `${label(cur)} / ${gn}${speed === 1 ? "" : ` · ${speed}×`}`;   // a multiplier survives reloads: keep it in sight
    const fs = !!document.fullscreenElement;
    for (const b of bars) {
      b.el.ownerDocument.body.classList.toggle("vit-lasing", lasing);   // the speaker window's cursor follows too
      b.count.textContent = text;
      showFace(b.desk, atDesk() ? "play" : "desk");
      b.overview.setAttribute("aria-pressed", String(over()));
      b.laser.setAttribute("aria-pressed", String(lasing));
      showFace(b.full, fs ? "unfull" : "full");
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
    const t = store("vit-theme") ?? deck.dataset.theme;
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
    /* the window's whole body, its toolbar included */
    d.body.appendChild(d.importNode(document.querySelector("template.vit-speaker-body").content, true));
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
    const b = wireBar(d.querySelector(".vit-bar"));
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
    /* the deck's box changes without a window resize: desk ⇄ presenting */
    new ResizeObserver(() => waapi.refit()).observe(deck);
    window.vit = {
      go, next, prev,
      get index() { return cur; },
      get total() { return n; },
      get step() { return at(cur); }, set step(k) { stepTo(slides[cur], k); },
      get steps() { return stepCount(slides[cur]); },
      get speed() { return speed; }, set speed(v) { setSpeed(v); },
      /* how long the laser's tracer lasts, in ms; 0 is none, and the document's
         room for it is the ceiling */
      get trail() { return trailMs; }, set trail(v) { setTrail(v); },
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
    /* a preview only presents: the chrome belongs to the window driving it */
    if (mirror) for (const el of document.querySelectorAll(".vit-bar, .vit-pane, .vit-help, .vit-settings, .vit-laser, .vit-trail, template.vit-speaker-body")) el.remove();
    buildModel();
    readDots();
    findToolbar();
    findPane();
    findLaser();
    findLaserLook();
    findTrail();
    findHelp();
    findSettings();
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
