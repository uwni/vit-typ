/* ── tween · the engine ─────────────────────────────────────────────────
   N states of one drawing, each an SVG subtree of the same shape. The states
   are that drawing under different numbers, so the subtrees are walked node by
   node and every attribute that differs becomes a keyframe. What has no
   in-between cross-fades. Nothing here knows about pages or navigation: it is
   handed the states and gives back animations. */

window.tween = (() => {
   "use strict";

   /* SVG attribute → its name in the CSSOM. Keyframes take only the IDL name:
      "stroke-width" is silently dropped. Whether one changed is decided on the
      attribute string — same code, equal string means unchanged. */
   const PROPS = {
      d: "d", transform: "transform", fill: "fill", stroke: "stroke", "stroke-width": "strokeWidth",
      "stroke-dasharray": "strokeDasharray", "stroke-dashoffset": "strokeDashoffset",
      opacity: "opacity", "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity",
      x: "x", y: "y", width: "width", height: "height", r: "r", cx: "cx", cy: "cy", rx: "rx", ry: "ry",
   };
   const noted = new Set();

   /* What differs across the nodes in list (same position in each state):
      `props`, the attributes in PROPS that are not all equal, and `other`, true
      if anything else differs (a glyph's href, say) — something that cannot be
      interpolated and is cross-faded instead. */
   const changed = list => {
      const [first, ...rest] = list;
      const props = Object.keys(PROPS).filter(a => {
         const v = first.getAttribute(a);
         return rest.some(el => el.getAttribute(a) !== v);
      });
      const other = rest.some(el =>
         el.attributes.length !== first.attributes.length ||
         [...el.attributes].some(({ name, value }) =>
            !PROPS[name] && name !== "style" && first.getAttribute(name) !== value));
      return { props, other };
   };

   /* The transform attribute as the SVG DOM parsed it, multiplied left to
      right — the value a CSS transform on the element replaces. */
   const transformOf = el => {
      const list = el.transform.baseVal, m = new DOMMatrix();
      for (let i = 0; i < list.numberOfItems; i++) m.multiplySelf(list.getItem(i).matrix);
      return m.toString();
   };

   /* Current values, in keyframe form. Never parsed by hand: getComputedStyle
      has already turned the presentation attributes into CSS syntax. transform
      is the exception — Blink resolves it to none for an element without a box
      and WebKit does not map the attribute in at all — so it comes from the SVG
      DOM. Read fresh, so every caller must read at rest. A property the browser
      does not have (d in Safari before 27) is left out and switches instead. */
   const values = (el, attrs) => {
      let cs = null;
      const kf = {};
      for (const a of attrs) {
         const v = a === "transform" ? transformOf(el) : (cs ??= getComputedStyle(el))[PROPS[a]];
         if (typeof v === "string" && v !== "") kf[PROPS[a]] = v;
      }
      return kf;
   };

   /* Two states made the same kind of value, each keeping its own picture.
      false when a path could not be aligned; that node cross-fades. */
   const settle = frames => {
      /* `none` against a colour is a discrete switch; `transparent` paints the
         same nothing and interpolates premultiplied, so no black midpoint. */
      for (const k of ["fill", "stroke"]) {
         if (k in frames[0] && frames.some(f => f[k] !== "none")) {
            for (const f of frames) if (f[k] === "none") f[k] = "transparent";
         }
      }
      /* d: two states whose paths are not the same list of commands are reconciled by paths.js */
      if (!("d" in frames[0])) return true;
      const ds = tweenPaths.align(frames.map(f => f.d));
      if (!ds) return false;
      frames.forEach((f, k) => { f.d = ds[k]; });
      return true;
   };

   /* The label grammar, read here and nowhere else; everything downstream sees
      attributes. */
   const tag = root => {
      for (const g of (root ?? document).querySelectorAll("[data-typst-label]")) {
         const l = g.getAttribute("data-typst-label");
         if (l.startsWith("tween@")) g.dataset.tweenAt = l.slice(6);
         else if (l === "tween") g.dataset.tween = "";
         else if (l.startsWith("tween:")) g.dataset.tween = l.slice(6);
      }
   };
   if (document.readyState === "loading") addEventListener("DOMContentLoaded", () => tag());
   else tag();

   const api = {
      tag,

      /* The containers in a subtree, outermost only: a drawing inside a state
         is an ordinary node. */
      boxes: root => [...root.querySelectorAll("[data-tween]")]
         .filter(c => !c.parentNode.closest("[data-tween]")),

      /* The states of one container, by index. */
      states(box) {
         const out = [];
         for (const g of box.querySelectorAll("[data-tween-at]")) {
            if (g.closest("[data-tween]") === box) out[+g.dataset.tweenAt] = g;
         }
         return out.filter(Boolean);
      },

      /* The nodes of each state, in document order, or null when the states are
         not the same drawing after all — a different node count or a different
         tag in the same place, which has no node-to-node reading and is
         cross-faded whole. */
      nodes(states, label) {
         const lists = states.map(g => [...g.querySelectorAll("*")]);
         const ok = lists.every(l =>
            l.length === lists[0].length && l.every((el, q) => el.tagName === lists[0][q].tagName));
         if (ok) return lists;
         console.info(`[tween] the states of ${label} differ in structure (node count or types); they cross-fade instead of morphing`);
         return null;
      },

      /* One node across the states: the keyframes to animate it with, and
         whether something about it has to cross-fade instead. `frames` is null
         when nothing in PROPS differs — that node simply stays as it is. */
      frames(column, label) {
         const { props, other } = changed(column);
         let fade = other;
         if (!props.length) return { frames: null, fade };
         const frames = column.map(el => values(el, props));
         if (!settle(frames)) {
            fade = true;
            for (const f of frames) delete f.d;
            if (!noted.has(label)) {
               noted.add(label);
               console.info(`[tween] ${label}: a path cannot be interpolated and cross-fades instead.`);
            }
         }
         return { frames: Object.keys(frames[0]).length ? frames : null, fade };
      },

      /* Whether this drawing plays its states rather than leaving them to be
         stepped. A host that steps drawings asks; it does not read labels. */
      plays: box => !!box.closest('tween-play,[data-typst-label^="tween-play@"]'),

      /* Played over time instead of stepped: one animation per node, each
         keyframe that node's values in that state. What moves is the first
         state, the one the stylesheet shows. The animations come back to
         whoever asked; pausing and cancelling are theirs. */
      play(box, o, role) {
         const label = box.dataset.tween || "a drawing";
         const lists = api.nodes(api.states(box), label);
         if (!lists) return [];
         return lists[0]
            .map((node, j) => {
               const { frames } = api.frames(lists.map(l => l[j]), label);
               return frames ? waapi.animate(node, frames, o, role) : null;
            })
            .filter(Boolean);
      },

      /* Once per drawing: a second call finds it already going. */
      start(host, o) {
         if (host.dataset.tweenPlayOn) return;
         host.dataset.tweenPlayOn = "1";
         tag(host);
         for (const box of api.boxes(host)) {
            const as = api.play(box, o, "tween:play");
            if (waapi.reduced()) as.forEach(a => a.pause());
         }
      },

      /* For what has no in-between. The old fades out while the new fades in,
         with plus-lighter inside an isolated host so a pixel both draw alike
         does not dim halfway. `olds` are nodes of the old state to keep visible
         while the rest of it is hidden. The caller calls undo when they end. */
      crossfade(host, oldG, newG, olds, news, timing) {
         let cleanup = [];
         const set = (el, prop, v) => {
            const was = el.style[prop];
            el.style[prop] = v;
            cleanup.push(() => { el.style[prop] = was; });
         };
         set(host, "isolation", "isolate");
         set(oldG, "display", "inline");
         set(oldG, "mixBlendMode", "plus-lighter");
         set(newG, "mixBlendMode", "plus-lighter");
         if (olds) {
            set(oldG, "visibility", "hidden");
            for (const el of olds) set(el, "visibility", "visible");
         }
         const anims = [
            ...(olds ?? [oldG]).map(el => waapi.animate(el, [{ opacity: 1 }, { opacity: 0 }], timing)),
            ...(news ?? [newG]).map(el => waapi.animate(el, [{ opacity: 0 }, { opacity: 1 }], timing)),
         ];
         return { anims, undo: () => { cleanup.forEach(f => f()); cleanup = []; } };
      },
   };

   /* Around the drawing where an element could be written; outside the frames,
      pointing at the ordinal in a label, where none could. */
   customElements.define("tween-play", class extends HTMLElement {
      connectedCallback() {
         /* Upgraded mid-parse, its children are not there yet and neither is
            what it points at. */
         if (document.readyState === "loading") {
            addEventListener("DOMContentLoaded", () => this.run(), { once: true });
            return;
         }
         this.run();
      }
      run() {
         let o;
         try { o = JSON.parse(this.dataset.spec); } catch { return; }
         const { at } = this.dataset;
         const el = at == null ? this : document.querySelector(`[data-typst-label="tween-play@${at}"]`);
         if (el) api.start(el, o);
      }
   });

   return api;
})();
