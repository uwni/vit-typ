/// vit-cetz — `cetz.draw`, with an identity on every element.
///
/// A companion package: `vit` itself knows nothing about CeTZ, and this knows
/// nothing about anyone else's library. It imports no CeTZ of its own either —
/// you hand it yours, and it hands back the same drawing surface with one more
/// named argument on every element.
///
/// A canvas exports native `<path>`s, and a `mark` around the whole of one
/// interpolates its box and cross-fades its picture: what moves has to be one
/// picture, so parts that move apart from each other used to need a canvas and
/// a `mark` each, placed on the page by hand. With `key`, the element carrying
/// it becomes a mark of its own — inside the canvas, in canvas coordinates:
///
/// ```typ
/// #import "@preview/cetz:0.4.1"
/// #import "@preview/vit-cetz:0.1.0": keyed
///
/// #let cz = keyed(cetz)                              // once, per file
///
/// #cetz.canvas(length: 1cm, {
///   let (circle, line) = cz                          // in place of cetz.draw
///   line(..track, close: true, key: "track")
///   circle(track.first(), radius: .16, key: "dot")   // travels on its own
///   circle((2, 1), radius: .3)                       // plain cetz, no key
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
/// Nothing else changes. An element without a `key` is CeTZ's own function,
/// called with CeTZ's own arguments; one with a `key` is still drawn where it
/// stood, so its `name`, its anchors, `()` and `intersections` all behave as if
/// this package were not here. Both targets draw the same picture: the PDF is
/// pixel-identical to the canvas written without keys.
///
/// *How.* A label is the only identity the SVG export carries, and a label
/// lands on a `box`, never on a path — so the keyed element is drawn a second
/// time in a canvas of its own, one that inherits the outer canvas's whole
/// context, and that canvas is placed back exactly where the element was. The
/// copy left behind draws no ink.
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
// Once vit is published, replace the next line with #import "@preview/vit:0.1.0" as _vit
#import "../../lib.typ" as _vit

/// N values of one argument: the element is drawn once per value, and the
/// results are its states, stepped with `→` / `←` like any other element
/// animation.
///
/// ```typ
/// circle((over(-2, 0, 2), 1), radius: over(.3, .6, .3), key: "ball")
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
) = (vit-over: vals.pos())

#let _over(v) = type(v) == dictionary and "vit-over" in v
#let _has(v) = {
  if _over(v) { true } else if type(v) == array { v.any(_has) } else if type(v) == dictionary {
    v.values().any(_has)
  } else { false }
}
#let _count(v) = {
  if _over(v) { v.vit-over.len() } else if type(v) == array {
    v.fold(1, (n, x) => calc.max(n, _count(x)))
  } else if type(v) == dictionary {
    v.values().fold(1, (n, x) => calc.max(n, _count(x)))
  } else { 1 }
}
#let _pick(v, i) = {
  if _over(v) { v.vit-over.at(calc.min(i, v.vit-over.len() - 1)) } else if type(v) == array {
    v.map(x => _pick(x, i))
  } else if type(v) == dictionary {
    let o = (:)
    for (k, x) in v { o.insert(k, _pick(x, i)) }
    o
  } else { v }
}

/// Everything this calls in the CeTZ it is given, by module — the whole of
/// what a CeTZ has to still have. All of it is exported (`draw`, and the
/// utilities CeTZ's own `lib.typ` exposes); `keyed` checks for it and names
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

