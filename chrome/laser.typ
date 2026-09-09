/// The laser dot, for pointers that have no cursor to restyle (touch, pen, and
/// the speaker view's preview). The mouse gets a CSS cursor instead.
///
/// The tracer behind the dot is one segment per frame it lasts, and this is the
/// room for it: the runtime uses as many as the chosen duration needs and can
/// ask for no more than there are. `trail` is what the document asked for, with
/// a second's worth beyond it — the presenter can lengthen the tracer from the
/// settings panel and should not meet a wall the document put there.
#let laser(trail: 400) = {
  let _segments = calc.max(64, calc.ceil(trail / 16))
  html.elem(
    "svg",
    attrs: (class: "vit-trail", "aria-hidden": "true"),
    range(_segments).map(_ => html.elem("path")).join(),
  )
  html.div(class: "vit-laser", "")
}
