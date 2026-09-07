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
) = {
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
  html.elem(
    "div",
    attrs: (
      class: "waapi",
      "data-waapi": json.encode((
        keyframes: keyframes,
        duration: duration,
        delay: delay,
        iterations: iterations,
        direction: direction,
        easing: easing,
        play: play,
        name: name,
      )),
    ),
    body,
  )
}

/// The runtime, as a string: a host inlines it, bundles it or serves it with a
/// hash. Nothing in it depends on the document.
#let js = read("waapi.js")
