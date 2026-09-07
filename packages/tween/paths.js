/* ── tween · path data ────────────────────────────────────────────────
   Two states whose paths are not the same list of commands. Two path()
   values interpolate only if they are the same list of commands (CSS
   Shapes); otherwise the shape snaps at the midpoint while the transform
   glides (a pendulum rod detaches from its pivot). The same drawing is not
   always the same list: typst-svg opens every path with "M 0 0" and skips the
   first move when it is zero, writes h/v for a segment that happens to be
   axis-aligned, SVG has shorthands (H, V, S, T) that leave a coordinate out,
   and a state may simply have more segments, or a curve where the other has
   a line. The SVG 2 API that would canonicalise path data (getPathData) has
   never shipped, so the lists are reconciled here, on the computed values —
   a fixed grammar, the browser's serialisation of its segment list: absolute
   upper-case commands, each with a fixed number of coordinates, single
   spaces.

   Nothing is rewritten for its own sake: the lists are walked side by side
   and a command is written differently only where the two sides differ, in
   the way that keeps the picture:
   · the same letter on both sides is copied — H against H, S against S
     interpolate as they are;
   · two spellings of the same kind of segment (H or V against L, S against
     C, T against Q) are both written in full: a line as L, a cubic with its
     reflected control point written out. Exact, in geometry and — measured
     — on screen;
   · a line against a curve is written as the curve it is (a quadratic with
     its control point at the middle, a cubic with control points at a third
     and two thirds), a quadratic against a cubic is elevated. Exact in
     geometry; the stroker draws lines and curves through different code and
     a few edge pixels may differ, which is why this is done only here and
     not everywhere;
   · a moveto directly followed by another moveto — an empty subpath,
     neither stroked nor filled — is dropped where the other side has none;
   · where one side has a drawing command at a place where the other has
     finished its subpath (Z, the next M, or the end), a zero-length copy at
     the other's current point is inserted. A zero-length segment draws
     nothing (measured: not a pixel, filled or stroked, with any cap and
     join), and the extra segments then grow out of the end of the subpath —
     a line extends, a polygon grows from its last vertex. Where new
     vertices should come from is the author's choice, made by drawing the
     states with the same points (the Liu Hui page); this is what happens
     otherwise.
   What is left — an arc against anything else, a different number of
   subpaths — is not a matter of spelling and is cross-faded. A value
   outside the grammar is not read at all and goes to the browser as it is.

   Pure functions of strings, no DOM: tools/paths.mjs runs them under Node
   against a table of cases. */

