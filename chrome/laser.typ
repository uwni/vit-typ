/// The laser dot, for pointers that have no cursor to restyle (touch, pen, and
/// the speaker view's preview). The mouse gets a CSS cursor instead.
///
/// The tracer behind the dot is one segment per frame it lasts. How long it
/// lasts is the presenter's to choose and not the document's (`vit.trail`), so
/// what is written here is only the room for it: the runtime uses as many of
/// these as the chosen duration needs, and can ask for no more than there are.
#let _segments = 64 // ≈ one second, at a frame each

#let laser() = {
  html.elem(
    "svg",
    attrs: (class: "vit-trail", "aria-hidden": "true"),
    range(_segments).map(_ => html.elem("path")).join(),
  )
  html.div(class: "vit-laser", "")
}
