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

   Tagging reads the labels for the whole deck at once. Lifting has to lay a
   frame out to measure it, so it happens one frame at a time, when the runtime
   asks: `window.vitLift(slide)`. An unlifted frame draws the same picture and
   cannot morph. */

(function () {
   "use strict";

   var NS = "http://www.w3.org/2000/svg";
   var PREFIX = "vit-";

   /* The label grammar for a mark is read here and nowhere else: vit-key on the
      <g> becomes data-vit-key on the host. What a mark declares about itself is
      not in the label — the Typst side writes it into vitMarks, by key. The
      states inside it are tween's, with a grammar of their own. */

   /* True only when it did the work, so the caller knows to name the hosts. */
   window.vitLift = function (slide) {
      if (!slide || slide.dataset.vitLifted) return false;
      var page = slide.querySelector(":scope > .vit-page");
      var root = page && page.querySelector("svg");
      if (!root) { slide.dataset.vitLifted = "1"; return false; }

      /* getBBox returns nothing that is not rendered, so the frame is laid out
         for the measurement and put back in the same task, unpainted. Beating
         the stylesheet with `!important` is the point: on the desk and in the
         overview, which is where a deck idles, it hides frames and skips
         thumbnails that way. The states go back to what the stylesheet says —
         the first one, and no other — so that a mark's box does not depend on
         the step the runtime happens to have stepped this frame to. */
      var group = slide.closest(".vit-group");
      var states = [].slice.call(page.querySelectorAll("[data-tween-at]"));
      var was = [show(slide, "block"), group ? show(group, "block") : null];
      var stateWas = states.map(unstep);

      try {
         /* A document with no box measures every mark empty, and the flag
            above would make that permanent: leave it for the next caller. */
         if (!root.getBoundingClientRect().width) return false;
         slide.dataset.vitLifted = "1";

         var vb = root.viewBox.baseVal;

         /* getCTM's target space differs between browsers: Chrome includes the
            viewBox→viewport scale (root.getCTM() is 1.5× in a 1920px window), Safari
            follows another convention. So the absolute value is never used directly:
            measure twice with the same function and divide — root's inverse times
            the element's is always "element user space → root viewBox space",
            whatever the convention.

            Invisible at 1280×720, where the scale happens to be 1; at any other
            window size every hoisted element drifts down-right proportionally.
            The tests only ran at 1280×720 — exactly where the bug hides. */
         var inv = root.getScreenCTM().inverse();
         var toRoot = function (el) { return inv.multiply(el.getScreenCTM()); };

         var byKey = {};
         page.querySelectorAll("[data-typst-label]").forEach(function (g) {
            var l = g.getAttribute("data-typst-label");
            if (l.slice(0, PREFIX.length) !== PREFIX) return;
            /* A mark inside the states of an element animation stays put: the
               engine pairs the nodes of the states one by one, and one moved away
               would no longer line up. */
            if (g.parentNode.closest("[data-tween-at]")) return;
            var k = l.slice(PREFIX.length);
            (byKey[k] = byKey[k] || []).push(g);
         });

         /* Measure everything first, then move. Moving changes the screen position
            of nodes not yet measured — once an outer mark sits in its own host, an
            inner mark nested in it is measured inside the new host, whose size is a
            percentage, and the inner result starts following the window size. Two
            passes: the first only reads, the second touches the DOM. */
         var plan = [];
         Object.keys(byKey).forEach(function (key) {
            /* One label instance = one <g> = one region. The same key several times
               on a page is **allowed** — each is its own region; the runtime names
               them by occurrence and pairs them by count (one-to-many = split,
               many-to-one = merge). */
            byKey[key].forEach(function (n) {
               var box = bbox(n, toRoot);
               if (!box || box[2] <= box[0] || box[3] <= box[1]) {
                  console.warn("[vit] mark " + key + " on page " + pageNo(group) + " has no box and is not hoisted: it neither morphs nor enters on its own");
                  return;
               }
               /* record the **parent's** CTM — the node's own transform attribute travels
                  with it, so using its own CTM would apply it twice */
               plan.push({ key: key, node: n, box: box, mat: toRoot(n.parentNode) });
            });
         });

         plan.forEach(function (p) {
            var x = p.box[0], y = p.box[1], w = p.box[2] - x, h = p.box[3] - y, m = p.mat;

            /* The region's own <svg> is an HTML-level element and carries the name
               itself. (An <svg> nested *inside* the page svg would not do: only
               elements in the CSS box tree are ever captured.) */
            var host = document.createElementNS(NS, "svg");
            host.setAttribute("class", "vit-mark");
            host.setAttribute("viewBox", x + " " + y + " " + w + " " + h);
            /* Layout snaps the host's box to 1/64 px, and the default xMidYMid meet
               then scales uniformly by the smaller of the two ratios — a 1160px wide
               block of text shrinks by 0.02% and its right end drifts 0.3px, so a whole
               line's anti-aliasing no longer matches the PDF. Scaling the two axes
               independently leaves an error of a few ten-thousandths of a px. */
            host.setAttribute("preserveAspectRatio", "none");
            host.style.left = ((x - vb.x) / vb.width * 100) + "%";
            host.style.top = ((y - vb.y) / vb.height * 100) + "%";
            host.style.width = (w / vb.width * 100) + "%";
            host.style.height = (h / vb.height * 100) + "%";
            host.dataset.vitKey = p.key;

            var wrap = document.createElementNS(NS, "g");
            wrap.setAttribute("transform", "matrix(" + [m.a, m.b, m.c, m.d, m.e, m.f].join(" ") + ")");
            wrap.appendChild(p.node);                  // detaches it from the page svg
            host.appendChild(wrap);
            page.appendChild(host);
         });
      } finally {
         states.forEach(function (g, i) { restore(g, stateWas[i]); });
         restore(slide, was[0]);
         if (group) restore(group, was[1]);
      }
      return true;
   };

   function show(el, how) {
      var was = unstep(el);
      el.style.setProperty("display", how, "important");
      el.style.setProperty("content-visibility", "visible", "important");
      return was;
   }
   function unstep(el) {
      var was = [el.style.getPropertyValue("display"), el.style.getPropertyPriority("display")];
      el.style.removeProperty("display");
      return was;
   }
   function restore(el, was) {
      el.style.removeProperty("content-visibility");
      if (was[0]) el.style.setProperty("display", was[0], was[1]);
      else el.style.removeProperty("display");
   }

   function pageNo(group) {
      return [].indexOf.call(document.querySelectorAll(".vit-group"), group) + 1;
   }

   function bbox(el, toRoot) {
      var b;
      try { b = el.getBBox(); } catch (e) { return null; }
      var m = toRoot(el), out = null;
      [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height]].forEach(function (p) {
         var X = m.a * p[0] + m.c * p[1] + m.e, Y = m.b * p[0] + m.d * p[1] + m.f;
         out = out ? [Math.min(out[0], X), Math.min(out[1], Y),
         Math.max(out[2], X), Math.max(out[3], Y)] : [X, Y, X, Y];
      });
      return out;
   }

})();
