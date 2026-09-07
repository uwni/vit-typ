/// waapi — Web Animations from Typst.
///
/// Not a package of its own: it is what `tween` is built on, and what a
/// document reaches for when it wants something to move that is not N states
/// of one drawing — a figure that spins, fades in, or runs along a path.
///
/// Keyframes and options are the API's own and are handed to `el.animate()`
/// as they are, so there is no second vocabulary to learn and nothing to keep
/// in step with the spec. What the runtime adds is the lifecycle: which
/// animations belong to what, and what becomes of them when that thing is
/// left, paused or resized.

/// Whether the document being written is an HTML one. `target()` cannot say so
/// from inside an `html.frame` — the frame is laid out as paper — so a host
/// that puts drawings inside frames says it once, at the top of the document.
#let html-target = state("tween-html", false)

/// What a drawing declares about itself — how it is animated, how it plays —
/// has to reach the browser, and only a label crosses into an `html.frame`: an
/// element written inside one is dropped on the floor. At the top of an HTML
/// document there is no frame yet, so the declaration rides on an element of
/// its own; inside a host's frames it rides on a label and an ordinal, and the
/// host hands the list over. The host carries it; it never reads it.
#let _decl = counter("waapi-decl")

/// Everything this document's animated things declared, in the order they
/// declared it. A host that makes its own frames writes it into the page,
/// beside `js`:
///
/// ```typ
/// #html.elem("script", "const tweenDecls = " + json.encode(declarations()) + ";")
/// ```
/// -> array
#let declarations() = query(<waapi-decl>).map(m => m.value)

/// A document that makes its own `html.frame`s says so once, around its body:
/// `#show: host`. That is also where the declarations are carried out of the
/// frames — everything the drawings said about themselves, in one script, so a
/// page needs nothing else. A host with a runtime of its own (a slide deck)
/// may write the script itself instead.
#let host(body) = context {
  html-target.update(true)
  body
  if target() == "html" {
    context html.elem("script", "const tweenDecls = " + json.encode(declarations()) + ";")
  }
}

/// One declaration: an element carrying it where an element can be written, a
/// label and an ordinal where only labels can, and nothing at all on paper.
#let declared(kind, spec, body) = context {
  if target() == "html" {
    html.elem("div", attrs: ("data-" + kind: json.encode(spec)), body)
  } else if html-target.get() {
    let k = _decl.get().first()
    _decl.step()
    [#metadata(spec)<waapi-decl>#box(body)#label(kind + "@" + str(k))]
  } else { body }
}

/// One animated element: the body in a box the browser can animate, and the
/// keyframes riding on it as data. The element itself is what moves — for the
/// parts inside a drawing, that is `tween`.
///
/// ```typ
/// #waapi.animate(
///   keyframes: ((transform: "rotate(0)"), (transform: "rotate(1turn)")),
///   duration: 6000,
/// )[#html.frame(circle(radius: 8pt))]
/// ```
/// -> content
#let animate(
  /// What moves.
  /// -> content
  body,
  /// The keyframes, as Web Animations takes them: a list of dictionaries of
  /// CSS properties in their IDL spelling (`strokeWidth`, not `stroke-width`).
  /// -> array
  keyframes: (),
  /// How long one iteration lasts, in milliseconds.
  /// -> int
  duration: 1000,
  /// How long before it starts, in milliseconds.
  /// -> int
  delay: 0,
  /// How many times it runs; `none` is without end.
  /// -> none | int
  iterations: none,
  /// `"normal"`, `"reverse"`, `"alternate"` or `"alternate-reverse"`.
  /// -> str
  direction: "normal",
  /// Four numbers, a cubic Bézier, or a name the browser knows (`"linear"`).
  /// -> array | str
  easing: (0, 0, 1, 1),
  /// Whether it starts by itself. `false` leaves it paused, for a host that
  /// drives it — and nothing plays by itself under `prefers-reduced-motion`.
  /// -> bool
  play: true,
  /// A name, so a host can find this one among the others.
  /// -> none | str
  name: none,
  /// Run this element along a path instead of giving it keyframes: the Typst
  /// label of the element whose first `<path>` is the track (`<track>` in the
  /// document, `"track"` here). Only `offset-distance` moves, on the
  /// compositor; `orient` turns the element with the tangent.
  /// -> none | str
  follow: none,
  /// -> bool
  orient: false,
) = {
  assert(follow == none or type(follow) == str, message: "waapi: follow is the label of the element carrying the track")
  assert(
    follow == none or keyframes.len() == 0,
    message: "waapi: an element follows a path or has keyframes of its own, not both",
  )
  assert(type(keyframes) == array, message: "waapi: keyframes is a list of dictionaries, as el.animate() takes them")
  assert(
    keyframes.all(k => type(k) == dictionary),
    message: "waapi: every keyframe is a dictionary of CSS properties in their IDL spelling",
  )
  assert(
    direction in ("normal", "reverse", "alternate", "alternate-reverse"),
    message: "waapi: direction is normal, reverse, alternate or alternate-reverse, not " + repr(direction),
  )
  assert(
    type(easing) == str or (type(easing) == array and easing.len() == 4),
    message: "waapi: easing is four numbers of a cubic Bézier, or a name the browser knows",
  )
  declared(
    "waapi",
    (
      keyframes: keyframes,
      duration: duration,
      delay: delay,
      iterations: iterations,
      direction: direction,
      easing: easing,
      play: play,
      name: name,
      follow: follow,
      orient: orient,
    ),
    body,
  )
}

/// The runtime, as a string: a host inlines it, bundles it or serves it with a
/// hash. Nothing in it depends on the document.
#let js = read("waapi.js")