var tweenPaths = (function () {
  "use strict";

  var ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  var KIND = { L: "L", H: "L", V: "L", Q: "Q", T: "Q", C: "C", S: "C" };   // drawing commands, by the curve they draw
  var RANK = { L: 1, Q: 2, C: 3 };

  /* The tokens of a computed d (letter, coordinates, letter, …): the string
     argument of path(), split on the single spaces of the browser's
     serialisation, checked against the grammar; null for none or a value
     outside it. Coordinates stay the strings the browser wrote. Memoised by
     the string, with its letters — a pure function of the value. */
  var memo = new Map();
  function parse(v) {
    var m = memo.get(v), t;
    if (!m) { t = tokens(v); memo.set(v, m = { tok: t, sig: t ? letters(t) : "" }); }
    return m;
  }
  function tokens(v) {
    var a = v.indexOf('"'), z = v.lastIndexOf('"');
    if (v.slice(0, 5) !== "path(" || a < 0 || z <= a) return null;
    var t = v.slice(a + 1, z).split(" ");
    for (var i = 0; i < t.length; i += 1 + k) {
      var k = ARITY[t[i]];
      if (k == null) return null;
    }
    return t;
  }
  function letters(t) {
    var s = "";
    for (var i = 0; i < t.length; i += 1 + ARITY[t[i]]) s += t[i];
    return s;
  }
  function serialize(t) { return 'path("' + t.join(" ") + '")'; }

  /* A cursor over one token list: the command under it, and the current
     point, subpath start and last control points before it — what writing
     the command in another spelling needs. */
  function cursor(t) {
    return { t: t, i: 0, x: "0", y: "0", sx: "0", sy: "0", cx: "0", cy: "0", qx: "0", qy: "0", prev: "" };
  }
  function letter(c) { return c.t[c.i]; }
  function empty(c) { return c.t[c.i] === "M" && c.t[c.i + 3] === "M"; }   // a moveto no drawing follows
  /* control points the command under c leaves implicit */
  function reflectC(c) { return c.prev === "C" || c.prev === "S" ? [2 * c.x - c.cx, 2 * c.y - c.cy] : [c.x, c.y]; }
  function reflectQ(c) { return c.prev === "Q" || c.prev === "T" ? [2 * c.x - c.qx, 2 * c.y - c.qy] : [c.x, c.y]; }
  /* Push the command under c onto out, spelled `as`: its own letter (copied),
     the full letter of its kind, or a higher kind. */
  function emit(out, c, as) {
    var t = c.t, i = c.i, l = t[i], arity = ARITY[l], k, x1, y1, p, q;
    if (as === l) { for (k = 0; k <= arity; k++) out.push(t[i + k]); return; }
    x1 = l === "H" ? t[i + 1] : l === "V" ? c.x : t[i + arity - 1];
    y1 = l === "H" ? c.y : l === "V" ? t[i + 1] : t[i + arity];
    if (as === "L") out.push("L", x1, y1);
    else if (KIND[l] === "L") {                       // a line as a curve
      if (as === "Q") out.push("Q", (+c.x + +x1) / 2, (+c.y + +y1) / 2, x1, y1);
      else out.push("C", +c.x + (x1 - c.x) / 3, +c.y + (y1 - c.y) / 3, +c.x + 2 * (x1 - c.x) / 3, +c.y + 2 * (y1 - c.y) / 3, x1, y1);
    } else if (KIND[l] === "Q") {                     // a quadratic in full, or elevated
      p = l === "T" ? reflectQ(c) : [t[i + 1], t[i + 2]];
      if (as === "Q") out.push("Q", p[0], p[1], x1, y1);
      else out.push("C", +c.x + 2 * (p[0] - c.x) / 3, +c.y + 2 * (p[1] - c.y) / 3, +x1 + 2 * (p[0] - x1) / 3, +y1 + 2 * (p[1] - y1) / 3, x1, y1);
    } else {                                          // S in full
      q = reflectC(c);
      out.push("C", q[0], q[1], t[i + 1], t[i + 2], x1, y1);
    }
  }
  /* a zero-length segment of kind `as` at x, y */
  function rest(out, as, x, y) {
    out.push(as);
    for (var k = 0; k < ARITY[as]; k += 2) out.push(x, y);
  }
  /* advance c past the command under it, keeping its point state */
  function advance(c) {
    var t = c.t, i = c.i, l = t[i], arity = ARITY[l], p;
    switch (l) {
      case "M": c.x = c.sx = t[i + 1]; c.y = c.sy = t[i + 2]; break;
      case "Z": c.x = c.sx; c.y = c.sy; break;
      case "H": c.x = t[i + 1]; break;
      case "V": c.y = t[i + 1]; break;
      case "C": c.cx = t[i + 3]; c.cy = t[i + 4]; c.x = t[i + 5]; c.y = t[i + 6]; break;
      case "S": c.cx = t[i + 1]; c.cy = t[i + 2]; c.x = t[i + 3]; c.y = t[i + 4]; break;
      case "Q": c.qx = t[i + 1]; c.qy = t[i + 2]; c.x = t[i + 3]; c.y = t[i + 4]; break;
      case "T": p = reflectQ(c); c.qx = p[0]; c.qy = p[1]; c.x = t[i + 1]; c.y = t[i + 2]; break;
      default: c.x = t[i + arity - 1]; c.y = t[i + arity];      // L, A
    }
    c.prev = l;
    c.i += 1 + arity;
  }
  /* Reconcile two token lists; [a', b'] with equal letters, or null. */
  function merge(a, b) {
    var A = cursor(a), B = cursor(b), outA = [], outB = [], la, lb, ka, kb, as;
    while (A.i < a.length || B.i < b.length) {
      if (empty(A) && !empty(B)) { A.i += 3; continue; }
      if (empty(B) && !empty(A)) { B.i += 3; continue; }
      la = letter(A); lb = letter(B); ka = KIND[la]; kb = KIND[lb];
      if (la === lb && !ka) { emit(outA, A, la); emit(outB, B, lb); advance(A); advance(B); }
      else if (ka && kb) {
        as = la === lb ? la : RANK[ka] >= RANK[kb] ? ka : kb;
        emit(outA, A, as); emit(outB, B, as); advance(A); advance(B);
      } else if (kb && (la == null || la === "Z" || la === "M")) { rest(outA, kb, A.x, A.y); emit(outB, B, kb); advance(B); }
      else if (ka && (lb == null || lb === "Z" || lb === "M")) { emit(outA, A, ka); rest(outB, ka, B.x, B.y); advance(A); }
      else return null;
    }
    return [outA, outB];
  }

  /* Bring several computed d values to one command list: the first list
     absorbs every other (padding and promotion accumulate), then each is
     aligned to the result. The values in the same order, rewritten where
     they had to be; null if some pair cannot be aligned. A value outside the
     grammar leaves all of them as they are, for the browser to try. */
  function align(ds) {
    var ms = ds.map(parse), k, r, out = ds.slice();
    if (ms.some(function (m) { return !m.tok; })) return out;
    /* the common case, decided on the letters: nothing to do */
    for (k = 1; k < ms.length; k++) if (ms[k].sig !== ms[0].sig) break;
    if (k === ms.length) return out;
    var ref = ms[0].tok, sig = ms[0].sig;
    for (k = 1; k < ms.length; k++) {
      if (ms[k].sig === sig) continue;
      r = merge(ref, ms[k].tok);
      if (!r) return null;
      ref = r[0]; sig = letters(ref);
    }
    for (k = 0; k < ms.length; k++) {
      if (ms[k].sig === sig) continue;
      r = merge(ref, ms[k].tok);
      if (!r) return null;
      out[k] = serialize(r[1]);
    }
    return out;
  }

  return { tokens: tokens, letters: letters, serialize: serialize, merge: merge, align: align };
})();
