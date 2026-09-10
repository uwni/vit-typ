/* ── vit · runtime ─────────────────────────────────────────────────
   The player. Three jobs:
   · Transitions — a page or frame change starts one View Transition with the
     types the Typst side wrote on the frame; everything visual is in deck.css
     under :active-view-transition-type(), so an effect is a CSS-only change.
   · Stepping — the arrow keys walk the states of the drawings on a frame,
     which tween interpolates. What plays by itself the deck only pauses.
   The deck and nothing else: what floats over it — the toolbar, the laser
   pointer, the settings panel, the speaker view — is chrome.js, which is
   written against `window.vit` and the events below and could be replaced
   whole. Nothing here knows it exists.
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

  /* Every duration in the stylesheet is divided by this, and so are the step
     animations, which are timed here. It is the presenter's knob, so who offers
     it and who remembers it is the chrome's business; the deck only has a
     speed. */
  let speed = 1;
  const durMs = ms => Math.round(ms / speed);
  const setSpeed = v => {
    speed = Math.min(4, Math.max(0.25, Math.round(v * 100) / 100));
    root.style.setProperty("--vit-speed", speed);
  };

  /* ── the state ────────────────────────────────────────────────────────
     Everything the deck is. `cur` is the frame on stage and `want` the frame
     accepted: they differ only while a transition runs, because the update half
     does not run until the old snapshot is captured, and a press arriving
     meanwhile has to count from the target already taken. `mode` is the same
     for which of the deck and the rail are shown — the mode we are going to,
     which is what a press arriving mid-zoom should be judged by; what is on
     screen until the update half runs is `<html data-mode>`, which render()
     writes. `peeked` is the position a hovered dot is previewing in place of
     the rail's own answer, and `busy` how many transitions are in flight —
     while any is, the stage is a picture and nothing on it may move.

     Nothing else holds any of this, and nothing reads it back off the DOM:
     `<html data-mode>` is written by render() and read only by the stylesheet.
     move() is the one thing that changes it. */
  let cur = -1, want = -1, mode = "present", peeked = null, busy = 0;

  let reduced, canvit;
  /* A preview inside the speaker view. It presents, shows no rail, and does
     not play a page change out: the whole of that screen runs ahead of the
     audience, so a preview lands on the new page at once and is legible from
     the first frame. What a page's own drawings do still happens there. */
  const mirror = window.name === "vit-mirror";

  const clamp = i => (i < 0 ? 0 : i > n - 1 ? n - 1 : i);

  /* A frame's own state, by frame: which step it is on, what its drawings are
     (worked out once, when it is first stepped), and what a cross-fade in
     progress owes to put back. On the model's side, not written onto the nodes:
     an index into these is the same index the rest of the model uses. */
  const atOf = [], plans = [], owed = [];
  const at = i => atOf[i] || 0;
  const over = () => mode === "overview";
  const atDesk = () => mode === "desk";
  const presenting = () => mode === "present";

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
    reduced = matchMedia("(prefers-reduced-motion: reduce)");
    canvit = typeof document.startViewTransition === "function";
  };

  /* How many steps a frame has, from data-steps — so the whole model is known
     before a single page is opened. */
  const stepCount = s => +s.dataset.steps || 0;

  /* pages, frames and steps into the position sequence */
  const buildModel = () => {
    const thumbs = [...(rail?.children ?? [])];
    for (const el of deck.querySelectorAll(".vit-group")) {
      /* One page is a group in the deck and a thumbnail in the rail, in the
         same order — the deck emitted both from the one list of pages. */
      const thumb = thumbs[groups.length];
      const t = thumb?.querySelector(".vit-cap span");
      const g = {
        el, thumb,
        stand: thumb?.querySelector(".vit-stand"),
        title: t ? t.textContent.trim() : "",
        from: gOf.length, to: gOf.length,
      };
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

  /* Everything the state is, on the screen, and nothing else: which frame is
     on stage, which mode is up, what the rail and the toolbar show. It moves
     nothing and decides nothing — running it twice is running it once.

     A hovered dot is the exception that proves it: a preview changes only what
     one thumbnail shows, so it calls syncRail() alone rather than redrawing
     every frame's class on every pointer move. */
  let held = false;   // the pointer is someone else's for now: see vit.hold

  const render = (scroll = false) => {
    root.dataset.mode = mode;
    slides.forEach((s, k) => {
      s.classList.toggle("is-active", k === cur);
      if (k !== cur) halt(k);
      runAnims(k);
    });
    syncRail(scroll);
    /* and the ground under the deck, which is the same page by another route:
       what it shows is what the deck shows, so a frame in which the deck is
       captured and its snapshot is not up yet is not a hole */
    point(plate, cur);
    /* The zoom's lens is a quarter of the page, and only the browser knows how
       wide the page came out. A transition's own pseudo-elements are its only
       readers, so it is drawn from the state here like everything else rather
       than chased whenever the box changes — a custom property on the root is
       one the whole document is recalculated for, and the desk's boundaries
       are the presenter's to drag. */
    root.style.setProperty("--vit-box", `${deck.clientWidth}px`);
    /* said out for whatever is drawn from the state and is not the deck's:
       the toolbar's counter, the notes beside the page, a speaker view */
    deck.dispatchEvent(new CustomEvent("vit:render", { detail: { index: cur, step: at(cur), mode } }));
  };

  /* Where we are, said out: the address bar, and anything listening. On every
     page change and every step — never on a change of mode, which is a
     transition but not a move. */
  const announce = (scroll = false) => {
    render(scroll);
    /* A followed path is a string of pixels, so it is measured again whenever
       the layout has moved — and only a frame that is on screen has a box to
       measure it against, which is why this comes after render and not before. */
    waapi.refit();
    try { history.replaceState(null, "", `#${label(cur)}`); } catch { }
    deck.dispatchEvent(new CustomEvent("vit:move-ready", { detail: { index: cur, step: at(cur) } }));
  };

  /* One for one with `vit:move-ready`, including moves with nothing to animate
     and moves cut short by the next. Opening the overview announces neither. */
  const moveDone = i =>
    deck.dispatchEvent(new CustomEvent("vit:move-done", { detail: { index: i, step: at(i) } }));

  /* Hover preview: temporarily show frame f at step k in its group's
     thumbnail; null restores. The step is the frame's own state, so it is
     moved for the preview and moved back on leave; syncRail shows it. */
  const unpeek = () => {
    if (peeked) stepTo(peeked.i, peeked.was, true);
    peeked = null;
  };
  const peek = (f, k) => {
    unpeek();
    if (f != null) { peeked = { i: f, was: at(f), at: k }; stepTo(f, k, true); }
    syncRail();
  };

  /* Which frame a thumbnail shows: the one being previewed, else the current
     frame while we are on that page, otherwise the last frame (which rests at
     its last step — see stage). Nothing here moves the deck: it points each
     stand-in at a frame and writes what is on, which is all a rail is.

     `scroll` brings the current thumbnail into view: "center" when the
     overview opens, so you can see where you are, and true — nearest — on a
     move, so the rail does not jump. Hovering a dot passes neither: a preview
     must leave the rail where the reader put it. */
  const syncRail = (scroll = false) => {
    const now = idx(cur);
    groups.forEach((g, k) => {
      if (!g.thumb) return;
      const here = gOf[cur] === k, peekHere = peeked && gOf[peeked.i] === k;
      point(g.stand, peekHere ? peeked.i : here ? cur : g.to - 1);
      g.thumb.classList.toggle("is-here", here);
      if (scroll && here && !presenting()) g.thumb.scrollIntoView({ block: scroll === "center" ? "center" : "nearest" });
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
      const strip = g.thumb?.querySelector(".vit-dots");
      if (!strip) continue;
      g.dots = [...strip.children];
      g.dots.forEach((el, d) => {
        const q = g.pos[d];
        if (!q) return;
        el.vitPos = q;
        /* hovering swaps the thumbnail to that step — no need to open the page to
           see which step is which */
        el.addEventListener("pointerenter", () => peek(q.i, q.at));
      });
      strip.addEventListener("pointerleave", () => peek(null));
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
     before it starts; the sweep below only saves the wait. Lifting takes the
     marks out of the page's own drawing, so a thumbnail standing for this frame
     is aimed again: what it references has moved. */
  const lift = i => {
    const s = slides[i];
    if (!s || !window.vitLift(s)) return;
    name(s);
    runAnims(i);
    const g = groups[gOf[i]];
    if (g?.stand?.dataset.shows?.startsWith(`${i}:`)) point(g.stand, i);
  };

  const unlifted = () => {
    for (let d = 0; d < n; d++) {
      if (slides[cur + d] && !slides[cur + d].dataset.vitLifted) return cur + d;
      if (slides[cur - d] && !slides[cur - d].dataset.vitLifted) return cur - d;
    }
    return -1;
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
      const i = unlifted();
      if (i < 0) return;
      lift(i);
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

  const stepsOf = i => {
    if (plans[i]) return plans[i];
    const s = slides[i];
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
    return (plans[i] = { marks, n: stepCount(s) });
  };

  /* A step's animations are the deck's to cancel when the next one starts; a
     continuous one plays and pauses with the frame. The browser keeps both —
     they are asked for by role — and what it cannot keep stays here: the
     clean-ups a cross-fade owes, and the callbacks that re-measure a track. */
  const STEP = "vit:step";

  /* the engine returns the animations and the undo; the frame keeps the undo,
     so that halt() can put back what a cancelled cross-fade changed */
  const fade = (i, oldG, newG, olds, news, timing) => {
    const r = tween.crossfade(oldG, newG, olds, news, timing);
    for (const a of r.anims) a.id = STEP;
    (owed[i] ??= []).push(r.undo);
    r.anims.at(-1).finished.then(r.undo, r.undo);
    return r.anims;
  };

  const stepTo = (i, k, instant) => {
    const s = slides[i], st = stepsOf(i), from = at(i);
    k = Math.max(0, Math.min(st.n, k));
    if (k === from) return;
    atOf[i] = k;
    halt(i);
    let mine = [];
    const live = !instant && !reduced.matches;
    for (const m of st.marks) {
      if (m.anim) continue;
      const a = Math.min(from, m.states.length - 1), b = Math.min(k, m.states.length - 1);
      m.states.forEach((g, i) => { g.style.display = i === b ? "inline" : "none"; });
      if (a === b || !live) continue;
      const timing = { duration: durMs(defaultMs), delay: 0, iterations: 1, direction: "normal", easing: EASING };
      if (!m.nodes) { mine = mine.concat(fade(i, m.states[a], m.states[b], null, null, timing)); continue; }
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
      if (olds.length) mine = mine.concat(fade(i, m.states[a], m.states[b], olds, news, timing));
    }
    /* instant moves (landing, previews, thumbnails) are not "a step taken", so
       they say nothing; move() announces those */
    if (!instant && i === cur) {
      announce(true);
      const done = mine.map(a => a.finished.catch(() => { }));
      if (done.length) Promise.all(done).then(() => moveDone(cur));
      else moveDone(cur);
    }
  };

  /* Cut a running step short — the new state already rests on its own
     attributes, so cancelling is jumping to the end. */
  const halt = i => {
    for (const a of waapi.of(slides[i], STEP)) a.cancel();
    for (const f of owed[i] ?? []) f();
    owed[i] = [];
  };

  /* ── continuous animation ────────────────────────────────────────────
     None of it is the deck's: what moves says so where it is written, and tween
     and waapi start it. What is left here is when it may run, and that is one
     sentence — a drawing moves only while its frame is the one on stage, the
     deck is showing that frame rather than a grid of thumbnails, and no
     transition is in flight, since a snapshot is still and a playing element
     would jump when the snapshot goes.

     So it is drawn from the state like everything else, by render(), and there
     is one writer of it. A frame that has just been lifted has animations that
     did not exist when the deck last drew itself, so it is told on the spot.
     Step animations are the deck's own; halt() cancels those. */

  const runAnims = k => {
    const live = k === cur && !busy && mode !== "overview" && !reduced.matches;
    for (const a of waapi.of(slides[k])) if (a.id !== STEP) live ? a.play() : a.pause();
  };

  /* ── transition ──────────────────────────────────────────────────────
     `types` are handed to the API and deck.css selects on them; falsy means no
     transition, land at once. `setup` runs before the old snapshot is captured
     and pushes its clean-ups onto `undo`, a stack, so what was changed twice is
     restored to what it was first.

     Starting one while another runs skips that one, and its clean-ups run here
     first, synchronously: read mid-transition, a name temporarily "none" would
     be recorded as the value to restore and stay that way for good.

     `update` is told whether this transition is still the one being captured.
     A skipped transition's update half runs all the same — the browser calls
     it while starting the one that overtook it — and by then its own clean-ups
     have been run, so anything it changed there would never be put back. The
     move itself still has to happen; what must not is the dressing for a
     capture that is no longer taking place. */
  let pendingUndo = null;
  const transition = (types, update, setup, done) => {
    if (pendingUndo) pendingUndo();
    if (!types) { update(false); done?.(); return; }
    const undo = [];
    setup?.(undo);
    const flush = () => {
      if (pendingUndo === flush) pendingUndo = null;
      while (undo.length) undo.pop()();
    };
    pendingUndo = flush;
    busy++;
    const vit = document.startViewTransition({ update: () => update(pendingUndo === flush), types });
    /* Overtaking one is how the player answers a presenter pressing faster than
       the deck moves, so the skip it rejects with is expected, not a fault. */
    vit.ready.catch(() => { });
    const clear = () => {
      flush();
      busy--;
      render();     // the stage is settled again, and what moves by itself may
      sweep();
      done?.();
    };
    vit.finished.then(clear, clear);
  };

  /* The update half of a transition, and the only place the state changes:
     what this leaves behind is what the browser captures. */
  const apply = to => {
    const moved = to !== cur, changing = root.dataset.mode !== mode;
    if (moved) {
      /* A page we are not on shows its work finished, like a handout — so the
         frame being left goes to its last step. Once per move, here, rather
         than by whatever happens to be drawing the rail. */
      if (cur >= 0) settle(cur);
      cur = to;
      lift(to);
    }
    const scroll = mode === "overview" ? "center" : true;
    if (moved) announce(scroll); else render(scroll);
  };

  /* ── the one way the deck changes ─────────────────────────────────────
     `where` says where to go — a frame, a step within it, a mode, any of them
     left out meaning "as we are" — and what the change animates follows from
     what actually changed, from nothing else:

     · a mode is a zoom between the page's two faces, the page itself in the
       deck and the picture of it in the rail. The browser pairs the two images
       by name rather than by node, so the faces need not be one element: the
       name is on the old face before the change and on the new one after;
     · a frame is the pair of effects the Typst side wrote on the later of the
       two (data-transition; none: no transition), replayed in reverse when the
       direction is back;
     · a step on its own is no transition at all — the drawings on the frame
       animate themselves and the layout does not move.

     A preview a hovered dot left behind is put back before anything else: it
     stepped that frame, and only a click says which step was meant. */
  const move = (where, done) => {
    const to = clamp(where.frame ?? want), m = where.mode ?? mode, was = mode;
    const turning = to !== want, changing = m !== was;
    if (!turning && !changing) {
      if (where.step != null) stepTo(to, where.step);
      done?.();
      return;
    }
    unpeek();
    want = to;
    mode = m;
    lift(to);                 // before the transition: its setup reads both sides' marks
    stepTo(to, where.step ?? (turning ? 0 : at(to)), true);

    const own = slides[Math.max(to, cur)].dataset.transition;
    const dir = to >= cur ? "fwd" : "back";
    const faces = changing ? [face(gOf[to], was), face(gOf[to], m)] : null;
    /* A page's own effects are for a page that is on the screen. In the overview
       it is one thumbnail among many, and turning to another only moves the
       highlight — running its entrance there would slide the whole grid.

       At the desk it is a box beside the rail, so it is captured as a group of
       its own and the page changes inside that box: `boxed` holds the furniture
       around it still and cross-fades the page, and the marks morph as ever. An
       entrance is a page arriving on a screen, and there it is not one. */
    const boxed = !changing && m === "desk";
    const types = changing ? ["overview"]
      : m !== "overview" && own && `${own} ${dir}${boxed ? " boxed" : ""}`.split(" ");

    transition(canvit && !reduced.matches && !mirror && types, capturing => {
      if (capturing && faces) {
        faces[0].style.viewTransitionName = "";
        faces[1].style.viewTransitionName = "vit-zoom";
      }
      apply(to);
    }, undo => {
      if (faces) {
        faces[0].style.viewTransitionName = "vit-zoom";
        undo.push(() => { faces[0].style.viewTransitionName = ""; faces[1].style.viewTransitionName = ""; });
      } else {
        if (boxed) {
          deck.style.viewTransitionName = "vit-page";
          undo.push(() => { deck.style.viewTransitionName = ""; });
        }
        balance(slides[cur], slides[to], undo);
        soloize(slides[cur], slides[to], undo);
      }
    }, () => { if (turning) moveDone(to); done?.(); });
  };

  /* a position: within the frame we are on it is a step, otherwise a page turn */
  const goto = q => move({ frame: q.i, step: q.at });
  const go = (i, k) => move({ frame: i, step: k });
  /* one notch forward/back; in the overview walk frames, ignore steps */
  const step = d => {
    const q = !over() && POS[idx(want) + d];
    if (q) goto(q); else move({ frame: want + d });
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

    if (atDesk() && e.key === "Enter") { e.preventDefault(); present(); return; }   // Enter presents; the other "next" keys walk the deck

    if (NEXT.has(e.key)) { e.preventDefault(); next(); }
    else if (PREV.has(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); pick(0); }
    else if (e.key === "End") { e.preventDefault(); pick(groups[gn - 1].from); }
    else if (e.key === "a" || e.key === "o") { e.preventDefault(); toggleOverview(); }
    else if (e.key === "Escape" && !atDesk()) { e.preventDefault(); if (over()) toggleOverview(); else toggleDesk(); }
    else if (e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      pick(groups[Math.min(parseInt(e.key, 10) - 1, gn - 1)].from);
    }
  };

  /* Where in a box a pointer is, as two fractions; outside it, nothing. */
  const frac = (pt, el) => {
    const r = el.getBoundingClientRect();
    const x = (pt.clientX - r.left) / r.width, y = (pt.clientY - r.top) / r.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  };
  const tap = q => { if (q.x < 1 / 3) prev(); else next(); };

  /* Clicking the page: the left third goes back, the rest forward. Anything
     the layout put there that answers a click of its own is left alone. */
  const onDeckClick = e => {
    if (e.target.closest("a, button, input, select, textarea, pre, table")) return;
    if (held && e.pointerType !== "mouse") return;   // pointing by touch is not a page turn
    const q = frac(e, deck);
    if (q) tap(q);
  };

  /* Clicking the rail: a dot is its own position, a thumbnail is its page —
     or, if one of its dots is being previewed, that position. */
  const onRailClick = e => {
    const d = e.target.closest(".vit-dots i");
    if (d) { if (d.vitPos) pick(d.vitPos.i, d.vitPos.at); return; }
    const t = e.target.closest(".vit-thumb");
    const k = groups.findIndex(g => g.thumb === t);
    if (k < 0) return;
    if (peeked && gOf[peeked.i] === k) pick(peeked.i, peeked.at);
    else pick(groups[k].from, 0);
  };


  let tx = 0, ty = 0, swiping = false;
  const onTouchStart = e => {
    const t = e.changedTouches[0];
    swiping = !!frac(t, deck);
    tx = t.clientX;
    ty = t.clientY;
  };
  const onTouchEnd = e => {
    if (!swiping || held) return;            // no swiping while the pointer is someone else's
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
  const onWheel = e => { if (!over() && frac(e, deck)) wheel(e); };

  /* "#3" = page 3, first position; "#3.4" = page 3, fourth position (frames and steps flattened) */
  const fromHash = () => {
    const m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
    if (!m) return POS[0];
    const g = groups[Math.min(Math.max(parseInt(m[1], 10) - 1, 0), gn - 1)];
    return g.pos[Math.min(Math.max(m[2] ? parseInt(m[2], 10) - 1 : 0, 0), g.pos.length - 1)];
  };

  const initInput = () => {
    document.addEventListener("keydown", onKey);
    /* Each root hears only what is its own: the browser routes the event, so a
       dialog's click, a toolbar button and the margin beside the stage never
       arrive here at all, and neither has to ask what mode we are in. */
    deck.addEventListener("click", onDeckClick);
    rail?.addEventListener("click", onRailClick);
    deck.addEventListener("touchstart", onTouchStart, { passive: true });
    deck.addEventListener("touchend", onTouchEnd, { passive: true });
    deck.addEventListener("wheel", onWheel, { passive: true });
    /* follow the address bar (replaceState does not fire this, so our own writes don't loop back) */
    addEventListener("hashchange", () => goto(fromHash()));
  };

  /* ── modes ────────────────────────────────────────────────────────── */

  /* Which face of a page a mode shows: the page itself in the deck, or the
     picture of it in the rail. */
  const face = (k, m) => (m === "overview" ? groups[k].stand : groups[k].el);

  const toggleOverview = () => move({ mode: over() ? "present" : "overview" });
  const toggleDesk = () => move({ mode: atDesk() ? "present" : "desk" });
  /* the selected page, full size */
  const present = () => move({ mode: "present" });

  /* Choosing a position: from the overview it opens the page, from the desk or
     the presentation it is simply where we go. */
  const pick = (i, k) => move({ frame: i, step: k ?? 0, mode: over() ? "present" : mode });

  /* ── the rail ─────────────────────────────────────────────────────────
     Beside the deck, never inside it: a page is one group in the deck and one
     thumbnail in the rail, and neither ever moves. What the thumbnail shows is
     a <use> of the page's own drawing, so the picture in it is the page itself
     rendered once, and pointing it somewhere else is one attribute. */
  let rail = null, plate = null;
  const findRail = () => {
    rail = document.querySelector(".vit-rail");
    plate = document.querySelector(".vit-plate");
  };

  const svgEl = (tag, attrs) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  /* Aim a thumbnail at frame i.

     Two things the reference needs. The width and height have to be given: the
     source carries its size in points, and left to itself it would draw a
     third too large. And a mark that hoisting has lifted out of the page is no
     longer inside it — what is referenced there is the <g> within, which
     carries the matrix that puts it back in the page's own space, and no name
     of its own, so nothing here is ever captured twice.

     `data-shows` is the frame and how many marks were out of it when this was
     built: aiming at what it already shows is nothing, and lifting changes the
     count, which is how a swept frame's thumbnail catches up. */
  const point = (stand, i) => {
    const page = slides[i]?.querySelector(".vit-page");
    const src = page?.querySelector("svg");
    if (!stand || !src) return;
    src.id ||= `vit-src-${i}`;
    const marks = [...page.querySelectorAll("svg.vit-mark > g")];
    marks.forEach((g, k) => (g.id ||= `${src.id}-m${k}`));
    const shows = `${i}:${marks.length}`;
    if (stand.dataset.shows === shows) return;
    stand.dataset.shows = shows;
    const box = src.getAttribute("viewBox");
    const [, , w, h] = box.split(/\s+/).map(Number);
    stand.setAttribute("viewBox", box);
    stand.replaceChildren(
      svgEl("use", { href: `#${src.id}`, width: w, height: h }),
      ...marks.map(g => svgEl("use", { href: `#${g.id}` })),
    );
  };

  /* A frame at rest is at its last step: a page we are not on shows its work
     finished, like a handout. Free for a frame with no steps, which is most. */
  const settle = i => { if (stepCount(slides[i])) stepTo(i, stepCount(slides[i]), true); };

  /* ── init ─────────────────────────────────────────────────────────── */

  /* the frame the address bar names goes on stage; from here on the deck is live */
  const land = () => {
    deck.setAttribute("data-ready", "");
    root.style.setProperty("--vit-speed", speed);
    const h0 = fromHash();
    stepTo(h0.i, h0.at, true);
    for (let i = 0; i < n; i++) if (i !== h0.i) settle(i);
    /* the deck opens on the desk; a preview opens on its page */
    mode = mirror ? "present" : "desk";
    apply(want = h0.i);
    moveDone(h0.i);
    deck.addEventListener("vit:move-ready", sweep);
    sweep();
    /* The deck's box changes without a window resize: desk ⇄ presenting, and
       the presenter moving the desk's boundaries. What follows a path is a
       string of pixels, so it is measured again against the box it is in. */
    new ResizeObserver(() => waapi.refit()).observe(deck);
    /* The deck, for anything that shows it or drives it — the player's own
       chrome included, which is written against this and nothing else. */
    window.vit = {
      go, next, prev,
      get index() { return cur; },
      get total() { return n; },        // frames
      get pages() { return gn; },       // pages; a page may be several frames
      get step() { return at(cur); }, set step(k) { stepTo(cur, k); },
      get steps() { return stepCount(slides[cur]); },
      get speed() { return speed; }, set speed(v) { setSpeed(v); },
      get version() { return deck.dataset.version || null; },
      /* "desk" (where it opens), "present" or "overview" — what the toolbar and Esc / Enter / o switch between */
      get mode() { return mode; },
      set mode(m) { if (["present", "desk", "overview"].includes(m)) move({ mode: m }); },
      /* A position, described: its name, its page's caption and notes, how far
         through the deck it is, and what comes after it. Without an index, the
         position we are on. */
      label: (i, k) => label(i ?? cur, k),
      title: i => groups[gOf[i ?? cur]].title,
      note: i => noteOf(i ?? cur),
      progress: i => progress(i ?? cur),
      after(i, k) {
        const from = i ?? cur, q = POS[idx(from, k) + 1];
        return q && { index: q.i, step: q.at, page: gOf[q.i] !== gOf[from] };
      },
      /* Driving it like a pointer, for a remote with a box of its own: `tap`
         takes where across the page the press was, 0 to 1. */
      tap: x => (x < 1 / 3 ? prev() : next()),
      wheel: dy => wheel({ deltaY: dy }),
      /* Something else is using the pointer — the laser, say — so a press on
         the page is not a page turn. Touch only: a mouse can point and click. */
      hold: on => { held = !!on; },
      /* Whether a transition is in flight. While one is, an element that was
         captured is not hit-tested, so the browser cannot say where the pointer
         is: it reports it leaving whatever it was on although it has not moved.
         Anything that follows the pointer has to know not to believe that. */
      get moving() { return busy > 0; },
      deck,
    };
    document.dispatchEvent(new CustomEvent("vit:ready", { detail: window.vit }));
  };

  const init = () => {
    deck = document.querySelector(".vit-deck");
    slides = deck ? [...deck.querySelectorAll(".vit-slide")] : [];
    n = slides.length;
    if (!n) return;
    settings();
    /* a preview only presents: the rail belongs to the window driving it */
    if (mirror) document.querySelector(".vit-rail")?.remove();
    findRail();
    buildModel();
    readDots();
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
