/// compat/cetz — `cetz.draw`, with the states of a drawing on every element.
///
/// A canvas is one object, and what moves inside it is Web Animations' work,
/// not the page's: this hands CeTZ's drawing surface back with `over(…)`
/// allowed in place of any argument, so a part of a canvas can carry N states
/// and the browser moves between them. It imports no CeTZ of its own — you hand
/// it yours — and it needs no slide deck: `tween` is all it is built on, so a
/// canvas moves in a blog post as it does in a deck.
///
/// ```typ
/// #import "@preview/cetz:0.5.2"
/// #import "@preview/tween:0.1.0": compat
///
/// #let cz = compat.cetz.tweened(cetz)                            // once, per file
///
/// #cetz.canvas(length: 1cm, {
///   let (circle, line, over) = cz                    // in place of cetz.draw
///   circle((over(-2, 0, 2), 1), radius: .3)          // three states
///   line((-3, 0), (3, 0))                            // plain cetz, unchanged
/// })
/// ```
///
/// The surface is a dictionary, so it is opened by *destructuring* the names
/// the canvas uses, not by `import`: Typst imports from a module, and a module
/// is a file — a file would have to name one CeTZ version at the top and every
/// canvas would then have to be that CeTZ. Naming the names is no loss. It
/// says what is shadowed, and shadowing is the point: inside that block
/// `circle` is CeTZ's, and Typst's is `std.circle`.
///
/// Nothing else changes. An element without `over` is CeTZ's own function,
/// called with CeTZ's own arguments; one with it is still drawn where it
/// stood, so its `name`, its anchors, `()` and `intersections` all behave as if
/// this package were not here. Both targets draw the same picture: the PDF is
/// pixel-identical to the canvas written without them.
///
/// *How.* A label is the only identity the SVG export carries, and a label
/// lands on a `box`, never on a path — so the element is drawn a second time in
/// a canvas of its own, one that inherits the outer canvas's whole context, and
/// that canvas is placed back exactly where the element was. The copy left
/// behind draws no ink.
///
/// *What it knows about CeTZ.* As little as it can. Nothing is hard-wired: the
/// surface is `dictionary(cetz.draw)`, so whatever that CeTZ draws with is
/// what comes back; the context is copied whole rather than field by field;
/// and the surface is wrapped whole, so a CeTZ that adds a shape keeps it. What
/// is left is a handful of names it calls — `needs`, which is the whole list —
/// and those are checked when you hand the module over, so a CeTZ that has
/// moved on says which name went missing instead of drawing something subtly
/// wrong. Versions are not gated: `tested` only names what has actually been
/// put through `test.typ` beside this file.
#import "../states.typ" as tween

/// N values of one argument: the element is drawn once per value, and the
/// results are its states.
///
/// ```typ
/// circle((over(-2, 0, 2), 1), radius: over(.3, .6, .3))
/// ```
///
/// Every `over` in one call is walked in step (a shorter one holds its last
/// value), which is what makes the states *the same drawing under different
/// numbers*: one call, one structure, only the numbers differ — the condition
/// the browser needs to interpolate rather than cross-fade, met by
/// construction. It may sit anywhere in an argument, including inside a
/// coordinate or a style dictionary, because that is where the number it
/// stands for sits: what varies is one argument, not the call.
///
/// What no single call can say — several elements varying together — is
/// `states`, which the surface carries.
/// -> dictionary
#let over(
  /// The values, one per state.
  /// -> any
  ..vals,
) = (tween-over: vals.pos())

#let _over(v) = type(v) == dictionary and "tween-over" in v
#let _has(v) = {
  if _over(v) { true } else if type(v) == array { v.any(_has) } else if type(v) == dictionary {
    v.values().any(_has)
  } else { false }
}
#let _count(v) = {
  if _over(v) { v.tween-over.len() } else if type(v) == array {
    v.fold(1, (n, x) => calc.max(n, _count(x)))
  } else if type(v) == dictionary {
    v.values().fold(1, (n, x) => calc.max(n, _count(x)))
  } else { 1 }
}
#let _pick(v, i) = {
  if _over(v) { v.tween-over.at(calc.min(i, v.tween-over.len() - 1)) } else if type(v) == array {
    v.map(x => _pick(x, i))
  } else if type(v) == dictionary {
    let o = (:)
    for (k, x) in v { o.insert(k, _pick(x, i)) }
    o
  } else { v }
}

/// Everything this calls in the CeTZ it is given, by module — the whole of
/// what a CeTZ has to still have. All of it is exported (`draw`, and the
/// utilities CeTZ's own `lib.typ` exposes); `tweened` checks for it and names
/// what is gone, rather than failing somewhere inside a canvas or, worse,
/// placing something a hair off.
/// -> dictionary
#let needs = (
  cetz: ("canvas", "version", "draw", "process", "util"),
  draw: ("get-ctx", "set-ctx", "scope", "hide", "rect", "content", "set-transform"),
  process: ("many",),
  util: ("resolve-body",),
)

/// The CeTZ minor versions `test.typ` beside this file has been run against,
/// most recent last. Not a gate — an unknown version is taken at its word, and
/// `needs` is what actually decides — but it is what "tested" means here.
/// (0.3 and older do not compile under Typst 0.15 at all: they draw with the
/// `path` element, which is gone.)
/// -> array
#let tested = (4, 5)

