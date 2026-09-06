/* ── vtslides · runtime ─────────────────────────────────────────────────
   The player. Three jobs:
   · Transitions — a page/frame change starts one View Transition with the
     types the Typst side wrote on the frame plus the direction; everything
     visual lives in deck.css under :active-view-transition-type(). Adding an
     effect is a CSS-only change.
   · Element animation — the states of mark(key, s0, s1, …) are stepped through
     with the keys and interpolated node by node with Web Animations;
     slide(anim:) plays a mark (or its states) continuously.
   · Chrome — overview, toolbar, laser pointer, speaker view.
   No dependencies; opens straight from file://.                            */

(function () {
  "use strict";

  /* The file only defines; init() at the end runs, in one place and in order. */

  var root = document.documentElement;
  var deck, slides, n;

  /* ── group = one page, frame = one layout state of that page ────────
     Navigation walks frames, the overview shows groups. The title is a hidden
     .vt-title inside the group; the browser flattens it to plain text. */
  var groups = [];      // { el, title, from, to, pos }  `to` exclusive
  var gOf    = [];      // frame index → group index
  var gn     = 0;

  /* deck(duration:), deck(easing:) — the Typst side decides every default, this side only reads */
  var defaultMs, EASING;
  function bezier(e) { return "cubic-bezier(" + e.join(", ") + ")"; }

  /* Speed multiplier adjustable while presenting: `-` slower, `=` faster, `0`
     reset. Remembered in localStorage. deck(duration:) and a transition's own
     duration: are the baselines, written into the stylesheet by the Typst side;
     this is the presenter's live knob, and every duration in deck.css is divided
     by it, so one number here scales them all — including the element
     animations, which are timed here. */
  var speed = 1;
  function durMs(ms) { return Math.round(ms / speed); }
  function setSpeed(v) {
    speed = Math.min(4, Math.max(0.25, Math.round(v * 100) / 100));
    try { localStorage.setItem("vt-speed", speed); } catch (e) {}
    root.style.setProperty("--vt-speed", speed);
    flash(speed + "×");
  }

  var cur   = -1;       /* the frame that is painted */
  var want  = -1;       /* the accepted target. paint() runs only after the old
                           snapshot is captured (100ms+ the first time); a next()
                           arriving meanwhile must count from the target, or two
                           clicks both become "go to the same page". Written only
                           where a target is accepted — paint() must not touch it:
                           the update callback of a skipped transition runs late
                           and would set the target back. */

  var reduced, prefersLight, canVT;
  var mirror = window.name === "vt-mirror";   // a preview inside the desk or the speaker view: it presents, and builds no chrome
  var STATE = "[data-vt-state]";   // one state of an element animation, as hoist.js marks it

  function clamp(i) { return i < 0 ? 0 : i > n - 1 ? n - 1 : i; }
  function at(i) { return slides[i].vtAt || 0; }
  function over() { return deck.classList.contains("vt-all"); }
  function atDesk() { return deck.classList.contains("vt-desk"); }

  /* ── positions = frames × steps, flattened into one sequence ───────────
     To the audience a page only has "press once, advance one notch": a frame
     (transition, View Transitions) and a step of an element animation (WAAPI)
     look the same, only the browser API differs. So the dots, the counter, the
     progress bar, the hash and the speaker view's "next" all use this sequence
     and never distinguish frames from steps.
     POS holds every position of the deck as { i, at, n }; g.pos those of one
     page; abs[i] is the index of frame i at step 0, head[i] its index within
     the page. */
  var POS = [], head = [], abs = [];

  /* deck(…) parameters, the presenter's speed, what this browser can do */
  function settings() {
    defaultMs = parseInt(deck.dataset.duration, 10);
    EASING = deck.dataset.easing.split(" ").map(Number);   // the four numbers of a cubic Bézier
    try { speed = parseFloat(localStorage.getItem("vt-speed")) || 1; } catch (e) {}
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersLight = window.matchMedia("(prefers-color-scheme: light)");
    canVT = typeof document.startViewTransition === "function";
  }

  /* pages, frames and steps into the position sequence */
  function buildModel() {
    Array.prototype.forEach.call(deck.querySelectorAll(".vt-group"), function (el) {
      var t = el.querySelector(".vt-title");
      var g = { el: el, title: t ? t.textContent.trim() : "", from: gOf.length, to: gOf.length };
      Array.prototype.forEach.call(el.querySelectorAll(".vt-slide"), function () { gOf.push(groups.length); g.to++; });
      groups.push(g);
    });
    gn = groups.length;
    groups.forEach(function (g) {
      g.pos = [];
      for (var i = g.from; i < g.to; i++) {
        head[i] = g.pos.length;
        abs[i] = POS.length;
        for (var k = 0; k <= stepsOf(slides[i]).n; k++) {
          var q = { i: i, at: k, n: POS.length };
          g.pos.push(q);
          POS.push(q);
        }
      }
    });
  }

  /* index of frame i at step k; without k, at the frame's current step */
  function idx(i, k) { return abs[i] + (k == null ? at(i) : k); }
  function progress(i) { return (POS.length < 2 ? 100 : idx(i) / (POS.length - 1) * 100) + "%"; }

  /* "3" or "3.2" — only a page with more than one position gets the dot */
  function label(i, k) {
    var g = groups[gOf[i]];
    return (gOf[i] + 1) + (g.pos.length > 1 ? "." + (head[i] + (k == null ? at(i) : k) + 1) : "");
  }

  /* the page's speaker notes, as the layout carries them */
  function noteOf(i) {
    var a = groups[gOf[i]].el.querySelector(".vt-note");
    return a ? a.innerHTML : "";
  }

  function paint(i) {
    cur = i;
    slides.forEach(function (s, k) {
      s.classList.toggle("is-active", k === i);
      if (k === i) prepare(s); else { still(s); halt(s); }
    });
    announce();
  }

  /* Thumbnails, counter, address bar and speaker view all learn where we are
     from here — fired on every page change and every step. */
  function announce() {
    syncThumbs();
    try { history.replaceState(null, "", "#" + label(cur)); } catch (e) {}
    deck.dispatchEvent(new CustomEvent("vt:slide", { detail: { index: cur, step: at(cur) } }));
  }

  /* Hover preview: temporarily show frame f at step k in its group's
     thumbnail; null restores. The step is the frame's own state, so it is
     moved for the preview and moved back on leave; syncThumbs shows it. */
  var peeked = null;
  function peek(f, k) {
    unpeek();
    if (f != null) { peeked = { i: f, was: at(f), at: k }; stepTo(slides[f], k, true); }
    syncThumbs();
  }
  function unpeek() {
    if (peeked) stepTo(slides[peeked.i], peeked.was, true);
    peeked = null;
  }

  /* Which frame a thumbnail shows: the one being previewed, else the current
     frame while we are on that page, otherwise the last frame at its last
     step (the finished page, like a handout). The only writer of is-thumb
     and the dots' state. */
  function syncThumbs() {
    var now = idx(cur);
    groups.forEach(function (g, k) {
      var here = gOf[cur] === k, peekHere = peeked && gOf[peeked.i] === k;
      var shown = peekHere ? peeked.i : here ? cur : g.to - 1;
      /* Judge by `want`, not `cur`: the page we are entering (transition not yet
         settled) has already been positioned — don't move it back. The moment
         the overview zoom starts, the browser stops hit-testing the real DOM and
         the dots receive pointerleave first. */
      if (!here && !peekHere && gOf[want] !== k) stepTo(slides[shown], stepsOf(slides[shown]).n, true);
      for (var i = g.from; i < g.to; i++) slides[i].classList.toggle("is-thumb", i === shown);
      g.el.classList.toggle("is-here", here);
      if (here && atDesk()) g.el.scrollIntoView({ block: "nearest" });
      /* Dots show progress, not position: everything passed is solid, the current
         one a notch brighter. Same rule for every page — pages behind us fully
         solid, pages ahead fully hollow. */
      if (g.dots) g.pos.forEach(function (q, d) {
        g.dots[d].classList.toggle("is-on", q.n <= now);
        g.dots[d].classList.toggle("is-now", q.n === now);
        g.dots[d].classList.toggle("is-peek", !!peekHere && q.i === peeked.i && q.at === peeked.at);
      });
    });
  }

  /* Thumbnail caption and position dots. Built by the runtime, like the
     toolbar — the layout must not contain player parts. They are children of
     the group, not of a slide, so the overview zoom (named on the group) does
     not blow the caption up to full screen. */
  function buildCaptions() {
    groups.forEach(function (g, k) {
      var cap = document.createElement("div");
      cap.className = "vt-cap";
      cap.innerHTML = "<b></b><span></span>";
      cap.firstChild.textContent = k + 1;
      cap.lastChild.textContent = g.title;
      cap.lastChild.title = g.title;
      g.el.insertBefore(cap, g.el.firstChild);

      if (g.pos.length < 2) return;
      var dots = document.createElement("div");
      dots.className = "vt-dots";
      g.dots = g.pos.map(function (q, d) {
        var el = document.createElement("i");
        el.dataset.frame = q.i;
        el.dataset.at = q.at;
        el.title = "Step " + (d + 1);
        /* hovering swaps the thumbnail to that step — no need to open the page to
           see which step is which */
        el.addEventListener("pointerenter", function () { peek(+this.dataset.frame, +this.dataset.at); });
        dots.appendChild(el);
        return el;
      });
      dots.addEventListener("pointerleave", function () { peek(null); });
      g.el.appendChild(dots);
    });
  }

  /* ── the same key several times on one page ─────────────────────────
     View Transitions pairs one name with exactly one counterpart, so "one
     becomes three" cannot be expressed directly. The trick is to **clone on
     the smaller side**: copy the single one twice in place, give the three a
     name each, and now three groups each have an old and a new — three copies
     leave the same spot for three destinations, which reads as a split. The
     reverse is a merge. Clones are removed and renamed elements restored once
     the transition ends.

     What is cloned is the hoisted region <svg>, which only contains
     <use xlink:href="#g…">; the glyph <symbol>s stay in the base image's
     <defs> and resolve document-wide, so a clone carries no ids and no glyph
     data. */

  function marksOf(slide) {
    var by = {};
    Array.prototype.forEach.call(slide.querySelectorAll(".vt-mark[data-vt-key]"), function (m) {
      (by[m.dataset.vtKey] = by[m.dataset.vtKey] || []).push(m);
    });
    return by;
  }

  /* ── names ──────────────────────────────────────────────────────────
     m-<key>-<n>, n the occurrence of the key on its frame (hoist.js leaves
     data-vt-key; the key's characters are the Typst side's assertion).
     Given once, at load; spread() renames for one transition and restores. */
  function nameOf(key, i) { return "m-" + key + "-" + (i + 1); }
  function name() {
    slides.forEach(function (s) {
      var by = marksOf(s);
      Object.keys(by).forEach(function (k) { by[k].forEach(function (m, i) { m.style.viewTransitionName = nameOf(k, i); }); });
    });
  }

  /* Spread els over K names: name i takes source floor(i*k/K); a source taken
     a second time is cloned in place. Everything touched is recorded and
     restored after the transition. */
  function spread(els, K, key, undo) {
    var k = els.length, used = {};
    for (var i = 0; i < K; i++) {
      var si = Math.floor((i * k) / K), el;
      if (used[si]) {
        el = els[si].cloneNode(true);
        els[si].parentNode.insertBefore(el, els[si].nextSibling);
        undo.push(function (el) { el.remove(); }.bind(null, el));
      } else {
        el = els[si];
        used[si] = 1;
        undo.push(function (el, was) { el.style.viewTransitionName = was; }.bind(null, el, el.style.viewTransitionName));
      }
      el.style.viewTransitionName = nameOf(key, i);
    }
  }

  function balance(from, to, undo) {
    var A = marksOf(from), B = marksOf(to);
    Object.keys(A).forEach(function (k) {
      if (!B[k] || A[k].length === B[k].length) return;     // one-sided keys enter/leave; equal counts need nothing
      var K = Math.max(A[k].length, B[k].length);
      spread(A[k], K, k, undo);
      spread(B[k], K, k, undo);
    });
  }

  /* One-sided marks (names unmatched in this transition): one whose object
     declared a mark(transition:) — the Typst side wrote the pair into
     vtMarks — gets the pair as its class, behind the side it has
     (vt-only-old enter-wipe-up leave-fade on the frame being left,
     vt-only-new … on the frame being entered), and the CSS enters or leaves
     it that way, by the transition's direction. The side matters: WebKit
     styles both images of every named element whether or not they exist,
     and an animation it gives an image that does not exist is never torn
     down and comes back finished the next time the name is used. One without
     an effect of its own has its name dropped and folds back into root — it
     is then part of the whole-page snapshot and pushes, wipes or fades with
     the page, aligned as one sheet. (Kept as its own group and pushed by
     its own box it only moves its own width: the background moves and it
     seems to stay.) Used to rely on :only-child, which Chrome 152 no longer
     honours on transition pseudo-elements. */
  function soloize(from, to, undo) {
    var names = function (s) {
      var o = {};
      Array.prototype.forEach.call(s.querySelectorAll(".vt-mark"), function (m) { o[m.style.viewTransitionName] = 1; });
      return o;
    };
    var A = names(from), B = names(to);
    var tag = function (s, other, side) {
      Array.prototype.forEach.call(s.querySelectorAll(".vt-mark"), function (m) {
        if (other[m.style.viewTransitionName]) return;
        var name = m.style.viewTransitionName, cls = m.style.viewTransitionClass, own = vtMarks[m.dataset.vtKey];
        if (own) m.style.viewTransitionClass = side + " " + own.transition;
        else m.style.viewTransitionName = "none";
        undo.push(function () { m.style.viewTransitionName = name; m.style.viewTransitionClass = cls; });
      });
    };
    tag(from, B, "vt-only-old");
    tag(to, A, "vt-only-new");
  }

  /* ── element animation (mark(key, s0, s1, …)) ────────────────────────
     The N states of a mark are N sibling <g data-vt-state="key" data-vt-at="i"> in the
     SVG: the same drawing under different parameters, identical structure, only
     the numbers differ. Exactly one is shown at any time. One step = show a
     different one, and animate every node of the new state from the value of
     the corresponding node in the old state to its own — transform, the path's
     d, colours, stroke width, opacity are all CSS properties, so Web Animations
     interpolates the geometry itself. Stepping back plays the same segment in
     reverse. What has no in-between — a glyph that changes, a path that cannot
     be aligned, states of a different structure — cross-fades. Several such
     marks on one frame step together; the step count is the largest one,
     shorter marks stop at their end. */

  function stepsOf(s) {
    if (s.vtSteps) return s.vtSteps;
    var marks = [], m = null, spec = animSpec(s);
    /* Scan in document order and start a new mark at every state 0, so the same
       key twice on one frame stays two marks. States nested inside states are
       not supported — inner ones count as ordinary nodes (hoist leaves them too). */
    Array.prototype.forEach.call(s.querySelectorAll(STATE), function (g) {
      if (g.parentNode.closest(STATE)) return;
      var i = +g.dataset.vtAt;
      if (i === 0 || !m) marks.push(m = { key: g.dataset.vtState, states: [] });
      m.states[i] = g;
    });
    var all = function (g) { return Array.prototype.slice.call(g.querySelectorAll("*")); };
    var steps = 0;
    marks.forEach(function (m) {
      m.states = m.states.filter(Boolean);
      m.nodes = m.states.map(all);
      var ok = m.nodes.every(function (list) {
        return list.length === m.nodes[0].length &&
          list.every(function (el, q) { return el.tagName === m.nodes[0][q].tagName; });
      });
      if (!ok) {
        console.info("[vtslides] the states of " + m.key + " differ in structure (node count or types); they cross-fade instead of morphing");
        m.nodes = null;
      }
      /* a mark named in slide(anim:) lends its states to the continuous animation and is not stepped */
      m.anim = m.key in spec && fromStates(spec[m.key]);
      if (!m.anim) steps = Math.max(steps, m.states.length - 1);
    });
    return (s.vtSteps = { marks: marks, n: steps });
  }

  /* The attributes compared node by node. Whether one changed is decided on the
     attribute string — the states come from the same code, equal string means
     unchanged. The table maps SVG attribute name → the same property's name in
     the CSSOM / in keyframes (keyframes only accept the IDL name;
     "stroke-width" is silently dropped). */
  var PROPS = { d: "d", transform: "transform", fill: "fill", stroke: "stroke", "stroke-width": "strokeWidth",
                opacity: "opacity", "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity",
                x: "x", y: "y", width: "width", height: "height", r: "r", cx: "cx", cy: "cy", rx: "rx", ry: "ry" };

  /* What differs across the nodes in list (same position in each state):
     `props`, the attributes in PROPS that are not all equal, and `other`, true
     if anything else differs (a glyph's href, say) — something that cannot be
     interpolated and is cross-faded instead. */
  function changed(list) {
    var first = list[0], props = [], other = false, a, k, attr;
    for (a in PROPS) {
      var v = first.getAttribute(a);
      for (k = 1; k < list.length; k++) if (list[k].getAttribute(a) !== v) { props.push(a); break; }
    }
    for (k = 1; k < list.length && !other; k++) {
      var el = list[k];
      if (el.attributes.length !== first.attributes.length) { other = true; break; }
      for (var q = 0; q < el.attributes.length; q++) {
        attr = el.attributes[q];
        if (PROPS[attr.name] || attr.name === "style") continue;
        if (first.getAttribute(attr.name) !== attr.value) { other = true; break; }
      }
    }
    return { props: props, other: other };
  }
  /* Current values of these attributes on node el, in keyframe form. Values
     are never parsed by hand: the browser has already turned the presentation
     attributes into CSS properties, and getComputedStyle gives CSS syntax — d
     as path(), x with px, defaults filled in, fill inherited. transform is the
     exception: the computed value is not the attribute (Blink resolves it to
     none for an element without a box, WebKit does not map the attribute into
     it at all), so it is read from the SVG DOM, see transformOf. Read fresh
     every time — a computed value is what the node shows now, so every
     caller reads at rest: stepTo halts the frame's animations first, and a
     mark played continuously is never stepped. A property the browser does
     not have (d in Safari before 27) is left out; that one then switches
     instead of interpolating. */
  function values(el, attrs, kf) {
    var cs = null;
    attrs.forEach(function (a) {
      var p = PROPS[a], v;
      if (a === "transform") v = transformOf(el);
      else { cs = cs || getComputedStyle(el); v = cs[p]; }
      if (typeof v === "string" && v !== "") kf[p] = v;
    });
    return kf;
  }
  /* The element's own transform — the transform attribute as the SVG DOM
     parsed it, the list multiplied left to right, which is the value a CSS
     transform on the element replaces. tools/ui.mjs checks it against the
     browser's own composition (getCTM). */
  function transformOf(el) {
    var list = el.transform.baseVal, m = new DOMMatrix();
    for (var i = 0; i < list.numberOfItems; i++) m.multiplySelf(list.getItem(i).matrix);
    return m.toString();
  }

  /* Every animation goes through here: Web Animations, with the options as
     the Typst side writes them — duration and delay in ms, iterations (null:
     without end), direction, easing as the four numbers of a cubic Bézier. */
  function animate(el, frames, o) {
    return el.animate(frames, {
      duration: o.duration, delay: o.delay, direction: o.direction,
      iterations: o.iterations == null ? Infinity : o.iterations,
      easing: bezier(o.easing)
    });
  }
  /* ── keyframes that the browser would not interpolate, made interpolable ──
     Every rewrite here keeps the picture of each state and only changes how it
     is written, so that two states become the same kind of value. Returns
     false when a path could not be aligned; that node is cross-faded. */
  function settle(frames) {
    /* fill / stroke: `none` against a colour is a discrete switch. `transparent`
       paints the same nothing, and colours interpolate premultiplied, so the
       paint fades in without passing through black. */
    ["fill", "stroke"].forEach(function (k) {
      if (!(k in frames[0])) return;
      var some = frames.some(function (f) { return f[k] !== "none"; });
      if (some) frames.forEach(function (f) { if (f[k] === "none") f[k] = "transparent"; });
    });
    /* d: two states whose paths are not the same list of commands are reconciled by paths.js */
    if (!("d" in frames[0])) return true;
    var ds = vtPaths.align(frames.map(function (f) { return f.d; }));
    if (!ds) return false;
    frames.forEach(function (f, k) { f.d = ds[k]; });
    return true;
  }

  /* Said once per mark: something in it cross-fades instead of morphing. */
  function note(m, what) {
    if (m.noted) return;
    m.noted = true;
    console.info("[vtslides] " + m.key + ": " + what + " cannot be interpolated and cross-fades instead.");
  }

  /* ── cross-fade: for what has no in-between ───────────────────────────
     A glyph that changes, a path that cannot be aligned, or states of a
     different structure altogether have no interpolable value. The old is kept
     on stage and fades out while the new fades in — the same answer View
     Transitions give at page level, with the same blending: plus-lighter
     inside an isolated group, so a pixel both draw alike stays exactly as it
     is instead of dimming halfway. `olds` are nodes of the old state that stay
     visible while the rest of it is hidden; without them the whole old state
     fades. Everything is undone by `undo`. */
  function crossfade(s, host, oldG, newG, olds, news, timing) {
    var cleanup = [];
    var set = function (el, prop, v) { var was = el.style[prop]; el.style[prop] = v; cleanup.push(function () { el.style[prop] = was; }); };
    set(host, "isolation", "isolate");
    set(oldG, "display", "inline");
    set(oldG, "mixBlendMode", "plus-lighter");
    set(newG, "mixBlendMode", "plus-lighter");
    var out = olds || [oldG], inn = news || [newG];
    if (olds) { set(oldG, "visibility", "hidden"); olds.forEach(function (el) { set(el, "visibility", "visible"); }); }
    out.forEach(function (el) { s.vtRun.push(animate(el, [{ opacity: 1 }, { opacity: 0 }], timing)); });
    inn.forEach(function (el) { s.vtRun.push(animate(el, [{ opacity: 0 }, { opacity: 1 }], timing)); });
    var undo = function () { cleanup.forEach(function (f) { f(); }); cleanup = []; };
    s.vtUndo.push(undo);
    s.vtRun[s.vtRun.length - 1].finished.then(undo, undo);
  }

  function stepTo(s, k, instant) {
    var st = stepsOf(s), from = s.vtAt || 0;
    k = Math.max(0, Math.min(st.n, k));
    if (k === from) return;
    s.vtAt = k;
    halt(s);
    var live = !instant && !reduced.matches;
    st.marks.forEach(function (m) {
      if (m.anim) return;
      var a = Math.min(from, m.states.length - 1), b = Math.min(k, m.states.length - 1);
      m.states.forEach(function (g, i) { g.style.display = i === b ? "inline" : "none"; });
      if (a === b || !live) return;
      var timing = { duration: durMs(defaultMs), delay: 0, iterations: 1, direction: "normal", easing: EASING }, host = m.states[b].closest(".vt-mark") || s;
      if (!m.nodes) { crossfade(s, host, m.states[a], m.states[b], null, null, timing); return; }
      /* Each node of the new state animates from the value of its counterpart in
         the old state to its own; the end is the node's own attribute, so it
         lands there by itself and nothing has to be committed. What has no
         in-between is collected and cross-faded. */
      var olds = [], news = [];
      m.nodes[b].forEach(function (el, j) {
        var old = m.nodes[a][j], diff = changed([old, el]), fade = diff.other;
        if (diff.props.length) {
          var frames = [values(old, diff.props, {}), values(el, diff.props, {})];
          if (!settle(frames)) { fade = true; delete frames[0].d; delete frames[1].d; note(m, "a path"); }
          if (Object.keys(frames[0]).length) s.vtRun.push(animate(el, frames, timing));
        }
        if (fade) { olds.push(old); news.push(el); }
      });
      if (olds.length) crossfade(s, host, m.states[a], m.states[b], olds, news, timing);
    });
    /* instant moves (landing, previews, thumbnails) are not "a step taken", so
       they don't announce; the caller's paint() does */
    if (!instant && s === slides[cur]) announce();
  }

  /* Cut a running step short — the new state already rests on its own
     attributes, so cancelling is jumping to the end. */
  function halt(s) {
    (s.vtRun || []).forEach(function (a) { a.cancel(); });
    (s.vtUndo || []).forEach(function (f) { f(); });
    s.vtRun = [];
    s.vtUndo = [];
  }

  /* ── continuous animation (slide(anim:)) ─────────────────────────────
     <section data-anim='{"dot":{"follow":"track","duration":3000,…}}'>, every
     option filled in on the Typst side (anim-defaults). Three sources of
     keyframes: `keyframes` animates the mark itself (Web Animations keyframes
     as written); `follow` runs it along the first <path> of another mark on
     the same frame (CSS offset-path, on the compositor, only offset-distance moves);
     neither given while the mark carries several states — those states are the
     keyframes, one animation per node, each keyframe the corresponding node's
     values in that state.
     The path has to be converted to deck px, so it is built only once the frame
     is shown, and rebuilt on resize; playback starts after the page transition
     (snapshots are still, a playing element would jump at the end) and every
     frame not on stage is paused. */

  function animSpec(s) {
    if (!s.vtSpec) { s.vtSpec = {}; try { s.vtSpec = JSON.parse(s.dataset.anim || "{}"); } catch (e) {} }
    return s.vtSpec;
  }
  function fromStates(o) { return !o.keyframes && !o.follow; }

  function prepare(s) {
    if (!s.vtAnims) {
      s.vtAnims = [];
      var spec = animSpec(s);
      Object.keys(spec).forEach(function (key) {
        var o = spec[key], el = s.querySelector('.vt-mark[data-vt-key="' + key + '"]');
        if (!el) { console.warn("[vtslides] anim: no mark " + key + " on this frame"); return; }
        var keep = function (a, fit) { a.pause(); s.vtAnims.push({ a: a, fit: fit }); };
        if (fromStates(o)) {
          var m = stepsOf(s).marks.filter(function (m) { return m.key === key; })[0];
          if (!m || !m.nodes) { console.warn("[vtslides] anim: " + key + " has no keyframes, no follow and no states to play"); return; }
          m.nodes[0].forEach(function (node, j) {
            var column = m.nodes.map(function (list) { return list[j]; }), diff = changed(column);
            if (!diff.props.length) return;
            var frames = column.map(function (el) { return values(el, diff.props, {}); });
            if (!settle(frames)) console.warn("[vtslides] anim: a path of " + key + " differs in structure between states and cannot be aligned; it will switch between keyframes");
            keep(animate(node, frames, o));
          });
        } else if (o.follow) {
          var track = s.querySelector('.vt-mark[data-vt-key="' + o.follow + '"] path');
          if (!track) { console.warn("[vtslides] anim: " + key + " should follow " + o.follow + ", but this frame has no such mark or it has no path"); return; }
          el.style.offsetRotate = o.orient ? "auto" : "0deg";
          /* Chrome resolves path() coordinates against the element's own box, the
             spec against the containing block, and offset-position cannot fix it.
             Move the element to the containing block's origin and the two
             readings coincide; it starts at 0% anyway, the rest position is moot. */
          el.style.left = el.style.top = "0";
          keep(animate(el, [{ offsetDistance: "0%" }, { offsetDistance: "100%" }], o),
               function () { el.style.offsetPath = pathIn(track); });
        } else keep(animate(el, o.keyframes, o));
      });
    }
    s.vtAnims.forEach(function (x) { if (x.fit) x.fit(); });
  }

  /* Sample a path into a polyline in deck coordinates (px). The containing
     block is .vt-page, which shares the deck's box. */
  function pathIn(path) {
    var m = path.getScreenCTM(), r = deck.getBoundingClientRect();
    if (!m) return "none";
    var L = path.getTotalLength(), N = 240, d = [];
    for (var i = 0; i <= N; i++) {
      /* Typst's d starts with "M 0 0 m …": an empty subpath at the origin, where
         getPointAtLength(0) would land. Start sampling a hair further in. */
      var q = path.getPointAtLength(i ? L * i / N : Math.min(L, 0.01)).matrixTransform(m);
      d.push((i ? "L" : "M") + (q.x - r.left).toFixed(1) + " " + (q.y - r.top).toFixed(1));
    }
    return 'path("' + d.join("") + '")';
  }

  function still(s) { (s.vtAnims || []).forEach(function (x) { x.a.pause(); }); }
  function play() {
    var s = slides[cur];
    if (!s.vtAnims || reduced.matches || over() || atDesk()) return;
    s.vtAnims.forEach(function (x) { x.a.play(); });
  }
  /* ── transition ──────────────────────────────────────────────────────
     types are this transition's types (["enter-slide", "leave-fade", "back"],
     ["overview"]), handed to the API; deck.css selects rules with
     html:active-view-transition-type(enter-slide).
     The browser owns their lifetime, so a skipped transition never takes the
     next one's types with it. A falsy value means no transition: land at once.
     setup runs before the old snapshot is captured (pairing names, effect
     classes, temporary names); the clean-ups it pushes into undo run when the
     transition has finished — a stack, last in first out, so what was
     changed twice is restored to what it was first. */
  /* A transition started while another runs skips that one; its clean-ups are
     run here first, synchronously, so the new setup reads marks at rest —
     read mid-transition, a name temporarily "none" would be recorded as the
     value to restore and stay none for good, and the mark would only ever
     cross-fade from then on. */
  var pendingUndo = null;
  function transition(types, update, setup) {
    if (pendingUndo) pendingUndo();
    if (!types) { update(); play(); return; }
    var undo = [];
    if (setup) setup(undo);
    var vt = document.startViewTransition({ update: update, types: types });
    var flush = pendingUndo = function () {
      if (pendingUndo === flush) pendingUndo = null;
      while (undo.length) undo.pop()();
    };
    var clear = function () { var latest = pendingUndo === flush; flush(); if (latest) play(); };
    vt.finished.then(clear, clear);
  }

  function go(i, k) {
    i = clamp(i);
    if (i === want) return;
    var dir = i > want ? "fwd" : "back", dest = slides[i];
    /* The transition between two frames belongs to the later one: the Typst
       side wrote its types there (data-transition; none: no transition), and
       deck.css replays them in reverse when the direction is back. */
    var types = slides[Math.max(i, want)].dataset.transition;
    want = i;
    stepTo(dest, k || 0, true);
    transition(canVT && !reduced.matches && !over() && !atDesk() && types && (types + " " + dir).split(" "), function () { paint(i); }, function (undo) {
      balance(slides[cur], dest, undo);
      soloize(slides[cur], dest, undo);
    });
  }

  /* go to a position: within the current frame it is a step (animated), otherwise a page change */
  function goto(q) { if (q.i === want) stepTo(slides[q.i], q.at); else go(q.i, q.at); }
  /* one notch forward/back; in the overview walk frames, ignore steps */
  function step(d) {
    var q = !over() && POS[idx(want) + d];
    if (q) goto(q); else go(want + d);
  }
  var next = function () { step(1); };
  var prev = function () { step(-1); };

  /* ── input ────────────────────────────────────────────────────────── */

  var NEXT = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, " ": 1, Enter: 1, n: 1, j: 1 };
  var PREV = { ArrowLeft: 1, ArrowUp: 1, PageUp: 1, Backspace: 1, p: 1, k: 1 };

  /* the keys, as the help overlay lists them; README keeps the same table */
  var KEYS = [
    ["→ ↓ PageDown Space Enter n j", "Next: step, frame or page"],
    ["← ↑ PageUp Backspace p k", "Previous"],
    ["Home / End", "First / last page"],
    ["1 – 9", "Page"],
    ["o / a", "Overview (Esc closes it)"],
    ["Esc / Enter", "Desk \u21c4 presenting"],
    ["f", "Full screen"],
    ["l", "Laser pointer"],
    ["s", "Speaker view"],
    ["b / .", "Black screen"],
    ["- / = / 0", "Slower / faster / normal speed"],
    ["?", "This help"]
  ];

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    /* a black screen and the help are modal: only their own keys act */
    if (black) { if (e.key === "b" || e.key === "." || e.key === "Escape") { e.preventDefault(); toggleBlack(); } return; }
    if (!help.hidden) { if (e.key === "?" || e.key === "Escape") { e.preventDefault(); toggleHelp(); } return; }

    if (atDesk() && e.key === "Enter") { e.preventDefault(); present(); return; }   // Enter presents; the other "next" keys walk the deck

    if (NEXT[e.key])      { e.preventDefault(); next(); }
    else if (PREV[e.key]) { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); pick(0); }
    else if (e.key === "End")  { e.preventDefault(); pick(groups[gn - 1].from); }
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
  }

  /* Click = navigate: left third goes back, the rest forward. The deck in the
     main window and the "current" preview in the speaker view share tap(),
     only the box differs.

     Bound on document and judged by coordinates rather than on the deck by
     bubbling target: during a transition the browser no longer hit-tests the
     real DOM, every event targets <html>, and a listener on the deck hears
     nothing until the animation is over — that is "click only once it has
     settled". pointer-events:none on the pseudo-elements does not help (the
     computed value changes, the target is still html). */
  function frac(pt, el) {
    var r = el.getBoundingClientRect();
    var x = (pt.clientX - r.left) / r.width, y = (pt.clientY - r.top) / r.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x: x, y: y } : null;
  }
  function tap(q) { if (q.x < 1 / 3) prev(); else next(); }

  function onClick(e) {
    if (over() || atDesk()) {
      var d = e.target.closest(".vt-dots i");
      if (d) { pick(+d.dataset.frame, +d.dataset.at); return; }
      var g = e.target.closest(".vt-group");
      if (g) { pick(slides.indexOf(g.querySelector(".vt-slide.is-thumb"))); return; }   // what you see is what opens
      if (atDesk() && frac(e, view)) present();   // the preview is the page: clicking it starts the presentation
      return;
    }
    if (e.target.closest("a, button, input, select, textarea, pre, table")) return;
    if (bar && frac(e, bar)) return;         // a click on the toolbar during a transition is not a page turn
    if (lasing && touching) return;          // pointing by touch is not a page turn
    var q = frac(e, deck);
    if (q) tap(q);
  }

  var tx = 0, ty = 0, swiping = false;
  function onTouchStart(e) {
    var t = e.changedTouches[0];
    swiping = !!frac(t, atDesk() ? view : deck);
    tx = t.clientX;
    ty = t.clientY;
  }
  function onTouchEnd(e) {
    if (!swiping || lasing) return;          // no swiping while the laser is on
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); }
  }

  /* Wheel navigation: down is forward, up is back. A mouse wheel notch is
     deltaY≈100, one notch one position; a trackpad gesture is a burst of small
     deltas, accumulated until a threshold, then reset and cooled down for
     300ms so the gesture's inertia mostly lands in the cool-down. In the
     overview the wheel scrolls the grid. The main deck and the speaker
     preview share wheel(). */
  var wheelAcc = 0, wheelAt = 0;
  function wheel(e) {
    var now = Date.now();
    if (now - wheelAt < 300) { wheelAcc = 0; return; }
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    wheelAt = now;
    if (wheelAcc > 0) next(); else prev();
    wheelAcc = 0;
  }
  function onWheel(e) { if (!over() && frac(e, atDesk() ? view : deck)) wheel(e); }

  /* "#3" = page 3, first position; "#3.4" = page 3, fourth position (frames and steps flattened) */
  function fromHash() {
    var m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
    if (!m) return POS[0];
    var g = groups[Math.min(Math.max(parseInt(m[1], 10) - 1, 0), gn - 1)];
    return g.pos[Math.min(Math.max(m[2] ? parseInt(m[2], 10) - 1 : 0, 0), g.pos.length - 1)];
  }

  function initInput() {
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("pointermove", function (e) { showBar(); route(e); });
    document.addEventListener("pointerdown", route);
    document.addEventListener("pointerup", function () { if (touching) laser.classList.remove("is-on"); });
    document.addEventListener("pointercancel", function () { laser.classList.remove("is-on"); });
    /* follow the address bar (replaceState does not fire this, so our own writes don't loop back) */
    window.addEventListener("hashchange", function () { goto(fromHash()); });
  }

  /* ── modes ────────────────────────────────────────────────────────── */

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen().catch(function () {});
  }

  /* Overview ⇄ presenting: a whole-page zoom, no element-level morph.
     The thumbnail and the shown page are the same .vt-slide; give it a
     temporary view-transition-name and the browser interpolates its box between
     the two states — the page zooms into place. The CSS meanwhile overrides
     every .vt-mark name with !important so the marks fold back into root:
     otherwise leftovers from the previous page would pair up and fly, which is
     the "page turn" animation, not "open". */
  function zoomTo(i, update) {
    var dest = groups[gOf[i]].el;
    transition(canVT && !reduced.matches && ["overview"], update, function (undo) {
      dest.style.viewTransitionName = "vt-overview";
      undo.push(function () { dest.style.viewTransitionName = ""; });
    });
  }

  function toggleOverview() {
    if (over()) openSlide(cur);
    else zoomTo(cur, function () { deck.classList.remove("vt-desk"); deck.classList.add("vt-all"); still(slides[cur]); syncTools(); });
  }

  /* Open a page from the overview; without a step, at whatever step the
     thumbnail shows. Clicking the previewed dot means that step — the dots'
     pointerleave on leaving the overview must not move it back. */
  function openSlide(i, k) {
    want = i;
    if (peeked && peeked.i !== i) unpeek();   // a preview of another page is put back; this page's is what opens
    peeked = null;
    if (k != null) stepTo(slides[i], k, true);
    zoomTo(i, function () { deck.classList.remove("vt-all"); paint(i); });
  }

  /* choosing a page: from the overview it opens, from the desk or the presentation it is where we go */
  function pick(i, k) { if (over()) openSlide(i, k); else goto({ i: i, at: k || 0 }); }

  /* ── the desk ─────────────────────────────────────────────────────────
     Where the deck opens, and what Esc comes back to: the deck itself in
     thumbnails down one side (the overview's thumbnails, in a column), the
     page they point at beside them, its notes under it. The preview is a copy
     of this document positioned by #hash — the same mirror the speaker view
     uses, so there is one renderer and the preview plays the real
     transitions. Going either way is instant: the layout changes wholesale,
     and while the desk is up the page is on the screen twice, in the rail and
     in the preview, which no zoom can be drawn between. */
  var pane = null, view = null, notes = null;
  function buildPane() {
    if (mirror) return;
    pane = document.createElement("div");
    pane.className = "vt-pane";
    pane.innerHTML = "<div class='vt-view'><iframe class='vt-mirror' name='vt-mirror' title='Preview'></iframe></div><div class='vt-notes'></div>";
    view = pane.querySelector("iframe");
    notes = pane.querySelector(".vt-notes");
    document.body.appendChild(pane);
    deck.addEventListener("vt:slide", syncPane);
  }

  function syncPane() {
    if (!atDesk()) return;
    show(view, label(cur));
    notes.innerHTML = noteOf(cur);
  }

  function toggleDesk() {
    if (atDesk()) { present(); return; }
    deck.classList.remove("vt-all");
    deck.classList.add("vt-desk");
    still(slides[cur]);
    syncThumbs();
    syncPane();
    syncTools();
    showBar();
  }

  /* the selected page, full size: from the overview with its zoom, from the desk at once */
  function present() {
    if (over()) { openSlide(cur); return; }
    deck.classList.remove("vt-desk");
    play();
    syncTools();
    showBar();
  }

  /* black screen (b / .): "look at me, not at the screen" — everything in the body is hidden, the keys still work */
  var black = false;
  function toggleBlack() {
    black = !black;
    document.body.classList.toggle("vt-black", black);
  }

  /* the key table, on ? */
  var help = null;
  function buildHelp() {
    help = document.createElement("div");
    help.className = "vt-help";
    help.hidden = true;
    var table = document.createElement("table");
    KEYS.forEach(function (row) {
      var tr = table.insertRow();
      row.forEach(function (cell, k) {
        var td = tr.insertCell();
        td.appendChild(k ? document.createTextNode(cell) : Object.assign(document.createElement("kbd"), { textContent: cell }));
      });
    });
    help.appendChild(table);
    help.addEventListener("click", toggleHelp);
    document.body.appendChild(help);
  }
  function toggleHelp() { help.hidden = !help.hidden; }

  /* ── toolbar ─────────────────────────────────────────────────────────
     Built by the runtime, so every deck has one. Lives outside .vt-deck with
     its own view-transition-name, so a page transition never drags it along.
     A toolbar can be built in any document: one in the main window
     (auto-hiding), one in the speaker view (always shown, bottom right).
     Buttons call the same functions; syncTools() refreshes them together. */

  var ICON = {
    desk: "M4 5h16v14H4zM10 5v14",
    play: "M8 5l11 7-11 7z",
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    laser: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1",
    down: "M12 4v10M8 12l4 4 4-4M5 20h14",
    notes: "M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4",
    full: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
    unfull: "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"
  };

  function svg(d, extra) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/>' + (extra || "") + "</svg>";
  }

  /* PDF download. The PDF from the same .typ sits next to the HTML, so
     "is there a handout?" needs no digging. data-pdf="auto" (default) = the
     .pdf with this page's name; "none" = no button. download + target=_blank
     work together: where downloading works the page stays; where the download
     attribute is ignored (cross-origin, some file:// cases) it merely opens a
     new tab. */
  var pdfHref = "";
  function pdfLink() {
    var v = deck.dataset.pdf, m;
    if (v === "none") return "";
    if (v !== "auto") return v;
    m = /^([^?#]*)\.x?html?$/i.exec(location.href);
    return m ? m[1] + ".pdf" : "";
  }

  function buildBar(doc) {
    function button(title, markup, action) {
      var el = doc.createElement("button");
      el.type = "button";
      el.title = title;
      el.setAttribute("aria-label", title);
      el.innerHTML = markup;
      el.addEventListener("click", function (e) { e.stopPropagation(); action(); });
      return el;
    }
    var b = { el: doc.createElement("div"), count: doc.createElement("div") };
    b.el.className = "vt-bar";
    b.count.className = "vt-count";
    b.el.appendChild(b.count);

    b.desk = button("Desk (Esc)", svg(ICON.desk), toggleDesk);
    b.el.appendChild(b.desk);
    b.overview = button("Overview (o)", svg(ICON.grid), toggleOverview);
    b.el.appendChild(b.overview);
    b.laser = button("Laser pointer (l)", svg(ICON.laser, '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>'), toggleLaser);
    b.el.appendChild(b.laser);
    b.el.appendChild(button("Speaker view (s)", svg(ICON.notes), openSpeaker));

    if (pdfHref) {
      var a = doc.createElement("a");
      a.className = "vt-dl";
      a.href = pdfHref;
      a.download = "";
      a.target = "_blank";
      a.rel = "noopener";
      a.title = "Download PDF";
      a.setAttribute("aria-label", "Download PDF");
      a.innerHTML = svg(ICON.down);
      a.addEventListener("click", function (e) { e.stopPropagation(); });
      b.el.appendChild(a);
    }

    b.full = button("Full screen (f)", svg(ICON.full), toggleFullscreen);
    b.el.appendChild(b.full);
    return b;
  }

  /* The two previews in the speaker view are copies of this very HTML
     (iframe name="vt-mirror"): they only display, no toolbar. */
  var bars = [];
  var bar = null;
  function buildToolbar() {
    pdfHref = pdfLink();
    document.addEventListener("fullscreenchange", syncTools);
    deck.addEventListener("vt:slide", syncTools);
    if (mirror) return;
    var mainBar = buildBar(document);
    bars.push(mainBar);
    bar = mainBar.el;
    document.body.appendChild(bar);
    bar.addEventListener("pointerenter", showBar);
    bar.addEventListener("pointerleave", showBar);
  }

  /* auto-hide: the bar is chrome, not content. Shown on every activity and
     hidden 2.4 s after the last, unless the pointer or the focus is on it. */
  var barTimer = null;
  function showBar() {
    if (!bar) return;
    bar.classList.add("is-shown");
    clearTimeout(barTimer);
    if (!atDesk()) barTimer = setTimeout(hideBar, 2400);   // at the desk the toolbar is part of the furniture
  }
  function hideBar() {
    if (bar.matches(":hover") || bar.contains(document.activeElement)) { barTimer = setTimeout(hideBar, 2400); return; }
    bar.classList.remove("is-shown");
  }

  /* ── laser pointer ───────────────────────────────────────────────────
     The mouse gets a CSS cursor image (zero latency, in deck.css); touch and
     pen have no cursor to restyle and get a DOM dot instead. Routed by each
     event's own pointerType, so a machine with both gets the right one per
     input. Pointing from the speaker view's preview also uses the DOM dot (the
     main window has no mouse there).

     `lasing` is presentation state and untouched by the overview — there the
     cursor/dot is merely tucked away (the cursor by CSS, the dot by route()),
     and comes back on leaving the overview. */

  var lasing = false;
  var touching = false;   // whether the latest input was non-mouse
  var laser = null;
  function buildLaser() {
    laser = document.createElement("div");
    laser.className = "vt-laser";
    document.body.appendChild(laser);
  }

  function route(e) {
    var mouse = e.pointerType === "mouse" || e.pointerType === "";
    touching = !mouse;
    document.body.classList.toggle("vt-nomouse", touching);
    if (!lasing || mouse || over() || atDesk()) { laser.classList.remove("is-on"); return; }
    dot(e.clientX, e.clientY);
  }

  function dot(x, y) {
    laser.style.transform = "translate(" + x + "px," + y + "px)";
    laser.classList.add("is-on");
  }

  function toggleLaser() {
    lasing = !lasing;
    document.body.classList.toggle("vt-lasing", lasing);
    if (!lasing) laser.classList.remove("is-on");
    syncTools();
    showBar();
  }

  function syncTools() {
    var text = label(cur) + " / " + gn + (speed === 1 ? "" : " · " + speed + "×");   // a multiplier survives reloads: keep it in sight
    var fs = !!document.fullscreenElement;
    bars.forEach(function (b) {
      b.el.ownerDocument.body.classList.toggle("vt-lasing", lasing);   // the speaker window's cursor follows too
      b.count.textContent = text;
      b.desk.innerHTML = svg(atDesk() ? ICON.play : ICON.desk);
      b.desk.title = atDesk() ? "Present (Enter)" : "Desk (Esc)";
      b.desk.setAttribute("aria-label", b.desk.title);
      b.overview.setAttribute("aria-pressed", String(over()));
      b.laser.setAttribute("aria-pressed", String(lasing));
      b.full.innerHTML = svg(fs ? ICON.unfull : ICON.full);
      b.full.title = fs ? "Exit full screen (f)" : "Full screen (f)";
      b.full.setAttribute("aria-label", b.full.title);
    });
  }

  /* flash something (the speed multiplier, say) where the counter is; syncTools writes the page number back after 900ms */
  var flashTimer = null;
  function flash(text) {
    bars.forEach(function (b) { b.count.textContent = text; });
    clearTimeout(flashTimer);
    flashTimer = setTimeout(syncTools, 900);
    showBar();
  }

  /* Chrome theme: deck(theme:) fixes it, auto follows the system. Only the
     verdict lands on <html data-theme>; every colour is a token in deck.css,
     and the speaker window copies the same tokens. */
  var speaker = null, spk = null, spkFrom = 0;
  function applyTheme() {
    var t = deck.dataset.theme;
    root.dataset.theme = t === "auto" ? (prefersLight.matches ? "light" : "dark") : t;
    if (speaker && !speaker.closed) speaker.document.documentElement.dataset.theme = root.dataset.theme;
  }
  function initTheme() {
    prefersLight.addEventListener("change", applyTheme);
    applyTheme();
  }

  /* ── speaker view ────────────────────────────────────────────────────
     A separate window that can be dragged to another screen. "Current" and
     "next" are two iframes loading this very HTML, positioned by #hash — the
     deck already navigates by hash, so no second renderer, and transitions and
     element animations play there as well. The window is about:blank and
     same-origin with the main window, so its DOM is built directly; the copies
     inside the iframes are never touched (under file:// every file is its own
     origin), only their src changes. Sync comes from the vt:slide events that
     announce() fires, no polling. The notes are the page's
     <aside class="vt-note"> inside .vt-group, moved over as is. */

  function openSpeaker() {
    if (speaker && !speaker.closed) { speaker.focus(); return; }
    speaker = window.open("", "vt-speaker", "popup,width=1040,height=640");
    if (!speaker) { console.warn("[vtslides] the speaker view was blocked by the browser; allow pop-ups for this page."); return; }

    /* the same stylesheet as this document's, as it is (its speaker rules are under .vt-speaker, the layout's size, background and easing open it), the same theme */
    var d = speaker.document;
    d.head.innerHTML = "<style>" + document.getElementById("vt-style").textContent + "</style>";
    d.documentElement.className = "vt-speaker";
    d.documentElement.dataset.theme = root.dataset.theme;
    d.title = "Speaker view · " + document.title;
    d.body.innerHTML =
      "<div class='prog'><i></i></div>" +
      "<header><b></b><span></span><time title='Click to reset'>00:00</time></header>" +
      "<main><iframe class='vt-mirror' name='vt-mirror'></iframe><div class='vt-notes'></div></main>" +
      "<aside><small>Next</small><iframe class='vt-mirror' name='vt-mirror'></iframe></aside>";
    spk = {
      page: d.querySelector("header b"), title: d.querySelector("header span"),
      clock: d.querySelector("time"), note: d.querySelector(".vt-notes"),
      now: d.querySelector("main iframe"), next: d.querySelector("aside iframe"),
      nextCap: d.querySelector("aside small"), prog: d.querySelector(".prog i")
    };
    /* timer: counts from opening, click to reset */
    spkFrom = Date.now();
    spk.clock.addEventListener("click", function () { spkFrom = Date.now(); tick(); });
    var timer = setInterval(function () {
      if (speaker.closed) { clearInterval(timer); return; }
      tick();
    }, 1000);

    /* its own toolbar, always shown bottom right; buttons and state are the main window's */
    var b = buildBar(d);
    b.el.classList.add("is-shown");
    d.body.appendChild(b.el);
    bars.push(b);
    speaker.addEventListener("pagehide", function () { bars.splice(bars.indexOf(b), 1); });

    /* a key pressed in this window is a key pressed in the main window, so it doubles as a remote */
    d.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, cancelable: true }));
    });

    /* The "current" preview stands in for the main deck: clicking it is
       clicking the deck (same frac/tap), and moving over it with the laser on
       points on the main window. That window has no mouse whose cursor could
       change, so it gets the DOM dot; coordinates map preview box → main deck
       box proportionally. */
    d.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return;
      var q = frac(e, spk.now);
      if (q) tap(q);
    });
    d.addEventListener("wheel", function (e) { if (frac(e, spk.now)) wheel(e); }, { passive: true });
    d.addEventListener("pointermove", function (e) {
      if (!lasing || over()) return;
      var q = frac(e, spk.now);
      if (!q) { laser.classList.remove("is-on"); return; }
      var m = deck.getBoundingClientRect();
      dot(m.left + q.x * m.width, m.top + q.y * m.height);
    });
    d.documentElement.addEventListener("pointerleave", function () { laser.classList.remove("is-on"); });

    syncSpeaker();
    syncTools();
  }

  function tick() {
    var s = Math.round((Date.now() - spkFrom) / 1000);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    spk.clock.textContent = (h ? h + ":" : "") + (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
  }

  /* Only the src changes: a navigation that differs from the current URL by
     the fragment alone does not reload, the deck inside gets hashchange and
     follows. */
  function show(frame, hash) {
    var u = new URL(location.href);
    u.hash = hash;
    if (frame.getAttribute("src") !== u.href) frame.src = u.href;
  }

  /* The "next" preview shows what the audience will see next: still within
     this page (next frame, or next step of an element animation) it is the
     next step; only past the page is it the next page. */
  function syncSpeaker() {
    if (!spk || speaker.closed) return;
    var g = groups[gOf[cur]], nx = POS[idx(cur) + 1];
    spk.page.textContent = label(cur) + " / " + gn;
    spk.prog.style.width = progress(cur);
    spk.title.textContent = g.title;
    show(spk.now, label(cur));
    spk.next.hidden = !nx;
    spk.nextCap.textContent = !nx ? "Last page" : gOf[nx.i] === gOf[cur] ? "Next step" : "Next page";
    if (nx) show(spk.next, label(nx.i, nx.at));
    spk.note.innerHTML = noteOf(cur);
  }

  function initSpeaker() {
    deck.addEventListener("vt:slide", syncSpeaker);
    /* close it when the main window goes, so no window is left out of sync */
    window.addEventListener("pagehide", function () { if (speaker && !speaker.closed) speaker.close(); });
  }

  /* ── init ─────────────────────────────────────────────────────────── */

  function init() {
    deck = document.querySelector(".vt-deck");
    slides = deck ? Array.prototype.slice.call(deck.querySelectorAll(".vt-slide")) : [];
    n = slides.length;
    if (!n) return;
    settings();
    buildModel();
    name();
    buildCaptions();
    buildToolbar();
    buildPane();
    buildLaser();
    buildHelp();
    initTheme();
    initSpeaker();
    initInput();
    land();
  }

  /* the frame the address bar names goes on stage; from here on the deck is live */
  function land() {
    deck.setAttribute("data-ready", "");
    root.style.setProperty("--vt-speed", speed);
    var h0 = fromHash();
    stepTo(slides[h0.i], h0.at, true);
    if (!mirror) deck.classList.add("vt-desk");   // the deck opens on the desk; a preview opens on its page
    paint(want = h0.i);
    play();
    showBar();
    /* a follow track is in deck px: refit it when the deck's box changes (observing reports the current box at once, hence after paint) */
    new ResizeObserver(function () {
      (slides[cur].vtAnims || []).forEach(function (x) { if (x.fit) x.fit(); });
    }).observe(deck);
    window.vtslides = {
      go: go, next: next, prev: prev,
      get index() { return cur; },
      get total() { return n; },
      get step() { return at(cur); }, set step(k) { stepTo(slides[cur], k); },
      get steps() { return stepsOf(slides[cur]).n; },
      get speed() { return speed; }, set speed(v) { setSpeed(v); },
      /* "desk" (where it opens), "present" or "overview" — what the toolbar and Esc / Enter / o switch between */
      get mode() { return over() ? "overview" : atDesk() ? "desk" : "present"; },
      set mode(m) {
        if (m === "overview") { if (!over()) toggleOverview(); }
        else if (m === "desk") { if (!atDesk()) toggleDesk(); }
        else present();
      },
      deck: deck
    };
  }

  init();
})();
