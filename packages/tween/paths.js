/* ── tween · path data ────────────────────────────────────────────────
   Two path() values interpolate only if they are the same list of commands;
   otherwise the shape snaps at the midpoint while the transform glides. The
   same drawing is not always the same list — typst-svg writes h/v for an
   axis-aligned segment, SVG shorthands leave a coordinate out, and a state may
   have more segments, or a curve where the other has a line. getPathData never
   shipped, so the lists are reconciled here, on the computed values: absolute
   upper-case commands, fixed arity, single spaces.

   A command is rewritten only where the two sides differ, and only into the
   same geometry — a shorthand written out, a line as the curve it is, a
   quadratic elevated. Where one side has finished its subpath, a zero-length
   segment at the other's current point is inserted, so the extra segments grow
   out of the end. An arc against anything else, or a different number of
   subpaths, is not a matter of spelling: align() gives up and the caller
   cross-fades.

   Pure functions of strings, no DOM; tools/paths.mjs runs them under Node. */

const tweenPaths = (() => {
  "use strict";

  const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const KIND = { L: "L", H: "L", V: "L", Q: "Q", T: "Q", C: "C", S: "C" };   // drawing commands, by the curve they draw
  const RANK = { L: 1, Q: 2, C: 3 };

  /* The tokens of a computed d, and its letters; null for a value outside the
     grammar. Coordinates stay the strings the browser wrote. */
  const memo = new Map();
  const parse = v => {
    let m = memo.get(v);
    if (!m) { const t = tokens(v); memo.set(v, m = { tok: t, sig: t ? letters(t) : "" }); }
    return m;
  };
  const tokens = v => {
    const a = v.indexOf('"'), z = v.lastIndexOf('"');
    if (!v.startsWith("path(") || a < 0 || z <= a) return null;
    const t = v.slice(a + 1, z).split(" ");
    for (let i = 0; i < t.length;) {
      const k = ARITY[t[i]];
      if (k == null) return null;
      i += 1 + k;
    }
    return t;
  };
  const letters = t => {
    let s = "";
    for (let i = 0; i < t.length; i += 1 + ARITY[t[i]]) s += t[i];
    return s;
  };
  const serialize = t => `path("${t.join(" ")}")`;

  /* A cursor over one token list: the command under it, and the point, subpath
     start and control points before it, which another spelling needs. */
  const cursor = t => ({ t, i: 0, x: "0", y: "0", sx: "0", sy: "0", cx: "0", cy: "0", qx: "0", qy: "0", prev: "" });
  const letter = c => c.t[c.i];
  const empty = c => c.t[c.i] === "M" && c.t[c.i + 3] === "M";   // a moveto no drawing follows
  /* control points the command under c leaves implicit */
  const reflectC = c => (c.prev === "C" || c.prev === "S" ? [2 * c.x - c.cx, 2 * c.y - c.cy] : [c.x, c.y]);
  const reflectQ = c => (c.prev === "Q" || c.prev === "T" ? [2 * c.x - c.qx, 2 * c.y - c.qy] : [c.x, c.y]);

  /* The command under c, pushed onto out spelled `as`. */
  const emit = (out, c, as) => {
    const { t, i } = c, l = t[i], arity = ARITY[l];
    if (as === l) { out.push(...t.slice(i, i + arity + 1)); return; }
    const x1 = l === "H" ? t[i + 1] : l === "V" ? c.x : t[i + arity - 1];
    const y1 = l === "H" ? c.y : l === "V" ? t[i + 1] : t[i + arity];
    if (as === "L") out.push("L", x1, y1);
    else if (KIND[l] === "L") {                       // a line as a curve
      if (as === "Q") out.push("Q", (+c.x + +x1) / 2, (+c.y + +y1) / 2, x1, y1);
      else out.push("C", +c.x + (x1 - c.x) / 3, +c.y + (y1 - c.y) / 3, +c.x + 2 * (x1 - c.x) / 3, +c.y + 2 * (y1 - c.y) / 3, x1, y1);
    } else if (KIND[l] === "Q") {                     // a quadratic in full, or elevated
      const [px, py] = l === "T" ? reflectQ(c) : [t[i + 1], t[i + 2]];
      if (as === "Q") out.push("Q", px, py, x1, y1);
      else out.push("C", +c.x + 2 * (px - c.x) / 3, +c.y + 2 * (py - c.y) / 3, +x1 + 2 * (px - x1) / 3, +y1 + 2 * (py - y1) / 3, x1, y1);
    } else {                                          // S in full
      const [qx, qy] = reflectC(c);
      out.push("C", qx, qy, t[i + 1], t[i + 2], x1, y1);
    }
  };
  /* a zero-length segment of kind `as` at x, y */
  const rest = (out, as, x, y) => {
    out.push(as);
    for (let k = 0; k < ARITY[as]; k += 2) out.push(x, y);
  };
  /* past the command under c, keeping the point state it leaves */
  const advance = c => {
    const { t, i } = c, l = t[i], arity = ARITY[l];
    switch (l) {
      case "M": c.x = c.sx = t[i + 1]; c.y = c.sy = t[i + 2]; break;
      case "Z": c.x = c.sx; c.y = c.sy; break;
      case "H": c.x = t[i + 1]; break;
      case "V": c.y = t[i + 1]; break;
      case "C": c.cx = t[i + 3]; c.cy = t[i + 4]; c.x = t[i + 5]; c.y = t[i + 6]; break;
      case "S": c.cx = t[i + 1]; c.cy = t[i + 2]; c.x = t[i + 3]; c.y = t[i + 4]; break;
      case "Q": c.qx = t[i + 1]; c.qy = t[i + 2]; c.x = t[i + 3]; c.y = t[i + 4]; break;
      case "T": [c.qx, c.qy] = reflectQ(c); c.x = t[i + 1]; c.y = t[i + 2]; break;
      default: c.x = t[i + arity - 1]; c.y = t[i + arity];      // L, A
    }
    c.prev = l;
    c.i += 1 + arity;
  };

  /* Reconcile two token lists; [a', b'] with equal letters, or null. */
  const merge = (a, b) => {
    const A = cursor(a), B = cursor(b), outA = [], outB = [];
    while (A.i < a.length || B.i < b.length) {
      if (empty(A) && !empty(B)) { A.i += 3; continue; }
      if (empty(B) && !empty(A)) { B.i += 3; continue; }
      const la = letter(A), lb = letter(B), ka = KIND[la], kb = KIND[lb];
      if (la === lb && !ka) { emit(outA, A, la); emit(outB, B, lb); advance(A); advance(B); }
      else if (ka && kb) {
        const as = la === lb ? la : RANK[ka] >= RANK[kb] ? ka : kb;
        emit(outA, A, as); emit(outB, B, as); advance(A); advance(B);
      } else if (kb && (la == null || la === "Z" || la === "M")) { rest(outA, kb, A.x, A.y); emit(outB, B, kb); advance(B); }
      else if (ka && (lb == null || lb === "Z" || lb === "M")) { emit(outA, A, ka); rest(outB, ka, B.x, B.y); advance(A); }
      else return null;
    }
    return [outA, outB];
  };

  /* Several computed d values brought to one command list: the first absorbs
     every other, then each is aligned to the result. null if a pair cannot be;
     a value outside the grammar leaves them all as they are. */
  const align = ds => {
    const ms = ds.map(parse), out = [...ds];
    if (ms.some(m => !m.tok)) return out;
    /* the common case, decided on the letters: nothing to do */
    if (ms.every(m => m.sig === ms[0].sig)) return out;
    let ref = ms[0].tok, sig = ms[0].sig;
    for (const m of ms.slice(1)) {
      if (m.sig === sig) continue;
      const r = merge(ref, m.tok);
      if (!r) return null;
      [ref] = r; sig = letters(ref);
    }
    for (const [k, m] of ms.entries()) {
      if (m.sig === sig) continue;
      const r = merge(ref, m.tok);
      if (!r) return null;
      out[k] = serialize(r[1]);
    }
    return out;
  };

  return { tokens, letters, serialize, merge, align };
})();
