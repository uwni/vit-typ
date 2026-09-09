/* ── hoist marked regions out of the page SVG ──────────────────────────
   view-transition-name is silently ignored on SVG child elements, so a marked
   region cannot morph where it sits inside the page SVG. Each one is lifted
   into its own absolutely positioned <svg> — an HTML-level element the API
   honours.

   The identity channel is a Typst label: the SVG export writes it as a
   <g data-typst-label="vit-key"> wrapping the content, and that <g> *is* the
   content boundary. Nothing is inferred: no geometry probing, no per-node
   assignment, no tolerance, no mask. Two marks whose boxes overlap are still
   two subtrees.

   Lifting has to lay a frame out to measure it, so it happens one frame at a
   time, when the runtime asks. An unlifted frame draws the same picture and
   cannot morph. */

(() => {
   "use strict";

   const NS = "http://www.w3.org/2000/svg";
   const PREFIX = "vit-";

   const unstep = el => {
      const was = [el.style.getPropertyValue("display"), el.style.getPropertyPriority("display")];
      el.style.removeProperty("display");
      return was;
   };
   const show = (el, how) => {
      const was = unstep(el);
      el.style.setProperty("display", how, "important");
      el.style.setProperty("content-visibility", "visible", "important");
      return was;
   };
   const restore = (el, [value, priority]) => {
      el.style.removeProperty("content-visibility");
      if (value) el.style.setProperty("display", value, priority);
      else el.style.removeProperty("display");
   };

   const pageNo = group => [...document.querySelectorAll(".vit-group")].indexOf(group) + 1;

   const bbox = (el, toRoot) => {
      let b;
      try { b = el.getBBox(); } catch { return null; }
      const m = toRoot(el);
      const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
         .map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
      const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
   };

   /* ── TEMPORARY (typst#8832) ──────────────────────────────────────────
      waapi declares an animation where the thing it moves is written, but
      inside a frame it cannot start it: keyframes are CSS, and an element
      inside an `<svg>` is not a CSS box — `backgroundColor`, `borderRadius`,
      `boxShadow` and `width` compute there and paint nothing, percentages and
      the transform origin resolve against the viewBox, and the element's own
      transform is its placement, which a `transform` keyframe would replace.
      So `<waapi-anim data-at data-spec>` names its target by the ordinal in
      that target's label and waits; lifting is what makes it a box.

      Measured and placed with the marks — moving one first would measure the
      rest against a box given in percentages — then started on the box it was
      given, with the page as what a followed path is measured from: the host is
      an `<svg>`, which has no offsetParent.

      All of this goes when the Typst side can place these regions itself: the
      function, and its two call sites below. */
   const declared = (page, toRoot) => {
      const found = [...document.querySelectorAll("waapi-anim[data-at]")]
         .map(d => ({
            el: document.querySelector(`[data-typst-label="waapi-anim@${d.dataset.at}"]`),
            spec: d.dataset.spec,
         }))
         .filter(d => d.el && page.contains(d.el));
      const plan = [];
      for (const { el, spec } of found) {
         const box = bbox(el, toRoot);
         if (box && box[2] > box[0] && box[3] > box[1]) plan.push({ key: null, node: el, box, mat: toRoot(el.parentNode), spec });
      }
      return {
         plan,
         start: () => {
            for (const { node, spec } of plan) {
               const host = node.closest(".vit-mark");
               if (host) { try { window.waapi?.start(host, JSON.parse(spec), page); } catch { } }
            }
         },
      };
   };

   /* vit-key on the <g> becomes data-vit-key on the host; what the mark declares
      about itself is in vitMarks, by key. True only when it did the work. */
   window.vitLift = slide => {
      if (!slide || slide.dataset.vitLifted) return false;
      const page = slide.querySelector(":scope > .vit-page");
      const root = page?.querySelector("svg");
      if (!root) { slide.dataset.vitLifted = "1"; return false; }

      /* getBBox returns nothing that is not rendered, so the frame is laid out
         and put back in the same task, unpainted — with `!important`, since
         what is out of the layout is out by a stylesheet rule. Everything above
         it that is out too comes back with it: only one frame of the deck is
         shown at a time, and in the overview the deck itself is not. The states
         go back to what the stylesheet says, so a mark's box does not depend on
         which step this frame happens to be on. */
      const group = slide.closest(".vit-group");
      const states = [...page.querySelectorAll("[data-tween-at]")];
      const out = [];
      for (let el = slide; el && el !== document.body; el = el.parentElement) {
         if (getComputedStyle(el).display === "none") out.push(el);
      }
      const was = out.map(el => show(el, "block"));
      const stateWas = states.map(unstep);

      try {
         /* A document with no box measures every mark empty, and the flag would
            make that permanent. */
         if (!root.getBoundingClientRect().width) return false;
         slide.dataset.vitLifted = "1";

         const vb = root.viewBox.baseVal;

         /* getCTM's target space differs between browsers: Chrome includes the
            viewBox→viewport scale (root.getCTM() is 1.5× in a 1920px window), Safari
            follows another convention. So the absolute value is never used directly:
            measure twice with the same function and divide — root's inverse times
            the element's is always "element user space → root viewBox space",
            whatever the convention.

            Read the absolute value and every hoisted element drifts down-right
            in proportion to the window, at every size but the one where the
            scale happens to be 1. */
         const inv = root.getScreenCTM().inverse();
         const toRoot = el => inv.multiply(el.getScreenCTM());

         const byKey = new Map();
         for (const g of page.querySelectorAll("[data-typst-label]")) {
            const l = g.getAttribute("data-typst-label");
            if (!l.startsWith(PREFIX)) continue;
            /* A mark inside the states of an element animation stays put: the
               engine pairs the nodes of the states one by one, and one moved away
               would no longer line up. */
            if (g.parentNode.closest("[data-tween-at]")) continue;
            const k = l.slice(PREFIX.length);
            byKey.set(k, [...(byKey.get(k) ?? []), g]);
         }

         /* Measure everything first, then move: once an outer mark sits in its
            own host, a mark nested in it would be measured against a box given
            in percentages, and follow the window size. One label instance is one
            region — the same key several times on a page is allowed, and the
            runtime names them by occurrence. */
         const anims = declared(page, toRoot);                      // TEMPORARY
         const plan = [...anims.plan];
         for (const [key, nodes] of byKey) {
            for (const node of nodes) {
               const box = bbox(node, toRoot);
               if (!box || box[2] <= box[0] || box[3] <= box[1]) {
                  console.warn(`[vit] mark ${key} on page ${pageNo(group)} has no box and is not hoisted: it neither morphs nor enters on its own`);
                  continue;
               }
               /* the parent's CTM: the node's own transform travels with it */
               plan.push({ key, node, box, mat: toRoot(node.parentNode) });
            }
         }

         for (const { key, node, box: [x, y, x2, y2], mat: m } of plan) {
            const w = x2 - x, h = y2 - y;

            /* An HTML-level <svg> carries the name itself; one nested inside the
               page svg would not, only the CSS box tree is ever captured. */
            const host = document.createElementNS(NS, "svg");
            host.setAttribute("class", "vit-mark");
            host.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
            /* Layout snaps the box to 1/64 px, and xMidYMid meet would then scale
               both axes by the smaller ratio, drifting a wide line's right end off
               the PDF's anti-aliasing. */
            host.setAttribute("preserveAspectRatio", "none");
            host.style.left = `${((x - vb.x) / vb.width) * 100}%`;
            host.style.top = `${((y - vb.y) / vb.height) * 100}%`;
            host.style.width = `${(w / vb.width) * 100}%`;
            host.style.height = `${(h / vb.height) * 100}%`;
            if (key != null) host.dataset.vitKey = key;

            const wrap = document.createElementNS(NS, "g");
            wrap.setAttribute("transform", `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].join(" ")})`);
            wrap.appendChild(node);                  // detaches it from the page svg
            host.appendChild(wrap);
            page.appendChild(host);
         }
         anims.start();                                             // TEMPORARY
      } finally {
         states.forEach((g, i) => restore(g, stateWas[i]));
         out.forEach((el, i) => restore(el, was[i]));
      }
      return true;
   };
})();
