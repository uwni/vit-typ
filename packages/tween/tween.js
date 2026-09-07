/* ── tween · the engine ─────────────────────────────────────────────────
   N states of one drawing, each an SVG subtree of the same shape, and the
   browser moved between two of them. Nothing here knows about pages, slides
   or navigation: it is handed the states and returns the animations.

   The states are the same drawing under different numbers — same structure,
   only the values differ — so the two subtrees are walked node by node and
   every attribute that differs becomes a keyframe: the path's d, the transform,
   colours, stroke width, opacity, x/y/width/height. What has no in-between
   cross-fades. Playing them is waapi's job, not this file's. */

window.tween = (function () {
   "use strict";

   /* The attributes compared node by node. Whether one changed is decided on the
      attribute string — the states come from the same code, equal string means
      unchanged. The table maps SVG attribute name → the same property's name in
      the CSSOM / in keyframes (keyframes only accept the IDL name;
      "stroke-width" is silently dropped). */
   var PROPS = {
      d: "d", transform: "transform", fill: "fill", stroke: "stroke", "stroke-width": "strokeWidth",
      "stroke-dasharray": "strokeDasharray", "stroke-dashoffset": "strokeDashoffset",
      opacity: "opacity", "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity",
      x: "x", y: "y", width: "width", height: "height", r: "r", cx: "cx", cy: "cy", rx: "rx", ry: "ry"
   };
   var noted = {};

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
      every time — a computed value is what the node shows now, so every caller
      reads at rest: the host halts what is running first, and a drawing played
      continuously is never stepped. A property the browser does not have (d in
      Safari before 27) is left out; that one then switches instead of
      interpolating. */
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

   /* Every rewrite here keeps the picture of each state and only changes how it
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
      var ds = tweenPaths.align(frames.map(function (f) { return f.d; }));
      if (!ds) return false;
      frames.forEach(function (f, k) { f.d = ds[k]; });
      return true;
   }

   /* The label grammar is read here and nowhere else; everything downstream
      sees attributes. `tween` (or `tween:name`) is a container → data-tween
      holds the name, `tween@i` is one of its states → data-tween-at holds the
      index. */
   function tag(root) {
      (root || document).querySelectorAll("[data-typst-label]").forEach(function (g) {
         var l = g.getAttribute("data-typst-label");
         if (l.slice(0, 6) === "tween@") g.dataset.tweenAt = l.slice(6);
         else if (l === "tween") g.dataset.tween = "";
         else if (l.slice(0, 6) === "tween:") g.dataset.tween = l.slice(6);
      });
   }
   if (document.readyState === "loading") addEventListener("DOMContentLoaded", function () { tag(); });
   else tag();

   return {
      tag: tag,

      /* The containers in a subtree, outermost only: a drawing whose states
         hold drawings of their own is one drawing here, and the inner states
         are ordinary nodes. */
      boxes: function (root) {
         return Array.prototype.filter.call(root.querySelectorAll("[data-tween]"), function (c) {
            return !c.parentNode.closest("[data-tween]");
         });
      },

      /* The states of one container, by index. */
      states: function (box) {
         var out = [];
         box.querySelectorAll("[data-tween-at]").forEach(function (g) {
            if (g.closest("[data-tween]") === box) out[+g.dataset.tweenAt] = g;
         });
         return out.filter(Boolean);
      },

      /* The nodes of each state, in document order, or null when the states are
         not the same drawing after all — a different node count or a different
         tag in the same place, which has no node-to-node reading and is
         cross-faded whole. */
      nodes: function (states, label) {
         var all = function (g) { return Array.prototype.slice.call(g.querySelectorAll("*")); };
         var lists = states.map(all);
         var ok = lists.every(function (list) {
            return list.length === lists[0].length &&
               list.every(function (el, q) { return el.tagName === lists[0][q].tagName; });
         });
         if (ok) return lists;
         console.info("[tween] the states of " + label + " differ in structure (node count or types); they cross-fade instead of morphing");
         return null;
      },

      /* One node across the states: the keyframes to animate it with, and
         whether something about it has to cross-fade instead. `frames` is null
         when nothing in PROPS differs — that node simply stays as it is. */
      frames: function (column, label) {
         var diff = changed(column), fade = diff.other;
         if (!diff.props.length) return { frames: null, fade: fade };
         var frames = column.map(function (el) { return values(el, diff.props, {}); });
         if (!settle(frames)) {
            fade = true;
            frames.forEach(function (f) { delete f.d; });
            if (!noted[label]) { noted[label] = true; console.info("[tween] " + label + ": a path cannot be interpolated and cross-fades instead."); }
         }
         if (!Object.keys(frames[0]).length) return { frames: null, fade: fade };
         return { frames: frames, fade: fade };
      },

      /* For what has no in-between: a glyph that changes, a path that cannot be
         aligned, states of a different structure altogether. The old is kept on
         stage and fades out while the new fades in, with plus-lighter inside an
         isolated host so a pixel both draw alike stays exactly as it is instead
         of dimming halfway. `olds` are nodes of the old state that stay visible
         while the rest of it is hidden; without them the whole old state fades.
         The caller keeps the animations and calls undo when they are over. */
      crossfade: function (host, oldG, newG, olds, news, timing) {
         var cleanup = [], anims = [];
         var set = function (el, prop, v) { var was = el.style[prop]; el.style[prop] = v; cleanup.push(function () { el.style[prop] = was; }); };
         set(host, "isolation", "isolate");
         set(oldG, "display", "inline");
         set(oldG, "mixBlendMode", "plus-lighter");
         set(newG, "mixBlendMode", "plus-lighter");
         var out = olds || [oldG], inn = news || [newG];
         if (olds) { set(oldG, "visibility", "hidden"); olds.forEach(function (el) { set(el, "visibility", "visible"); }); }
         out.forEach(function (el) { anims.push(waapi.animate(el, [{ opacity: 1 }, { opacity: 0 }], timing)); });
         inn.forEach(function (el) { anims.push(waapi.animate(el, [{ opacity: 0 }, { opacity: 1 }], timing)); });
         return { anims: anims, undo: function () { cleanup.forEach(function (f) { f(); }); cleanup = []; } };
      }
   };
})();
