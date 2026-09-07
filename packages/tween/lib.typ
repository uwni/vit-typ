/// tween — several states of one drawing, and the browser moves between them.
///
/// The states are the same drawing under different numbers: same structure,
/// only the values differ. The browser is handed two of them and interpolates
/// the SVG nodes — the path's `d`, transform, colours, stroke width, opacity —
/// so nothing here writes interpolation code of its own. What has no
/// in-between cross-fades.
///
/// The stylesheet and the runtime are plain strings, and static: nothing in
/// them depends on the document, so a host is free to inline them, bundle them
/// or serve them with a hash. Everything a single drawing declares about itself
/// rides on its own element, never in generated CSS.
/// Web Animations from Typst, which this is built on: `waapi.animate` moves a
/// whole element, `tween` moves the parts inside one drawing. Not a package of
/// its own — it ships here.
#import "waapi.typ"

/// `waapi`'s own, re-exported: a host says once that the document is an HTML
/// one (`host`), and carries what the drawings declared (`declarations`).
#let (html-target, host, declarations) = (waapi.html-target, waapi.host, waapi.declarations)

/// N states of one drawing, stacked in one box: the first one is in the flow,
/// the rest are placed on top of it, so the box is the size of the first and
/// nothing is ever re-laid-out between states. Only one shows at a time (the
/// stylesheet hides the others), and the runtime moves between them.
///
/// A label is the only identity the SVG export carries and it lands on a box,
/// so every state is boxed and labelled: the container is `tween` (or
/// `tween:name` when it is named) and the states are `tween@0`, `tween@1`, …;
/// the runtime reads
/// that grammar and writes the attributes the stylesheet and the engine use.
///
/// The PDF has no runtime and shows one state — the last by default, the
/// finished drawing, as a handout would; `still` says which.
/// -> content
#let tween(
  /// The states, in order. The same drawing under different numbers.
  /// -> content
  ..states,
  /// A name, for a host that drives this drawing from elsewhere.
  /// -> none | str
  name: none,
  /// Which state the PDF shows, as an index — `-1` is the last. A drawing that
  /// is played rather than stepped wants `0`, the page at rest, unless its loop
  /// closes and the two are the same.
  /// -> int
  still: -1,
  /// Play the states over time instead of leaving them to be stepped: Web
  /// Animations options as `waapi.animate` takes them (`duration` in ms,
  /// `delay`, `iterations` — `none` is without end —, `direction`, `easing`).
  /// The drawing says this about itself, and it holds wherever the drawing is:
  /// at the top of an HTML document it starts by itself, and inside a host's
  /// frames the host carries the declaration (see `declarations`).
  /// -> none | dictionary
  play: none,
) = {
  let s = states.pos()
  assert(s.len() > 0, message: "tween needs at least one state")
  assert(states.named().len() == 0, message: "tween takes no named argument other than name and still")
  assert(
    name == none or (type(name) == str and name.match(regex("^[A-Za-z0-9_:-]+$")) != none),
    message: "a tween name is letters, digits, _ : and -: " + repr(name),
  )
  let lbl = label(if name == none { "tween" } else { "tween:" + name })
  let stack = {
    [#box(s.first())#label("tween@0")]
    for (i, x) in s.enumerate().slice(1) {
      place(top + left, [#box(x)#label("tween@" + str(i))])
    }
  }
  context {
    /* A label reaches the browser only through the SVG export, which is what
       `html.frame` runs — so the states have to be inside one. At the top of an
       HTML document tween makes that frame itself; inside a host that has
       already made one (a slide, say) `target()` reports the paper it is laid
       out as, and the host says so once with `host`. Neither: this is the PDF,
       which has no runtime and shows one state. */
    let stacked = [#box(stack)#lbl]
    if target() == "html" {
      let framed = html.frame(stacked)
      if play == none { framed } else { waapi.declared("tween-play", play, framed) }
    } else if html-target.get() {
      if play == none { stacked } else { waapi.declared("tween-play", play, stacked) }
    } else { box(s.at(still)) }
  }
}

#let css = read("tween.css")
/// The runtime: the lifecycle (`waapi.js`, Web Animations with a registry of
/// what is running), the path reconciliation, and the engine itself, in the
/// order they have to load. Idempotent, so a page that carries it twice is
/// only a few bytes heavier.
#let js = read("waapi.js") + "\n" + read("paths.js") + "\n" + read("tween.js")
