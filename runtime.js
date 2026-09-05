/* ── vtslides · runtime ─────────────────────────────────────────────────
   The player. Three jobs:
   · Transitions — a page/frame change starts one View Transition and reports
     two type tokens (effect, direction); everything visual lives in deck.css
     under :active-view-transition-type(). Adding an effect is a CSS-only change.
   · Element animation — the states of mark(key, s0, s1, …) are stepped through
     with the keys and interpolated node by node with Web Animations;
     slide(anim:) plays a mark (or its states) continuously.
   · Chrome — overview, toolbar, laser pointer, speaker view.
   No dependencies; opens straight from file://.                            */

(function () {
  "use strict";

  var root  = document.documentElement;
  var deck  = document.querySelector(".vt-deck");
  if (!deck) return;

  var slides = Array.prototype.slice.call(deck.querySelectorAll(".vt-slide"));
  var n      = slides.length;
  if (!n) return;

  /* ── group = one page, frame = one layout state of that page ────────
     Navigation walks frames, the overview shows groups. The title is a hidden
     .vt-title inside the group; the browser flattens it to plain text. */
  var groups = [];      // { el, title, from, to, pos }  `to` exclusive
  var gOf    = [];      // frame index → group index
  Array.prototype.forEach.call(deck.querySelectorAll(".vt-group"), function (el) {
    var t = el.querySelector(".vt-title");
    var g = { el: el, title: t ? t.textContent.trim() : "", from: gOf.length, to: gOf.length };
    Array.prototype.forEach.call(el.querySelectorAll(".vt-slide"), function () { gOf.push(groups.length); g.to++; });
    groups.push(g);
  });
  var gn = groups.length;

  var defaultFx = deck.dataset.transition || "fade";
  var defaultMs = parseInt(deck.dataset.duration, 10) || 700;

  /* Speed multiplier adjustable while presenting: `-` slower, `=` faster, `0`
     reset. Multiplies every duration, remembered in localStorage.
     deck(duration:) is the baseline; this is the presenter's live knob. */
  var speed = 1;
  try { speed = parseFloat(localStorage.getItem("vt-speed")) || 1; } catch (e) {}
  function durMs(ms) { return Math.round(ms / speed); }
  function dur(ms) { return durMs(ms) + "ms"; }
  function setSpeed(v) {
    speed = Math.min(4, Math.max(0.25, Math.round(v * 100) / 100));
    try { localStorage.setItem("vt-speed", speed); } catch (e) {}
    root.style.setProperty("--vt-dur", dur(defaultMs));
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

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var canVT   = typeof document.startViewTransition === "function";
  var EASE    = getComputedStyle(root).getPropertyValue("--vt-ease").trim() || "ease-in-out";
  var STATE   = '[data-typst-label^="vt-"][data-typst-label*="@"]';   // one state of an element animation

  function clamp(i) { return i < 0 ? 0 : i > n - 1 ? n - 1 : i; }
  function at(i) { return slides[i].vtAt || 0; }
  function over() { return deck.classList.contains("vt-all"); }

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

  /* index of frame i at step k; without k, at the frame's current step */
  function idx(i, k) { return abs[i] + (k == null ? at(i) : k); }
  function progress(i) { return (POS.length < 2 ? 100 : idx(i) / (POS.length - 1) * 100) + "%"; }

  /* "3" or "3.2" — only a page with more than one position gets the dot */
  function label(i, k) {
    var g = groups[gOf[i]];
    return (gOf[i] + 1) + (g.pos.length > 1 ? "." + (head[i] + (k == null ? at(i) : k) + 1) : "");
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
     moved for the preview and moved back on leave. */
  var peeked = null;
  function peek(f, k) {
    if (peeked) { stepTo(slides[peeked.i], peeked.at, true); peeked = null; }
    if (f == null) { syncThumbs(); return; }
    var g = groups[gOf[f]];
    peeked = { i: f, at: at(f) };
    stepTo(slides[f], k, true);
    for (var i = g.from; i < g.to; i++) slides[i].classList.toggle("is-thumb", i === f);
    if (g.dots) g.pos.forEach(function (q, d) { g.dots[d].classList.toggle("is-peek", q.i === f && q.at === k); });
  }

  /* Which frame a thumbnail shows: the current frame while we are on that
     page, otherwise the last frame at its last step (the finished page, like
     a handout). */
  function syncThumbs() {
    var now = idx(cur);
    groups.forEach(function (g, k) {
      var here = gOf[cur] === k;
      var pick = here ? cur : g.to - 1;
      /* Judge by `want`, not `cur`: the page we are entering (transition not yet
         settled) has already been positioned — don't move it back. The moment
         the overview zoom starts, the browser stops hit-testing the real DOM and
         the dots receive pointerleave first. */
      if (!here && gOf[want] !== k) stepTo(slides[pick], stepsOf(slides[pick]).n, true);
      for (var i = g.from; i < g.to; i++) slides[i].classList.toggle("is-thumb", i === pick);
      g.el.classList.toggle("is-here", here);
      /* Dots show progress, not position: everything passed is solid, the current
         one a notch brighter. Same rule for every page — pages behind us fully
         solid, pages ahead fully hollow. */
      if (g.dots) g.pos.forEach(function (q, d) {
        g.dots[d].classList.toggle("is-on", q.n <= now);
        g.dots[d].classList.toggle("is-now", q.n === now);
        g.dots[d].classList.remove("is-peek");
      });
    });
  }

  /* Thumbnail caption and position dots. Built by the runtime, like the
     toolbar — the layout must not contain player parts. They are children of
     the group, not of a slide, so the overview zoom (named on the group) does
     not blow the caption up to full screen. */
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

  function safe(k) { return k.replace(/[^A-Za-z0-9_-]/g, "-"); }

  function marksOf(slide) {
    var by = {};
    Array.prototype.forEach.call(slide.querySelectorAll(".vt-mark[data-vt-key]"), function (m) {
      (by[m.dataset.vtKey] = by[m.dataset.vtKey] || []).push(m);
    });
    return by;
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
      el.style.viewTransitionName = "m-" + safe(key) + "-" + (i + 1);
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

  /* One-sided marks (names unmatched in this transition): one that declared its
     own mark(transition:) (hoist wrote it to data-vt-fx) gets vt-fx-<effect> and
     the CSS enters/leaves it that way; one that did not has its name dropped and
     folds back into root — it is then part of the whole-page snapshot and pushes,
     wipes or fades with the page, aligned as one sheet. (Kept as its own group
     and pushed by its own box it only moves its own width: the background moves
     and it seems to stay.) Used to rely on :only-child, which Chrome 152 no
     longer honours on transition pseudo-elements. */
  function soloize(from, to, undo) {
    var names = function (s) {
      var o = {};
      Array.prototype.forEach.call(s.querySelectorAll(".vt-mark"), function (m) { o[m.style.viewTransitionName] = 1; });
      return o;
    };
    var A = names(from), B = names(to);
    var tag = function (s, other) {
      Array.prototype.forEach.call(s.querySelectorAll(".vt-mark"), function (m) {
        if (other[m.style.viewTransitionName]) return;
        var name = m.style.viewTransitionName, cls = m.style.viewTransitionClass;
        if (m.dataset.vtFx) m.style.viewTransitionClass = (cls || "vt-mo") + " vt-fx-" + m.dataset.vtFx;
        else m.style.viewTransitionName = "none";
        undo.push(function () { m.style.viewTransitionName = name; m.style.viewTransitionClass = cls; });
      });
    };
    tag(from, B);
    tag(to, A);
  }

  /* ── element animation (mark(key, s0, s1, …)) ────────────────────────
     The N states of a mark are N sibling <g data-typst-label="vt-key@i"> in the
     SVG: the same drawing under different parameters, identical structure, only
     the numbers differ. Exactly one is shown at any time. One step = show a
     different one, and animate every node of the new state from the value of
     the corresponding node in the old state to its own — transform, the path's
     d, colours, stroke width, opacity are all CSS properties, so Web Animations
     interpolates the geometry itself. Stepping back plays the same segment in
     reverse. States whose structure differs (node count or types) only switch,
     with a console warning. Several such marks on one frame step together; the
     step count is the largest one, shorter marks stop at their end. */

  function stepsOf(s) {
    if (s.vtSteps) return s.vtSteps;
    var marks = [], m = null, spec = animSpec(s);
    /* Scan in document order and start a new mark at every @0, so the same key
       twice on one frame stays two marks. States nested inside states are not
       supported — inner ones count as ordinary nodes (hoist leaves them too). */
    Array.prototype.forEach.call(s.querySelectorAll(STATE), function (g) {
      if (g.parentNode.closest(STATE)) return;
      var l = g.getAttribute("data-typst-label"), at = l.lastIndexOf("@"), i = parseInt(l.slice(at + 1), 10);
      if (i === 0 || !m) marks.push(m = { key: l.slice(3, at), states: [] });
      m.states[i] = g;
    });
    var all = function (g) { return Array.prototype.slice.call(g.querySelectorAll("*")); };
    var n = 0;
    marks.forEach(function (m) {
      m.states = m.states.filter(Boolean);
      m.nodes = m.states.map(all);
      var ok = m.nodes.every(function (list) {
        return list.length === m.nodes[0].length &&
          list.every(function (el, q) { return el.tagName === m.nodes[0][q].tagName; });
      });
      if (!ok) {
        console.warn("[vtslides] the states of " + m.key + " differ in structure (node count or types); they will switch instead of interpolate");
        m.nodes = null;
      }
      /* a mark named in slide(anim:) lends its states to the continuous animation and is not stepped */
      m.anim = m.key in spec && fromStates(spec[m.key]);
      if (!m.anim) n = Math.max(n, m.states.length - 1);
    });
    return (s.vtSteps = { marks: marks, n: n });
  }

  /* The attributes compared node by node. Whether one changed is decided on the
     attribute string — the states come from the same code, equal string means
     unchanged. Values are never parsed by hand: the browser has already turned
     the SVG presentation attributes into CSS properties and getComputedStyle
     gives CSS syntax — transform as matrix(), d as path(), x with px, defaults
     filled in (no transform reads "none", fill inherits) — readable inside a
     display:none subtree as well. The table maps SVG attribute name → the same
     property's name in the CSSOM / in keyframes (keyframes only accept the IDL
     name; "stroke-width" is silently dropped). */
  var PROPS = { d: "d", transform: "transform", fill: "fill", stroke: "stroke", "stroke-width": "strokeWidth",
                opacity: "opacity", "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity",
                x: "x", y: "y", width: "width", height: "height", r: "r", cx: "cx", cy: "cy", rx: "rx", ry: "ry" };

  /* which attributes are not all equal across the nodes in list (same position in each state) */
  function changed(list) {
    return Object.keys(PROPS).filter(function (a) {
      var v = list[0].getAttribute(a);
      return list.some(function (el) { return el.getAttribute(a) !== v; });
    });
  }
  /* Current values of these attributes on node el, in keyframe form.
     Every path Typst exports starts with an empty "M 0 0" subpath and the real
     start is a relative "m x y"; when the start happens to sit on the box origin
     it writes "M 0 0 l …" instead — one command fewer, and Chrome cannot
     interpolate between the two forms (the shape snaps at the midpoint while the
     transform glides — a pendulum rod detaches from its pivot). The computed d
     is already absolute; dropping that empty subpath makes both forms read
     "M x y L …". */
  function values(el, attrs, kf) {
    var cs = getComputedStyle(el);
    attrs.forEach(function (a) {
      var v = cs[PROPS[a]];
      if (a === "d") v = v.replace(/^path\("M 0 0 M /, 'path("M ');
      kf[PROPS[a]] = v;
    });
    return kf;
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
      if (a === b || !live || !m.nodes) return;
      /* Each node of the new state animates from the value of its counterpart in
         the old state to its own; the end is the node's own attribute, so it
         lands there by itself and nothing has to be committed. Both ends go
         through values() so the d syntax matches. */
      m.nodes[b].forEach(function (el, j) {
        var diff = changed([m.nodes[a][j], el]);
        if (diff.length) s.vtRun.push(el.animate([values(m.nodes[a][j], diff, {}), values(el, diff, {})], { duration: durMs(defaultMs), easing: EASE }));
      });
    });
    /* instant moves (landing, previews, thumbnails) are not "a step taken", so
       they don't announce; the caller's paint() does */
    if (!instant && s === slides[cur]) announce();
  }

  /* Cut a running step short — the new state already rests on its own
     attributes, so cancelling is jumping to the end. */
  function halt(s) {
    (s.vtRun || []).forEach(function (a) { a.cancel(); });
    s.vtRun = [];
  }

  /* ── continuous animation (slide(anim:)) ─────────────────────────────
     <section data-anim='{"dot":{"follow":"track","duration":3000}}'>.
     No DSL: the spec is Web Animations keyframes + options and goes to
     el.animate() as is. Three sources of keyframes: `keyframes` animates the
     mark itself; `follow` runs it along the first <path> of another mark on the
     same frame (CSS offset-path, on the compositor, only offset-distance moves);
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
        var opts = { duration: 1000, iterations: Infinity, easing: "linear" };
        Object.keys(o).forEach(function (k) {
          if (k !== "keyframes" && k !== "follow" && k !== "orient") opts[k] = o[k];
        });
        var keep = function (a, fit) { a.pause(); s.vtAnims.push({ a: a, fit: fit }); };
        if (fromStates(o)) {
          var m = stepsOf(s).marks.filter(function (m) { return m.key === key; })[0];
          if (!m || !m.nodes) { console.warn("[vtslides] anim: " + key + " has no keyframes, no follow and no states to play"); return; }
          m.nodes[0].forEach(function (node, j) {
            var column = m.nodes.map(function (list) { return list[j]; }), diff = changed(column);
            if (diff.length) keep(node.animate(column.map(function (el) { return values(el, diff, {}); }), opts));
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
          keep(el.animate([{ offsetDistance: "0%" }, { offsetDistance: "100%" }], opts),
               function () { el.style.offsetPath = pathIn(track); });
        } else keep(el.animate(o.keyframes, opts));
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
    if (!s.vtAnims || reduced.matches || over()) return;
    s.vtAnims.forEach(function (x) { x.a.play(); });
  }
  new ResizeObserver(function () {
    (slides[cur].vtAnims || []).forEach(function (x) { if (x.fit) x.fit(); });
  }).observe(deck);

  /* ── transition ──────────────────────────────────────────────────────
     types are this transition's types (["slide", "back"], ["zoom"]), handed to
     the API; deck.css selects rules with html:active-view-transition-type(slide).
     The browser owns their lifetime, so a skipped transition never takes the
     next one's types with it. A falsy value means no transition: land at once.
     setup runs before the old snapshot is captured (pairing names, effect
     classes, temporary names); the clean-ups it pushes into undo run when the
     transition has finished. */
  function transition(types, update, setup) {
    if (!types) { update(); play(); return; }
    root.style.setProperty("--vt-dur", dur(defaultMs));
    var undo = [];
    if (setup) setup(undo);
    var vt = document.startViewTransition({ update: update, types: types });
    var clear = function () { undo.forEach(function (f) { f(); }); play(); };
    vt.finished.then(clear, clear);
  }

  function go(i, k) {
    i = clamp(i);
    if (i === want) return;
    var dir  = i > want ? "fwd" : "back";
    var dest = slides[i];
    /* The page-level effect (push, wipe or fade the whole page) applies between
       pages only: the page being entered decides, and going back the page being
       left does, so a transition always replays in reverse. Between frames of
       one page the layout stays put and only changes incrementally, so root
       always cross-fades — what is the same stays, what was added fades in;
       elements enter and leave by their own mark(transition:). */
    var owner = dir === "fwd" ? dest : slides[want];
    var fx    = gOf[i] === gOf[want] ? "fade" : owner.dataset.transition || defaultFx;
    want = i;
    stepTo(dest, k || 0, true);
    var live = canVT && !reduced.matches && fx !== "none" && !over();
    transition(live && [fx, dir], function () { paint(i); }, function (undo) {
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

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    if (NEXT[e.key])      { e.preventDefault(); next(); }
    else if (PREV[e.key]) { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); pick(0); }
    else if (e.key === "End")  { e.preventDefault(); pick(groups[gn - 1].from); }
    else if (e.key === "f") { e.preventDefault(); toggleFullscreen(); }
    else if (e.key === "l") { e.preventDefault(); toggleLaser(); }
    else if (e.key === "s") { e.preventDefault(); openSpeaker(); }
    else if (e.key === "-") { e.preventDefault(); setSpeed(speed / 1.25); }
    else if (e.key === "=" || e.key === "+") { e.preventDefault(); setSpeed(speed * 1.25); }
    else if (e.key === "0") { e.preventDefault(); setSpeed(1); }
    else if (e.key === "a" || e.key === "o") { e.preventDefault(); toggleOverview(); }
    else if (e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      pick(groups[Math.min(parseInt(e.key, 10) - 1, gn - 1)].from);
    }
  });

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

  document.addEventListener("click", function (e) {
    if (over()) {
      var dot = e.target.closest(".vt-dots i");
      if (dot) { openSlide(+dot.dataset.frame, +dot.dataset.at); return; }
      var g = e.target.closest(".vt-group");
      if (g) openSlide(slides.indexOf(g.querySelector(".vt-slide.is-thumb")));   // what you see is what opens
      return;
    }
    if (e.target.closest("a, button, input, select, textarea, pre, table")) return;
    if (bar && frac(e, bar)) return;         // a click on the toolbar during a transition is not a page turn
    if (lasing && touching) return;          // pointing by touch is not a page turn
    var q = frac(e, deck);
    if (q) tap(q);
  });

  var tx = 0, ty = 0, swiping = false;
  document.addEventListener("touchstart", function (e) {
    var t = e.changedTouches[0];
    swiping = !!frac(t, deck);
    tx = t.clientX;
    ty = t.clientY;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!swiping || lasing) return;          // no swiping while the laser is on
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); }
  }, { passive: true });

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
  document.addEventListener("wheel", function (e) {
    if (!over() && frac(e, deck)) wheel(e);
  }, { passive: true });

  /* follow the address bar (replaceState does not fire this, so our own writes don't loop back) */
  window.addEventListener("hashchange", function () { goto(fromHash()); });

  /* "#3" = page 3, first position; "#3.4" = page 3, fourth position (frames and steps flattened) */
  function fromHash() {
    var m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
    if (!m) return POS[0];
    var g = groups[Math.min(Math.max(parseInt(m[1], 10) - 1, 0), gn - 1)];
    return g.pos[Math.min(Math.max(m[2] ? parseInt(m[2], 10) - 1 : 0, 0), g.pos.length - 1)];
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
    transition(canVT && !reduced.matches && ["zoom"], update, function (undo) {
      dest.style.viewTransitionName = "vt-zoom";
      undo.push(function () { dest.style.viewTransitionName = ""; });
    });
  }

  function toggleOverview() {
    if (over()) openSlide(cur);
    else zoomTo(cur, function () { deck.classList.add("vt-all"); still(slides[cur]); syncTools(); });
  }

  /* Open a page from the overview; without a step, at whatever step the
     thumbnail shows. Clicking the previewed dot means that step — the dots'
     pointerleave on leaving the overview must not move it back. */
  function openSlide(i, k) {
    want = i;
    peeked = null;
    if (k != null) stepTo(slides[i], k, true);
    zoomTo(i, function () { deck.classList.remove("vt-all"); paint(i); });
  }

  /* choosing a page in the overview opens it; while presenting it is a plain page change */
  function pick(i) { if (over()) openSlide(i); else go(i); }

  /* ── toolbar ─────────────────────────────────────────────────────────
     Built by the runtime, so every deck has one. Lives outside .vt-deck with
     its own view-transition-name, so a page transition never drags it along.
     A toolbar can be built in any document: one in the main window
     (auto-hiding), one in the speaker view (always shown, bottom right).
     Buttons call the same functions; syncTools() refreshes them together. */

  var ICON = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    laser: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1",
    down: "M12 4v10M8 12l4 4 4-4M5 20h14",
    notes: "M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4",
    full: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
    unfull: "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"
  };

  function svg(d, extra) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      d.split("M").filter(Boolean).map(function (seg) { return '<path d="M' + seg + '"/>'; }).join("") +
      (extra || "") + "</svg>";
  }

  /* PDF download. The PDF from the same .typ sits next to the HTML, so
     "is there a handout?" needs no digging. data-pdf="auto" (default) = the
     .pdf with this page's name; "none" = no button. download + target=_blank
     work together: where downloading works the page stays; where the download
     attribute is ignored (cross-origin, some file:// cases) it merely opens a
     new tab. */
  var pdfHref = (function () {
    var v = deck.dataset.pdf || "auto";
    if (v === "none") return "";
    if (v !== "auto") return v;
    var m = /^([^?#]*)\.x?html?$/i.exec(location.href);
    return m ? m[1] + ".pdf" : "";
  })();

  function buildBar(doc) {
    function button(label, markup, onClick) {
      var el = doc.createElement("button");
      el.type = "button";
      el.title = label;
      el.setAttribute("aria-label", label);
      el.innerHTML = markup;
      el.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
      return el;
    }
    var b = { el: doc.createElement("div"), count: doc.createElement("div") };
    b.el.className = "vt-bar";
    b.count.className = "vt-count";
    b.el.appendChild(b.count);

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
  if (window.name !== "vt-mirror") {
    var mainBar = buildBar(document);
    bars.push(mainBar);
    bar = mainBar.el;
    document.body.appendChild(bar);
    bar.addEventListener("pointerenter", showBar);
  }

  /* auto-hide: the bar is chrome, not content */
  var hideAt = 0, barTimer = null;

  function showBar() {
    if (!bar) return;
    bar.classList.add("is-shown");
    hideAt = Date.now() + 2400;
    if (!barTimer) barTimer = setInterval(function () {
      if (Date.now() < hideAt || bar.matches(":hover") || bar.contains(document.activeElement)) return;
      bar.classList.remove("is-shown");
      clearInterval(barTimer);
      barTimer = null;
    }, 300);
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
  var laser = document.createElement("div");
  laser.className = "vt-laser";
  document.body.appendChild(laser);

  function route(e) {
    var mouse = e.pointerType === "mouse" || e.pointerType === "";
    touching = !mouse;
    document.body.classList.toggle("vt-nomouse", touching);
    if (!lasing || mouse || over()) { laser.classList.remove("is-on"); return; }
    dot(e.clientX, e.clientY);
  }

  function dot(x, y) {
    laser.style.transform = "translate(" + x + "px," + y + "px)";
    laser.classList.add("is-on");
  }

  document.addEventListener("pointermove", function (e) { showBar(); route(e); });
  document.addEventListener("pointerdown", route);
  document.addEventListener("pointerup", function () { if (touching) laser.classList.remove("is-on"); });
  document.addEventListener("pointercancel", function () { laser.classList.remove("is-on"); });

  function toggleLaser() {
    lasing = !lasing;
    document.body.classList.toggle("vt-lasing", lasing);
    if (!lasing) laser.classList.remove("is-on");
    syncTools();
    showBar();
  }

  function syncTools() {
    var text = label(cur) + " / " + gn;
    var fs = !!document.fullscreenElement;
    bars.forEach(function (b) {
      b.el.ownerDocument.body.classList.toggle("vt-lasing", lasing);   // the speaker window's cursor follows too
      b.count.textContent = text;
      b.overview.setAttribute("aria-pressed", String(over()));
      b.laser.setAttribute("aria-pressed", String(lasing));
      b.full.innerHTML = svg(fs ? ICON.unfull : ICON.full);
      b.full.title = fs ? "Exit full screen (f)" : "Full screen (f)";
      b.full.setAttribute("aria-label", b.full.title);
    });
  }

  document.addEventListener("fullscreenchange", syncTools);
  deck.addEventListener("vt:slide", syncTools);

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
  var prefersLight = window.matchMedia("(prefers-color-scheme: light)");
  function applyTheme() {
    var t = deck.dataset.theme || "auto";
    root.dataset.theme = t === "auto" ? (prefersLight.matches ? "light" : "dark") : t;
    if (speaker && !speaker.closed) speaker.document.documentElement.dataset.theme = root.dataset.theme;
  }
  prefersLight.addEventListener("change", applyTheme);
  applyTheme();

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

  var SPEAKER_CSS =
    "html{color:var(--vt-fg2);font:15px/1.55 ui-sans-serif,system-ui,sans-serif}" +
    "body{margin:0;height:100vh;box-sizing:border-box;padding:12px;display:grid;gap:12px;" +
      "grid-template-columns:minmax(0,3fr) minmax(0,2fr);grid-template-rows:auto auto minmax(0,1fr)}" +
    ".prog{grid-column:1/-1;height:3px;margin:-12px -12px 0;background:var(--vt-line)}" +
    ".prog i{display:block;height:100%;width:0;background:var(--vt-accent);transition:width .3s var(--vt-ease)}" +
    "header{grid-column:1/-1;display:flex;align-items:baseline;gap:10px;color:var(--vt-muted)}" +
    "header b{color:var(--vt-fg);font-variant-numeric:tabular-nums}" +
    "header span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "header time{margin-left:auto;font:600 26px/1 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "color:var(--vt-fg);cursor:pointer;font-variant-numeric:tabular-nums}" +
    "main,aside{display:flex;flex-direction:column;gap:8px;min-height:0}" +
    "small{color:var(--vt-muted)}" +
    "iframe{display:block;border:0;width:100%;aspect-ratio:var(--vt-w)/var(--vt-h);border-radius:6px;" +
      "background:var(--vt-page,#111318);pointer-events:none}" +
    "main{cursor:default}body.vt-lasing main{cursor:var(--vt-laser) 16 16,none}" +
    "[hidden]{display:none}" +
    ".note{flex:1;overflow:auto;padding:10px 14px;border-radius:6px;background:var(--vt-panel);" +
      "border:1px solid var(--vt-line);color:var(--vt-fg);font-size:17px}" +
    ".note:empty::before{content:'No notes for this page';color:var(--vt-muted)}" +
    ".note>:first-child{margin-top:0}.note>:last-child{margin-bottom:0}" +
    ".note ul,.note ol{padding-left:1.3em}";

  var base = location.href.replace(/#.*$/, "");

  /* Copy the chrome styles from deck.css as they are: the tokens on html (both
     themes and --vt-laser) and every rule whose selector starts with .vt-bar. */
  function chromeCSS() {
    var out = [];
    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      var rules;
      try { rules = sheet.cssRules; } catch (e) { return; }
      Array.prototype.forEach.call(rules, function (r) {
        if (r.selectorText && /^(html\b|\.vt-bar)/.test(r.selectorText)) out.push(r.cssText);
      });
    });
    return out.join("");
  }

  function openSpeaker() {
    if (speaker && !speaker.closed) { speaker.focus(); return; }
    speaker = window.open("", "vt-speaker", "popup,width=1040,height=640");
    if (!speaker) { console.warn("[vtslides] the speaker view was blocked by the browser; allow pop-ups for this page."); return; }

    var d = speaker.document;
    d.head.innerHTML = "<style>" + chromeCSS() + SPEAKER_CSS + "</style>";
    d.documentElement.dataset.theme = root.dataset.theme;
    ["--vt-page", "--vt-w", "--vt-h"].forEach(function (v) {
      d.documentElement.style.setProperty(v, getComputedStyle(deck).getPropertyValue(v));
    });
    d.title = "Speaker view · " + document.title;
    d.body.innerHTML =
      "<div class='prog'><i></i></div>" +
      "<header><b></b><span></span><time title='Click to reset'>00:00</time></header>" +
      "<main><iframe name='vt-mirror'></iframe><div class='note'></div></main>" +
      "<aside><small>Next</small><iframe name='vt-mirror'></iframe></aside>";
    spk = {
      page: d.querySelector("header b"), title: d.querySelector("header span"),
      clock: d.querySelector("time"), note: d.querySelector(".note"),
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
    var u = base + "#" + hash;
    if (frame.getAttribute("src") !== u) frame.src = u;
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
    var note = g.el.querySelector(".vt-note");
    spk.note.innerHTML = note ? note.innerHTML : "";
  }

  deck.addEventListener("vt:slide", syncSpeaker);
  /* close it when the main window goes, so no window is left out of sync */
  window.addEventListener("pagehide", function () { if (speaker && !speaker.closed) speaker.close(); });

  /* ── boot ─────────────────────────────────────────────────────────── */

  deck.setAttribute("data-ready", "");
  root.style.setProperty("--vt-dur", dur(defaultMs));
  var h0 = fromHash();
  stepTo(slides[h0.i], h0.at, true);
  paint(want = h0.i);
  play();
  showBar();

  window.vtslides = {
    go: go, next: next, prev: prev,
    get index() { return cur; },
    get total() { return n; },
    get step() { return at(cur); }, set step(k) { stepTo(slides[cur], k); },
    get steps() { return stepsOf(slides[cur]).n; },
    get speed() { return speed; }, set speed(v) { setSpeed(v); },
    deck: deck
  };
})();
