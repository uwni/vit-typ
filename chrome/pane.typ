/// The desk: the page the thumbnails point at, beside them, with its notes
/// under it. `.vit-view` is left empty — the runtime puts the page itself in
/// it, the very element the rail was showing, so the deck is never rendered
/// twice and the two of them can morph into one another.
#let pane() = html.div(
  class: "vit-pane",
  {
    html.div(class: "vit-view", "")
    html.div(class: "vit-notes", "")
  },
)
