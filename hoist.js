/* ── hoist marked regions out of the page SVG ──────────────────────────
   view-transition-name is silently ignored on SVG child elements, so a marked
   region cannot morph where it sits inside the page SVG. Each one is lifted
   into its own absolutely positioned <svg> — an HTML-level element the API
   honours.

   The identity channel is a Typst label: the SVG export writes it as a
   <g data-typst-label="vt-key"> wrapping the content, and that <g> *is* the
   content boundary. Nothing is inferred: no geometry probing, no per-node
   assignment, no tolerance, no mask. Two marks whose boxes overlap are still
   two subtrees.

   Runs once at load; after that everything is the browser's. */

(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var PREFIX = "vt-";

  /* getBBox/getCTM return nothing inside a display:none subtree, and every
     slide but the first is hidden at load — so lay them all out, measure,
     then hide them again. */
  var shown = [].slice.call(document.querySelectorAll(".vt-slide, .vt-group"));
  var was = shown.map(function (s) { return s.style.display; });
  shown.forEach(function (s) { s.style.display = "block"; });

  var groups = [].slice.call(document.querySelectorAll(".vt-group"));
  document.querySelectorAll(".vt-slide > .vt-page").forEach(function (page) {
    var root = page.querySelector("svg");
    if (!root) return;
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

    /* The label grammar is read here and nowhere else; the runtime and the CSS
       see attributes: vt-key → data-vt-key on the host, vt-key@i →
       data-vt-state / data-vt-at on the state <g>. What a mark declares about
       itself is not in the label: the Typst side writes it into vtMarks, by key. */
    var byKey = {};
    page.querySelectorAll("[data-typst-label]").forEach(function (g) {
      var l = g.getAttribute("data-typst-label");
      if (l.slice(0, PREFIX.length) !== PREFIX) return;    // leave the author's own labels alone
      /* The states of an element animation (vt-key@i) and any marks inside them
         stay put: the runtime pairs the nodes of the states one by one, and one
         moved away would no longer line up. The outer vt-key is hoisted as usual. */
      var at = l.lastIndexOf("@");
      if (at >= 0) { g.dataset.vtState = l.slice(PREFIX.length, at); g.dataset.vtAt = l.slice(at + 1); return; }
      if (g.parentNode.closest("[data-vt-state]")) return;
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
          console.warn("[vtslides] mark " + key + " on page " + (groups.indexOf(page.closest(".vt-group")) + 1) + " has no box and is not hoisted: it neither morphs nor enters on its own");
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
      host.setAttribute("class", "vt-mark");
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
      host.dataset.vtKey = p.key;

      var wrap = document.createElementNS(NS, "g");
      wrap.setAttribute("transform", "matrix(" + [m.a, m.b, m.c, m.d, m.e, m.f].join(" ") + ")");
      wrap.appendChild(p.node);                  // detaches it from the page svg
      host.appendChild(wrap);
      page.appendChild(host);
    });
  });

  shown.forEach(function (s, i) { s.style.display = was[i]; });

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