/// CeTZ's drawing surface, with states. Give it the CeTZ module your document
/// draws with — the module itself, not `cetz.draw` — and it gives back
/// everything `cetz.draw` has, taking `over(a, b, …)` in place of any argument:
/// that, and only that, is what makes a call N states of one element. Without
/// it the function is CeTZ's own and costs nothing.
///
/// The surface is wrapped whole rather than kept as a list of shapes in step
/// with CeTZ. It carries three names of its own: `over`, `states` — for states
/// several elements wide — and `canvas` (CeTZ's, re-exported, so that one
/// binding does).
/// -> dictionary
#let tweened(
  /// The CeTZ module, as your document imports it: `#import "@preview/cetz:0.5.2"`.
  /// -> module
  cetz,
) = {
  let m = dictionary(cetz)
  let gone = needs.cetz.filter(k => k not in m)
  assert(
    gone.len() == 0,
    message: "tweened() takes the cetz module itself — and this has no " + gone.join(", no "),
  )
  for (mod, names) in needs {
    if mod == "cetz" { continue }
    let has = dictionary(m.at(mod))
    let gone = names.filter(k => k not in has).map(k => mod + "." + k)
    assert(
      gone.len() == 0,
      message: (
        "cetz "
          + repr(cetz.version)
          + " has no "
          + gone.join(" and no ")
          + ", which is what tween measures and places an element's states with; it has been tested against 0."
          + tested.map(str).join(", 0.")
      ),
    )
  }
  let d = cetz.draw
  let has = dictionary(d)

  // The states of one element: measured in the outer canvas, each drawn again
  // in a canvas of its own, and the stack placed back where the element was.
  let stated(states, play: none, still: -1) = d.get-ctx(ctx => {
    assert(
      "length" in ctx and "transform" in ctx,
      message: "cetz " + repr(cetz.version) + " sets up a canvas context tween does not recognise",
    )
    // Every state, processed once — the box it draws, in the space the drawables
    // already live in, and the context it leaves behind. Measured, not drawn: a
    // group's border anchors would do, but they are found on a path and come
    // back a hair off, and a hair is a pixel.
    let done = states.map(s => cetz.process.many(ctx, cetz.util.resolve-body(ctx, s)))
    let bs = done.map(m => m.bounds).filter(b => b != none)
    assert(
      bs.len() > 0,
      message: "an element with states has to draw something, and this one draws nothing at all",
    )
    let lo = range(2).map(i => calc.min(..bs.map(b => calc.min(b.low.at(i), b.high.at(i)))))
    let hi = range(2).map(i => calc.max(..bs.map(b => calc.max(b.low.at(i), b.high.at(i)))))

    let inner(s) = cetz.canvas(length: ctx.length, {
      // the outer context, whole: units, transform, styles, named nodes, the
      // current point, and whatever else this CeTZ keeps in there
      d.set-ctx(_ => ctx)
      // Every state is drawn in the same box, so the origin does not jump
      // between them. A path with no paint rather than a hidden bound: the
      // region is measured from the SVG, where a bound that draws nothing is
      // not there at all.
      if states.len() > 1 {
        d.scope({
          d.set-transform(none)
          d.rect(lo, hi, stroke: none, fill: none, radius: 0)
        })
      }
      s
    })

    // The first state stays here, with its ink switched off: its name, its
    // anchors, its paths and the current point are the outer canvas's, so
    // anchors, relative coordinates and `intersections` see what they always
    // saw — the paths have to be *here*, as drawables, or `intersections` has
    // nothing to hit. It does not size anything — the placement below does.
    d.hide(states.first(), bounds: false)
    d.scope({
      // Placed with the transform reset: a coordinate is put through the CTM on
      // the way in, and this box is already in the space the CTM leads to.
      // Under a rotation or a scale the two disagree.
      d.set-transform(none)
      // and with the styles that would move it turned off, whatever the canvas
      // has set: padding grows the box, a frame draws over it, auto-scale
      // would scale a picture that is already the right size.
      d.content(
        lo,
        hi,
        padding: 0,
        frame: none,
        auto-scale: false,
        tween.tween(..states.map(inner), play: play, still: still),
      )
    })
  })

  let wrap(f) = (..args) => {
    let named = args.named()
    if not _has(args.pos()) and not _has(named) { return f(..args) }
    let n = calc.max(_count(args.pos()), _count(named))
    let state(i) = {
      let nm = (:)
      for (k, v) in named { nm.insert(k, _pick(v, i)) }
      f(..args.pos().map(v => _pick(v, i)), ..nm)
    }
    stated(range(n).map(state))
  }

  let surface = (:)
  for (name, f) in has {
    surface.insert(name, if type(f) == function { wrap(f) } else { f })
  }
  (
    surface
      + (
        over: over,
        /// Several bodies, several states of one drawing. Write a function of the
        /// parameter and feed it values:
        ///
        /// ```typ
        /// states(..range(4).map(k => {
        ///   line((0, 0), (k, 1.5))
        ///   circle((k, 1.5), radius: .2)
        /// }))
        /// ```
        ///
        /// One function, several arguments, so the states are the same drawing
        /// under different numbers by construction — same structure, same number of
        /// elements, only the numbers differ, which is what the browser needs to
        /// interpolate rather than cross-fade. The PDF shows the last one.
        states: (..bodies) => stated(
      bodies.pos(),
      play: bodies.named().at("play", default: none),
      still: bodies.named().at("still", default: -1),
    ),
        canvas: cetz.canvas,
      )
  )
}
