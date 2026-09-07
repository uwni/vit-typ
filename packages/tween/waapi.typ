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
/// declared it, as the elements that carry it back out of the frames: one per
/// declaration, pointing at the ordinal in its label. A host that makes its own
/// frames puts this at the end of its body; the elements draw nothing and are
/// upgraded by the runtime, which is where the animation starts.
/// -> content
#let declarations() = context {
  html.elem(
    "div",
    attrs: (class: "waapi-decls"),
    query(<waapi-decl>)
      .enumerate()
      .map(((k, m)) => html.elem(m.value.tag, attrs: ("data-at": str(k), "data-spec": json.encode(m.value.spec, pretty: false))))
      .join(),
  )
}

/// A document that makes its own `html.frame`s says so once, around its body:
/// `#show: host`. That is also where the declarations are carried out of the
/// frames — everything the drawings said about themselves, in one script, so a
/// page needs nothing else. A host with a runtime of its own (a slide deck)
/// may write the script itself instead.
#let host(body) = context {
  html-target.update(true)
  body
  if target() == "html" { declarations() }
}

/// One declaration. Where an element can be written it is one — a custom
/// element around the thing, upgraded by the runtime the moment it is in the
/// document. Inside a frame no element survives, so the declaration becomes a
/// label with an ordinal and the host emits the element outside, pointing back
/// at it. Nothing at all on paper.
///
/// `tag` names the custom element, and so which runtime owns the declaration:
/// `waapi-anim` for an element that moves, `tween-play` for a drawing that
/// plays its states.
#let declared(tag, spec, body) = context {
  if target() == "html" {
    html.elem(tag, attrs: ("data-spec": json.encode(spec, pretty: false)), body)
  } else if html-target.get() {
    let k = _decl.get().first()
    _decl.step()
    [#metadata((tag: tag, spec: spec))<waapi-decl>#box(body)#label(tag + "@" + str(k))]
  } else { body }
}

/// A path for something else to run along: the body, named, so that
/// `animate(follow: name)` can find it. The name is this package's to give out,
/// not the document's — it becomes a label under a namespace of our own, and
/// nothing you label yourself can collide with it.
///
/// ```typ
/// #waapi.track("orbit")[#cetz.canvas(..)]
/// #waapi.animate(follow: "orbit", duration: 4000)[#circle(radius: 4pt)]
/// ```
///
/// The first `<path>` of what it wraps is the track, and a label only reaches
/// the browser through the SVG export: at the top of an HTML document this
/// makes the frame itself, and inside a host's frame it is already in one.
/// -> content
#let track(
  /// -> str
  name,
  /// -> content
  body,
) = context {
  assert(
    type(name) == str and name.match(regex("^[A-Za-z0-9_-]+$")) != none,
    message: "a track name is letters, digits, _ and -: " + repr(name),
  )
  let named = [#box(body)#label("waapi-track:" + name)]
  if target() == "html" { html.frame(named) } else { named }
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
  /// Run this element along a path instead of giving it keyframes: the name of
  /// a `track` on the same page. Only `offset-distance` moves, on the
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
    "waapi-anim",
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