/// CeTZ's drawing surface, keyed. Give it the CeTZ module the deck draws
/// with — the module itself, not `cetz.draw` — and it gives back everything
/// `cetz.draw` has, with the element functions taking two arguments more:
///
/// / key: the name this element travels under (letters, digits, `_` and `-`,
///   as in `mark`), or `auto` for the element's own `name`. Same key on the
///   next page and the browser interpolates one into the other. Without a key
///   the function is CeTZ's own, and costs nothing.
/// / transition: this element's own enter/leave effect, as in
///   `mark(transition:)`, for when it is on one page and not the other.
///
/// Everything is wrapped, because what draws is not a list to keep in step
/// with CeTZ: a `key` is what makes a call an element, and a call that takes
/// one without drawing anything says so.
///
/// An argument may be `over(a, b, …)` instead of a value, which makes the call
/// N states of one element; the result also carries three names of its own:
/// `over`, `states` — for an element animation several elements wide — and
/// `canvas` (CeTZ's, re-exported, so that one binding does).
/// -> dictionary
#let keyed(
  /// The CeTZ module, imported by the deck: `#import "@preview/cetz:0.4.1"`.
  /// -> module
  cetz,
) = {
  let m = dictionary(cetz)
  let gone = needs.cetz.filter(k => k not in m)
  assert(
    gone.len() == 0,
    message: "keyed() takes the cetz module itself — #import \"@preview/cetz:0.4.1\" — and this has no "
      + gone.join(", no "),
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
          + ", which is what vit-cetz measures and places a keyed element with; it has been tested against 0."
          + tested.map(str).join(", 0.")
      ),
    )
  }
  let d = cetz.draw
  let has = dictionary(d)

  // One element, or one body, made into a mark: measured in the outer canvas,
  // drawn again in a canvas of its own, and placed back where it was.
  let marked(key, transition, states) = d.get-ctx(ctx => {
    assert(
      "length" in ctx and "transform" in ctx,
      message: "cetz " + repr(cetz.version) + " sets up a canvas context vit-cetz does not recognise",
    )
    // The box: what every state draws, in the space the drawables already live
    // in. Measured, not drawn — a group's border anchors would do, but they are
    // found on a path and come back a hair off, and a hair is a pixel.
    let bs = states.map(s => cetz.process.many(ctx, cetz.util.resolve-body(ctx, s)).bounds).filter(b => b != none)
    assert(
      bs.len() > 0,
      message: "a keyed element has to draw something: \"" + key + "\" has no box, so it has nowhere to travel from",
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
    // saw. It does not size anything — the placement below does.
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
        _vit.mark(key, transition: transition, ..states.map(inner)),
      )
    })
  })

  let wrap(f) = (..args) => {
    let named = args.named()
    if "key" not in named {
      // CeTZ's own function, untouched — but states without a name are a typo,
      // and an over() left in an argument would otherwise be drawn as a value
      assert(
        not _has(args.pos()) and not _has(named),
        message: "over() needs a key: — the states are one object under different numbers, and the object has to be named",
      )
      return f(..args)
    }
    let key = named.remove("key")
    let transition = named.remove("transition", default: none)
    if key == auto {
      key = named.at("name", default: none)
      assert(key != none, message: "key: auto takes the element's name:, and this element has none")
    }
    let n = calc.max(_count(args.pos()), _count(named))
    let state(i) = {
      let nm = (:)
      for (k, v) in named { nm.insert(k, _pick(v, i)) }
      f(..args.pos().map(v => _pick(v, i)), ..nm)
    }
    marked(key, transition, range(n).map(state))
  }

  let surface = (:)
  for (name, f) in has {
    surface.insert(name, if type(f) == function { wrap(f) } else { f })
  }
  (
    surface
      + (
        over: over,
        /// Several bodies, several states of one drawing, stepped with `→` / `←`
        /// like any other element animation. Write a function of the parameter and
        /// feed it values, exactly as `mark(key, s0, s1, …)` wants:
        ///
        /// ```typ
        /// states("pen", ..range(4).map(k => {
        ///   line((0, 0), (k, 1.5))
        ///   circle((k, 1.5), radius: .2)
        /// }))
        /// ```
        ///
        /// One function, several arguments, so the states are the same drawing
        /// under different numbers by construction — same structure, same number of
        /// elements, only the numbers differ, which is what the browser needs to
        /// interpolate rather than cross-fade. The PDF shows the last one.
        states: (key, transition: none, ..bodies) => marked(key, transition, bodies.pos()),
        canvas: cetz.canvas,
      )
  )
}
