/* ── lift marked regions out of the page SVG ──────────────────────────
   view-transition-name is ignored on an SVG child, and Web Animations
   keyframes are CSS, so a region that has to morph or move has to be a CSS box
   of its own: an <svg> beside the page, not a <g> inside it.

   The Typst side laid every region out once, in the page, and wrote down
   where. The page's SVG carries <g data-typst-label="vit:key"> around the
   region's ink (the SVG export writes one for a labelled box), and beside the
   page sits one empty element per region, `.vit-mark`, already placed and
   sized in percent, with the box the page drew the region in, in the page's
   own units, on it (data-vit-box). This moves each group into its element.
   Where the element sits is not always where the page drew the region: a
   layer of a stack is moved onto the point its layers share (data-vit-at is
   that place, for the rail). The viewBox is the box the page drew, so the
   ink lands in the element wherever the element is.

   A move, not a measurement: nothing is laid out and nothing is read back from
   the browser's layout (transform.baseVal is the attribute, parsed), so it
   runs while the document is still being parsed, before anything is painted,
   and before the drawings' own elements upgrade and look for their box. The
   region is drawn exactly once, by the page, wherever it ends up.

   Which element is which region: both sides list them in the order the page
   laid them out, per key, so the n-th group of a key goes into the n-th
   element of that key. */

(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  /* The transform of everything above `el`, up to the page's root: the
     coordinates the group is drawn in are the page's, whichever element it is
     moved into. Its own transform is its placement and travels with it. */
  const above = (el, root) => {
    let m = new DOMMatrix();
    const chain = [];
    for (let p = el.parentNode; p && p !== root; p = p.parentNode) chain.unshift(p);
    for (const p of chain) {
      const t = p.transform?.baseVal?.consolidate();
      if (t) m = m.multiply(DOMMatrix.fromMatrix(t.matrix));
    }
    return m;
  };

  const lift = page => {
    const root = page.querySelector(":scope > svg");
    if (!root) return;

    /* the elements, per key, in the order the page wrote them */
    const shells = new Map();
    for (const s of page.querySelectorAll(":scope > [data-vit-at]")) {
      const k = s.dataset.vitKey ?? s.tagName.toLowerCase();
      shells.set(k, [...(shells.get(k) ?? []), s]);
    }

    /* Every placement is read before anything is moved: once an outer mark is
       in its own element, a mark nested in it would be read against that
       element and not against the page. */
    const plan = [];
    for (const g of root.querySelectorAll("[data-typst-label]")) {
      const l = g.getAttribute("data-typst-label");
      const k = l.startsWith("vit:") ? l.slice(4) : l === "waapi-anim" ? l : null;
      if (k == null) continue;
      /* The Typst side labels exactly the regions it wrote an element for: a
         veiled one, or a mark inside the states of a tween (a node of that
         drawing, which stays with it), carries no label. */
      const shell = shells.get(k)?.shift();
      if (!shell) {
        console.warn(`[vit] region "${k}" has no element to go into and stays in the page`);
        continue;
      }
      plan.push({ g, shell, m: above(g, root) });
    }
    for (const [k, rest] of shells) {
      if (rest.length) console.warn(`[vit] ${rest.length} element(s) for "${k}" found no region`);
    }

    for (const { g, shell, m } of plan) {
      const [x, y, w, h] = shell.dataset.vitBox.split(" ").map(Number);
      /* The element's own <svg>, showing the page's units through the box the
         layout gave the region: the region is drawn where the page drew it,
         and the viewBox is what cuts it out. Its width and height are the same
         numbers, for the rail, which draws the region into a thumbnail by them.
         Layout snaps the box to 1/64 px, and xMidYMid meet would then scale
         both axes by the smaller ratio, drifting a wide line's right end off
         the PDF's anti-aliasing. */
      const host = document.createElementNS(NS, "svg");
      host.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
      host.setAttribute("width", w);
      host.setAttribute("height", h);
      host.setAttribute("preserveAspectRatio", "none");
      const wrap = document.createElementNS(NS, "g");
      wrap.setAttribute("transform", `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].join(" ")})`);
      wrap.appendChild(g);                        // detaches it from the page svg
      host.appendChild(wrap);
      shell.appendChild(host);
    }
  };

  for (const page of document.querySelectorAll(".vit-page")) lift(page);
})();
